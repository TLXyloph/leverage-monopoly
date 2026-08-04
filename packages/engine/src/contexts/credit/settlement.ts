import { ECONOMY } from '../../config/economy.js'
import { entitlementOfKind } from '../../core/card-effects.js'
import type { GameEvent, ObligationKind } from '../../core/events.js'
import type { GameState, PeerLoan } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { reduceCredit } from './reduce.js'
import { reducePeerLoans } from './reduce-loans.js'
import {
  carryingCostFor, creditInterestDue, creditInterestRate, distressedInterestDue,
  fundPeerLoanInterest, liquidationQueue, marginShortfall, unmortgagedDeedCount,
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
 *
 * The rate is read PER PLAYER, not once for the round: era-decks 6.2 lets a card
 * override one player's rate or waive their interest entirely, and the emitted event
 * must carry the rate that was actually applied or the log misreports the charge.
 */
export function settleCreditInterest(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = creditInterestDue(state, player)
    if (amount === 0) continue
    events.push({ type: 'InterestAccrued', player, amount, rate: creditInterestRate(state, player) })
    capitalise(events, player, state.players[player].cleanCash, amount, 'interest')
  }
  return events
}

/**
 * Settlement step 8. Spec 19.7: DISTRESSED_DEBT_RATE per round, COMPOUNDING, floored.
 * Compounding falls out of applying the rate to the running balance rather than to the
 * original principal. Never swept from spare clean cash — repayment is the player's
 * choice during any Open phase, and the compounding is the pressure. The 15% rate and
 * the scoring-time deduction of `distressedDebt` from net worth are what make this a
 * penalty; the reducer still gives every dollar of it a counterparty (the Treasury),
 * symmetric with `InterestAccrued`, so the conservation identity in spec section 20
 * holds across this event with no exception. This emitter only computes the amount —
 * see `reduceCredit`'s `DistressedDebtAccrued` case for the Treasury credit.
 */
export function settleDistressedDebt(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = distressedInterestDue(state, player)
    if (amount === 0) continue
    events.push({ type: 'DistressedDebtAccrued', player, amount })
  }
  return events
}

/**
 * Settlement step 10, after audits at step 9. A breached position not yet flagged is
 * flagged now; one already flagged keeps its original round, so the cure clock cannot be
 * restarted by breaching again; one back inside its base is cured. Liquidation itself
 * does not happen here — spec 19.8 puts it at the start of the Open phase two rounds on.
 */
export function flagMarginCalls(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const p = state.players[player]
    const shortfall = marginShortfall(state, player)
    if (shortfall > 0 && p.marginCallFlaggedAt === null) {
      events.push({ type: 'MarginCallFlagged', player, shortfall })
    } else if (shortfall <= 0 && p.marginCallFlaggedAt !== null) {
      events.push({ type: 'MarginCallCured', player })
      // E3-07: the waiver token bought this player the extra round they cured in, so
      // it is spent now. See `liquidationRound` for why cure is the consumption point.
      const waiver = entitlementOfKind(state, player, 'margin-call-waiver')
      if (waiver !== null) {
        events.push({ type: 'EntitlementConsumed', player, entitlement: waiver.id, used: 1 })
      }
    }
  }
  return events
}

/**
 * Spec section 5's second stop condition, and spec 19.8. Liquidation stops when the
 * position is cured OR when the player has no unmortgaged deeds left; any residual
 * shortfall becomes distressed debt. Called at the start of the Open phase once the
 * auction has emptied the queue.
 *
 * At LIQUIDATION_FLOOR 0.80 against DEED_ADVANCE_RATE 0.75 each sale narrows the
 * shortfall, so this path is reached only when the whole portfolio is worth less than
 * the drawn balance — not, as under a divergent floor at or below the advance rate, on
 * every liquidation.
 */
export function exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[] {
  const shortfall = marginShortfall(state, player)
  if (shortfall <= 0) return []
  if (liquidationQueue(state, player).length > 0) return []
  return [
    { type: 'CreditWrittenDown', player, amount: shortfall },
    { type: 'MarginCallCured', player },
  ]
}

/** Folds a batch through both credit reducers, so the next loan sees the last one's effect. */
function applyLocally(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce<GameState>(
    (acc, event) => reducePeerLoans(reduceCredit(acc, event), event),
    state,
  )
}

/**
 * Spec section 7 default. Collateral to the note holder, the remaining balance written
 * off, and the borrower permanently credit-impaired — spec 19.10 makes the halving a
 * single event however many times they default, which the reducer's boolean guarantees.
 */
function defaultEvents(loan: PeerLoan): readonly GameEvent[] {
  return [{
    type: 'PeerLoanDefaulted',
    id: loan.id,
    collateralTo: loan.lender,
    writtenOff: loan.outstanding,
  }]
}

function settleOneLoan(state: GameState, loan: PeerLoan): readonly GameEvent[] {
  const funding = fundPeerLoanInterest(state, loan)
  if (funding.defaults) return defaultEvents(loan)

  const events: GameEvent[] = []
  const due = funding.fromCash + funding.capitalised
  if (due > 0) {
    events.push({ type: 'PeerLoanInterestPaid', id: loan.id, amount: due })
    if (funding.capitalised > 0) {
      events.push({
        type: 'ObligationCapitalised',
        player: loan.borrower,
        amount: funding.capitalised,
        obligation: 'peer-loan-interest',
      })
    }
  }

  // Spec section 7's second default trigger: an outstanding balance at term expiry. The
  // borrower's escape is to repay during that round's Open phase, which closes the loan
  // before Settlement ever reaches it.
  if (state.round >= loan.maturesAtRound && loan.outstanding > 0) {
    events.push(...defaultEvents(loan))
  }
  return events
}

/**
 * Settlement step 5, immediately after credit-line interest at step 4. The ordering is
 * observable and deliberate: interest capitalised at step 4 has already consumed the
 * headroom that step 5 measures against, so a Settlement can charge bank interest and
 * default a peer loan in the same pass.
 *
 * Loans are serviced in origination order — `state.loans` is append-only, so that order
 * is identical under replay — and each is folded into a working state before the next is
 * priced, because the first coupon spends the cash the second was counting on.
 */
export function settlePeerLoans(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  let working = state
  for (const loan of state.loans) {
    if (loan.status !== 'active') continue
    const current = working.loans.find((l) => l.id === loan.id)
    if (current === undefined || current.status !== 'active') continue
    const batch = settleOneLoan(working, current)
    events.push(...batch)
    working = applyLocally(working, batch)
  }
  return events
}
