import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import type { GameState } from '../../core/state.js'
import { decideProperty, type PropertyCommand, type PropertyPorts } from './decide-property.js'
import {
  applyAll, conserved, eventsOf, openState, own, rejectionOf, setPlayer,
} from './property.fixture.js'
import { rentRecipient } from './rent.js'

const LOCKED: PropertyPorts = {
  makeWholeOnMortgage: () => [],
  assertDeedTransferable: (_state, deed) => (deed === 'oriental-avenue'
    ? reject(
      'DEED_ENCUMBERED',
      'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
    )
    : null),
}

/** P1 holds Oriental Avenue, P2 holds St. James Place. */
function twoSided(): GameState {
  return own(own(openState(), 'P1', ['oriental-avenue']), 'P2', ['st-james-place'])
}

function trade(patch: Partial<Extract<PropertyCommand, { type: 'TradeAssets' }>> = {}):
PropertyCommand {
  return {
    type: 'TradeAssets',
    from: 'P1',
    to: 'P2',
    deedsFrom: [],
    deedsTo: [],
    cashFrom: 0,
    cashTo: 0,
    confirmedBy: ['P1', 'P2'],
    ...patch,
  }
}

describe('trading', () => {
  it('moves deeds and cash both ways as two legs', () => {
    const before = twoSided()
    const events = eventsOf(decideProperty(before, trade({
      deedsFrom: ['oriental-avenue'], deedsTo: ['st-james-place'], cashTo: 60,
    })))
    expect(events).toEqual([
      { type: 'DeedTraded', from: 'P1', to: 'P2', deeds: ['oriental-avenue'], cash: 0 },
      { type: 'DeedTraded', from: 'P2', to: 'P1', deeds: ['st-james-place'], cash: 60 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(after.deeds['st-james-place']?.owner).toBe('P1')
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH - 60)
    expect(after.treasury).toBe(0)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('allows a cash-only trade, which emits one leg', () => {
    const before = openState()
    const events = eventsOf(decideProperty(before, trade({ cashFrom: 200 })))
    expect(events).toEqual([
      { type: 'DeedTraded', from: 'P1', to: 'P2', deeds: [], cash: 200 },
    ])
    const after = applyAll(before, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 200)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('carries an encumbrance to the new owner untouched', () => {
    const before: GameState = {
      ...twoSided(),
      futures: [{
        id: 'F1', deed: 'oriental-avenue', holder: 'P3', startRound: 1, endRound: 5,
      }],
    }
    expect(rentRecipient(before, 'oriental-avenue')).toBe('P3')
    const after = applyAll(before, eventsOf(decideProperty(
      before, trade({ deedsFrom: ['oriental-avenue'], cashTo: 100 }),
    )))
    // Spec section 6: contracts follow the deed. The future references the deed and
    // not its owner, so no code in this task has to do anything for that to hold.
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(rentRecipient(after, 'oriental-avenue')).toBe('P3')
  })

  it('trades a mortgaged deed, which stays mortgaged', () => {
    const before = own(twoSided(), 'P1', ['oriental-avenue'], { mortgaged: true })
    const after = applyAll(before, eventsOf(decideProperty(
      before, trade({ deedsFrom: ['oriental-avenue'] }),
    )))
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(true)
  })
})

describe('trades that must be refused', () => {
  it('refuses a deed with an outstanding deed option', () => {
    const rejection = rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'] }), LOCKED,
    ))
    expect(rejection.code).toBe('DEED_ENCUMBERED')
    // The writer is locked; the same deed on the other leg is unaffected.
    expect(eventsOf(decideProperty(
      twoSided(), trade({ deedsTo: ['st-james-place'] }), LOCKED,
    ))).toHaveLength(1)
  })

  it('refuses a deed with buildings on it', () => {
    const built = own(
      own(openState(), 'P1', ['oriental-avenue', 'vermont-avenue', 'connecticut-avenue']),
      'P1', ['oriental-avenue'], { houses: 1 },
    )
    expect(rejectionOf(decideProperty(built, trade({ deedsFrom: ['oriental-avenue'] }))).code)
      .toBe('DEED_DEVELOPED')
  })

  it('refuses self-dealing', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ to: 'P1', deedsFrom: ['oriental-avenue'] }),
    )).code).toBe('SELF_DEALING')
  })

  it('refuses until both sides confirm', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], confirmedBy: ['P1'] }),
    )).code).toBe('TRADE_NOT_CONFIRMED')
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], confirmedBy: ['P2'] }),
    )).code).toBe('TRADE_NOT_CONFIRMED')
  })

  it('refuses a deed the giver does not own', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['st-james-place'] }),
    )).code).toBe('NOT_OWNER')
  })

  it('refuses the same deed listed on both legs', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], deedsTo: ['oriental-avenue'] }),
    )).code).toBe('DEED_UNAVAILABLE')
  })

  it('refuses cash a side does not hold in clean cash', () => {
    const poor = setPlayer(twoSided(), 'P2', { cleanCash: 10 })
    const rejection = rejectionOf(decideProperty(
      poor, trade({ deedsFrom: ['oriental-avenue'], cashTo: 500 }),
    ))
    // Trades do not auto-draw; the buyer draws credit first, as its own command.
    expect(rejection.code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses negative or fractional cash', () => {
    expect(rejectionOf(decideProperty(twoSided(), trade({ cashFrom: -50 }))).code)
      .toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(decideProperty(twoSided(), trade({ cashFrom: 12.5 }))).code)
      .toBe('NEGATIVE_AMOUNT')
  })

  it('refuses an empty trade and a trade outside the Open phase', () => {
    expect(rejectionOf(decideProperty(twoSided(), trade())).code).toBe('DEED_UNAVAILABLE')
    expect(rejectionOf(decideProperty(
      { ...twoSided(), phase: 'settlement' },
      trade({ deedsFrom: ['oriental-avenue'] }),
    )).code).toBe('WRONG_PHASE')
  })
})
