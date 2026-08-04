import { describe, it, expect } from 'vitest'
import { reduce } from './reduce.js'
import { initialState } from '../contexts/session/index.js'
import type { GameConfig, GameState } from './state.js'
import type { GameEvent } from './events.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

/**
 * Priority Zero of Task 19: `core/reduce.ts` previously routed only 8 of the 10
 * context reducers — `reduceUnderworld` and `reduceSecuritization` were never wired
 * in, so venture/Heat/laundering/audit events and pool/tranche/swap events were
 * silently dropped by the root reducer, and `replay(events)` could not reconstruct a
 * state that used any of them. This is the proof that the gap is closed: one
 * representative event per reducer function composed into `reduce`, applied through
 * the ROOT reducer (not the context's own reducer directly), asserting the state
 * changed exactly the way that context's own reducer says it should.
 *
 * This is a round trip through `core/reduce.js`, so a regression that re-drops a
 * reducer from the dispatch chain fails here even if every context's own test suite
 * (which mostly calls its own reducer directly) stays green.
 */
describe('every context reducer is wired into the root reduce()', () => {
  const base: GameState = initialState(CONFIG)

  it('session: PhaseAdvanced moves the phase', () => {
    const event: GameEvent = { type: 'PhaseAdvanced', phase: 'draft' }
    expect(reduce(base, event).phase).toBe('draft')
  })

  it('board: TokenMoved updates the player\'s position', () => {
    const event: GameEvent = { type: 'TokenMoved', player: 'P1', from: 0, to: 7, passedGo: false }
    expect(reduce(base, event).players.P1.position).toBe(7)
  })

  it('board/property: HouseBuilt adds a house and charges the Treasury', () => {
    const event: GameEvent = {
      type: 'HouseBuilt', player: 'P1', deed: 'oriental-avenue', cost: 45,
    }
    const next = reduce(base, event)
    expect(next.deeds['oriental-avenue']?.houses).toBe(1)
    expect(next.players.P1.cleanCash).toBe(base.players.P1.cleanCash - 45)
    expect(next.treasury).toBe(45)
  })

  it('credit: CreditDrawn raises clean cash and the drawn balance together', () => {
    const event: GameEvent = { type: 'CreditDrawn', player: 'P1', amount: 100 }
    const next = reduce(base, event)
    expect(next.players.P1.drawnCredit).toBe(100)
    expect(next.players.P1.cleanCash).toBe(base.players.P1.cleanCash + 100)
  })

  it('credit/peer-loans: PeerLoanOriginated adds the note and moves the principal', () => {
    const event: GameEvent = {
      type: 'PeerLoanOriginated', id: 'l-1', lender: 'P1', borrower: 'P2',
      principal: 200, ratePerRound: 0.1, maturesAtRound: 10, collateral: [],
    }
    const next = reduce(base, event)
    expect(next.loans).toHaveLength(1)
    expect(next.players.P1.cleanCash).toBe(base.players.P1.cleanCash - 200)
    expect(next.players.P2.cleanCash).toBe(base.players.P2.cleanCash + 200)
  })

  it('draft: DraftDeedAwarded transfers a deed and spends the unified budget', () => {
    const event: GameEvent = {
      type: 'DraftDeedAwarded', player: 'P1', deed: 'boardwalk', price: 400, contested: false,
    }
    const next = reduce(base, event)
    expect(next.deeds.boardwalk?.owner).toBe('P1')
    expect(next.players.P1.cleanCash).toBe(base.players.P1.cleanCash - 400)
    expect(next.treasury).toBe(400)
  })

  it('markets: RentFutureOriginated adds the contract and pays the deed\'s owner', () => {
    const owned: GameState = {
      ...base,
      deeds: { ...base.deeds, boardwalk: { ...base.deeds.boardwalk!, owner: 'P1' } },
    }
    const event: GameEvent = {
      type: 'RentFutureOriginated', id: 'f-1', deed: 'boardwalk', holder: 'P2',
      startRound: 2, endRound: 4, price: 100,
    }
    const next = reduce(owned, event)
    expect(next.futures).toHaveLength(1)
    expect(next.players.P2.cleanCash).toBe(owned.players.P2.cleanCash - 100)
    expect(next.players.P1.cleanCash).toBe(owned.players.P1.cleanCash + 100)
  })

  it('markets/deed-options: DeedOptionWritten adds the contract', () => {
    const event: GameEvent = {
      type: 'DeedOptionWritten', id: 'o-1', deed: 'boardwalk', writer: 'P1', holder: 'P2',
      premium: 20, strike: 350, expiry: 6,
    }
    const next = reduce(base, event)
    expect(next.options).toHaveLength(1)
  })

  it('securitization: PoolCreated adds the pool', () => {
    const event: GameEvent = {
      type: 'PoolCreated', id: 'pool-1', originator: 'P1',
      assets: [{ kind: 'rent-future', id: 'f-1' }],
      tranches: [{ kind: 'senior', face: 100, paid: 0, holder: 'P2' }],
    }
    const next = reduce(base, event)
    expect(next.pools).toHaveLength(1)
  })

  it('underworld: HeatChanged raises the player\'s Heat', () => {
    const event: GameEvent = { type: 'HeatChanged', player: 'P1', delta: 2, reason: 'test' }
    expect(reduce(base, event).players.P1.heat).toBe(2)
  })

  it('decks: DeckShuffled records the era\'s shuffle order', () => {
    const event: GameEvent = { type: 'DeckShuffled', era: 1, order: [3, 1, 0, 2] }
    expect(reduce(base, event).decks[1].order).toEqual([3, 1, 0, 2])
  })
})
