import { DEED_LIST } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type {
  DeckState, DeedState, GameConfig, GameState, PlayerState,
} from '../../core/state.js'
import type { DeedId, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import type { CardEffectsState } from '../decks/index.js'

/**
 * The empty `cardEffects` value, inlined rather than imported from `contexts/decks`
 * (whose `index.ts` transitively imports `board`, which imports `session` for
 * `isUnlocked` — importing `decks` from here would close that cycle). `decks/reduce.ts`
 * exports the identical shape as `emptyCardEffects`; this is the one place outside that
 * context allowed to duplicate it, purely to seed `GameState`'s new field.
 */
function emptyCardEffectsFor(order: readonly PlayerId[]): CardEffectsState {
  const zero = Object.fromEntries(order.map((p) => [p, 0])) as Record<PlayerId, number>
  return {
    modifiers: [], entitlements: [], poolInjections: {}, scheduledPoolTerminations: [], seq: 0,
    counters: {
      rentReceivedThisGame: zero, rentReceivedThisEra: zero,
      dirtyActionsThisGame: zero, launderCountThisGame: zero,
    },
  }
}

const EMPTY_DECK: DeckState = { order: [], drawn: 0 }

function newPlayer(id: PlayerId): PlayerState {
  return {
    id,
    cleanCash: ECONOMY.STARTING_CASH,
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
  }
}

export function initialState(config: GameConfig): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, newPlayer(id)]),
  ) as Record<PlayerId, PlayerState>

  const deeds = Object.fromEntries(
    DEED_LIST.map((d) => [d.id, {
      id: d.id,
      square: d.square,
      group: d.group,
      faceValue: d.faceValue,
      houseCost: d.houseCost,
      rentTable: d.rentTable,
      owner: null,
      mortgaged: false,
      houses: 0,
    }]),
  ) as Record<DeedId, DeedState>

  return {
    config,
    phase: 'setup',
    round: 1,
    era: 1,
    activePlayer: null,
    players,
    deeds,
    treasury: 0,
    housesRemaining: ECONOMY.HOUSE_SUPPLY,
    hotelsRemaining: ECONOMY.HOTEL_SUPPLY,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: { 1: EMPTY_DECK, 2: EMPTY_DECK, 3: EMPTY_DECK, 4: EMPTY_DECK },
    cardEffects: emptyCardEffectsFor(PLAYER_IDS),
  }
}

export function reduceSession(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GameCreated':
      return initialState(event.config)
    case 'PhaseAdvanced':
      return { ...state, phase: event.phase, activePlayer: null }
    case 'RoundAdvanced':
      return { ...state, round: event.round }
    case 'EraAdvanced':
      return { ...state, era: event.era }
    default:
      return state
  }
}
