import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { supplyForBuild, supplyForSell, type SupplyDelta } from './property.js'

function withPlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id], ...patch } },
  }
}

function withDeed(state: GameState, id: DeedId, patch: Partial<DeedState>): GameState {
  const existing = state.deeds[id]
  if (existing === undefined) return state
  return { ...state, deeds: { ...state.deeds, [id]: { ...existing, ...patch } } }
}

/** The Treasury is the named counterparty for every bank-facing property flow. */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const next = withPlayer(state, id, { cleanCash: state.players[id].cleanCash - amount })
  return { ...next, treasury: next.treasury + amount }
}

function receiveFromTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const next = withPlayer(state, id, { cleanCash: state.players[id].cleanCash + amount })
  return { ...next, treasury: next.treasury - amount }
}

function withSupply(state: GameState, delta: SupplyDelta): GameState {
  return {
    ...state,
    housesRemaining: state.housesRemaining + delta.houses,
    hotelsRemaining: state.hotelsRemaining + delta.hotels,
  }
}

export function reduceProperty(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    /**
     * The decider has already proved affordability and supply, so the charge is
     * unconditional. Whether this is a house or a hotel is derivable from the deed's
     * current level, which is why the event needs no extra field.
     */
    case 'HouseBuilt': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      return withSupply(
        withDeed(
          payTreasury(state, event.player, event.cost),
          event.deed,
          { houses: deed.houses + 1 },
        ),
        supplyForBuild(deed.houses),
      )
    }

    case 'HouseSold': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      return withSupply(
        withDeed(
          receiveFromTreasury(state, event.player, event.proceeds),
          event.deed,
          { houses: deed.houses - 1 },
        ),
        supplyForSell(deed.houses),
      )
    }

    case 'DeedMortgaged':
      return withDeed(
        receiveFromTreasury(state, event.player, event.proceeds),
        event.deed,
        { mortgaged: true },
      )

    case 'DeedUnmortgaged':
      return withDeed(
        payTreasury(state, event.player, event.cost),
        event.deed,
        { mortgaged: false },
      )

    /**
     * One leg of a trade: `from` hands over `deeds` and `cash` to `to`. A two-sided
     * trade is two of these. Encumbrances are untouched on purpose — a rent future
     * references the deed and not its owner, which is exactly what makes spec
     * section 6's "contracts follow the deed" true with no code here.
     */
    case 'DeedTraded': {
      const moved = event.deeds.reduce<GameState>(
        (acc, id) => withDeed(acc, id, { owner: event.to }),
        state,
      )
      const giver = moved.players[event.from]
      const taker = moved.players[event.to]
      return {
        ...moved,
        players: {
          ...moved.players,
          [event.from]: { ...giver, cleanCash: giver.cleanCash - event.cash },
          [event.to]: { ...taker, cleanCash: taker.cleanCash + event.cash },
        },
      }
    }

    default:
      return state
  }
}
