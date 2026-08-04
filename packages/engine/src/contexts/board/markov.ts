import {
  BOARD_SIZE, DOUBLES_ROLL_MULTIPLIER, GO_TO_JAIL_SQUARE,
  GROUP_MEMBERS, JAIL_SQUARE, deedById,
} from '../../config/board.js'
import { PLAYER_IDS } from '../../core/types.js'
import type { ColorGroup, DeedId, SquareIndex } from '../../core/types.js'

/** Consecutive-doubles counter: 0, 1 or 2. The third double jails. */
const DOUBLES_STATES = 3
const STATE_COUNT = BOARD_SIZE * DOUBLES_STATES
const ROLL_PROBABILITY = 1 / 36

function stateIndex(square: number, doubles: number): number {
  return square * DOUBLES_STATES + doubles
}

/**
 * One step of this chain is ONE DIE ROLL. Square 30 is the only relocating
 * square: the era decks contain no movement cards, so squares 2, 7, 17, 22, 33
 * and 36 are ordinary resting squares. Spec section 20.
 */
export function buildTransitionMatrix(): readonly (readonly number[])[] {
  const matrix: number[][] = Array.from(
    { length: STATE_COUNT },
    () => new Array<number>(STATE_COUNT).fill(0),
  )
  for (let square = 0; square < BOARD_SIZE; square += 1) {
    for (let doubles = 0; doubles < DOUBLES_STATES; doubles += 1) {
      const row = matrix[stateIndex(square, doubles)]
      if (row === undefined) continue
      for (let die1 = 1; die1 <= 6; die1 += 1) {
        for (let die2 = 1; die2 <= 6; die2 += 1) {
          const isDouble = die1 === die2
          if (isDouble && doubles === DOUBLES_STATES - 1) {
            const jail = stateIndex(JAIL_SQUARE, 0)
            row[jail] = (row[jail] ?? 0) + ROLL_PROBABILITY
            continue
          }
          const raw = (square + die1 + die2) % BOARD_SIZE
          const jailed = raw === GO_TO_JAIL_SQUARE
          const destination = jailed ? JAIL_SQUARE : raw
          const nextDoubles = jailed ? 0 : isDouble ? doubles + 1 : 0
          const target = stateIndex(destination, nextDoubles)
          row[target] = (row[target] ?? 0) + ROLL_PROBABILITY
        }
      }
    }
  }
  return matrix
}

const CONVERGENCE_TOLERANCE = 1e-15
const MAX_ITERATIONS = 5000

function stationaryDistribution(
  matrix: readonly (readonly number[])[],
): readonly number[] {
  const size = matrix.length
  let current = new Array<number>(size).fill(1 / size)
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const next = new Array<number>(size).fill(0)
    for (let i = 0; i < size; i += 1) {
      const weight = current[i] ?? 0
      if (weight === 0) continue
      const row = matrix[i]
      if (row === undefined) continue
      for (let j = 0; j < size; j += 1) {
        const p = row[j] ?? 0
        if (p !== 0) next[j] = (next[j] ?? 0) + weight * p
      }
    }
    let total = 0
    for (const value of next) total += value
    let drift = 0
    for (let j = 0; j < size; j += 1) {
      const normalised = (next[j] ?? 0) / total
      drift += Math.abs(normalised - (current[j] ?? 0))
      next[j] = normalised
    }
    current = next
    if (drift < CONVERGENCE_TOLERANCE) break
  }
  return current
}

/** Steady-state probability that a single die roll ends on each square. */
export const LANDING_PROBABILITIES: readonly number[] = (() => {
  const states = stationaryDistribution(buildTransitionMatrix())
  const squares = new Array<number>(BOARD_SIZE).fill(0)
  for (let square = 0; square < BOARD_SIZE; square += 1) {
    let total = 0
    for (let doubles = 0; doubles < DOUBLES_STATES; doubles += 1) {
      total += states[stateIndex(square, doubles)] ?? 0
    }
    squares[square] = total
  }
  return squares
})()

export function landingProbability(square: SquareIndex): number {
  return LANDING_PROBABILITIES[square] ?? 0
}

export function landingProbabilityOfDeed(deedId: DeedId): number {
  const deed = deedById(deedId)
  return deed === null ? 0 : landingProbability(deed.square)
}

/**
 * Spec section 19.2: per-roll probability x the number of players who can owe
 * rent (everyone but the owner) x 1.19 for the extra rolls doubles generate.
 */
export function expectedHitsPerRound(deedId: DeedId): number {
  return landingProbabilityOfDeed(deedId)
    * (PLAYER_IDS.length - 1)
    * DOUBLES_ROLL_MULTIPLIER
}

export function expectedHitsOverWindow(deedId: DeedId, rounds: number): number {
  return expectedHitsPerRound(deedId) * Math.max(0, rounds)
}

export function groupTraffic(
  group: ColorGroup,
): { readonly combined: number; readonly perSquare: number } {
  const members = GROUP_MEMBERS[group]
  const combined = members.reduce((total, id) => total + landingProbabilityOfDeed(id), 0)
  return {
    combined,
    perSquare: members.length === 0 ? 0 : combined / members.length,
  }
}
