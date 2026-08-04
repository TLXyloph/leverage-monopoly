import { JAIL_SQUARE } from '../../config/board.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState, PlayerState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { isDoubles, shortfall } from './selectors.js'

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

/**
 * Step 1 of the obligation waterfall: the Treasury is paid the full obligation
 * and the payer's clean cash floors at zero. The gap is closed by the paired
 * ObligationCapitalised event, which the credit context reduces.
 */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const cash = state.players[id].cleanCash
  return {
    ...withPlayer(state, id, { cleanCash: cash - (amount - shortfall(cash, amount)) }),
    treasury: state.treasury + amount,
  }
}

function payFromTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  return {
    ...withPlayer(state, id, { cleanCash: state.players[id].cleanCash + amount }),
    treasury: state.treasury - amount,
  }
}

/** Step 1 of the waterfall for a player-to-player obligation. */
export function transfer(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  amount: Money,
): GameState {
  const cash = state.players[from].cleanCash
  const paid = amount - shortfall(cash, amount)
  const afterPayer = withPlayer(state, from, { cleanCash: cash - paid })
  return withPlayer(afterPayer, to, {
    cleanCash: afterPayer.players[to].cleanCash + amount,
  })
}

export function reduceBoard(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'DiceRolled': {
      const player = state.players[event.player]
      return {
        ...withPlayer(state, event.player, {
          consecutiveDoubles: isDoubles(event.dice)
            ? player.consecutiveDoubles + 1
            : 0,
        }),
        activePlayer: event.player,
      }
    }
    case 'TokenMoved':
      return withPlayer(state, event.player, { position: event.to })
    case 'SentToJail':
      return withPlayer(state, event.player, {
        position: JAIL_SQUARE,
        inJail: true,
        consecutiveDoubles: 0,
      })
    case 'JailExited':
      return payTreasury(
        withPlayer(state, event.player, { inJail: false }),
        event.player,
        event.fee,
      )
    case 'SalaryPaid':
      return payFromTreasury(state, event.player, event.amount)
    case 'TaxPaid':
      return payTreasury(state, event.player, event.amount)
    case 'RentCharged':
      return transfer(state, event.from, event.to, event.amount)
    default:
      return state
  }
}
