import type { DeedState, GameState, PeerLoan, Pool, Tranche } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { ceilPercent } from '../../core/money.js'
import { ECONOMY } from '../../config/economy.js'
import { markDeedOption, markRentFuture } from '../markets/index.js'
import { borrowerLeverage, distribute, expectedPoolCashflow } from '../securitization/index.js'

/**
 * Spec section 12 lists deeds at face value with no mortgage line. Taken literally that
 * is a free 50%-of-face gain for mortgaging on the last Open phase, so a mortgaged deed
 * marks net of what it costs to redeem: face - ceil(face x UNMORTGAGE_RATE), floored at
 * zero. Mortgaging is then mildly value-destroying, which is the intended economics.
 */
export function deedValue(deed: DeedState): Money {
  if (!deed.mortgaged) return deed.faceValue
  return Math.max(0, deed.faceValue - ceilPercent(deed.faceValue, ECONOMY.UNMORTGAGE_RATE))
}

/**
 * Buildings mark at the price actually paid — `deed.houseCost` is already the
 * HOUSE_COST_MULTIPLIER (90%) figure `config/board.ts` computed, so it is not
 * re-applied here (mirrors `board`'s own `buildingCost`). `houses` is 0-4, or 5 for a
 * hotel, so a hotel is five buildings.
 */
export function buildingCostBasis(deed: DeedState): Money {
  return deed.houseCost * deed.houses
}

export function portfolioValue(
  state: GameState, player: PlayerId,
): { readonly deeds: Money; readonly buildings: Money } {
  return Object.values(state.deeds)
    .filter((d) => d.owner === player)
    .reduce(
      (acc, d) => ({
        deeds: acc.deeds + deedValue(d),
        buildings: acc.buildings + buildingCostBasis(d),
      }),
      { deeds: 0, buildings: 0 },
    )
}

export function markRentFuturesHeld(state: GameState, player: PlayerId): Money {
  return state.futures
    .filter((f) => f.holder === player)
    .reduce((t, f) => t + markRentFuture(state, f.id), 0)
}

export function markDeedOptionsHeld(state: GameState, player: PlayerId): Money {
  return state.options
    .filter((o) => o.holder === player)
    .reduce((t, o) => t + markDeedOption(state, o.id), 0)
}

/**
 * "Expected remaining cashflow through the waterfall" — literally that. Whatever the
 * pool still expects to collect is run through the pool's own `distribute`, so the
 * mark can never disagree with what the waterfall would actually pay.
 */
export function markTranche(state: GameState, pool: Pool, kind: Tranche['kind']): Money {
  if (pool.terminated) return 0
  const paid = pool.tranches.reduce((t, tr) => t + tr.paid, 0)
  const remaining = Math.max(0, expectedPoolCashflow(state, pool) - paid)
  if (remaining === 0) return 0
  return distribute(pool, remaining).find((d) => d.tranche === kind)?.amount ?? 0
}

export function markTranchesHeld(state: GameState, player: PlayerId): Money {
  return state.pools.reduce(
    (total, pool) =>
      total
      + pool.tranches
        .filter((t) => t.holder === player)
        .reduce((t, tr) => t + markTranche(state, pool, tr.kind), 0),
    0,
  )
}

/**
 * Spec section 12: `outstanding x (1 - 0.15 x min(borrowerLeverage, 4))`. The haircut
 * rounds UP, against the note holder, so the mark is the conservative one. Marks on
 * `outstanding`, not `principal` — a fully-repaid-but-active note (status stays
 * 'active' only while `outstanding > 0`; see `reducePeerLoans`' `PeerLoanRepaid` case)
 * would otherwise mark at par instead of zero. `borrowerLeverage` already caps at
 * RATING_MAX_LEVERAGE (5); capping again at LOAN_NOTE_MAX_LEVERAGE (4) is exact because
 * min(min(x,5),4) === min(x,4).
 */
export function markLoanNote(state: GameState, loan: PeerLoan): Money {
  if (loan.status !== 'active') return 0
  const leverage = Math.min(
    borrowerLeverage(state, loan.borrower), ECONOMY.LOAN_NOTE_MAX_LEVERAGE,
  )
  const haircut = ceilPercent(loan.outstanding, ECONOMY.LOAN_NOTE_HAIRCUT_PER_TURN * leverage)
  return Math.max(0, loan.outstanding - haircut)
}

export function markLoanNotesHeld(state: GameState, player: PlayerId): Money {
  return state.loans
    .filter((l) => l.lender === player)
    .reduce((t, l) => t + markLoanNote(state, l), 0)
}

/**
 * Both sides of every swap mark at zero. Untriggered is spec section 12 verbatim —
 * the writer's exposure shows up as the 30% collateral against their borrowing base,
 * not in net worth. Triggered is zero because `SwapTriggered` moves the notional in
 * cash at the moment it fires, so the loss is already in the writer's clean cash or,
 * if they could not cover it, in their drawn credit via `ObligationCapitalised`.
 * Marking it again would count it twice — `scoring.test.ts` pins that to exactly once.
 */
export function markSwapsHeld(state: GameState, player: PlayerId): Money {
  void state
  void player
  return 0
}

export function instrumentsHeld(state: GameState, player: PlayerId): Money {
  return markRentFuturesHeld(state, player)
    + markTranchesHeld(state, player)
    + markLoanNotesHeld(state, player)
    + markDeedOptionsHeld(state, player)
    + markSwapsHeld(state, player)
}
