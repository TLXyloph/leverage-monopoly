import { ECONOMY } from '../../config/economy.js'
import type { GameState, PlayerState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

function patch(state: GameState, id: PlayerId, over: Partial<PlayerState>): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...over }
  return { ...state, players }
}

function patchAll(state: GameState, over: Partial<PlayerState>): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...state.players[id], ...over }]),
  ) as Record<PlayerId, PlayerState>
  return { ...state, players }
}

/**
 * The reducer for every underworld event. `HeatChanged` is the single place
 * `dirtyActionThisRound` is set, on any POSITIVE delta — which is exactly the
 * set of deliberate dirty actions (venture launches, the Speakeasy). Automatic
 * payouts (`DirtyCashEarned` from a running Numbers Racket, Escort Service or
 * Chop Shop) never emit `HeatChanged`, so per spec 19.9 they cannot block Heat
 * decay by construction — there is no separate flag to fall out of sync.
 */
export function reduceUnderworld(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    /**
     * Clean-funded costs go to the Treasury; dirty-funded costs are simply
     * destroyed — dirty cash has no Treasury account to land in. This is the
     * named counterparty the two-currency conservation identity requires at
     * every clean/dirty boundary crossing.
     */
    case 'VentureLaunched': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? event.cost : 0
      const dirty = event.fundedFrom === 'dirty' ? event.cost : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
          ventures: [...p.ventures, { kind: event.venture, roundsRemaining: event.rounds }],
        }),
        treasury: state.treasury + clean,
      }
    }

    /** A venture whose timer reaches zero is retired — dropped from the list. */
    case 'VentureTicked': {
      const p = state.players[event.player]
      const ventures = p.ventures
        .map((v) => (v.kind === event.venture
          ? { kind: v.kind, roundsRemaining: event.roundsRemaining }
          : v))
        .filter((v) => v.roundsRemaining > 0)
      return patch(state, event.player, { ventures })
    }

    /** Charges the fixed cost only, same clean/Treasury vs dirty/destroyed
     * split as VentureLaunched. The payout, if any, arrives as a separate
     * DirtyCashEarned. */
    case 'SpeakeasyPlayed': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? ECONOMY.SPEAKEASY_COST : 0
      const dirty = event.fundedFrom === 'dirty' ? ECONOMY.SPEAKEASY_COST : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
        }),
        treasury: state.treasury + clean,
      }
    }

    /** The ONLY event that increases dirty cash. Created from nothing — dirty
     * cash is outside the conserved clean-money identity, so this has no
     * Treasury counterparty by design. */
    case 'DirtyCashEarned': {
      const p = state.players[event.player]
      return patch(state, event.player, { dirtyCash: p.dirtyCash + event.amount })
    }

    case 'HeatChanged': {
      const p = state.players[event.player]
      return patch(state, event.player, {
        heat: Math.max(0, p.heat + event.delta),
        dirtyActionThisRound: p.dirtyActionThisRound || event.delta > 0,
      })
    }

    /** Laundering (Task 13) may run once per Open phase. */
    case 'PhaseAdvanced':
      return event.phase === 'open'
        ? patchAll(state, { launderedThisPhase: false })
        : state

    /** Every per-round underworld flag resets at the round boundary, including
     * `dirtyActionThisRound` — spec 19.9's decay eligibility for the round ahead. */
    case 'RoundAdvanced':
      return patchAll(state, {
        briberyUsedThisRound: false,
        dirtyActionThisRound: false,
        insiderRevealedThisRound: false,
        rerollForced: false,
        cardCancelled: false,
      })

    default:
      return state
  }
}
