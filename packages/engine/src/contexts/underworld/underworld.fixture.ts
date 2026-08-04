import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { ColorGroup, DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

/**
 * Test-support builders, deliberately not re-exported from `index.ts` — mirrors
 * `contexts/credit/fixture.ts`'s convention. Every field mirrors `PlayerState`'s
 * actual shape (Task 2), including `consecutiveDoubles`, which the underworld
 * context never reads but must still supply to satisfy the type.
 */
export function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    cleanCash: 1000,
    dirtyCash: 0,
    heat: 0,
    position: 0,
    inJail: false,
    consecutiveDoubles: 0,
    drawnCredit: 0,
    distressedDebt: 0,
    creditImpaired: false,
    ventures: [],
    marginCallFlaggedAt: null,
    launderedThisPhase: false,
    briberyUsedThisRound: false,
    dirtyActionThisRound: false,
    insiderRevealedThisRound: false,
    rerollForced: false,
    cardCancelled: false,
    ...over,
  }
}

export function makeDeed(
  id: DeedId, owner: PlayerId | 'bank' | null, over: Partial<DeedState> = {},
): DeedState {
  return {
    id,
    square: 16,
    group: 'orange' as ColorGroup,
    faceValue: 180 as Money,
    houseCost: 100 as Money,
    rentTable: [14, 70, 200, 550, 750, 950],
    owner,
    mortgaged: false,
    houses: 0,
    ...over,
  }
}

export function makeState(over: Partial<GameState> = {}): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, makePlayer(id)]),
  ) as Record<PlayerId, PlayerState>

  return {
    config: {
      turnOrder: PLAYER_IDS,
      unlockMode: 'progressive',
      winCondition: { kind: 'fixed-rounds' },
    },
    phase: 'open',
    round: 7,
    era: 2,
    activePlayer: null,
    players,
    deeds: {},
    treasury: 6000 as Money,
    housesRemaining: 32,
    hotelsRemaining: 12,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: {
      1: { order: [], drawn: 0 },
      2: { order: [], drawn: 0 },
      3: { order: [4, 9, 1], drawn: 0 },
      4: { order: [], drawn: 0 },
    },
    cardEffects: {
      modifiers: [], entitlements: [], poolInjections: {}, scheduledPoolTerminations: [], seq: 0,
      counters: {
        rentReceivedThisGame: Object.fromEntries(PLAYER_IDS.map((p) => [p, 0])) as Record<PlayerId, Money>,
        rentReceivedThisEra: Object.fromEntries(PLAYER_IDS.map((p) => [p, 0])) as Record<PlayerId, Money>,
        dirtyActionsThisGame: Object.fromEntries(PLAYER_IDS.map((p) => [p, 0])) as Record<PlayerId, number>,
        launderCountThisGame: Object.fromEntries(PLAYER_IDS.map((p) => [p, 0])) as Record<PlayerId, number>,
      },
    },
    ...over,
  }
}

export function withPlayer(
  state: GameState, id: PlayerId, over: Partial<PlayerState>,
): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...over }
  return { ...state, players }
}

export function withDeed(state: GameState, deed: DeedState): GameState {
  return { ...state, deeds: { ...state.deeds, [deed.id]: deed } }
}

/**
 * The conserved identity (spec section 20): sum(cleanCash) - sum(drawnCredit) -
 * sum(distressedDebt) + treasury. Dirty cash is deliberately EXCLUDED — it is a
 * second, unconserved currency that ventures create from nothing and audits
 * destroy, worth $0 at scoring. Every underworld test that moves money checks
 * this identity is unchanged by the move.
 */
export function cleanMoneyTotal(state: GameState): Money {
  return PLAYER_IDS.reduce(
    (sum, id) => {
      const p = state.players[id]
      return sum + p.cleanCash - p.drawnCredit - p.distressedDebt
    },
    state.treasury,
  )
}
