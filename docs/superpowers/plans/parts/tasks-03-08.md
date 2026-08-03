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

### Task 5: `board` context — movement, doubles, jail, GO salary and taxes

**Files:**
- Create: `packages/engine/src/contexts/board/selectors.ts`
- Create: `packages/engine/src/contexts/board/reduce.ts`
- Create: `packages/engine/src/contexts/board/decide.ts`
- Create: `packages/engine/src/contexts/board/index.ts`
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
  - `type BoardCommand = { readonly kind: 'roll-dice'; readonly player: PlayerId; readonly dice: DiceRoll }`
  - `function decideBoard(state: GameState, command: BoardCommand): readonly GameEvent[] | Rejection`

**Money handling contract, used by every payment in Tasks 5 and 6.** An event
carries the *full* obligation. The reducer pays what the payer's clean cash
covers; a player-to-player payment is topped up by the Treasury so the payee is
always made whole, and a Treasury-bound payment simply books the shortfall as a
receivable. `decide` emits `DistressedDebtIncurred` for the same shortfall, and
Task 10 owns that reducer. Spec section 19.8: an unpayable tax, jail fee or rent
bill becomes distressed debt immediately — there is no auto-draw on the credit
line and no liquidation.

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
  const result = decideBoard(state, { kind: 'roll-dice', player, dice })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, state)
}

function totalMoney(state: GameState): number {
  return Object.values(state.players).reduce((t, p) => t + p.cleanCash, 0) + state.treasury
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

  it('books an unpayable tax as distressed debt rather than negative cash', () => {
    const before = movementState({ position: 0, cleanCash: 30 })
    const events = roll(before, [1, 3])
    expect(events).toContainEqual({
      type: 'TaxPaid', player: 'P1', amount: 200, kind: 'income',
    })
    expect(events).toContainEqual({
      type: 'DistressedDebtIncurred', player: 'P1', amount: 170,
    })
    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.treasury).toBe(30)
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
    const result = decideBoard(state, { kind: 'roll-dice', player: 'P1', dice: [1, 1] })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses dice outside 1-6', () => {
    const result = decideBoard(movementState(), {
      kind: 'roll-dice', player: 'P1', dice: [0, 7],
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

/** Player pays the Treasury. Any shortfall stays unpaid as a receivable. */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const paid = Math.min(state.players[id].cleanCash, amount)
  return {
    ...withPlayer(state, id, { cleanCash: state.players[id].cleanCash - paid }),
    treasury: state.treasury + paid,
  }
}

function payFromTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  return {
    ...withPlayer(state, id, { cleanCash: state.players[id].cleanCash + amount }),
    treasury: state.treasury - amount,
  }
}

/**
 * Player-to-player transfer. The payee is always made whole; the Treasury funds
 * whatever the payer could not, against the distressed debt booked separately.
 */
export function transfer(
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  amount: Money,
): GameState {
  const cash = state.players[from].cleanCash
  const unpaid = shortfall(cash, amount)
  const paid = amount - unpaid
  const afterPayer = withPlayer(state, from, { cleanCash: cash - paid })
  const afterPayee = withPlayer(afterPayer, to, {
    cleanCash: afterPayer.players[to].cleanCash + amount,
  })
  return { ...afterPayee, treasury: afterPayee.treasury - unpaid }
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
  readonly kind: 'roll-dice'
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
    pushShortfall(events, player, ledger.charge(ECONOMY.JAIL_FEE))
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

function pushShortfall(events: GameEvent[], player: PlayerId, unpaid: Money): void {
  if (unpaid > 0) {
    events.push({ type: 'DistressedDebtIncurred', player, amount: unpaid })
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
    pushShortfall(events, player, ledger.charge(ECONOMY.INCOME_TAX))
    return events
  }
  if (square === LUXURY_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.LUXURY_TAX, kind: 'luxury' })
    pushShortfall(events, player, ledger.charge(ECONOMY.LUXURY_TAX))
    return events
  }
  return events
}
```

- [ ] **Step 6: Write `contexts/board/index.ts` and wire the root reducer**

`packages/engine/src/contexts/board/index.ts`:

```ts
export * from './selectors.js'
export { reduceBoard, transfer } from './reduce.js'
export { decideBoard, type BoardCommand } from './decide.js'
```

In `packages/engine/src/core/reduce.ts`, add the board reducer to the chain:

```ts
import { reduceBoard } from '../contexts/board/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceBoard(reduceSession(state, event), event)
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/board.test.ts`
Expected: PASS. `INVALID_DICE` must be added to `RejectionCode` — see
**CONTRACT ADDITIONS REQUIRED**.

- [ ] **Step 8: Export the board context and commit**

Add `export * from './contexts/board/index.js'` to `packages/engine/src/index.ts`,
then run `npm run typecheck && npm run lint && npm test`.

```bash
git add packages/engine/src/contexts/board packages/engine/src/core/reduce.ts packages/engine/src/index.ts
git commit -m "feat(board): movement, doubles, jail, GO salary and fixed taxes

Three consecutive doubles jails without moving. Leaving jail costs a
mandatory \$50, matching the convention the landing-probability model
assumes. Unpayable taxes and fees become distressed debt immediately
per spec 19.8; clean cash never goes negative."
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
  - `function ownsUndevelopedGroup(state: GameState, group: ColorGroup, owner: PlayerId): boolean`
  - `function countOwnedInGroup(state: GameState, group: ColorGroup, owner: PlayerId): number`
  - `decideBoard` now emits `RentCharged`, `RentRoutedToFuture` and a rent `DistressedDebtIncurred`.

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

  it('doubles base rent when the owner holds the whole undeveloped group', () => {
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

  it('stops doubling as soon as any deed in the group is developed', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2', houses: 1 },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(50)
    expect(rentDue(state, 'park-place', ROLL)).toBe(175)
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
    const result = decideBoard(seeded, { kind: 'roll-dice', player, dice })
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

  it('makes the payee whole and books the payer shortfall as distressed debt', () => {
    const base = board([{ deed: 'boardwalk', owner: 'P2' }])
    const state: GameState = {
      ...base,
      players: { ...base.players, P1: { ...base.players.P1, cleanCash: 10 } },
    }
    const { seeded, events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'DistressedDebtIncurred', player: 'P1', amount: 40,
    })
    const after = events.reduce(reduce, seeded)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
    expect(after.treasury).toBe(-40)
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
 * Spec section 2: base rent doubles on a full colour group with nothing built.
 * Any mortgaged or developed member of the group cancels the doubling.
 */
export function ownsUndevelopedGroup(
  state: GameState,
  group: ColorGroup,
  owner: PlayerId,
): boolean {
  return GROUP_MEMBERS[group].every((id) => {
    const deed = state.deeds[id]
    return deed !== undefined
      && deed.owner === owner
      && !deed.mortgaged
      && deed.houses === 0
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
  if (deed.houses > 0) {
    return deed.rentTable[deed.houses] ?? 0
  }
  const base = deed.rentTable[0] ?? 0
  return ownsUndevelopedGroup(state, deed.group, owner) ? base * 2 : base
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
    pushShortfall(events, player, ledger.charge(ECONOMY.INCOME_TAX))
    return events
  }
  if (square === LUXURY_TAX_SQUARE) {
    events.push({ type: 'TaxPaid', player, amount: ECONOMY.LUXURY_TAX, kind: 'luxury' })
    pushShortfall(events, player, ledger.charge(ECONOMY.LUXURY_TAX))
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
  pushShortfall(events, player, ledger.charge(amount))
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

Full-group doubling requires every member owned, unmortgaged and
undeveloped. Railroads pay 25/50/100/200 by unmortgaged count; utilities
pay 4x or 10x the dice total. Rent routes to an active futures holder
per spec 19.2, and nobody pays themselves."
```

---
