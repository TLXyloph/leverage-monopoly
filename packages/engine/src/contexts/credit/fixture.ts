import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameConfig, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { initialState } from '../session/index.js'
import { reduceCredit } from './reduce.js'

/**
 * Test-support builders, deliberately not re-exported from `index.ts`. Shared across
 * `credit.test.ts` (Task 9) and the margin-call and peer-loan suites (Tasks 10-11).
 */
const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

/**
 * A synthetic deed, deliberately not one of the real 28 from `config/board.ts`. Used
 * where a test needs an exact, round-number face value — a carrying-cost or interest
 * calculation, say — rather than the real board's figures. `DeedState`'s shape is
 * Task 2's contract and has not changed, so this builder needs no updating.
 */
export function deed(id: DeedId, faceValue: Money, patch: Partial<DeedState> = {}): DeedState {
  return {
    id,
    square: 1,
    group: 'brown',
    faceValue,
    houseCost: 50,
    rentTable: [2, 10, 30, 90, 160, 250],
    owner: null,
    mortgaged: false,
    houses: 0,
    ...patch,
  }
}

/**
 * The real 28-deed board (via `session`'s `initialState`, Task 4), in the Open phase,
 * ready for credit-line actions. Building on `initialState` — rather than hand-rolling
 * `PlayerState` here — is what keeps this fixture from drifting out of sync with
 * `PlayerState`'s actual fields, which have grown since Task 2.
 */
export function gameState(patch: Partial<GameState> = {}): GameState {
  return { ...initialState(CONFIG), phase: 'open', ...patch }
}

export function withDeeds(state: GameState, deeds: readonly DeedState[]): GameState {
  const map: Record<DeedId, DeedState> = { ...state.deeds }
  for (const d of deeds) map[d.id] = d
  return { ...state, deeds: map }
}

export function withPlayers(
  state: GameState,
  patches: Partial<Record<PlayerId, Partial<PlayerState>>>,
): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  for (const id of PLAYER_IDS) {
    const patch = patches[id]
    if (patch !== undefined) players[id] = { ...players[id], ...patch }
  }
  return { ...state, players }
}

export function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`expected events, got rejection ${result.code}`)
  return result
}

export function rejectionOf(result: readonly GameEvent[] | Rejection): Rejection {
  if (!isRejection(result)) throw new Error('expected a rejection, got events')
  return result
}

export function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce<GameState>((acc, event) => reduceCredit(acc, event), state)
}
