import { describe, expect, it } from 'vitest'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../../config/economy.js'
import type { PoolAssetRef } from '../../core/state.js'
import { deed, gameState, loan, pool, tranches, withDeeds, withLoans, withPlayers } from './fixture.js'
import {
  borrowerLeverage, obligorConcentration, ratePool, ratingForScore, ratingFrom, scoreFrom,
  weightedBorrowerLeverage,
} from './ratings.js'

describe('spec section 8 worked example', () => {
  // Pool cashflow $1,910. Senior face $700, mezzanine face $600.
  // Equity's claim is the spec 19.3 residual: 1910 - 700 - 600 = 610, so cumulative
  // claim through equity is 700 + 600 + 610 = 1910 and coverage is exactly 1.0.
  const CASHFLOW = 1910
  const CONCENTRATION = 0.76
  const LEVERAGE = 3.8

  it('rates the senior tranche AA', () => {
    expect(ratingFrom({
      cashflow: CASHFLOW, claim: 700, concentration: CONCENTRATION, leverage: LEVERAGE,
    })).toBe('AA')
  })

  it('rates the mezzanine tranche BB', () => {
    // Cumulative claim through mezzanine is 700 + 600 = 1300.
    expect(ratingFrom({
      cashflow: CASHFLOW, claim: 1300, concentration: CONCENTRATION, leverage: LEVERAGE,
    })).toBe('BB')
  })

  it('rates the equity tranche CCC, with coverage at exactly 1.0', () => {
    const inputs = {
      cashflow: CASHFLOW, claim: 1910, concentration: CONCENTRATION, leverage: LEVERAGE,
    }
    expect(CASHFLOW / 1910).toBe(1)
    expect(ratingFrom(inputs)).toBe('CCC')
    expect(ratingFrom(inputs)).toBe(RATING_FLOOR)
  })

  it('computes the three underlying scores exactly, to five decimal places', () => {
    expect(scoreFrom({ cashflow: 1910, claim: 700, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(1.60155, 5)
    expect(scoreFrom({ cashflow: 1910, claim: 1300, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(0.86237, 5)
    expect(scoreFrom({ cashflow: 1910, claim: 1910, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(0.58696, 5)
  })

  it(
    'is deliberately coverage-dominant: an AA senior slice sitting over 76% single-'
      + 'obligor concentration and 3.8x leverage is the intended outcome, not a bug',
    () => {
      const senior = scoreFrom({ cashflow: CASHFLOW, claim: 700, concentration: CONCENTRATION, leverage: LEVERAGE })
      // Concentration and leverage both PULL THE SCORE DOWN (a higher concentration or
      // a higher leverage both shrink the score), yet coverage alone is still enough
      // to clear the AA bar at 1.5. The formula weighs coverage far more heavily than
      // either risk factor — that asymmetry is the point of this test.
      const uncontaminated = scoreFrom({ cashflow: CASHFLOW, claim: 700, concentration: 0, leverage: 0 })
      expect(senior).toBeLessThan(uncontaminated)
      expect(senior).toBeGreaterThanOrEqual(1.5)
    },
  )
})

describe('rating bands', () => {
  it('evaluates highest first and floors at CCC', () => {
    expect(ratingForScore(3)).toBe('AAA')
    expect(ratingForScore(2.2)).toBe('AAA')
    expect(ratingForScore(2.19)).toBe('AA')
    expect(ratingForScore(1.5)).toBe('AA')
    expect(ratingForScore(1.2)).toBe('A')
    expect(ratingForScore(1.0)).toBe('BBB')
    expect(ratingForScore(0.8)).toBe('BB')
    expect(ratingForScore(0.6)).toBe('B')
    expect(ratingForScore(0.599)).toBe('CCC')
    expect(ratingForScore(0)).toBe(RATING_FLOOR)
    expect(RATING_BANDS.length).toBe(6)
  })
})

/**
 * Three peer loans lent by P1 to P2, whose combined expected cashflow at round 13 is
 * exactly $1,910 — the identical fixture `securitization.test.ts` uses for the same
 * pool. Every loan shares a single borrower, so concentration is exactly 1.0 rather
 * than the spec's worked-example 0.76: a strictly harder single-obligor case.
 */
function loansToOneBorrower() {
  return [
    loan('l-1', { borrower: 'P2', outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
    loan('l-2', { borrower: 'P2', outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
    loan('l-3', { borrower: 'P2', outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15 }),
  ]
}

const THREE_LOANS: readonly PoolAssetRef[] = [
  { kind: 'peer-loan', id: 'l-1' },
  { kind: 'peer-loan', id: 'l-2' },
  { kind: 'peer-loan', id: 'l-3' },
]

describe('concentration and weighted borrower leverage, read from real state', () => {
  const p = pool('pool-1', { assets: THREE_LOANS, tranches: tranches(600, 500, 810) })

  /** P2 drawn $1,900 against a $500 borrowing base (one synthetic deed advancing
   * floorPercent(667, 0.75) = 500) is exactly 3.8x leverage. */
  function leveredState() {
    const withOneBorrower = withLoans(gameState({ round: 13 }), loansToOneBorrower())
    const withDeed = withDeeds(withOneBorrower, [deed('synthetic-1', 667, { owner: 'P2' })])
    return withPlayers(withDeed, { P2: { drawnCredit: 1900 } })
  }

  it('reports concentration 1.0 when every asset names the same obligor', () => {
    expect(obligorConcentration(leveredState(), p)).toBe(1)
  })

  it('caps a single borrower\'s leverage at RATING_MAX_LEVERAGE', () => {
    const state = withPlayers(leveredState(), { P2: { drawnCredit: 50_000 } })
    expect(borrowerLeverage(state, 'P2')).toBe(ECONOMY.RATING_MAX_LEVERAGE)
  })

  it('reports zero leverage for a borrower with nothing drawn', () => {
    expect(borrowerLeverage(leveredState(), 'P3')).toBe(0)
  })

  it('reports the cashflow-weighted mean borrower leverage', () => {
    // Every asset shares the same obligor, so the weighted mean collapses to that
    // obligor's own leverage regardless of the per-asset weights.
    expect(weightedBorrowerLeverage(leveredState(), p)).toBeCloseTo(3.8, 10)
  })

  it('still rates the senior slice AA at full concentration and 3.8x leverage', () => {
    // Spec section 8 calls this exact case out by name: three of a pool's loans to
    // one over-levered player, and the senior slice still rates AA. This is correct
    // and intended — the formula is coverage-dominant by design, not a defect to fix.
    const state = leveredState()
    const ratings = ratePool(state, p)
    expect(ratings.map((r) => r.rating)).toEqual(['AA', 'BB', 'CCC'])
    // The raw figures ride alongside the letter, per spec section 8, so a player who
    // reads past the grade can see exactly why it deserves scrutiny.
    expect(ratings[0]?.concentration).toBe(1)
    expect(ratings[0]?.leverage).toBeCloseTo(3.8, 10)
    expect(ratings[0]?.coverage).toBeCloseTo(1910 / 600, 10)
    expect(ratings[2]?.coverage).toBe(1)
  })

  it('weights leverage by each obligor\'s share of expected cashflow', () => {
    const state = withPlayers(
      withDeeds(
        withLoans(gameState({ round: 13 }), [
          loan('l-1', { borrower: 'P2', outstanding: 500, ratePerRound: 0, maturesAtRound: 15 }),
          loan('l-2', { borrower: 'P3', outstanding: 500, ratePerRound: 0, maturesAtRound: 15 }),
          loan('l-3', { borrower: 'P3', outstanding: 1000, ratePerRound: 0, maturesAtRound: 15 }),
        ]),
        [
          deed('synthetic-p2', 667, { owner: 'P2' }),
          deed('synthetic-p3', 667, { owner: 'P3' }),
        ],
      ),
      { P2: { drawnCredit: 1000 }, P3: { drawnCredit: 500 } },
    )
    // P2 at 2.0x (1000/500) on 500 of 2000 total expected cashflow;
    // P3 at 1.0x (500/500) on 1500 of 2000.
    expect(obligorConcentration(state, p)).toBeCloseTo(0.75, 10)
    expect(weightedBorrowerLeverage(state, p)).toBeCloseTo(1.25, 10)
  })
})
