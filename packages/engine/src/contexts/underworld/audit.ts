import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'
import { auditFine, isLegal2d6, MIN_AUDITABLE_HEAT } from './selectors.js'

/**
 * Settlement step 9, spec 19.1. Runs every round; the audit check itself is
 * gated to round 13 onward but Heat decay is not.
 *
 * Per player, in turn order:
 *   1. From round 13, and only if Heat could actually lose to 2d6, roll the
 *      audit check. `audited` when the roll is <= Heat.
 *   2. On an audit: seize ALL dirty cash, fine $100 x Heat in clean cash, reset
 *      Heat to 0. No decay follows — Heat is already zero.
 *   3. Otherwise decay Heat by 1 if the player took no deliberate dirty action.
 *
 * The audit rolls against the Heat the player carried through the round; decay
 * is the reward carried into the next one.
 *
 * Any part of the fine the player cannot cover in clean cash capitalises into
 * their drawn credit balance, exactly as unpayable credit-line interest does in
 * spec section 5. That is what lets an audit fine trigger a margin call at step
 * 10 of the SAME Settlement, which spec 19.1 requires. The underworld does not
 * import `credit`; it moves `drawnCredit` through the AuditResolved event and
 * the credit context reads the raised balance when it flags at step 10.
 */
export function settleAudits(
  state: GameState, dice: Readonly<Partial<Record<PlayerId, DiceRoll>>>,
): readonly GameEvent[] | Rejection {
  const events: GameEvent[] = []
  const auditsActive = state.round >= ECONOMY.AUDIT_FIRST_ROUND

  for (const id of state.config.turnOrder) {
    const p = state.players[id]

    if (auditsActive && p.heat >= MIN_AUDITABLE_HEAT) {
      const roll = dice[id]
      if (roll === undefined) {
        return reject('INVALID_DICE',
          `${id} is carrying Heat ${p.heat} and needs a 2d6 audit roll.`)
      }
      if (!isLegal2d6(roll)) {
        return reject('INVALID_DICE',
          `${id}'s audit roll ${roll[0]} and ${roll[1]} is not a legal 2d6 result.`)
      }

      const audited = roll[0] + roll[1] <= p.heat
      events.push({ type: 'AuditChecked', player: id, dice: roll, heat: p.heat, audited })

      if (audited) {
        const fine = auditFine(p.heat)
        const paidFromCash = Math.min(fine, Math.max(0, p.cleanCash))
        events.push({
          type: 'AuditResolved', player: id,
          seized: p.dirtyCash, fine,
          paidFromCash, capitalised: fine - paidFromCash,
        })
        continue
      }
    }

    if (p.heat > 0 && !p.dirtyActionThisRound) {
      events.push({
        type: 'HeatChanged', player: id, delta: -ECONOMY.HEAT_DECAY,
        reason: 'no deliberate dirty action this round',
      })
    }
  }

  return events
}
