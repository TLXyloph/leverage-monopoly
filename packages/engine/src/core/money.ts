import type { Money } from './types.js'

/** Convert a rate like 0.7 to integer basis points, e.g. 7000. */
function toBasisPoints(rate: number): number {
  return Math.round(rate * 10_000)
}

/**
 * `amount * rate`, rounded down, computed exactly.
 * Math.floor(180 * 0.7) is 125 because 180 * 0.7 is 125.99999999999999.
 * floorPercent(180, 0.7) is 126.
 */
export function floorPercent(amount: Money, rate: number): Money {
  return Math.floor((amount * toBasisPoints(rate)) / 10_000)
}

/** `amount * rate`, rounded up, computed exactly. */
export function ceilPercent(amount: Money, rate: number): Money {
  return Math.ceil((amount * toBasisPoints(rate)) / 10_000)
}

/** Sum of rates applied as one exact percentage, avoiding float accumulation. */
export function floorPercentSum(amount: Money, rates: readonly number[]): Money {
  const bp = rates.reduce((acc, r) => acc + toBasisPoints(r), 0)
  return Math.floor((amount * bp) / 10_000)
}

/** All money is integer dollars. Used by the property suite and by boundary validation. */
export function isWholeDollars(amount: number): boolean {
  return Number.isInteger(amount)
}
