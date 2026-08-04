import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'
import type { DeedOption, GameState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { activeFutureOn, rentRecipient } from '../board/index.js'
import { borrowingBase } from '../credit/index.js'
import { markRentFuture } from './valuation.js'

/**
 * The outstanding contract on this deed, whether or not its window has opened.
 * Expired contracts are removed at Settlement step 1, so anything in state.futures
 * is by definition still outstanding. This is the encumbrance test.
 */
export function futureFor(state: GameState, deed: DeedId): RentFuture | null {
  return state.futures.find((f) => f.deed === deed) ?? null
}

/**
 * The contract currently routing rent, i.e. whose window covers the current round.
 * Board (Task 6) already ships this exact selector as `activeFutureOn` — reconciliation
 * item #4 resolved the export collision in board's favour, so this is a thin,
 * markets-vocabulary alias rather than a parallel reimplementation.
 */
export function routingFutureFor(state: GameState, deed: DeedId): RentFuture | null {
  return activeFutureOn(state, deed)
}

export function isEncumbered(state: GameState, deed: DeedId): boolean {
  return futureFor(state, deed) !== null
}

export interface RentPayment {
  readonly payer: PlayerId
  readonly recipient: PlayerId
  readonly amount: Money
  readonly contract: ContractId | null
}

/**
 * Resolves a landing into a payment, or into no payment at all. Spec 19.2 names
 * exactly two cases in which nothing moves:
 *   - the deed's owner lands on it and owes nothing;
 *   - the futures holder lands on a deed they do not own, and would otherwise
 *     owe rent to themselves.
 * `rentRecipient` is board's (Task 6), imported rather than redefined.
 */
export function rentPayment(
  state: GameState,
  deed: DeedId,
  lander: PlayerId,
  amount: Money,
): RentPayment | null {
  const d = state.deeds[deed]
  if (d === undefined || d.mortgaged) return null
  if (d.owner === null || d.owner === 'bank') return null
  if (d.owner === lander) return null
  const recipient = rentRecipient(state, deed)
  if (recipient === null || recipient === lander) return null
  if (amount <= 0) return null
  return {
    payer: lander,
    recipient,
    amount,
    contract: activeFutureOn(state, deed)?.id ?? null,
  }
}

/**
 * The single entry point board's landing resolution calls instead of emitting
 * RentCharged itself. RentCharged.to is always the actual recipient; the deed's
 * owner, which is what ventures key off per spec 19.5, is read from the deed.
 * RentRoutedToFuture carries no money — it attributes the cashflow to the
 * contract so pooled futures can be settled in the Task 16 waterfall.
 */
export function rentEvents(
  state: GameState,
  deed: DeedId,
  lander: PlayerId,
  amount: Money,
): readonly GameEvent[] {
  const p = rentPayment(state, deed, lander, amount)
  if (p === null) return []
  const events: GameEvent[] = [
    { type: 'RentCharged', from: p.payer, to: p.recipient, deed, amount: p.amount },
  ]
  if (p.contract !== null) {
    events.push({
      type: 'RentRoutedToFuture',
      contract: p.contract,
      holder: p.recipient,
      amount: p.amount,
    })
  }
  return events
}

/**
 * Port declared by Task 10 (`credit`'s `CreditPorts.rentFutureMakeWhole`), and also
 * used internally by `mortgageImpact` and `makeWholeOnMortgage`. Remaining expected
 * value of the outstanding rent future on this deed, or 0 if there is none.
 */
export function rentFutureMakeWhole(state: GameState, deed: DeedId): Money {
  const f = futureFor(state, deed)
  return f === null ? 0 : markRentFuture(state, f.id)
}

export interface MortgageImpact {
  readonly proceeds: Money
  readonly makeWhole: Money
  readonly baseAfter: Money
  readonly drawn: Money
  readonly marginCalled: boolean
}

/**
 * Everything the assist panel needs to render the spec section 14 warning
 * "mortgaging this triggers a margin call", including the make-whole a rent
 * future would cost. Pure: builds a hypothetical mortgaged state and asks credit.
 */
export function mortgageImpact(state: GameState, deed: DeedId): MortgageImpact {
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank' || d.mortgaged) {
    return { proceeds: 0, makeWhole: 0, baseAfter: 0, drawn: 0, marginCalled: false }
  }
  const owner = d.owner
  const after: GameState = {
    ...state,
    deeds: { ...state.deeds, [deed]: { ...d, mortgaged: true } },
  }
  const baseAfter = borrowingBase(after, owner)
  const drawn = state.players[owner].drawnCredit
  return {
    proceeds: floorPercent(d.faceValue, ECONOMY.MORTGAGE_RATE),
    makeWhole: rentFutureMakeWhole(state, deed),
    baseAfter,
    drawn,
    marginCalled: drawn > baseAfter,
  }
}

/**
 * The outstanding option on this deed, if any. A deed carries at most one at a time —
 * `decideWrite` (decide-options.ts) enforces that before emitting `DeedOptionWritten` —
 * so `.find` is unambiguous. Mirrors `futureFor` above.
 */
export function outstandingOption(state: GameState, deed: DeedId): DeedOption | null {
  return state.options.find((o) => o.deed === deed) ?? null
}

/**
 * Spec section 9: while an option is outstanding the writer may not sell, trade or
 * mortgage the underlying deed. Forced liquidation is deliberately NOT gated by this —
 * see `credit/decide.ts`'s `extinguishmentEvents` for why locking liquidation would let
 * a distressed player write a $1 option on every deed and become judgment-proof.
 */
export function isDeedLocked(state: GameState, deed: DeedId): boolean {
  return outstandingOption(state, deed) !== null
}

/** The guard Task 9/10's mortgage and trade deciders call before acting on a deed. */
export function assertDeedTransferable(state: GameState, deed: DeedId): Rejection | null {
  if (!isDeedLocked(state, deed)) return null
  return reject(
    'DEED_ENCUMBERED',
    'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
  )
}

/**
 * Spec section 12 mark-to-model: max(0, deed face value - strike). Two integers, so
 * nothing here rounds.
 */
export function markDeedOption(state: GameState, id: ContractId): Money {
  const o = state.options.find((x) => x.id === id)
  if (o === undefined) return 0
  const d = state.deeds[o.deed]
  if (d === undefined) return 0
  return Math.max(0, d.faceValue - o.strike)
}

/**
 * Port declared by Task 10 (`credit`'s `CreditPorts.deedOptionRefund`). The premium to
 * refund the holder when this deed's outstanding option is extinguished by forced
 * liquidation (spec 19.12), or 0 if there is none.
 */
export function deedOptionRefund(state: GameState, deed: DeedId): Money {
  const o = outstandingOption(state, deed)
  return o === null ? 0 : o.premium
}
