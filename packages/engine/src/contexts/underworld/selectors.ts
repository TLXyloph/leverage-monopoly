import type { ActiveVenture, GameState } from '../../core/state.js'
import type { DiceRoll, Money, PlayerId } from '../../core/types.js'
import { floorPercent } from '../../core/money.js'
import { ECONOMY } from '../../config/economy.js'

/**
 * A config fraction as integer basis points, e.g. 0.6 -> 6000. Money arithmetic
 * that needs to SUM several rates before rounding once (Task 13's laundering
 * haircut is `base + perHeat x heat`, capped) has to go through integer bps:
 * 0.25 + 0.05 * 2 evaluates to 0.35000000000000003 in IEEE 754, not 0.35.
 */
export function toBps(fraction: number): number {
  return Math.round(fraction * 10_000)
}

/**
 * amount x points/10000, rounded DOWN. Delegates to `floorPercent` from
 * `core/money.ts` rather than reimplementing the rounding — that keeps the
 * single "money x rate is exact" guarantee in one place instead of two.
 */
export function applyBps(amount: Money, points: number): Money {
  return floorPercent(amount, points / 10_000)
}

export function activeVenture(
  state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
): ActiveVenture | undefined {
  return state.players[id].ventures.find((v) => v.kind === kind)
}

export function runsVenture(
  state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
): boolean {
  return activeVenture(state, id, kind) !== undefined
}

/** Reads `ECONOMY.SPEAKEASY_PAYOUTS` by 2d6 total. The engine never rolls; the
 * roll always arrives as event/command payload from the physical dice. */
export function speakeasyPayout(dice: DiceRoll): Money {
  const total = dice[0] + dice[1]
  return ECONOMY.SPEAKEASY_PAYOUTS[total] ?? 0
}

/** The physical dice produce 1-6 on each die. Anything else is operator error. */
export function isLegal2d6(dice: DiceRoll): boolean {
  return dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)
}

/**
 * The laundering haircut in integer basis points. Spec section 10: 25% base,
 * worsening 5 percentage points per Heat point above 3, capped at 60%.
 *
 * Basis points rather than fractions is not style. `0.25 + 0.05 * 2` evaluates
 * to 0.35000000000000003 in IEEE 754, which floors a $1,000 launder to $649
 * instead of $650.
 */
export function launderHaircutBps(heat: number): number {
  const excess = Math.max(0, heat - ECONOMY.LAUNDER_HEAT_FREE_THRESHOLD)
  const raw = toBps(ECONOMY.LAUNDER_BASE_HAIRCUT)
    + toBps(ECONOMY.LAUNDER_HAIRCUT_PER_HEAT) * excess
  return Math.min(toBps(ECONOMY.LAUNDER_MAX_HAIRCUT), raw)
}

/**
 * Clean dollars received for `dirtyIn`, rounded DOWN. `heat` is the player's
 * Heat BEFORE the transaction's +1 is applied — spec 19.9.
 */
export function launderProceeds(dirtyIn: Money, heat: number): Money {
  return applyBps(dirtyIn, 10_000 - launderHaircutBps(heat))
}

/** $100 x Heat, payable in clean cash. Spec section 10. */
export function auditFine(heat: number): Money {
  return ECONOMY.AUDIT_FINE_PER_HEAT * heat
}

/** The lowest total two dice can produce. Below it an audit check cannot fire. */
export const MIN_AUDITABLE_HEAT = 2

/**
 * P(2d6 <= heat), for the assist panel's "your audit probability this round is
 * 58%" warning in spec section 14. Counted over the 36 equally likely outcomes.
 */
export function auditProbability(heat: number): number {
  let hits = 0
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) if (a + b <= heat) hits += 1
  }
  return hits / 36
}

/**
 * The card revealed to an insider-trading buyer for the round: the top of the
 * CURRENT era's deck. `null` once the round's reveal has not happened (or has
 * already been cleared at the round boundary) — `insiderRevealedThisRound` is
 * the single source of truth for whether a reveal is live.
 */
export function insiderRevealedCard(state: GameState, id: PlayerId): number | null {
  if (!state.players[id].insiderRevealedThisRound) return null
  const deck = state.decks[state.era]
  return deck.order[deck.drawn] ?? null
}
