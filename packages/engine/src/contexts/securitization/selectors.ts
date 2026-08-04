import type { ContractId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState, PeerLoan, Pool, PoolAssetRef, Tranche } from '../../core/state.js'
import { floorPercent } from '../../core/money.js'
import { findPeerLoan } from '../credit/index.js'
import { markDeedOption, markRentFuture } from '../markets/index.js'

export function findPool(state: GameState, id: ContractId): Pool | undefined {
  return state.pools.find((p) => p.id === id)
}

export function trancheOf(pool: Pool, kind: Tranche['kind']): Tranche | undefined {
  return pool.tranches.find((t) => t.kind === kind)
}

export function trancheFace(pool: Pool, kind: Tranche['kind']): Money {
  return trancheOf(pool, kind)?.face ?? 0
}

/**
 * The claim standing ahead of and including this tranche, for the coverage formula
 * (spec section 8). Equity carries a stored face equal to its spec 19.3 residual claim
 * (`expectedPoolCashflow - seniorFace - mezzanineFace`, fixed at pool creation), so the
 * cumulative claim through equity equals the pool's expected cashflow as measured at
 * creation, and its coverage evaluates to approximately 1.0.
 */
export function cumulativeClaim(pool: Pool, kind: Tranche['kind']): Money {
  const senior = trancheFace(pool, 'senior')
  if (kind === 'senior') return senior
  const throughMezz = senior + trancheFace(pool, 'mezzanine')
  if (kind === 'mezzanine') return throughMezz
  return throughMezz + trancheFace(pool, 'equity')
}

/**
 * Senior and mezzanine retire once paid to face. Equity is spec 19.3's uncapped
 * residual: its stored `face` is a claim marker for coverage and CDS notional, never a
 * cap, so it keeps receiving the residual for the life of the pool and never retires.
 */
export function isRetired(t: Tranche): boolean {
  return t.kind !== 'equity' && t.paid >= t.face
}

export function assetKey(ref: PoolAssetRef): string {
  return `${ref.kind}:${ref.id}`
}

/**
 * Every asset currently locked inside a live (non-terminated) pool. `credit` and
 * `markets` derive the identical set straight off `state.pools` themselves — the
 * dependency arrow runs securitization -> credit/markets, never back, so they cannot
 * import this selector — but this is the canonical definition the two must agree with.
 */
export function pooledAssetKeys(state: GameState): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const pool of state.pools) {
    if (pool.terminated) continue
    for (const ref of pool.assets) keys.add(assetKey(ref))
  }
  return keys
}

/**
 * The player standing behind an asset's cashflow, for concentration and leverage
 * (Task 17). A loan's obligor is its borrower. A rent future's obligor is the deed's
 * owner, because that owner's building and mortgaging decisions govern the cashflow. A
 * deed option's obligor is its writer, who must deliver the deed on exercise. Reads
 * `state.futures`/`state.options` directly rather than through a `markets` lookup —
 * both are core state (Task 2), so this is not a context import, and `markets` exports
 * no lookup by contract id for either.
 */
export function assetObligor(state: GameState, ref: PoolAssetRef): PlayerId | null {
  if (ref.kind === 'peer-loan') return findPeerLoan(state, ref.id)?.borrower ?? null
  if (ref.kind === 'rent-future') {
    const future = state.futures.find((f) => f.id === ref.id)
    if (future === undefined) return null
    const owner = state.deeds[future.deed]?.owner
    return owner === undefined || owner === null || owner === 'bank' ? null : owner
  }
  return state.options.find((o) => o.id === ref.id)?.writer ?? null
}

/**
 * Outstanding plus simple interest for every round left to run. Mirrors `credit`'s
 * `peerLoanInterestDue`: floors `floorPercent(outstanding, ratePerRound)` once per
 * round, never on a sum across rounds, so this can never disagree with what `credit`
 * actually charges each Settlement.
 */
export function expectedLoanCashflow(loan: PeerLoan, round: RoundNumber): Money {
  if (loan.status !== 'active') return 0
  const remaining = Math.max(0, loan.maturesAtRound - round)
  return loan.outstanding + floorPercent(loan.outstanding, loan.ratePerRound) * remaining
}

/**
 * A pooled deed option contributes its spec section 12 mark to expected cashflow. It
 * produces waterfall cash only if it were resold while pooled, which the live-pool
 * guard in `markets/decide-options.ts` forbids; exercising it yields a deed, and deeds
 * cannot be distributed through a waterfall (spec 19.4).
 */
export function expectedAssetCashflow(state: GameState, ref: PoolAssetRef): Money {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined ? 0 : expectedLoanCashflow(loan, state.round)
  }
  if (ref.kind === 'rent-future') return markRentFuture(state, ref.id)
  return markDeedOption(state, ref.id)
}

export function expectedPoolCashflow(state: GameState, pool: Pool): Money {
  return pool.assets.reduce((sum, ref) => sum + expectedAssetCashflow(state, ref), 0)
}

/** An asset has run its course when it has matured, defaulted, expired or lapsed. */
export function assetIsResolved(state: GameState, ref: PoolAssetRef): boolean {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined || loan.status !== 'active'
  }
  if (ref.kind === 'rent-future') {
    const future = state.futures.find((f) => f.id === ref.id)
    return future === undefined || future.endRound <= state.round
  }
  const option = state.options.find((o) => o.id === ref.id)
  return option === undefined || option.expiry <= state.round
}

/** Spec section 8: a pool is ready to terminate once every underlying asset has run
 * its course. Deliberately excludes an already-terminated pool. */
export function poolIsExhausted(state: GameState, pool: Pool): boolean {
  return !pool.terminated && pool.assets.every((ref) => assetIsResolved(state, ref))
}
