import {
  GO_TO_JAIL_SQUARE, INCOME_TAX_SQUARE, LUXURY_TAX_SQUARE, deedAt,
} from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
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
    events.push({ type: 'SalaryPaid', player, amount: ECONOMY.GO_SALARY })
    ledger.credit(ECONOMY.GO_SALARY)
  }
  events.push(...resolveLanding(state, player, to, dice, ledger))
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

  events.push({ type: 'RentCharged', from: player, to: recipient, deed: definition.id, amount })
  const contract = activeFutureOn(state, definition.id)
  if (contract !== null) {
    events.push({
      type: 'RentRoutedToFuture', contract: contract.id, holder: contract.holder, amount,
    })
  }
  capitalise(events, player, ledger.charge(amount), 'rent')
  return events
}
