import { describe, it, expect } from 'vitest'
import { ECONOMY } from './economy.js'
import { assertEconomyInvariants } from './assertions.js'

describe('economy invariants', () => {
  it('passes for the shipped configuration', () => {
    expect(() => assertEconomyInvariants()).not.toThrow()
  })

  it('keeps the liquidation floor strictly above the deed advance rate', () => {
    // Selling a deed raises floor x face but removes advance x face from the base.
    // A floor at or below the advance rate makes every forced sale WIDEN the shortfall,
    // so liquidation only terminates by consuming the entire portfolio. Spec section 5.
    expect(ECONOMY.LIQUIDATION_FLOOR).toBeGreaterThan(ECONOMY.DEED_ADVANCE_RATE)
  })

  it('keeps the building advance rate at or below the sellback rate', () => {
    // Stripping buildings returns SELLBACK x cost in cash and removes ADVANCE x cost
    // from the base. Advancing more than sellback returns widens the shortfall too.
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBeLessThanOrEqual(ECONOMY.BUILDING_SELLBACK_RATE)
  })

  it('names the offending constants when an invariant is broken', () => {
    expect(() => assertEconomyInvariants({
      ...ECONOMY, LIQUIDATION_FLOOR: 0.7,
    })).toThrow(/LIQUIDATION_FLOOR.*DEED_ADVANCE_RATE/)
    expect(() => assertEconomyInvariants({
      ...ECONOMY, BUILDING_ADVANCE_RATE: 0.6,
    })).toThrow(/BUILDING_ADVANCE_RATE.*BUILDING_SELLBACK_RATE/)
  })

  it('keeps the note-mark leverage cap below the ratings leverage cap', () => {
    expect(ECONOMY.LOAN_NOTE_MAX_LEVERAGE).toBeLessThanOrEqual(ECONOMY.RATING_MAX_LEVERAGE)
  })

  it('rejects a note-mark cap above the ratings cap, by name', () => {
    expect(() => assertEconomyInvariants({
      ...ECONOMY, LOAN_NOTE_MAX_LEVERAGE: 6,
    })).toThrow(/LOAN_NOTE_MAX_LEVERAGE.*RATING_MAX_LEVERAGE/)
  })

  it('divides the game into whole eras', () => {
    expect(ECONOMY.TOTAL_ROUNDS % ECONOMY.ROUNDS_PER_ERA).toBe(0)
    expect(ECONOMY.TOTAL_ROUNDS / ECONOMY.ROUNDS_PER_ERA).toBe(4)
  })

  it('rejects an uneven era split, by name', () => {
    expect(() => assertEconomyInvariants({
      ...ECONOMY, TOTAL_ROUNDS: 25,
    })).toThrow(/TOTAL_ROUNDS/)
  })
})
