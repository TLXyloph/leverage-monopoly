import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../core/events.js'
import type { GameState, RentFuture } from '../../core/state.js'
import { isRejection, type Rejection } from '../../core/errors.js'
import { decideBoardAction } from '../../core/decide.js'
import { baseState, withDeed, withPlayer } from '../decks/decks.fixture.js'

/**
 * `ventureIncomeFromRent` was fully implemented, unit-tested and reviewed — and never
 * called. `board/decide.ts` emitted `RentCharged` and handed it to nothing, so Escort
 * Service ($150, +2 Heat) and Chop Shop ($250, +3 Heat) paid $0 for an entire game.
 * Two of the four ventures were pure sinks.
 *
 * These tests therefore drive `decideBoardAction` — the real composition root, with the
 * real port — and assert on the events a landing actually produces. Calling
 * `ventureIncomeFromRent` directly is exactly the test that already existed and that
 * proved nothing.
 */

/** Unwraps a decider result, failing loudly on a rejection the test did not expect. */
function events(out: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(out)) throw new Error(`unexpected rejection: ${JSON.stringify(out)}`)
  return out
}

/** P2 sits on square 10 and rolls 3+3 to land on St. James Place (square 16). */
const ROLL = { type: 'roll-dice', player: 'P2', dice: [3, 3] } as const

/** St. James Place, owned by P1 alone (no group bonus): base rent $14. */
function landing(over: Partial<GameState> = {}): GameState {
  let s = baseState({ phase: 'movement', ...over })
  s = withDeed(s, 'st-james-place', { owner: 'P1' })
  s = withPlayer(s, 'P2', { position: 10, cleanCash: 900 })
  return s
}

const dirty = (out: readonly GameEvent[]): readonly GameEvent[] =>
  out.filter((e) => e.type === 'DirtyCashEarned')

describe('Escort Service is paid out of rent charged', () => {
  it('pays the deed owner 60% of the rent on a real landing', () => {
    const none = events(decideBoardAction(landing(), ROLL))
    expect(none.find((e) => e.type === 'RentCharged')?.type).toBe('RentCharged')
    expect(dirty(none)).toEqual([])

    const running = withPlayer(landing(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(dirty(events(decideBoardAction(running, ROLL)))).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 8, source: 'escort' }, // floor(14 * 0.6)
    ])
  })
})

describe('Chop Shop is paid per opponent landing', () => {
  it('pays the deed owner a flat $150 regardless of the rent', () => {
    const running = withPlayer(landing(), 'P1', {
      ventures: [{ kind: 'chop-shop', roundsRemaining: 2 }],
    })
    expect(dirty(events(decideBoardAction(running, ROLL)))).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })
})

describe('SPEC 19.5: the DEED OWNER is paid, on rent CHARGED', () => {
  const contract: RentFuture = {
    id: 'rf-1', deed: 'st-james-place', holder: 'P3', startRound: 5, endRound: 10,
  }

  it('a sold rent future does not extinguish the owner\'s venture income', () => {
    // The contract routes the CASH to P3, but P1 still owns the deed.
    let s = withPlayer(landing(), 'P1', { ventures: [{ kind: 'escort', roundsRemaining: 3 }] })
    s = { ...s, futures: [contract] }

    const out = events(decideBoardAction(s, ROLL))
    const charged = out.find((e) => e.type === 'RentCharged')
    expect(charged?.type === 'RentCharged' && charged.to).toBe('P3')
    expect(out.some((e) => e.type === 'RentRoutedToFuture')).toBe(true)
    // Cash to P3, venture income to P1. That is the whole point of 19.5.
    expect(dirty(out)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 8, source: 'escort' },
    ])
  })

  it('a futures holder earns nothing from a deed they do not own', () => {
    let s = withPlayer(landing(), 'P3', { ventures: [{ kind: 'escort', roundsRemaining: 3 }] })
    s = { ...s, futures: [contract] }

    const out = events(decideBoardAction(s, ROLL))
    const charged = out.find((e) => e.type === 'RentCharged')
    expect(charged?.type === 'RentCharged' && charged.to).toBe('P3')
    expect(dirty(out)).toEqual([])
  })
})

describe('SPEC 19.9: a mortgaged deed pays no venture bonus', () => {
  it('emits no rent and no venture income at all', () => {
    let s = withPlayer(landing(), 'P1', {
      ventures: [
        { kind: 'escort', roundsRemaining: 3 },
        { kind: 'chop-shop', roundsRemaining: 3 },
      ],
    })
    s = withDeed(s, 'st-james-place', { owner: 'P1', mortgaged: true })

    const out = events(decideBoardAction(s, ROLL))
    expect(out.some((e) => e.type === 'RentCharged')).toBe(false)
    expect(dirty(out)).toEqual([])
  })
})

describe('both rent-driven ventures run together', () => {
  it('pays escort and chop shop on the same landing, in venture order', () => {
    const s = withPlayer(landing(), 'P1', {
      ventures: [
        { kind: 'escort', roundsRemaining: 3 },
        { kind: 'chop-shop', roundsRemaining: 3 },
      ],
    })
    expect(dirty(events(decideBoardAction(s, ROLL)))).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 8, source: 'escort' },
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })
})
