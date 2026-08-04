import { PLAYER_IDS } from '../../src/core/types.js'
import type { Money } from '../../src/core/types.js'
import type { GameState } from '../../src/core/state.js'
import type { EventType, GameEvent } from '../../src/core/events.js'

/**
 * The conserved quantity.
 *
 *   sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury
 *
 * The bank sits OUTSIDE the pool, and the two per-player debt counters are how the
 * pool records money the bank has lent into it. Drawing credit adds cash and adds an
 * equal claim, so it nets to zero; repaying reverses it. The Treasury sits INSIDE the
 * pool, which is why it is allowed to go negative — GO salary alone drives it to
 * -$1,400 a round before any tax comes back.
 *
 * `dirtyCash` is deliberately absent. Ventures mint it from nothing and audits destroy
 * it, so it is not money in this sense; it becomes money only at the laundering
 * boundary, where the Treasury is the named counterparty that funds `cleanOut`.
 *
 * `distressedDebt` is a term some earlier sketches of this identity omit. Without it,
 * `CreditWrittenDown` — which moves a balance from `drawnCredit` to `distressedDebt` —
 * reads as the creation of money, and it is not: both terms are subtracted, so
 * relabelling one liability as the other moves the total by exactly zero.
 */
export function conservedTotal(state: GameState): Money {
  const held = PLAYER_IDS.reduce((total, id) => {
    const p = state.players[id]
    return total + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, 0)
  return held + state.treasury
}

/**
 * Events that move money across the pool boundary and therefore MUST name a
 * counterparty inside it. The coverage test asserts the generator reaches them; the
 * conservation test asserts each one nets to zero at the batch it belongs to.
 * Membership here is documentation, not an exemption.
 */
export const BANK_CROSSING_EVENTS: readonly EventType[] = [
  'SalaryPaid', 'TaxPaid', 'JailExited', 'CarryingCostCharged', 'InterestAccrued',
  'DistressedDebtAccrued', 'DistressedDebtRepaid', 'StimulusAdvanced',
  'DraftDeedAwarded', 'DeedLiquidated', 'BuildingsStripped', 'PoolCollateralLiquidated',
  'CashLaundered', 'AuditResolved', 'VentureLaunched', 'SpeakeasyPlayed',
  'InsiderTradingUsed', 'BriberyUsed',
] as const

/**
 * Money a batch is ALLOWED to add to or remove from the conserved pool.
 *
 * The table is deliberately empty. Every boundary crossing in this engine has a named
 * counterparty inside the identity: laundering proceeds come from the Treasury, fines
 * and clean-funded costs go to it, seized dirty cash never entered the pool, and a
 * bank purchase debits the Treasury. Adding an entry here is a claim that the engine
 * creates or destroys money, and Task 20 found — and fixed at the source, rather than
 * papering over here — every case that would otherwise have needed one: the Era II
 * stimulus double-counting, four bank purchases with no Treasury counterparty, pooled
 * collateral destroying houses out of a fixed supply, and three obligation shortfalls
 * that were wrongly routed through the terminal `DistressedDebtIncurred` event instead
 * of capitalising as spec 19.8 requires.
 */
const UNCONSERVED: Partial<Record<EventType, (event: GameEvent) => Money>> = {}

export function expectedDelta(events: readonly GameEvent[]): Money {
  return events.reduce((total, event) => total + (UNCONSERVED[event.type]?.(event) ?? 0), 0)
}
