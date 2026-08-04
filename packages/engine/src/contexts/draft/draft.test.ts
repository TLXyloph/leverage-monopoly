import { describe, it, expect } from 'vitest'
import { DRAFT_ROUNDS, availableDeeds, decideDraft, deedCount } from './index.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import { DEEDS, DEED_IDS } from '../../config/board.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function draftState(): GameState {
  const base = initialState(CONFIG)
  return { ...base, phase: 'draft', draft: { round: 1, submissions: [], complete: false } }
}

function face(deed: DeedId): Money {
  return DEEDS[deed]?.faceValue ?? 0
}

/**
 * `GameState['deeds']` is `Record<DeedId, DeedState>` and `DeedId` is `string`,
 * so `noUncheckedIndexedAccess` makes every lookup `DeedState | undefined` --
 * matches the guard pattern already used in `board/rent.test.ts`.
 */
function withOwner(
  deeds: GameState['deeds'],
  id: DeedId,
  owner: PlayerId,
): GameState['deeds'] {
  const deed = deeds[id]
  if (deed === undefined) throw new Error(`No such deed: ${id}`)
  return { ...deeds, [id]: { ...deed, owner } }
}

function submit(
  state: GameState,
  player: PlayerId,
  ranked: readonly [DeedId, DeedId, DeedId],
  maxBid: Money = face(ranked[0]),
): GameState {
  const result = decideDraft(state, { type: 'submit-draft', player, ranked, maxBid })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result.reduce(reduce, state)
}

function resolve(state: GameState): readonly GameEvent[] {
  const result = decideDraft(state, { type: 'resolve-draft-round' })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function awards(events: readonly GameEvent[]): Record<string, { deed: DeedId; price: Money }> {
  const out: Record<string, { deed: DeedId; price: Money }> = {}
  for (const event of events) {
    if (event.type === 'DraftDeedAwarded') out[event.player] = { deed: event.deed, price: event.price }
  }
  return out
}

describe('submission validation', () => {
  it('accepts a well-formed ranked triple', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    expect(state.draft?.submissions).toHaveLength(1)
  })

  it('rejects a bid below the first choice face value', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'], maxBid: 399,
    })
    expect(isRejection(result) && result.code).toBe('BID_BELOW_FACE')
  })

  it('rejects a bid above the remaining budget', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'],
      maxBid: ECONOMY.STARTING_CASH + 1,
    })
    expect(isRejection(result) && result.code).toBe('BID_EXCEEDS_BUDGET')
  })

  it('rejects a deed already allocated in an earlier round', () => {
    const base = draftState()
    const taken: GameState = {
      ...base,
      deeds: withOwner(base.deeds, 'boardwalk', 'P4'),
    }
    const result = decideDraft(taken, {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'], maxBid: 400,
    })
    expect(isRejection(result) && result.code).toBe('DEED_UNAVAILABLE')
  })

  it('rejects a duplicated deed inside the triple', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'boardwalk', 'short-line'], maxBid: 400,
    })
    expect(isRejection(result) && result.code).toBe('DEED_UNAVAILABLE')
  })

  it('rejects a second submission in the same round', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    const result = decideDraft(state, {
      type: 'submit-draft', player: 'P1',
      ranked: ['illinois-avenue', 'park-place', 'short-line'], maxBid: 240,
    })
    expect(isRejection(result) && result.code).toBe('ALREADY_SUBMITTED')
  })

  it('refuses to resolve before all four have submitted', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    const result = decideDraft(state, { type: 'resolve-draft-round' })
    expect(isRejection(result)).toBe(true)
  })
})

describe('rules 1 and 2 — uncontested and contested first choices', () => {
  it('awards an uncontested first choice at face value', () => {
    let state = draftState()
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['reading-railroad', 'park-place', 'short-line'], 200)
    state = submit(state, 'P4', ['marvin-gardens', 'park-place', 'short-line'], 280)
    const result = awards(resolve(state))
    expect(result['P1']).toEqual({ deed: 'boardwalk', price: 400 })
    expect(result['P2']).toEqual({ deed: 'illinois-avenue', price: 240 })
    expect(result['P3']).toEqual({ deed: 'reading-railroad', price: 200 })
    expect(result['P4']).toEqual({ deed: 'marvin-gardens', price: 280 })
  })

  it('gives a contested deed to the highest bid, who pays their own bid', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'illinois-avenue', 'short-line'], 290)
    state = submit(state, 'P3', ['marvin-gardens', 'park-place', 'short-line'], 280)
    state = submit(state, 'P4', ['pacific-avenue', 'park-place', 'short-line'], 300)
    const events = resolve(state)
    expect(events).toContainEqual({
      type: 'DraftDeedAwarded', player: 'P1', deed: 'reading-railroad',
      price: 340, contested: true,
    })
    expect(awards(events)['P2']).toEqual({ deed: 'illinois-avenue', price: 240 })
  })

  it('breaks a bid tie on lower total face value acquired, then turn order', () => {
    const base = draftState()
    const seeded: GameState = {
      ...base,
      deeds: withOwner(base.deeds, 'boardwalk', 'P1'),
    }
    let state = seeded
    state = submit(state, 'P1', ['reading-railroad', 'pacific-avenue', 'short-line'], 200)
    state = submit(state, 'P2', ['reading-railroad', 'marvin-gardens', 'short-line'], 200)
    state = submit(state, 'P3', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P4', ['virginia-avenue', 'park-place', 'short-line'], 160)
    // P1 already holds $400 of face value, so P2 takes the tie.
    expect(awards(resolve(state))['P2']?.deed).toBe('reading-railroad')

    let even = draftState()
    even = submit(even, 'P1', ['reading-railroad', 'pacific-avenue', 'short-line'], 200)
    even = submit(even, 'P2', ['reading-railroad', 'marvin-gardens', 'short-line'], 200)
    even = submit(even, 'P3', ['illinois-avenue', 'park-place', 'short-line'], 240)
    even = submit(even, 'P4', ['virginia-avenue', 'park-place', 'short-line'], 160)
    // Nothing acquired yet, so the earlier player in turn order wins.
    expect(awards(resolve(even))['P1']?.deed).toBe('reading-railroad')
  })
})

describe('rules 3, 4, 5 and 6 — cascades and the guarantees', () => {
  it('cascades a loser to their second choice at face value', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'park-place', 'short-line'], 290)
    state = submit(state, 'P3', ['illinois-avenue', 'marvin-gardens', 'short-line'], 240)
    state = submit(state, 'P4', ['pacific-avenue', 'marvin-gardens', 'short-line'], 300)
    expect(awards(resolve(state))['P2']).toEqual({ deed: 'park-place', price: 350 })
  })

  it('resolves two cascaders on one deed by lower total face acquired (rule 4)', () => {
    const base = draftState()
    const seeded: GameState = {
      ...base,
      deeds: withOwner(withOwner(base.deeds, 'boardwalk', 'P2'), 'baltic-avenue', 'P3'),
    }
    let state = seeded
    state = submit(state, 'P1', ['illinois-avenue', 'pacific-avenue', 'short-line'], 300)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['illinois-avenue', 'park-place', 'virginia-avenue'], 240)
    state = submit(state, 'P4', ['marvin-gardens', 'ventnor-avenue', 'states-avenue'], 280)
    const result = awards(resolve(state))
    expect(result['P1']).toEqual({ deed: 'illinois-avenue', price: 300 })
    // P2 holds $400 of face, P3 holds $60, so P3 takes Park Place.
    expect(result['P3']).toEqual({ deed: 'park-place', price: 350 })
    expect(result['P2']).toEqual({ deed: 'short-line', price: 200 })
  })

  it('falls back to the cheapest remaining deed when all three choices are gone (rule 5)', () => {
    let state = draftState()
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'illinois-avenue'], 500)
    state = submit(state, 'P2', ['park-place', 'boardwalk', 'illinois-avenue'], 400)
    state = submit(state, 'P3', ['illinois-avenue', 'boardwalk', 'park-place'], 300)
    state = submit(state, 'P4', ['boardwalk', 'park-place', 'illinois-avenue'], 450)
    const result = awards(resolve(state))
    const cheapest = availableDeeds(draftState())[0]
    expect(result['P2']?.deed).toBe('park-place')
    expect(result['P3']?.deed).toBe('illinois-avenue')
    expect(result['P4']).toEqual({ deed: cheapest, price: face(cheapest ?? '') })
  })

  it('grants the cheapest remaining deed free when the budget cannot cover it (rule 6)', () => {
    const base = draftState()
    const broke: GameState = {
      ...base,
      players: { ...base.players, P4: { ...base.players.P4, cleanCash: 10 } },
    }
    let state = broke
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['reading-railroad', 'park-place', 'short-line'], 200)
    const events = resolve(state)
    const award = awards(events)['P4']
    expect(award?.price).toBe(0)
    expect(face(award?.deed ?? '')).toBe(60)
    const after = events.reduce(reduce, state)
    expect(after.players.P4.cleanCash).toBe(10)
    expect(deedCount(after, 'P4')).toBe(1)
  })
})

describe('the whole draft', () => {
  it('allocates all 28 deeds, seven each, over exactly seven rounds', () => {
    expect(DRAFT_ROUNDS).toBe(7)
    let state = draftState()
    for (let round = 1; round <= DRAFT_ROUNDS; round += 1) {
      const open = availableDeeds(state)
      for (const player of CONFIG.turnOrder) {
        const ranked = [open[0], open[1], open[2]] as [DeedId, DeedId, DeedId]
        state = submit(state, player, ranked)
      }
      state = resolve(state).reduce(reduce, state)
      expect(state.draft?.round, `after round ${round}`).toBe(round + 1)
    }
    expect(state.draft?.complete).toBe(true)
    // One unified pot: cash spent on deeds is exactly cash no longer available.
    for (const player of CONFIG.turnOrder) {
      expect(deedCount(state, player), player).toBe(7)
      const acquired = Object.values(state.deeds)
        .filter((d) => d.owner === player)
        .reduce((total, d) => total + d.faceValue, 0)
      expect(state.players[player].cleanCash, player)
        .toBe(ECONOMY.STARTING_CASH - acquired)
      expect(state.players[player].drawnCredit, player).toBe(0)
    }
    expect(Object.values(state.deeds).every((d) => d.owner !== null)).toBe(true)
    expect(DEED_IDS).toHaveLength(28)
    const spent = CONFIG.turnOrder.reduce(
      (total, p) => total + (ECONOMY.STARTING_CASH - state.players[p].cleanCash), 0)
    expect(state.treasury).toBe(spent)
  })

  it('is deterministic: resolving the same state twice yields the same events', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P3', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P4', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    expect(resolve(state)).toEqual(resolve(state))
  })
})
