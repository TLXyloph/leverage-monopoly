import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { DeedState, GameState, PeerLoan, PlayerState } from '../../core/state.js'
import type { ColorGroup, ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'

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

/**
 * Task 10. drawnCredit - borrowingBase, SIGNED like `creditHeadroom` (its exact
 * negation) — a margin call is a positive shortfall, spec section 5. Deliberately
 * excludes `distressedDebt`: distressed debt sits outside both the drawn balance and
 * the borrowing base (spec 19.8), so it can never itself trigger a breach.
 */
export function marginShortfall(state: GameState, player: PlayerId): Money {
  return drawnCredit(state, player) - borrowingBase(state, player)
}

/** True while the player's drawn balance exceeds their borrowing base. */
export function isUnderMarginCall(state: GameState, player: PlayerId): boolean {
  return marginShortfall(state, player) > 0
}

/**
 * Spec section 5. Floor price in a forced sale: LIQUIDATION_FLOOR (80%) of face value,
 * floored. Pure over the deed record itself — no state needed — because the floor is a
 * fixed fraction of face, not of anything that changes turn to turn.
 */
export function liquidationPrice(deed: DeedState): Money {
  return floorPercent(deed.faceValue, ECONOMY.LIQUIDATION_FLOOR)
}

/**
 * Spec section 5: deeds are offered "in descending face-value order," mortgaged deeds
 * excluded (a mortgaged deed carries no equity to seize and cannot be auctioned).
 * Ties break on deed id so the order is deterministic regardless of `Object.values`
 * iteration, which is otherwise just object insertion order.
 */
export function liquidationQueue(state: GameState, player: PlayerId): readonly DeedId[] {
  return deedsOwnedBy(state, player)
    .filter((d) => !d.mortgaged)
    .slice()
    .sort((a, b) => b.faceValue - a.faceValue || a.id.localeCompare(b.id))
    .map((d) => d.id)
}

/**
 * Spec 19.1 / 19.8: a margin call flagged at Settlement step 10 of round N gives the
 * player through the end of the Open phase of round N+1 to cure, and force-liquidates
 * at the start of the Open phase of round N+2 if still breached. Null if the player
 * carries no flag at all.
 */
export function liquidationRound(state: GameState, player: PlayerId): RoundNumber | null {
  const flaggedAt = state.players[player].marginCallFlaggedAt
  return flaggedAt === null ? null : flaggedAt + 2
}

/**
 * Players whose cure window has fully elapsed — flagged, and the game has reached (or
 * passed) their liquidation round. `decideCredit`'s `SettleLiquidationLot` case is only
 * ever valid for a player in this set (spec 19.8: liquidation applies only to uncured
 * margin calls).
 */
export function playersAwaitingLiquidation(state: GameState): readonly PlayerId[] {
  return state.config.turnOrder.filter((player) => {
    const round = liquidationRound(state, player)
    return round !== null && state.round >= round
  })
}

/** Settlement step 8's per-round charge. Spec 19.7: DISTRESSED_DEBT_RATE, floored. */
export function distressedInterestDue(state: GameState, player: PlayerId): Money {
  return floorPercent(state.players[player].distressedDebt, ECONOMY.DISTRESSED_DEBT_RATE)
}

/**
 * Spec section 5. Every deed the player owns in `group`, still carrying houses, sold
 * back to the bank at BUILDING_SELLBACK_RATE of cost. All of them strip to bare land in
 * the same event, which trivially satisfies the even-build rule (there is no unevenness
 * once every deed in the group reads zero). Deliberately restricted to the *player's*
 * deeds in the group — a colour group split across owners only strips the liquidated
 * player's own buildings.
 *
 * BUILDING_SELLBACK_RATE equals BUILDING_ADVANCE_RATE exactly (both 0.5), and this sums
 * the same `houses * houseCost` term `borrowingBase` sums for its building component
 * before flooring once — so the proceeds here exactly equal the amount stripping this
 * building value removes from the borrowing base. That equality is the shortfall
 * neutrality invariant; it depends on computing the sum first and flooring once, exactly
 * as `borrowingBase` does.
 */
export function groupBuildingStrip(
  state: GameState,
  player: PlayerId,
  group: ColorGroup,
): { readonly deeds: readonly DeedId[]; readonly proceeds: Money } {
  const held = deedsOwnedBy(state, player).filter(
    (d) => d.group === group && !d.mortgaged && d.houses > 0,
  )
  const buildingValue = held.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  return {
    deeds: held.map((d) => d.id),
    proceeds: floorPercent(buildingValue, ECONOMY.BUILDING_SELLBACK_RATE),
  }
}

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

/**
 * Applies a cash inflow against a player's position: first paying down drawn credit,
 * then landing any excess on clean cash. Used by liquidation (a stripped building's
 * proceeds, a lot's sale price) to route money against the debt before it becomes spare
 * cash. Raises `sum(cleanCash) - sum(drawnCredit)` by exactly `amount` regardless of the
 * split between the two branches — the caller is responsible for debiting the matching
 * source (a buyer's cash, or the Treasury for a bank purchase) so the conservation
 * identity in spec section 20 balances.
 */
export function applyAgainstDebt(state: GameState, player: PlayerId, amount: Money): GameState {
  const p = state.players[player]
  const toDebt = Math.min(amount, p.drawnCredit)
  const toCash = amount - toDebt
  return withPlayer(state, player, {
    drawnCredit: p.drawnCredit - toDebt,
    cleanCash: p.cleanCash + toCash,
  })
}
