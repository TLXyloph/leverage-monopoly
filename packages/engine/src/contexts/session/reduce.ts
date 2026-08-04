import { DEED_LIST } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type {
  DeckState, DeedState, GameConfig, GameState, PlayerState,
} from '../../core/state.js'
import type { DeedId, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

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
