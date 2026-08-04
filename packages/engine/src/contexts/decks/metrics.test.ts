import { describe, it, expect } from 'vitest'
import { evalMetric } from './metrics.js'
import { fixtureMidGame } from './decks.fixture.js'

describe('evalMetric', () => {
  const s = fixtureMidGame()

  it('returns 1 for the constant metric so flat amounts need no special form', () => {
    expect(evalMetric(s, 'P1', 'one')).toBe(1)
  })

  it('counts a hotel as one hotel and zero loose houses', () => {
    // P2 holds a hotel on st-james-place and 2 houses on tennessee-avenue.
    expect(evalMetric(s, 'P2', 'hotel-count')).toBe(1)
    expect(evalMetric(s, 'P2', 'house-count')).toBe(2)
    expect(evalMetric(s, 'P2', 'building-count')).toBe(7)
  })

  it('separates mortgaged from unmortgaged face value', () => {
    expect(evalMetric(s, 'P3', 'deed-face-value'))
      .toBe(evalMetric(s, 'P3', 'unmortgaged-face-value') + evalMetric(s, 'P3', 'mortgaged-face-value'))
    expect(evalMetric(s, 'P3', 'mortgaged-deed-count')).toBe(1)
    expect(evalMetric(s, 'P3', 'unmortgaged-deed-count')).toBe(1)
  })

  it('caps drawn-to-base ratio handling when the base is zero', () => {
    // P4 has mortgaged everything they own: base 0, drawn 400.
    expect(evalMetric(s, 'P4', 'borrowing-base')).toBe(0)
    expect(evalMetric(s, 'P4', 'drawn-to-base-ratio')).toBe(Number.POSITIVE_INFINITY)
  })

  it('reads 0, not Infinity, when both drawn balance and base are zero', () => {
    expect(evalMetric(s, 'P1', 'drawn-credit')).toBe(0)
    expect(evalMetric(s, 'P1', 'drawn-to-base-ratio')).toBe(0)
  })

  it('sums total obligations per E4-20', () => {
    const p = 'P4' as const
    expect(evalMetric(s, p, 'total-obligations')).toBe(400)
    expect(evalMetric(s, p, 'total-obligations')).toBe(
      evalMetric(s, p, 'drawn-credit')
      + evalMetric(s, p, 'peer-principal-borrowed')
      + evalMetric(s, p, 'cds-notional-written')
      + evalMetric(s, p, 'distressed-debt'),
    )
  })

  it('reads the card-effect counters straight off cardEffects', () => {
    expect(evalMetric(s, 'P1', 'rent-received-this-era')).toBe(0)
    expect(evalMetric(s, 'P1', 'dirty-actions-this-game')).toBe(0)
  })
})
