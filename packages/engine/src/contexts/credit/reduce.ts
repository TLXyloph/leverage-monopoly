import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'

/**
 * Step 2 of the universal obligation waterfall, spec section 19.8.
 *
 * This raises the drawn balance with NO borrowing-base check, and that is
 * deliberate. Voluntary draws (Task 9) are capped at the base; automatic
 * obligations are not. The gap the two open up is the only thing in the game
 * that produces a margin call.
 */
export function reduceCredit(state: GameState, event: GameEvent): GameState {
  if (event.type !== 'ObligationCapitalised') return state
  const player = state.players[event.player]
  return {
    ...state,
    players: {
      ...state.players,
      [event.player]: { ...player, drawnCredit: player.drawnCredit + event.amount },
    },
  }
}
