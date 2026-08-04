import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LANDING_PROBABILITIES, buildTransitionMatrix, expectedHitsOverWindow,
  expectedHitsPerRound, groupTraffic, landingProbability, landingProbabilityOfDeed,
} from './index.js'
import { DOUBLES_ROLL_MULTIPLIER, GO_TO_JAIL_SQUARE, JAIL_SQUARE } from '../../config/board.js'
import type { ColorGroup } from '../../core/types.js'

interface FixtureRow {
  readonly index: number
  readonly name: string
  readonly probability: number
}

const FIXTURE: readonly FixtureRow[] = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../../tests/fixtures/landing-probabilities.json', import.meta.url),
    ),
    'utf8',
  ),
) as readonly FixtureRow[]

describe('the landing model reproduces the golden fixture', () => {
  it('matches every one of the 40 squares to within 1e-9', () => {
    expect(FIXTURE).toHaveLength(40)
    for (const row of FIXTURE) {
      expect(
        landingProbability(row.index),
        `square ${row.index} (${row.name})`,
      ).toBeCloseTo(row.probability, 9)
    }
  })

  it('is a probability distribution over the 40 squares', () => {
    const total = LANDING_PROBABILITIES.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 12)
    expect(LANDING_PROBABILITIES.every((p) => p >= 0)).toBe(true)
  })

  it('never rests on Go To Jail', () => {
    expect(landingProbability(GO_TO_JAIL_SQUARE)).toBe(0)
  })

  it('makes Jail the most-landed square on the board', () => {
    const max = Math.max(...LANDING_PROBABILITIES)
    expect(landingProbability(JAIL_SQUARE)).toBe(max)
    expect(landingProbability(JAIL_SQUARE) * 100).toBeCloseTo(5.33, 2)
  })

  it('reproduces the transition structure: every row sums to 1', () => {
    const matrix = buildTransitionMatrix()
    expect(matrix).toHaveLength(120)
    for (const [index, row] of matrix.entries()) {
      expect(row, `row ${index}`).toHaveLength(120)
      expect(row.reduce((a, b) => a + b, 0), `row ${index}`).toBeCloseTo(1, 12)
    }
  })
})

describe('traffic by group, spec section 20', () => {
  it('matches the published per-square figures', () => {
    const expected: readonly [ColorGroup, number, number][] = [
      ['railroad', 9.97, 2.49],
      ['orange', 8.23, 2.74],
      ['yellow', 8.10, 2.70],
      ['red', 8.01, 2.67],
      ['green', 7.74, 2.58],
      ['pink', 7.25, 2.42],
      ['light-blue', 6.82, 2.27],
      ['utility', 5.06, 2.53],
      ['brown', 4.63, 2.31],
      ['dark-blue', 4.44, 2.22],
    ]
    for (const [group, combined, perSquare] of expected) {
      const traffic = groupTraffic(group)
      expect(traffic.combined * 100, `${group} combined`).toBeCloseTo(combined, 2)
      expect(traffic.perSquare * 100, `${group} per square`).toBeCloseTo(perSquare, 2)
    }
  })

  it('keeps orange the strongest colour group per square', () => {
    const colours: readonly ColorGroup[] = [
      'brown', 'light-blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark-blue',
    ]
    const best = colours.reduce((a, b) =>
      groupTraffic(a).perSquare >= groupTraffic(b).perSquare ? a : b)
    expect(best).toBe('orange')
  })

  it('makes Tennessee Avenue the busiest and Park Place the quietest property', () => {
    expect(landingProbabilityOfDeed('tennessee-avenue') * 100).toBeCloseTo(2.77, 2)
    expect(landingProbabilityOfDeed('park-place') * 100).toBeCloseTo(2.19, 2)
    expect(landingProbabilityOfDeed('boardwalk'))
      .toBeLessThan(landingProbabilityOfDeed('mediterranean-avenue'))
  })
})

describe('expected hits, spec section 19.2', () => {
  it('scales per-roll probability by three payers and the doubles factor', () => {
    const p = landingProbabilityOfDeed('boardwalk')
    expect(expectedHitsPerRound('boardwalk')).toBeCloseTo(p * 3 * DOUBLES_ROLL_MULTIPLIER, 12)
    expect(expectedHitsOverWindow('boardwalk', 8))
      .toBeCloseTo(expectedHitsPerRound('boardwalk') * 8, 12)
  })

  it('returns zero for a deed that does not exist', () => {
    expect(expectedHitsPerRound('not-a-deed')).toBe(0)
    expect(landingProbabilityOfDeed('not-a-deed')).toBe(0)
  })
})
