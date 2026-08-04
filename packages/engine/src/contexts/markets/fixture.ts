import type { GameConfig, DeedState, GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { initialState } from '../session/index.js'

/**
 * Test-support builders, deliberately not re-exported from `index.ts`. Mirrors
 * `contexts/credit/fixture.ts`'s approach exactly: building on `initialState` (Task 4),
 * which reads the real 28-deed board (Task 3), is what keeps this fixture from drifting
 * out of sync with `PlayerState`'s actual fields and the real deed data — hand-rolling
 * either here would go stale the moment either task's shape grows. It also means the
 * golden landing-probability assertions in `markets.test.ts` exercise Task 7's real
 * Markov model rather than a synthetic stand-in.
 *
 * `unlockMode: 'all'` bypasses era gating for every test except the one that
 * deliberately overrides it to prove `decideMarkets` still enforces the gate.
 */
const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

const BASE = initialState(CONFIG)

function realDeed(id: DeedId): DeedState {
  const deed = BASE.deeds[id]
  if (deed === undefined) {
    throw new Error(`${id} is missing from the real board (config/board.ts).`)
  }
  return deed
}

/** St. James Place, real board data (Task 3): square 16, orange, the highest-traffic
 * group on the board. Golden fixture probability 0.027146 (spec section 20). */
export function stJames(owner: PlayerId | null): DeedState {
  return { ...realDeed('st-james-place'), owner }
}

/** Boardwalk, real board data (Task 3): square 39, dark blue, the least-trafficked
 * group on the board. Used only where a test needs a deed distinct from St. James. */
export function boardwalk(owner: PlayerId | null): DeedState {
  return { ...realDeed('boardwalk'), owner }
}

export interface TestStateOverrides {
  readonly round?: GameState['round']
  readonly phase?: GameState['phase']
  readonly era?: GameState['era']
  readonly unlockMode?: GameConfig['unlockMode']
  /** Replaces the default deeds map entirely (sparse by design — a test that wants
   * `st-james-place` absent, e.g. to prove DEED_UNAVAILABLE, must be able to omit it). */
  readonly deeds?: Readonly<Record<DeedId, DeedState>>
  readonly cash?: Readonly<Partial<Record<PlayerId, Money>>>
  readonly futures?: GameState['futures']
  readonly options?: GameState['options']
}

export function testState(overrides: TestStateOverrides = {}): GameState {
  const cash = overrides.cash ?? {}
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [
      id,
      { ...BASE.players[id], cleanCash: cash[id] ?? BASE.players[id].cleanCash },
    ]),
  ) as GameState['players']

  return {
    ...BASE,
    config: overrides.unlockMode === undefined
      ? CONFIG
      : { ...CONFIG, unlockMode: overrides.unlockMode },
    phase: overrides.phase ?? 'open',
    round: overrides.round ?? 8,
    era: overrides.era ?? 2,
    players,
    deeds: overrides.deeds ?? { 'st-james-place': stJames('P1') },
    futures: overrides.futures ?? [],
    options: overrides.options ?? [],
  }
}
