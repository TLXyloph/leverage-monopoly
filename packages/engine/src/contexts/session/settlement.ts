import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'
import { type Rejection, isRejection } from '../../core/errors.js'
import { reduce } from '../../core/reduce.js'
import { expireRentFutures, lapseDeedOptions } from '../markets/index.js'
import { settleAudits, settleVentures } from '../underworld/index.js'
import {
  flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt,
  settlePeerLoans,
} from '../credit/index.js'
import {
  releasePoolInjections, settleSecuritization, settleSwapPremiums, terminateAllPools,
  terminateScheduledPools,
} from '../securitization/index.js'
import { scoreGame } from './scoring.js'

export interface SettlementInput {
  /**
   * Audit checks are externally-sourced randomness: one physical 2d6 per player who
   * needs a check. Missing a required roll rejects the whole Settlement.
   */
  readonly auditDice: Readonly<Partial<Record<PlayerId, DiceRoll>>>
  /** Every event since this round's Market phase began. Spec 19.1 step 6 needs it. */
  readonly roundEvents: readonly GameEvent[]
}

/**
 * `emitted` is every event the Settlement has produced so far this pass. Step 6 needs
 * it: the card-injected pool cash it must distribute is released by the step immediately
 * before it, and `input.roundEvents` is a fixed snapshot taken before Settlement began,
 * so a step that read only that snapshot could never see it.
 */
type Step = (state: GameState, emitted: readonly GameEvent[]) => readonly GameEvent[] | Rejection

/** Spec 19.1, verbatim, for the rulebook generator and the ordering test. */
export const SETTLEMENT_STEPS: readonly string[] = [
  'Rent futures reaching their end round expire',
  'Venture payouts accrue as dirty cash; venture timers decrement',
  'Carrying cost charged, $8 per unmortgaged deed',
  'Credit line interest accrues on drawn balances',
  'Peer loan interest falls due; unpaid loans default',
  'Pool waterfalls distribute collected cash',
  'CDS premiums transfer from buyers to sellers',
  'Distressed debt accrues at 15%, compounding',
  'Audit checks roll, Era III onward, and resolve immediately',
  'Margin calls flagged; previously-flagged uncured positions marked for liquidation',
  'Deed options reaching expiry lapse',
]

function steps(input: SettlementInput): readonly Step[] {
  return [
    (s) => expireRentFutures(s),
    (s) => settleVentures(s),
    (s) => settleCarryingCost(s),
    (s) => settleCreditInterest(s),
    (s) => settlePeerLoans(s),
    // era-decks 6.5, sequenced around step 6: release card-escrowed cash so the
    // waterfall can distribute it, run step 6, then close any pool a card scheduled
    // for termination — in that order, so an injected pool pays out before it winds up.
    (s) => releasePoolInjections(s),
    (s, emitted) => settleSecuritization(s, [...input.roundEvents, ...emitted]),
    (s) => terminateScheduledPools(s),
    (s) => settleSwapPremiums(s),
    (s) => settleDistressedDebt(s),
    (s) => settleAudits(s, input.auditDice),
    (s) => flagMarginCalls(s),
    (s) => lapseDeedOptions(s),
  ]
}

/**
 * Folds the steps, reducing as it goes through the ROOT reducer (`core/reduce.js`), so
 * every step reads the state the steps before it produced. That is not an optimisation
 * — spec 19.1 requires an audit fine resolved at step 9 to be able to trigger the margin
 * call flagged at step 10, and going through the root reducer (rather than a
 * settlement-local one) is what closes the Priority Zero gap: every one of the ten
 * contexts' events, including underworld's and securitization's, is guaranteed to be
 * applied exactly the way replay would apply them.
 *
 * A rejection from any step aborts the whole Settlement and emits nothing, because a
 * half-applied Settlement is not a state the log should ever be able to reach.
 */
function fold(
  state: GameState, ordered: readonly Step[],
): readonly GameEvent[] | Rejection {
  let current = state
  const emitted: GameEvent[] = []
  for (const step of ordered) {
    const produced = step(current, emitted)
    if (isRejection(produced)) return produced
    for (const event of produced) {
      current = reduce(current, event)
      emitted.push(event)
    }
  }
  return emitted
}

/** Spec 19.1, steps 1-11, every round. */
export function runSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection {
  return fold(state, steps(input))
}

/**
 * Round 24 only. Spec 19.1: after step 11, all pools terminate, every tranche short of
 * face triggers its referencing CDS, then scoring runs. Termination and triggering are
 * one call because `terminateAllPools` emits each pool's `PoolTerminated` immediately
 * followed by the `SwapTriggered` events its shortfalls cause — the round-24 test in
 * `settlement.test.ts` asserts that interleaving, and that `GameScored` is strictly
 * last, which is what makes a CDS triggered by termination land in the final score.
 */
export function runFinalSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection {
  return fold(state, [
    ...steps(input),
    (s) => terminateAllPools(s),
    (s) => [scoreGame(s)],
  ])
}
