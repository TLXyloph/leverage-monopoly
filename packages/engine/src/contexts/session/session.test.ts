import { describe, it, expect } from 'vitest'
import {
  INSTRUMENTS, UNLOCK_ERA, createGame, decideSession, eraForRound,
  initialState, isUnlocked, newlyUnlockedIn, prevailingRate, unlockedInstruments,
} from './index.js'
import { reduce as reduceRoot, replay } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Era, Phase } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function events(state: GameState): readonly GameEvent[] {
  const result = decideSession(state, { type: 'advance-phase' })
  if (isRejection(result)) throw new Error(result.message)
  return result
}

function advance(state: GameState): GameState {
  return events(state).reduce(reduceRoot, state)
}

describe('era schedule', () => {
  it('maps every round to its era at the six-round boundaries', () => {
    const expected: readonly [number, Era][] = [
      [1, 1], [6, 1], [7, 2], [12, 2], [13, 3], [18, 3], [19, 4], [24, 4],
    ]
    for (const [round, era] of expected) {
      expect(eraForRound(round), `round ${round}`).toBe(era)
    }
  })

  it('quotes the prevailing rate for each era', () => {
    const rates: readonly [Era, number][] = [[1, 0.05], [2, 0.06], [3, 0.08], [4, 0.12]]
    for (const [era, rate] of rates) {
      const state: GameState = { ...initialState(CONFIG), era }
      expect(prevailingRate(state)).toBe(rate)
    }
  })
})

describe('instrument gating', () => {
  it('locks Era II instruments during Era I', () => {
    const state = initialState(CONFIG)
    expect(isUnlocked(state, 'credit-line')).toBe(true)
    expect(isUnlocked(state, 'peer-loan')).toBe(false)
    expect(isUnlocked(state, 'cdo')).toBe(false)
  })

  it('unlocks cumulatively as eras advance', () => {
    const era2: GameState = { ...initialState(CONFIG), era: 2 }
    expect(isUnlocked(era2, 'credit-line')).toBe(true)
    expect(isUnlocked(era2, 'rent-future')).toBe(true)
    expect(isUnlocked(era2, 'deed-option')).toBe(false)
    const era3: GameState = { ...initialState(CONFIG), era: 3 }
    expect(unlockedInstruments(era3)).toHaveLength(INSTRUMENTS.length)
  })

  it('unlocks everything from round 1 when unlockMode is all', () => {
    const state = initialState({ ...CONFIG, unlockMode: 'all' })
    expect(state.era).toBe(1)
    for (const instrument of INSTRUMENTS) {
      expect(isUnlocked(state, instrument), instrument).toBe(true)
    }
  })

  it('introduces no new instrument in Era IV', () => {
    expect(newlyUnlockedIn(4)).toEqual([])
    expect(Object.values(UNLOCK_ERA).every((era) => era <= 3)).toBe(true)
  })
})

describe('phase and round advancement', () => {
  it('walks setup -> draft -> market -> open -> movement -> settlement', () => {
    let state = replay([{ type: 'GameCreated', config: CONFIG }])
    expect(state.phase).toBe('setup')
    const seen: Phase[] = []
    for (let step = 0; step < 4; step += 1) {
      state = { ...state, draft: { round: 8, submissions: [], complete: true } }
      state = advance(state)
      seen.push(state.phase)
    }
    expect(seen).toEqual(['draft', 'market', 'open', 'movement'])
    expect(state.round).toBe(1)
  })

  it('advances round then era then phase, in that order, out of Settlement', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: 6,
      era: 1,
    }
    // Round 7 is STIMULUS_ROUND (Task 20 correction): `advanceEraIIStimulus` was
    // defined and unit-tested from Task 9 onward but never wired into `decideSession`,
    // so no game ever actually advanced the Era II stimulus. It now fires in the same
    // batch as the phase advance that opens round 7's Market phase, one event per
    // player in turn order.
    expect(events(state)).toEqual([
      { type: 'RoundAdvanced', round: 7 },
      { type: 'EraAdvanced', era: 2 },
      { type: 'PhaseAdvanced', phase: 'market' },
      { type: 'StimulusAdvanced', player: 'P1', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P2', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P3', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P4', amount: ECONOMY.ERA_II_STIMULUS },
    ])
  })

  it('emits no EraAdvanced when the era does not change', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: 5,
    }
    expect(events(state)).toEqual([
      { type: 'RoundAdvanced', round: 6 },
      { type: 'PhaseAdvanced', phase: 'market' },
    ])
  })

  it('goes to scoring instead of a 25th round', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: ECONOMY.TOTAL_ROUNDS,
      era: 4,
    }
    expect(events(state)).toEqual([{ type: 'PhaseAdvanced', phase: 'scoring' }])
  })

  it('refuses to leave the draft before it is finished', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'draft',
      draft: { round: 3, submissions: [], complete: false },
    }
    const result = decideSession(state, { type: 'advance-phase' })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses to advance past complete', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'complete',
    }
    expect(isRejection(decideSession(state, { type: 'advance-phase' }))).toBe(true)
  })
})

describe('game creation', () => {
  it('seats four players with the starting budget and 28 unowned deeds', () => {
    const state = replay(createGame(CONFIG))
    expect(Object.keys(state.players)).toHaveLength(4)
    for (const id of CONFIG.turnOrder) {
      const player = state.players[id]
      expect(player.cleanCash).toBe(ECONOMY.STARTING_CASH)
      expect(player.position).toBe(0)
      expect(player.consecutiveDoubles).toBe(0)
    }
    expect(Object.keys(state.deeds)).toHaveLength(28)
    expect(Object.values(state.deeds).every((d) => d.owner === null)).toBe(true)
    expect(state.treasury).toBe(0)
    expect(state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(state.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
  })
})
