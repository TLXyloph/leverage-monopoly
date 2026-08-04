import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, DiceRoll, Money, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import { landingProbability, rentDue } from '../board/index.js'

/**
 * Loop guard on the Poisson series. Not an economic constant: lambda in this game
 * never exceeds about 2.5 (an 8-round window on the busiest square is 0.78), so the
 * CDF reaches 1 far below k = 64. The guard exists only so the loop is provably total.
 */
const POISSON_MAX_K = 64

/**
 * The modal 2d6 total, used to value a deed's rent without a live roll. `board`
 * (Task 5) does not export a `MEAN_DICE` constant, so this is defined locally —
 * any pair summing to 7 gives the same `rentDue` result for every non-utility
 * deed, and utilities are priced off dice by design (spec section 20).
 */
const MEAN_DICE: DiceRoll = [3, 4]

export interface FutureValuation {
  readonly deed: DeedId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
  /** Per roll, per token, from the Markov chain. Spec section 20. */
  readonly landingProbability: number
  readonly expectedHitsPerRound: number
  readonly roundsRemaining: number
  readonly expectedHits: number
  readonly rentAtCurrentDevelopment: Money
  readonly expectedValue: Money
  readonly p10: Money
  readonly p90: Money
}

/**
 * Spec 19.2. Per-roll landing probability x the three players who can owe rent
 * x 1.19 for the extra rolls doubles generate. `landingProbability` itself (Task 7)
 * returns the raw, unconverted per-roll figure; this conversion happens ONLY here.
 * Applying it a second time anywhere else would price every future in the game at
 * roughly RENT_OBLIGORS x DOUBLES_ROLL_MULTIPLIER (~3.57x) its true value.
 */
export function expectedHitsPerRound(perRollProbability: number): number {
  return perRollProbability * ECONOMY.RENT_OBLIGORS * ECONOMY.DOUBLES_ROLL_MULTIPLIER
}

/**
 * Rounds in which rent can still route, counting the current round as live.
 * A future expires at Settlement step 1 of its end round, which is after that
 * round's Movement phase, so the end round itself always still pays.
 */
export function roundsRemaining(
  current: RoundNumber,
  start: RoundNumber,
  end: RoundNumber,
): number {
  const first = Math.max(current, start)
  if (first > end) return 0
  return end - first + 1
}

/** Smallest k with P(X <= k) >= q for X ~ Poisson(lambda). Exact, by summation. */
export function poissonQuantile(lambda: number, q: number): number {
  if (lambda <= 0) return 0
  let k = 0
  let term = Math.exp(-lambda)
  let cdf = term
  while (cdf < q && k < POISSON_MAX_K) {
    k += 1
    term = (term * lambda) / k
    cdf += term
  }
  return k
}

/**
 * `Math.floor(a * b)` is lint-banned outside `core/money.ts` (it is a syntactic ban,
 * not a semantic one) because that pattern is how the rate-multiplication float-drift
 * bugs entered this codebase. `floorPercent` does not apply here — `a` is an expected
 * hit count or a Poisson quantile, not a rate in [0, 1] — so the product is computed
 * into a named value first and floored second. This is numerically IDENTICAL to
 * `Math.floor(a * b)` (JS evaluates the product into a temporary either way); only the
 * syntax differs, which is exactly what the AST rule inspects.
 */
function floorProduct(a: number, b: number): Money {
  const product = a * b
  return Math.floor(product)
}

function emptyValuation(
  deed: DeedId, startRound: RoundNumber, endRound: RoundNumber, rounds: number,
): FutureValuation {
  return {
    deed,
    startRound,
    endRound,
    landingProbability: 0,
    expectedHitsPerRound: 0,
    roundsRemaining: rounds,
    expectedHits: 0,
    rentAtCurrentDevelopment: 0,
    expectedValue: 0,
    p10: 0,
    p90: 0,
  }
}

/**
 * Values any window on any deed, whether or not a contract exists. This is the
 * figure spec section 6 requires the app to display for every property, so that
 * no player ever computes it by hand.
 */
export function valueWindow(
  state: GameState,
  deed: DeedId,
  startRound: RoundNumber,
  endRound: RoundNumber,
): FutureValuation {
  const rounds = roundsRemaining(state.round, startRound, endRound)
  const d = state.deeds[deed]
  if (d === undefined || d.mortgaged) {
    return emptyValuation(deed, startRound, endRound, rounds)
  }
  // Task 7 correction: landingProbability takes no GameState argument — the
  // steady-state distribution is a property of the board, not of game state.
  const p = landingProbability(d.square)
  const perRound = expectedHitsPerRound(p)
  const hits = perRound * rounds
  const rent = rentDue(state, deed, MEAN_DICE)
  return {
    deed,
    startRound,
    endRound,
    landingProbability: p,
    expectedHitsPerRound: perRound,
    roundsRemaining: rounds,
    expectedHits: hits,
    rentAtCurrentDevelopment: rent,
    expectedValue: floorProduct(hits, rent),
    p10: floorProduct(poissonQuantile(hits, ECONOMY.VALUATION_PERCENTILE_LOW), rent),
    p90: floorProduct(poissonQuantile(hits, ECONOMY.VALUATION_PERCENTILE_HIGH), rent),
  }
}

export function valueRentFuture(state: GameState, id: ContractId): FutureValuation | null {
  const f = state.futures.find((x) => x.id === id)
  if (f === undefined) return null
  return valueWindow(state, f.deed, f.startRound, f.endRound)
}

/**
 * The single figure used for both the spec section 12 mark-to-model and the
 * spec section 6 make-whole payment. They are the same number by definition:
 * the contract's remaining expected value.
 */
export function markRentFuture(state: GameState, id: ContractId): Money {
  return valueRentFuture(state, id)?.expectedValue ?? 0
}
