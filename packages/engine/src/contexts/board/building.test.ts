import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { GameState } from '../../core/state.js'
import type { DeedId } from '../../core/types.js'
import { decideProperty, type PropertyCommand } from './decide-property.js'
import {
  LIGHT_BLUE, applyAll, conserved, eventsOf, openState, own, placed, rejectionOf,
  setPlayer,
} from './property.fixture.js'

function build(deed: DeedId): PropertyCommand {
  return { type: 'BuildHouse', player: 'P1', deed }
}

function sell(deed: DeedId): PropertyCommand {
  return { type: 'SellHouse', player: 'P1', deed }
}

/** P1 owns the whole light-blue group, unmortgaged and undeveloped. */
function grouped(): GameState {
  return own(openState(), 'P1', LIGHT_BLUE)
}

function doBuild(state: GameState, deed: DeedId): GameState {
  return applyAll(state, eventsOf(decideProperty(state, build(deed))))
}

describe('building', () => {
  it('charges the 90%-of-standard house cost to the Treasury', () => {
    const before = grouped()
    const events = eventsOf(decideProperty(before, build('oriental-avenue')))
    expect(events).toEqual([
      { type: 'HouseBuilt', player: 'P1', deed: 'oriental-avenue', cost: 45 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.houses).toBe(1)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 45)
    expect(after.treasury).toBe(45)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 1)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to build without the whole colour group', () => {
    const partial = own(openState(), 'P1', ['oriental-avenue', 'vermont-avenue'])
    expect(rejectionOf(decideProperty(partial, build('oriental-avenue'))).code)
      .toBe('INCOMPLETE_COLOUR_GROUP')
  })

  it('refuses to build when a group member is mortgaged', () => {
    const broken = own(grouped(), 'P1', ['connecticut-avenue'], { mortgaged: true })
    expect(rejectionOf(decideProperty(broken, build('oriental-avenue'))).code)
      .toBe('INCOMPLETE_COLOUR_GROUP')
  })

  it('refuses to develop railroads and utilities', () => {
    const rails = own(openState(), 'P1', [
      'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
    ])
    expect(rejectionOf(decideProperty(rails, build('reading-railroad'))).code)
      .toBe('NOT_BUILDABLE')
  })

  it('refuses a second house before its siblings have their first', () => {
    const one = doBuild(grouped(), 'oriental-avenue')
    expect(rejectionOf(decideProperty(one, build('oriental-avenue'))).code)
      .toBe('UNEVEN_BUILD')
    expect(eventsOf(decideProperty(one, build('vermont-avenue')))).toHaveLength(1)
  })

  it('refuses to sell from a deed that is behind its siblings', () => {
    // 1/1/1, then a second on oriental gives 2/1/1.
    let state = grouped()
    for (const id of LIGHT_BLUE) state = doBuild(state, id)
    state = doBuild(state, 'oriental-avenue')
    expect(state.deeds['oriental-avenue']?.houses).toBe(2)
    expect(rejectionOf(decideProperty(state, sell('vermont-avenue'))).code)
      .toBe('UNEVEN_BUILD')
    expect(eventsOf(decideProperty(state, sell('oriental-avenue')))).toHaveLength(1)
  })

  it('sells back at half the price paid, floored, and returns the house', () => {
    const before = doBuild(grouped(), 'oriental-avenue')
    const events = eventsOf(decideProperty(before, sell('oriental-avenue')))
    // floor(45 * 0.5) is 22, not 23. The rate goes through floorPercent, never raw.
    expect(events).toEqual([
      { type: 'HouseSold', player: 'P1', deed: 'oriental-avenue', proceeds: 22 },
    ])
    expect(floorPercent(45, ECONOMY.BUILDING_SELLBACK_RATE)).toBe(22)
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.houses).toBe(0)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 45 + 22)
    expect(after.treasury).toBe(45 - 22)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to sell from an undeveloped deed', () => {
    expect(rejectionOf(decideProperty(grouped(), sell('oriental-avenue'))).code)
      .toBe('DEED_UNAVAILABLE')
  })
})

describe('the table supply', () => {
  it('stops a build dead when the last house is gone', () => {
    const before = { ...grouped(), housesRemaining: 1 }
    const one = doBuild(before, 'oriental-avenue')
    expect(one.housesRemaining).toBe(0)
    expect(rejectionOf(decideProperty(one, build('vermont-avenue'))).code)
      .toBe('NO_HOUSES_REMAINING')
    // Hoarding is a legitimate strategy: the block is on supply, not on money.
    expect(one.players.P1.cleanCash).toBeGreaterThan(1000)
  })

  it('returns four houses and consumes one hotel when a hotel goes up', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    expect(state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12)
    expect(placed(state)).toEqual({ houses: 12, hotels: 0 })

    const hotel = doBuild(state, 'oriental-avenue')
    expect(hotel.deeds['oriental-avenue']?.houses).toBe(5)
    expect(hotel.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12 + 4)
    expect(hotel.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY - 1)
    expect(placed(hotel)).toEqual({ houses: 8, hotels: 1 })
    // The supply is fixed. A house destroyed rather than returned is a bug.
    expect(placed(hotel).houses + hotel.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(placed(hotel).hotels + hotel.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
    // The $45 left the player and arrived in the Treasury, which is inside the pool.
    expect(conserved(hotel)).toBe(conserved(state))
  })

  it('takes four houses back out of the supply when a hotel comes down', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const hotel = doBuild(state, 'oriental-avenue')
    const sold = applyAll(hotel, eventsOf(decideProperty(hotel, sell('oriental-avenue'))))
    expect(sold.deeds['oriental-avenue']?.houses).toBe(4)
    expect(sold.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12)
    expect(sold.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
    expect(placed(sold).houses + sold.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
  })

  it('refuses to break a hotel the bank cannot re-house', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const hotel = { ...doBuild(state, 'oriental-avenue'), housesRemaining: 3 }
    expect(rejectionOf(decideProperty(hotel, sell('oriental-avenue'))).code)
      .toBe('NO_HOUSES_REMAINING')
  })

  it('refuses a hotel when the bank has none left', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const dry = { ...state, hotelsRemaining: 0 }
    expect(rejectionOf(decideProperty(dry, build('oriental-avenue'))).code)
      .toBe('NO_HOTELS_REMAINING')
  })
})

describe('paying for a build', () => {
  it('draws the shortfall on the credit line, capped at the base', () => {
    // Light blue faces 100 + 100 + 120 = 320; the base is floor(320 x 0.75) = 240.
    const poor = setPlayer(grouped(), 'P1', { cleanCash: 10 })
    const events = eventsOf(decideProperty(poor, build('oriental-avenue')))
    expect(events).toEqual([
      { type: 'CreditDrawn', player: 'P1', amount: 35 },
      { type: 'HouseBuilt', player: 'P1', deed: 'oriental-avenue', cost: 45 },
    ])
    const after = applyAll(poor, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(35)
    expect(after.treasury).toBe(45)
    expect(conserved(after)).toBe(conserved(poor))
  })

  it('refuses outright past the base and never capitalises', () => {
    const stretched = setPlayer(grouped(), 'P1', { cleanCash: 0, drawnCredit: 240 })
    const rejection = rejectionOf(decideProperty(stretched, build('oriental-avenue')))
    expect(rejection.code).toBe('INSUFFICIENT_BORROWING_BASE')
    // Building is voluntary. Only automatic obligations capitalise uncapped (spec 19.8).
    expect(rejection.message).toContain('45')
  })

  it('refuses a build outside the Open phase, and by a non-owner', () => {
    expect(rejectionOf(decideProperty(
      { ...grouped(), phase: 'movement' }, build('oriental-avenue'),
    )).code).toBe('WRONG_PHASE')
    expect(rejectionOf(decideProperty(
      grouped(), { type: 'BuildHouse', player: 'P2', deed: 'oriental-avenue' },
    )).code).toBe('NOT_OWNER')
  })
})
