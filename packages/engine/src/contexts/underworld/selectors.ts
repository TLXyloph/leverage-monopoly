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
