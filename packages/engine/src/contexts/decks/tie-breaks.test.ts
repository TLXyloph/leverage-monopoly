import { describe, it, expect } from 'vitest'
import type { EntityExtremum } from './effects.js'
import type { GameState, Pool, RentFuture } from '../../core/state.js'
import { resolveEntity } from './select.js'
import { baseState, withDeed } from './decks.fixture.js'

/**
 * Determinism is this engine's foundational property: the same log must rebuild the
 * same state on every machine, forever. Four comparators were not TOTAL — two pools with
 * one originator, two tranches with one holder, two futures with one holder, and two
 * equal bids from one player all compared 0 — and the code was deterministic only
 * because V8's `Array.prototype.sort` happens to be stable. That is an implementation
 * detail of one engine, not a language guarantee this codebase may build on.
 *
 * Each test below feeds the SAME entities in both orders. A comparator that returns 0
 * for a real pair lets input order decide the winner, so agreement across both orders is
 * exactly the property that a total order provides and a partial one does not.
 */

function pool(id: string, over: Partial<Pool> = {}): Pool {
  return {
    id,
    originator: 'P1',
    assets: [],
    tranches: [{ kind: 'senior', face: 100, paid: 0, holder: 'P2' }],
    terminated: false,
    ...over,
  }
}

function future(id: string): RentFuture {
  return { id, deed: 'st-james-place', holder: 'P2', startRound: 8, endRound: 14 }
}

const withPools = (s: GameState, pools: readonly Pool[]): GameState => ({ ...s, pools })

describe('resolveEntity orders totally, not stably', () => {
  it('picks the same pool when two share an originator and a cashflow', () => {
    const spec: EntityExtremum = {
      kind: 'pool', by: 'expected-cashflow', direction: 'max', tieBreak: [],
      attribute: 'originator',
    }
    const s = baseState()
    // Identical originator (P1) and identical expected cashflow (no assets, so $0).
    // Before the fix these compared 0 and the array order decided.
    const forwards = resolveEntity(withPools(s, [pool('pool-a'), pool('pool-b')]), spec)
    const backwards = resolveEntity(withPools(s, [pool('pool-b'), pool('pool-a')]), spec)

    expect(forwards).toEqual(backwards)
    expect(forwards).toEqual({ kind: 'pool', poolId: 'pool-a' })
  })

  it('picks the same tranche when two share a holder and a remaining face', () => {
    const spec: EntityExtremum = {
      kind: 'tranche', by: 'remaining-face', direction: 'max', tieBreak: [],
      attribute: 'holder',
    }
    const s = baseState()
    const both = [
      { kind: 'senior' as const, face: 100, paid: 0, holder: 'P2' as const },
      { kind: 'mezzanine' as const, face: 100, paid: 0, holder: 'P2' as const },
    ]
    const forwards = resolveEntity(
      withPools(s, [pool('pool-a', { tranches: both })]), spec,
    )
    const backwards = resolveEntity(
      withPools(s, [pool('pool-a', { tranches: [...both].reverse() })]), spec,
    )

    expect(forwards).toEqual(backwards)
    expect(forwards).toEqual({ kind: 'tranche', poolId: 'pool-a', tranche: 'mezzanine' })
  })

  it('picks the same rent future when two share a holder and a mark', () => {
    const spec: EntityExtremum = {
      kind: 'rent-future', by: 'remaining-value', direction: 'max', attribute: 'holder',
    }
    // Same deed, same window, same holder: identical marks, identical turn order.
    const s = withDeed(baseState(), 'st-james-place', { owner: 'P1' })
    const forwards = resolveEntity({ ...s, futures: [future('rf-a'), future('rf-b')] }, spec)
    const backwards = resolveEntity({ ...s, futures: [future('rf-b'), future('rf-a')] }, spec)

    expect(forwards).toEqual(backwards)
    expect(forwards).toEqual({ kind: 'rent-future', contractId: 'rf-a' })
  })
})
