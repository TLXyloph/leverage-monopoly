## Tasks 3-8

---

### Task 3: `config/board.ts` — the 40 squares and the 28 deeds

Board data — square layout, deed face values, rent tables, house costs, colour
groups — lives here. `config/economy.ts` owns tunable economic constants; this
file owns the physical board, which is not tunable. Nothing else in the codebase
may hard-code a square index, a face value or a rent figure.

**Files:**
- Create: `packages/engine/src/config/board.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/config/board.test.ts`

**Interfaces:**
- Consumes: `ColorGroup`, `DeedId`, `Money`, `SquareIndex` from `core/types.js`; `DeedState` from `core/state.js`.
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

- [ ] **Step 1: Write the failing test**

`packages/engine/src/config/board.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BOARD_SIZE, CARD_SQUARES, DEEDS, DEED_IDS, DEED_LIST, DOUBLES_ROLL_MULTIPLIER,
  GO_SQUARE, GO_TO_JAIL_SQUARE, GROUP_MEMBERS, INCOME_TAX_SQUARE, JAIL_SQUARE,
  LUXURY_TAX_SQUARE, RAILROAD_RENT, SQUARES, UTILITY_MULTIPLIER,
  deedAt, deedById, totalFaceValue,
} from './board.js'
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
    expect(FREE_PARKING_SQUARE_INDEX()).toBe(20)
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

function FREE_PARKING_SQUARE_INDEX(): number {
  return SQUARES.findIndex((s) => s.kind === 'free-parking')
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/config/board.test.ts`
Expected: FAIL — `Cannot find module './board.js'`.

- [ ] **Step 3: Write the type surface and the deed table**

`packages/engine/src/config/board.ts`, first half:

```ts
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

function deed(
  id: DeedId,
  name: string,
  square: SquareIndex,
  group: ColorGroup,
  faceValue: Money,
  houseCost: Money,
  rentTable: readonly Money[],
): DeedDefinition {
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

- [ ] **Step 4: Write the square layout and the lookup tables**

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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/config/board.test.ts`
Expected: PASS, 9 assertions green. The `$5,690` total and the fixture
name/group cross-check are the two that matter; if either fails, the deed table
is wrong, not the test.

- [ ] **Step 6: Export the board from the package surface**

Add to `packages/engine/src/index.ts`, after the existing exports:

```ts
export * from './config/board.js'
```

- [ ] **Step 7: Verify the toolchain is clean**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/config/board.ts packages/engine/src/config/board.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add the 40-square board and 28 deed definitions

Face values sum to exactly \$5,690, asserted directly. Square names and
colour groups are cross-checked against tests/fixtures/landing-probabilities.json
so the board and the Markov model cannot drift apart."
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
  - `type SessionCommand = { readonly kind: 'advance-phase' }`
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
  const result = decideSession(state, { kind: 'advance-phase' })
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
    const result = decideSession(state, { kind: 'advance-phase' })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses to advance past complete', () => {
    const state: GameState = {
      ...replay([{ type: 'GameCreated', config: CONFIG }]),
      phase: 'complete',
    }
    expect(isRejection(decideSession(state, { kind: 'advance-phase' }))).toBe(true)
  })
})

describe('game creation', () => {
  it('seats four players with the starting budget and 28 unowned deeds', () => {
    const state = replay(createGame(CONFIG))
    expect(Object.keys(state.players)).toHaveLength(4)
    for (const id of CONFIG.turnOrder) {
      const player = state.players[id]
      expect(player.cleanCash).toBe(ECONOMY.STARTING_CASH)
      expect(player.draftBudget).toBe(ECONOMY.STARTING_CASH)
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
    draftBudget: ECONOMY.STARTING_CASH,
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

export type SessionCommand = { readonly kind: 'advance-phase' }

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
Expected: PASS. If `consecutiveDoubles` is flagged as an unknown property on
`PlayerState`, add it to `core/state.ts` — see **CONTRACT ADDITIONS REQUIRED**
at the end of this document.

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
