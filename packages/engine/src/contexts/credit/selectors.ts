import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { DeedState, GameState, PeerLoan } from '../../core/state.js'
import type { ContractId, Money, PlayerId } from '../../core/types.js'

export function deedsOwnedBy(state: GameState, player: PlayerId): readonly DeedState[] {
  return Object.values(state.deeds).filter((d) => d.owner === player)
}

/** Settlement step 3 reads this count directly; the liquidation queue (Task 10) will too. */
export function unmortgagedDeedCount(state: GameState, player: PlayerId): number {
  return deedsOwnedBy(state, player).filter((d) => !d.mortgaged).length
}

/**
 * Spec section 8. A CDS writer must post CDS_COLLATERAL_RATE (30%) of notional against
 * their borrowing base for the life of the swap, which is what prevents unlimited
 * writing. It lives in `credit` rather than `securitization` because `credit` owns
 * `borrowingBase` and the dependency arrow runs securitization -> credit, never back;
 * `state.swaps` is core state (Task 2), so reading it here is not a context import.
 * Reads as 0 until Task 17 gives any player a written swap.
 */
export function swapCollateralPosted(state: GameState, player: PlayerId): Money {
  return state.swaps
    .filter((s) => s.seller === player && s.status === 'active')
    .reduce((sum, s) => sum + floorPercent(s.notional, ECONOMY.CDS_COLLATERAL_RATE), 0)
}

/** The player's currently drawn credit-line balance. Exported directly for
 * `securitization`'s leverage term, which needs it without recomputing the base. */
export function drawnCredit(state: GameState, player: PlayerId): Money {
  return state.players[player].drawnCredit
}

/**
 * Spec section 5. DEED_ADVANCE_RATE (75%) against unmortgaged deed face value plus
 * BUILDING_ADVANCE_RATE (50%) against building cost, each floored independently and
 * summed. Then, in this order:
 *
 * 1. A credit-impaired player (peer-loan default, spec section 7) has the total halved
 *    and floored, permanently. Spec 19.10 makes that a single halving no matter how many
 *    times they default, which the boolean `creditImpaired` flag gives for free.
 * 2. CDS collateral posted (spec section 8) comes off what is left.
 *
 * Floored at zero: a base is a quantity of available credit and cannot be negative.
 * `creditHeadroom`, below, is what stays signed.
 */
export function borrowingBase(state: GameState, player: PlayerId): Money {
  const eligible = deedsOwnedBy(state, player).filter((d) => !d.mortgaged)
  const face = eligible.reduce((sum, d) => sum + d.faceValue, 0)
  const buildings = eligible.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  const gross =
    floorPercent(face, ECONOMY.DEED_ADVANCE_RATE) +
    floorPercent(buildings, ECONOMY.BUILDING_ADVANCE_RATE)
  const halved = state.players[player].creditImpaired ? Math.floor(gross / 2) : gross
  return Math.max(0, halved - swapCollateralPosted(state, player))
}

/**
 * borrowingBase - drawnCredit. Deliberately SIGNED, not floored at zero: a negative
 * headroom is exactly a margin breach (spec section 5), which Task 10's flagging logic
 * reads directly. Callers that want a non-negative "room to spend" figure clamp with
 * `Math.max(0, ...)` themselves.
 */
export function creditHeadroom(state: GameState, player: PlayerId): Money {
  return borrowingBase(state, player) - drawnCredit(state, player)
}

/** Settlement step 3. Flat per unmortgaged deed, from round 1. Buildings are exempt. */
export function carryingCostFor(state: GameState, player: PlayerId): Money {
  return unmortgagedDeedCount(state, player) * ECONOMY.CARRYING_COST_PER_DEED
}

/**
 * The era's prevailing per-round interest rate. Deliberately NOT re-exported from
 * `contexts/credit/index.ts`: `session` already exports a `prevailingRate` with the
 * identical signature (Task 4), and re-exporting both from the package root would make
 * `export *` ambiguous and fail the build. `settlement.ts` and `decide.ts` import it
 * directly from this module instead.
 */
export function prevailingRate(state: GameState): number {
  return ECONOMY.INTEREST_RATE_BY_ERA[state.era]
}

/** Settlement step 4. Floored. */
export function creditInterestDue(state: GameState, player: PlayerId): Money {
  return floorPercent(drawnCredit(state, player), prevailingRate(state))
}

/** Lookup by contract id, whatever its status. No peer loans originate until Task 11,
 * so `state.loans` is empty for the whole of Task 9; this is here now because
 * `securitization` (Task 16) needs the exact signature from `contexts/credit/index.ts`. */
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined {
  return state.loans.find((l) => l.id === id)
}
