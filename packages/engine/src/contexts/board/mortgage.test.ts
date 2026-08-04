import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import { floorPercent } from '../../core/money.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, DiceRoll } from '../../core/types.js'
import { borrowingBase, carryingCostFor } from '../credit/index.js'
import {
  NO_PROPERTY_ENCUMBRANCES, decideProperty, type PropertyCommand, type PropertyPorts,
} from './decide-property.js'
import { unmortgageCost } from './property.js'
import {
  LIGHT_BLUE, RAILROADS, applyAll, conserved, eventsOf, openState, own, rejectionOf,
  setPlayer,
} from './property.fixture.js'
import { ownsWholeGroup, rentDue } from './rent.js'

const ROLL: DiceRoll = [3, 4]

function mortgage(deed: DeedId): PropertyCommand {
  return { type: 'MortgageDeed', player: 'P1', deed }
}

function unmortgage(deed: DeedId): PropertyCommand {
  return { type: 'UnmortgageDeed', player: 'P1', deed }
}

function railroads(): GameState {
  return own(openState(), 'P1', RAILROADS)
}

describe('mortgaging', () => {
  it('pays 50% of face from the Treasury and flips the flag', () => {
    const before = own(openState(), 'P1', ['oriental-avenue'])
    const events = eventsOf(decideProperty(before, mortgage('oriental-avenue')))
    expect(events).toEqual([
      { type: 'DeedMortgaged', player: 'P1', deed: 'oriental-avenue', proceeds: 50 },
    ])
    expect(floorPercent(100, ECONOMY.MORTGAGE_RATE)).toBe(50)
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(true)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
    expect(after.treasury).toBe(-50)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to mortgage a deed that carries buildings (spec 19.6)', () => {
    const built = own(
      own(openState(), 'P1', LIGHT_BLUE), 'P1', ['oriental-avenue'], { houses: 1 },
    )
    expect(rejectionOf(decideProperty(built, mortgage('oriental-avenue'))).code)
      .toBe('DEED_DEVELOPED')
  })

  it('refuses to mortgage an undeveloped sibling of a developed group', () => {
    // Buildings may only ever sit on a group that is wholly owned and wholly
    // unmortgaged, so the whole group has to be stripped before any of it mortgages.
    const built = own(
      own(openState(), 'P1', LIGHT_BLUE), 'P1', ['oriental-avenue'], { houses: 1 },
    )
    const rejection = rejectionOf(decideProperty(built, mortgage('connecticut-avenue')))
    expect(rejection.code).toBe('DEED_DEVELOPED')
    expect(rejection.message).toContain('light-blue')

    const stripped = applyAll(built, eventsOf(decideProperty(
      built, { type: 'SellHouse', player: 'P1', deed: 'oriental-avenue' },
    )))
    expect(eventsOf(decideProperty(stripped, mortgage('connecticut-avenue'))))
      .toHaveLength(1)
  })

  it('drops the other three railroads from $200 to $100', () => {
    const before = railroads()
    for (const id of RAILROADS) expect(rentDue(before, id, ROLL)).toBe(200)

    const after = applyAll(
      before, eventsOf(decideProperty(before, mortgage('b-and-o-railroad'))),
    )
    expect(rentDue(after, 'reading-railroad', ROLL)).toBe(100)
    expect(rentDue(after, 'pennsylvania-railroad', ROLL)).toBe(100)
    expect(rentDue(after, 'short-line', ROLL)).toBe(100)
    // The mortgaged railroad itself collects nothing, which is also what makes
    // spec 19.9 true: an Escort or Chop Shop bonus on it computes to zero.
    expect(rentDue(after, 'b-and-o-railroad', ROLL)).toBe(0)
  })

  it('breaks colour-group doubling and stops the carrying cost', () => {
    const before = own(openState(), 'P1', LIGHT_BLUE)
    expect(ownsWholeGroup(before, 'light-blue', 'P1')).toBe(true)
    expect(rentDue(before, 'oriental-avenue', ROLL)).toBe(12)
    expect(carryingCostFor(before, 'P1')).toBe(3 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(borrowingBase(before, 'P1')).toBe(floorPercent(320, ECONOMY.DEED_ADVANCE_RATE))

    const after = applyAll(
      before, eventsOf(decideProperty(before, mortgage('connecticut-avenue'))),
    )
    expect(ownsWholeGroup(after, 'light-blue', 'P1')).toBe(false)
    expect(rentDue(after, 'oriental-avenue', ROLL)).toBe(6)
    expect(rentDue(after, 'connecticut-avenue', ROLL)).toBe(0)
    expect(carryingCostFor(after, 'P1')).toBe(2 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(borrowingBase(after, 'P1')).toBe(floorPercent(200, ECONOMY.DEED_ADVANCE_RATE))
  })

  it('refuses to mortgage twice', () => {
    const already = own(openState(), 'P1', ['oriental-avenue'], { mortgaged: true })
    expect(rejectionOf(decideProperty(already, mortgage('oriental-avenue'))).code)
      .toBe('DEED_MORTGAGED')
  })
})

describe('encumbrances on a mortgage', () => {
  const LOCKED: PropertyPorts = {
    makeWholeOnMortgage: () => [],
    assertDeedTransferable: () => reject(
      'DEED_ENCUMBERED',
      'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
    ),
  }

  it('refuses when an outstanding deed option locks the deed', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    expect(rejectionOf(decideProperty(state, mortgage('oriental-avenue'), LOCKED)).code)
      .toBe('DEED_ENCUMBERED')
  })

  it('values the make-whole before the mortgage but sequences it after', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    const ports: PropertyPorts = {
      makeWholeOnMortgage: (s, deed) => {
        // Spec section 6: a mortgaged deed collects no rent and would value at zero,
        // so the contract must be marked against the pre-mortgage state.
        expect(s.deeds[deed]?.mortgaged).toBe(false)
        return [
          { type: 'RentFutureMadeWhole', id: 'F1', amount: 40 },
          { type: 'RentFutureExpired', id: 'F1' },
        ]
      },
      assertDeedTransferable: () => null,
    }
    // The proceeds land first so the owner has the cash the make-whole is measured against.
    expect(eventsOf(decideProperty(state, mortgage('oriental-avenue'), ports))).toEqual([
      { type: 'DeedMortgaged', player: 'P1', deed: 'oriental-avenue', proceeds: 50 },
      { type: 'RentFutureMadeWhole', id: 'F1', amount: 40 },
      { type: 'RentFutureExpired', id: 'F1' },
    ])
  })

  it('defaults to no encumbrances when no ports are supplied', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    expect(decideProperty(state, mortgage('oriental-avenue')))
      .toEqual(decideProperty(state, mortgage('oriental-avenue'), NO_PROPERTY_ENCUMBRANCES))
  })
})

describe('unmortgaging', () => {
  it('costs 55% of face, floored, and pays the Treasury', () => {
    const before = own(openState(), 'P1', ['oriental-avenue'], { mortgaged: true })
    const events = eventsOf(decideProperty(before, unmortgage('oriental-avenue')))
    expect(events).toEqual([
      { type: 'DeedUnmortgaged', player: 'P1', deed: 'oriental-avenue', cost: 55 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(false)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 55)
    expect(after.treasury).toBe(55)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('floors the half-dollar cases rather than rounding them up', () => {
    const state = own(openState(), 'P1', ['park-place'], { mortgaged: true })
    const deed = state.deeds['park-place']
    expect(deed).toBeDefined()
    // 350 x 0.55 is 192.5. The player pays 192.
    expect(deed === undefined ? -1 : unmortgageCost(deed)).toBe(192)
    expect(floorPercent(350, ECONOMY.UNMORTGAGE_RATE)).toBe(192)
  })

  it('draws capped credit for the shortfall', () => {
    // Boardwalk unmortgaged gives a base of floor(400 x 0.75) = 300.
    const before = setPlayer(
      own(
        own(openState(), 'P1', ['boardwalk']),
        'P1', ['park-place'], { mortgaged: true },
      ),
      'P1', { cleanCash: 100 },
    )
    const events = eventsOf(decideProperty(before, unmortgage('park-place')))
    expect(events).toEqual([
      { type: 'CreditDrawn', player: 'P1', amount: 92 },
      { type: 'DeedUnmortgaged', player: 'P1', deed: 'park-place', cost: 192 },
    ])
    const after = applyAll(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(92)
    expect(after.treasury).toBe(192)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses when the deed being redeemed is the only collateral on offer', () => {
    // A mortgaged deed contributes nothing to the base, so it cannot fund its own
    // redemption. This is deliberate and conservative: you may not borrow against
    // an asset the draw has not yet freed.
    const stuck = setPlayer(
      own(openState(), 'P1', ['park-place'], { mortgaged: true }),
      'P1', { cleanCash: 0 },
    )
    expect(rejectionOf(decideProperty(stuck, unmortgage('park-place'))).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
  })

  it('refuses to unmortgage a deed that is not mortgaged', () => {
    const clear = own(openState(), 'P1', ['oriental-avenue'])
    expect(rejectionOf(decideProperty(clear, unmortgage('oriental-avenue'))).code)
      .toBe('DEED_UNAVAILABLE')
  })
})
