import { ECONOMY } from '../../config/economy.js'
import type { GameEvent, ObligationKind } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import {
  carryingCostFor, creditInterestDue, prevailingRate, unmortgagedDeedCount,
} from './selectors.js'

/** Era II opens at the round after Era I ends. Spec section 2. */
export const STIMULUS_ROUND: number = ECONOMY.ROUNDS_PER_ERA + 1

/**
 * Spec section 4. The Treasury advances every player ERA_II_STIMULUS at the start of
 * round 7 as an interest-bearing loan, not a grant: it lands on clean cash AND on the
 * drawn credit balance, so Settlement step 4 charges the era rate on it from that round.
 * Called by `session` on entering the Market phase.
 */
export function advanceEraIIStimulus(state: GameState): readonly GameEvent[] {
  if (state.round !== STIMULUS_ROUND || state.phase !== 'market') return []
  return state.config.turnOrder.map((player) => ({
    type: 'StimulusAdvanced' as const,
    player,
    amount: ECONOMY.ERA_II_STIMULUS,
  }))
}

/**
 * Step 2 of the universal obligation waterfall, spec 19.8: clean cash pays as far as
 * it goes; any shortfall capitalises into the drawn balance, UNCAPPED — the borrowing
 * base is deliberately not consulted here. Mirrors `board/decide.ts`'s `capitalise`
 * helper exactly, so the identical rule reads identically in both contexts.
 */
function capitalise(
  events: GameEvent[],
  player: PlayerId,
  cleanCash: Money,
  amount: Money,
  obligation: ObligationKind,
): void {
  const unpaid = Math.max(0, amount - cleanCash)
  if (unpaid > 0) events.push({ type: 'ObligationCapitalised', player, amount: unpaid, obligation })
}

/**
 * Settlement step 3. CARRYING_COST_PER_DEED per unmortgaged deed, to the Treasury.
 * Spec 19.8: a shortfall capitalises into drawn credit, uncapped — it is NOT distressed
 * debt. Distressed debt is Task 10's terminal state only (uncured margin call, forced
 * liquidation exhausted, no unmortgaged deeds left).
 */
export function settleCarryingCost(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = carryingCostFor(state, player)
    if (amount === 0) continue
    events.push({
      type: 'CarryingCostCharged',
      player,
      deeds: unmortgagedDeedCount(state, player),
      amount,
    })
    capitalise(events, player, state.players[player].cleanCash, amount, 'carrying-cost')
  }
  return events
}

/**
 * Settlement step 4. Interest on the drawn balance at the era rate, floored, paid to
 * the Treasury. A player who cannot pay in full from clean cash capitalises the
 * shortfall through the same waterfall as step 3 — partially, "as far as it goes"
 * (spec 19.8), never all-or-nothing. `InterestAccrued` itself carries no `capitalised`
 * flag; whether any of it capitalised is visible only via a paired ObligationCapitalised
 * event, exactly as for carrying cost.
 */
export function settleCreditInterest(state: GameState): readonly GameEvent[] {
  const rate = prevailingRate(state)
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = creditInterestDue(state, player)
    if (amount === 0) continue
    events.push({ type: 'InterestAccrued', player, amount, rate })
    capitalise(events, player, state.players[player].cleanCash, amount, 'interest')
  }
  return events
}
