## Tasks 3-8

---

### Task 3: `config/board.ts` — the 40 squares and the 28 deeds

Board data — square layout, deed face values, rent tables, house costs, colour
groups — lives here. `config/economy.ts` owns tunable economic constants; this
file owns the physical board, which is not tunable. Nothing else in the codebase
may hard-code a square index, a face value or a rent figure.

**House costs are 90% of standard**, via `ECONOMY.HOUSE_COST_MULTIPLIER`. The
standard base costs (50/100/150/200 by group) are board data and live here; the
multiplier is a tunable and lives in `economy.ts`. All four products are exact
integers — 45, 90, 135, 180 — so no rounding rule is engaged.

**Files:**
- Create: `packages/engine/src/config/board.ts`
- Modify: `packages/engine/src/config/economy.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/config/board.test.ts`

**Interfaces:**
- Consumes: `ColorGroup`, `DeedId`, `Money`, `SquareIndex` from `core/types.js`; `DeedState` from `core/state.js`; `ECONOMY` from `config/economy.js`.
- Produces:
  - `type DeedDefinition = Omit<DeedState, 'owner' | 'mortgaged' | 'houses'> & { readonly name: string }`
  - `type SquareKind = 'go' | 'deed' | 'card' | 'tax' | 'jail' | 'free-parking' | 'go-to-jail'`
  - `interface BoardSquare { readonly index: SquareIndex; readonly name: string; readonly kind: SquareKind; readonly deed: DeedId | null }`
  - `const SQUARES: readonly BoardSquare[]` (length 40)
  - `const DEED_LIST: readonly DeedDefinition[]` (length 28)
  - `const DEEDS: Readonly<Record<DeedId, DeedDefinition>>`
  - `const DEED_IDS: readonly DeedId[]`
  - `const GROUP_MEMBERS: Readonly<Record<ColorGroup, readonly DeedId[]>>`
  - `function deedAt(square: SquareIndex): DeedDefinition | null`
  - `function deedById(id: DeedId): DeedDefinition | null`
  - `function totalFaceValue(): Money`
  - `const BOARD_SIZE`, `GO_SQUARE`, `INCOME_TAX_SQUARE`, `JAIL_SQUARE`, `FREE_PARKING_SQUARE`, `GO_TO_JAIL_SQUARE`, `LUXURY_TAX_SQUARE`, `CARD_SQUARES`
  - `const RAILROAD_RENT: readonly Money[]` (indexed by railroads owned)
  - `const UTILITY_MULTIPLIER: readonly number[]` (indexed by utilities owned)
  - `const DOUBLES_ROLL_MULTIPLIER: number` (1.19, spec section 19.2)

- [ ] **Step 1: Add the two new economy constants**

In `packages/engine/src/config/economy.ts`, inside the `ECONOMY` object, next to
`HOUSE_SUPPLY`:

```ts
  /** House and hotel costs are 90% of standard. Applied in config/board.ts. */
  HOUSE_COST_MULTIPLIER: 0.9,

  /** Buildings sell back to the bank at half the price paid. Spec 19.6. */
  BUILDING_SELLBACK_RATE: 0.5,
```

Delete `DRAFT_SKIP_COMPENSATION` in the same pass — spec section 3 rule 6 grants
a deed, never cash, and nothing reads the constant.

- [ ] **Step 2: Write the failing test**

`packages/engine/src/config/board.test.ts`:

```ts
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
      expect(deed.faceValue % 20, deed.id).toBe(0)
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/config/board.test.ts`
Expected: FAIL — `Cannot find module './board.js'`.

- [ ] **Step 4: Write the type surface and the deed table**

`packages/engine/src/config/board.ts`, first half:

```ts
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
 * 50/100/150/200 x 0.9 is exactly 45/90/135/180 in IEEE 754, so no rounding
 * rule is engaged, but the guard keeps it integral if the multiplier is retuned.
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
  const houseCost = Math.floor(standardHouseCost * ECONOMY.HOUSE_COST_MULTIPLIER)
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
```

- [ ] **Step 5: Write the square layout and the lookup tables**

Append to `packages/engine/src/config/board.ts`:

```ts
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

function groupIds(group: ColorGroup): readonly DeedId[] {
  return DEED_LIST.filter((d) => d.group === group).map((d) => d.id)
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/config/board.test.ts`
Expected: PASS, 10 assertions green. The `$5,690` total and the fixture
name/group cross-check are the two that matter; if either fails, the deed table
is wrong, not the test.

- [ ] **Step 7: Export the board from the package surface**

Add to `packages/engine/src/index.ts`, after the existing exports:

```ts
export * from './config/board.js'
```

- [ ] **Step 8: Verify the toolchain is clean**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/config packages/engine/src/index.ts
git commit -m "feat(engine): add the 40-square board and 28 deed definitions

Face values sum to exactly \$5,690, asserted directly. Square names and
colour groups are cross-checked against tests/fixtures/landing-probabilities.json
so the board and the Markov model cannot drift apart. House costs are 90%
of standard via ECONOMY.HOUSE_COST_MULTIPLIER, giving exact integers."
```

---

### Task 4: `session` context — phases, rounds, eras and instrument gating

**Files:**
- Create: `packages/engine/src/contexts/session/index.ts`
- Create: `packages/engine/src/contexts/session/selectors.ts`
- Create: `packages/engine/src/contexts/session/reduce.ts`
- Create: `packages/engine/src/contexts/session/decide.ts`
- Create: `packages/engine/src/core/reduce.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/session/session.test.ts`

**Interfaces:**
- Consumes: `GameState`, `GameConfig`, `PlayerState`, `DeedState`, `DeckState` from `core/state.js`; `GameEvent` from `core/events.js`; `Era`, `Phase`, `PlayerId`, `RoundNumber`, `PLAYER_IDS` from `core/types.js`; `Rejection`, `reject` from `core/errors.js`; `ECONOMY` from `config/economy.js`; `DEED_LIST` from `config/board.js`.
- Produces:
  - `type Instrument` and `const INSTRUMENTS: readonly Instrument[]`
  - `const UNLOCK_ERA: Readonly<Record<Instrument, Era>>`
  - `function eraForRound(round: RoundNumber): Era`
  - `function prevailingRate(state: GameState): number`
  - `function isUnlocked(state: GameState, instrument: Instrument): boolean`
  - `function unlockedInstruments(state: GameState): readonly Instrument[]`
  - `function newlyUnlockedIn(era: Era): readonly Instrument[]`
  - `function isFinalRound(state: GameState): boolean`
  - `function initialState(config: GameConfig): GameState`
  - `function reduceSession(state: GameState, event: GameEvent): GameState`
  - `function createGame(config: GameConfig): readonly GameEvent[]`
  - `type SessionCommand = { readonly type: 'advance-phase' }`
  - `function decideSession(state: GameState, command: SessionCommand): readonly GameEvent[] | Rejection`
  - `function reduce(state: GameState, event: GameEvent): GameState` and `function replay(events: readonly GameEvent[]): GameState` in `core/reduce.ts`

- [ ] **Step 1: Write the failing test**

`packages/engine/src/contexts/session/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  INSTRUMENTS, UNLOCK_ERA, createGame, decideSession, eraForRound,
  initialState, isUnlocked, newlyUnlockedIn, prevailingRate, unlockedInstruments,
} from './index.js'
import { reduce as reduceRoot, replay } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Era, Phase } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function events(state: GameState): readonly GameEvent[] {
  const result = decideSession(state, { type: 'advance-phase' })
  if (isRejection(result)) throw new Error(result.message)
  return result
}

function advance(state: GameState): GameState {
  return events(state).reduce(reduceRoot, state)
}

describe('era schedule', () => {
  it('maps every round to its era at the six-round boundaries', () => {
    const expected: readonly [number, Era][] = [
      [1, 1], [6, 1], [7, 2], [12, 2], [13, 3], [18, 3], [19, 4], [24, 4],
    ]
    for (const [round, era] of expected) {
      expect(eraForRound(round), `round ${round}`).toBe(era)
    }
  })

  it('quotes the prevailing rate for each era', () => {
    const rates: readonly [Era, number][] = [[1, 0.05], [2, 0.06], [3, 0.08], [4, 0.12]]
    for (const [era, rate] of rates) {
      const state: GameState = { ...initialState(CONFIG), era }
      expect(prevailingRate(state)).toBe(rate)
    }
  })
})

describe('instrument gating', () => {
  it('locks Era II instruments during Era I', () => {
    const state = initialState(CONFIG)
    expect(isUnlocked(state, 'credit-line')).toBe(true)
    expect(isUnlocked(state, 'peer-loan')).toBe(false)
    expect(isUnlocked(state, 'cdo')).toBe(false)
  })

  it('unlocks cumulatively as eras advance', () => {
    const era2: GameState = { ...initialState(CONFIG), era: 2 }
    expect(isUnlocked(era2, 'credit-line')).toBe(true)
    expect(isUnlocked(era2, 'rent-future')).toBe(true)
    expect(isUnlocked(era2, 'deed-option')).toBe(false)
    const era3: GameState = { ...initialState(CONFIG), era: 3 }
    expect(unlockedInstruments(era3)).toHaveLength(INSTRUMENTS.length)
  })

  it('unlocks everything from round 1 when unlockMode is all', () => {
    const state = initialState({ ...CONFIG, unlockMode: 'all' })
    expect(state.era).toBe(1)
    for (const instrument of INSTRUMENTS) {
      expect(isUnlocked(state, instrument), instrument).toBe(true)
    }
  })

  it('introduces no new instrument in Era IV', () => {
    expect(newlyUnlockedIn(4)).toEqual([])
    expect(Object.values(UNLOCK_ERA).every((era) => era <= 3)).toBe(true)
  })
})

describe('phase and round advancement', () => {
  it('walks setup -> draft -> market -> open -> movement -> settlement', () => {
    let state = replay([{ type: 'GameCreated', config: CONFIG }])
    expect(state.phase).toBe('setup')
    const seen: Phase[] = []
    for (const _step of [0, 1, 2, 3]) {
      state = { ...state, draft: { round: 8, submissions: [], complete: true } }
      state = advance(state)
      seen.push(state.phase)
    }
    expect(seen).toEqual(['draft', 'market', 'open', 'movement'])
    expect(state.round).toBe(1)
  })

  it('advances round then era then phase, in that order, out of Settlement', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: 6,
      era: 1,
    }
    expect(events(state)).toEqual([
      { type: 'RoundAdvanced', round: 7 },
      { type: 'EraAdvanced', era: 2 },
      { type: 'PhaseAdvanced', phase: 'market' },
    ])
  })

  it('emits no EraAdvanced when the era does not change', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: 5,
    }
    expect(events(state)).toEqual([
      { type: 'RoundAdvanced', round: 6 },
      { type: 'PhaseAdvanced', phase: 'market' },
    ])
  })

  it('goes to scoring instead of a 25th round', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'settlement',
      round: ECONOMY.TOTAL_ROUNDS,
      era: 4,
    }
    expect(events(state)).toEqual([{ type: 'PhaseAdvanced', phase: 'scoring' }])
  })

  it('refuses to leave the draft before it is finished', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'draft',
      draft: { round: 3, submissions: [], complete: false },
    }
    const result = decideSession(state, { type: 'advance-phase' })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses to advance past complete', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'complete',
    }
    expect(isRejection(decideSession(state, { type: 'advance-phase' }))).toBe(true)
  })
})

describe('game creation', () => {
  it('seats four players with the starting budget and 28 unowned deeds', () => {
    const state = replay(createGame(CONFIG))
    expect(Object.keys(state.players)).toHaveLength(4)
    for (const id of CONFIG.turnOrder) {
      const player = state.players[id]
      expect(player.cleanCash).toBe(ECONOMY.STARTING_CASH)
      expect(player.position).toBe(0)
      expect(player.consecutiveDoubles).toBe(0)
    }
    expect(Object.keys(state.deeds)).toHaveLength(28)
    expect(Object.values(state.deeds).every((d) => d.owner === null)).toBe(true)
    expect(state.treasury).toBe(0)
    expect(state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(state.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/session/session.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write `contexts/session/selectors.ts`**

```ts
import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { Era, RoundNumber } from '../../core/types.js'

/** Every player-facing capability that era gating can withhold. */
export type Instrument =
  | 'trade' | 'building' | 'mortgage' | 'credit-line'
  | 'peer-loan' | 'rent-future' | 'venture' | 'laundering' | 'bribery'
  | 'cdo' | 'cds' | 'deed-option' | 'insider-trading'

/**
 * Spec section 2. Era IV deliberately unlocks nothing: the last six rounds are
 * about surviving existing leverage, not learning a new instrument.
 */
export const UNLOCK_ERA: Readonly<Record<Instrument, Era>> = {
  trade: 1,
  building: 1,
  mortgage: 1,
  'credit-line': 1,
  'peer-loan': 2,
  'rent-future': 2,
  venture: 2,
  laundering: 2,
  bribery: 2,
  cdo: 3,
  cds: 3,
  'deed-option': 3,
  'insider-trading': 3,
}

export const INSTRUMENTS: readonly Instrument[] =
  Object.keys(UNLOCK_ERA) as readonly Instrument[]

export function eraForRound(round: RoundNumber): Era {
  const raw = Math.ceil(round / ECONOMY.ROUNDS_PER_ERA)
  return Math.min(4, Math.max(1, raw)) as Era
}

export function prevailingRate(state: GameState): number {
  return ECONOMY.INTEREST_RATE_BY_ERA[state.era]
}

export function isUnlocked(state: GameState, instrument: Instrument): boolean {
  if (state.config.unlockMode === 'all') return true
  return state.era >= UNLOCK_ERA[instrument]
}

export function unlockedInstruments(state: GameState): readonly Instrument[] {
  return INSTRUMENTS.filter((instrument) => isUnlocked(state, instrument))
}

/** Drives the rulebook's "what is new this era" view. */
export function newlyUnlockedIn(era: Era): readonly Instrument[] {
  return INSTRUMENTS.filter((instrument) => UNLOCK_ERA[instrument] === era)
}

export function isFinalRound(state: GameState): boolean {
  return state.round >= ECONOMY.TOTAL_ROUNDS
}

export function roundsRemaining(state: GameState): number {
  return Math.max(0, ECONOMY.TOTAL_ROUNDS - state.round)
}
```

- [ ] **Step 4: Write `contexts/session/reduce.ts`**

```ts
import { DEED_LIST } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type {
  DeckState, GameConfig, GameState, PlayerState,
} from '../../core/state.js'
import type { DeedId, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

const EMPTY_DECK: DeckState = { order: [], drawn: 0 }

function newPlayer(id: PlayerId): PlayerState {
  return {
    id,
    cleanCash: ECONOMY.STARTING_CASH,
    dirtyCash: 0,
    heat: 0,
    position: 0,
    inJail: false,
    consecutiveDoubles: 0,
    drawnCredit: 0,
    distressedDebt: 0,
    creditImpaired: false,
    ventures: [],
    marginCallFlaggedAt: null,
    launderedThisPhase: false,
    briberyUsedThisRound: false,
  }
}

export function initialState(config: GameConfig): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, newPlayer(id)]),
  ) as Record<PlayerId, PlayerState>

  const deeds = Object.fromEntries(
    DEED_LIST.map((d) => [d.id, {
      id: d.id,
      square: d.square,
      group: d.group,
      faceValue: d.faceValue,
      houseCost: d.houseCost,
      rentTable: d.rentTable,
      owner: null,
      mortgaged: false,
      houses: 0,
    }]),
  ) as Record<DeedId, GameState['deeds'][DeedId]>

  return {
    config,
    phase: 'setup',
    round: 1,
    era: 1,
    activePlayer: null,
    players,
    deeds,
    treasury: 0,
    housesRemaining: ECONOMY.HOUSE_SUPPLY,
    hotelsRemaining: ECONOMY.HOTEL_SUPPLY,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: { 1: EMPTY_DECK, 2: EMPTY_DECK, 3: EMPTY_DECK, 4: EMPTY_DECK },
  }
}

export function reduceSession(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GameCreated':
      return initialState(event.config)
    case 'PhaseAdvanced':
      return { ...state, phase: event.phase, activePlayer: null }
    case 'RoundAdvanced':
      return { ...state, round: event.round }
    case 'EraAdvanced':
      return { ...state, era: event.era }
    default:
      return state
  }
}
```

- [ ] **Step 5: Write `contexts/session/decide.ts`**

```ts
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { Phase } from '../../core/types.js'
import { reject, type Rejection } from '../../core/errors.js'
import { eraForRound } from './selectors.js'

export type SessionCommand = { readonly type: 'advance-phase' }

/** Bootstraps a game. Emitted before any state exists, so it takes no state. */
export function createGame(config: GameConfig): readonly GameEvent[] {
  return [{ type: 'GameCreated', config }]
}

const NEXT_WITHIN_ROUND: Partial<Record<Phase, Phase>> = {
  setup: 'draft',
  draft: 'market',
  market: 'open',
  open: 'movement',
  movement: 'settlement',
  scoring: 'complete',
}

export function decideSession(
  state: GameState,
  command: SessionCommand,
): readonly GameEvent[] | Rejection {
  if (command.kind !== 'advance-phase') {
    return reject('WRONG_PHASE', 'Unknown session command.')
  }
  if (state.phase === 'complete') {
    return reject('WRONG_PHASE', 'The game is over. There is nothing to advance to.')
  }
  if (state.phase === 'draft' && state.draft?.complete !== true) {
    return reject('WRONG_PHASE', 'All seven draft rounds must resolve before play begins.')
  }
  if (state.phase === 'settlement') {
    if (state.round >= ECONOMY.TOTAL_ROUNDS) {
      return [{ type: 'PhaseAdvanced', phase: 'scoring' }]
    }
    const round = state.round + 1
    const era = eraForRound(round)
    const events: GameEvent[] = [{ type: 'RoundAdvanced', round }]
    if (era !== state.era) events.push({ type: 'EraAdvanced', era })
    events.push({ type: 'PhaseAdvanced', phase: 'market' })
    return events
  }
  const next = NEXT_WITHIN_ROUND[state.phase]
  if (next === undefined) {
    return reject('WRONG_PHASE', `Nothing follows the ${state.phase} phase.`)
  }
  return [{ type: 'PhaseAdvanced', phase: next }]
}
```

- [ ] **Step 6: Write `contexts/session/index.ts` and `core/reduce.ts`**

`packages/engine/src/contexts/session/index.ts`:

```ts
export * from './selectors.js'
export { initialState, reduceSession } from './reduce.js'
export { createGame, decideSession, type SessionCommand } from './decide.js'
```

`packages/engine/src/core/reduce.ts`. Later tasks add one line each here as
their context reducer lands; every reducer returns `state` untouched for events
it does not own, so chaining is safe:

```ts
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceSession(state, event)
}

export function replay(events: readonly GameEvent[]): GameState {
  const [first, ...rest] = events
  if (first === undefined || first.type !== 'GameCreated') {
    throw new Error('The first event in a log must be GameCreated.')
  }
  return rest.reduce(reduce, initialState(first.config))
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/session/session.test.ts`
Expected: PASS. This depends on `PlayerState.consecutiveDoubles` existing and on
`PlayerState.draftBudget` being gone — both folded into Task 2, and both restated
under **CONTRACT ADDITIONS REQUIRED** at the end of this document.

- [ ] **Step 8: Export session and the root reducer**

Add to `packages/engine/src/index.ts`:

```ts
export * from './core/reduce.js'
export * from './contexts/session/index.js'
```

- [ ] **Step 9: Verify the toolchain and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add packages/engine/src/contexts/session packages/engine/src/core/reduce.ts packages/engine/src/index.ts
git commit -m "feat(session): phase, round and era advancement with instrument gating

Settlement emits RoundAdvanced, then EraAdvanced, then PhaseAdvanced so the
Market phase always reads a current round and era. Era IV unlocks nothing,
asserted directly. unlockMode 'all' bypasses gating entirely."
```

---

### Task 5: `board` context — movement, doubles, jail, GO salary and taxes

**Files:**
- Create: `packages/engine/src/contexts/board/selectors.ts`
- Create: `packages/engine/src/contexts/board/reduce.ts`
- Create: `packages/engine/src/contexts/board/decide.ts`
- Create: `packages/engine/src/contexts/board/index.ts`
- Create: `packages/engine/src/contexts/credit/reduce.ts` (the waterfall's second step only; Task 9 extends this file)
- Create: `packages/engine/src/contexts/credit/index.ts`
- Modify: `packages/engine/src/core/reduce.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/board/board.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerState` from `core/state.js`; `GameEvent` from `core/events.js`; `DiceRoll`, `Money`, `PlayerId`, `SquareIndex` from `core/types.js`; `reject`, `Rejection` from `core/errors.js`; `ECONOMY` from `config/economy.js`; `BOARD_SIZE`, `GO_TO_JAIL_SQUARE`, `INCOME_TAX_SQUARE`, `JAIL_SQUARE`, `LUXURY_TAX_SQUARE`, `deedAt` from `config/board.js`; `initialState` from `contexts/session/index.js` (tests only).
- Produces:
  - `function diceTotal(dice: DiceRoll): number`
  - `function isDoubles(dice: DiceRoll): boolean`
  - `function destination(from: SquareIndex, total: number): SquareIndex`
  - `function passesGo(from: SquareIndex, total: number): boolean`
  - `function shortfall(cash: Money, amount: Money): Money`
  - `function reduceBoard(state: GameState, event: GameEvent): GameState`
  - `type BoardCommand = { readonly type: 'roll-dice'; readonly player: PlayerId; readonly dice: DiceRoll }`
  - `function decideBoard(state: GameState, command: BoardCommand): readonly GameEvent[] | Rejection`
  - `function reduceCredit(state: GameState, event: GameEvent): GameState` handling `ObligationCapitalised`

**The universal obligation waterfall.** Spec section 19.8. Every obligation in
the game — rent, taxes, the jail fee, interest, carrying cost, audit fines, CDS
premiums — settles the same two-step way, and there is no third step:

1. Pay from clean cash to the extent available.
2. Any shortfall **capitalises into the drawn credit balance, uncapped and
   without regard to the borrowing base.**

The counterparty is therefore *always* paid in full. Clean cash never goes
negative, the Treasury funds nothing, and **no ordinary unpayable obligation
produces distressed debt**. Distressed debt now arises in exactly one place: a
margin call went uncured, forced liquidation ran, and it stopped because the
player had no unmortgaged deeds left (Task 10).

**The asymmetry is the whole point.** Automatic obligations capitalise uncapped;
voluntary credit draws stay capped at the borrowing base (Task 9). That gap
between drawn balance and base is the only mechanism in the game that ever
generates a margin call, so it must be encoded exactly this way.

Mechanically: an event carries the *full* obligation and its reducer moves the
full amount to the counterparty while floors the payer's clean cash at zero.
`decide` emits a paired `ObligationCapitalised` for the shortfall, whose reducer
lives in the `credit` context and raises `drawnCredit`. Money is conserved across
the pair — the bank pool falls by exactly what the drawn balance rises.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/contexts/board/board.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideBoard, destination, isDoubles, passesGo } from './index.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function movementState(overrides: Partial<GameState['players']['P1']> = {}): GameState {
  const base = initialState(CONFIG)
  return {
    ...base,
    phase: 'movement',
    players: { ...base.players, P1: { ...base.players.P1, ...overrides } },
  }
}

function roll(state: GameState, dice: DiceRoll, player: PlayerId = 'P1'): readonly GameEvent[] {
  const result = decideBoard(state, { type: 'roll-dice', player, dice })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, state)
}

/**
 * Cash held by players, plus the Treasury, less what the bank has lent out.
 * Every event must leave this constant.
 */
function totalMoney(state: GameState): number {
  return Object.values(state.players)
    .reduce((t, p) => t + p.cleanCash - p.drawnCredit, 0) + state.treasury
}

describe('movement arithmetic', () => {
  it('wraps the board and detects passing GO', () => {
    expect(destination(0, 7)).toBe(7)
    expect(destination(39, 3)).toBe(2)
    expect(destination(34, 6)).toBe(0)
    expect(passesGo(0, 7)).toBe(false)
    expect(passesGo(39, 3)).toBe(true)
    expect(passesGo(34, 6)).toBe(true)
    expect(isDoubles([4, 4])).toBe(true)
    expect(isDoubles([4, 5])).toBe(false)
  })
})

describe('rolling and moving', () => {
  it('moves the token and emits nothing else on a quiet square', () => {
    const before = movementState({ position: 0 })
    const events = roll(before, [3, 4])
    expect(events).toEqual([
      { type: 'DiceRolled', player: 'P1', dice: [3, 4] },
      { type: 'TokenMoved', player: 'P1', from: 0, to: 7, passedGo: false },
    ])
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(7)
    expect(after.activePlayer).toBe('P1')
  })

  it('pays the $350 GO salary on passing GO', () => {
    const before = movementState({ position: 36 })
    const events = roll(before, [2, 4])
    expect(events).toContainEqual({
      type: 'SalaryPaid', player: 'P1', amount: ECONOMY.GO_SALARY,
    })
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(2)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 350)
    expect(after.treasury).toBe(-350)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('pays the GO salary on landing exactly on GO', () => {
    const before = movementState({ position: 34 })
    const after = apply(before, roll(before, [3, 3]))
    expect(after.players.P1.position).toBe(0)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 350)
  })

  it('charges $200 Income Tax on square 4 and $100 Luxury Tax on square 38', () => {
    const income = movementState({ position: 0 })
    const afterIncome = apply(income, roll(income, [1, 3]))
    expect(afterIncome.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 200)
    expect(afterIncome.treasury).toBe(200)

    const luxury = movementState({ position: 33 })
    const afterLuxury = apply(luxury, roll(luxury, [2, 3]))
    expect(afterLuxury.players.P1.position).toBe(38)
    expect(afterLuxury.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 100)
    expect(afterLuxury.treasury).toBe(100)
  })

  it('capitalises an unpayable tax into drawn credit, uncapped', () => {
    const before = movementState({ position: 0, cleanCash: 30 })
    const events = roll(before, [1, 3])
    expect(events).toContainEqual({
      type: 'TaxPaid', player: 'P1', amount: 200, kind: 'income',
    })
    expect(events).toContainEqual({
      type: 'ObligationCapitalised', player: 'P1', amount: 170, obligation: 'tax',
    })
    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(170)
    // The Treasury is paid the full assessed tax regardless.
    expect(after.treasury).toBe(200)
    expect(after.players.P1.distressedDebt).toBe(0)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('capitalises without regard to the borrowing base', () => {
    // No deeds, so the borrowing base is zero and a voluntary draw is impossible.
    const before = movementState({ position: 0, cleanCash: 0 })
    const after = apply(before, roll(before, [1, 3]))
    expect(after.players.P1.drawnCredit).toBe(200)
    expect(after.players.P1.cleanCash).toBe(0)
  })
})

describe('jail', () => {
  it('sends a player to jail from square 30 without paying GO', () => {
    const before = movementState({ position: 26 })
    const events = roll(before, [1, 3])
    expect(events).toContainEqual({
      type: 'SentToJail', player: 'P1', reason: 'square',
    })
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(10)
    expect(after.players.P1.inJail).toBe(true)
    expect(after.players.P1.consecutiveDoubles).toBe(0)
  })

  it('sends a player to jail on the third consecutive double without moving', () => {
    const before = movementState({ position: 18, consecutiveDoubles: 2 })
    const events = roll(before, [5, 5])
    expect(events).toEqual([
      { type: 'DiceRolled', player: 'P1', dice: [5, 5] },
      { type: 'SentToJail', player: 'P1', reason: 'triple-doubles' },
    ])
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(10)
  })

  it('counts consecutive doubles and resets on a non-double', () => {
    let state = movementState({ position: 0 })
    state = apply(state, roll(state, [2, 2]))
    expect(state.players.P1.consecutiveDoubles).toBe(1)
    state = apply(state, roll(state, [3, 3]))
    expect(state.players.P1.consecutiveDoubles).toBe(2)
    state = apply(state, roll(state, [1, 2]))
    expect(state.players.P1.consecutiveDoubles).toBe(0)
  })

  it('charges the mandatory $50 to leave jail, then moves normally', () => {
    const before = movementState({ position: 10, inJail: true })
    const events = roll(before, [3, 4])
    expect(events[1]).toEqual({
      type: 'JailExited', player: 'P1', fee: ECONOMY.JAIL_FEE,
    })
    const after = apply(before, events)
    expect(after.players.P1.inJail).toBe(false)
    expect(after.players.P1.position).toBe(17)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 50)
    expect(after.treasury).toBe(50)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })
})

describe('validation', () => {
  it('refuses a roll outside the movement phase', () => {
    const state = { ...movementState(), phase: 'open' as const }
    const result = decideBoard(state, { type: 'roll-dice', player: 'P1', dice: [1, 1] })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses dice outside 1-6', () => {
    const result = decideBoard(movementState(), {
      type: 'roll-dice', player: 'P1', dice: [0, 7],
    })
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/board.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write `contexts/board/selectors.ts`**

```ts
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
```

- [ ] **Step 4: Write `contexts/board/reduce.ts`**

```ts
import { JAIL_SQUARE } from '../../config/board.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState, PlayerState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { isDoubles, shortfall } from './selectors.js'

function withPlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id], ...patch } },
  }
}

/**
 * Step 1 of the obligation waterfall: the Treasury is paid the full obligation
 * and the payer's clean cash floors at zero. The gap is closed by the paired
 * ObligationCapitalised event, which the credit context reduces.
 */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const cash = state.players[id].cleanCash
  return {
    ...withPlayer(state, id, { cleanCash: cash - (amount - shortfall(cash, amount)) }),
    treasury: state.treasury + amount,
  }
}

function payFromTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  return {
    ...withPlayer(state, id, { cleanCash: state.players[id].cleanCash + amount }),
    treasury: state.treasury - amount,
  }
}

/** Step 1 of the waterfall for a player-to-player obligation. */
export function transfer(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  amount: Money,
): GameState {
  const cash = state.players[from].cleanCash
  const paid = amount - shortfall(cash, amount)
  const afterPayer = withPlayer(state, from, { cleanCash: cash - paid })
  return withPlayer(afterPayer, to, {
    cleanCash: afterPayer.players[to].cleanCash + amount,
  })
}

export function reduceBoard(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'DiceRolled': {
      const player = state.players[event.player]
      return {
        ...withPlayer(state, event.player, {
          consecutiveDoubles: isDoubles(event.dice)
            ? player.consecutiveDoubles + 1
            : 0,
        }),
        activePlayer: event.player,
      }
    }
    case 'TokenMoved':
      return withPlayer(state, event.player, { position: event.to })
    case 'SentToJail':
      return withPlayer(state, event.player, {
        position: JAIL_SQUARE,
        inJail: true,
        consecutiveDoubles: 0,
      })
    case 'JailExited':
      return payTreasury(
        withPlayer(state, event.player, { inJail: false }),
        event.player,
        event.fee,
      )
    case 'SalaryPaid':
      return payFromTreasury(state, event.player, event.amount)
    case 'TaxPaid':
      return payTreasury(state, event.player, event.amount)
    case 'RentCharged':
      return transfer(state, event.from, event.to, event.amount)
    default:
      return state
  }
}
```

- [ ] **Step 5: Write `contexts/board/decide.ts`**

```ts
import {
  GO_TO_JAIL_SQUARE, INCOME_TAX_SQUARE, LUXURY_TAX_SQUARE,
} from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import { reject, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DiceRoll, Money, PlayerId, SquareIndex } from '../../core/types.js'
import {
  destination, diceTotal, isDoubles, isLegalDie, passesGo, shortfall,
} from './selectors.js'

export type BoardCommand = {
  readonly type: 'roll-dice'
  readonly player: PlayerId
  readonly dice: DiceRoll
}

/**
 * A running cash ledger for the turn. The reducer applies the same events in
 * the same order against the same starting cash, so the two agree exactly.
 */
class TurnLedger {
  private cash: Money

  constructor(cash: Money) {
    this.cash = cash
  }

  /** Returns the unpayable part, and debits what could be paid. */
  charge(amount: Money): Money {
    const unpaid = shortfall(this.cash, amount)
    this.cash -= amount - unpaid
    return unpaid
  }

  credit(amount: Money): void {
    this.cash += amount
  }
}

export function decideBoard(
  state: GameState,
  command: BoardCommand,
): readonly GameEvent[] | Rejection {
  if (command.kind !== 'roll-dice') {
    return reject('WRONG_PHASE', 'Unknown board command.')
  }
  if (state.phase !== 'movement') {
    return reject('WRONG_PHASE', 'Dice may only be entered during the Movement phase.')
  }
  const { player, dice } = command
  if (!isLegalDie(dice[0]) || !isLegalDie(dice[1])) {
    return reject('INVALID_DICE', 'Each die must show a whole number from 1 to 6.')
  }

  const state0 = state.players[player]
  const ledger = new TurnLedger(state0.cleanCash)
  const events: GameEvent[] = [{ type: 'DiceRolled', player, dice }]

  if (state0.inJail) {
    events.push({ type: 'JailExited', player, fee: ECONOMY.JAIL_FEE })
    capitalise(events, player, ledger.charge(ECONOMY.JAIL_FEE), 'jail-fee')
  }

  if (isDoubles(dice) && state0.consecutiveDoubles === 2) {
    events.push({ type: 'SentToJail', player, reason: 'triple-doubles' })
    return events
  }

  const total = diceTotal(dice)
  const from = state0.position
  const to = destination(from, total)
  const passed = passesGo(from, total)
  events.push({ type: 'TokenMoved', player, from, to, passedGo: passed })
  if (passed) {
    events.push({ type: 'SalaryPaid', player, amount: ECONOMY.GO_SALARY })
    ledger.credit(ECONOMY.GO_SALARY)
  }
  events.push(...resolveLanding(state, player, to, dice, ledger))
  return events
}

/**
 * Step 2 of the obligation waterfall: whatever clean cash could not cover
 * capitalises into the drawn balance. Uncapped by design — the borrowing base
 * is deliberately not consulted here.
 */
function capitalise(
  events: GameEvent[],
  player: PlayerId,
  unpaid: Money,
  obligation: ObligationKind,
): void {
  if (unpaid > 0) {
    events.push({ type: 'ObligationCapitalised', player, amount: unpaid, obligation })
  }
}

/** Task 6 replaces the deed branch of this function with rent resolution. */
function resolveLanding(
  _state: GameState,
  player: PlayerId,
  square: SquareIndex,
  _dice: DiceRoll,
  ledger: TurnLedger,
): readonly GameEvent[] {
  const events: GameEvent[] = []
  if (square === GO_TO_JAIL_SQUARE) {
    events.push({ type: 'SentToJail', player, reason: 'square' })
    return events
  }
  if (square === INCOME_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.INCOME_TAX, kind: 'income' })
    capitalise(events, player, ledger.charge(ECONOMY.INCOME_TAX), 'tax')
    return events
  }
  if (square === LUXURY_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.LUXURY_TAX, kind: 'luxury' })
    capitalise(events, player, ledger.charge(ECONOMY.LUXURY_TAX), 'tax')
    return events
  }
  return events
}
```

`ObligationKind` is imported from `core/events.js` alongside `GameEvent`.

- [ ] **Step 6: Write step 2 of the waterfall in `contexts/credit/reduce.ts`**

The `credit` context begins here because Task 5 is the first task that generates
an automatic obligation. Task 9 extends this same file with borrowing base,
voluntary draws, interest and carrying cost. Keeping `drawnCredit` writes inside
`credit` is what stops `board` from reaching into another context's state slice.

`packages/engine/src/contexts/credit/reduce.ts`:

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'

/**
 * Step 2 of the universal obligation waterfall, spec section 19.8.
 *
 * This raises the drawn balance with NO borrowing-base check, and that is
 * deliberate. Voluntary draws (Task 9) are capped at the base; automatic
 * obligations are not. The gap the two open up is the only thing in the game
 * that produces a margin call.
 */
export function reduceCredit(state: GameState, event: GameEvent): GameState {
  if (event.type !== 'ObligationCapitalised') return state
  const player = state.players[event.player]
  return {
    ...state,
    players: {
      ...state.players,
      [event.player]: { ...player, drawnCredit: player.drawnCredit + event.amount },
    },
  }
}
```

`packages/engine/src/contexts/credit/index.ts`:

```ts
export { reduceCredit } from './reduce.js'
```

- [ ] **Step 7: Write `contexts/board/index.ts` and wire the root reducer**

`packages/engine/src/contexts/board/index.ts`:

```ts
export * from './selectors.js'
export { reduceBoard, transfer } from './reduce.js'
export { decideBoard, type BoardCommand } from './decide.js'
```

In `packages/engine/src/core/reduce.ts`, add the board and credit reducers:

```ts
import { reduceBoard } from '../contexts/board/index.js'
import { reduceCredit } from '../contexts/credit/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceCredit(reduceBoard(reduceSession(state, event), event), event)
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/board.test.ts`
Expected: PASS, including both `totalMoney` conservation checks. `INVALID_DICE`
and the `ObligationCapitalised` event must be in the contract — see
**CONTRACT ADDITIONS REQUIRED** and **NEW EVENTS REQUIRED**.

- [ ] **Step 9: Export the board context and commit**

Add `export * from './contexts/board/index.js'` and
`export * from './contexts/credit/index.js'` to `packages/engine/src/index.ts`,
then run `npm run typecheck && npm run lint && npm test`.

```bash
git add packages/engine/src/contexts/board packages/engine/src/contexts/credit packages/engine/src/core/reduce.ts packages/engine/src/index.ts
git commit -m "feat(board): movement, doubles, jail, GO salary and fixed taxes

Three consecutive doubles jails without moving. Leaving jail costs a
mandatory \$50, matching the convention the landing-probability model
assumes. Unpayable obligations capitalise into the drawn credit balance
uncapped, per the universal waterfall in spec 19.8 — clean cash never
goes negative and no distressed debt is booked."
```

---

### Task 6: `board` context — rent calculation

Rent lives in its own file so `board` stays under the 500-line limit. The context
now spans `selectors.ts`, `reduce.ts`, `decide.ts`, `rent.ts` and (Task 7)
`markov.ts`, all re-exported through the single `index.ts`; other contexts still
import only `contexts/board/index.js`.

**Files:**
- Create: `packages/engine/src/contexts/board/rent.ts`
- Modify: `packages/engine/src/contexts/board/decide.ts`
- Modify: `packages/engine/src/contexts/board/index.ts`
- Test: `packages/engine/src/contexts/board/rent.test.ts`

**Interfaces:**
- Consumes: `GROUP_MEMBERS`, `RAILROAD_RENT`, `UTILITY_MULTIPLIER`, `deedAt` from `config/board.js`; `GameState`, `DeedState`, `RentFuture` from `core/state.js`; `ColorGroup`, `DeedId`, `DiceRoll`, `Money`, `PlayerId` from `core/types.js`; `diceTotal` from `./selectors.js`.
- Produces:
  - `function rentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money`
  - `function activeFutureOn(state: GameState, deedId: DeedId): RentFuture | null`
  - `function rentRecipient(state: GameState, deedId: DeedId): PlayerId | null`
  - `function ownsWholeGroup(state: GameState, group: ColorGroup, owner: PlayerId): boolean`
  - `function countOwnedInGroup(state: GameState, group: ColorGroup, owner: PlayerId): number`
  - `decideBoard` now emits `RentCharged`, `RentRoutedToFuture` and a rent `ObligationCapitalised`.

**Doubling is per-square, the standard Monopoly rule.** Where a player owns
every deed in a colour group, rent doubles on each *individually* undeveloped
deed in that group. A group with houses on one deed still pays doubled rent on
its undeveloped siblings. Mortgaged deeds count toward neither the group test
nor the railroad and utility counts.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/contexts/board/rent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideBoard, rentDue, rentRecipient } from './index.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedId, DiceRoll, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

interface Holding {
  readonly deed: DeedId
  readonly owner: PlayerId
  readonly houses?: number
  readonly mortgaged?: boolean
}

function board(holdings: readonly Holding[], patch: Partial<GameState> = {}): GameState {
  const base = initialState(CONFIG)
  const deeds = { ...base.deeds }
  for (const h of holdings) {
    const deed = deeds[h.deed]
    if (deed === undefined) throw new Error(`No such deed: ${h.deed}`)
    deeds[h.deed] = {
      ...deed,
      owner: h.owner,
      houses: h.houses ?? 0,
      mortgaged: h.mortgaged ?? false,
    }
  }
  return { ...base, phase: 'movement', deeds, ...patch }
}

const ROLL: DiceRoll = [3, 4]

describe('colour group rent', () => {
  it('charges base rent on a single unimproved deed', () => {
    expect(rentDue(board([{ deed: 'boardwalk', owner: 'P2' }]), 'boardwalk', ROLL)).toBe(50)
  })

  it('doubles base rent when the owner holds the whole group', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2' },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(100)
    expect(rentDue(state, 'park-place', ROLL)).toBe(70)
  })

  it('does not double a partially owned group', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P3' },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(50)
  })

  it('keeps doubling undeveloped siblings when another deed is developed', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2', houses: 1 },
    ])
    // Doubling is per-square: Boardwalk is still unimproved, so it still doubles.
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(100)
    // Park Place is improved, so it reads its rent table and is never doubled.
    expect(rentDue(state, 'park-place', ROLL)).toBe(175)
  })

  it('doubles each undeveloped member of a three-deed group independently', () => {
    const state = board([
      { deed: 'st-james-place', owner: 'P2', houses: 2 },
      { deed: 'tennessee-avenue', owner: 'P2' },
      { deed: 'new-york-avenue', owner: 'P2' },
    ])
    expect(rentDue(state, 'st-james-place', ROLL)).toBe(200)
    expect(rentDue(state, 'tennessee-avenue', ROLL)).toBe(28)
    expect(rentDue(state, 'new-york-avenue', ROLL)).toBe(32)
  })

  it('stops doubling when any deed in the group is mortgaged', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2', mortgaged: true },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(50)
    expect(rentDue(state, 'park-place', ROLL)).toBe(0)
  })

  it('reads the rent table by house count, hotel at index 5', () => {
    const houses = [50, 200, 600, 1400, 1700, 2000]
    for (let n = 0; n < houses.length; n += 1) {
      const state = board([{ deed: 'boardwalk', owner: 'P2', houses: n }])
      expect(rentDue(state, 'boardwalk', ROLL), `${n} houses`).toBe(houses[n])
    }
  })

  it('charges nothing on an unowned, bank-owned or mortgaged deed', () => {
    expect(rentDue(initialState(CONFIG), 'boardwalk', ROLL)).toBe(0)
    expect(rentDue(board([{ deed: 'boardwalk', owner: 'P2', mortgaged: true }]), 'boardwalk', ROLL)).toBe(0)
  })
})

describe('railroad and utility rent', () => {
  const RAILROADS: readonly DeedId[] = [
    'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
  ]

  it('charges 25/50/100/200 by number of railroads owned', () => {
    const expected = [25, 50, 100, 200]
    for (let n = 1; n <= 4; n += 1) {
      const state = board(RAILROADS.slice(0, n).map((deed) => ({ deed, owner: 'P2' as const })))
      expect(rentDue(state, 'reading-railroad', ROLL), `${n} owned`).toBe(expected[n - 1])
    }
  })

  it('excludes mortgaged railroads from the count', () => {
    const state = board([
      { deed: 'reading-railroad', owner: 'P2' },
      { deed: 'short-line', owner: 'P2', mortgaged: true },
    ])
    expect(rentDue(state, 'reading-railroad', ROLL)).toBe(25)
    expect(rentDue(state, 'short-line', ROLL)).toBe(0)
  })

  it('charges 4x the dice roll for one utility and 10x for both', () => {
    const one = board([{ deed: 'electric-company', owner: 'P2' }])
    expect(rentDue(one, 'electric-company', [3, 4])).toBe(28)
    const both = board([
      { deed: 'electric-company', owner: 'P2' },
      { deed: 'water-works', owner: 'P2' },
    ])
    expect(rentDue(both, 'electric-company', [3, 4])).toBe(70)
    expect(rentDue(both, 'water-works', [6, 6])).toBe(120)
  })
})

describe('who pays and who receives', () => {
  function land(state: GameState, from: number, dice: DiceRoll, player: PlayerId = 'P1') {
    const seeded: GameState = {
      ...state,
      players: { ...state.players, [player]: { ...state.players[player], position: from } },
    }
    const result = decideBoard(seeded, { type: 'roll-dice', player, dice })
    if (isRejection(result)) throw new Error(result.message)
    return { seeded, events: result }
  }

  it('charges rent from the lander to the owner', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }])
    const { seeded, events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'RentCharged', from: 'P1', to: 'P2', deed: 'boardwalk', amount: 50,
    })
    const after = events.reduce(reduce, seeded)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 50)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
  })

  it('charges the owner nothing on their own deed', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P1' }])
    const { events } = land(state, 32, [3, 4])
    expect(events.some((e) => e.type === 'RentCharged')).toBe(false)
  })

  it('routes rent to an active futures holder', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 5,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P3', startRound: 4, endRound: 9 }],
    })
    expect(rentRecipient(state, 'boardwalk')).toBe('P3')
    const { events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'RentCharged', from: 'P1', to: 'P3', deed: 'boardwalk', amount: 50,
    })
    expect(events).toContainEqual({
      type: 'RentRoutedToFuture', contract: 'F1', holder: 'P3', amount: 50,
    })
  })

  it('ignores a contract whose window has not started or has ended', () => {
    const early = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 3,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P3', startRound: 4, endRound: 9 }],
    })
    expect(rentRecipient(early, 'boardwalk')).toBe('P2')
    const late = { ...early, round: 10 }
    expect(rentRecipient(late, 'boardwalk')).toBe('P2')
  })

  it('collects nothing when the futures holder lands on a deed they do not own', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 5,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P1', startRound: 4, endRound: 9 }],
    })
    const { events } = land(state, 32, [3, 4])
    expect(events.some((e) => e.type === 'RentCharged')).toBe(false)
  })

  it('pays the payee in full and capitalises the payer shortfall', () => {
    const base = board([{ deed: 'boardwalk', owner: 'P2' }])
    const state: GameState = {
      ...base,
      players: { ...base.players, P1: { ...base.players.P1, cleanCash: 10 } },
    }
    const { seeded, events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'ObligationCapitalised', player: 'P1', amount: 40, obligation: 'rent',
    })
    const after = events.reduce(reduce, seeded)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(40)
    expect(after.players.P1.distressedDebt).toBe(0)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
    // The Treasury funds nothing; the bank does, via the drawn balance.
    expect(after.treasury).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/rent.test.ts`
Expected: FAIL — `rentDue` and `rentRecipient` are not exported.

- [ ] **Step 3: Write `contexts/board/rent.ts`**

```ts
import { GROUP_MEMBERS, RAILROAD_RENT, UTILITY_MULTIPLIER } from '../../config/board.js'
import type { DeedState, GameState, RentFuture } from '../../core/state.js'
import type { ColorGroup, DeedId, DiceRoll, Money, PlayerId } from '../../core/types.js'
import { diceTotal } from './selectors.js'

/** Deeds a bank liquidation removed from play collect nothing. */
function collectingOwner(deed: DeedState): PlayerId | null {
  if (deed.owner === null || deed.owner === 'bank') return null
  if (deed.mortgaged) return null
  return deed.owner
}

export function countOwnedInGroup(
  state: GameState,
  group: ColorGroup,
  owner: PlayerId,
): number {
  return GROUP_MEMBERS[group].filter((id) => {
    const deed = state.deeds[id]
    return deed !== undefined && deed.owner === owner && !deed.mortgaged
  }).length
}

/**
 * Spec section 2: owning every deed in a colour group doubles the rent on each
 * INDIVIDUALLY undeveloped deed in it. Houses on one deed do not stop its
 * undeveloped siblings from doubling. A mortgaged member breaks the group.
 */
export function ownsWholeGroup(
  state: GameState,
  group: ColorGroup,
  owner: PlayerId,
): boolean {
  return GROUP_MEMBERS[group].every((id) => {
    const deed = state.deeds[id]
    return deed !== undefined && deed.owner === owner && !deed.mortgaged
  })
}

export function rentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money {
  const deed = state.deeds[deedId]
  if (deed === undefined) return 0
  const owner = collectingOwner(deed)
  if (owner === null) return 0

  if (deed.group === 'railroad') {
    return RAILROAD_RENT[countOwnedInGroup(state, 'railroad', owner)] ?? 0
  }
  if (deed.group === 'utility') {
    const multiplier = UTILITY_MULTIPLIER[countOwnedInGroup(state, 'utility', owner)] ?? 0
    return multiplier * diceTotal(dice)
  }
  // A developed deed reads its rent table and is never doubled.
  if (deed.houses > 0) {
    return deed.rentTable[deed.houses] ?? 0
  }
  const base = deed.rentTable[0] ?? 0
  return ownsWholeGroup(state, deed.group, owner) ? base * 2 : base
}

export function activeFutureOn(state: GameState, deedId: DeedId): RentFuture | null {
  return state.futures.find(
    (f) => f.deed === deedId
      && state.round >= f.startRound
      && state.round <= f.endRound,
  ) ?? null
}

/** Spec section 19.2: the holder if a contract is live, otherwise the owner. */
export function rentRecipient(state: GameState, deedId: DeedId): PlayerId | null {
  const deed = state.deeds[deedId]
  if (deed === undefined) return null
  const owner = collectingOwner(deed)
  if (owner === null) return null
  return activeFutureOn(state, deedId)?.holder ?? owner
}
```

- [ ] **Step 4: Replace the deed branch of `resolveLanding` in `decide.ts`**

Add `import { deedAt } from '../../config/board.js'` alongside the existing board
imports, `import { activeFutureOn, rentDue, rentRecipient } from './rent.js'`,
and replace `resolveLanding` with:

```ts
function resolveLanding(
  state: GameState,
  player: PlayerId,
  square: SquareIndex,
  dice: DiceRoll,
  ledger: TurnLedger,
): readonly GameEvent[] {
  const events: GameEvent[] = []
  if (square === GO_TO_JAIL_SQUARE) {
    events.push({ type: 'SentToJail', player, reason: 'square' })
    return events
  }
  if (square === INCOME_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.INCOME_TAX, kind: 'income' })
    capitalise(events, player, ledger.charge(ECONOMY.INCOME_TAX), 'tax')
    return events
  }
  if (square === LUXURY_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.LUXURY_TAX, kind: 'luxury' })
    capitalise(events, player, ledger.charge(ECONOMY.LUXURY_TAX), 'tax')
    return events
  }

  const definition = deedAt(square)
  if (definition === null) return events
  const deed = state.deeds[definition.id]
  // Spec 19.2: the owner owes nothing on their own deed.
  if (deed === undefined || deed.owner === player) return events

  const amount = rentDue(state, definition.id, dice)
  if (amount <= 0) return events
  const recipient = rentRecipient(state, definition.id)
  // Spec 19.2: a futures holder landing on a deed they do not own pays nobody.
  if (recipient === null || recipient === player) return events

  events.push({ type: 'RentCharged', from: player, to: recipient, deed: definition.id, amount })
  const contract = activeFutureOn(state, definition.id)
  if (contract !== null) {
    events.push({
      type: 'RentRoutedToFuture', contract: contract.id, holder: contract.holder, amount,
    })
  }
  capitalise(events, player, ledger.charge(amount), 'rent')
  return events
}
```

- [ ] **Step 5: Re-export rent from the board index**

Add to `packages/engine/src/contexts/board/index.ts`:

```ts
export * from './rent.js'
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/`
Expected: PASS — `board.test.ts` and `rent.test.ts` both green. The movement
tests must still pass unchanged; if they do not, `resolveLanding` has started
charging rent on a square it should not.

- [ ] **Step 7: Verify the toolchain and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add packages/engine/src/contexts/board
git commit -m "feat(board): rent tables, group doubling, railroads and utilities

Doubling is per-square, the standard rule: owning the full unmortgaged
colour group doubles rent on each individually undeveloped deed in it.
Railroads pay 25/50/100/200 by unmortgaged count; utilities pay 4x or
10x the dice total. Rent routes to an active futures holder per spec
19.2, nobody pays themselves, and an unpayable bill capitalises into
the payer's drawn credit while the payee is paid in full."
```

---

### Task 7: `board` context — the Markov landing model

`tests/fixtures/landing-probabilities.json` is authoritative. It was derived
three independent ways (power iteration, a linear solve of `π(P − I) = 0`
agreeing to 2.1e-16, and a 40-million-roll Monte Carlo). **If the implementation
disagrees with the fixture, the implementation is wrong.** The fixture assumes
no card movement — squares 2, 7, 17, 22, 33 and 36 are ordinary resting squares
— and mandatory pay-to-leave-jail, so square 30 is the only relocating square
on the board and rolling for doubles to escape jail is not modelled because it
is not offered.

**Files:**
- Create: `packages/engine/src/contexts/board/markov.ts`
- Modify: `packages/engine/src/contexts/board/index.ts`
- Test: `packages/engine/src/contexts/board/markov.test.ts`

**Interfaces:**
- Consumes: `BOARD_SIZE`, `DOUBLES_ROLL_MULTIPLIER`, `GO_TO_JAIL_SQUARE`, `GROUP_MEMBERS`, `JAIL_SQUARE`, `deedById` from `config/board.js`; `PLAYER_IDS` from `core/types.js`.
- Produces:
  - `function buildTransitionMatrix(): readonly (readonly number[])[]` (120 x 120)
  - `const LANDING_PROBABILITIES: readonly number[]` (length 40, sums to 1)
  - `function landingProbability(square: SquareIndex): number`
  - `function landingProbabilityOfDeed(deedId: DeedId): number`
  - `function expectedHitsPerRound(deedId: DeedId): number`
  - `function expectedHitsOverWindow(deedId: DeedId, rounds: number): number`
  - `function groupTraffic(group: ColorGroup): { readonly combined: number; readonly perSquare: number }`

- [ ] **Step 1: Write the failing test**

`packages/engine/src/contexts/board/markov.test.ts`:

```ts
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
      ['red', 8.02, 2.67],
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/markov.test.ts`
Expected: FAIL — none of the model exports resolve.

- [ ] **Step 3: Write the transition matrix in `contexts/board/markov.ts`**

```ts
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
```

- [ ] **Step 4: Add the stationary solve and the public reads**

Append to `packages/engine/src/contexts/board/markov.ts`:

```ts
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
```

- [ ] **Step 5: Re-export the model and run the test**

Add `export * from './markov.js'` to `packages/engine/src/contexts/board/index.ts`,
then run: `npx vitest run packages/engine/src/contexts/board/markov.test.ts`
Expected: PASS. A failure on the 1e-9 fixture comparison means the transition
matrix is wrong — check that jail arrival resets the doubles counter, that the
third double jails without moving, and that no card square relocates.

- [ ] **Step 6: Verify the model is computed once and costs nothing at runtime**

Run: `npx vitest run packages/engine/src/contexts/board/ --reporter=verbose`
Expected: PASS in well under a second. `LANDING_PROBABILITIES` is a module-level
constant, so the 120-state solve runs once per process and never during a game.

- [ ] **Step 7: Verify the toolchain and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add packages/engine/src/contexts/board/markov.ts packages/engine/src/contexts/board/markov.test.ts packages/engine/src/contexts/board/index.ts
git commit -m "feat(board): exact Markov landing model over 120 states

Asserted square by square against tests/fixtures/landing-probabilities.json
to within 1e-9. The fixture is authoritative and independently verified;
it assumes no card movement and mandatory pay-to-leave-jail, so published
Monopoly landing tables do not apply and are not used."
```

---

### Task 8: `draft` context — ranked-triple submission and collision resolution

Seven simultaneous rounds; every player ends with exactly seven deeds. Spec
section 3 defines six resolution rules and they are implemented literally.
The context splits into `selectors.ts`, `reduce.ts`, `decide.ts` and
`resolve.ts` (the collision algorithm) so no file approaches 500 lines; only
`index.ts` is importable from outside.

**Files:**
- Create: `packages/engine/src/contexts/draft/selectors.ts`
- Create: `packages/engine/src/contexts/draft/resolve.ts`
- Create: `packages/engine/src/contexts/draft/reduce.ts`
- Create: `packages/engine/src/contexts/draft/decide.ts`
- Create: `packages/engine/src/contexts/draft/index.ts`
- Modify: `packages/engine/src/core/reduce.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/draft/draft.test.ts`

**Interfaces:**
- Consumes: `DEED_IDS`, `DEEDS` from `config/board.js`; `GameState`, `DraftState`, `DraftSubmission` from `core/state.js`; `GameEvent` from `core/events.js`; `DeedId`, `Money`, `PlayerId`, `PLAYER_IDS` from `core/types.js`; `reject`, `Rejection` from `core/errors.js`.
- Produces:
  - `const DRAFT_ROUNDS: number` (28 deeds / 4 players = 7)
  - `function availableDeeds(state: GameState): readonly DeedId[]` (cheapest first, square index breaks ties)
  - `function cheapestAvailable(state: GameState): DeedId | null`
  - `function faceValueAcquired(state: GameState, player: PlayerId): Money`
  - `function deedCount(state: GameState, player: PlayerId): number`
  - `function hasSubmitted(state: GameState, player: PlayerId): boolean`
  - `function turnIndex(state: GameState, player: PlayerId): number`
  - `function resolveDraftRound(state: GameState): readonly GameEvent[]`
  - `function reduceDraft(state: GameState, event: GameEvent): GameState`
  - `type DraftCommand = { type: 'submit-draft'; player; ranked: readonly [DeedId, DeedId, DeedId]; maxBid: Money } | { type: 'resolve-draft-round' }`
  - `function decideDraft(state: GameState, command: DraftCommand): readonly GameEvent[] | Rejection`

- [ ] **Step 1: Write the failing test for submission validation and rules 1-2**

`packages/engine/src/contexts/draft/draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DRAFT_ROUNDS, availableDeeds, decideDraft, deedCount } from './index.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import { DEEDS, DEED_IDS } from '../../config/board.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function draftState(): GameState {
  const base = initialState(CONFIG)
  return { ...base, phase: 'draft', draft: { round: 1, submissions: [], complete: false } }
}

function face(deed: DeedId): Money {
  return DEEDS[deed]?.faceValue ?? 0
}

function submit(
  state: GameState,
  player: PlayerId,
  ranked: readonly [DeedId, DeedId, DeedId],
  maxBid: Money = face(ranked[0]),
): GameState {
  const result = decideDraft(state, { type: 'submit-draft', player, ranked, maxBid })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result.reduce(reduce, state)
}

function resolve(state: GameState): readonly GameEvent[] {
  const result = decideDraft(state, { type: 'resolve-draft-round' })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function awards(events: readonly GameEvent[]): Record<string, { deed: DeedId; price: Money }> {
  const out: Record<string, { deed: DeedId; price: Money }> = {}
  for (const event of events) {
    if (event.type === 'DraftDeedAwarded') out[event.player] = { deed: event.deed, price: event.price }
  }
  return out
}

describe('submission validation', () => {
  it('accepts a well-formed ranked triple', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    expect(state.draft?.submissions).toHaveLength(1)
  })

  it('rejects a bid below the first choice face value', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'], maxBid: 399,
    })
    expect(isRejection(result) && result.code).toBe('BID_BELOW_FACE')
  })

  it('rejects a bid above the remaining budget', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'],
      maxBid: ECONOMY.STARTING_CASH + 1,
    })
    expect(isRejection(result) && result.code).toBe('BID_EXCEEDS_BUDGET')
  })

  it('rejects a deed already allocated in an earlier round', () => {
    const base = draftState()
    const taken: GameState = {
      ...base,
      deeds: { ...base.deeds, boardwalk: { ...base.deeds.boardwalk, owner: 'P4' } },
    }
    const result = decideDraft(taken, {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'park-place', 'short-line'], maxBid: 400,
    })
    expect(isRejection(result) && result.code).toBe('DEED_UNAVAILABLE')
  })

  it('rejects a duplicated deed inside the triple', () => {
    const result = decideDraft(draftState(), {
      type: 'submit-draft', player: 'P1',
      ranked: ['boardwalk', 'boardwalk', 'short-line'], maxBid: 400,
    })
    expect(isRejection(result) && result.code).toBe('DEED_UNAVAILABLE')
  })

  it('rejects a second submission in the same round', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    const result = decideDraft(state, {
      type: 'submit-draft', player: 'P1',
      ranked: ['illinois-avenue', 'park-place', 'short-line'], maxBid: 240,
    })
    expect(isRejection(result) && result.code).toBe('ALREADY_SUBMITTED')
  })

  it('refuses to resolve before all four have submitted', () => {
    const state = submit(draftState(), 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    const result = decideDraft(state, { type: 'resolve-draft-round' })
    expect(isRejection(result)).toBe(true)
  })
})

describe('rules 1 and 2 — uncontested and contested first choices', () => {
  it('awards an uncontested first choice at face value', () => {
    let state = draftState()
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['reading-railroad', 'park-place', 'short-line'], 200)
    state = submit(state, 'P4', ['marvin-gardens', 'park-place', 'short-line'], 280)
    const result = awards(resolve(state))
    expect(result['P1']).toEqual({ deed: 'boardwalk', price: 400 })
    expect(result['P2']).toEqual({ deed: 'illinois-avenue', price: 240 })
    expect(result['P3']).toEqual({ deed: 'reading-railroad', price: 200 })
    expect(result['P4']).toEqual({ deed: 'marvin-gardens', price: 280 })
  })

  it('gives a contested deed to the highest bid, who pays their own bid', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'illinois-avenue', 'short-line'], 290)
    state = submit(state, 'P3', ['marvin-gardens', 'park-place', 'short-line'], 280)
    state = submit(state, 'P4', ['pacific-avenue', 'park-place', 'short-line'], 300)
    const events = resolve(state)
    expect(events).toContainEqual({
      type: 'DraftDeedAwarded', player: 'P1', deed: 'reading-railroad',
      price: 340, contested: true,
    })
    expect(awards(events)['P2']).toEqual({ deed: 'illinois-avenue', price: 240 })
  })

  it('breaks a bid tie on lower total face value acquired, then turn order', () => {
    const base = draftState()
    const seeded: GameState = {
      ...base,
      deeds: { ...base.deeds, boardwalk: { ...base.deeds.boardwalk, owner: 'P1' } },
    }
    let state = seeded
    state = submit(state, 'P1', ['reading-railroad', 'pacific-avenue', 'short-line'], 200)
    state = submit(state, 'P2', ['reading-railroad', 'marvin-gardens', 'short-line'], 200)
    state = submit(state, 'P3', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P4', ['virginia-avenue', 'park-place', 'short-line'], 160)
    // P1 already holds $400 of face value, so P2 takes the tie.
    expect(awards(resolve(state))['P2']?.deed).toBe('reading-railroad')

    let even = draftState()
    even = submit(even, 'P1', ['reading-railroad', 'pacific-avenue', 'short-line'], 200)
    even = submit(even, 'P2', ['reading-railroad', 'marvin-gardens', 'short-line'], 200)
    even = submit(even, 'P3', ['illinois-avenue', 'park-place', 'short-line'], 240)
    even = submit(even, 'P4', ['virginia-avenue', 'park-place', 'short-line'], 160)
    // Nothing acquired yet, so the earlier player in turn order wins.
    expect(awards(resolve(even))['P1']?.deed).toBe('reading-railroad')
  })
})

describe('rules 3, 4, 5 and 6 — cascades and the guarantees', () => {
  it('cascades a loser to their second choice at face value', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'park-place', 'short-line'], 290)
    state = submit(state, 'P3', ['illinois-avenue', 'marvin-gardens', 'short-line'], 240)
    state = submit(state, 'P4', ['pacific-avenue', 'marvin-gardens', 'short-line'], 300)
    expect(awards(resolve(state))['P2']).toEqual({ deed: 'park-place', price: 350 })
  })

  it('resolves two cascaders on one deed by lower total face acquired (rule 4)', () => {
    const base = draftState()
    const seeded: GameState = {
      ...base,
      deeds: {
        ...base.deeds,
        boardwalk: { ...base.deeds.boardwalk, owner: 'P2' },
        'baltic-avenue': { ...base.deeds['baltic-avenue'], owner: 'P3' },
      },
    }
    let state = seeded
    state = submit(state, 'P1', ['illinois-avenue', 'pacific-avenue', 'short-line'], 300)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['illinois-avenue', 'park-place', 'virginia-avenue'], 240)
    state = submit(state, 'P4', ['marvin-gardens', 'ventnor-avenue', 'states-avenue'], 280)
    const result = awards(resolve(state))
    expect(result['P1']).toEqual({ deed: 'illinois-avenue', price: 300 })
    // P2 holds $400 of face, P3 holds $60, so P3 takes Park Place.
    expect(result['P3']).toEqual({ deed: 'park-place', price: 350 })
    expect(result['P2']).toEqual({ deed: 'short-line', price: 200 })
  })

  it('falls back to the cheapest remaining deed when all three choices are gone (rule 5)', () => {
    let state = draftState()
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'illinois-avenue'], 500)
    state = submit(state, 'P2', ['park-place', 'boardwalk', 'illinois-avenue'], 400)
    state = submit(state, 'P3', ['illinois-avenue', 'boardwalk', 'park-place'], 300)
    state = submit(state, 'P4', ['boardwalk', 'park-place', 'illinois-avenue'], 450)
    const result = awards(resolve(state))
    const cheapest = availableDeeds(draftState())[0]
    expect(result['P2']?.deed).toBe('park-place')
    expect(result['P3']?.deed).toBe('illinois-avenue')
    expect(result['P4']).toEqual({ deed: cheapest, price: face(cheapest ?? '') })
  })

  it('grants the cheapest remaining deed free when the budget cannot cover it (rule 6)', () => {
    const base = draftState()
    const broke: GameState = {
      ...base,
      players: { ...base.players, P4: { ...base.players.P4, cleanCash: 10 } },
    }
    let state = broke
    state = submit(state, 'P1', ['boardwalk', 'park-place', 'short-line'], 400)
    state = submit(state, 'P2', ['illinois-avenue', 'park-place', 'short-line'], 240)
    state = submit(state, 'P3', ['reading-railroad', 'park-place', 'short-line'], 200)
    const events = resolve(state)
    const award = awards(events)['P4']
    expect(award?.price).toBe(0)
    expect(face(award?.deed ?? '')).toBe(60)
    const after = events.reduce(reduce, state)
    expect(after.players.P4.cleanCash).toBe(10)
    expect(deedCount(after, 'P4')).toBe(1)
  })
})

describe('the whole draft', () => {
  it('allocates all 28 deeds, seven each, over exactly seven rounds', () => {
    expect(DRAFT_ROUNDS).toBe(7)
    let state = draftState()
    for (let round = 1; round <= DRAFT_ROUNDS; round += 1) {
      const open = availableDeeds(state)
      for (const player of CONFIG.turnOrder) {
        const ranked = [open[0], open[1], open[2]] as [DeedId, DeedId, DeedId]
        state = submit(state, player, ranked)
      }
      state = resolve(state).reduce(reduce, state)
      expect(state.draft?.round, `after round ${round}`).toBe(round + 1)
    }
    expect(state.draft?.complete).toBe(true)
    // One unified pot: cash spent on deeds is exactly cash no longer available.
    for (const player of CONFIG.turnOrder) {
      expect(deedCount(state, player), player).toBe(7)
      const acquired = Object.values(state.deeds)
        .filter((d) => d.owner === player)
        .reduce((total, d) => total + d.faceValue, 0)
      expect(state.players[player].cleanCash, player)
        .toBe(ECONOMY.STARTING_CASH - acquired)
      expect(state.players[player].drawnCredit, player).toBe(0)
    }
    expect(Object.values(state.deeds).every((d) => d.owner !== null)).toBe(true)
    expect(DEED_IDS).toHaveLength(28)
    const spent = CONFIG.turnOrder.reduce(
      (total, p) => total + (ECONOMY.STARTING_CASH - state.players[p].cleanCash), 0)
    expect(state.treasury).toBe(spent)
  })

  it('is deterministic: resolving the same state twice yields the same events', () => {
    let state = draftState()
    state = submit(state, 'P1', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P2', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P3', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    state = submit(state, 'P4', ['reading-railroad', 'boardwalk', 'short-line'], 340)
    expect(resolve(state)).toEqual(resolve(state))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/draft/draft.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write `contexts/draft/selectors.ts`**

```ts
import { DEEDS, DEED_IDS } from '../../config/board.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

/** 28 deeds / 4 players. Every player ends with exactly seven. Spec section 3. */
export const DRAFT_ROUNDS = DEED_IDS.length / PLAYER_IDS.length

/** Unallocated deeds, cheapest first; square index breaks face-value ties. */
export function availableDeeds(state: GameState): readonly DeedId[] {
  return Object.values(state.deeds)
    .filter((deed) => deed.owner === null)
    .sort((a, b) => a.faceValue - b.faceValue || a.square - b.square)
    .map((deed) => deed.id)
}

export function cheapestAvailable(state: GameState): DeedId | null {
  return availableDeeds(state)[0] ?? null
}

export function faceValueOf(deedId: DeedId): Money {
  return DEEDS[deedId]?.faceValue ?? 0
}

export function faceValueAcquired(state: GameState, player: PlayerId): Money {
  return Object.values(state.deeds)
    .filter((deed) => deed.owner === player)
    .reduce((total, deed) => total + deed.faceValue, 0)
}

export function deedCount(state: GameState, player: PlayerId): number {
  return Object.values(state.deeds).filter((deed) => deed.owner === player).length
}

export function hasSubmitted(state: GameState, player: PlayerId): boolean {
  return state.draft?.submissions.some((s) => s.player === player) ?? false
}

export function turnIndex(state: GameState, player: PlayerId): number {
  return state.config.turnOrder.indexOf(player)
}
```

- [ ] **Step 4: Write the collision algorithm in `contexts/draft/resolve.ts`**

```ts
import type { DraftSubmission, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import {
  availableDeeds, faceValueAcquired, faceValueOf, turnIndex,
} from './selectors.js'

interface Allocation {
  readonly player: PlayerId
  readonly deed: DeedId
  readonly price: Money
  readonly contested: boolean
}

/**
 * Spec section 3. Rules are applied in this order:
 *   6. A player who cannot afford the cheapest remaining deed gets it free.
 *   1. A deed nominated first by exactly one player goes to them at face value.
 *   2. A contested deed goes to the highest bid, who pays their own bid.
 *   3. Losers cascade to their second then third choice at face value.
 *   4. Cascade collisions resolve to the lower total face value acquired.
 *   5. A player whose three choices are all gone takes the cheapest remaining.
 *
 * "Total face value acquired so far" is snapshotted before any of this round's
 * allocations, so resolution does not depend on the order deeds are awarded.
 */
export function resolveDraftRound(state: GameState): readonly GameEvent[] {
  const draft = state.draft
  if (draft === null) return []

  const order = state.config.turnOrder
  const acquired = new Map<PlayerId, Money>(
    order.map((p) => [p, faceValueAcquired(state, p)]),
  )
  const submissions = new Map<PlayerId, DraftSubmission>(
    draft.submissions.map((s) => [s.player, s]),
  )
  const available = new Set<DeedId>(availableDeeds(state))
  const allocations: Allocation[] = []

  const face = (p: PlayerId): Money => acquired.get(p) ?? 0
  const seat = (p: PlayerId): number => turnIndex(state, p)
  const award = (player: PlayerId, deed: DeedId, price: Money, contested: boolean): void => {
    allocations.push({ player, deed, price, contested })
    available.delete(deed)
  }
  const squareOf = (deed: DeedId): number => state.deeds[deed]?.square ?? 0
  const cheapest = (): DeedId | null =>
    [...available].sort((a, b) =>
      faceValueOf(a) - faceValueOf(b) || squareOf(a) - squareOf(b))[0] ?? null

  // --- Rule 6, first, so "cheapest remaining" is unambiguous. ---
  const contenders: PlayerId[] = []
  for (const player of order) {
    const floor = cheapest()
    if (floor === null) continue
    if (state.players[player].cleanCash < faceValueOf(floor)) {
      award(player, floor, 0, false)
      continue
    }
    contenders.push(player)
  }

  // --- Rules 1 and 2: first-choice contests. ---
  const rank = new Map<PlayerId, number>(contenders.map((p) => [p, 0]))
  const firstChoices = new Map<DeedId, PlayerId[]>()
  const cascading: PlayerId[] = []
  for (const player of contenders) {
    const submission = submissions.get(player)
    if (submission === undefined) {
      rank.set(player, 3)
      cascading.push(player)
      continue
    }
    const target = submission.ranked[0]
    if (!available.has(target)) {
      rank.set(player, 1)
      cascading.push(player)
      continue
    }
    firstChoices.set(target, [...(firstChoices.get(target) ?? []), player])
  }
  for (const [deed, group] of firstChoices) {
    const winner = [...group].sort((a, b) =>
      bidOf(submissions, b) - bidOf(submissions, a)
      || face(a) - face(b)
      || seat(a) - seat(b))[0]
    if (winner === undefined) continue
    const contested = group.length > 1
    award(winner, deed, contested ? bidOf(submissions, winner) : faceValueOf(deed), contested)
    for (const loser of group) {
      if (loser === winner) continue
      rank.set(loser, 1)
      cascading.push(loser)
    }
  }

  // --- Rules 3 and 4: cascade to the second then third choice. ---
  const exhausted: PlayerId[] = []
  let queue = order.filter((p) => cascading.includes(p))
  while (queue.length > 0) {
    const targets = new Map<DeedId, PlayerId[]>()
    for (const player of queue) {
      const submission = submissions.get(player)
      let index = rank.get(player) ?? 3
      while (submission !== undefined && index < 3
        && !available.has(submission.ranked[index] ?? '')) {
        index += 1
      }
      rank.set(player, index)
      const target = submission?.ranked[index]
      if (submission === undefined || index >= 3 || target === undefined) {
        exhausted.push(player)
        continue
      }
      targets.set(target, [...(targets.get(target) ?? []), player])
    }
    const next: PlayerId[] = []
    for (const [deed, group] of targets) {
      const winner = [...group].sort((a, b) => face(a) - face(b) || seat(a) - seat(b))[0]
      if (winner === undefined) continue
      award(winner, deed, faceValueOf(deed), false)
      for (const loser of group) {
        if (loser === winner) continue
        rank.set(loser, (rank.get(loser) ?? 0) + 1)
        next.push(loser)
      }
    }
    queue = order.filter((p) => next.includes(p))
  }

  // --- Rule 5, with rule 6 re-applied to whatever is actually left. ---
  const stragglers = [...exhausted].sort((a, b) => face(a) - face(b) || seat(a) - seat(b))
  for (const player of stragglers) {
    const deed = cheapest()
    if (deed === null) break
    const price = state.players[player].cleanCash >= faceValueOf(deed)
      ? faceValueOf(deed)
      : 0
    award(player, deed, price, false)
  }

  const events: GameEvent[] = allocations
    .sort((a, b) => seat(a.player) - seat(b.player))
    .map((a) => ({
      type: 'DraftDeedAwarded',
      player: a.player,
      deed: a.deed,
      price: a.price,
      contested: a.contested,
    }))
  events.push({ type: 'DraftRoundResolved', round: draft.round })
  return events
}

function bidOf(
  submissions: ReadonlyMap<PlayerId, DraftSubmission>,
  player: PlayerId,
): Money {
  return submissions.get(player)?.maxBid ?? 0
}
```

- [ ] **Step 5: Write `contexts/draft/reduce.ts`**

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import { DRAFT_ROUNDS } from './selectors.js'

export function reduceDraft(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PhaseAdvanced':
      if (event.phase !== 'draft') return state
      return { ...state, draft: { round: 1, submissions: [], complete: false } }

    case 'DraftSubmitted': {
      if (state.draft === null) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          submissions: [...state.draft.submissions, {
            player: event.player,
            ranked: [
              event.ranked[0] ?? '', event.ranked[1] ?? '', event.ranked[2] ?? '',
            ],
            maxBid: event.maxBid,
          }],
        },
      }
    }

    case 'DraftDeedAwarded': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      const player = state.players[event.player]
      return {
        ...state,
        deeds: { ...state.deeds, [event.deed]: { ...deed, owner: event.player } },
        players: {
          ...state.players,
          // Spec section 4: one unified pot. The draft spends operating cash.
          [event.player]: { ...player, cleanCash: player.cleanCash - event.price },
        },
        treasury: state.treasury + event.price,
      }
    }

    case 'DraftRoundResolved': {
      if (state.draft === null) return state
      const round = state.draft.round + 1
      return {
        ...state,
        draft: { round, submissions: [], complete: round > DRAFT_ROUNDS },
      }
    }

    default:
      return state
  }
}
```

- [ ] **Step 6: Write `contexts/draft/decide.ts`**

```ts
import { reject, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { resolveDraftRound } from './resolve.js'
import {
  cheapestAvailable, faceValueOf, hasSubmitted,
} from './selectors.js'

export type DraftCommand =
  | {
      readonly type: 'submit-draft'
      readonly player: PlayerId
      readonly ranked: readonly [DeedId, DeedId, DeedId]
      readonly maxBid: Money
    }
  | { readonly type: 'resolve-draft-round' }

export function decideDraft(
  state: GameState,
  command: DraftCommand,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'draft' || state.draft === null || state.draft.complete) {
    return reject('WRONG_PHASE', 'The draft is not open.')
  }

  if (command.kind === 'submit-draft') {
    const { player, ranked, maxBid } = command
    if (hasSubmitted(state, player)) {
      return reject('ALREADY_SUBMITTED', 'You have already submitted this draft round.')
    }
    if (new Set(ranked).size !== 3) {
      return reject('DEED_UNAVAILABLE', 'Your three choices must be three different deeds.')
    }
    for (const deed of ranked) {
      const held = state.deeds[deed]
      if (held === undefined) {
        return reject('DEED_UNAVAILABLE', `There is no deed called ${deed}.`)
      }
      if (held.owner !== null) {
        return reject('DEED_UNAVAILABLE', `${deed} was allocated in an earlier round.`)
      }
    }
    const first = ranked[0]
    if (maxBid < faceValueOf(first)) {
      return reject('BID_BELOW_FACE', `Your bid must be at least the $${faceValueOf(first)} face value.`)
    }
    if (maxBid > state.players[player].cleanCash) {
      return reject('BID_EXCEEDS_BUDGET', 'Your bid is more than your remaining budget.')
    }
    return [{ type: 'DraftSubmitted', player, ranked, maxBid }]
  }

  const floor = cheapestAvailable(state)
  for (const player of state.config.turnOrder) {
    if (hasSubmitted(state, player)) continue
    // Rule 6 players never submit; everyone else must.
    if (floor !== null && state.players[player].cleanCash < faceValueOf(floor)) continue
    return reject('ALREADY_SUBMITTED', `${player} has not submitted this draft round yet.`)
  }
  return resolveDraftRound(state)
}
```

- [ ] **Step 7: Write `contexts/draft/index.ts` and wire the root reducer**

`packages/engine/src/contexts/draft/index.ts`:

```ts
export * from './selectors.js'
export { resolveDraftRound } from './resolve.js'
export { reduceDraft } from './reduce.js'
export { decideDraft, type DraftCommand } from './decide.js'
```

In `packages/engine/src/core/reduce.ts`:

```ts
import { reduceBoard } from '../contexts/board/index.js'
import { reduceDraft } from '../contexts/draft/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceDraft(reduceBoard(reduceSession(state, event), event), event)
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/draft/draft.test.ts`
Expected: PASS. `DraftRoundResolved` must be added to `GameEvent` — see
**NEW EVENTS REQUIRED**. The seven-round test is the one that matters: 28 deeds
allocated, exactly seven per player, no deed left unowned, and the Treasury
holding exactly what the four players spent.

- [ ] **Step 9: Verify the toolchain and commit**

Add `export * from './contexts/draft/index.js'` to `packages/engine/src/index.ts`,
then run `npm run typecheck && npm run lint && npm test`.

```bash
git add packages/engine/src/contexts/draft packages/engine/src/core/reduce.ts packages/engine/src/index.ts
git commit -m "feat(draft): ranked-triple submission and collision resolution

Implements all six rules from spec section 3. Contests are first-price;
ties and cascade collisions break on the lower total face value acquired,
snapshotted before the round so resolution is order-independent. A player
who cannot afford the cheapest remaining deed receives it free, which is
what guarantees every player exactly seven deeds."
```

---

## NEW EVENTS REQUIRED

Two events beyond the Task 2 schema.

**1. `ObligationCapitalised`** — step 2 of the universal obligation waterfall.
Merge into `core/events.ts` under the `--- credit ---` group:

```ts
export type ObligationKind =
  | 'rent' | 'tax' | 'jail-fee' | 'interest' | 'carrying-cost'
  | 'audit-fine' | 'cds-premium' | 'peer-loan-interest'
```

```ts
  | { type: 'ObligationCapitalised'; player: PlayerId; amount: Money
      obligation: ObligationKind }
```

It records a shortfall capitalising into the drawn balance without a
borrowing-base check. A distinct event rather than a reuse of `CreditDrawn`
because the capped/uncapped asymmetry between voluntary draws and automatic
obligations is the only mechanism that generates a margin call — a facilitator
reading the log has to be able to see which kind of borrowing just happened.
The `obligation` discriminator is a closed union covering every obligation the
waterfall touches; Tasks 9-17 emit the remaining members. Carries no randomness,
so `STOCHASTIC_EVENTS` is unchanged.

**2. `DraftRoundResolved`** — merge under the `--- draft ---` group:

```ts
  | { type: 'DraftRoundResolved'; round: RoundNumber }
```

It marks the boundary between draft rounds. Without it the reducer has to infer
"four awards have landed, so start the next round", which breaks the moment a
round awards fewer than four deeds — and it makes the log unreadable at exactly
the point a facilitator most wants to read it.

**One event should be removed** (adopted by the coordinator).
`DraftRoundSkipped { player, compensation }` and
`ECONOMY.DRAFT_SKIP_COMPENSATION` ($150) are dead. Spec section 3 rule 6 grants
the cheapest remaining deed at no cost rather than paying compensation, and
section 3 explains why in terms the design depends on: the flat per-deed carrying
cost is incidence-neutral only because every player holds exactly seven deeds.
Task 8 emits `DraftDeedAwarded` with `price: 0` instead.

**`DistressedDebtIncurred` stays in the schema but is no longer emitted here.**
Under the rewritten spec section 19.8, distressed debt arises in exactly one
circumstance: a margin call went uncured, forced liquidation ran, and it stopped
because the player had no unmortgaged deeds left. That is Task 10's territory.
No path in Tasks 3-8 routes an ordinary unpayable obligation to distressed debt.

## CONTRACT ADDITIONS REQUIRED

All three are already adopted into Task 2; restated here so Tasks 3-8 are
readable standalone.

1. **`PlayerState.consecutiveDoubles: number`** in `core/state.ts`:

```ts
  /** 0-2. Rolling a third consecutive double sends the player to Jail. */
  readonly consecutiveDoubles: number
```

The three-consecutive-doubles rule cannot be implemented without it. The reducer
has no access to the event log, so the count has to be state. `initialState`
seeds it at 0; `DiceRolled` increments or resets it; `SentToJail` clears it.

2. **`'INVALID_DICE'`** added to `RejectionCode` in `core/errors.ts`. Dice arrive
from the facilitator's keyboard, which is a system boundary, and no existing code
describes "that is not a die".

3. **`PlayerState.draftBudget` deleted.** Spec section 4 gives one unified pot,
so the field was `cleanCash` viewed twice. Every draft read and write in Task 8
now uses `cleanCash`, and the seven-round test asserts each player's ending cash
equals `STARTING_CASH` minus the face value they acquired.

**Also new in `config/economy.ts`** (Task 3, step 1): `HOUSE_COST_MULTIPLIER: 0.9`
and `BUILDING_SELLBACK_RATE: 0.5`.

## JUDGMENT CALLS

Where the spec left a gap, this is what was chosen and why. Rows marked
**[revised]** were changed after the spec was rewritten mid-task.

| # | Question | Choice |
|---|---|---|
| 1 | Does full-group rent doubling need the whole set undeveloped, or just the landed square? | **[revised] Per-square** — the standard Monopoly rule. Owning every deed in a group doubles rent on each *individually* undeveloped deed; houses on one sibling do not stop the others doubling. |
| 2 | Does a mortgaged member of a group cancel the doubling? | **Yes**, now explicit in the spec. A mortgaged deed contributes nothing, and building already requires the full *unmortgaged* group. |
| 3 | Do mortgaged railroads and utilities count toward the owned-count? | **No.** Same reasoning; also now explicit in the spec. |
| 4 | Rent on a deed the bank took in a liquidation? | **Zero.** Spec section 5 says the deed "becomes unowned-by-bank and is not re-drafted" — it is out of play. |
| 5 | Who funds an unpayable rent bill? | **[revised] The bank, via the payer's drawn credit.** The payee is paid in full; the shortfall capitalises into the payer's drawn balance. The Treasury funds nothing and no distressed debt is booked. |
| 6 | Does an automatic obligation respect the borrowing base? | **[revised] No — uncapped.** Voluntary draws stay capped at the base; automatic obligations capitalise without a check. That gap is the only thing in the game that generates a margin call, so it is encoded explicitly and tested directly (a player with no deeds, and therefore no base, still capitalises a $200 tax). |
| 7 | Does "total face value acquired so far" include this draft round's awards? | **No, snapshotted at round start.** Otherwise resolution depends on the order deeds happen to be awarded, and the same submissions could produce different outcomes. |
| 8 | When does rule 6 (free cheapest deed) get evaluated? | **Before contests, in turn order.** "Cheapest remaining" is only well defined at a fixed point in the resolution, and a player who cannot afford anything cannot submit a valid triple anyway. It is re-checked at rule 5 for anyone who cascades all the way out. |
| 9 | Two players both hit rule 5 in the same round — who picks first? | **Lower total face value acquired, then turn order** — the same tie-break as rule 4, applied for consistency rather than inventing a third. |
| 10 | Does a player leaving Jail on doubles get the extra roll? | **Yes.** The Markov model transitions out of state `(10, 0)` with the ordinary doubles rule, so the engine must match or the fixture assertion is a lie. |
| 11 | Who advances the active player during Movement? | **Nobody — the facilitator.** Spec section 2: phases advance manually, with no enforced timer. `activePlayer` simply tracks whoever last rolled, set on `DiceRolled`. This avoids inventing a `TurnAdvanced` event. |
| 12 | Where do railroad rents, utility multipliers and the 1.19 doubles factor live? | **`config/board.ts`.** The main plan assigns "rent tables" to that file, and these are rent tables. `config/economy.ts` keeps the tunable economic constants; the physical board is not tunable. `HOUSE_COST_MULTIPLIER` is a tunable, so it lives in `economy.ts` and is applied in `board.ts`. |
| 13 | Which context reduces `ObligationCapitalised`? | **`credit`.** It writes `drawnCredit`, which is credit's state slice, so `board` must not touch it. Task 5 therefore creates a two-file `contexts/credit/` holding only that reducer, and Task 9 extends the same file. |
| 14 | The fixture spells colour groups `"light blue"`; `ColorGroup` is `'light-blue'`. | **Normalise in the test.** The fixture is a derivation artefact and authoritative on probabilities, not on our type spellings. |
