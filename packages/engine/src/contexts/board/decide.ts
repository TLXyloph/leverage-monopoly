import {
  GO_TO_JAIL_SQUARE, INCOME_TAX_SQUARE, LUXURY_TAX_SQUARE, deedAt,
} from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import { goSalaryAddend } from '../../core/card-effects.js'
import { reject, type Rejection } from '../../core/errors.js'
import type { GameEvent, ObligationKind } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DiceRoll, Money, PlayerId, SquareIndex } from '../../core/types.js'
import {
  destination, diceTotal, isDoubles, isLegalDie, passesGo, shortfall,
} from './selectors.js'
import { activeFutureOn, rentDue, rentRecipient } from './rent.js'

export type BoardCommand = {
  readonly type: 'roll-dice'
  readonly player: PlayerId
  readonly dice: DiceRoll
}

/**
 * Spec 19.5. Escort Service and Chop Shop pay the DEED'S OWNER on every rent CHARGED on
 * a deed they own, so `board` must hand each `RentCharged` it emits to `underworld`.
 *
 * Injected rather than imported for the usual reason: `underworld/decide.ts` reads
 * `session`'s `isUnlocked`, `session/settlement.ts` reads `markets`, and
 * `markets/selectors.ts` reads `board` — so `board -> underworld` closes a four-hop
 * cycle. `PropertyPorts` (below, same file) and `CreditPorts` use the same device.
 *
 * DELIBERATELY REQUIRED, with no `NO_VENTURES` default. A defaulted port that returns
 * `[]` is indistinguishable from a correctly wired one that found no ventures, and that
 * is exactly how this function sat uncalled through a full task review: the failure is
 * silent and total. Making it required means a caller that forgets it does not compile.
 */
export interface BoardPorts {
  readonly ventureIncomeFromRent: (
    state: GameState, rent: Extract<GameEvent, { type: 'RentCharged' }>,
  ) => readonly GameEvent[]
}

/**
 * A running cash ledger for the turn. The reducer applies the same events in
 * the same order against the same starting cash, so the two agree exactly.
 */
class TurnLedger {
  private cash: Money

  constructor(cash: Money) {
    this.cash = cash
  }

  /** Returns the unpayable part, and debits what could be paid. */
  charge(amount: Money): Money {
    const unpaid = shortfall(this.cash, amount)
    this.cash -= amount - unpaid
    return unpaid
  }

  credit(amount: Money): void {
    this.cash += amount
  }
}

export function decideBoard(
  state: GameState,
  command: BoardCommand,
  ports: BoardPorts,
): readonly GameEvent[] | Rejection {
  if (command.type !== 'roll-dice') {
    return reject('WRONG_PHASE', 'Unknown board command.')
  }
  if (state.phase !== 'movement') {
    return reject('WRONG_PHASE', 'Dice may only be entered during the Movement phase.')
  }
  const { player, dice } = command
  if (!isLegalDie(dice[0]) || !isLegalDie(dice[1])) {
    return reject('INVALID_DICE', 'Each die must show a whole number from 1 to 6.')
  }

  const state0 = state.players[player]
  const ledger = new TurnLedger(state0.cleanCash)
  const events: GameEvent[] = [{ type: 'DiceRolled', player, dice }]

  if (state0.inJail) {
    events.push({ type: 'JailExited', player, fee: ECONOMY.JAIL_FEE })
    capitalise(events, player, ledger.charge(ECONOMY.JAIL_FEE), 'jail-fee')
  }

  if (isDoubles(dice) && state0.consecutiveDoubles === 2) {
    events.push({ type: 'SentToJail', player, reason: 'triple-doubles' })
    return events
  }

  const total = diceTotal(dice)
  const from = state0.position
  const to = destination(from, total)
  const passed = passesGo(from, total)
  events.push({ type: 'TokenMoved', player, from, to, passedGo: passed })
  if (passed) {
    // era-decks 6.2: a `go-salary-addend` modifier tops up the salary for the players
    // it names. Additive and card-authored in whole dollars, so nothing rounds.
    const salary = ECONOMY.GO_SALARY + goSalaryAddend(state, player)
    events.push({ type: 'SalaryPaid', player, amount: salary })
    ledger.credit(salary)
  }
  events.push(...resolveLanding(state, player, to, dice, ledger, ports))
  return events
}

/**
 * Step 2 of the obligation waterfall: whatever clean cash could not cover
 * capitalises into the drawn balance. Uncapped by design — the borrowing base
 * is deliberately not consulted here.
 */
function capitalise(
  events: GameEvent[],
  player: PlayerId,
  unpaid: Money,
  obligation: ObligationKind,
): void {
  if (unpaid > 0) {
    events.push({ type: 'ObligationCapitalised', player, amount: unpaid, obligation })
  }
}

function resolveLanding(
  state: GameState,
  player: PlayerId,
  square: SquareIndex,
  dice: DiceRoll,
  ledger: TurnLedger,
  ports: BoardPorts,
): readonly GameEvent[] {
  const events: GameEvent[] = []
  if (square === GO_TO_JAIL_SQUARE) {
    events.push({ type: 'SentToJail', player, reason: 'square' })
    return events
  }
  if (square === INCOME_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.INCOME_TAX, kind: 'income' })
    capitalise(events, player, ledger.charge(ECONOMY.INCOME_TAX), 'tax')
    return events
  }
  if (square === LUXURY_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.LUXURY_TAX, kind: 'luxury' })
    capitalise(events, player, ledger.charge(ECONOMY.LUXURY_TAX), 'tax')
    return events
  }

  const definition = deedAt(square)
  if (definition === null) return events
  const deed = state.deeds[definition.id]
  // Spec 19.2: the owner owes nothing on their own deed.
  if (deed === undefined || deed.owner === player) return events

  const amount = rentDue(state, definition.id, dice)
  if (amount <= 0) return events
  const recipient = rentRecipient(state, definition.id)
  // Spec 19.2: a futures holder landing on a deed they do not own pays nobody.
  if (recipient === null || recipient === player) return events

  const charged: GameEvent = {
    type: 'RentCharged', from: player, to: recipient, deed: definition.id, amount,
  }
  events.push(charged)
  const contract = activeFutureOn(state, definition.id)
  if (contract !== null) {
    events.push({
      type: 'RentRoutedToFuture', contract: contract.id, holder: contract.holder, amount,
    })
  }
  capitalise(events, player, ledger.charge(amount), 'rent')
  /**
   * Spec 19.5. The venture kicker is computed on the rent CHARGED and paid to the
   * DEED'S OWNER, which is why it is handed the event rather than the recipient: a live
   * rent future moves `charged.to` to the futures holder, but `ventureIncomeFromRent`
   * reads `state.deeds[deed].owner` and pays the owner regardless. Selling a future
   * therefore does not extinguish venture income, and a futures holder earns nothing
   * from a deed they do not own. Emitted last so the rent leg is fully resolved first;
   * the dirty cash it mints has no payer (spec section 10) and so cannot interact with
   * the payer's shortfall above.
   */
  events.push(...ports.ventureIncomeFromRent(state, charged))
  return events
}
