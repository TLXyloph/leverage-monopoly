import { ECONOMY } from './economy.js'

/**
 * `typeof ECONOMY` alone would pin every field to its literal value (`ECONOMY` is
 * declared `as const`), which makes it impossible to construct a deliberately-broken
 * economy to test against — `LIQUIDATION_FLOOR: 0.7` is not assignable to the literal
 * type `0.8`. Widening exactly the five numeric fields this function reads keeps every
 * other field's stronger literal type intact for callers that want it.
 */
type Economy = Omit<
  typeof ECONOMY,
  'LIQUIDATION_FLOOR' | 'DEED_ADVANCE_RATE' | 'BUILDING_ADVANCE_RATE'
  | 'BUILDING_SELLBACK_RATE' | 'LOAN_NOTE_MAX_LEVERAGE' | 'RATING_MAX_LEVERAGE'
  | 'TOTAL_ROUNDS' | 'ROUNDS_PER_ERA'
> & {
  readonly LIQUIDATION_FLOOR: number
  readonly DEED_ADVANCE_RATE: number
  readonly BUILDING_ADVANCE_RATE: number
  readonly BUILDING_SELLBACK_RATE: number
  readonly LOAN_NOTE_MAX_LEVERAGE: number
  readonly RATING_MAX_LEVERAGE: number
  readonly TOTAL_ROUNDS: number
  readonly ROUNDS_PER_ERA: number
}

/**
 * Runs at module load. Every check guards a convergence property that a unit test
 * cannot: each is a relationship between two constants that must hold for every
 * possible value of either, not a fact about one shipped number.
 *
 * Deeds: a forced sale raises LIQUIDATION_FLOOR x face in cash but removes
 * DEED_ADVANCE_RATE x face from the borrowing base, so the shortfall narrows by
 * (floor - advance) x face per sale only when the floor strictly exceeds the advance
 * rate. At 0.80 against 0.75 that is 5% of face per sale and liquidation converges to
 * either a cured position or an empty portfolio. At or below the advance rate every
 * sale WIDENS the shortfall and the auction only terminates by consuming the entire
 * portfolio, leaving the player worse off than when it began. Spec section 5.
 *
 * Buildings: stripping returns BUILDING_SELLBACK_RATE x cost in cash and removes
 * BUILDING_ADVANCE_RATE x cost from the base, so the shortfall narrows by
 * (sellback - advance) x cost. At 0.5 against 0.5 that is exactly zero — stripping is
 * shortfall-neutral, which spec section 5 states outright, so equality is allowed;
 * only an advance rate exceeding sellback (which would widen the shortfall) is not.
 */
export function assertEconomyInvariants(economy: Economy = ECONOMY): void {
  if (economy.LIQUIDATION_FLOOR <= economy.DEED_ADVANCE_RATE) {
    throw new Error(
      `LIQUIDATION_FLOOR (${economy.LIQUIDATION_FLOOR}) must be strictly greater than `
      + `DEED_ADVANCE_RATE (${economy.DEED_ADVANCE_RATE}) or forced liquidation diverges: `
      + 'every sale would widen the shortfall it is meant to close. See spec section 5.',
    )
  }
  if (economy.BUILDING_ADVANCE_RATE > economy.BUILDING_SELLBACK_RATE) {
    throw new Error(
      `BUILDING_ADVANCE_RATE (${economy.BUILDING_ADVANCE_RATE}) must not exceed `
      + `BUILDING_SELLBACK_RATE (${economy.BUILDING_SELLBACK_RATE}) or stripping a `
      + 'developed deed widens the shortfall. See spec section 5.',
    )
  }
  if (economy.LOAN_NOTE_MAX_LEVERAGE > economy.RATING_MAX_LEVERAGE) {
    throw new Error(
      `LOAN_NOTE_MAX_LEVERAGE (${economy.LOAN_NOTE_MAX_LEVERAGE}) must not exceed `
      + `RATING_MAX_LEVERAGE (${economy.RATING_MAX_LEVERAGE}); the note mark re-caps the `
      + 'value the ratings formula already capped, and re-capping upward is a no-op.',
    )
  }
  if (economy.TOTAL_ROUNDS % economy.ROUNDS_PER_ERA !== 0) {
    throw new Error(
      `TOTAL_ROUNDS (${economy.TOTAL_ROUNDS}) must divide evenly into eras of `
      + `${economy.ROUNDS_PER_ERA} rounds.`,
    )
  }
}
