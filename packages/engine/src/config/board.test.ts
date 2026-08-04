import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BOARD_SIZE, CARD_SQUARES, DEEDS, DEED_IDS, DEED_LIST, DOUBLES_ROLL_MULTIPLIER,
  FREE_PARKING_SQUARE, GO_SQUARE, GO_TO_JAIL_SQUARE, GROUP_MEMBERS,
  INCOME_TAX_SQUARE, JAIL_SQUARE, LUXURY_TAX_SQUARE, RAILROAD_RENT, SQUARES,
  UTILITY_MULTIPLIER, deedAt, deedById, totalFaceValue,
} from './board.js'
import { ECONOMY } from './economy.js'
import type { ColorGroup } from '../core/types.js'

interface FixtureRow {
  readonly index: number
  readonly name: string
  readonly group: string | null
  readonly probability: number
}

const FIXTURE: readonly FixtureRow[] = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../tests/fixtures/landing-probabilities.json', import.meta.url),
    ),
    'utf8',
  ),
) as readonly FixtureRow[]

/** The fixture spells groups with spaces; ColorGroup is kebab-case. */
function normaliseGroup(group: string | null): ColorGroup | null {
  return group === null ? null : (group.replace(/ /g, '-') as ColorGroup)
}

describe('board layout', () => {
  it('has exactly 40 squares indexed 0-39 in order', () => {
    expect(SQUARES).toHaveLength(BOARD_SIZE)
    expect(SQUARES.map((s) => s.index)).toEqual([...Array(40).keys()])
  })

  it('places the named squares where the spec says they are', () => {
    expect(GO_SQUARE).toBe(0)
    expect(INCOME_TAX_SQUARE).toBe(4)
    expect(JAIL_SQUARE).toBe(10)
    expect(FREE_PARKING_SQUARE).toBe(20)
    expect(SQUARES[FREE_PARKING_SQUARE]?.kind).toBe('free-parking')
    expect(GO_TO_JAIL_SQUARE).toBe(30)
    expect(LUXURY_TAX_SQUARE).toBe(38)
    expect(SQUARES[GO_SQUARE]?.kind).toBe('go')
    expect(SQUARES[INCOME_TAX_SQUARE]?.kind).toBe('tax')
    expect(SQUARES[JAIL_SQUARE]?.kind).toBe('jail')
    expect(SQUARES[GO_TO_JAIL_SQUARE]?.kind).toBe('go-to-jail')
    expect(SQUARES[LUXURY_TAX_SQUARE]?.kind).toBe('tax')
  })

  it('marks squares 2, 7, 17, 22, 33 and 36 as card squares', () => {
    expect([...CARD_SQUARES]).toEqual([2, 7, 17, 22, 33, 36])
    for (const index of CARD_SQUARES) {
      expect(SQUARES[index]?.kind).toBe('card')
    }
  })

  it('agrees with the golden fixture on every square name and group', () => {
    for (const row of FIXTURE) {
      const square = SQUARES[row.index]
      expect(square, `square ${row.index}`).toBeDefined()
      expect(square?.name).toBe(row.name)
      const deed = square?.deed === null || square?.deed === undefined
        ? null
        : (DEEDS[square.deed] ?? null)
      expect(deed?.group ?? null).toBe(normaliseGroup(row.group))
    }
  })
})

describe('deeds', () => {
  it('has exactly 28 deeds, each on its own square', () => {
    expect(DEED_LIST).toHaveLength(28)
    expect(DEED_IDS).toHaveLength(28)
    expect(new Set(DEED_IDS).size).toBe(28)
    expect(new Set(DEED_LIST.map((d) => d.square)).size).toBe(28)
    for (const deed of DEED_LIST) {
      expect(deedAt(deed.square)?.id).toBe(deed.id)
      expect(deedById(deed.id)?.square).toBe(deed.square)
    }
  })

  it('sums the 28 face values to exactly $5,690', () => {
    const sum = DEED_LIST.reduce((total, deed) => total + deed.faceValue, 0)
    expect(sum).toBe(5690)
    expect(totalFaceValue()).toBe(5690)
  })

  it('splits 28 deeds across ten colour groups in the standard shape', () => {
    const sizes: Record<ColorGroup, number> = {
      brown: 2, 'light-blue': 3, pink: 3, orange: 3, red: 3,
      yellow: 3, green: 3, 'dark-blue': 2, railroad: 4, utility: 2,
    }
    for (const [group, size] of Object.entries(sizes)) {
      expect(GROUP_MEMBERS[group as ColorGroup], group).toHaveLength(size)
    }
    const total = Object.values(sizes).reduce((a, b) => a + b, 0)
    expect(total).toBe(28)
  })

  it('gives every colour deed a six-entry strictly increasing rent table', () => {
    for (const deed of DEED_LIST) {
      if (deed.group === 'railroad' || deed.group === 'utility') continue
      expect(deed.rentTable, deed.id).toHaveLength(6)
      expect(deed.houseCost, deed.id).toBeGreaterThan(0)
      for (let i = 1; i < deed.rentTable.length; i += 1) {
        expect(deed.rentTable[i] ?? 0, `${deed.id}[${i}]`)
          .toBeGreaterThan(deed.rentTable[i - 1] ?? 0)
      }
      // Every colour-group price is a round multiple of $10. (Not $20: Park
      // Place is $350, the one standard Monopoly price not divisible by 20.)
      expect(deed.faceValue % 10, deed.id).toBe(0)
    }
  })

  it('discounts house costs to 90% of standard, as exact integers', () => {
    expect(ECONOMY.HOUSE_COST_MULTIPLIER).toBe(0.9)
    const expected: Record<string, number> = {
      brown: 45, 'light-blue': 45, pink: 90, orange: 90,
      red: 135, yellow: 135, green: 180, 'dark-blue': 180,
    }
    for (const deed of DEED_LIST) {
      const cost = expected[deed.group]
      if (cost === undefined) continue
      expect(deed.houseCost, deed.id).toBe(cost)
      expect(Number.isInteger(deed.houseCost), deed.id).toBe(true)
    }
  })

  it('gives railroads and utilities no rent table and no house cost', () => {
    for (const id of [...GROUP_MEMBERS.railroad, ...GROUP_MEMBERS.utility]) {
      const deed = DEEDS[id]
      expect(deed?.rentTable, id).toHaveLength(0)
      expect(deed?.houseCost, id).toBe(0)
    }
    expect([...RAILROAD_RENT]).toEqual([0, 25, 50, 100, 200])
    expect([...UTILITY_MULTIPLIER]).toEqual([0, 4, 10])
  })

  it('carries the doubles roll multiplier from spec section 19.2', () => {
    expect(DOUBLES_ROLL_MULTIPLIER).toBe(1.19)
  })
})
