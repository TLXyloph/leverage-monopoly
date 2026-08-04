import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
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
 * remaining expected value and terminates the contract. Called by the mortgage
 * decider against the state BEFORE DeedMortgaged is applied — the make-whole
 * VALUATION must be against the pre-mortgage state (a mortgaged deed values at
 * zero, so valuing after the fact would always yield $0 and reopen the exploit).
 *
 * The shortfall that becomes distressed debt is computed against the owner's
 * ACTUAL pre-mortgage clean cash, not a hypothetical cash-plus-mortgage-proceeds
 * figure: crediting the future proceeds here as well as via the eventual
 * DeedMortgaged event would double-count them, manufacturing money equal to the
 * mortgage proceeds every time a shortfall occurs. Using actual cash keeps this
 * task's own events conserved with no Treasury leg, independent of when or
 * whether DeedMortgaged is later applied.
 */
export function makeWholeOnMortgage(
  state: GameState, deed: DeedId,
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
  const gap = amount - state.players[d.owner].cleanCash
  if (gap > 0) {
    events.push({ type: 'DistressedDebtIncurred', player: d.owner, amount: gap })
  }
  events.push({ type: 'RentFutureExpired', id: f.id })
  return events
}
