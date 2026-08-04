import { describe, it, expect } from 'vitest'
import { floorPercent, ceilPercent, floorPercentSum } from './money.js'

describe('floorPercent', () => {
  it('is exact where naive float arithmetic is not', () => {
    // Math.floor(180 * 0.7) === 125 — 180 * 0.7 is 125.99999999999999
    expect(floorPercent(180, 0.7)).toBe(126)
    expect(floorPercent(350, 0.7)).toBe(245)
  })

  it('handles the rates the ruleset actually uses', () => {
    expect(floorPercent(200, 0.5)).toBe(100)   // mortgage
    expect(floorPercent(200, 0.55)).toBe(110)  // unmortgage
    expect(floorPercent(400, 0.8)).toBe(320)   // liquidation floor
    expect(floorPercent(100, 0.9)).toBe(90)    // house cost multiplier
  })
})

describe('floorPercentSum', () => {
  it('accumulates rates without float drift', () => {
    // 0.25 + 0.05 * 2 === 0.35000000000000003, which floors $1000 to $649
    expect(floorPercentSum(1000, [0.25, 0.05, 0.05])).toBe(350)
  })
})

describe('ceilPercent', () => {
  it('rounds up exactly', () => {
    expect(ceilPercent(180, 0.7)).toBe(126)
    expect(ceilPercent(101, 0.5)).toBe(51)
  })
})
