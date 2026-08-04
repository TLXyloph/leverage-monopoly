import { isRejection, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import { reduce } from '../../core/reduce.js'
import type { DeedState, GameConfig, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { initialState } from '../session/index.js'

/**
 * Test-support builders, deliberately not re-exported from `index.ts`. Shared across
 * `building.test.ts`, `mortgage.test.ts` and `trade.test.ts`. Mirrors the pattern
 * `contexts/credit/fixture.ts` and `contexts/markets/fixture.ts` already established:
 * building on the real `initialState` and the real 28 deeds, rather than hand-written
 * stubs, keeps the house costs, face values and rent tables under test the ones the
 * game actually ships.
 */
export const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

/** The light-blue group, in board order. Three deeds, $45 a house after the 90% cut. */
export const LIGHT_BLUE: readonly DeedId[] = [
  'oriental-avenue', 'vermont-avenue', 'connecticut-avenue',
]

export const RAILROADS: readonly DeedId[] = [
  'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
]

/** A round-1 Open phase with the real 28 deeds, all unowned. */
export function openState(patch: Partial<GameState> = {}): GameState {
  return { ...initialState(CONFIG), phase: 'open', ...patch }
}

export function own(
  state: GameState,
  player: PlayerId,
  ids: readonly DeedId[],
  patch: Partial<DeedState> = {},
): GameState {
  const deeds: Record<DeedId, DeedState> = { ...state.deeds }
  for (const id of ids) {
    const deed = deeds[id]
    if (deed === undefined) throw new Error(`fixture: no deed called ${id}`)
    deeds[id] = { ...deed, owner: player, ...patch }
  }
  return { ...state, deeds }
}

export function setPlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id], ...patch } },
  }
}

export function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) {
    throw new Error(`expected events, got ${result.code}: ${result.message}`)
  }
  return result
}

export function rejectionOf(result: readonly GameEvent[] | Rejection): Rejection {
  if (!isRejection(result)) throw new Error('expected a rejection, got events')
  return result
}

export function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, state)
}

/**
 * Task 20's conserved quantity, restated locally so these unit tests assert it on
 * every money-moving case rather than waiting for the property suite to find it.
 */
export function conserved(state: GameState): Money {
  const held = PLAYER_IDS.reduce((total, id) => {
    const p = state.players[id]
    return total + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, 0)
  return held + state.treasury
}

/** Buildings physically on the board. A deed at five houses is one hotel, not five. */
export function placed(state: GameState): { readonly houses: number; readonly hotels: number } {
  return Object.values(state.deeds).reduce(
    (acc, d) => (d.houses === 5
      ? { houses: acc.houses, hotels: acc.hotels + 1 }
      : { houses: acc.houses + d.houses, hotels: acc.hotels }),
    { houses: 0, hotels: 0 },
  )
}
