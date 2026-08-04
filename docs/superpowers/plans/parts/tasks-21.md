## Task 21

Fills the largest gap in the plan set, recorded as contradiction #1 in
`parts/tasks-18-20.md`: `HouseBuilt`, `HouseSold`, `DeedMortgaged`, `DeedUnmortgaged`
and `DeedTraded` are declared in Task 2's event union, referenced by spec 19.6, by
Task 5's borrowing base, by Task 10's forced liquidation and by Task 20's supply
invariant — and **no task writes a decider or a reducer for any of them**. Building,
mortgaging and trading are the three Era I instruments listed in spec section 2, and
until this task lands the engine cannot develop a property at all.

This task codes against the contract fixed by Tasks 1–2. No type declared there is
redefined here.

---

### Task 21: `board` context — property actions

**Files:**
- Modify: `packages/engine/src/core/errors.ts`
- Create: `packages/engine/tests/fixtures/property-state.ts`
- Create: `packages/engine/src/contexts/board/property.ts`
- Create: `packages/engine/src/contexts/board/reduce-property.ts`
- Create: `packages/engine/src/contexts/board/decide-property.ts`
- Modify: `packages/engine/src/contexts/board/index.ts`
- Modify: `packages/engine/src/core/reduce.ts`
- Modify: `packages/engine/src/core/decide.ts`
- Modify: `packages/engine/tests/property/ledger.ts`
- Test: `packages/engine/src/contexts/board/building.test.ts`
- Test: `packages/engine/src/contexts/board/mortgage.test.ts`
- Test: `packages/engine/src/contexts/board/trade.test.ts`

**How the context is split.** `board` already holds `selectors.ts`, `reduce.ts`,
`decide.ts`, `rent.ts`, `markov.ts` and `index.ts` from Tasks 5–7. Property actions are
a fourth concern and get their own three files rather than growing the movement files
past the 500-line limit. `markov.ts` is already the largest file in the context; adding
five deciders to `decide.ts` would take it past 400 and leave no room for Task 18's card
effects, which also reach into movement.

| File | Responsibility | Projected lines |
|---|---|---|
| `property.ts` | pure reads: group ownership, even-build, supply deltas, prices | ~120 |
| `reduce-property.ts` | `(state, event) => state` for the five property events | ~120 |
| `decide-property.ts` | the five commands, the ports interface, voluntary funding | ~250 |
| `building.test.ts` | build, sell back, even-build, supply | ~230 |
| `mortgage.test.ts` | mortgage, unmortgage, make-whole, downstream effects | ~210 |
| `trade.test.ts` | two-sided trades, locks, confirmation, encumbrance | ~190 |
| `tests/fixtures/property-state.ts` | shared `GameState` builder for all three | ~110 |

**Interfaces:**

- Consumes, from `packages/engine/src/core/` and `config/` (Tasks 1–3), unchanged:

```ts
import type { ColorGroup, DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { isRejection, reject, type Rejection } from '../../core/errors.js'
import { floorPercent } from '../../core/money.js'
import { ECONOMY } from '../../config/economy.js'
import { GROUP_MEMBERS } from '../../config/board.js'
```

- Consumes, from `packages/engine/src/contexts/board/rent.js` (Task 6, same context):

```ts
/** True when `owner` holds every deed in `group`, all unmortgaged. Task 6. */
export function ownsWholeGroup(
  state: GameState, group: ColorGroup, owner: PlayerId,
): boolean

/** Rent chargeable at present development. Used only by this task's tests. Task 6. */
export function rentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money
```

- Consumes, from `packages/engine/src/contexts/credit/index.js` — **assumed signature,
  to be reconciled at merge with Tasks 9–10.** This is the only credit symbol
  `decide-property.ts` touches:

```ts
/**
 * borrowingBase(state, player) - player.drawnCredit. May be negative, which is
 * exactly a margin breach. Task 9, contexts/credit/selectors.ts.
 */
export function creditHeadroom(state: GameState, player: PlayerId): Money
```

  `credit` does not import `contexts/board`, so `board -> credit` opens no cycle.
  `markets` **does** import `contexts/board/index.js` (Task 14, Step 3), so
  `board -> markets` would cycle and is forbidden. The two markets functions this task
  needs are therefore **injected as ports**, the same device Task 9 uses for
  `CreditPorts`. These are the exact signatures assumed:

```ts
/**
 * Task 14, contexts/markets/decide.ts. Spec section 6: mortgaging an encumbered
 * property owes the holder the contract's remaining expected value and terminates
 * the contract. MUST be called against the state BEFORE DeedMortgaged is applied,
 * because a mortgaged deed values at zero. Returns [] when the deed is unencumbered.
 */
export function makeWholeOnMortgage(
  state: GameState, deed: DeedId,
): readonly GameEvent[]

/**
 * Task 15, contexts/markets/selectors.ts. Spec section 9: while an option is
 * outstanding the writer may not sell, trade or mortgage the underlying deed.
 * Returns a DEED_ENCUMBERED rejection when locked, null when clear.
 */
export function assertDeedTransferable(
  state: GameState, deed: DeedId,
): Rejection | null
```

- Produces, exported from `packages/engine/src/contexts/board/index.ts`:

```ts
// property.ts
export const HOTEL_LEVEL: number
export const HOUSES_PER_HOTEL: number
export interface SupplyDelta { readonly houses: number; readonly hotels: number }
export function isBuildable(deed: DeedState): boolean
export function groupDeeds(state: GameState, group: ColorGroup): readonly DeedState[]
export function lowestInGroup(state: GameState, group: ColorGroup): number
export function highestInGroup(state: GameState, group: ColorGroup): number
export function groupIsDeveloped(state: GameState, group: ColorGroup): boolean
export function canBuildOn(state: GameState, deed: DeedState): boolean
export function canSellFrom(state: GameState, deed: DeedState): boolean
export function buildingCost(deed: DeedState): Money
export function sellbackValue(deed: DeedState): Money
export function mortgageProceeds(deed: DeedState): Money
export function unmortgageCost(deed: DeedState): Money
export function supplyForBuild(houses: number): SupplyDelta
export function supplyForSell(houses: number): SupplyDelta

// reduce-property.ts
export function reduceProperty(state: GameState, event: GameEvent): GameState

// decide-property.ts
export interface PropertyPorts {
  readonly makeWholeOnMortgage: (state: GameState, deed: DeedId) => readonly GameEvent[]
  readonly assertDeedTransferable: (state: GameState, deed: DeedId) => Rejection | null
}
export const NO_PROPERTY_ENCUMBRANCES: PropertyPorts
export type PropertyCommand =
  | { readonly type: 'BuildHouse'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'SellHouse'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'MortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'UnmortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
  | {
      readonly type: 'TradeAssets'
      readonly from: PlayerId
      readonly to: PlayerId
      readonly deedsFrom: readonly DeedId[]
      readonly deedsTo: readonly DeedId[]
      readonly cashFrom: Money
      readonly cashTo: Money
      readonly confirmedBy: readonly PlayerId[]
    }
export function decideProperty(
  state: GameState, command: PropertyCommand, ports?: PropertyPorts,
): readonly GameEvent[] | Rejection
```

**Rounding.** Four money figures are produced here and every one floors, through
`core/money.ts` and never through `Math.floor(amount * rate)`:

| Figure | Expression |
|---|---|
| building cost | `deed.houseCost` — Task 3 already applied `HOUSE_COST_MULTIPLIER`; **do not** re-apply it |
| sell-back proceeds | `floorPercent(deed.houseCost, ECONOMY.BUILDING_SELLBACK_RATE)` |
| mortgage proceeds | `floorPercent(deed.faceValue, ECONOMY.MORTGAGE_RATE)` |
| unmortgage cost | `floorPercent(deed.faceValue, ECONOMY.UNMORTGAGE_RATE)` |

**Counterparties.** Task 20's conserved quantity is
`sum(cleanCash) − sum(drawnCredit) − sum(distressedDebt) + treasury`, and every event
in this task names a counterparty inside it. Building purchases and unmortgage payments
go **to** the Treasury; sell-back proceeds and mortgage proceeds come **from** it.
`DeedTraded` is player-to-player and crosses no boundary. `CreditDrawn` adds cash and an
equal claim, so it nets to zero. No event here mints or destroys a dollar, and every
test in this task asserts it.

**Voluntary means capped.** Spec 19.8 makes exactly one distinction: automatic
obligations capitalise into the drawn balance *without regard to the borrowing base*;
voluntary draws are always capped at the base. Building and unmortgaging are voluntary.
They therefore emit an ordinary capped `CreditDrawn` for any shortfall, or are refused
outright with `INSUFFICIENT_BORROWING_BASE`. **No path in this task emits
`ObligationCapitalised`, and none may be added.** Doing so would break the one asymmetry
that generates every margin call in the game.

**Era gating is not this task's job.** `core/decide.ts` applies Task 4's unlock table
before dispatching, so `INSTRUMENT_LOCKED_THIS_ERA` is never returned from any file in
this context. All three instruments unlock in Era I anyway.

---

- [ ] **Step 1: Add the four rejection codes to `core/errors.ts`**

`INCOMPLETE_COLOUR_GROUP`, `UNEVEN_BUILD`, `NO_HOUSES_REMAINING`, `NOT_OWNER`,
`DEED_MORTGAGED`, `DEED_ENCUMBERED`, `DEED_UNAVAILABLE`, `SELF_DEALING`,
`NEGATIVE_AMOUNT`, `INSUFFICIENT_CLEAN_CASH` and `INSUFFICIENT_BORROWING_BASE` all
already exist. Four do not. Add them to the `RejectionCode` union in
`packages/engine/src/core/errors.ts`:

```ts
  | 'NO_HOTELS_REMAINING' | 'DEED_DEVELOPED' | 'NOT_BUILDABLE'
  | 'TRADE_NOT_CONFIRMED'
```

Each is restated with its justification under **CONTRACT ADDITIONS REQUIRED**.

- [ ] **Step 2: Write the shared test fixture**

`packages/engine/tests/fixtures/property-state.ts`. This follows Task 14's
`tests/fixtures/market-state.ts` convention — a shared builder outside the context — and
Task 5's convention of building from the real `initialState` and the real 28 deeds rather
than from hand-written stubs, so the house costs, face values and rent tables under test
are the ones the game ships.

```ts
import { initialState } from '../../src/contexts/session/index.js'
import { reduce } from '../../src/core/reduce.js'
import { isRejection, type Rejection } from '../../src/core/errors.js'
import type { GameEvent } from '../../src/core/events.js'
import type { DeedState, GameConfig, GameState, PlayerState } from '../../src/core/state.js'
import type { DeedId, Money, PlayerId } from '../../src/core/types.js'
import { PLAYER_IDS } from '../../src/core/types.js'

export const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

/** The light-blue group, in board order. Three deeds, $45 a house after the 90% cut. */
export const LIGHT_BLUE: readonly DeedId[] = [
  'oriental-avenue', 'vermont-avenue', 'connecticut-avenue',
]

export const RAILROADS: readonly DeedId[] = [
  'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
]

/** A round-1 Open phase with the real 28 deeds, all unowned. */
export function openState(patch: Partial<GameState> = {}): GameState {
  return { ...initialState(CONFIG), phase: 'open', ...patch }
}

export function own(
  state: GameState,
  player: PlayerId,
  ids: readonly DeedId[],
  patch: Partial<DeedState> = {},
): GameState {
  const deeds: Record<DeedId, DeedState> = { ...state.deeds }
  for (const id of ids) {
    const deed = deeds[id]
    if (deed === undefined) throw new Error(`fixture: no deed called ${id}`)
    deeds[id] = { ...deed, owner: player, ...patch }
  }
  return { ...state, deeds }
}

export function setPlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id], ...patch } },
  }
}

export function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) {
    throw new Error(`expected events, got ${result.code}: ${result.message}`)
  }
  return result
}

export function rejectionOf(result: readonly GameEvent[] | Rejection): Rejection {
  if (!isRejection(result)) throw new Error('expected a rejection, got events')
  return result
}

export function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, state)
}

/**
 * Task 20's conserved quantity, restated locally so these unit tests assert it on
 * every money-moving case rather than waiting for the property suite to find it.
 */
export function conserved(state: GameState): Money {
  const held = PLAYER_IDS.reduce((total, id) => {
    const p = state.players[id]
    return total + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, 0)
  return held + state.treasury
}

/** Buildings physically on the board. A deed at five houses is one hotel, not five. */
export function placed(state: GameState): { readonly houses: number; readonly hotels: number } {
  return Object.values(state.deeds).reduce(
    (acc, d) => (d.houses === 5
      ? { houses: acc.houses, hotels: acc.hotels + 1 }
      : { houses: acc.houses + d.houses, hotels: acc.hotels }),
    { houses: 0, hotels: 0 },
  )
}
```

- [ ] **Step 3: Write the failing building test**

`packages/engine/src/contexts/board/building.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideProperty, type PropertyCommand } from './decide-property.js'
import {
  LIGHT_BLUE, applyAll, conserved, eventsOf, openState, own, placed, rejectionOf,
  setPlayer,
} from '../../../tests/fixtures/property-state.js'
import { floorPercent } from '../../core/money.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { DeedId } from '../../core/types.js'

function build(deed: DeedId): PropertyCommand {
  return { type: 'BuildHouse', player: 'P1', deed }
}

function sell(deed: DeedId): PropertyCommand {
  return { type: 'SellHouse', player: 'P1', deed }
}

/** P1 owns the whole light-blue group, unmortgaged and undeveloped. */
function grouped(): GameState {
  return own(openState(), 'P1', LIGHT_BLUE)
}

function doBuild(state: GameState, deed: DeedId): GameState {
  return applyAll(state, eventsOf(decideProperty(state, build(deed))))
}

describe('building', () => {
  it('charges the 90%-of-standard house cost to the Treasury', () => {
    const before = grouped()
    const events = eventsOf(decideProperty(before, build('oriental-avenue')))
    expect(events).toEqual([
      { type: 'HouseBuilt', player: 'P1', deed: 'oriental-avenue', cost: 45 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.houses).toBe(1)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 45)
    expect(after.treasury).toBe(45)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 1)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to build without the whole colour group', () => {
    const partial = own(openState(), 'P1', ['oriental-avenue', 'vermont-avenue'])
    expect(rejectionOf(decideProperty(partial, build('oriental-avenue'))).code)
      .toBe('INCOMPLETE_COLOUR_GROUP')
  })

  it('refuses to build when a group member is mortgaged', () => {
    const broken = own(grouped(), 'P1', ['connecticut-avenue'], { mortgaged: true })
    expect(rejectionOf(decideProperty(broken, build('oriental-avenue'))).code)
      .toBe('INCOMPLETE_COLOUR_GROUP')
  })

  it('refuses to develop railroads and utilities', () => {
    const rails = own(openState(), 'P1', [
      'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
    ])
    expect(rejectionOf(decideProperty(rails, build('reading-railroad'))).code)
      .toBe('NOT_BUILDABLE')
  })

  it('refuses a second house before its siblings have their first', () => {
    const one = doBuild(grouped(), 'oriental-avenue')
    expect(rejectionOf(decideProperty(one, build('oriental-avenue'))).code)
      .toBe('UNEVEN_BUILD')
    expect(eventsOf(decideProperty(one, build('vermont-avenue')))).toHaveLength(1)
  })

  it('refuses to sell from a deed that is behind its siblings', () => {
    // 1/1/1, then a second on oriental gives 2/1/1.
    let state = grouped()
    for (const id of LIGHT_BLUE) state = doBuild(state, id)
    state = doBuild(state, 'oriental-avenue')
    expect(state.deeds['oriental-avenue']?.houses).toBe(2)
    expect(rejectionOf(decideProperty(state, sell('vermont-avenue'))).code)
      .toBe('UNEVEN_BUILD')
    expect(eventsOf(decideProperty(state, sell('oriental-avenue')))).toHaveLength(1)
  })

  it('sells back at half the price paid, floored, and returns the house', () => {
    const before = doBuild(grouped(), 'oriental-avenue')
    const events = eventsOf(decideProperty(before, sell('oriental-avenue')))
    // floor(45 * 0.5) is 22, not 23. The rate goes through floorPercent, never raw.
    expect(events).toEqual([
      { type: 'HouseSold', player: 'P1', deed: 'oriental-avenue', proceeds: 22 },
    ])
    expect(floorPercent(45, ECONOMY.BUILDING_SELLBACK_RATE)).toBe(22)
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.houses).toBe(0)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 45 + 22)
    expect(after.treasury).toBe(45 - 22)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to sell from an undeveloped deed', () => {
    expect(rejectionOf(decideProperty(grouped(), sell('oriental-avenue'))).code)
      .toBe('DEED_UNAVAILABLE')
  })
})

describe('the table supply', () => {
  it('stops a build dead when the last house is gone', () => {
    const before = { ...grouped(), housesRemaining: 1 }
    const one = doBuild(before, 'oriental-avenue')
    expect(one.housesRemaining).toBe(0)
    expect(rejectionOf(decideProperty(one, build('vermont-avenue'))).code)
      .toBe('NO_HOUSES_REMAINING')
    // Hoarding is a legitimate strategy: the block is on supply, not on money.
    expect(one.players.P1.cleanCash).toBeGreaterThan(1000)
  })

  it('returns four houses and consumes one hotel when a hotel goes up', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    expect(state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12)
    expect(placed(state)).toEqual({ houses: 12, hotels: 0 })

    const hotel = doBuild(state, 'oriental-avenue')
    expect(hotel.deeds['oriental-avenue']?.houses).toBe(5)
    expect(hotel.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12 + 4)
    expect(hotel.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY - 1)
    expect(placed(hotel)).toEqual({ houses: 8, hotels: 1 })
    // The supply is fixed. A house destroyed rather than returned is a bug.
    expect(placed(hotel).houses + hotel.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
    expect(placed(hotel).hotels + hotel.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
    // The $45 left the player and arrived in the Treasury, which is inside the pool.
    expect(conserved(hotel)).toBe(conserved(state))
  })

  it('takes four houses back out of the supply when a hotel comes down', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const hotel = doBuild(state, 'oriental-avenue')
    const sold = applyAll(hotel, eventsOf(decideProperty(hotel, sell('oriental-avenue'))))
    expect(sold.deeds['oriental-avenue']?.houses).toBe(4)
    expect(sold.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY - 12)
    expect(sold.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
    expect(placed(sold).houses + sold.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
  })

  it('refuses to break a hotel the bank cannot re-house', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const hotel = { ...doBuild(state, 'oriental-avenue'), housesRemaining: 3 }
    expect(rejectionOf(decideProperty(hotel, sell('oriental-avenue'))).code)
      .toBe('NO_HOUSES_REMAINING')
  })

  it('refuses a hotel when the bank has none left', () => {
    let state = grouped()
    for (let level = 0; level < 4; level += 1) {
      for (const id of LIGHT_BLUE) state = doBuild(state, id)
    }
    const dry = { ...state, hotelsRemaining: 0 }
    expect(rejectionOf(decideProperty(dry, build('oriental-avenue'))).code)
      .toBe('NO_HOTELS_REMAINING')
  })
})

describe('paying for a build', () => {
  it('draws the shortfall on the credit line, capped at the base', () => {
    // Light blue faces 100 + 100 + 120 = 320; the base is floor(320 x 0.75) = 240.
    const poor = setPlayer(grouped(), 'P1', { cleanCash: 10 })
    const events = eventsOf(decideProperty(poor, build('oriental-avenue')))
    expect(events).toEqual([
      { type: 'CreditDrawn', player: 'P1', amount: 35 },
      { type: 'HouseBuilt', player: 'P1', deed: 'oriental-avenue', cost: 45 },
    ])
    const after = applyAll(poor, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(35)
    expect(after.treasury).toBe(45)
    expect(conserved(after)).toBe(conserved(poor))
  })

  it('refuses outright past the base and never capitalises', () => {
    const stretched = setPlayer(grouped(), 'P1', { cleanCash: 0, drawnCredit: 240 })
    const rejection = rejectionOf(decideProperty(stretched, build('oriental-avenue')))
    expect(rejection.code).toBe('INSUFFICIENT_BORROWING_BASE')
    // Building is voluntary. Only automatic obligations capitalise uncapped (spec 19.8).
    expect(rejection.message).toContain('45')
  })

  it('refuses a build outside the Open phase, and by a non-owner', () => {
    expect(rejectionOf(decideProperty(
      { ...grouped(), phase: 'movement' }, build('oriental-avenue'),
    )).code).toBe('WRONG_PHASE')
    expect(rejectionOf(decideProperty(
      grouped(), { type: 'BuildHouse', player: 'P2', deed: 'oriental-avenue' },
    )).code).toBe('NOT_OWNER')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/building.test.ts`
Expected: FAIL — `Cannot find module './decide-property.js'`.

- [ ] **Step 5: Write `contexts/board/property.ts`**

```ts
import { GROUP_MEMBERS } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { DeedState, GameState } from '../../core/state.js'
import type { ColorGroup, Money } from '../../core/types.js'

/** A hotel is recorded as the fifth building on a deed. Task 2, DeedState.houses. */
export const HOTEL_LEVEL = 5

/** Houses handed back to the table when a hotel replaces them. */
export const HOUSES_PER_HOTEL = 4

/** Movement of the table supply, expressed as a delta on the remaining counts. */
export interface SupplyDelta {
  readonly houses: number
  readonly hotels: number
}

/** Railroads and utilities have no rent table and no house cost. Spec section 2. */
export function isBuildable(deed: DeedState): boolean {
  return deed.group !== 'railroad' && deed.group !== 'utility'
}

export function groupDeeds(state: GameState, group: ColorGroup): readonly DeedState[] {
  return GROUP_MEMBERS[group].flatMap((id) => {
    const deed = state.deeds[id]
    return deed === undefined ? [] : [deed]
  })
}

export function lowestInGroup(state: GameState, group: ColorGroup): number {
  return groupDeeds(state, group).reduce(
    (low, d) => Math.min(low, d.houses), HOTEL_LEVEL,
  )
}

export function highestInGroup(state: GameState, group: ColorGroup): number {
  return groupDeeds(state, group).reduce((high, d) => Math.max(high, d.houses), 0)
}

/** True when any deed in the group carries a building. Gates mortgaging and trading. */
export function groupIsDeveloped(state: GameState, group: ColorGroup): boolean {
  return groupDeeds(state, group).some((d) => d.houses > 0)
}

/**
 * The even-build rule: no deed may run more than one building ahead of a sibling.
 * Building is therefore legal only on a deed currently at the group minimum, and
 * selling only from one at the group maximum. Both directions are enforced, and
 * both are tested.
 */
export function canBuildOn(state: GameState, deed: DeedState): boolean {
  return deed.houses < HOTEL_LEVEL && deed.houses === lowestInGroup(state, deed.group)
}

export function canSellFrom(state: GameState, deed: DeedState): boolean {
  return deed.houses > 0 && deed.houses === highestInGroup(state, deed.group)
}

/**
 * Task 3 already multiplied the printed board figure by HOUSE_COST_MULTIPLIER when it
 * built DEED_LIST, so `houseCost` is the 90% price. Re-applying the multiplier here
 * would charge 81%.
 */
export function buildingCost(deed: DeedState): Money {
  return deed.houseCost
}

/** Spec 19.6: buildings sell back at 50% of the price PAID. */
export function sellbackValue(deed: DeedState): Money {
  return floorPercent(deed.houseCost, ECONOMY.BUILDING_SELLBACK_RATE)
}

export function mortgageProceeds(deed: DeedState): Money {
  return floorPercent(deed.faceValue, ECONOMY.MORTGAGE_RATE)
}

export function unmortgageCost(deed: DeedState): Money {
  return floorPercent(deed.faceValue, ECONOMY.UNMORTGAGE_RATE)
}

/**
 * Supply movement for placing the (houses + 1)-th building. A hotel consumes one
 * hotel and RETURNS its four houses to the table, which is the whole point of the
 * housing shortage: four hotels free up sixteen houses for everyone else.
 */
export function supplyForBuild(houses: number): SupplyDelta {
  return houses + 1 === HOTEL_LEVEL
    ? { houses: HOUSES_PER_HOTEL, hotels: -1 }
    : { houses: -1, hotels: 0 }
}

/** The exact inverse. Breaking a hotel takes four houses back OUT of the supply. */
export function supplyForSell(houses: number): SupplyDelta {
  return houses === HOTEL_LEVEL
    ? { houses: -HOUSES_PER_HOTEL, hotels: 1 }
    : { houses: 1, hotels: 0 }
}
```

- [ ] **Step 6: Write `contexts/board/reduce-property.ts`**

```ts
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { supplyForBuild, supplyForSell, type SupplyDelta } from './property.js'

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

function withDeed(state: GameState, id: DeedId, patch: Partial<DeedState>): GameState {
  const existing = state.deeds[id]
  if (existing === undefined) return state
  return { ...state, deeds: { ...state.deeds, [id]: { ...existing, ...patch } } }
}

/** The Treasury is the named counterparty for every bank-facing property flow. */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const next = withPlayer(state, id, { cleanCash: state.players[id].cleanCash - amount })
  return { ...next, treasury: next.treasury + amount }
}

function receiveFromTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const next = withPlayer(state, id, { cleanCash: state.players[id].cleanCash + amount })
  return { ...next, treasury: next.treasury - amount }
}

function withSupply(state: GameState, delta: SupplyDelta): GameState {
  return {
    ...state,
    housesRemaining: state.housesRemaining + delta.houses,
    hotelsRemaining: state.hotelsRemaining + delta.hotels,
  }
}

export function reduceProperty(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    /**
     * The decider has already proved affordability and supply, so the charge is
     * unconditional. Whether this is a house or a hotel is derivable from the deed's
     * current level, which is why the event needs no extra field.
     */
    case 'HouseBuilt': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      return withSupply(
        withDeed(
          payTreasury(state, event.player, event.cost),
          event.deed,
          { houses: deed.houses + 1 },
        ),
        supplyForBuild(deed.houses),
      )
    }

    case 'HouseSold': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      return withSupply(
        withDeed(
          receiveFromTreasury(state, event.player, event.proceeds),
          event.deed,
          { houses: deed.houses - 1 },
        ),
        supplyForSell(deed.houses),
      )
    }

    case 'DeedMortgaged':
      return withDeed(
        receiveFromTreasury(state, event.player, event.proceeds),
        event.deed,
        { mortgaged: true },
      )

    case 'DeedUnmortgaged':
      return withDeed(
        payTreasury(state, event.player, event.cost),
        event.deed,
        { mortgaged: false },
      )

    /**
     * One leg of a trade: `from` hands over `deeds` and `cash` to `to`. A two-sided
     * trade is two of these. Encumbrances are untouched on purpose — a rent future
     * references the deed and not its owner, which is exactly what makes spec
     * section 6's "contracts follow the deed" true with no code here.
     */
    case 'DeedTraded': {
      const moved = event.deeds.reduce<GameState>(
        (acc, id) => withDeed(acc, id, { owner: event.to }),
        state,
      )
      const giver = moved.players[event.from]
      const taker = moved.players[event.to]
      return {
        ...moved,
        players: {
          ...moved.players,
          [event.from]: { ...giver, cleanCash: giver.cleanCash - event.cash },
          [event.to]: { ...taker, cleanCash: taker.cleanCash + event.cash },
        },
      }
    }

    default:
      return state
  }
}
```

- [ ] **Step 7: Write `contexts/board/decide-property.ts` with the build and sell arms**

Mortgage, unmortgage and trade land in Steps 13 and 20. The `PropertyCommand` union and
the `switch` grow together, so the compiler enforces exhaustiveness at each stage.

```ts
import { isRejection, reject, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { creditHeadroom } from '../credit/index.js'
import { ownsWholeGroup } from './rent.js'
import {
  HOTEL_LEVEL, HOUSES_PER_HOTEL, buildingCost, canBuildOn, canSellFrom, isBuildable,
  sellbackValue,
} from './property.js'

export type PropertyCommand =
  | { readonly type: 'BuildHouse'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'SellHouse'; readonly player: PlayerId; readonly deed: DeedId }

function ownedDeed(
  state: GameState,
  player: PlayerId,
  id: DeedId,
): DeedState | Rejection {
  const deed = state.deeds[id]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${id}.`)
  }
  if (deed.owner !== player) {
    return reject('NOT_OWNER', `${player} does not own ${id}.`)
  }
  return deed
}

/**
 * Spec 19.8. Building and unmortgaging are VOLUNTARY, so the shortfall draws on the
 * credit line at the ordinary cap or the command is refused. It never capitalises:
 * the uncapped path belongs to automatic obligations alone, and the gap between the
 * two is the only mechanism in the game that produces a margin call.
 *
 * The base is read BEFORE the purchase, so a player cannot borrow against the very
 * house or the very unmortgaged deed the draw is paying for.
 */
function fundVoluntary(
  state: GameState,
  player: PlayerId,
  amount: Money,
): readonly GameEvent[] | Rejection {
  const cash = state.players[player].cleanCash
  if (cash >= amount) return []
  const needed = amount - cash
  const headroom = Math.max(0, creditHeadroom(state, player))
  if (headroom < needed) {
    return reject(
      'INSUFFICIENT_BORROWING_BASE',
      `That costs $${amount}. You hold $${cash} in clean cash and can draw $${headroom} `
      + `more against your borrowing base, which leaves you $${needed - headroom} short.`,
    )
  }
  return [{ type: 'CreditDrawn', player, amount: needed }]
}

function decideBuild(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'BuildHouse' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (!isBuildable(deed)) {
    return reject('NOT_BUILDABLE', 'Railroads and utilities cannot be developed.')
  }
  if (deed.mortgaged) {
    return reject(
      'DEED_MORTGAGED',
      `${command.deed} is mortgaged. Lift the mortgage before building on it.`,
    )
  }
  if (!ownsWholeGroup(state, deed.group, command.player)) {
    return reject(
      'INCOMPLETE_COLOUR_GROUP',
      `Building on ${command.deed} needs every ${deed.group} deed, owned by you and `
      + 'unmortgaged.',
    )
  }
  if (deed.houses >= HOTEL_LEVEL) {
    return reject('UNEVEN_BUILD', `${command.deed} already has a hotel, the maximum.`)
  }
  if (!canBuildOn(state, deed)) {
    return reject(
      'UNEVEN_BUILD',
      `Build evenly: another ${deed.group} deed has fewer buildings than ${command.deed}.`,
    )
  }
  const placingHotel = deed.houses + 1 === HOTEL_LEVEL
  if (placingHotel && state.hotelsRemaining < 1) {
    return reject('NO_HOTELS_REMAINING', 'The bank has no hotels left.')
  }
  if (!placingHotel && state.housesRemaining < 1) {
    return reject(
      'NO_HOUSES_REMAINING',
      'The bank has no houses left. Another player is holding the supply.',
    )
  }
  const cost = buildingCost(deed)
  const funding = fundVoluntary(state, command.player, cost)
  if (isRejection(funding)) return funding
  return [
    ...funding,
    { type: 'HouseBuilt', player: command.player, deed: command.deed, cost },
  ]
}

function decideSell(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'SellHouse' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (deed.houses < 1) {
    return reject(
      'DEED_UNAVAILABLE',
      `There are no buildings on ${command.deed} to sell.`,
    )
  }
  if (!canSellFrom(state, deed)) {
    return reject(
      'UNEVEN_BUILD',
      `Sell evenly: another ${deed.group} deed has more buildings than ${command.deed}.`,
    )
  }
  if (deed.houses === HOTEL_LEVEL && state.housesRemaining < HOUSES_PER_HOTEL) {
    return reject(
      'NO_HOUSES_REMAINING',
      `Breaking this hotel needs ${HOUSES_PER_HOTEL} houses back from the bank and `
      + `only ${state.housesRemaining} remain. Wait for a house to come free.`,
    )
  }
  return [{
    type: 'HouseSold',
    player: command.player,
    deed: command.deed,
    proceeds: sellbackValue(deed),
  }]
}

export function decideProperty(
  state: GameState,
  command: PropertyCommand,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject(
      'WRONG_PHASE',
      'Property actions are only available during the Open phase.',
    )
  }
  switch (command.type) {
    case 'BuildHouse':
      return decideBuild(state, command)
    case 'SellHouse':
      return decideSell(state, command)
  }
}
```

- [ ] **Step 8: Wire the context index and the root reducer**

Append to `packages/engine/src/contexts/board/index.ts`:

```ts
export * from './property.js'
export { reduceProperty } from './reduce-property.js'
export { decideProperty, type PropertyCommand } from './decide-property.js'
```

In `packages/engine/src/core/reduce.ts`, add `reduceProperty` to the chain. The five
property events are disjoint from every other context's, so position in the chain is
immaterial and the other reducers pass them straight through:

```ts
import { reduceBoard, reduceProperty } from '../contexts/board/index.js'
import { reduceCredit } from '../contexts/credit/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceProperty(
    reduceCredit(reduceBoard(reduceSession(state, event), event), event),
    event,
  )
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/building.test.ts`
Expected: PASS, sixteen tests. The two that matter most are the hotel accounting and
the supply-exhaustion case: if `placed(hotel).houses + hotel.housesRemaining` is not
exactly `ECONOMY.HOUSE_SUPPLY`, the reducer is destroying houses rather than returning
them, which is the defect Task 10 found in the liquidation strip.

- [ ] **Step 10: Commit building**

```bash
git add packages/engine/src/contexts/board/ packages/engine/src/core/ \
        packages/engine/tests/fixtures/property-state.ts
git commit -m "feat(board): building and selling back, with the even-build rule

House cost is the 90% figure config/board.ts already computed; sell-back is
50% of the price paid via floorPercent. The 32-house and 12-hotel table supply
is tracked on both sides: a hotel consumes one hotel and returns its four
houses, and breaking one takes those four back. Building is voluntary, so an
unaffordable build draws capped credit or is refused - it never capitalises."
```

- [ ] **Step 11: Write the failing mortgage test**

`packages/engine/src/contexts/board/mortgage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  NO_PROPERTY_ENCUMBRANCES, decideProperty, type PropertyCommand, type PropertyPorts,
} from './decide-property.js'
import { unmortgageCost } from './property.js'
import { ownsWholeGroup, rentDue } from './rent.js'
import { borrowingBase, carryingCostFor } from '../credit/index.js'
import {
  LIGHT_BLUE, RAILROADS, applyAll, conserved, eventsOf, openState, own, rejectionOf,
  setPlayer,
} from '../../../tests/fixtures/property-state.js'
import { floorPercent } from '../../core/money.js'
import { reject } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, DiceRoll } from '../../core/types.js'

const ROLL: DiceRoll = [3, 4]

function mortgage(deed: DeedId): PropertyCommand {
  return { type: 'MortgageDeed', player: 'P1', deed }
}

function unmortgage(deed: DeedId): PropertyCommand {
  return { type: 'UnmortgageDeed', player: 'P1', deed }
}

function railroads(): GameState {
  return own(openState(), 'P1', RAILROADS)
}

describe('mortgaging', () => {
  it('pays 50% of face from the Treasury and flips the flag', () => {
    const before = own(openState(), 'P1', ['oriental-avenue'])
    const events = eventsOf(decideProperty(before, mortgage('oriental-avenue')))
    expect(events).toEqual([
      { type: 'DeedMortgaged', player: 'P1', deed: 'oriental-avenue', proceeds: 50 },
    ])
    expect(floorPercent(100, ECONOMY.MORTGAGE_RATE)).toBe(50)
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(true)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
    expect(after.treasury).toBe(-50)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses to mortgage a deed that carries buildings (spec 19.6)', () => {
    const built = own(
      own(openState(), 'P1', LIGHT_BLUE), 'P1', ['oriental-avenue'], { houses: 1 },
    )
    expect(rejectionOf(decideProperty(built, mortgage('oriental-avenue'))).code)
      .toBe('DEED_DEVELOPED')
  })

  it('refuses to mortgage an undeveloped sibling of a developed group', () => {
    // Buildings may only ever sit on a group that is wholly owned and wholly
    // unmortgaged, so the whole group has to be stripped before any of it mortgages.
    const built = own(
      own(openState(), 'P1', LIGHT_BLUE), 'P1', ['oriental-avenue'], { houses: 1 },
    )
    const rejection = rejectionOf(decideProperty(built, mortgage('connecticut-avenue')))
    expect(rejection.code).toBe('DEED_DEVELOPED')
    expect(rejection.message).toContain('light-blue')

    const stripped = applyAll(built, eventsOf(decideProperty(
      built, { type: 'SellHouse', player: 'P1', deed: 'oriental-avenue' },
    )))
    expect(eventsOf(decideProperty(stripped, mortgage('connecticut-avenue'))))
      .toHaveLength(1)
  })

  it('drops the other three railroads from $200 to $100', () => {
    const before = railroads()
    for (const id of RAILROADS) expect(rentDue(before, id, ROLL)).toBe(200)

    const after = applyAll(
      before, eventsOf(decideProperty(before, mortgage('b-and-o-railroad'))),
    )
    expect(rentDue(after, 'reading-railroad', ROLL)).toBe(100)
    expect(rentDue(after, 'pennsylvania-railroad', ROLL)).toBe(100)
    expect(rentDue(after, 'short-line', ROLL)).toBe(100)
    // The mortgaged railroad itself collects nothing, which is also what makes
    // spec 19.9 true: an Escort or Chop Shop bonus on it computes to zero.
    expect(rentDue(after, 'b-and-o-railroad', ROLL)).toBe(0)
  })

  it('breaks colour-group doubling and stops the carrying cost', () => {
    const before = own(openState(), 'P1', LIGHT_BLUE)
    expect(ownsWholeGroup(before, 'light-blue', 'P1')).toBe(true)
    expect(rentDue(before, 'oriental-avenue', ROLL)).toBe(12)
    expect(carryingCostFor(before, 'P1')).toBe(3 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(borrowingBase(before, 'P1')).toBe(floorPercent(320, ECONOMY.DEED_ADVANCE_RATE))

    const after = applyAll(
      before, eventsOf(decideProperty(before, mortgage('connecticut-avenue'))),
    )
    expect(ownsWholeGroup(after, 'light-blue', 'P1')).toBe(false)
    expect(rentDue(after, 'oriental-avenue', ROLL)).toBe(6)
    expect(rentDue(after, 'connecticut-avenue', ROLL)).toBe(0)
    expect(carryingCostFor(after, 'P1')).toBe(2 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(borrowingBase(after, 'P1')).toBe(floorPercent(200, ECONOMY.DEED_ADVANCE_RATE))
  })

  it('refuses to mortgage twice', () => {
    const already = own(openState(), 'P1', ['oriental-avenue'], { mortgaged: true })
    expect(rejectionOf(decideProperty(already, mortgage('oriental-avenue'))).code)
      .toBe('DEED_MORTGAGED')
  })
})

describe('encumbrances on a mortgage', () => {
  const LOCKED: PropertyPorts = {
    makeWholeOnMortgage: () => [],
    assertDeedTransferable: () => reject(
      'DEED_ENCUMBERED',
      'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
    ),
  }

  it('refuses when an outstanding deed option locks the deed', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    expect(rejectionOf(decideProperty(state, mortgage('oriental-avenue'), LOCKED)).code)
      .toBe('DEED_ENCUMBERED')
  })

  it('values the make-whole before the mortgage but sequences it after', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    const ports: PropertyPorts = {
      makeWholeOnMortgage: (s, deed) => {
        // Spec section 6: a mortgaged deed collects no rent and would value at zero,
        // so the contract must be marked against the pre-mortgage state.
        expect(s.deeds[deed]?.mortgaged).toBe(false)
        return [
          { type: 'RentFutureMadeWhole', id: 'F1', amount: 40 },
          { type: 'RentFutureExpired', id: 'F1' },
        ]
      },
      assertDeedTransferable: () => null,
    }
    // The proceeds land first so the owner has the cash the make-whole is measured against.
    expect(eventsOf(decideProperty(state, mortgage('oriental-avenue'), ports))).toEqual([
      { type: 'DeedMortgaged', player: 'P1', deed: 'oriental-avenue', proceeds: 50 },
      { type: 'RentFutureMadeWhole', id: 'F1', amount: 40 },
      { type: 'RentFutureExpired', id: 'F1' },
    ])
  })

  it('defaults to no encumbrances when no ports are supplied', () => {
    const state = own(openState(), 'P1', ['oriental-avenue'])
    expect(decideProperty(state, mortgage('oriental-avenue')))
      .toEqual(decideProperty(state, mortgage('oriental-avenue'), NO_PROPERTY_ENCUMBRANCES))
  })
})

describe('unmortgaging', () => {
  it('costs 55% of face, floored, and pays the Treasury', () => {
    const before = own(openState(), 'P1', ['oriental-avenue'], { mortgaged: true })
    const events = eventsOf(decideProperty(before, unmortgage('oriental-avenue')))
    expect(events).toEqual([
      { type: 'DeedUnmortgaged', player: 'P1', deed: 'oriental-avenue', cost: 55 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(false)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 55)
    expect(after.treasury).toBe(55)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('floors the half-dollar cases rather than rounding them up', () => {
    const state = own(openState(), 'P1', ['park-place'], { mortgaged: true })
    const deed = state.deeds['park-place']
    expect(deed).toBeDefined()
    // 350 x 0.55 is 192.5. The player pays 192.
    expect(deed === undefined ? -1 : unmortgageCost(deed)).toBe(192)
    expect(floorPercent(350, ECONOMY.UNMORTGAGE_RATE)).toBe(192)
  })

  it('draws capped credit for the shortfall', () => {
    // Boardwalk unmortgaged gives a base of floor(400 x 0.75) = 300.
    const before = setPlayer(
      own(
        own(openState(), 'P1', ['boardwalk']),
        'P1', ['park-place'], { mortgaged: true },
      ),
      'P1', { cleanCash: 100 },
    )
    const events = eventsOf(decideProperty(before, unmortgage('park-place')))
    expect(events).toEqual([
      { type: 'CreditDrawn', player: 'P1', amount: 92 },
      { type: 'DeedUnmortgaged', player: 'P1', deed: 'park-place', cost: 192 },
    ])
    const after = applyAll(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(92)
    expect(after.treasury).toBe(192)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('refuses when the deed being redeemed is the only collateral on offer', () => {
    // A mortgaged deed contributes nothing to the base, so it cannot fund its own
    // redemption. This is deliberate and conservative: you may not borrow against
    // an asset the draw has not yet freed.
    const stuck = setPlayer(
      own(openState(), 'P1', ['park-place'], { mortgaged: true }),
      'P1', { cleanCash: 0 },
    )
    expect(rejectionOf(decideProperty(stuck, unmortgage('park-place'))).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
  })

  it('refuses to unmortgage a deed that is not mortgaged', () => {
    const clear = own(openState(), 'P1', ['oriental-avenue'])
    expect(rejectionOf(decideProperty(clear, unmortgage('oriental-avenue'))).code)
      .toBe('DEED_UNAVAILABLE')
  })
})
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/mortgage.test.ts`
Expected: FAIL — `NO_PROPERTY_ENCUMBRANCES` and `PropertyPorts` are not exported, and
`MortgageDeed` is not a member of `PropertyCommand`.

- [ ] **Step 13: Add the ports and the mortgage arms to `decide-property.ts`**

Add to the imports:

```ts
import { groupIsDeveloped, mortgageProceeds, unmortgageCost } from './property.js'
```

Add above `PropertyCommand`:

```ts
/**
 * Functions owned by the `markets` context that this task needs. They are injected
 * rather than imported because `markets` imports `contexts/board/index.js` (Task 14),
 * so a direct import here would close a cycle. The root decider, which may import
 * both, supplies the real implementations. Task 9 uses the same device for CreditPorts.
 */
export interface PropertyPorts {
  /**
   * Spec section 6. Called against the state BEFORE DeedMortgaged is applied,
   * because a mortgaged deed collects no rent and values every contract at zero.
   */
  readonly makeWholeOnMortgage: (state: GameState, deed: DeedId) => readonly GameEvent[]
  /** Spec section 9. A DEED_ENCUMBERED rejection while an option is outstanding. */
  readonly assertDeedTransferable: (state: GameState, deed: DeedId) => Rejection | null
}

/** Safe default for states carrying no futures and no options. */
export const NO_PROPERTY_ENCUMBRANCES: PropertyPorts = {
  makeWholeOnMortgage: () => [],
  assertDeedTransferable: () => null,
}
```

Widen `PropertyCommand` with two members:

```ts
  | { readonly type: 'MortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'UnmortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
```

Add the two deciders:

```ts
function decideMortgage(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'MortgageDeed' }>,
  ports: PropertyPorts,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (deed.mortgaged) {
    return reject('DEED_MORTGAGED', `${command.deed} is already mortgaged.`)
  }
  /**
   * Spec 19.6. The test is on the whole colour group, not just this deed: buildings
   * may only ever stand on a group that is wholly owned and wholly unmortgaged, and
   * because sell-back is even across the group, clearing one deed to zero means
   * bringing the whole group down with it.
   */
  if (groupIsDeveloped(state, deed.group)) {
    return reject(
      'DEED_DEVELOPED',
      `The ${deed.group} group still has buildings on it. Sell them back to the bank `
      + `before mortgaging ${command.deed} - sell-back is even across the group, so `
      + 'that means stripping the whole group.',
    )
  }
  const locked = ports.assertDeedTransferable(state, command.deed)
  if (locked !== null) return locked
  // Valued against the pre-mortgage state, sequenced after the proceeds arrive.
  return [
    {
      type: 'DeedMortgaged',
      player: command.player,
      deed: command.deed,
      proceeds: mortgageProceeds(deed),
    },
    ...ports.makeWholeOnMortgage(state, command.deed),
  ]
}

function decideUnmortgage(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'UnmortgageDeed' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (!deed.mortgaged) {
    return reject('DEED_UNAVAILABLE', `${command.deed} is not mortgaged.`)
  }
  const cost = unmortgageCost(deed)
  const funding = fundVoluntary(state, command.player, cost)
  if (isRejection(funding)) return funding
  return [
    ...funding,
    { type: 'DeedUnmortgaged', player: command.player, deed: command.deed, cost },
  ]
}
```

Give `decideProperty` the ports parameter and the two new cases:

```ts
export function decideProperty(
  state: GameState,
  command: PropertyCommand,
  ports: PropertyPorts = NO_PROPERTY_ENCUMBRANCES,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject(
      'WRONG_PHASE',
      'Property actions are only available during the Open phase.',
    )
  }
  switch (command.type) {
    case 'BuildHouse':
      return decideBuild(state, command)
    case 'SellHouse':
      return decideSell(state, command)
    case 'MortgageDeed':
      return decideMortgage(state, command, ports)
    case 'UnmortgageDeed':
      return decideUnmortgage(state, command)
  }
}
```

- [ ] **Step 14: Export the ports from the context index**

Replace the `decide-property.js` line in `packages/engine/src/contexts/board/index.ts`:

```ts
export {
  NO_PROPERTY_ENCUMBRANCES, decideProperty,
  type PropertyCommand, type PropertyPorts,
} from './decide-property.js'
```

The default is named `NO_PROPERTY_ENCUMBRANCES` rather than `NO_ENCUMBRANCES` because
`contexts/credit/index.ts` already exports a `NO_ENCUMBRANCES`, and
`packages/engine/src/index.ts` re-exports both contexts with `export *`. Two identical
names would make the package's public surface fail to compile.

- [ ] **Step 15: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/mortgage.test.ts`
Expected: PASS, fourteen tests. The railroad case is the one to watch: if the other three
still read $200 after the mortgage, `rentDue` is counting mortgaged members and spec
section 2's owned-count rule is broken.

- [ ] **Step 16: Commit mortgaging**

```bash
git add packages/engine/src/contexts/board/
git commit -m "feat(board): mortgage and unmortgage

50% of face out of the Treasury, 55% back in, both through floorPercent. Spec
19.6 is enforced on the whole colour group rather than the single deed, because
buildings may only stand on a wholly-owned, wholly-unmortgaged group. Rent
futures and deed options reach the decider as injected ports so board does not
import markets, which imports board."
```

- [ ] **Step 17: Write the failing trade test**

`packages/engine/src/contexts/board/trade.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideProperty, type PropertyCommand, type PropertyPorts } from './decide-property.js'
import { rentRecipient } from './rent.js'
import {
  applyAll, conserved, eventsOf, openState, own, rejectionOf, setPlayer,
} from '../../../tests/fixtures/property-state.js'
import { reject } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'

const LOCKED: PropertyPorts = {
  makeWholeOnMortgage: () => [],
  assertDeedTransferable: (_state, deed) => (deed === 'oriental-avenue'
    ? reject(
      'DEED_ENCUMBERED',
      'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
    )
    : null),
}

/** P1 holds Oriental Avenue, P2 holds St. James Place. */
function twoSided(): GameState {
  return own(own(openState(), 'P1', ['oriental-avenue']), 'P2', ['st-james-place'])
}

function trade(patch: Partial<Extract<PropertyCommand, { type: 'TradeAssets' }>> = {}):
PropertyCommand {
  return {
    type: 'TradeAssets',
    from: 'P1',
    to: 'P2',
    deedsFrom: [],
    deedsTo: [],
    cashFrom: 0,
    cashTo: 0,
    confirmedBy: ['P1', 'P2'],
    ...patch,
  }
}

describe('trading', () => {
  it('moves deeds and cash both ways as two legs', () => {
    const before = twoSided()
    const events = eventsOf(decideProperty(before, trade({
      deedsFrom: ['oriental-avenue'], deedsTo: ['st-james-place'], cashTo: 60,
    })))
    expect(events).toEqual([
      { type: 'DeedTraded', from: 'P1', to: 'P2', deeds: ['oriental-avenue'], cash: 0 },
      { type: 'DeedTraded', from: 'P2', to: 'P1', deeds: ['st-james-place'], cash: 60 },
    ])
    const after = applyAll(before, events)
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(after.deeds['st-james-place']?.owner).toBe('P1')
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH - 60)
    expect(after.treasury).toBe(0)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('allows a cash-only trade, which emits one leg', () => {
    const before = openState()
    const events = eventsOf(decideProperty(before, trade({ cashFrom: 200 })))
    expect(events).toEqual([
      { type: 'DeedTraded', from: 'P1', to: 'P2', deeds: [], cash: 200 },
    ])
    const after = applyAll(before, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 200)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('carries an encumbrance to the new owner untouched', () => {
    const before: GameState = {
      ...twoSided(),
      futures: [{
        id: 'F1', deed: 'oriental-avenue', holder: 'P3', startRound: 1, endRound: 5,
      }],
    }
    expect(rentRecipient(before, 'oriental-avenue')).toBe('P3')
    const after = applyAll(before, eventsOf(decideProperty(
      before, trade({ deedsFrom: ['oriental-avenue'], cashTo: 100 }),
    )))
    // Spec section 6: contracts follow the deed. The future references the deed and
    // not its owner, so no code in this task has to do anything for that to hold.
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(rentRecipient(after, 'oriental-avenue')).toBe('P3')
  })

  it('trades a mortgaged deed, which stays mortgaged', () => {
    const before = own(twoSided(), 'P1', ['oriental-avenue'], { mortgaged: true })
    const after = applyAll(before, eventsOf(decideProperty(
      before, trade({ deedsFrom: ['oriental-avenue'] }),
    )))
    expect(after.deeds['oriental-avenue']?.owner).toBe('P2')
    expect(after.deeds['oriental-avenue']?.mortgaged).toBe(true)
  })
})

describe('trades that must be refused', () => {
  it('refuses a deed with an outstanding deed option', () => {
    const rejection = rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'] }), LOCKED,
    ))
    expect(rejection.code).toBe('DEED_ENCUMBERED')
    // The writer is locked; the same deed on the other leg is unaffected.
    expect(eventsOf(decideProperty(
      twoSided(), trade({ deedsTo: ['st-james-place'] }), LOCKED,
    ))).toHaveLength(1)
  })

  it('refuses a deed with buildings on it', () => {
    const built = own(
      own(openState(), 'P1', ['oriental-avenue', 'vermont-avenue', 'connecticut-avenue']),
      'P1', ['oriental-avenue'], { houses: 1 },
    )
    expect(rejectionOf(decideProperty(built, trade({ deedsFrom: ['oriental-avenue'] }))).code)
      .toBe('DEED_DEVELOPED')
  })

  it('refuses self-dealing', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ to: 'P1', deedsFrom: ['oriental-avenue'] }),
    )).code).toBe('SELF_DEALING')
  })

  it('refuses until both sides confirm', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], confirmedBy: ['P1'] }),
    )).code).toBe('TRADE_NOT_CONFIRMED')
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], confirmedBy: ['P2'] }),
    )).code).toBe('TRADE_NOT_CONFIRMED')
  })

  it('refuses a deed the giver does not own', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['st-james-place'] }),
    )).code).toBe('NOT_OWNER')
  })

  it('refuses the same deed listed on both legs', () => {
    expect(rejectionOf(decideProperty(
      twoSided(), trade({ deedsFrom: ['oriental-avenue'], deedsTo: ['oriental-avenue'] }),
    )).code).toBe('DEED_UNAVAILABLE')
  })

  it('refuses cash a side does not hold in clean cash', () => {
    const poor = setPlayer(twoSided(), 'P2', { cleanCash: 10 })
    const rejection = rejectionOf(decideProperty(
      poor, trade({ deedsFrom: ['oriental-avenue'], cashTo: 500 }),
    ))
    // Trades do not auto-draw; the buyer draws credit first, as its own command.
    expect(rejection.code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses negative or fractional cash', () => {
    expect(rejectionOf(decideProperty(twoSided(), trade({ cashFrom: -50 }))).code)
      .toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(decideProperty(twoSided(), trade({ cashFrom: 12.5 }))).code)
      .toBe('NEGATIVE_AMOUNT')
  })

  it('refuses an empty trade and a trade outside the Open phase', () => {
    expect(rejectionOf(decideProperty(twoSided(), trade())).code).toBe('DEED_UNAVAILABLE')
    expect(rejectionOf(decideProperty(
      { ...twoSided(), phase: 'settlement' },
      trade({ deedsFrom: ['oriental-avenue'] }),
    )).code).toBe('WRONG_PHASE')
  })
})
```

- [ ] **Step 18: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/board/trade.test.ts`
Expected: FAIL — `TradeAssets` is not a member of `PropertyCommand`.

- [ ] **Step 19: Add the trade command and decider to `decide-property.ts`**

Widen `PropertyCommand` with the trade member:

```ts
  | {
      readonly type: 'TradeAssets'
      readonly from: PlayerId
      readonly to: PlayerId
      readonly deedsFrom: readonly DeedId[]
      readonly deedsTo: readonly DeedId[]
      readonly cashFrom: Money
      readonly cashTo: Money
      /**
       * Both parties. Negotiation happens at the table and the facilitator submits
       * the command only once both have said yes, so the engine holds no pending-trade
       * state and no trade can be left half-open across a phase boundary.
       */
      readonly confirmedBy: readonly PlayerId[]
    }
```

Add the decider:

```ts
type TradeCommand = Extract<PropertyCommand, { type: 'TradeAssets' }>

/** One direction of a trade: giver, taker, and the deeds moving that way. */
type TradeLeg = readonly [PlayerId, PlayerId, readonly DeedId[], Money]

function decideTrade(
  state: GameState,
  command: TradeCommand,
  ports: PropertyPorts,
): readonly GameEvent[] | Rejection {
  if (command.from === command.to) {
    return reject('SELF_DEALING', 'You cannot trade with yourself.')
  }
  for (const amount of [command.cashFrom, command.cashTo]) {
    if (!Number.isInteger(amount) || amount < 0) {
      return reject('NEGATIVE_AMOUNT', 'Cash in a trade must be whole dollars, zero or more.')
    }
  }
  for (const side of [command.from, command.to]) {
    if (!command.confirmedBy.includes(side)) {
      return reject('TRADE_NOT_CONFIRMED', `${side} has not confirmed this trade.`)
    }
  }

  const legs: readonly TradeLeg[] = [
    [command.from, command.to, command.deedsFrom, command.cashFrom],
    [command.to, command.from, command.deedsTo, command.cashTo],
  ]

  const seen = new Set<DeedId>()
  for (const [giver, , deeds, cash] of legs) {
    for (const id of deeds) {
      if (seen.has(id)) {
        return reject('DEED_UNAVAILABLE', `${id} appears on both sides of this trade.`)
      }
      seen.add(id)
      const deed = ownedDeed(state, giver, id)
      if (isRejection(deed)) return deed
      if (deed.houses > 0) {
        return reject(
          'DEED_DEVELOPED',
          `Sell the buildings on ${id} back to the bank before trading it. They belong `
          + `to the ${deed.group} group, which the new owner may not complete.`,
        )
      }
      const locked = ports.assertDeedTransferable(state, id)
      if (locked !== null) return locked
    }
    if (state.players[giver].cleanCash < cash) {
      return reject(
        'INSUFFICIENT_CLEAN_CASH',
        `${giver} offered $${cash} but holds $${state.players[giver].cleanCash} in clean `
        + 'cash. Draw on the credit line first, then trade.',
      )
    }
  }

  const events: GameEvent[] = []
  for (const [giver, taker, deeds, cash] of legs) {
    if (deeds.length === 0 && cash === 0) continue
    events.push({ type: 'DeedTraded', from: giver, to: taker, deeds, cash })
  }
  if (events.length === 0) {
    return reject('DEED_UNAVAILABLE', 'A trade must move at least one deed or some cash.')
  }
  return events
}
```

Add the case to `decideProperty`'s switch:

```ts
    case 'TradeAssets':
      return decideTrade(state, command, ports)
```

- [ ] **Step 20: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/board/trade.test.ts`
Expected: PASS, twelve tests. `DeedTraded` is already in the reducer from Step 6, so no
reducer change is needed here — if the encumbrance test fails, the reducer is rebuilding
`state.futures` when it should be leaving it alone.

- [ ] **Step 21: Run all three property test files together**

Run: `npx vitest run packages/engine/src/contexts/board/`
Expected: PASS — `board.test.ts`, `rent.test.ts`, `markov.test.ts`, `building.test.ts`,
`mortgage.test.ts` and `trade.test.ts` all green. Tasks 5–7's movement and rent tests
must be untouched; if any now fails, `reduceProperty` is claiming an event it does not own.

- [ ] **Step 22: Commit trading**

```bash
git add packages/engine/src/contexts/board/
git commit -m "feat(board): two-sided deed and cash trades

Deeds and cash in any combination between any two players, both sides
confirming, in any Open phase. Encumbrances follow the deed because a rent
future references the deed rather than its owner. A deed with an outstanding
option or with buildings on it cannot be traded, and self-dealing is refused."
```

- [ ] **Step 23: Wire the markets ports into the root decider**

In `packages/engine/src/core/decide.ts`, bind the two markets functions once so no other
caller has to. `core/` is the composition root and is the only place permitted to import
two contexts that would otherwise cycle:

```ts
import type { PropertyPorts } from '../contexts/board/index.js'
import { decideProperty, type PropertyCommand } from '../contexts/board/index.js'
import { assertDeedTransferable, makeWholeOnMortgage } from '../contexts/markets/index.js'
import type { Rejection } from './errors.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

/** The live wiring. Task 20's driver must dispatch through this, not through the default. */
export const MARKET_PORTS: PropertyPorts = { makeWholeOnMortgage, assertDeedTransferable }

export function decidePropertyAction(
  state: GameState,
  command: PropertyCommand,
): readonly GameEvent[] | Rejection {
  return decideProperty(state, command, MARKET_PORTS)
}
```

If `core/decide.ts` does not yet exist — it is listed in the main plan's file structure
and written by no task, which is contradiction #2 in `parts/tasks-18-20.md` — create it
with exactly this content and nothing else. The full root dispatch belongs to whichever
task resolves the `kind`-versus-`type` discriminant split.

- [ ] **Step 24: Extend Task 20's boundary table**

In `packages/engine/tests/property/ledger.ts`, add the four bank-crossing events to
`BANK_CROSSING_EVENTS`:

```ts
  'HouseBuilt', 'HouseSold', 'DeedMortgaged', 'DeedUnmortgaged',
```

`DeedTraded` is deliberately absent: it moves cash between two players inside the pool
and crosses no boundary. `UNCONSERVED` stays empty — nothing in this task mints or
destroys money.

- [ ] **Step 25: Verify the toolchain and the line limits**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. Then confirm the split held:

```bash
wc -l packages/engine/src/contexts/board/*.ts
```

Expected: every file under 500 lines, with `decide-property.ts` the largest of the three
new ones at roughly 250. The `no-restricted-imports` rule must be clean, which is the
proof that `board` reaches `credit` only through its `index.ts` and reaches `markets`
not at all.

- [ ] **Step 26: Commit Task 21**

```bash
git add packages/engine/src/ packages/engine/tests/
git commit -m "feat(board): property actions - building, mortgaging and trading

Closes the largest gap in the plan set: HouseBuilt, HouseSold, DeedMortgaged,
DeedUnmortgaged and DeedTraded were declared in the event schema and owned by
no task, so the engine could not develop a property at all.

Every percentage routes through core/money.ts. Every bank-facing flow names
the Treasury as counterparty, so the Task 20 conservation property holds.
Building and unmortgaging are voluntary and therefore capped at the borrowing
base - they draw ordinary credit or are refused, and never capitalise."
```

---

## NEW EVENTS REQUIRED

**None.** All five events land exactly as Task 2 declared them, and that is worth
stating explicitly because the obvious objection is that `HouseBuilt` carries no
`hotel: boolean` and `DeedTraded` carries only one deed list.

**Why `HouseBuilt` and `HouseSold` need no hotel flag.** A reducer is a pure function of
`(state, event)`, and `state.deeds[event.deed].houses` is in scope. The event describes
*one building moving*; whether that building is the fifth, and therefore a hotel, is
already recorded on the deed. `supplyForBuild(deed.houses)` and
`supplyForSell(deed.houses)` read it. Adding a flag would create a second source of truth
for the same fact and a way for a hand-written log to disagree with itself.

**Why `DeedTraded` needs no second deed list.** Its shape,
`{ from, to, deeds, cash }`, is one *direction*: `from` hands `deeds` and `cash` to `to`.
A two-sided trade is two of these, emitted together by one decider call. This is
strictly better than widening the event, because it makes a gift, a cash-only payment
and a swap the same primitive, and because the reducer for one leg is trivially correct.

**One event this task deliberately does not emit: `ObligationCapitalised`.** Every action
here is voluntary. Spec 19.8 reserves uncapped capitalisation for automatic obligations,
and that asymmetry is the sole generator of margin calls. Any future edit that routes a
build or an unmortgage through `ObligationCapitalised` is a bug.

## CONTRACT ADDITIONS REQUIRED

**1. Four rejection codes** added to `RejectionCode` in `core/errors.ts` (Step 1):

| Code | Why no existing code fits |
|---|---|
| `NO_HOTELS_REMAINING` | `NO_HOUSES_REMAINING` already exists but the two supplies are independent — 32 and 12 — and a player denied a hotel while houses are plentiful needs to be told which shortage stopped them. |
| `DEED_DEVELOPED` | Spec 19.6 and the trade rule both refuse an action because buildings are standing. `UNEVEN_BUILD` is about the shape of a build; `DEED_ENCUMBERED` is about a contract. Neither says "strip it first". |
| `NOT_BUILDABLE` | Railroads and utilities have no rent table and no house cost. `INCOMPLETE_COLOUR_GROUP` would be a lie — the player may well own all four railroads. |
| `TRADE_NOT_CONFIRMED` | Both sides must confirm. `NOT_YOUR_TURN` is about phase ownership and would read as nonsense during a simultaneous Open phase. |

**2. `tests/property/ledger.ts` — `BANK_CROSSING_EVENTS` gains four members** (Step 24):
`HouseBuilt`, `HouseSold`, `DeedMortgaged`, `DeedUnmortgaged`. Task 20 wrote the table
before this task existed, so its coverage test currently cannot know these cross the bank
boundary. `UNCONSERVED` stays empty.

**3. `core/money.ts` has two conflicting definitions and must be reconciled.** Task 2
Step 2 creates it exporting `floorPercent` / `ceilPercent` / `floorPercentSum`. Task 9
Step 1 creates *the same file* exporting `applyRate` / `isWholeDollars`. Whichever lands
second silently overwrites the first. **Recommendation: delete `applyRate` and use
`floorPercent`.** They compute the same thing — the floor of `amount x rate` — by
different routes, and `floorPercent`'s integer-basis-point route is the one the global
constraint in the main plan names and the one the ESLint rule is written against. Every
`applyRate` call in Tasks 9–11 is a mechanical rename. `isWholeDollars` is orthogonal and
should be kept.

**4. `config/board.ts` Step 4 violates the percentage rule it is meant to embody.** Task 3
writes `Math.floor(standardHouseCost * ECONOMY.HOUSE_COST_MULTIPLIER)` — the exact pattern
the main plan's global constraint bans and the ESLint rule flags. It should read
`floorPercent(standardHouseCost, ECONOMY.HOUSE_COST_MULTIPLIER)`. The four products are
exact integers today, so the values do not change; the rule is unconditional so that a
retune to, say, 0.85 does not silently underpay. This task consumes `deed.houseCost` and
does not recompute it, so the fix belongs in Task 3.

**5. The `no-restricted-imports` pattern in Task 1 is too broad.** `**/contexts/*/*`
matches `../contexts/board/index.js`, so it would flag the legitimate index imports that
Tasks 5, 14, 15, 16 and this task all make. It needs to exclude the index — for example
`**/contexts/*/!(index).*` — or every context import in the plan set fails lint.

**6. Two exported-name collisions on the package surface,** both pre-existing and both
made visible by adding another `export *` to `contexts/board/index.ts`.
`prevailingRate` is exported by both `contexts/session` (Task 4) and `contexts/credit`
(Task 9); `rentRecipient` is exported by both `contexts/board/rent.ts` (Task 6) and
`contexts/markets/selectors.ts` (Task 14). `packages/engine/src/index.ts` re-exports all
of them with `export *`, which does not compile. This task avoids adding a third by
naming its ports default `NO_PROPERTY_ENCUMBRANCES`, but the other two still need a
merge decision.

**7. Command discriminant.** `PropertyCommand` uses `type`, per the constraint on this
task. `BoardCommand`, `SessionCommand`, `DraftCommand` and `DeckCommand` still use `kind`
and must be migrated before a root decider can dispatch across all of them. This is
contradiction #2 in `parts/tasks-18-20.md` and is not fixed here.

## JUDGMENT CALLS

| # | Question | Choice |
|---|---|---|
| 1 | Does spec 19.6 test the single deed or the whole colour group for buildings? | **The whole group.** The literal sentence is about one property, but building already requires a wholly-owned, wholly-unmortgaged group, and `rentDue`, `borrowingBase` and Task 10's `groupBuildingStrip` all assume buildings never sit on a group with a mortgaged member. Testing per-deed would let 1/0/0 become 1/0/mortgaged and break that invariant. The rejection message names the group and says the whole group must be stripped, which is what the player has to do anyway. |
| 2 | How does the even-build rule read as a predicate? | **Build only on a deed at the group minimum; sell only from one at the group maximum.** Equivalent to "no deed more than one ahead", but checkable in one comparison and symmetric, so both directions are one function each and both are tested. |
| 3 | What happens when a hotel is sold back and the bank has fewer than four houses? | **Refused, with `NO_HOUSES_REMAINING`.** A hotel is one hotel plus a claim on four houses; breaking it must take four real houses off the table or the supply invariant is violated. Refusing is thematically correct too — hoarding houses genuinely traps hotel owners in their hotels, which is the point of the shortage. The alternative, a 5-to-0 collapse in one command, would silently destroy the even-build shape. |
| 4 | Should building or unmortgaging draw credit automatically? | **Yes, but capped.** The task constraint says a voluntary action must be refused if unaffordable from clean cash plus headroom, which implies headroom is spendable. So the decider emits an ordinary `CreditDrawn` for exactly the shortfall and then the purchase. This reuses an existing event, respects the borrowing base, and keeps conservation trivially true. |
| 5 | Is the borrowing base read before or after the purchase? | **Before.** A house not yet built advances nothing, and a deed still mortgaged advances nothing. Reading after would let a player bootstrap a purchase out of the asset the purchase creates. The visible consequence — a player with one mortgaged deed and no cash can never redeem it — is correct and is asserted directly. |
| 6 | Should a trade auto-draw credit for its cash legs? | **No.** Two interdependent draws inside one atomic command make each side's affordability depend on the other's base, and a rejection message could not name a single cause. Trades take clean cash; a buyer who wants leverage issues `DrawCredit` first, in the same Open phase. `INSUFFICIENT_CLEAN_CASH` says so. |
| 7 | Where is trade confirmation held? | **On the command, as `confirmedBy`.** Negotiation is a table activity with no enforced timer (spec section 2), and the facilitator submits only a fully-agreed trade. Holding pending offers in `GameState` would add a shape to the contract, a phase-boundary expiry rule, and a way for a trade to survive a round it was never meant to. |
| 8 | Can a mortgaged deed be traded? | **Yes**, carrying its mortgage. Nothing in the spec forbids it, and it is a real move: handing a mortgaged deed to a player who can afford the 55% redemption is exactly the sort of liquidity trade the design wants. Only options and buildings block a trade. |
| 9 | In what order are make-whole events emitted relative to `DeedMortgaged`? | **Valued before, emitted after.** Task 14 requires the valuation to run against the pre-mortgage state, because a mortgaged deed collects no rent and would mark every contract at zero — the exact rug-pull spec section 6 closes. But at reduce time the owner needs the proceeds in hand before the make-whole is debited. Computing with the old state and sequencing after satisfies both, and is asserted by a port that checks `mortgaged === false` when called. |
| 10 | Does mortgaging need to flag a margin call? | **No.** Spec 19.1 step 10 flags margin calls at Settlement, and 19.8 makes liquidation a separate window. Mortgaging cuts the base immediately; the consequence surfaces at the next Settlement through Task 10's `flagMarginCalls`. Flagging here would double-flag. |
| 11 | Does this task compute the venture bonus suppression on a mortgaged deed? | **No — it falls out.** Spec 19.9 says a mortgaged deed charges no rent, so an Escort or Chop Shop bonus computed on it is zero. Task 6's `rentDue` already returns 0 for a mortgaged deed. The mortgage test asserts `rentDue === 0` rather than duplicating the rule in the underworld context. |
| 12 | Do the rates in this task actually trip IEEE 754? | **No — and it changes nothing.** Every face value and house cost on the board, at 0.5, 0.55 and 0.9, floors identically under naive multiplication. The mandate is still unconditional: the tests assert the decider's figure equals `floorPercent(...)` rather than a literal alone, so a retune to a rate that *does* trip it cannot pass silently. |
| 13 | Ports or a direct `markets` import? | **Ports.** `markets` imports `contexts/board/index.js` (Task 14 Step 3, for `landingProbability` and `rentFor`), so a direct import here closes an ESM cycle with a live-binding hazard on the `const` exports. Task 9 already established injection as the plan's answer to this exact shape with `CreditPorts`. The assumed markets signatures are stated verbatim in **Interfaces** so the merge is mechanical. |
| 14 | Which context owns these five events? | **`board`.** They write `deeds`, `housesRemaining`, `hotelsRemaining` and `treasury`, and `board` already owns the deed slice through rent and the Markov model. A separate `property` context would have to import `board` for `ownsWholeGroup` and be imported by `credit` for the strip, adding an edge to the dependency graph for no isolation gain. |
