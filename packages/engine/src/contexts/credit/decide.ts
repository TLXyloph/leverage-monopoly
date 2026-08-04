import { isWholeDollars } from '../../core/money.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { creditHeadroom } from './selectors.js'

/**
 * Functions owned by the `markets` context that liquidation (Task 10) needs (spec
 * 19.12). They are injected rather than imported because spec section 14 makes
 * `markets` depend on `credit`, so a direct import here would invert the context
 * dependency graph and cycle. The root decider, which may import both contexts,
 * supplies the real implementations. Declared now so `decideCredit`'s signature does
 * not change once liquidation lands.
 */
export interface CreditPorts {
  /** Remaining expected value of any rent future on this deed, or 0 if there is none. */
  readonly rentFutureMakeWhole: (state: GameState, deed: DeedId) => Money
  /** Premium to refund on any deed option on this deed, or 0 if there is none. */
  readonly deedOptionRefund: (state: GameState, deed: DeedId) => Money
}

/** Safe default for states that carry no futures or options. */
export const NO_ENCUMBRANCES: CreditPorts = {
  rentFutureMakeWhole: () => 0,
  deedOptionRefund: () => 0,
}

export type CreditCommand =
  | { readonly type: 'DrawCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'RepayCredit'; readonly player: PlayerId; readonly amount: Money }

export function decideCredit(
  state: GameState,
  command: CreditCommand,
  ports: CreditPorts = NO_ENCUMBRANCES,
): readonly GameEvent[] | Rejection {
  void ports // consumed once liquidation (Task 10) lands
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Financial actions are only available during the Open phase.')
  }

  switch (command.type) {
    case 'DrawCredit': {
      if (!isWholeDollars(command.amount) || command.amount <= 0) {
        return reject('INVALID_AMOUNT', 'Draw at least $1, in whole dollars.')
      }
      // Spec 19.8: voluntary draws are always capped at the borrowing base. This is
      // the asymmetric half of the waterfall — automatic obligations (settlement.ts)
      // capitalise past this same headroom without regard to it.
      const headroom = creditHeadroom(state, command.player)
      if (command.amount > headroom) {
        return reject(
          'INSUFFICIENT_BORROWING_BASE',
          `Your borrowing base allows at most $${Math.max(0, headroom)} more.`,
        )
      }
      return [{ type: 'CreditDrawn', player: command.player, amount: command.amount }]
    }

    case 'RepayCredit': {
      const p = state.players[command.player]
      if (!isWholeDollars(command.amount) || command.amount <= 0) {
        return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
      }
      if (command.amount > p.drawnCredit) {
        return reject('INVALID_AMOUNT', `You owe only $${p.drawnCredit} on your credit line.`)
      }
      if (command.amount > p.cleanCash) {
        return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${p.cleanCash} in clean cash.`)
      }
      return [{ type: 'CreditRepaid', player: command.player, amount: command.amount }]
    }
  }
}
