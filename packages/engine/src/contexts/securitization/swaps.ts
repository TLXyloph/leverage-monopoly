import type { ContractId, Money, PlayerId } from '../../core/types.js'
import type { GameState, Swap, SwapReference, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import { findPeerLoan } from '../credit/index.js'
import { findPool, trancheOf } from './selectors.js'
import { reduceSecuritization } from './reduce.js'

/**
 * The face value of the reference obligation, which caps the notional at origination.
 * A loan note's face is its principal. A tranche's face is its stored face, which for
 * equity is its spec 19.3 residual claim. Returns null when the obligation does not
 * exist, or is no longer live (a repaid/defaulted note, a terminated pool).
 */
export function referenceFace(state: GameState, ref: SwapReference): Money | null {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined || loan.status !== 'active' ? null : loan.principal
  }
  const pool = findPool(state, ref.poolId)
  if (pool === undefined || pool.terminated) return null
  return trancheOf(pool, ref.tranche)?.face ?? null
}

/** What the seller keeps out of their borrowing base for the life of the swap. */
export function requiredCollateral(notional: Money): Money {
  return floorPercent(notional, ECONOMY.CDS_COLLATERAL_RATE)
}

/**
 * The obligation waterfall, spec 19.8: the recipient is paid the FULL amount; any
 * shortfall in the payer's clean cash capitalises into the payer's own drawn credit
 * balance, uncapped, via a paired `ObligationCapitalised` event — exactly like rent,
 * peer-loan interest and every other obligation the waterfall governs. It is never
 * `DistressedDebtIncurred`: that event is reserved for the terminal state an uncured
 * margin call reaches only after forced liquidation is exhausted (spec 19.7), which a
 * single unpaid premium or payout does not by itself cause. No Treasury leg either
 * way — both legs of a swap are player-to-player.
 */
function obligationShortfall(
  state: GameState,
  payer: PlayerId,
  amount: Money,
  obligation: 'cds-premium' | 'cds-payout',
): readonly GameEvent[] {
  const shortfall = Math.max(0, amount - state.players[payer].cleanCash)
  return shortfall > 0
    ? [{ type: 'ObligationCapitalised', player: payer, amount: shortfall, obligation }]
    : []
}

/**
 * Settlement step 7, spec 19.1. The buyer pays the negotiated premium to the seller
 * every Settlement, for as long as the swap is active.
 *
 * `working` is folded through `reduceSecuritization` after every swap, and each
 * shortfall is priced against it rather than against the fixed `state` snapshot this
 * function was called with. Task 20 found the un-threaded version: a buyer paying
 * premiums on two or more swaps in the same round had every shortfall after the first
 * priced against their ORIGINAL clean cash, ignoring what the earlier swaps in this
 * very loop had already spent — `SwapPremiumPaid` itself floors the payer's live cash
 * correctly (via `transfer`/`subCash` in `reduce.ts`), so the two disagreed: the
 * recipient was credited the full premium every time, but the payer's total
 * capitalised shortfall came in short of what their floored cash actually needed,
 * manufacturing the gap as money the conservation identity in spec section 20 could
 * not account for. Mirrors `settlePeerLoans`'s identical `applyLocally`/`working`
 * pattern in `credit/decide.ts` for the same reason: the first coupon spends the cash
 * the second was counting on.
 */
export function settleSwapPremiums(state: GameState): readonly GameEvent[] {
  const out: GameEvent[] = []
  let working = state
  for (const s of state.swaps) {
    if (s.status !== 'active' || s.premiumPerRound <= 0) continue
    const batch: GameEvent[] = [{ type: 'SwapPremiumPaid', id: s.id, amount: s.premiumPerRound }]
    batch.push(...obligationShortfall(working, s.buyer, s.premiumPerRound, 'cds-premium'))
    out.push(...batch)
    working = batch.reduce(reduceSecuritization, working)
  }
  return out
}

/**
 * A triggered swap always pays the FULL notional — it was already capped at the
 * reference obligation's face at origination, so there is nothing left to cap here.
 *
 * Scoring interaction (Task 19, not implemented here): the payout already moves as
 * cash in this very event — into the buyer's clean cash, and out of the seller's clean
 * cash or (on a shortfall) into their drawn credit. A future net-worth calculation
 * must NOT separately deduct the notional from the seller's score: the loss is already
 * sitting in their balance sheet via this event, and subtracting it again would
 * double-count it.
 */
function payoutEvents(state: GameState, swap: Swap, payout: Money): readonly GameEvent[] {
  return [
    { type: 'SwapTriggered', id: swap.id, payout },
    ...obligationShortfall(state, swap.seller, payout, 'cds-payout'),
  ]
}

/**
 * The credit event for a loan-note CDS is borrower default, spec section 8. Folded
 * into Settlement step 6, immediately after the pool waterfalls: `roundEvents` already
 * carries this round's `PeerLoanDefaulted` events from Settlement step 5. Fires for
 * every active referencing swap, naked or not — the buyer need not hold the note.
 *
 * `working` is threaded through `reduceSecuritization` between swaps for the same
 * reason `settleSwapPremiums` above threads it: a seller who wrote protection on two
 * or more swaps that trigger in the same round must have the second payout's
 * shortfall priced against what the first payout already spent, not against the
 * stale `state` this function was called with.
 */
export function loanCreditEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const defaulted = new Set(
    roundEvents
      .filter((e): e is Extract<GameEvent, { type: 'PeerLoanDefaulted' }> => e.type === 'PeerLoanDefaulted')
      .map((e) => e.id),
  )
  const out: GameEvent[] = []
  let working = state
  for (const s of state.swaps) {
    if (s.status !== 'active') continue
    const ref = s.reference
    if (ref.kind !== 'peer-loan' || !defaulted.has(ref.id)) continue
    const batch = payoutEvents(working, s, s.notional)
    out.push(...batch)
    working = batch.reduce(reduceSecuritization, working)
  }
  return out
}

/**
 * The credit event for a tranche CDS is the tranche receiving less than its full face
 * by pool termination, so tranche swaps settle at termination — including the forced
 * termination at the end of round 24, spec section 8, which is exactly what makes the
 * final round dangerous for anyone who wrote protection. A tranche paid in full at
 * termination lets its referencing swaps expire worthless instead.
 */
export function trancheCreditEvents(
  state: GameState,
  poolId: ContractId,
  shortfalls: readonly { readonly tranche: Tranche['kind']; readonly shortfall: Money }[],
): readonly GameEvent[] {
  const out: GameEvent[] = []
  // See `loanCreditEvents` above: threaded for the same reason — a seller who wrote
  // protection on two or more of this pool's tranche swaps must have the second
  // payout priced against what the first already spent.
  let working = state
  for (const s of state.swaps) {
    if (s.status !== 'active') continue
    const ref = s.reference
    if (ref.kind !== 'tranche' || ref.poolId !== poolId) continue
    const short = shortfalls.find((x) => x.tranche === ref.tranche)
    if (short === undefined || short.shortfall <= 0) {
      out.push({ type: 'SwapExpired', id: s.id })
      continue
    }
    const batch = payoutEvents(working, s, s.notional)
    out.push(...batch)
    working = batch.reduce(reduceSecuritization, working)
  }
  return out
}
