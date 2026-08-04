import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { reduceProperty } from '../board/index.js'
import { type DeedOptionCommand, decideDeedOptions } from './decide-options.js'
import { futureFor, poolHoldingRentFuture, rentFutureMakeWhole } from './selectors.js'

export interface OriginateRentFuture {
  readonly type: 'OriginateRentFuture'
  readonly player: PlayerId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
  readonly price: Money
}

export interface SellRentFuture {
  readonly type: 'SellRentFuture'
  readonly player: PlayerId
  readonly contract: ContractId
  readonly to: PlayerId
  readonly price: Money
}

export type MarketsCommand = OriginateRentFuture | SellRentFuture | DeedOptionCommand

/**
 * Deterministic identity. The engine has no source of randomness, so contract ids
 * are derived. (deed, startRound, endRound) is unique for all time: a second
 * contract on the same deed can only be originated once the first has expired,
 * and its start round must then exceed the first contract's end round.
 */
export function rentFutureId(
  deed: DeedId, start: RoundNumber, end: RoundNumber,
): ContractId {
  return `rf:${deed}:${start}-${end}`
}

/**
 * Spec section 6 unlocks rent futures in Era II. Spec section 14's dependency table
 * lists `markets`' allowed dependencies as exactly `board` and `credit` — `session` is
 * not among them (`session` itself depends on nothing), so importing `session`'s
 * `isUnlocked` here would reach outside this context's sanctioned import set. Instead,
 * inline the check against `ECONOMY.UNLOCK_ERA`, the same single source of truth
 * `session` itself reads — `credit`'s `decide-loans.ts` takes the identical approach
 * for peer loans.
 */
function locked(state: GameState): boolean {
  return state.config.unlockMode !== 'all' && state.era < ECONOMY.UNLOCK_ERA['rent-future']
}

function decideOriginate(
  state: GameState, cmd: OriginateRentFuture,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Rent futures can only be originated during an Open phase.')
  }
  if (locked(state)) {
    return reject(
      'INSTRUMENT_LOCKED_THIS_ERA',
      `Rent futures unlock in Era ${ECONOMY.UNLOCK_ERA['rent-future']}.`,
    )
  }
  const deed = state.deeds[cmd.deed]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${cmd.deed}.`)
  }
  if (deed.owner !== cmd.player) {
    return reject('NOT_OWNER', 'Only the owner of a deed may originate a rent future on it.')
  }
  if (deed.mortgaged) {
    return reject(
      'DEED_MORTGAGED',
      'A mortgaged property collects no rent, so it cannot originate a rent future.',
    )
  }
  if (futureFor(state, cmd.deed) !== null) {
    return reject('DEED_ENCUMBERED', 'This property already has an outstanding rent future.')
  }
  if (cmd.holder === cmd.player) {
    return reject('SELF_DEALING', 'A rent future must be sold to another player.')
  }
  const length = cmd.endRound - cmd.startRound + 1
  if (
    cmd.startRound <= state.round
    || cmd.endRound < cmd.startRound
    || cmd.endRound > ECONOMY.TOTAL_ROUNDS
    || length > ECONOMY.MAX_FUTURE_WINDOW
  ) {
    return reject(
      'INVALID_WINDOW',
      `The window must start after round ${state.round}, run at most `
      + `${ECONOMY.MAX_FUTURE_WINDOW} rounds, and end by round ${ECONOMY.TOTAL_ROUNDS}.`,
    )
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.holder].cleanCash < cmd.price) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.holder} holds $${state.players[cmd.holder].cleanCash} in clean cash `
      + `and the price is $${cmd.price}.`,
    )
  }
  const id = rentFutureId(cmd.deed, cmd.startRound, cmd.endRound)
  if (state.futures.some((f) => f.id === id)) {
    return reject('DUPLICATE_CONTRACT_ID', 'A contract with this identity already exists.')
  }
  return [{
    type: 'RentFutureOriginated',
    id,
    deed: cmd.deed,
    holder: cmd.holder,
    startRound: cmd.startRound,
    endRound: cmd.endRound,
    price: cmd.price,
  }]
}

function decideSell(
  state: GameState, cmd: SellRentFuture,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Rent futures can only be resold during an Open phase.')
  }
  if (locked(state)) {
    return reject(
      'INSTRUMENT_LOCKED_THIS_ERA',
      `Rent futures unlock in Era ${ECONOMY.UNLOCK_ERA['rent-future']}.`,
    )
  }
  const f = state.futures.find((x) => x.id === cmd.contract)
  if (f === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That rent future is no longer outstanding.')
  }
  if (f.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a rent future may resell it.')
  }
  if (poolHoldingRentFuture(state, f.id) !== null) {
    return reject(
      'ASSET_ALREADY_POOLED',
      'That rent future is inside a live pool. Its cashflow belongs to the tranche holders.',
    )
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A rent future must be sold to another player.')
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.to].cleanCash < cmd.price) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.to} cannot cover a price of $${cmd.price}.`,
    )
  }
  return [{
    type: 'RentFutureSold', id: f.id, from: cmd.player, to: cmd.to, price: cmd.price,
  }]
}

export function decideMarkets(
  state: GameState, cmd: MarketsCommand,
): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'OriginateRentFuture': return decideOriginate(state, cmd)
    case 'SellRentFuture': return decideSell(state, cmd)
    default: return decideDeedOptions(state, cmd)
  }
}

/** Settlement step 1, spec 19.1. Futures reaching their end round expire. */
export function expireRentFutures(state: GameState): readonly GameEvent[] {
  return state.futures
    .filter((f) => f.endRound <= state.round)
    .map((f): GameEvent => ({ type: 'RentFutureExpired', id: f.id }))
}

/**
 * Spec section 6. Mortgaging an encumbered property owes the holder the contract's
 * remaining expected value and terminates the contract.
 *
 * Two different states are in play here, and conflating them was a money leak.
 *
 * VALUATION is against `state`, the state BEFORE `DeedMortgaged` is applied: a
 * mortgaged deed collects no rent and so values every contract on it at zero, and
 * valuing after the fact would always yield $0 and reopen the exploit.
 *
 * PRICING the shortfall is against `applied.reduce(reduceProperty, state)` — the
 * state this function's own events will actually be reduced against, which is
 * `state` plus whatever the caller has already emitted ahead of them in the same
 * batch (in practice the `DeedMortgaged` event itself, whose proceeds land in the
 * owner's clean cash). This is the discipline Task 20 established in
 * `securitization/swaps.ts`'s `settleSwapPremiums`, applied across a batch instead
 * of across a loop: price every shortfall against the folded state, never against
 * the caller's stale snapshot.
 *
 * Pricing against the pre-mortgage cash instead — as this did until the leak was
 * found — put the decider and the reducer in disagreement, because
 * `reduce.ts`'s `RentFutureMadeWhole` case clamps the owner's debit with `transfer`
 * against their POST-`DeedMortgaged` cash. `ObligationCapitalised` then added a gap
 * the reducer had not actually left unpaid, and the conserved total moved by
 * exactly `clamped_shortfall - gap`. Folding the batch is what makes the two agree
 * by construction rather than by assertion. It is NOT double-counting the proceeds:
 * they are read, not credited — `DeedMortgaged` remains their only cash leg.
 *
 * It is also the sequence `board`'s mortgage decider already documents ("sequenced
 * after the proceeds arrive"): the mortgage proceeds are what funds the make-whole,
 * so an owner cannot capitalise debt while sitting on cash the mortgage just paid
 * them.
 *
 * The gap capitalises via `ObligationCapitalised { obligation: 'make-whole' }`
 * rather than `DistressedDebtIncurred`: spec 19.7 reserves distressed debt for the
 * terminal state an uncured margin call reaches only after forced liquidation is
 * exhausted, which a single unaffordable make-whole is not — it is an ordinary
 * automatic obligation and belongs on the same uncapped waterfall as rent, tax
 * and interest (spec 19.8). Task 20 found and fixed the original routing.
 */
export function makeWholeOnMortgage(
  state: GameState, deed: DeedId, applied: readonly GameEvent[] = [],
): readonly GameEvent[] {
  const f = futureFor(state, deed)
  if (f === null) return []
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank') return []
  if (d.owner === f.holder) {
    return [{ type: 'RentFutureExpired', id: f.id }]
  }
  const amount = rentFutureMakeWhole(state, deed)
  const events: GameEvent[] = [{ type: 'RentFutureMadeWhole', id: f.id, amount }]
  const priced = applied.reduce(reduceProperty, state)
  const gap = amount - priced.players[d.owner].cleanCash
  if (gap > 0) {
    events.push({
      type: 'ObligationCapitalised', player: d.owner, amount: gap, obligation: 'make-whole',
    })
  }
  events.push({ type: 'RentFutureExpired', id: f.id })
  return events
}
