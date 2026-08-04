import { describe, it, expect } from 'vitest'
import { STOCHASTIC_EVENTS } from './events.js'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../config/economy.js'

describe('event schema', () => {
  it('names every source of externally-supplied randomness', () => {
    expect([...STOCHASTIC_EVENTS].sort()).toEqual(
      ['AuditChecked', 'DeckShuffled', 'DiceRolled', 'SpeakeasyPlayed'],
    )
  })
})

describe('economy constants', () => {
  it('matches the simulated configuration in spec section 4', () => {
    expect(ECONOMY.STARTING_CASH).toBe(2500)
    expect(ECONOMY.GO_SALARY).toBe(350)
    expect(ECONOMY.CARRYING_COST_PER_DEED).toBe(8)
    expect(ECONOMY.DEED_ADVANCE_RATE).toBe(0.75)
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBe(0.5)
    expect(ECONOMY.TOTAL_ROUNDS).toBe(24)
  })

  it('orders rating bands from best to worst so first match wins', () => {
    const scores = RATING_BANDS.map(([score]) => score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(RATING_FLOOR).toBe('CCC')
  })

  it('keeps liquidation convergent', () => {
    // A forced sale must always NARROW the shortfall. It raises floor x face in
    // cash but removes advance x face from the borrowing base, so a floor below
    // the advance rate widens the gap on every sale and the loop never cures.
    expect(ECONOMY.LIQUIDATION_FLOOR).toBeGreaterThan(ECONOMY.DEED_ADVANCE_RATE)
    // Same class of bug for buildings: they must not advance more than they return.
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBeLessThanOrEqual(ECONOMY.BUILDING_SELLBACK_RATE)
  })

  it('reproduces the worked ratings example from spec section 8', () => {
    // Pool cashflow 1910, senior claim 700, concentration 0.76, leverage 3.8
    const score = (1910 / 700) * (1 - 0.25 * 0.76) / (1 + 0.1 * 3.8)
    const rating = RATING_BANDS.find(([min]) => score >= min)?.[1] ?? RATING_FLOOR
    expect(rating).toBe('AA')
  })
})
