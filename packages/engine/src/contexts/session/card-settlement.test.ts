import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../core/events.js'
import type { GameState, Pool, RentFuture } from '../../core/state.js'
import { isRejection, type Rejection } from '../../core/errors.js'
import { reduce, replay } from '../../core/reduce.js'
import { baseState, CONFIG, withPlayer } from '../decks/decks.fixture.js'
import { runFinalSettlement, runSettlement } from './settlement.js'

/**
 * `pendingPoolInjections` and `scheduledPoolTerminations` were written, tested and
 * never read: a card could escrow cash into the Treasury for a pool and schedule that
 * pool to wind down, and Settlement would do neither, forever. These tests drive the
 * real `runSettlement` and assert the money moved and the pool closed.
 */

const NO_INPUT = { auditDice: {}, roundEvents: [] as readonly GameEvent[] }

/** Unwraps a Settlement result, failing loudly on a rejection the test did not expect. */
function out(r: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(r)) throw new Error(`unexpected rejection: ${JSON.stringify(r)}`)
  return r
}

/**
 * The single asset is a rent future whose window is still open at round 7, so the pool
 * is NOT exhausted and step 6's ordinary termination path leaves it alone. That matters:
 * a pool of resolved assets terminates on its own, which would make "the card scheduled
 * it" indistinguishable from "it was going to close anyway".
 */
const FUTURE: RentFuture = {
  id: 'rf-1', deed: 'st-james-place', holder: 'P2', startRound: 5, endRound: 10,
}

function pool(): Pool {
  return {
    id: 'pool-1',
    originator: 'P1',
    assets: [{ kind: 'rent-future', id: 'rf-1' }],
    tranches: [
      { kind: 'senior', face: 500, paid: 0, holder: 'P2' },
      { kind: 'equity', face: 0, paid: 0, holder: 'P1' },
    ],
    terminated: false,
  }
}

function withPool(over: Partial<GameState> = {}): GameState {
  const s = baseState({ phase: 'settlement', ...over })
  return withPlayer(
    { ...s, pools: [pool()], futures: [FUTURE] }, 'P1', { cleanCash: 2000 },
  )
}

describe('pendingPoolInjections reaches the waterfall', () => {
  it('releases card-escrowed cash and distributes it down the tranches', () => {
    const s: GameState = {
      ...withPool(),
      cardEffects: { ...withPool().cardEffects, poolInjections: { 'pool-1': 300 } },
    }
    const events = out(runSettlement(s, NO_INPUT))

    const released = events.find((e) => e.type === 'PoolInjectionReleased')
    expect(released).toEqual({
      type: 'PoolInjectionReleased', poolId: 'pool-1', originator: 'P1', amount: 300,
    })

    // Step 6 must SEE it: the release is emitted by the step before, so it reaches the
    // waterfall only because `fold` now hands each step what earlier steps emitted.
    const paid = events.find((e) => e.type === 'WaterfallPaid')
    expect(paid?.type === 'WaterfallPaid' && paid.collected).toBe(300)
    expect(paid?.type === 'WaterfallPaid' && paid.distributions).toEqual([
      { tranche: 'senior', amount: 300 },
    ])

    // Release strictly precedes distribution.
    expect(events.indexOf(released as GameEvent))
      .toBeLessThan(events.indexOf(paid as GameEvent))
  })

  it('clears the escrow so the next round does not pay it twice', () => {
    const s: GameState = {
      ...withPool(),
      cardEffects: { ...withPool().cardEffects, poolInjections: { 'pool-1': 300 } },
    }
    const after = out(runSettlement(s, NO_INPUT)).reduce(reduce, s)
    expect(after.cardEffects.poolInjections).toEqual({})
    expect(out(runSettlement(after, NO_INPUT)).some(
      (e) => e.type === 'PoolInjectionReleased',
    )).toBe(false)
  })

  it('is money-neutral: Treasury out equals originator in', () => {
    const s: GameState = {
      ...withPool(),
      cardEffects: { ...withPool().cardEffects, poolInjections: { 'pool-1': 300 } },
    }
    const released = out(runSettlement(s, NO_INPUT))
      .filter((e) => e.type === 'PoolInjectionReleased')
    const after = released.reduce(reduce, s)
    expect(after.treasury).toBe(s.treasury - 300)
    expect(after.players.P1.cleanCash).toBe(s.players.P1.cleanCash + 300)
  })
})

describe('scheduledPoolTerminations reaches Settlement', () => {
  it('terminates the scheduled pool and records its shortfalls', () => {
    const s: GameState = {
      ...withPool(),
      cardEffects: {
        ...withPool().cardEffects, scheduledPoolTerminations: ['pool-1'],
      },
    }
    const events = out(runSettlement(s, NO_INPUT))
    const terminated = events.find((e) => e.type === 'PoolTerminated')
    expect(terminated?.type === 'PoolTerminated' && terminated.poolId).toBe('pool-1')
    expect(terminated?.type === 'PoolTerminated' && terminated.shortfalls).toEqual([
      { tranche: 'senior', shortfall: 500 },
    ])

    const after = events.reduce(reduce, s)
    expect(after.pools[0]?.terminated).toBe(true)
    expect(after.cardEffects.scheduledPoolTerminations).toEqual([])
  })

  it('leaves an unscheduled, unexhausted pool open', () => {
    expect(out(runSettlement(withPool(), NO_INPUT)).some(
      (e) => e.type === 'PoolTerminated',
    )).toBe(false)
  })
})

describe('GameScored is reduced, so a replayed game knows it ended', () => {
  it('records every net worth into state', () => {
    const s = baseState({ phase: 'settlement', round: 24, era: 4 })
    const events = out(runFinalSettlement(s, NO_INPUT))
    const scored = events.find((e) => e.type === 'GameScored')
    expect(scored?.type).toBe('GameScored')

    const after = events.reduce(reduce, s)
    expect(after.finalScores).not.toBeNull()
    expect(scored?.type === 'GameScored' && after.finalScores).toEqual(
      scored?.type === 'GameScored' ? scored.netWorths : null,
    )
  })

  it('survives a full replay from the log', () => {
    const created: GameEvent = { type: 'GameCreated', config: CONFIG }
    const scored: GameEvent = {
      type: 'GameScored', netWorths: { P1: 100, P2: 200, P3: 300, P4: 400 },
    }
    // This is the exact regression: `replay` used to rebuild a finished game with no
    // recorded winner, because nothing anywhere reduced `GameScored`.
    expect(replay([created]).finalScores).toBeNull()
    expect(replay([created, scored]).finalScores).toEqual(
      { P1: 100, P2: 200, P3: 300, P4: 400 },
    )
  })
})
