import type { Money } from '../../core/types.js'
import type { GameState, Pool, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { pendingPoolInjections, scheduledPoolTerminations } from '../../core/card-effects.js'
import { collateralLiquidationProceeds, findPeerLoan } from '../credit/index.js'
import { assetKey, poolIsExhausted, trancheOf } from './selectors.js'
import { reduceSecuritization } from './reduce.js'
import { loanCreditEvents, trancheCreditEvents } from './swaps.js'

export interface Distribution {
  readonly tranche: Tranche['kind']
  readonly amount: Money
}

/**
 * Strict priority (spec section 8): senior to its remaining face, then mezzanine to its
 * remaining face, then equity takes the residual. No rounding occurs — every figure is
 * already an integer dollar amount and this function only takes minima and subtracts —
 * so the distributions can never sum above `collected`. Equity is uncapped, so once
 * senior and mezzanine are satisfied the entire remainder goes to it: the distributions
 * sum to EXACTLY `collected`, not merely at most.
 */
export function distribute(pool: Pool, collected: Money): readonly Distribution[] {
  let remaining = Math.max(0, Math.floor(collected))
  const out: Distribution[] = []

  for (const kind of ['senior', 'mezzanine'] as const) {
    if (remaining <= 0) break
    const t = trancheOf(pool, kind)
    if (t === undefined) continue
    const owed = Math.max(0, t.face - t.paid)
    const paid = Math.min(owed, remaining)
    if (paid > 0) {
      out.push({ tranche: kind, amount: paid })
      remaining -= paid
    }
  }

  if (remaining > 0 && trancheOf(pool, 'equity') !== undefined) {
    out.push({ tranche: 'equity', amount: remaining })
  }

  return out
}

/**
 * All cash the pool's underlying assets collected this round. Derived from the round's
 * events rather than stored on the pool, because rent routes to a future during
 * Movement while loan interest and repayment fall due at Settlement step 5, and both
 * must land in the same waterfall at step 6. `RentRoutedToFuture` carries the amount as
 * attribution only — the payment itself already moved via `RentCharged`, processed by
 * `board`'s reducer — so this reads the attributed amount, not a second payment.
 */
export function collectedThisRound(pool: Pool, roundEvents: readonly GameEvent[]): Money {
  const keys = new Set(pool.assets.map(assetKey))
  let total = 0
  for (const e of roundEvents) {
    switch (e.type) {
      case 'PeerLoanInterestPaid':
      case 'PeerLoanRepaid':
        if (keys.has(`peer-loan:${e.id}`)) total += e.amount
        break
      case 'RentRoutedToFuture':
        if (keys.has(`rent-future:${e.contract}`)) total += e.amount
        break
      case 'PoolCollateralLiquidated':
        if (e.poolId === pool.id) total += e.proceeds
        break
      // era-decks 6.5. Cash a card forced into this pool, released from Treasury
      // escrow by `session/settlement.ts` immediately before this step. It is
      // collected cash like any other, so it distributes down the same waterfall.
      case 'PoolInjectionReleased':
        if (e.poolId === pool.id) total += e.amount
        break
      default:
        break
    }
  }
  return total
}

/**
 * Spec 19.4. A peer loan inside a live pool defaulted this round, so its collateral
 * deeds are sold to the bank at `ECONOMY.LIQUIDATION_FLOOR` of face and the cash enters
 * the pool's collected cash for this round's waterfall — deeds cannot be distributed
 * through a waterfall, only cash. Delegates the per-deed floor-then-sum arithmetic to
 * `credit`'s `collateralLiquidationProceeds`, the identical formula `credit`'s own
 * forced-liquidation path uses, so the two can never disagree (Task 16's rounding
 * table). A loan with no collateral, or whose collateral proceeds floor to $0,
 * contributes nothing.
 */
export function collateralLiquidationEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const defaulted = new Set(
    roundEvents
      .filter((e): e is Extract<GameEvent, { type: 'PeerLoanDefaulted' }> => e.type === 'PeerLoanDefaulted')
      .map((e) => e.id),
  )
  const out: GameEvent[] = []
  for (const pool of state.pools) {
    if (pool.terminated) continue
    for (const ref of pool.assets) {
      if (ref.kind !== 'peer-loan' || !defaulted.has(ref.id)) continue
      const loan = findPeerLoan(state, ref.id)
      if (loan === undefined || loan.collateral.length === 0) continue
      const proceeds = collateralLiquidationProceeds(state, loan)
      if (proceeds <= 0) continue
      out.push({
        type: 'PoolCollateralLiquidated',
        poolId: pool.id,
        loanId: ref.id,
        deeds: loan.collateral,
        proceeds,
      })
    }
  }
  return out
}

interface Shortfall {
  readonly tranche: Tranche['kind']
  readonly shortfall: Money
}

function shortfallsOf(pool: Pool): readonly Shortfall[] {
  return pool.tranches
    .map((t) => ({ tranche: t.kind, shortfall: Math.max(0, t.face - t.paid) }))
    .filter((s) => s.shortfall > 0)
}

/**
 * Spec section 8: a pool terminates when all its underlying assets have matured or
 * defaulted, and (per spec 19.1) unconditionally at the end of round 24. Every tranche
 * short of its face at that moment is recorded — Task 17's CDS settlement reads this.
 */
export function terminationEvents(pool: Pool): readonly GameEvent[] {
  return [{ type: 'PoolTerminated', poolId: pool.id, shortfalls: shortfallsOf(pool) }]
}

/**
 * `terminationEvents` plus the tranche CDS credit events its shortfalls trigger (spec
 * section 8): any tranche short of its face at termination triggers its referencing
 * swap; a tranche paid in full lets its swaps expire worthless. Used by both the
 * ordinary Settlement step 6 termination path and the forced round-24 termination —
 * spec 19.1 makes the two identical in every respect except when they run.
 */
function terminationEventsWithSwaps(state: GameState, pool: Pool): readonly GameEvent[] {
  const shortfalls = shortfallsOf(pool)
  return [
    { type: 'PoolTerminated', poolId: pool.id, shortfalls },
    ...trancheCreditEvents(state, pool.id, shortfalls),
  ]
}

/**
 * Waterfall for every live pool with cash to distribute this round, plus the
 * originator's obligation-waterfall shortfall (spec 19.8: a player is never left
 * unable to pay) when their clean cash falls short of the full amount collected.
 * `state` must already reflect any collateral liquidated this round, or the
 * originator's clean cash will read stale and trigger a false shortfall.
 *
 * The shortfall capitalises via `ObligationCapitalised { obligation: 'make-whole' }`
 * rather than `DistressedDebtIncurred`. Task 20 found the original routing: spec 19.7
 * reserves distressed debt for the terminal state an uncured margin call reaches only
 * after forced liquidation is exhausted, and funding a waterfall distribution out of
 * pocket is not that state — it is an ordinary automatic obligation, uncapped, exactly
 * like every other step of spec 19.8's waterfall.
 */
export function waterfallEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const out: GameEvent[] = []
  for (const pool of state.pools) {
    if (pool.terminated) continue
    const collected = collectedThisRound(pool, roundEvents)
    if (collected <= 0) continue
    out.push({
      type: 'WaterfallPaid',
      poolId: pool.id,
      collected,
      distributions: distribute(pool, collected),
    })
    const cash = state.players[pool.originator].cleanCash
    if (cash < collected) {
      out.push({
        type: 'ObligationCapitalised',
        player: pool.originator,
        amount: collected - cash,
        obligation: 'make-whole',
      })
    }
  }
  return out
}

/**
 * Settlement step 6, spec 19.1, in order: convert defaulted pooled collateral to cash,
 * distribute every waterfall, settle loan-note CDS credit events, then terminate any
 * pool whose assets have all run their course. `roundEvents` is every event emitted
 * since this round's Market phase began, so rent routed during Movement and loan
 * interest/default from Settlement step 5 are both visible here.
 *
 * Collateral events are reduced onto a local copy of `state` BEFORE `waterfallEvents`
 * runs, so the originator's clean cash already reflects this round's collateral
 * proceeds when the distressed-debt fallback checks it — checking against the
 * pre-collateral `state` would read a stale balance and misfire. Loan-note CDS credit
 * events are read off the further-reduced state so a swap is priced against
 * post-waterfall cash, and are themselves reduced before termination runs — a swap
 * this round already marked `triggered` can never be settled a second time.
 */
export function settleSecuritization(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const collateral = collateralLiquidationEvents(state, roundEvents)
  const afterCollateral = collateral.reduce(reduceSecuritization, state)
  const seen = [...roundEvents, ...collateral]
  const waterfalls = waterfallEvents(afterCollateral, seen)
  const afterWaterfalls = waterfalls.reduce(reduceSecuritization, afterCollateral)
  const loanSwaps = loanCreditEvents(afterWaterfalls, seen)
  const after = loanSwaps.reduce(reduceSecuritization, afterWaterfalls)
  const terminations = after.pools
    .filter((pool) => poolIsExhausted(after, pool))
    .flatMap((pool) => terminationEventsWithSwaps(after, pool))
  return [...collateral, ...waterfalls, ...loanSwaps, ...terminations]
}

/** The extra round-24 step in spec 19.1: every live pool terminates, whatever its
 * assets' state, and every tranche short of face at that moment triggers its
 * referencing CDS — spec section 8's forced round-24 settlement. */
export function terminateAllPools(state: GameState): readonly GameEvent[] {
  return state.pools
    .filter((p) => !p.terminated)
    .flatMap((pool) => terminationEventsWithSwaps(state, pool))
}

/**
 * era-decks 6.5, first half. Releases every card-escrowed injection to its pool's
 * originator so Settlement step 6 can distribute it. Emitted BEFORE step 6, and only
 * for pools that are still live — an injection into a pool that has since terminated
 * has nowhere to go, and the escrow simply stays with the Treasury.
 *
 * Ordered by `state.pools`, which is append-only, so replay is exact regardless of the
 * insertion order of the `poolInjections` record.
 */
export function releasePoolInjections(state: GameState): readonly GameEvent[] {
  const pending = pendingPoolInjections(state)
  return state.pools
    .filter((p) => !p.terminated && (pending[p.id] ?? 0) > 0)
    .map((p) => ({
      type: 'PoolInjectionReleased' as const,
      poolId: p.id,
      originator: p.originator,
      amount: pending[p.id] ?? 0,
    }))
}

/**
 * era-decks 6.5, second half. Terminates every pool a card scheduled to wind down,
 * with the same shortfall-and-CDS treatment as any other termination. Runs AFTER step
 * 6 so a pool that was both injected into and scheduled for termination pays its
 * injection down the waterfall before it closes — which is the sequence the cards
 * that do both describe.
 */
export function terminateScheduledPools(state: GameState): readonly GameEvent[] {
  const scheduled = new Set(scheduledPoolTerminations(state))
  return state.pools
    .filter((p) => !p.terminated && scheduled.has(p.id))
    .flatMap((pool) => terminationEventsWithSwaps(state, pool))
}
