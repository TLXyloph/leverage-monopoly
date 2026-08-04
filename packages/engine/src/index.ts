export const ENGINE_VERSION = '0.1.0'

export * from './core/types.js'
export * from './core/state.js'
export * from './core/events.js'
export * from './core/errors.js'
export { ECONOMY, RATING_BANDS, RATING_FLOOR } from './config/economy.js'
export * from './config/board.js'
export * from './core/reduce.js'
export * from './core/money.js'
export * from './core/card-effects.js'
/**
 * The composition root. Without this, an external caller reaching for a decider found
 * only the context's own entry point and its `NO_*` default ports — so a server
 * liquidating an encumbered deed got a silent $0 make-whole and no rejection, and a
 * server rolling dice got no venture income. Every `decide*Action` here is the wired
 * form; prefer them over the raw `decide*` a context exports.
 */
export * from './core/decide.js'
export * from './contexts/session/index.js'
export * from './contexts/board/index.js'
export * from './contexts/credit/index.js'
export * from './contexts/draft/index.js'
/**
 * `markets` is exported name by name rather than with `export *` because two of its
 * names already exist at the package root and mean something different:
 * `expectedHitsPerRound` (board's is per DEED from the Markov chain; markets' converts a
 * per-roll probability) and `roundsRemaining` (session's counts rounds left in the GAME;
 * markets' counts rounds left in a CONTRACT window). Both markets forms are reachable
 * under a qualified alias, so nothing is hidden and no caller can pick the wrong one by
 * accident.
 */
export type {
  DeedOptionCommand, ExerciseDeedOption, FutureValuation, MarketsCommand, MortgageImpact,
  OriginateRentFuture, RentPayment, SellDeedOption, SellRentFuture, WriteDeedOption,
} from './contexts/markets/index.js'
export {
  assertDeedTransferable, decideDeedOptions, decideMarkets, deedOptionId, deedOptionRefund,
  expireRentFutures, futureFor, isDeedLocked, isEncumbered, lapseDeedOptions, markDeedOption,
  markRentFuture, makeWholeOnMortgage, mortgageImpact, outstandingOption,
  poolHoldingDeedOption, poolHoldingRentFuture, poissonQuantile, reduceDeedOptions,
  reduceMarkets, rentFutureId, rentFutureMakeWhole, rentPayment, routingFutureFor,
  valueRentFuture, valueWindow,
} from './contexts/markets/index.js'
export {
  expectedHitsPerRound as expectedFutureHitsPerRound,
  roundsRemaining as contractRoundsRemaining,
} from './contexts/markets/index.js'
export * from './contexts/underworld/index.js'
export * from './contexts/securitization/index.js'
export * from './contexts/decks/index.js'
