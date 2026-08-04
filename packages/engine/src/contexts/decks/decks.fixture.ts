import type { DeedState, GameConfig, GameState } from '../../core/state.js'
import type { DeedId, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { initialState } from '../session/index.js'

/**
 * Test-support builders for `decks`, deliberately not re-exported from `index.ts` —
 * mirrors the convention every other context establishes (`credit/fixture.ts`,
 * `board/property.fixture.ts`, `underworld/underworld.fixture.ts`): build on the real
 * `initialState` and the real 28-deed board rather than hand-rolled stubs.
 */
export const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

export function baseState(over: Partial<GameState> = {}): GameState {
  return { ...initialState(CONFIG), phase: 'movement', round: 7, era: 2, ...over }
}

export function withPlayer(
  state: GameState, id: PlayerId, over: Partial<GameState['players'][PlayerId]>,
): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...over } } }
}

export function withDeed(state: GameState, id: DeedId, over: Partial<DeedState>): GameState {
  const existing = state.deeds[id]
  if (existing === undefined) throw new Error(`no such deed ${id}`)
  return { ...state, deeds: { ...state.deeds, [id]: { ...existing, ...over } } }
}

/**
 * A mid-game state with a spread of positions: P1 unlevered, P2 developed with a hotel,
 * P3 lightly mortgaged, P4 fully mortgaged and drawn. Used across `metrics.test.ts`,
 * `interpret.test.ts` and `decks.test.ts`.
 */
export function fixtureMidGame(): GameState {
  let s = baseState()
  s = withPlayer(s, 'P1', { cleanCash: 1000 })
  s = withPlayer(s, 'P2', { cleanCash: 500 })
  s = withPlayer(s, 'P3', { cleanCash: 700 })
  s = withPlayer(s, 'P4', { cleanCash: 80, drawnCredit: 400 })

  s = withDeed(s, 'st-james-place', { owner: 'P2', houses: 5 })
  s = withDeed(s, 'tennessee-avenue', { owner: 'P2', houses: 2 })
  s = withDeed(s, 'new-york-avenue', { owner: 'P2' })

  s = withDeed(s, 'baltic-avenue', { owner: 'P3', mortgaged: true })
  s = withDeed(s, 'mediterranean-avenue', { owner: 'P3' })

  // P4 has mortgaged everything they own: base 0, drawn 400.
  s = withDeed(s, 'oriental-avenue', { owner: 'P4', mortgaged: true })
  s = withDeed(s, 'vermont-avenue', { owner: 'P4', mortgaged: true })

  return s
}

/**
 * Four players tied or near-tied on several metrics, for tie-break coverage. Turn
 * order is the standard P1, P2, P3, P4.
 *
 * P1 and P2 both draw $600 (tied on the primary metric). Each railroad is worth
 * exactly $200 of face value, which keeps the borrowing-base arithmetic exact:
 * two railroads give a base of floorPercent(400, 0.75) = 300, so drawn-to-base
 * ratio 600/300 = 2.0 lands on a whole number either way.
 */
export function fixtureTied(opts: { identicalRatios?: boolean; noDebt?: boolean } = {}): GameState {
  let s = baseState()
  if (opts.noDebt) {
    s = withPlayer(s, 'P1', { drawnCredit: 0, heat: 5 })
    s = withPlayer(s, 'P2', { drawnCredit: 0, heat: 5 })
    s = withPlayer(s, 'P3', { drawnCredit: 0, heat: 1 })
    s = withPlayer(s, 'P4', { drawnCredit: 0, heat: 0 })
    return s
  }

  s = withDeed(s, 'reading-railroad', { owner: 'P1' })
  s = withDeed(s, 'pennsylvania-railroad', { owner: 'P1' })
  s = withDeed(s, 'b-and-o-railroad', { owner: 'P2' })

  if (opts.identicalRatios) {
    // P2 also holds two railroads: identical base (300), identical ratio (2.0).
    s = withDeed(s, 'short-line', { owner: 'P2' })
  }
  // Otherwise P2 holds only one railroad: base 150, ratio 600/150 = 4.0 > P1's 2.0.

  s = withPlayer(s, 'P1', { drawnCredit: 600, heat: 5 })
  s = withPlayer(s, 'P2', { drawnCredit: 600, heat: 5 })
  s = withPlayer(s, 'P3', { drawnCredit: 0, heat: 1 })
  s = withPlayer(s, 'P4', { drawnCredit: 0, heat: 0 })
  return s
}
