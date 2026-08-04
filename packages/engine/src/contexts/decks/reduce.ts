import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { PlayerId } from '../../core/types.js'
import type { CardCounters, CardEffectsState } from './effects.js'
import { applyCard } from './interpret.js'
import { deckFor } from './cards/index.js'

const zero = (order: readonly PlayerId[]): Record<PlayerId, number> =>
  Object.fromEntries(order.map((p) => [p, 0])) as Record<PlayerId, number>

export function emptyCardEffects(order: readonly PlayerId[]): CardEffectsState {
  return {
    modifiers: [], entitlements: [], poolInjections: {}, scheduledPoolTerminations: [], seq: 0,
    counters: {
      rentReceivedThisGame: zero(order), rentReceivedThisEra: zero(order),
      dirtyActionsThisGame: zero(order), launderCountThisGame: zero(order),
    },
  }
}

/**
 * Maintains the counters that E1-18, E3-16 (via peer-interest metrics), E3-19, E4-11 and
 * E4-17 rank on. `RentCharged.to` is ALREADY the actual recipient — `board`'s own
 * `rentRecipient` selector resolves to the futures holder when a contract is live before
 * the event is ever emitted — so `RentRoutedToFuture` carries no additional cash and is
 * deliberately not double-counted here; it is pure attribution for the securitization
 * waterfall. This is exactly era-decks.md section 6.11's rule ("rent counts toward
 * whoever actually receives the cash"), already true of the event as authored.
 */
function observe(state: GameState, event: GameEvent): GameState {
  const c = state.cardEffects.counters
  const bumpRent = (p: PlayerId, delta: number): CardCounters => ({
    ...c,
    rentReceivedThisGame: { ...c.rentReceivedThisGame, [p]: (c.rentReceivedThisGame[p] ?? 0) + delta },
    rentReceivedThisEra: { ...c.rentReceivedThisEra, [p]: (c.rentReceivedThisEra[p] ?? 0) + delta },
  })
  const bump = (
    key: 'dirtyActionsThisGame' | 'launderCountThisGame', p: PlayerId, delta: number,
  ): CardCounters => ({ ...c, [key]: { ...c[key], [p]: (c[key][p] ?? 0) + delta } })
  const withCounters = (counters: CardCounters): GameState =>
    ({ ...state, cardEffects: { ...state.cardEffects, counters } })

  switch (event.type) {
    case 'RentCharged':
      return withCounters(bumpRent(event.to, event.amount))
    case 'VentureLaunched':
      return withCounters(bump('dirtyActionsThisGame', event.player, 1))
    case 'CashLaundered':
      return withCounters({
        ...bump('dirtyActionsThisGame', event.player, 1),
        launderCountThisGame: {
          ...c.launderCountThisGame,
          [event.player]: (c.launderCountThisGame[event.player] ?? 0) + 1,
        },
      })
    case 'BriberyUsed':
    case 'InsiderTradingUsed':
      return withCounters(bump('dirtyActionsThisGame', event.player, 1))
    case 'EraAdvanced':
      return withCounters({
        ...c,
        rentReceivedThisEra: zero(Object.keys(c.rentReceivedThisEra) as PlayerId[]),
      })
    case 'PhaseAdvanced':
      return expireOn(state, event.phase)
    default:
      return state
  }
}

/** Expires modifiers and entitlements at their recorded boundary. */
function expireOn(state: GameState, phase: GameState['phase']): GameState {
  const round = state.round
  const live = (x: { readonly expiry: { readonly boundary: string; readonly round: number } }): boolean => {
    switch (x.expiry.boundary) {
      case 'never': return true
      case 'round': return round <= x.expiry.round
      case 'open-phase': return round < x.expiry.round || phase !== 'movement'
      case 'settlement': return round <= x.expiry.round
      default: return true
    }
  }
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      modifiers: state.cardEffects.modifiers.filter(live),
      entitlements: state.cardEffects.entitlements.filter((e) => live(e) && e.remaining > 0),
    },
  }
}

export function reduceDecks(state: GameState, event: GameEvent): GameState {
  const observed = observe(state, event)
  switch (event.type) {
    case 'DeckShuffled': {
      const deck = observed.decks[event.era]
      return {
        ...observed,
        decks: { ...observed.decks, [event.era]: { ...deck, order: event.order, drawn: 0 } },
      }
    }
    case 'CardDrawn': {
      const deck = observed.decks[event.era]
      const authored = deck.order[event.index]
      if (authored === undefined) return observed
      const card = deckFor(event.era)[authored]
      if (card === undefined) return observed
      const applied = applyCard(observed, card, event.player)
      return {
        ...applied,
        decks: { ...applied.decks, [event.era]: { ...deck, drawn: deck.drawn + 1 } },
      }
    }
    case 'DeckReordered': {
      const deck = observed.decks[event.era]
      return {
        ...observed,
        decks: { ...observed.decks, [event.era]: { ...deck, order: event.order } },
      }
    }
    default:
      return observed
  }
}
