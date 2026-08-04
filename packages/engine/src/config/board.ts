import { floorPercent } from '../core/money.js'
import { ECONOMY } from './economy.js'
import type { ColorGroup, DeedId, Money, SquareIndex } from '../core/types.js'
import type { DeedState } from '../core/state.js'

/** Static board data for a deed. The mutable fields of DeedState are omitted. */
export type DeedDefinition =
  Omit<DeedState, 'owner' | 'mortgaged' | 'houses'> & { readonly name: string }

export type SquareKind =
  | 'go' | 'deed' | 'card' | 'tax' | 'jail' | 'free-parking' | 'go-to-jail'

export interface BoardSquare {
  readonly index: SquareIndex
  readonly name: string
  readonly kind: SquareKind
  /** The deed on this square, or null for every non-deed square. */
  readonly deed: DeedId | null
}

export const BOARD_SIZE = 40
export const GO_SQUARE: SquareIndex = 0
export const INCOME_TAX_SQUARE: SquareIndex = 4
export const JAIL_SQUARE: SquareIndex = 10
export const FREE_PARKING_SQUARE: SquareIndex = 20
export const GO_TO_JAIL_SQUARE: SquareIndex = 30
export const LUXURY_TAX_SQUARE: SquareIndex = 38

/**
 * Era decks contain no movement cards, so these are ordinary resting squares.
 * Spec section 20.
 */
export const CARD_SQUARES: readonly SquareIndex[] = [2, 7, 17, 22, 33, 36]

/** Railroad rent by number of unmortgaged railroads owned. Spec section 2. */
export const RAILROAD_RENT: readonly Money[] = [0, 25, 50, 100, 200]

/** Utility rent is this multiple of the dice total, by utilities owned. */
export const UTILITY_MULTIPLIER: readonly number[] = [0, 4, 10]

/**
 * Doubles grant an extra roll, so a round produces more rolls than turns.
 * Spec section 19.2 fixes the factor at 1.19 for expected-hits valuation.
 */
export const DOUBLES_ROLL_MULTIPLIER = 1.19

/**
 * `standardHouseCost` is the printed board figure; LEVERAGE charges 90% of it.
 * 50/100/150/200 x 0.9 is exactly 45/90/135/180, so no rounding rule is
 * engaged, but floorPercent (not Math.floor(a * b)) keeps this exact and
 * integral if the multiplier is ever retuned to a value that isn't.
 */
function deed(
  id: DeedId,
  name: string,
  square: SquareIndex,
  group: ColorGroup,
  faceValue: Money,
  standardHouseCost: Money,
  rentTable: readonly Money[],
): DeedDefinition {
  const houseCost = floorPercent(standardHouseCost, ECONOMY.HOUSE_COST_MULTIPLIER)
  return { id, name, square, group, faceValue, houseCost, rentTable }
}

export const DEED_LIST: readonly DeedDefinition[] = [
  deed('mediterranean-avenue', 'Mediterranean Avenue', 1, 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  deed('baltic-avenue', 'Baltic Avenue', 3, 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  deed('reading-railroad', 'Reading Railroad', 5, 'railroad', 200, 0, []),
  deed('oriental-avenue', 'Oriental Avenue', 6, 'light-blue', 100, 50, [6, 30, 90, 270, 400, 550]),
  deed('vermont-avenue', 'Vermont Avenue', 8, 'light-blue', 100, 50, [6, 30, 90, 270, 400, 550]),
  deed('connecticut-avenue', 'Connecticut Avenue', 9, 'light-blue', 120, 50, [8, 40, 100, 300, 450, 600]),
  deed('st-charles-place', 'St. Charles Place', 11, 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  deed('electric-company', 'Electric Company', 12, 'utility', 150, 0, []),
  deed('states-avenue', 'States Avenue', 13, 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  deed('virginia-avenue', 'Virginia Avenue', 14, 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  deed('pennsylvania-railroad', 'Pennsylvania Railroad', 15, 'railroad', 200, 0, []),
  deed('st-james-place', 'St. James Place', 16, 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  deed('tennessee-avenue', 'Tennessee Avenue', 18, 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  deed('new-york-avenue', 'New York Avenue', 19, 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  deed('kentucky-avenue', 'Kentucky Avenue', 21, 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  deed('indiana-avenue', 'Indiana Avenue', 23, 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  deed('illinois-avenue', 'Illinois Avenue', 24, 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  deed('b-and-o-railroad', 'B&O Railroad', 25, 'railroad', 200, 0, []),
  deed('atlantic-avenue', 'Atlantic Avenue', 26, 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  deed('ventnor-avenue', 'Ventnor Avenue', 27, 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  deed('water-works', 'Water Works', 28, 'utility', 150, 0, []),
  deed('marvin-gardens', 'Marvin Gardens', 29, 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  deed('pacific-avenue', 'Pacific Avenue', 31, 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  deed('north-carolina-avenue', 'North Carolina Avenue', 32, 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  deed('pennsylvania-avenue', 'Pennsylvania Avenue', 34, 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  deed('short-line', 'Short Line', 35, 'railroad', 200, 0, []),
  deed('park-place', 'Park Place', 37, 'dark-blue', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  deed('boardwalk', 'Boardwalk', 39, 'dark-blue', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
]

const DEED_BY_SQUARE = new Map<SquareIndex, DeedDefinition>(
  DEED_LIST.map((d) => [d.square, d]),
)

const NON_DEED_SQUARES: readonly (readonly [SquareIndex, string, SquareKind])[] = [
  [0, 'Go', 'go'],
  [2, 'Community Chest 1', 'card'],
  [4, 'Income Tax', 'tax'],
  [7, 'Chance 1', 'card'],
  [10, 'Jail / Just Visiting', 'jail'],
  [17, 'Community Chest 2', 'card'],
  [20, 'Free Parking', 'free-parking'],
  [22, 'Chance 2', 'card'],
  [30, 'Go To Jail', 'go-to-jail'],
  [33, 'Community Chest 3', 'card'],
  [36, 'Chance 3', 'card'],
  [38, 'Luxury Tax', 'tax'],
]

const NON_DEED_BY_SQUARE = new Map<SquareIndex, readonly [SquareIndex, string, SquareKind]>(
  NON_DEED_SQUARES.map((row) => [row[0], row]),
)

export const SQUARES: readonly BoardSquare[] = Array.from(
  { length: BOARD_SIZE },
  (_unused, index): BoardSquare => {
    const owned = DEED_BY_SQUARE.get(index)
    if (owned !== undefined) {
      return { index, name: owned.name, kind: 'deed', deed: owned.id }
    }
    const other = NON_DEED_BY_SQUARE.get(index)
    if (other === undefined) {
      throw new Error(`Square ${index} has neither a deed nor a definition.`)
    }
    return { index, name: other[1], kind: other[2], deed: null }
  },
)

export const DEEDS: Readonly<Record<DeedId, DeedDefinition>> =
  Object.fromEntries(DEED_LIST.map((d) => [d.id, d]))

export const DEED_IDS: readonly DeedId[] = DEED_LIST.map((d) => d.id)

function groupIds(group: ColorGroup): readonly DeedId[] {
  return DEED_LIST.filter((d) => d.group === group).map((d) => d.id)
}

export const GROUP_MEMBERS: Readonly<Record<ColorGroup, readonly DeedId[]>> = {
  brown: groupIds('brown'),
  'light-blue': groupIds('light-blue'),
  pink: groupIds('pink'),
  orange: groupIds('orange'),
  red: groupIds('red'),
  yellow: groupIds('yellow'),
  green: groupIds('green'),
  'dark-blue': groupIds('dark-blue'),
  railroad: groupIds('railroad'),
  utility: groupIds('utility'),
}

export function deedAt(square: SquareIndex): DeedDefinition | null {
  return DEED_BY_SQUARE.get(square) ?? null
}

export function deedById(id: DeedId): DeedDefinition | null {
  return DEEDS[id] ?? null
}

export function totalFaceValue(): Money {
  return DEED_LIST.reduce((total, d) => total + d.faceValue, 0)
}
