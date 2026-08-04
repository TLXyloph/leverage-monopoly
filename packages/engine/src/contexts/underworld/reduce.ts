import { ECONOMY } from '../../config/economy.js'
import type { GameState, PlayerState } from '../../core/state.js'
import type { BriberyEffect, GameEvent } from '../../core/events.js'
import type { PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

function patch(state: GameState, id: PlayerId, over: Partial<PlayerState>): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...over }
  return { ...state, players }
}

/**
 * Exactly one of three typed effects, applied as a player flag for `board`
 * (force-reroll) or `decks` (cancel-card) to consume, or an immediate shift
 * of the briber's own margin-call clock. A standalone function so the switch
 * on `effect.kind` is not nested inside the outer event-type switch, where
 * ESLint's no-fallthrough cannot see that every branch returns.
 */
function applyBriberyEffect(
  state: GameState, player: PlayerId, effect: BriberyEffect,
): GameState {
  switch (effect.kind) {
    case 'force-reroll':
      // Consumed by `board`, which discards the target's next roll.
      return patch(state, effect.target, { rerollForced: true })
    case 'cancel-card':
      // Consumed by `decks`, which must still refuse to cancel a card
      // targeting all players. Spec section 10.
      return patch(state, player, { cardCancelled: true })
    case 'delay-margin-call': {
      const flagged = state.players[player].marginCallFlaggedAt
      return flagged === null
        ? state
        : patch(state, player, { marginCallFlaggedAt: flagged + 1 })
    }
  }
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

    /** The Treasury funds the clean side of a launder; the dirty consumed is
     * destroyed. The haircut is the Treasury's gain. */
    case 'CashLaundered': {
      const p = state.players[event.player]
      return {
        ...patch(state, event.player, {
          dirtyCash: p.dirtyCash - event.dirtyIn,
          cleanCash: p.cleanCash + event.cleanOut,
          launderedThisPhase: true,
        }),
        treasury: state.treasury - event.cleanOut,
      }
    }

    /** The check itself moves nothing. AuditResolved carries every consequence. */
    case 'AuditChecked':
      return state

    /**
     * Seizes ALL dirty cash (destroyed, no counterparty), fines $100 x Heat to
     * the Treasury, and resets Heat to 0. Whatever clean cash cannot cover
     * capitalises into drawnCredit the way unpayable interest does — which is
     * what lets this fine trigger a margin call at Settlement step 10 of the
     * SAME round, per spec 19.1.
     */
    case 'AuditResolved': {
      const p = state.players[event.player]
      return {
        ...patch(state, event.player, {
          dirtyCash: 0,
          cleanCash: p.cleanCash - event.paidFromCash,
          drawnCredit: p.drawnCredit + event.capitalised,
          heat: 0,
        }),
        treasury: state.treasury + event.fine,
      }
    }

    /** Bribery is payable in dirty cash only, which is destroyed — never
     * banked. Exactly one of three typed effects lands as a player flag. */
    case 'BriberyUsed': {
      const p = state.players[event.player]
      const paid = patch(state, event.player, {
        dirtyCash: p.dirtyCash - event.cost,
        briberyUsedThisRound: true,
      })
      return applyBriberyEffect(paid, event.player, event.effect)
    }

    /** Clean-funded costs go to the Treasury; dirty-funded costs are
     * destroyed — same split as VentureLaunched and SpeakeasyPlayed. */
    case 'InsiderTradingUsed': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? event.cost : 0
      const dirty = event.fundedFrom === 'dirty' ? event.cost : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
          insiderRevealedThisRound: true,
        }),
        treasury: state.treasury + clean,
      }
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
