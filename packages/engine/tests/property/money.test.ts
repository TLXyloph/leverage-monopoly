import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ceilPercent, floorPercent, floorPercentSum } from '../../src/core/money.js'

/** Exact rational oracle in BigInt basis points. No IEEE 754 anywhere. */
function exact(amount: number, rate: number, dir: 'floor' | 'ceil'): number {
  const bp = BigInt(Math.round(rate * 10_000))
  const n = BigInt(amount) * bp
  const q = n / 10_000n
  const r = n % 10_000n
  if (r === 0n) return Number(q)
  return dir === 'floor' ? Number(q) : Number(q + 1n)
}

const arbAmount = fc.integer({ min: 0, max: 20_000 })
/** Every rate the ruleset uses lands in [0, 2] at 2-decimal granularity. */
const arbRate = fc.integer({ min: 0, max: 200 }).map((n) => n / 100)

describe('floorPercent', () => {
  it('equals exact integer arithmetic for every amount and rate in range', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        expect(floorPercent(amount, rate)).toBe(exact(amount, rate, 'floor'))
      }),
      { numRuns: 2_000 },
    )
  })

  it('is monotonic in the amount', () => {
    fc.assert(
      fc.property(arbAmount, arbAmount, arbRate, (a, b, rate) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        expect(floorPercent(lo, rate)).toBeLessThanOrEqual(floorPercent(hi, rate))
      }),
      { numRuns: 1_000 },
    )
  })

  it('never exceeds ceilPercent, and differs by at most one dollar', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        const lo = floorPercent(amount, rate)
        const hi = ceilPercent(amount, rate)
        expect(hi - lo).toBeGreaterThanOrEqual(0)
        expect(hi - lo).toBeLessThanOrEqual(1)
      }),
      { numRuns: 1_000 },
    )
  })

  it('returns integer dollars for every input', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        expect(Number.isInteger(floorPercent(amount, rate))).toBe(true)
        expect(Number.isInteger(ceilPercent(amount, rate))).toBe(true)
      }),
      { numRuns: 500 },
    )
  })
})

describe('floorPercentSum', () => {
  it('equals one exact application of the summed rate, never a chain of floors', () => {
    fc.assert(
      fc.property(arbAmount, fc.array(arbRate, { minLength: 1, maxLength: 4 }), (amount, rates) => {
        const summed = rates.reduce((t, r) => t + Math.round(r * 10_000), 0) / 10_000
        expect(floorPercentSum(amount, rates)).toBe(exact(amount, summed, 'floor'))
      }),
      { numRuns: 1_000 },
    )
  })

  it('reproduces the laundering bug that motivated it', () => {
    // 0.25 + 0.05 * 2 is 0.35000000000000003, which floors $1,000 to $649 under a
    // chain of independent Math.floor(a * b) calls. floorPercentSum sums the rates in
    // exact basis points BEFORE applying them once, so it does not repeat the bug.
    expect(floorPercentSum(1_000, [0.25, 0.05, 0.05])).toBe(350)
  })
})
