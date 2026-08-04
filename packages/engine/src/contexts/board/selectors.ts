import { BOARD_SIZE } from '../../config/board.js'
import type { DiceRoll, Money, SquareIndex } from '../../core/types.js'

export function diceTotal(dice: DiceRoll): number {
  return dice[0] + dice[1]
}

export function isDoubles(dice: DiceRoll): boolean {
  return dice[0] === dice[1]
}

export function isLegalDie(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6
}

export function destination(from: SquareIndex, total: number): SquareIndex {
  return (from + total) % BOARD_SIZE
}

/** GO pays on passing or on landing exactly. Spec section 2. */
export function passesGo(from: SquareIndex, total: number): boolean {
  return from + total >= BOARD_SIZE
}

/** The part of an obligation the payer's clean cash cannot cover. */
export function shortfall(cash: Money, amount: Money): Money {
  return Math.max(0, amount - cash)
}
