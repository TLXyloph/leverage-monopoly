import type { GameEvent } from '../../core/events.js'
import type { GameState, PlayerState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

/** The part of an obligation the payer's clean cash cannot cover. Mirrors `board`'s
 * identically-named selector so the same rule reads the same way in both contexts. */
function shortfall(cash: Money, amount: Money): Money {
  return Math.max(0, amount - cash)
}

/**
 * Step 1 of the obligation waterfall, spec section 19.8: the Treasury is paid the FULL
 * obligation and the payer's clean cash pays only as far as it goes. The gap, if any, is
 * closed by a separately-emitted ObligationCapitalised event (below), which is what keeps
 * the books balanced — the player effectively draws the shortfall from their credit line
 * and forwards it straight to the Treasury, so the Treasury sees the whole amount even
 * though no more than `cash` ever left clean cash.
 */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const cash = state.players[id].cleanCash
  const paid = amount - shortfall(cash, amount)
  return {
    ...withPlayer(state, id, { cleanCash: cash - paid }),
    treasury: state.treasury + amount,
  }
}

export function reduceCredit(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'CreditDrawn': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
    }

    case 'CreditRepaid': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        drawnCredit: p.drawnCredit - event.amount,
      })
    }

    /**
     * Spec section 5: interest is paid to the Treasury. `InterestAccrued` carries no
     * `capitalised` flag (Task 2's contract) — any shortfall is closed by a separate
     * ObligationCapitalised event emitted alongside it, so this case only ever touches
     * cash and the Treasury, exactly like `CarryingCostCharged` below.
     */
    case 'InterestAccrued':
      return payTreasury(state, event.player, event.amount)

    /** Spec section 4: the Era II stimulus is a loan, not a grant — it lands on clean
     * cash AND the drawn balance together, and leaves the Treasury. */
    case 'StimulusAdvanced': {
      const p = state.players[event.player]
      return {
        ...withPlayer(state, event.player, {
          cleanCash: p.cleanCash + event.amount,
          drawnCredit: p.drawnCredit + event.amount,
        }),
        treasury: state.treasury - event.amount,
      }
    }

    /** Settlement step 3, spec section 4. Same shortfall handling as InterestAccrued. */
    case 'CarryingCostCharged':
      return payTreasury(state, event.player, event.amount)

    /**
     * Step 2 of the universal obligation waterfall, spec section 19.8.
     *
     * This raises the drawn balance with NO borrowing-base check, and that is
     * deliberate. Voluntary draws (Task 9) are capped at the base; automatic
     * obligations are not. The gap the two open up is the only thing in the game
     * that produces a margin call.
     */
    case 'ObligationCapitalised': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, { drawnCredit: p.drawnCredit + event.amount })
    }

    default:
      return state
  }
}
