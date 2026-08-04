import type { Money, PlayerId } from '../../core/types.js'
import type { GameState, Pool, Tranche } from '../../core/state.js'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../../config/economy.js'
import { borrowingBase, drawnCredit } from '../credit/index.js'
import {
  assetObligor, cumulativeClaim, expectedAssetCashflow, expectedPoolCashflow,
} from './selectors.js'

export interface RatingInputs {
  /** Expected pool cashflow, integer dollars. */
  readonly cashflow: Money
  /** Cumulative claim through this tranche, integer dollars. Spec 19.3 for equity. */
  readonly claim: Money
  /** Largest share of expected pool cashflow from a single obligor, 0..1. */
  readonly concentration: number
  /** Cashflow-weighted mean borrower leverage, already capped. */
  readonly leverage: number
}

/**
 * Spec section 8. The money inputs are integer dollars; coverage, the two ratios and
 * the score itself are ordinary ratios, never money, and are never floored or rounded
 * at any stage — `floorPercent` is for dollar amounts, not for a dimensionless score.
 */
export function scoreFrom(inputs: RatingInputs): number {
  const coverage = inputs.claim <= 0 ? 0 : inputs.cashflow / inputs.claim
  return (
    (coverage * (1 - ECONOMY.RATING_CONCENTRATION_WEIGHT * inputs.concentration)) /
    (1 + ECONOMY.RATING_LEVERAGE_WEIGHT * inputs.leverage)
  )
}

/** RATING_BANDS is ordered best-first, so the first match wins. The floor is CCC. */
export function ratingForScore(score: number): string {
  for (const [minimum, rating] of RATING_BANDS) {
    if (score >= minimum) return rating
  }
  return RATING_FLOOR
}

export function ratingFrom(inputs: RatingInputs): string {
  return ratingForScore(scoreFrom(inputs))
}

export interface TrancheRating {
  readonly tranche: Tranche['kind']
  readonly coverage: number
  readonly concentration: number
  readonly leverage: number
  readonly score: number
  readonly rating: string
}

/** Largest share of expected pool cashflow owed by any single obligor, 0..1. */
export function obligorConcentration(state: GameState, pool: Pool): number {
  const total = expectedPoolCashflow(state, pool)
  if (total <= 0) return 0
  const byObligor = new Map<PlayerId, Money>()
  for (const ref of pool.assets) {
    const obligor = assetObligor(state, ref)
    if (obligor === null) continue
    byObligor.set(obligor, (byObligor.get(obligor) ?? 0) + expectedAssetCashflow(state, ref))
  }
  let largest = 0
  for (const amount of byObligor.values()) largest = Math.max(largest, amount)
  return largest / total
}

/**
 * Drawn credit over borrowing base, capped at RATING_MAX_LEVERAGE. A borrower with
 * nothing drawn is unlevered; a borrower with a drawn balance and no base is pinned at
 * the cap rather than dividing by zero.
 */
export function borrowerLeverage(state: GameState, player: PlayerId): number {
  const drawn = drawnCredit(state, player)
  if (drawn <= 0) return 0
  const base = borrowingBase(state, player)
  if (base <= 0) return ECONOMY.RATING_MAX_LEVERAGE
  return Math.min(ECONOMY.RATING_MAX_LEVERAGE, drawn / base)
}

/** Each obligor's capped leverage, weighted by that obligor's share of expected cashflow. */
export function weightedBorrowerLeverage(state: GameState, pool: Pool): number {
  const total = expectedPoolCashflow(state, pool)
  if (total <= 0) return 0
  let weighted = 0
  for (const ref of pool.assets) {
    const obligor = assetObligor(state, ref)
    if (obligor === null) continue
    weighted += borrowerLeverage(state, obligor) * expectedAssetCashflow(state, ref)
  }
  return weighted / total
}

export function rateTranche(state: GameState, pool: Pool, kind: Tranche['kind']): TrancheRating {
  const cashflow = expectedPoolCashflow(state, pool)
  const claim = cumulativeClaim(pool, kind)
  const concentration = obligorConcentration(state, pool)
  const leverage = weightedBorrowerLeverage(state, pool)
  const score = scoreFrom({ cashflow, claim, concentration, leverage })
  return {
    tranche: kind,
    coverage: claim <= 0 ? 0 : cashflow / claim,
    concentration,
    leverage,
    score,
    rating: ratingForScore(score),
  }
}

/**
 * Senior, mezzanine, equity — always in priority order, always with the raw
 * concentration and leverage figures riding alongside the letter (spec section 8: the
 * app always displays them, so a player can read past the grade).
 */
export function ratePool(state: GameState, pool: Pool): readonly TrancheRating[] {
  return (['senior', 'mezzanine', 'equity'] as const).map((kind) => rateTranche(state, pool, kind))
}
