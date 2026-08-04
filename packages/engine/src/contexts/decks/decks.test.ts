import { describe, it, expect } from 'vitest'
import { reduce, replay } from '../../core/reduce.js'
import type { GameEvent } from '../../core/events.js'
import { activeModifiers, cardAt, rentMultiplier } from './index.js'
import { baseState, CONFIG } from './decks.fixture.js'

const ERA_I_ORDER = [...Array(20).keys()]
const ERA_II_ORDER = [...Array(20).keys()]

describe('deck reducer', () => {
  it('records the shuffle order at era start and never shuffles itself', () => {
    const order = [3, 0, 19, 7, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    const s = reduce(baseState({ round: 1 }), { type: 'DeckShuffled', era: 1, order })
    expect(s.decks[1].order).toEqual(order)
    expect(s.decks[1].drawn).toBe(0)
  })

  it('draws by index into the recorded order, not by position in the authored deck', () => {
    const order = [...ERA_I_ORDER].reverse()
    let s = reduce(baseState({ round: 1 }), { type: 'DeckShuffled', era: 1, order })
    s = reduce(s, { type: 'CardDrawn', era: 1, index: 0, player: 'P2' })
    expect(cardAt(1, order[0] ?? 0).id).toBe('E1-20')
    expect(s.decks[1].drawn).toBe(1)
  })

  it('applies E1-08 as a timed rent modifier expiring at the end of the next round', () => {
    let s = reduce(baseState({ round: 3 }), { type: 'DeckShuffled', era: 1, order: ERA_I_ORDER })
    s = reduce(s, { type: 'CardDrawn', era: 1, index: 7, player: 'P1' }) // E1-08
    expect(cardAt(1, 7).id).toBe('E1-08')
    expect(activeModifiers(s)).toHaveLength(1)
    expect(rentMultiplier(s, 'baltic-avenue')).toBeCloseTo(1.5) // brown
    expect(rentMultiplier(s, 'boardwalk')).toBe(1) // dark-blue, unaffected
    expect(activeModifiers(s)[0]?.expiry).toEqual({ boundary: 'round', round: 4 })
  })

  it('composes two rent modifiers multiplicatively in card-draw order', () => {
    // era-decks 6.2: rent modifiers compose multiplicatively against base rent,
    // applied in card-draw order, with a single round-down at the end.
    let s = reduce(baseState({ round: 7, era: 2 }), { type: 'DeckShuffled', era: 2, order: ERA_II_ORDER })
    s = reduce(s, { type: 'CardDrawn', era: 2, index: 1, player: 'P1' })  // E2-02 all +25%
    expect(cardAt(2, 1).id).toBe('E2-02')
    s = reduce(s, { type: 'CardDrawn', era: 2, index: 13, player: 'P1' }) // E2-14 blue/green x2
    expect(cardAt(2, 13).id).toBe('E2-14')
    expect(rentMultiplier(s, 'boardwalk')).toBeCloseTo(2.5) // dark-blue: 1.25 x 2
    expect(rentMultiplier(s, 'baltic-avenue')).toBeCloseTo(1.25) // brown: 1.25 only
  })

  it('accumulates rent counters by receipt, per era-decks 6.11', () => {
    let s = baseState({ round: 4 })
    const events: GameEvent[] = [
      { type: 'RentCharged', from: 'P2', to: 'P1', deed: 'boardwalk', amount: 200 },
    ]
    s = events.reduce(reduce, s)
    expect(s.cardEffects.counters.rentReceivedThisEra.P1).toBe(200)
    expect(s.cardEffects.counters.rentReceivedThisGame.P1).toBe(200)
    expect(s.cardEffects.counters.rentReceivedThisEra.P2).toBe(0)
  })

  it('resets the era counter but not the game counter on EraAdvanced', () => {
    let s = baseState({ round: 6 })
    s = reduce(s, { type: 'RentCharged', from: 'P2', to: 'P1', deed: 'boardwalk', amount: 200 })
    s = reduce(s, { type: 'EraAdvanced', era: 2 })
    expect(s.cardEffects.counters.rentReceivedThisEra.P1).toBe(0)
    expect(s.cardEffects.counters.rentReceivedThisGame.P1).toBe(200)
  })

  it('records DeckReordered without shuffling — only the drawn head permutes (E3-05)', () => {
    let s = reduce(baseState({ round: 13, era: 3 }), {
      type: 'DeckShuffled', era: 3, order: [...Array(20).keys()],
    })
    s = reduce(s, { type: 'DeckReordered', era: 3, order: [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], player: 'P1' })
    expect(s.decks[3].order.slice(0, 3)).toEqual([2, 0, 1])
    expect(s.decks[3].drawn).toBe(0)
  })

})

describe('replay determinism', () => {
  it('produces the identical state as an incremental reduce over the same events', () => {
    const events: GameEvent[] = [
      { type: 'GameCreated', config: CONFIG },
      { type: 'PhaseAdvanced', phase: 'movement' },
      { type: 'DeckShuffled', era: 1, order: ERA_I_ORDER },
      { type: 'CardDrawn', era: 1, index: 2, player: 'P1' },
      { type: 'CardDrawn', era: 1, index: 14, player: 'P3' },
    ]
    const viaReplay = replay(events)
    const [, ...rest] = events
    let incremental = replay([events[0] as GameEvent])
    for (const e of rest) incremental = reduce(incremental, e)
    expect(viaReplay).toEqual(incremental)
  })
})
