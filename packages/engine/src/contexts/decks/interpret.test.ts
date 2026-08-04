import { describe, it, expect } from 'vitest'
import { applyCard, evalAmount, isBriberyCancellable } from './interpret.js'
import type { Amount } from './effects.js'
import { PLAYER_IDS } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import { fixtureMidGame } from './decks.fixture.js'
import { cardById } from './cards/index.js'

/** spec section 20's conserved identity: sum(cleanCash) - sum(drawnCredit) -
 * sum(distressedDebt) + treasury. Dirty cash is deliberately excluded — it is worth
 * $0 at scoring and is created/destroyed with no counterparty by design. */
function cleanMoneyTotal(state: GameState): number {
  return PLAYER_IDS.reduce((sum, id) => {
    const p = state.players[id]
    return sum + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, state.treasury)
}

describe('evalAmount', () => {
  const s = fixtureMidGame()

  it('sums weighted metric terms and floors the result (E1-07 shape)', () => {
    // P2: 2 houses, 1 hotel -> 2*25 + 1*125 = 175, capped at 100.
    const a: Amount = {
      kind: 'sum',
      terms: [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 125 }],
      cap: 100,
    }
    expect(evalAmount(s, 'P2', a)).toBe(100)
  })

  it('floors a fractional weighted term', () => {
    const a: Amount = { kind: 'sum', terms: [{ metric: 'one', rate: 33.7 }] }
    expect(evalAmount(s, 'P1', a)).toBe(33)
  })

  it('clamps to the clamp metrics so E1-14 never creates distressed debt', () => {
    // P4 holds $80 clean and owes $400 drawn. The card says repay $150 or all cash held.
    const a: Amount = {
      kind: 'sum',
      terms: [{ metric: 'one', rate: 150 }],
      clampTo: ['clean-cash', 'drawn-credit'],
    }
    expect(evalAmount(s, 'P4', a)).toBe(80)
  })

  it('never returns a negative amount', () => {
    const a: Amount = { kind: 'sum', terms: [{ metric: 'one', rate: -500 }] }
    expect(evalAmount(s, 'P1', a)).toBe(0)
  })

  it('branches on a player predicate (E4-18 shape)', () => {
    const a: Amount = {
      kind: 'branch',
      when: {
        kind: 'all-of',
        of: [
          { kind: 'metric-at-most', metric: 'drawn-credit', value: 0 },
          { kind: 'metric-at-most', metric: 'distressed-debt', value: 0 },
        ],
      },
      then: { kind: 'sum', terms: [{ metric: 'one', rate: 600 }] },
      otherwise: { kind: 'sum', terms: [{ metric: 'one', rate: 300 }] },
    }
    expect(evalAmount(s, 'P1', a)).toBe(600) // P1 is unlevered
    expect(evalAmount(s, 'P4', a)).toBe(300) // P4 is drawn
  })
})

describe('money operations and conservation (era-decks.md hard rules)', () => {
  it('pays the Treasury and keeps money conserved (E1-04)', () => {
    const s0 = fixtureMidGame() // P3 holds one mortgaged deed
    const before = cleanMoneyTotal(s0)
    const s1 = applyCard(s0, cardById('E1-04'), 'P3')
    expect(s0.players.P3.cleanCash - s1.players.P3.cleanCash).toBe(50)
    expect(s1.treasury - s0.treasury).toBe(50)
    expect(cleanMoneyTotal(s1)).toBe(before)
  })

  it('never drives clean cash below zero; the shortfall capitalises into drawn credit, '
    + 'never distressed debt (Task 18 hard rule)', () => {
    const s0 = fixtureMidGame() // P4 holds two mortgaged deeds: $100 due, $80 clean cash
    const before = cleanMoneyTotal(s0)
    const s1 = applyCard(s0, cardById('E1-04'), 'P4')
    expect(s1.players.P4.cleanCash).toBe(0)
    expect(s1.players.P4.drawnCredit).toBe(420)
    expect(s1.players.P4.distressedDebt).toBe(0)
    expect(s1.treasury - s0.treasury).toBe(100)
    expect(cleanMoneyTotal(s1)).toBe(before)
  })

  it('moves money between two dynamically selected players with no Treasury leg (E1-18)', () => {
    const s0 = fixtureMidGame()
    const withRent: GameState = {
      ...s0,
      cardEffects: {
        ...s0.cardEffects,
        counters: {
          ...s0.cardEffects.counters,
          rentReceivedThisEra: { P1: 0, P2: 300, P3: 0, P4: 0 },
        },
      },
    }
    const before = cleanMoneyTotal(withRent)
    const s1 = applyCard(withRent, cardById('E1-18'), 'P4')
    expect(withRent.players.P2.cleanCash - s1.players.P2.cleanCash).toBe(100) // highest collector
    expect(s1.players.P1.cleanCash - withRent.players.P1.cleanCash).toBe(100) // lowest collector
    expect(s1.treasury).toBe(withRent.treasury)
    expect(cleanMoneyTotal(s1)).toBe(before)
  })

  it('runs the fallback clause when the primary target matches nobody (E1-14)', () => {
    const s0: GameState = {
      ...fixtureMidGame(),
      players: {
        ...fixtureMidGame().players,
        P4: { ...fixtureMidGame().players.P4, drawnCredit: 0 },
      },
    }
    const s1 = applyCard(s0, cardById('E1-14'), 'P2')
    expect(s1.players.P2.cleanCash - s0.players.P2.cleanCash).toBe(100)
  })

  it('preserves the conservation identity for a representative Era II card (E2-06, dirty cash)', () => {
    const s0 = fixtureMidGame()
    const before = cleanMoneyTotal(s0)
    const s1 = applyCard(s0, cardById('E2-06'), 'P1')
    // Dirty cash is created from nothing and is outside the conserved identity.
    expect(s1.players.P1.dirtyCash - s0.players.P1.dirtyCash).toBe(200)
    expect(s1.players.P1.heat - s0.players.P1.heat).toBe(1)
    expect(cleanMoneyTotal(s1)).toBe(before)
  })

  it('preserves the conservation identity for a representative Era III card (E3-18, '
    + 'applying credit to distressed debt first)', () => {
    const s0: GameState = {
      ...fixtureMidGame(),
      players: {
        ...fixtureMidGame().players,
        P4: { ...fixtureMidGame().players.P4, distressedDebt: 50 },
      },
    }
    const before = cleanMoneyTotal(s0)
    const s1 = applyCard(s0, cardById('E3-18'), 'P1') // P4 has the lowest net worth
    expect(s1.players.P4.distressedDebt).toBe(0)
    expect(s1.players.P4.cleanCash - s0.players.P4.cleanCash).toBe(350)
    expect(cleanMoneyTotal(s1)).toBe(before)
  })

  it('preserves the conservation identity for a representative Era IV card (E4-08, audit)', () => {
    const s0: GameState = {
      ...fixtureMidGame(),
      players: {
        ...fixtureMidGame().players,
        P2: { ...fixtureMidGame().players.P2, heat: 6, dirtyCash: 100 },
      },
    }
    const before = cleanMoneyTotal(s0)
    const s1 = applyCard(s0, cardById('E4-08'), 'P1')
    expect(s1.players.P2.heat).toBe(0)
    expect(s1.players.P2.dirtyCash).toBe(0) // seized, destroyed, outside the identity
    expect(cleanMoneyTotal(s1)).toBe(before)
  })
})

describe('bribery cancellation (Task 13 cardCancelled)', () => {
  it('cancels a single-target card and consumes the flag', () => {
    const s0: GameState = {
      ...fixtureMidGame(),
      players: {
        ...fixtureMidGame().players,
        P2: { ...fixtureMidGame().players.P2, cardCancelled: true },
      },
    }
    expect(isBriberyCancellable(s0, cardById('E1-15'), 'P2')).toBe(true) // drawer-only card
    const s1 = applyCard(s0, cardById('E1-15'), 'P2')
    expect(s1.players.P2.cleanCash).toBe(s0.players.P2.cleanCash) // no $200 collected
    expect(s1.players.P2.cardCancelled).toBe(false) // consumed
  })

  it('cannot cancel a card that targets all players', () => {
    expect(isBriberyCancellable(fixtureMidGame(), cardById('E1-03'), 'P1')).toBe(false)
    const s0: GameState = {
      ...fixtureMidGame(),
      players: {
        ...fixtureMidGame().players,
        P1: { ...fixtureMidGame().players.P1, cardCancelled: true },
      },
    }
    const s1 = applyCard(s0, cardById('E1-03'), 'P1')
    expect(s1.players.P1.cleanCash - s0.players.P1.cleanCash).toBe(75) // still collects
  })
})
