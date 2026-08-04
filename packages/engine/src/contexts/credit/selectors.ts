import { ECONOMY } from '../../config/economy.js'
import {
  borrowingBaseOverride, creditInterestWaived, entitlementOfKind, interestRateFor,
  marginThreshold,
} from '../../core/card-effects.js'
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
  // era-decks 6.2: a `cds-posting-addend` card raises the posting requirement for the
  // players it names. `borrowingBaseOverride` seeds the field with
  // ECONOMY.CDS_COLLATERAL_RATE, so an uncarded player posts exactly 30% as before.
  const rate = borrowingBaseOverride(state, player).cdsPostingRate
  return state.swaps
    .filter((s) => s.seller === player && s.status === 'active')
    .reduce((sum, s) => sum + floorPercent(s.notional, rate), 0)
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
 *
 * era-decks 6.2 lets a card redefine each term, and `borrowingBaseOverride` supplies
 * them in the canonical order this function applies: the advance RATES first (so the
 * formula itself changes before anything is summed), then the additive term, then the
 * multiplier, then CDS postings come off the result. Every field of the override is
 * seeded from the `ECONOMY` constant it replaces, so a player with no live modifier
 * computes exactly the pre-card number: `deedRate`/`buildingRate` are the ECONOMY
 * rates, `addend` is 0 and `multiplier` is 1.
 */
export function borrowingBase(state: GameState, player: PlayerId): Money {
  const override = borrowingBaseOverride(state, player)
  const eligible = deedsOwnedBy(state, player).filter((d) => !d.mortgaged)
  const face = eligible.reduce((sum, d) => sum + d.faceValue, 0)
  const buildings = eligible.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  const gross =
    floorPercent(face, override.deedRate) +
    floorPercent(buildings, override.buildingRate)
  const halved = state.players[player].creditImpaired ? Math.floor(gross / 2) : gross
  const adjusted = floorPercent(halved + override.addend, override.multiplier)
  return Math.max(0, adjusted - swapCollateralPosted(state, player))
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

/**
 * The rate this player's drawn balance actually accrues at this round. era-decks 6.2:
 * an `interest-rate-override` card replaces the era rate outright for the players it
 * names; everyone else gets `prevailingRate` unchanged. Emitted on `InterestAccrued`
 * so the log records the rate that was really charged, not the era's headline rate.
 */
export function creditInterestRate(state: GameState, player: PlayerId): number {
  if (creditInterestWaived(state, player) !== null) return 0
  return interestRateFor(state, player, prevailingRate(state))
}

/**
 * Settlement step 4. Floored.
 *
 * era-decks 6.2's `waive-credit-interest` cancels the charge outright — but only for a
 * player actually carrying a balance. A debt-free player pays the card's
 * `ifZeroBalanceCollect` instead, which is the whole point of those cards: they are a
 * subsidy for the levered, not a free pass for everyone. That flat amount rides the same
 * `InterestAccrued` event (at rate 0) so it flows through the identical Treasury leg and
 * obligation waterfall, rather than needing a second event that conservation would have
 * to learn about.
 */
export function creditInterestDue(state: GameState, player: PlayerId): Money {
  const waivedAlternative = creditInterestWaived(state, player)
  const drawn = drawnCredit(state, player)
  if (waivedAlternative !== null) return drawn > 0 ? 0 : waivedAlternative
  return floorPercent(drawn, creditInterestRate(state, player))
}

/** Lookup by contract id, whatever its status. Deliberately does not filter on status:
 * `securitization` (Task 16) reads a note at Settlement step 6, one step after `credit`
 * may have defaulted it at step 5, and needs to see it regardless. */
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined {
  return state.loans.find((l) => l.id === id)
}

/** Every loan still `active`. Settlement services these; a repaid or defaulted loan is
 * inert and drops out on its own. */
export function activeLoans(state: GameState): readonly PeerLoan[] {
  return state.loans.filter((l) => l.status === 'active')
}

/**
 * Deed ids pledged as collateral on any currently active loan (spec section 7). Locks
 * them against a second pledge, and against voluntary mortgage/trade/sale at whichever
 * command decides those actions. A forced liquidation under Task 10 outranks a peer
 * pledge and may still take one — lending against a levered borrower is risky by design.
 */
export function pledgedDeeds(state: GameState): readonly DeedId[] {
  return activeLoans(state).flatMap((l) => l.collateral)
}

/**
 * The id of the live (non-terminated) pool holding this loan as an asset, or null if the
 * note is unpooled or its pool has already wound down. `credit` uses this to tell a
 * pooled note apart from an ordinary one: it may move cash into or out of a pooled asset
 * but must never transfer or liquidate the asset itself, because `securitization` has
 * already sold that cashflow to the tranche holders (spec 19.4).
 */
export function poolHoldingLoan(state: GameState, loanId: ContractId): ContractId | null {
  const pool = state.pools.find(
    (p) => !p.terminated && p.assets.some((a) => a.kind === 'peer-loan' && a.id === loanId),
  )
  return pool === undefined ? null : pool.id
}

/**
 * Settlement step 5. floorPercent(outstanding, ratePerRound), per loan — never on a sum
 * across loans, which is the rule Task 16 also relies on for the same spec 19.4
 * conversion. Pure over the loan record: both the balance and the rate live on it.
 */
export function peerLoanInterestDue(loan: PeerLoan): Money {
  return floorPercent(loan.outstanding, loan.ratePerRound)
}

/**
 * Spec 19.4. What a defaulted note's collateral converts to when it is inside a live pool
 * and `securitization` sells it to the bank instead of handing it to the note holder:
 * floorPercent(faceValue, LIQUIDATION_FLOOR) PER DEED, then summed. Flooring the sum
 * instead would disagree with `securitization`'s own conversion of the same rule. A deed
 * no longer on the board contributes zero rather than throwing.
 */
export function collateralLiquidationProceeds(state: GameState, loan: PeerLoan): Money {
  return loan.collateral.reduce((sum, deedId) => {
    const d = state.deeds[deedId]
    return d === undefined ? sum : sum + floorPercent(d.faceValue, ECONOMY.LIQUIDATION_FLOOR)
  }, 0)
}

export interface PeerLoanFunding {
  /** Paid out of the borrower's clean cash. */
  readonly fromCash: Money
  /** The remainder, which capitalises into the drawn credit balance. */
  readonly capitalised: Money
  /** True when the coupon is a MISSED payment under spec section 7 rather than a paid one. */
  readonly defaults: boolean
}

/**
 * Spec section 7 says default occurs on "a missed interest payment". Spec 19.8 says every
 * obligation, peer loan interest explicitly included, resolves through clean cash and then
 * uncapped capitalisation into the drawn balance, and that "a player is never left unable
 * to pay". Read naively together, no coupon is ever missed and section 7's first default
 * trigger is dead letter.
 *
 * The resolution: a coupon is MISSED when the borrower cannot cover it from clean cash AND
 * capitalising the remainder would push the drawn balance past their borrowing base.
 * Inside the base, 19.8 governs and the lender is paid in full from the credit line.
 * Beyond it, the borrower has no lawful way to fund the payment and section 7 governs.
 *
 * Two consequences worth being explicit about. First, the borrowing base is a DEFAULT
 * TRIGGER here, not a cap on the capitalisation: the waterfall still has exactly two steps
 * and there is no partial payment — either the whole coupon is funded or the loan
 * defaults and no cash moves at all. Second, a borrower already over their base has zero
 * headroom, so their next coupon defaults; a margin call and a peer default are meant to
 * arrive together for a player who has run out of room.
 */
export function fundPeerLoanInterest(state: GameState, loan: PeerLoan): PeerLoanFunding {
  const due = peerLoanInterestDue(loan)
  const fromCash = Math.min(state.players[loan.borrower].cleanCash, due)
  const capitalised = due - fromCash
  const headroom = Math.max(0, creditHeadroom(state, loan.borrower))
  return { fromCash, capitalised, defaults: capitalised > headroom }
}

/**
 * Task 10. drawnCredit - the drawn balance the base will TOLERATE, SIGNED — a margin
 * call is a positive shortfall, spec section 5. Deliberately excludes `distressedDebt`:
 * distressed debt sits outside both the drawn balance and the borrowing base (spec
 * 19.8), so it can never itself trigger a breach.
 *
 * era-decks 6.2's `margin-threshold` tightens the tolerance to a fraction of the base
 * for the players a card names (`Math.min` across live modifiers, so the strictest one
 * governs). With no such card the threshold is exactly 1 and `floorPercent(base, 1)` is
 * `base`, making this once again the exact negation of `creditHeadroom`. It stops being
 * that negation only while a threshold card is live, and that asymmetry is deliberate:
 * the card tightens when the position is CALLED, not how much may be voluntarily drawn,
 * so a player already inside their base cannot be pushed over by drawing nothing.
 */
export function marginShortfall(state: GameState, player: PlayerId): Money {
  const tolerated = floorPercent(borrowingBase(state, player), marginThreshold(state, player))
  return drawnCredit(state, player) - tolerated
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
 *
 * E3-07 ("Covenant Waiver Negotiated") grants a `margin-call-waiver` token that pushes
 * that deadline out by its `extraRounds`. The extension applies while the token is
 * held and the position is flagged; `flagMarginCalls` spends the token at the moment
 * the position CURES, which is the only outcome in which the extra round did any work.
 * A player who never cures is liquidated on the extended deadline and the token lapses
 * with the era, which is the same end state as spending it would have produced.
 */
export function liquidationRound(state: GameState, player: PlayerId): RoundNumber | null {
  const flaggedAt = state.players[player].marginCallFlaggedAt
  if (flaggedAt === null) return null
  const waiver = entitlementOfKind(state, player, 'margin-call-waiver')
  return flaggedAt + 2 + (waiver === null ? 0 : (waiver.params['extraRounds'] ?? 0))
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
