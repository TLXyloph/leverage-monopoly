## Tasks 14-15

These two tasks build the entire `markets` bounded context. Task 14 is rent futures —
the centrepiece instrument of the game, per spec section 6 and the binding clarifications
in section 19.2. Task 15 is deed options, per spec section 9.

Both tasks code against the contract established in Tasks 1–2 of the main plan. No type
defined there is redefined here.

**Context layout produced across the two tasks:**

```
packages/engine/src/contexts/markets/
  index.ts                 public interface, the only file other contexts may import
  reduce.ts                rent-future events  (Task 14)
  reduce-options.ts        deed-option events  (Task 15)
  decide.ts                rent-future commands + settlement hooks  (Task 14)
  decide-options.ts        deed-option commands + settlement hooks  (Task 15)
  selectors.ts             routing, encumbrance, locks, mortgage impact  (both tasks)
  valuation.ts             Markov-driven expected value and percentiles  (Task 14)
  markets.test.ts          rent futures  (Task 14)
  markets-options.test.ts  deed options  (Task 15)
packages/engine/tests/fixtures/
  market-state.ts          shared GameState builder for both test files  (Task 14)
```

`decide.ts` and `reduce.ts` are split by instrument rather than kept as single files
because the combined rent-future and deed-option logic exceeds the 500-line limit.
`index.ts` re-exports both halves so the split is invisible to every other context.

---

### Task 14: `markets` context — rent futures

Spec sections 6, 12, 19.1 (step 1), 19.2 and 19.5 are binding on this task. Give it the
most care of any task in the plan: the futures market is the mechanism the entire design
uses to convert lumpy landing-based rent into a tradeable, priceable claim, and every
other Era III instrument either references it or pools it.

**Files:**
- Modify: `packages/engine/src/config/economy.ts`
- Create: `packages/engine/tests/fixtures/market-state.ts`
- Create: `packages/engine/src/contexts/markets/valuation.ts`
- Create: `packages/engine/src/contexts/markets/selectors.ts`
- Create: `packages/engine/src/contexts/markets/decide.ts`
- Create: `packages/engine/src/contexts/markets/reduce.ts`
- Create: `packages/engine/src/contexts/markets/index.ts`
- Test: `packages/engine/src/contexts/markets/markets.test.ts`

**Interfaces:**

- Consumes, from `packages/engine/src/core/` (Task 2), unchanged:

```ts
import type {
  ContractId, DeedId, DiceRoll, Money, PlayerId, RoundNumber, SquareIndex,
} from '../../core/types.js'
import type { DeedState, GameState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
```

- Consumes, from `packages/engine/src/contexts/board/index.js` — **assumed signatures,
  to be reconciled at merge with Tasks 5–7 in `parts/tasks-03-08.md`.** These three
  symbols are the *only* board symbols `markets` touches:

```ts
/**
 * Task 7 — Markov landing model. Probability that a single die roll by a single
 * token ends resting on `square`, from the 120-state (square, consecutiveDoubles)
 * stationary distribution. Reproduces tests/fixtures/landing-probabilities.json.
 * Square 30 returns exactly 0.
 */
export function landingProbability(state: GameState, square: SquareIndex): number

/** Task 6 — rent chargeable on `deed` at its present development, for a given roll. */
export function rentFor(state: GameState, deed: DeedId, dice: DiceRoll): Money

/** Task 5 — [3, 4]. The modal 2d6 total. Used to value utilities without a live roll. */
export const MEAN_DICE: DiceRoll
```

- Consumes, from `packages/engine/src/contexts/credit/index.js` — assumed signature, to
  be reconciled with Tasks 9–10:

```ts
/** 75% of unmortgaged deed face + 50% of building cost, halved if creditImpaired. */
export function borrowingBase(state: GameState, player: PlayerId): Money
```

- Produces, exported from `packages/engine/src/contexts/markets/index.ts`:

```ts
// valuation.ts
export interface FutureValuation {
  readonly deed: DeedId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
  readonly landingProbability: number
  readonly expectedHitsPerRound: number
  readonly roundsRemaining: number
  readonly expectedHits: number
  readonly rentAtCurrentDevelopment: Money
  readonly expectedValue: Money
  readonly p10: Money
  readonly p90: Money
}
export function expectedHitsPerRound(perRollProbability: number): number
export function roundsRemaining(current: RoundNumber, start: RoundNumber, end: RoundNumber): number
export function poissonQuantile(lambda: number, q: number): number
export function valueWindow(
  state: GameState, deed: DeedId, startRound: RoundNumber, endRound: RoundNumber,
): FutureValuation
export function valueRentFuture(state: GameState, id: ContractId): FutureValuation | null
export function markRentFuture(state: GameState, id: ContractId): Money

// selectors.ts
export interface RentPayment {
  readonly payer: PlayerId
  readonly recipient: PlayerId
  readonly amount: Money
  readonly contract: ContractId | null
}
export interface MortgageImpact {
  readonly proceeds: Money
  readonly makeWhole: Money
  readonly baseAfter: Money
  readonly drawn: Money
  readonly marginCalled: boolean
}
export function futureFor(state: GameState, deed: DeedId): RentFuture | null
export function routingFutureFor(state: GameState, deed: DeedId): RentFuture | null
export function isEncumbered(state: GameState, deed: DeedId): boolean
export function rentRecipient(state: GameState, deed: DeedId): PlayerId | null
export function rentPayment(
  state: GameState, deed: DeedId, lander: PlayerId, amount: Money,
): RentPayment | null
export function rentEvents(
  state: GameState, deed: DeedId, lander: PlayerId, amount: Money,
): readonly GameEvent[]
export function mortgageImpact(state: GameState, deed: DeedId): MortgageImpact

// decide.ts
export type MarketsCommand = OriginateRentFuture | SellRentFuture
export function rentFutureId(deed: DeedId, start: RoundNumber, end: RoundNumber): ContractId
export function decideMarkets(
  state: GameState, cmd: MarketsCommand,
): readonly GameEvent[] | Rejection
export function expireRentFutures(state: GameState): readonly GameEvent[]
export function makeWholeOnMortgage(state: GameState, deed: DeedId): readonly GameEvent[]

// reduce.ts
export function reduceMarkets(state: GameState, event: GameEvent): GameState
```

**Rounding.** Every money figure this task produces is `Math.floor`ed:
`expectedValue`, `p10`, `p90`, `markRentFuture`, the make-whole amount (which *is*
`markRentFuture`), and the mortgage proceeds inside `mortgageImpact`. No other rounding
direction appears anywhere in the task.

**Callers this task does not own.** Three hooks are exported for other contexts' pipelines:
`rentEvents` is called by board's landing resolution instead of emitting `RentCharged`
directly; `expireRentFutures` is called at Settlement **step 1** (spec 19.1);
`makeWholeOnMortgage` is called by the mortgage decider (Task 9/10, `credit`) against the
state as it stands **before** `DeedMortgaged` is applied.

**Era gating is not this task's job.** `core/decide.ts` applies the unlock table produced
by Task 4 (`session`) before dispatching to `markets`, so `INSTRUMENT_LOCKED_THIS_ERA` is
never returned from any file in this context. Doing the gate here would require `markets`
to import `session`, which the dependency graph in spec section 14 forbids.

---

- [ ] **Step 1: Add the rent-futures valuation constants to `config/economy.ts`**

`MAX_FUTURE_WINDOW` already exists from Task 2. Add four more inside the `ECONOMY` object
literal, immediately after it. Every number in this task comes from here:

```ts
  /** Rent future windows may not exceed this many rounds. */
  MAX_FUTURE_WINDOW: 8,

  /**
   * Players who can owe rent on a deed: all four minus its owner, who owes
   * nothing. The per-roll landing probability is multiplied by this to reach
   * expected hits per round. Spec 19.2.
   */
  RENT_OBLIGORS: 3,

  /**
   * Correction for the extra rolls doubles generate. Spec 19.2 fixes it at 1.19.
   */
  DOUBLES_ROLL_MULTIPLIER: 1.19,

  /** Outcome band displayed beside expected value on every valuation. Spec section 6. */
  VALUATION_PERCENTILE_LOW: 0.1,
  VALUATION_PERCENTILE_HIGH: 0.9,
```

- [ ] **Step 2: Create the shared test state builder**

`packages/engine/tests/fixtures/market-state.ts`. Task 15's test file imports the same
builder, so it lives under `tests/fixtures/` rather than inside a `.test.ts`:

```ts
import type { Money, PlayerId, RoundNumber } from '../../src/core/types.js'
import type {
  DeedState, GameConfig, GameState, PlayerState,
} from '../../src/core/state.js'

export function testPlayer(id: PlayerId, cleanCash: Money): PlayerState {
  return {
    id,
    cleanCash,
    dirtyCash: 0,
    heat: 0,
    position: 0,
    inJail: false,
    drawnCredit: 0,
    distressedDebt: 0,
    creditImpaired: false,
    ventures: [],
    draftBudget: 0,
    marginCallFlaggedAt: null,
    launderedThisPhase: false,
    briberyUsedThisRound: false,
  }
}

/** St. James Place. Square 16, orange, the group with the highest traffic per square. */
export function stJames(owner: PlayerId | null): DeedState {
  return {
    id: 'st-james-place',
    square: 16,
    group: 'orange',
    faceValue: 180,
    houseCost: 100,
    rentTable: [14, 70, 200, 550, 750, 950],
    owner,
    mortgaged: false,
    houses: 0,
  }
}

/** Boardwalk. Square 39, dark blue, the least-trafficked group on the board. */
export function boardwalk(owner: PlayerId | null): DeedState {
  return {
    id: 'boardwalk',
    square: 39,
    group: 'dark-blue',
    faceValue: 400,
    houseCost: 200,
    rentTable: [50, 200, 600, 1400, 1700, 2000],
    owner,
    mortgaged: false,
    houses: 0,
  }
}

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

export interface TestStateOverrides {
  readonly round?: RoundNumber
  readonly phase?: GameState['phase']
  readonly deeds?: Readonly<Record<string, DeedState>>
  readonly cash?: Readonly<Partial<Record<PlayerId, Money>>>
  readonly futures?: GameState['futures']
  readonly options?: GameState['options']
}

export function testState(overrides: TestStateOverrides = {}): GameState {
  const cash = overrides.cash ?? {}
  return {
    config: CONFIG,
    phase: overrides.phase ?? 'open',
    round: overrides.round ?? 8,
    era: 2,
    activePlayer: null,
    players: {
      P1: testPlayer('P1', cash.P1 ?? 1000),
      P2: testPlayer('P2', cash.P2 ?? 1000),
      P3: testPlayer('P3', cash.P3 ?? 1000),
      P4: testPlayer('P4', cash.P4 ?? 1000),
    },
    deeds: overrides.deeds ?? { 'st-james-place': stJames('P1') },
    treasury: 0,
    housesRemaining: 32,
    hotelsRemaining: 12,
    draft: null,
    futures: overrides.futures ?? [],
    options: overrides.options ?? [],
    loans: [],
    pools: [],
    swaps: [],
    decks: {
      1: { order: [], drawn: 0 },
      2: { order: [], drawn: 0 },
      3: { order: [], drawn: 0 },
      4: { order: [], drawn: 0 },
    },
  }
}
```

- [ ] **Step 3: Write the failing test for the valuation kernel**

`packages/engine/src/contexts/markets/markets.test.ts`. The three kernel functions are
exported separately from `valueWindow` precisely so they can be asserted against
hand-computed figures rather than against the implementation:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import {
  expectedHitsPerRound, poissonQuantile, roundsRemaining,
} from './valuation.js'

describe('rent future valuation kernel', () => {
  it('converts a per-roll probability to expected hits per round (spec 19.2)', () => {
    // 0.02 per roll x 3 obligors x 1.19 doubles correction = 0.0714
    expect(expectedHitsPerRound(0.02)).toBeCloseTo(0.0714, 10)
    expect(ECONOMY.RENT_OBLIGORS).toBe(3)
    expect(ECONOMY.DOUBLES_ROLL_MULTIPLIER).toBe(1.19)
  })

  it('returns zero expected hits for a square that cannot be rested on', () => {
    expect(expectedHitsPerRound(0)).toBe(0)
  })

  it('counts the current round as still live and clamps a lapsed window to zero', () => {
    expect(roundsRemaining(3, 5, 12)).toBe(8)
    expect(roundsRemaining(7, 5, 12)).toBe(6)
    expect(roundsRemaining(12, 5, 12)).toBe(1)
    expect(roundsRemaining(13, 5, 12)).toBe(0)
    expect(roundsRemaining(20, 5, 12)).toBe(0)
  })

  it('computes exact Poisson quantiles for the outcome band', () => {
    expect(poissonQuantile(0, 0.1)).toBe(0)
    expect(poissonQuantile(0, 0.9)).toBe(0)

    // lambda = 2: cdf 0.13534, 0.40601, 0.67668, 0.85713, 0.94735
    expect(poissonQuantile(2, ECONOMY.VALUATION_PERCENTILE_LOW)).toBe(0)
    expect(poissonQuantile(2, ECONOMY.VALUATION_PERCENTILE_HIGH)).toBe(4)

    // lambda = 5: cdf reaches 0.12465 at k=2 and 0.93191 at k=8
    expect(poissonQuantile(5, ECONOMY.VALUATION_PERCENTILE_LOW)).toBe(2)
    expect(poissonQuantile(5, ECONOMY.VALUATION_PERCENTILE_HIGH)).toBe(8)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: FAIL — cannot resolve `./valuation.js`.

- [ ] **Step 5: Write the valuation kernel**

`packages/engine/src/contexts/markets/valuation.ts`:

```ts
import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import { MEAN_DICE, landingProbability, rentFor } from '../board/index.js'

/**
 * Loop guard on the Poisson series. Not an economic constant: lambda in this game
 * never exceeds about 2.5 (an 8-round window on the busiest square is 0.78), so the
 * CDF reaches 1 far below k = 64. The guard exists only so the loop is provably total.
 */
const POISSON_MAX_K = 64

export interface FutureValuation {
  readonly deed: DeedId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
  /** Per roll, per token, from the Markov chain. Spec section 20. */
  readonly landingProbability: number
  readonly expectedHitsPerRound: number
  readonly roundsRemaining: number
  readonly expectedHits: number
  readonly rentAtCurrentDevelopment: Money
  readonly expectedValue: Money
  readonly p10: Money
  readonly p90: Money
}

/**
 * Spec 19.2. Per-roll landing probability x the three players who can owe rent
 * x 1.19 for the extra rolls doubles generate.
 */
export function expectedHitsPerRound(perRollProbability: number): number {
  return perRollProbability * ECONOMY.RENT_OBLIGORS * ECONOMY.DOUBLES_ROLL_MULTIPLIER
}

/**
 * Rounds in which rent can still route, counting the current round as live.
 * A future expires at Settlement step 1 of its end round, which is after that
 * round's Movement phase, so the end round itself always still pays.
 */
export function roundsRemaining(
  current: RoundNumber,
  start: RoundNumber,
  end: RoundNumber,
): number {
  const first = Math.max(current, start)
  if (first > end) return 0
  return end - first + 1
}

/** Smallest k with P(X <= k) >= q for X ~ Poisson(lambda). Exact, by summation. */
export function poissonQuantile(lambda: number, q: number): number {
  if (lambda <= 0) return 0
  let k = 0
  let term = Math.exp(-lambda)
  let cdf = term
  while (cdf < q && k < POISSON_MAX_K) {
    k += 1
    term = (term * lambda) / k
    cdf += term
  }
  return k
}

function emptyValuation(
  deed: DeedId, startRound: RoundNumber, endRound: RoundNumber, rounds: number,
): FutureValuation {
  return {
    deed,
    startRound,
    endRound,
    landingProbability: 0,
    expectedHitsPerRound: 0,
    roundsRemaining: rounds,
    expectedHits: 0,
    rentAtCurrentDevelopment: 0,
    expectedValue: 0,
    p10: 0,
    p90: 0,
  }
}

/**
 * Values any window on any deed, whether or not a contract exists. This is the
 * figure spec section 6 requires the app to display for every property, so that
 * no player ever computes it by hand.
 */
export function valueWindow(
  state: GameState,
  deed: DeedId,
  startRound: RoundNumber,
  endRound: RoundNumber,
): FutureValuation {
  const rounds = roundsRemaining(state.round, startRound, endRound)
  const d = state.deeds[deed]
  if (d === undefined || d.mortgaged) {
    return emptyValuation(deed, startRound, endRound, rounds)
  }
  const p = landingProbability(state, d.square)
  const perRound = expectedHitsPerRound(p)
  const hits = perRound * rounds
  const rent = rentFor(state, deed, MEAN_DICE)
  return {
    deed,
    startRound,
    endRound,
    landingProbability: p,
    expectedHitsPerRound: perRound,
    roundsRemaining: rounds,
    expectedHits: hits,
    rentAtCurrentDevelopment: rent,
    expectedValue: Math.floor(hits * rent),
    p10: Math.floor(poissonQuantile(hits, ECONOMY.VALUATION_PERCENTILE_LOW) * rent),
    p90: Math.floor(poissonQuantile(hits, ECONOMY.VALUATION_PERCENTILE_HIGH) * rent),
  }
}

export function valueRentFuture(state: GameState, id: ContractId): FutureValuation | null {
  const f = state.futures.find((x) => x.id === id)
  if (f === undefined) return null
  return valueWindow(state, f.deed, f.startRound, f.endRound)
}

/**
 * The single figure used for both the spec section 12 mark-to-model and the
 * spec section 6 make-whole payment. They are the same number by definition:
 * the contract's remaining expected value.
 */
export function markRentFuture(state: GameState, id: ContractId): Money {
  return valueRentFuture(state, id)?.expectedValue ?? 0
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: PASS, four tests.

- [ ] **Step 7: Commit the valuation kernel**

```bash
git add packages/engine/src/config/economy.ts \
        packages/engine/tests/fixtures/market-state.ts \
        packages/engine/src/contexts/markets/
git commit -m "feat(markets): rent future valuation kernel

Converts per-roll Markov landing probabilities to expected hits per round
by the spec 19.2 factors: 3 obligors and a 1.19 doubles correction. Outcome
band is exact Poisson quantiles at the 10th and 90th percentiles."
```

- [ ] **Step 8: Write the failing test for end-to-end valuation**

Append to `markets.test.ts`. St. James Place is used because its golden-fixture
probability, 0.027146, is stated in spec section 20 and is therefore an independent
check on Task 7:

```ts
import { landingProbability } from '../board/index.js'
import { stJames, testState } from '../../../tests/fixtures/market-state.js'
import { valueWindow, valueRentFuture, markRentFuture } from './valuation.js'

describe('rent future valuation, end to end', () => {
  it('prices a full 8-round window on an undeveloped St. James Place', () => {
    const state = testState({ round: 4 })

    // Golden fixture, spec section 20. If Task 7 drifts, this is the tripwire.
    expect(landingProbability(state, 16)).toBeCloseTo(0.027146, 6)

    const v = valueWindow(state, 'st-james-place', 5, 12)
    expect(v.roundsRemaining).toBe(8)
    expect(v.expectedHitsPerRound).toBeCloseTo(0.09691122, 8)
    expect(v.expectedHits).toBeCloseTo(0.77528976, 8)
    expect(v.rentAtCurrentDevelopment).toBe(14)
    // floor(0.77528976 x 14) = floor(10.854) = 10
    expect(v.expectedValue).toBe(10)
    // Poisson(0.7753): cdf(0) = 0.4606 >= 0.10, cdf(2) = 0.9561 >= 0.90
    expect(v.p10).toBe(0)
    expect(v.p90).toBe(28)
  })

  it('values a mortgaged deed at zero, since it collects no rent', () => {
    const state = testState({
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
      round: 4,
    })
    const v = valueWindow(state, 'st-james-place', 5, 12)
    expect(v.expectedValue).toBe(0)
    expect(v.p90).toBe(0)
    expect(v.rentAtCurrentDevelopment).toBe(0)
  })

  it('shrinks the value as the window burns down', () => {
    const early = valueWindow(testState({ round: 5 }), 'st-james-place', 5, 12)
    const late = valueWindow(testState({ round: 11 }), 'st-james-place', 5, 12)
    const done = valueWindow(testState({ round: 13 }), 'st-james-place', 5, 12)
    expect(early.expectedValue).toBeGreaterThan(late.expectedValue)
    expect(done.expectedValue).toBe(0)
    expect(done.roundsRemaining).toBe(0)
  })

  it('marks an outstanding contract at its remaining expected value', () => {
    const state = testState({
      round: 6,
      futures: [{
        id: 'rf:st-james-place:5-12',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 5,
        endRound: 12,
      }],
    })
    const v = valueRentFuture(state, 'rf:st-james-place:5-12')
    expect(v?.roundsRemaining).toBe(7)
    expect(markRentFuture(state, 'rf:st-james-place:5-12')).toBe(v?.expectedValue)
    expect(markRentFuture(state, 'rf:nonexistent:1-2')).toBe(0)
  })
})
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: FAIL — `../board/index.js` does not yet export `landingProbability`, `rentFor`
and `MEAN_DICE` under those names, or the golden probability does not match.
If it fails only on the import, Tasks 5–7 are not merged yet; stop and reconcile the
three assumed board signatures listed in the Interfaces block above before continuing.

- [ ] **Step 10: Run it again after reconciling board's exports and verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: PASS, eight tests. No implementation change is needed — `valuation.ts` from
Step 5 already covers these cases.

- [ ] **Step 11: Commit**

```bash
git add packages/engine/src/contexts/markets/markets.test.ts
git commit -m "test(markets): assert valuation against the golden landing fixture

St. James Place at 0.027146 per roll over an 8-round window prices at \$10
undeveloped, with a 10th-90th band of \$0 to \$28."
```

- [ ] **Step 12: Write the failing test for origination validation**

Append to `markets.test.ts`. Every rule in spec section 6 gets its own assertion:

```ts
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import { decideMarkets, rentFutureId } from './decide.js'
import { boardwalk } from '../../../tests/fixtures/market-state.js'

function originate(over: Partial<Parameters<typeof decideMarkets>[1]> = {}) {
  return {
    type: 'OriginateRentFuture' as const,
    player: 'P1' as const,
    deed: 'st-james-place',
    holder: 'P2' as const,
    startRound: 9,
    endRound: 16,
    price: 120,
    ...over,
  }
}

describe('rent future origination', () => {
  it('emits an origination event for a valid contract', () => {
    const result = decideMarkets(testState({ round: 8 }), originate())
    expect(isRejection(result)).toBe(false)
    expect(result).toEqual([{
      type: 'RentFutureOriginated',
      id: rentFutureId('st-james-place', 9, 16),
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
      price: 120,
    }])
  })

  it('rejects origination outside an Open phase', () => {
    const r = decideMarkets(testState({ round: 8, phase: 'settlement' }), originate())
    expect(r).toMatchObject({ rejected: true, code: 'WRONG_PHASE' })
  })

  it('rejects a player who does not own the deed', () => {
    const r = decideMarkets(testState({ round: 8 }), originate({ player: 'P3' }))
    expect(r).toMatchObject({ rejected: true, code: 'NOT_OWNER' })
  })

  it('rejects origination on a mortgaged property', () => {
    const state = testState({
      round: 8,
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
    })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_MORTGAGED' })
  })

  it('allows at most one active contract per property', () => {
    const state = testState({
      round: 8,
      futures: [{
        id: 'rf:st-james-place:9-10',
        deed: 'st-james-place',
        holder: 'P4',
        startRound: 9,
        endRound: 10,
      }],
    })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('requires the window to begin after the round of origination', () => {
    const state = testState({ round: 8 })
    expect(decideMarkets(state, originate({ startRound: 8, endRound: 12 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideMarkets(state, originate({ startRound: 9, endRound: 12 }))))
      .toBe(false)
  })

  it('caps the window at MAX_FUTURE_WINDOW rounds', () => {
    const state = testState({ round: 8 })
    const maxEnd = 9 + ECONOMY.MAX_FUTURE_WINDOW - 1
    expect(isRejection(decideMarkets(state, originate({ startRound: 9, endRound: maxEnd }))))
      .toBe(false)
    expect(decideMarkets(state, originate({ startRound: 9, endRound: maxEnd + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
  })

  it('requires the window to end by the final round', () => {
    const state = testState({ round: 20 })
    expect(decideMarkets(state, originate({ startRound: 21, endRound: ECONOMY.TOTAL_ROUNDS + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideMarkets(
      state, originate({ startRound: 21, endRound: ECONOMY.TOTAL_ROUNDS }),
    ))).toBe(false)
  })

  it('rejects an inverted window', () => {
    expect(decideMarkets(testState({ round: 8 }), originate({ startRound: 14, endRound: 12 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
  })

  it('rejects a buyer who cannot pay the negotiated price', () => {
    const state = testState({ round: 8, cash: { P2: 100 } })
    expect(decideMarkets(state, originate({ price: 120 })))
      .toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('rejects a negative price and rejects selling a future to yourself', () => {
    const state = testState({ round: 8 })
    expect(decideMarkets(state, originate({ price: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideMarkets(state, originate({ holder: 'P1' })))
      .toMatchObject({ rejected: true, code: 'SELF_DEALING' })
  })

  it('rejects an unknown deed', () => {
    const state = testState({ round: 8, deeds: { boardwalk: boardwalk('P1') } })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_UNAVAILABLE' })
  })
})
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: FAIL — cannot resolve `./decide.js`.

- [ ] **Step 14: Write `selectors.ts` with the encumbrance reads**

`packages/engine/src/contexts/markets/selectors.ts`. Two distinct notions of "has a
contract" are needed and conflating them is the easiest bug in this task:

```ts
import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'
import type { GameState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { borrowingBase } from '../credit/index.js'
import { markRentFuture } from './valuation.js'

/**
 * The outstanding contract on this deed, whether or not its window has opened.
 * Expired contracts are removed at Settlement step 1, so anything in state.futures
 * is by definition still outstanding. This is the encumbrance test.
 */
export function futureFor(state: GameState, deed: DeedId): RentFuture | null {
  return state.futures.find((f) => f.deed === deed) ?? null
}

/** The contract currently routing rent, i.e. whose window covers the current round. */
export function routingFutureFor(state: GameState, deed: DeedId): RentFuture | null {
  const f = futureFor(state, deed)
  if (f === null) return null
  return state.round >= f.startRound && state.round <= f.endRound ? f : null
}

export function isEncumbered(state: GameState, deed: DeedId): boolean {
  return futureFor(state, deed) !== null
}

/** Who receives rent charged on this deed right now. Spec 19.2. */
export function rentRecipient(state: GameState, deed: DeedId): PlayerId | null {
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank') return null
  const routing = routingFutureFor(state, deed)
  return routing !== null ? routing.holder : d.owner
}

export interface RentPayment {
  readonly payer: PlayerId
  readonly recipient: PlayerId
  readonly amount: Money
  readonly contract: ContractId | null
}

/**
 * Resolves a landing into a payment, or into no payment at all. Spec 19.2 names
 * exactly two cases in which nothing moves:
 *   - the deed's owner lands on it and owes nothing;
 *   - the futures holder lands on a deed they do not own, and would otherwise
 *     owe rent to themselves.
 */
export function rentPayment(
  state: GameState,
  deed: DeedId,
  lander: PlayerId,
  amount: Money,
): RentPayment | null {
  const d = state.deeds[deed]
  if (d === undefined || d.mortgaged) return null
  if (d.owner === null || d.owner === 'bank') return null
  if (d.owner === lander) return null
  const recipient = rentRecipient(state, deed)
  if (recipient === null || recipient === lander) return null
  if (amount <= 0) return null
  return {
    payer: lander,
    recipient,
    amount,
    contract: routingFutureFor(state, deed)?.id ?? null,
  }
}

/**
 * The single entry point board's landing resolution calls instead of emitting
 * RentCharged itself. RentCharged.to is always the actual recipient; the deed's
 * owner, which is what ventures key off per spec 19.5, is read from the deed.
 * RentRoutedToFuture carries no money — it attributes the cashflow to the
 * contract so pooled futures can be settled in the Task 16 waterfall.
 */
export function rentEvents(
  state: GameState,
  deed: DeedId,
  lander: PlayerId,
  amount: Money,
): readonly GameEvent[] {
  const p = rentPayment(state, deed, lander, amount)
  if (p === null) return []
  const events: GameEvent[] = [
    { type: 'RentCharged', from: p.payer, to: p.recipient, deed, amount: p.amount },
  ]
  if (p.contract !== null) {
    events.push({
      type: 'RentRoutedToFuture',
      contract: p.contract,
      holder: p.recipient,
      amount: p.amount,
    })
  }
  return events
}

export interface MortgageImpact {
  readonly proceeds: Money
  readonly makeWhole: Money
  readonly baseAfter: Money
  readonly drawn: Money
  readonly marginCalled: boolean
}

/**
 * Everything the assist panel needs to render the spec section 14 warning
 * "mortgaging this triggers a margin call", including the make-whole a rent
 * future would cost. Pure: builds a hypothetical mortgaged state and asks credit.
 */
export function mortgageImpact(state: GameState, deed: DeedId): MortgageImpact {
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank' || d.mortgaged) {
    return { proceeds: 0, makeWhole: 0, baseAfter: 0, drawn: 0, marginCalled: false }
  }
  const owner = d.owner
  const f = futureFor(state, deed)
  const after: GameState = {
    ...state,
    deeds: { ...state.deeds, [deed]: { ...d, mortgaged: true } },
  }
  const baseAfter = borrowingBase(after, owner)
  const drawn = state.players[owner].drawnCredit
  return {
    proceeds: Math.floor(d.faceValue * ECONOMY.MORTGAGE_RATE),
    makeWhole: f === null ? 0 : markRentFuture(state, f.id),
    baseAfter,
    drawn,
    marginCalled: drawn > baseAfter,
  }
}
```

- [ ] **Step 15: Write `decide.ts` with origination and resale**

`packages/engine/src/contexts/markets/decide.ts`:

```ts
import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { futureFor } from './selectors.js'
import { markRentFuture } from './valuation.js'

export interface OriginateRentFuture {
  readonly type: 'OriginateRentFuture'
  readonly player: PlayerId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
  readonly price: Money
}

export interface SellRentFuture {
  readonly type: 'SellRentFuture'
  readonly player: PlayerId
  readonly contract: ContractId
  readonly to: PlayerId
  readonly price: Money
}

export type MarketsCommand = OriginateRentFuture | SellRentFuture

/**
 * Deterministic identity. No Math.random anywhere in the engine, so contract ids
 * are derived. (deed, startRound, endRound) is unique for all time: a second
 * contract on the same deed can only be originated once the first has expired,
 * and its start round must then exceed the first contract's end round.
 */
export function rentFutureId(
  deed: DeedId, start: RoundNumber, end: RoundNumber,
): ContractId {
  return `rf:${deed}:${start}-${end}`
}

function decideOriginate(
  state: GameState, cmd: OriginateRentFuture,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Rent futures can only be originated during an Open phase.')
  }
  const deed = state.deeds[cmd.deed]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${cmd.deed}.`)
  }
  if (deed.owner !== cmd.player) {
    return reject('NOT_OWNER', 'Only the owner of a deed may originate a rent future on it.')
  }
  if (deed.mortgaged) {
    return reject(
      'DEED_MORTGAGED',
      'A mortgaged property collects no rent, so it cannot originate a rent future.',
    )
  }
  if (futureFor(state, cmd.deed) !== null) {
    return reject('DEED_ENCUMBERED', 'This property already has an outstanding rent future.')
  }
  if (cmd.holder === cmd.player) {
    return reject('SELF_DEALING', 'A rent future must be sold to another player.')
  }
  const length = cmd.endRound - cmd.startRound + 1
  if (
    cmd.startRound <= state.round ||
    cmd.endRound < cmd.startRound ||
    cmd.endRound > ECONOMY.TOTAL_ROUNDS ||
    length > ECONOMY.MAX_FUTURE_WINDOW
  ) {
    return reject(
      'INVALID_WINDOW',
      `The window must start after round ${state.round}, run at most ` +
      `${ECONOMY.MAX_FUTURE_WINDOW} rounds, and end by round ${ECONOMY.TOTAL_ROUNDS}.`,
    )
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.holder].cleanCash < cmd.price) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.holder} holds $${state.players[cmd.holder].cleanCash} in clean cash ` +
      `and the price is $${cmd.price}.`,
    )
  }
  const id = rentFutureId(cmd.deed, cmd.startRound, cmd.endRound)
  if (state.futures.some((f) => f.id === id)) {
    return reject('DUPLICATE_CONTRACT_ID', 'A contract with this identity already exists.')
  }
  return [{
    type: 'RentFutureOriginated',
    id,
    deed: cmd.deed,
    holder: cmd.holder,
    startRound: cmd.startRound,
    endRound: cmd.endRound,
    price: cmd.price,
  }]
}

function decideSell(
  state: GameState, cmd: SellRentFuture,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Rent futures can only be resold during an Open phase.')
  }
  const f = state.futures.find((x) => x.id === cmd.contract)
  if (f === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That rent future is no longer outstanding.')
  }
  if (f.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a rent future may resell it.')
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A rent future must be sold to another player.')
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.to].cleanCash < cmd.price) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.to} cannot cover a price of $${cmd.price}.`,
    )
  }
  return [{
    type: 'RentFutureSold', id: f.id, from: cmd.player, to: cmd.to, price: cmd.price,
  }]
}

export function decideMarkets(
  state: GameState, cmd: MarketsCommand,
): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'OriginateRentFuture': return decideOriginate(state, cmd)
    case 'SellRentFuture': return decideSell(state, cmd)
  }
}

/** Settlement step 1, spec 19.1. Futures reaching their end round expire. */
export function expireRentFutures(state: GameState): readonly GameEvent[] {
  return state.futures
    .filter((f) => f.endRound <= state.round)
    .map((f): GameEvent => ({ type: 'RentFutureExpired', id: f.id }))
}

/**
 * Spec section 6. Mortgaging an encumbered property owes the holder the contract's
 * remaining expected value and terminates the contract. Called by the mortgage
 * decider against the state BEFORE DeedMortgaged is applied, because a mortgaged
 * deed values at zero; the mortgage proceeds are added in here so the shortfall
 * test is against the cash the owner will actually have.
 */
export function makeWholeOnMortgage(
  state: GameState, deed: DeedId,
): readonly GameEvent[] {
  const f = futureFor(state, deed)
  if (f === null) return []
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank') return []
  if (d.owner === f.holder) {
    return [{ type: 'RentFutureExpired', id: f.id }]
  }
  const amount = markRentFuture(state, f.id)
  const events: GameEvent[] = [{ type: 'RentFutureMadeWhole', id: f.id, amount }]
  const cashAfterMortgage =
    state.players[d.owner].cleanCash + Math.floor(d.faceValue * ECONOMY.MORTGAGE_RATE)
  const shortfall = amount - cashAfterMortgage
  if (shortfall > 0) {
    events.push({ type: 'DistressedDebtIncurred', player: d.owner, amount: shortfall })
  }
  events.push({ type: 'RentFutureExpired', id: f.id })
  return events
}
```

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: PASS, twenty tests.

- [ ] **Step 17: Commit origination**

```bash
git add packages/engine/src/contexts/markets/
git commit -m "feat(markets): rent future origination and resale deciders

Enforces every rule in spec section 6: owner-only origination, no mortgaged
originator, one active contract per property, windows of at most
MAX_FUTURE_WINDOW rounds starting after origination and ending by round 24."
```

- [ ] **Step 18: Write the failing test for the reducer**

Append to `markets.test.ts`:

```ts
import { reduceMarkets } from './reduce.js'

describe('rent future reducer', () => {
  it('records the contract and moves the price from holder to owner', () => {
    const before = testState({ round: 8, cash: { P1: 500, P2: 500 } })
    const after = reduceMarkets(before, {
      type: 'RentFutureOriginated',
      id: 'rf:st-james-place:9-16',
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
      price: 120,
    })
    expect(after.futures).toEqual([{
      id: 'rf:st-james-place:9-16',
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
    }])
    expect(after.players.P1.cleanCash).toBe(620)
    expect(after.players.P2.cleanCash).toBe(380)
  })

  it('transfers the holder and the price on resale', () => {
    const before = testState({
      round: 10,
      cash: { P2: 500, P3: 500 },
      futures: [{
        id: 'rf:st-james-place:9-16',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 9,
        endRound: 16,
      }],
    })
    const after = reduceMarkets(before, {
      type: 'RentFutureSold', id: 'rf:st-james-place:9-16', from: 'P2', to: 'P3', price: 75,
    })
    expect(after.futures[0]?.holder).toBe('P3')
    expect(after.players.P2.cleanCash).toBe(575)
    expect(after.players.P3.cleanCash).toBe(425)
  })

  it('removes the contract on expiry and leaves cash untouched', () => {
    const before = testState({
      round: 16,
      futures: [{
        id: 'rf:st-james-place:9-16',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 9,
        endRound: 16,
      }],
    })
    const after = reduceMarkets(before, {
      type: 'RentFutureExpired', id: 'rf:st-james-place:9-16',
    })
    expect(after.futures).toEqual([])
    expect(after.players.P2.cleanCash).toBe(before.players.P2.cleanCash)
  })

  it('treats RentRoutedToFuture as an attribution marker that moves no money', () => {
    const before = testState({ round: 10 })
    const after = reduceMarkets(before, {
      type: 'RentRoutedToFuture',
      contract: 'rf:st-james-place:9-16',
      holder: 'P2',
      amount: 200,
    })
    expect(after).toBe(before)
  })

  it('ignores events belonging to other contexts', () => {
    const before = testState({ round: 10 })
    expect(reduceMarkets(before, { type: 'SalaryPaid', player: 'P1', amount: 350 }))
      .toBe(before)
  })
})
```

- [ ] **Step 19: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: FAIL — cannot resolve `./reduce.js`.

- [ ] **Step 20: Write `reduce.ts`**

`packages/engine/src/contexts/markets/reduce.ts`:

```ts
import type { Money, PlayerId } from '../../core/types.js'
import type { GameState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'

/**
 * Moves clean cash. The payee is made whole; the payer is floored at zero,
 * because clean cash never goes negative. Any shortfall is carried by the
 * paired DistressedDebtIncurred event that markets emits alongside, so the
 * Task 20 conservation identity must count distressed debt as issued money.
 */
export function payClean(
  state: GameState, from: PlayerId, to: PlayerId, amount: Money,
): GameState {
  if (from === to || amount <= 0) return state
  const payer = state.players[from]
  const payee = state.players[to]
  const debited = Math.min(payer.cleanCash, amount)
  return {
    ...state,
    players: {
      ...state.players,
      [from]: { ...payer, cleanCash: payer.cleanCash - debited },
      [to]: { ...payee, cleanCash: payee.cleanCash + amount },
    },
  }
}

function deedOwner(state: GameState, deed: string): PlayerId | null {
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank') return null
  return d.owner
}

export function reduceMarkets(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'RentFutureOriginated': {
      const contract: RentFuture = {
        id: event.id,
        deed: event.deed,
        holder: event.holder,
        startRound: event.startRound,
        endRound: event.endRound,
      }
      const owner = deedOwner(state, event.deed)
      const withContract: GameState = { ...state, futures: [...state.futures, contract] }
      return owner === null
        ? withContract
        : payClean(withContract, event.holder, owner, event.price)
    }

    case 'RentFutureSold': {
      const moved: GameState = {
        ...state,
        futures: state.futures.map(
          (f) => (f.id === event.id ? { ...f, holder: event.to } : f),
        ),
      }
      return payClean(moved, event.to, event.from, event.price)
    }

    case 'RentFutureMadeWhole': {
      const f = state.futures.find((x) => x.id === event.id)
      if (f === undefined) return state
      const owner = deedOwner(state, f.deed)
      if (owner === null) return state
      return payClean(state, owner, f.holder, event.amount)
    }

    case 'RentFutureExpired':
      return { ...state, futures: state.futures.filter((f) => f.id !== event.id) }

    /* Attribution only. RentCharged, reduced by board, is what moved the money. */
    case 'RentRoutedToFuture':
      return state

    default:
      return state
  }
}
```

- [ ] **Step 21: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: PASS, twenty-five tests.

- [ ] **Step 22: Commit the reducer**

```bash
git add packages/engine/src/contexts/markets/
git commit -m "feat(markets): rent future reducer

RentRoutedToFuture is an attribution marker only; RentCharged is what moves
the money, so pooled futures can be settled without double-paying."
```

- [ ] **Step 23: Write the failing routing tests, including both spec 19.2 no-payment cases**

Append to `markets.test.ts`. The two no-payment cases are the ones the spec calls out
explicitly and are the easiest thing in the whole design to get wrong:

```ts
import { rentEvents, rentPayment, rentRecipient, routingFutureFor, isEncumbered }
  from './selectors.js'

const CONTRACT = {
  id: 'rf:st-james-place:9-16',
  deed: 'st-james-place',
  holder: 'P2' as const,
  startRound: 9,
  endRound: 16,
}

function routed(round: number) {
  return testState({ round, futures: [CONTRACT] })
}

describe('rent routing during an active window', () => {
  it('routes rent to the holder when a third party lands', () => {
    const state = routed(10)
    expect(rentRecipient(state, 'st-james-place')).toBe('P2')
    expect(rentEvents(state, 'st-james-place', 'P3', 14)).toEqual([
      { type: 'RentCharged', from: 'P3', to: 'P2', deed: 'st-james-place', amount: 14 },
      { type: 'RentRoutedToFuture', contract: CONTRACT.id, holder: 'P2', amount: 14 },
    ])
  })

  it('SPEC 19.2: the owner landing on their own deed owes nothing, so no payment occurs', () => {
    const state = routed(10)
    expect(rentPayment(state, 'st-james-place', 'P1', 14)).toBeNull()
    expect(rentEvents(state, 'st-james-place', 'P1', 14)).toEqual([])
  })

  it('SPEC 19.2: the futures holder landing on a deed they do not own pays nothing', () => {
    const state = routed(10)
    // P2 holds the future, P1 owns the deed. P2 would owe rent to itself.
    expect(rentPayment(state, 'st-james-place', 'P2', 14)).toBeNull()
    expect(rentEvents(state, 'st-james-place', 'P2', 14)).toEqual([])
  })

  it('pays the owner before the window opens and after it closes', () => {
    const early = routed(8)
    expect(routingFutureFor(early, 'st-james-place')).toBeNull()
    expect(isEncumbered(early, 'st-james-place')).toBe(true)
    expect(rentRecipient(early, 'st-james-place')).toBe('P1')
    expect(rentEvents(early, 'st-james-place', 'P3', 14)).toEqual([
      { type: 'RentCharged', from: 'P3', to: 'P1', deed: 'st-james-place', amount: 14 },
    ])

    const late = routed(17)
    expect(rentRecipient(late, 'st-james-place')).toBe('P1')
  })

  it('still routes on the final round of the window, which Settlement ends afterwards', () => {
    expect(rentRecipient(routed(16), 'st-james-place')).toBe('P2')
  })

  it('pays nobody on a mortgaged deed', () => {
    const state = testState({
      round: 10,
      futures: [CONTRACT],
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
    })
    expect(rentEvents(state, 'st-james-place', 'P3', 14)).toEqual([])
  })
})
```

- [ ] **Step 24: Run the routing tests and verify they pass**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: PASS, thirty-one tests. `selectors.ts` from Step 14 already implements this;
if any of the six fail, fix `selectors.ts` rather than the test — the two `SPEC 19.2`
cases are binding text, not an interpretation.

- [ ] **Step 25: Commit routing**

```bash
git add packages/engine/src/contexts/markets/markets.test.ts
git commit -m "test(markets): rent routing, including both spec 19.2 no-payment cases

The deed's owner owes nothing when they land on it, and a futures holder
landing on a deed they do not own would owe rent to themselves, so neither
produces a payment."
```

- [ ] **Step 26: Write the failing encumbrance and make-whole tests**

Append to `markets.test.ts`:

```ts
import { makeWholeOnMortgage, expireRentFutures } from './decide.js'
import { mortgageImpact } from './selectors.js'

describe('encumbrance follows the deed', () => {
  it('survives a trade and keeps routing to the holder', () => {
    const before = testState({ round: 10, futures: [CONTRACT] })
    const traded: GameState = {
      ...before,
      deeds: { ...before.deeds, 'st-james-place': { ...stJames('P4') } },
    }
    // markets holds no owner reference, so the obligation transfers with the deed.
    expect(isEncumbered(traded, 'st-james-place')).toBe(true)
    expect(rentRecipient(traded, 'st-james-place')).toBe('P2')
    expect(rentEvents(traded, 'st-james-place', 'P4', 14)).toEqual([])
    expect(rentEvents(traded, 'st-james-place', 'P1', 14)).toEqual([
      { type: 'RentCharged', from: 'P1', to: 'P2', deed: 'st-james-place', amount: 14 },
      { type: 'RentRoutedToFuture', contract: CONTRACT.id, holder: 'P2', amount: 14 },
    ])
  })
})

describe('mortgaging an encumbered property', () => {
  it('pays make-whole at remaining expected value and terminates the contract', () => {
    const state = testState({ round: 10, cash: { P1: 500 }, futures: [CONTRACT] })
    const expected = markRentFuture(state, CONTRACT.id)
    expect(expected).toBeGreaterThan(0)
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureMadeWhole', id: CONTRACT.id, amount: expected },
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('turns an unaffordable make-whole into distressed debt', () => {
    const developed = { ...stJames('P1'), houses: 5 }
    const state = testState({
      round: 10,
      cash: { P1: 0 },
      deeds: { 'st-james-place': developed },
      futures: [CONTRACT],
    })
    const amount = markRentFuture(state, CONTRACT.id)
    // Mortgage proceeds are 50% of $180 face = $90 against a hoteled valuation.
    const shortfall = amount - 90
    expect(shortfall).toBeGreaterThan(0)
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureMadeWhole', id: CONTRACT.id, amount },
      { type: 'DistressedDebtIncurred', player: 'P1', amount: shortfall },
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('emits nothing but termination when the owner has bought their own future back', () => {
    const state = testState({
      round: 10, futures: [{ ...CONTRACT, holder: 'P1' }],
    })
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('emits nothing for an unencumbered deed', () => {
    expect(makeWholeOnMortgage(testState({ round: 10 }), 'st-james-place')).toEqual([])
  })

  it('reports the full mortgage impact for the assist panel', () => {
    const state = testState({ round: 10, futures: [CONTRACT] })
    const impact = mortgageImpact(state, 'st-james-place')
    expect(impact.proceeds).toBe(90)
    expect(impact.makeWhole).toBe(markRentFuture(state, CONTRACT.id))
    expect(impact.drawn).toBe(0)
    expect(impact.marginCalled).toBe(false)
  })
})

describe('settlement step 1', () => {
  it('expires every future reaching its end round and nothing else', () => {
    const state = testState({
      round: 16,
      futures: [
        CONTRACT,
        { id: 'rf:boardwalk:9-20', deed: 'boardwalk', holder: 'P3', startRound: 9, endRound: 20 },
      ],
    })
    expect(expireRentFutures(state)).toEqual([
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
    expect(expireRentFutures(testState({ round: 15, futures: [CONTRACT] }))).toEqual([])
  })
})
```

- [ ] **Step 27: Run the test to verify it fails, then passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets.test.ts`
Expected: initially FAIL on the `GameState` type import in the trade test; add
`import type { GameState } from '../../core/state.js'` at the top of the test file,
re-run, and expect PASS at thirty-eight tests.

- [ ] **Step 28: Write `index.ts`, the context's only public surface**

`packages/engine/src/contexts/markets/index.ts`:

```ts
export type { FutureValuation } from './valuation.js'
export {
  expectedHitsPerRound,
  markRentFuture,
  poissonQuantile,
  roundsRemaining,
  valueRentFuture,
  valueWindow,
} from './valuation.js'

export type { MortgageImpact, RentPayment } from './selectors.js'
export {
  futureFor,
  isEncumbered,
  mortgageImpact,
  rentEvents,
  rentPayment,
  rentRecipient,
  routingFutureFor,
} from './selectors.js'

export type { MarketsCommand, OriginateRentFuture, SellRentFuture } from './decide.js'
export {
  decideMarkets,
  expireRentFutures,
  makeWholeOnMortgage,
  rentFutureId,
} from './decide.js'

export { reduceMarkets } from './reduce.js'
```

- [ ] **Step 29: Wire the context into the root reducer and decider**

In `packages/engine/src/core/reduce.ts`, add `reduceMarkets` to the dispatch chain. In
`packages/engine/src/core/decide.ts`, add the two `MarketsCommand` cases behind the Era II
unlock gate produced by Task 4, and call `expireRentFutures` first in the Settlement
pipeline (step 1 of spec 19.1) and `makeWholeOnMortgage` from the mortgage decider before
`DeedMortgaged` is applied.

- [ ] **Step 30: Run the full suite, typecheck and lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass. In particular the lint `no-restricted-imports` rule must be clean,
which proves `markets` reaches `board` and `credit` only through their `index.ts`.

- [ ] **Step 31: Commit Task 14**

```bash
git add packages/engine/src/contexts/markets/ packages/engine/src/core/ \
        packages/engine/src/config/economy.ts packages/engine/tests/fixtures/
git commit -m "feat(markets): rent futures

Origination, resale, routing, encumbrance and make-whole per spec section 6,
with the binding clarifications in 19.2. Valuation exposes expected value plus
a 10th-90th percentile band computed from the Markov landing model, so the
engine states the number and no player computes it by hand."
```

---

### Task 15: `markets` context — deed options

Spec section 9 and the settlement ordering in 19.1 step 11 are binding on this task.
Deed options exist specifically to serve the rare-monopolies consequence of the draft
(spec section 3): they let a player buy the right to complete a colour group without
needing the holder to agree to a trade on the day.

**Files:**
- Create: `packages/engine/src/contexts/markets/decide-options.ts`
- Create: `packages/engine/src/contexts/markets/reduce-options.ts`
- Modify: `packages/engine/src/contexts/markets/selectors.ts`
- Modify: `packages/engine/src/contexts/markets/index.ts`
- Modify: `packages/engine/src/core/events.ts` (one new event, see NEW EVENTS REQUIRED)
- Modify: `packages/engine/src/core/errors.ts` (see NEW REJECTION CODES REQUIRED)
- Test: `packages/engine/src/contexts/markets/markets-options.test.ts`

**Interfaces:**

- Consumes: everything Task 14 consumes, plus `DeedOption` from `core/state.js` and the
  `payClean` helper from `./reduce.js`. It also consumes Task 14's `futureFor` so that a
  deed carrying both a rent future and an option is handled correctly.

```ts
import type { DeedOption, GameState } from '../../core/state.js'
import { payClean } from './reduce.js'
```

- Produces, added to `packages/engine/src/contexts/markets/index.ts`:

```ts
// decide-options.ts
export interface WriteDeedOption {
  readonly type: 'WriteDeedOption'
  readonly player: PlayerId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly premium: Money
  readonly strike: Money
  readonly expiry: RoundNumber
}
export interface SellDeedOption {
  readonly type: 'SellDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
  readonly to: PlayerId
  readonly price: Money
}
export interface ExerciseDeedOption {
  readonly type: 'ExerciseDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
}
export type DeedOptionCommand = WriteDeedOption | SellDeedOption | ExerciseDeedOption
export function deedOptionId(deed: DeedId, writer: PlayerId, expiry: RoundNumber): ContractId
export function decideDeedOptions(
  state: GameState, cmd: DeedOptionCommand,
): readonly GameEvent[] | Rejection
export function lapseDeedOptions(state: GameState): readonly GameEvent[]

// selectors.ts additions
export function outstandingOption(state: GameState, deed: DeedId): DeedOption | null
export function isDeedLocked(state: GameState, deed: DeedId): boolean
export function assertDeedTransferable(state: GameState, deed: DeedId): Rejection | null
export function markDeedOption(state: GameState, id: ContractId): Money

// reduce-options.ts
export function reduceDeedOptions(state: GameState, event: GameEvent): GameState
```

`MarketsCommand` widens to `OriginateRentFuture | SellRentFuture | DeedOptionCommand`, and
`decideMarkets` and `reduceMarkets` delegate the option cases. The split exists only to
keep every file under 500 lines; `index.ts` is unchanged in shape.

**Rounding.** `markDeedOption` is `Math.max(0, faceValue - strike)` on two integers, so no
rounding occurs. No other figure in this task rounds.

**Lock semantics.** `isDeedLocked` returns true whenever an outstanding option exists.
Task 9/10's mortgage, trade and forced-liquidation deciders must all call
`assertDeedTransferable` and refuse a locked deed. Forced liquidation is the important
one: a locked deed must be skipped in the descending-face-value auction of spec section 5,
because the writer's obligation to deliver on exercise outranks the bank's claim.

---

- [ ] **Step 1: Add the `DeedOptionSold` event to `core/events.ts`**

Task 2 gave rent futures and peer loans a resale event but not deed options, and spec
section 9 states "Options may be resold by the holder". Add one line to the markets block,
matching `RentFutureSold` exactly:

```ts
  | { type: 'DeedOptionSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
```

- [ ] **Step 2: Add the three rejection codes to `core/errors.ts`**

`SELF_DEALING` and `NEGATIVE_AMOUNT` are already needed by Task 14 and `DUPLICATE_CONTRACT_ID`
by both tasks. If Task 14 has already added them, this step is a no-op. Append to
`RejectionCode`:

```ts
  | 'SELF_DEALING' | 'NEGATIVE_AMOUNT' | 'DUPLICATE_CONTRACT_ID'
```

- [ ] **Step 3: Write the failing test for writing an option**

`packages/engine/src/contexts/markets/markets-options.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import { stJames, testState } from '../../../tests/fixtures/market-state.js'
import { decideDeedOptions, deedOptionId } from './decide-options.js'

function write(over: Record<string, unknown> = {}) {
  return {
    type: 'WriteDeedOption' as const,
    player: 'P1' as const,
    deed: 'st-james-place',
    holder: 'P2' as const,
    premium: 60,
    strike: 250,
    expiry: 20,
    ...over,
  }
}

describe('writing a deed option', () => {
  it('emits a written event for a valid option', () => {
    const result = decideDeedOptions(testState({ round: 14 }), write())
    expect(result).toEqual([{
      type: 'DeedOptionWritten',
      id: deedOptionId('st-james-place', 'P1', 20),
      deed: 'st-james-place',
      writer: 'P1',
      holder: 'P2',
      premium: 60,
      strike: 250,
      expiry: 20,
    }])
  })

  it('rejects outside an Open phase', () => {
    expect(decideDeedOptions(testState({ round: 14, phase: 'movement' }), write()))
      .toMatchObject({ rejected: true, code: 'WRONG_PHASE' })
  })

  it('is written by the deed owner only', () => {
    expect(decideDeedOptions(testState({ round: 14 }), write({ player: 'P3' })))
      .toMatchObject({ rejected: true, code: 'NOT_OWNER' })
  })

  it('allows one outstanding option per deed', () => {
    const state = testState({
      round: 14,
      options: [{
        id: 'do:st-james-place:P1:18',
        deed: 'st-james-place',
        writer: 'P1',
        holder: 'P4',
        strike: 200,
        expiry: 18,
      }],
    })
    expect(decideDeedOptions(state, write()))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('requires an expiry within the remaining game', () => {
    const state = testState({ round: 14 })
    expect(decideDeedOptions(state, write({ expiry: 13 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(decideDeedOptions(state, write({ expiry: ECONOMY.TOTAL_ROUNDS + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideDeedOptions(state, write({ expiry: ECONOMY.TOTAL_ROUNDS }))))
      .toBe(false)
  })

  it('rejects a holder who cannot pay the premium', () => {
    expect(decideDeedOptions(testState({ round: 14, cash: { P2: 10 } }), write()))
      .toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('rejects negative premium or strike, and writing to yourself', () => {
    const state = testState({ round: 14 })
    expect(decideDeedOptions(state, write({ premium: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideDeedOptions(state, write({ strike: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideDeedOptions(state, write({ holder: 'P1' })))
      .toMatchObject({ rejected: true, code: 'SELF_DEALING' })
  })

  it('rejects an unknown deed', () => {
    expect(decideDeedOptions(testState({ round: 14 }), write({ deed: 'boardwalk' })))
      .toMatchObject({ rejected: true, code: 'DEED_UNAVAILABLE' })
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets-options.test.ts`
Expected: FAIL — cannot resolve `./decide-options.js`.

- [ ] **Step 5: Write `decide-options.ts`**

`packages/engine/src/contexts/markets/decide-options.ts`:

```ts
import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { outstandingOption } from './selectors.js'

export interface WriteDeedOption {
  readonly type: 'WriteDeedOption'
  readonly player: PlayerId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly premium: Money
  readonly strike: Money
  readonly expiry: RoundNumber
}

export interface SellDeedOption {
  readonly type: 'SellDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
  readonly to: PlayerId
  readonly price: Money
}

export interface ExerciseDeedOption {
  readonly type: 'ExerciseDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
}

export type DeedOptionCommand = WriteDeedOption | SellDeedOption | ExerciseDeedOption

/**
 * Deterministic identity. (deed, writer, expiry) is unique: a deed carries at most
 * one outstanding option, and a replacement can only be written once the previous
 * one has lapsed or been exercised, by which point the current round already
 * exceeds the lapsed option's expiry.
 */
export function deedOptionId(
  deed: DeedId, writer: PlayerId, expiry: RoundNumber,
): ContractId {
  return `do:${deed}:${writer}:${expiry}`
}

function decideWrite(
  state: GameState, cmd: WriteDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Deed options can only be written during an Open phase.')
  }
  const deed = state.deeds[cmd.deed]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${cmd.deed}.`)
  }
  if (deed.owner !== cmd.player) {
    return reject('NOT_OWNER', 'Only the owner of a deed may write an option on it.')
  }
  if (outstandingOption(state, cmd.deed) !== null) {
    return reject('DEED_ENCUMBERED', 'This deed already has an outstanding option.')
  }
  if (cmd.holder === cmd.player) {
    return reject('SELF_DEALING', 'A deed option must be written to another player.')
  }
  if (cmd.expiry < state.round || cmd.expiry > ECONOMY.TOTAL_ROUNDS) {
    return reject(
      'INVALID_WINDOW',
      `Expiry must fall between round ${state.round} and round ${ECONOMY.TOTAL_ROUNDS}.`,
    )
  }
  if (cmd.premium < 0 || cmd.strike < 0) {
    return reject('NEGATIVE_AMOUNT', 'Premium and strike cannot be negative.')
  }
  if (state.players[cmd.holder].cleanCash < cmd.premium) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.holder} cannot cover a premium of $${cmd.premium}.`,
    )
  }
  const id = deedOptionId(cmd.deed, cmd.player, cmd.expiry)
  if (state.options.some((o) => o.id === id)) {
    return reject('DUPLICATE_CONTRACT_ID', 'An option with this identity already exists.')
  }
  return [{
    type: 'DeedOptionWritten',
    id,
    deed: cmd.deed,
    writer: cmd.player,
    holder: cmd.holder,
    premium: cmd.premium,
    strike: cmd.strike,
    expiry: cmd.expiry,
  }]
}

function decideSell(
  state: GameState, cmd: SellDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Deed options can only be resold during an Open phase.')
  }
  const o = state.options.find((x) => x.id === cmd.contract)
  if (o === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option is no longer outstanding.')
  }
  if (o.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a deed option may resell it.')
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A deed option must be sold to another player.')
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.to].cleanCash < cmd.price) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.to} cannot cover a price of $${cmd.price}.`)
  }
  return [{
    type: 'DeedOptionSold', id: o.id, from: cmd.player, to: cmd.to, price: cmd.price,
  }]
}

function decideExercise(
  state: GameState, cmd: ExerciseDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'A deed option can only be exercised during an Open phase.')
  }
  const o = state.options.find((x) => x.id === cmd.contract)
  if (o === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option is no longer outstanding.')
  }
  if (o.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a deed option may exercise it.')
  }
  if (state.round > o.expiry) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option has expired.')
  }
  const deed = state.deeds[o.deed]
  if (deed === undefined || deed.owner !== o.writer) {
    return reject('NOT_OWNER', 'The writer no longer owns the underlying deed.')
  }
  if (state.players[cmd.player].cleanCash < o.strike) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `Exercising costs the $${o.strike} strike and ${cmd.player} cannot cover it.`,
    )
  }
  return [{ type: 'DeedOptionExercised', id: o.id, strikePaid: o.strike }]
}

export function decideDeedOptions(
  state: GameState, cmd: DeedOptionCommand,
): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'WriteDeedOption': return decideWrite(state, cmd)
    case 'SellDeedOption': return decideSell(state, cmd)
    case 'ExerciseDeedOption': return decideExercise(state, cmd)
  }
}

/** Settlement step 11, spec 19.1. Deed options reaching expiry lapse. */
export function lapseDeedOptions(state: GameState): readonly GameEvent[] {
  return state.options
    .filter((o) => o.expiry <= state.round)
    .map((o): GameEvent => ({ type: 'DeedOptionExpired', id: o.id }))
}
```

- [ ] **Step 6: Add the option selectors to `selectors.ts`**

Append to `packages/engine/src/contexts/markets/selectors.ts`:

```ts
import type { DeedOption } from '../../core/state.js'

export function outstandingOption(state: GameState, deed: DeedId): DeedOption | null {
  return state.options.find((o) => o.deed === deed) ?? null
}

/**
 * Spec section 9. While an option is outstanding the writer may not sell, trade
 * or mortgage the underlying deed. Task 9/10's forced liquidation must also skip
 * locked deeds: the obligation to deliver on exercise outranks the bank's claim.
 */
export function isDeedLocked(state: GameState, deed: DeedId): boolean {
  return outstandingOption(state, deed) !== null
}

export function assertDeedTransferable(state: GameState, deed: DeedId): Rejection | null {
  if (!isDeedLocked(state, deed)) return null
  return reject(
    'DEED_ENCUMBERED',
    'This deed has an outstanding option and cannot be sold, traded or mortgaged.',
  )
}

/** Spec section 12 mark-to-model: max(0, deed face value - strike). */
export function markDeedOption(state: GameState, id: ContractId): Money {
  const o = state.options.find((x) => x.id === id)
  if (o === undefined) return 0
  const d = state.deeds[o.deed]
  if (d === undefined) return 0
  return Math.max(0, d.faceValue - o.strike)
}
```

Add `import { type Rejection, reject } from '../../core/errors.js'` to the file's imports.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets-options.test.ts`
Expected: PASS, eight tests.

- [ ] **Step 8: Commit option origination**

```bash
git add packages/engine/src/contexts/markets/ packages/engine/src/core/
git commit -m "feat(markets): deed option writing

Owner-only, one outstanding option per deed, expiry inside the remaining game.
isDeedLocked is the lock other contexts consult before any transfer."
```

- [ ] **Step 9: Write the failing test for exercise, resale, lapse and marking**

Append to `markets-options.test.ts`:

```ts
import type { GameState } from '../../core/state.js'
import { lapseDeedOptions } from './decide-options.js'
import { reduceDeedOptions } from './reduce-options.js'
import { assertDeedTransferable, isDeedLocked, markDeedOption } from './selectors.js'

const OPTION = {
  id: 'do:st-james-place:P1:20',
  deed: 'st-james-place',
  writer: 'P1' as const,
  holder: 'P2' as const,
  strike: 250,
  expiry: 20,
}

function optioned(round: number, over: Record<string, unknown> = {}): GameState {
  return testState({ round, options: [OPTION], ...over })
}

describe('exercising a deed option', () => {
  it('transfers the deed and pays the strike to the writer', () => {
    const before = optioned(18, { cash: { P1: 400, P2: 400 } })
    const events = decideDeedOptions(before, {
      type: 'ExerciseDeedOption', player: 'P2', contract: OPTION.id,
    })
    expect(events).toEqual([
      { type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250 },
    ])
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250,
    })
    expect(after.deeds['st-james-place']?.owner).toBe('P2')
    expect(after.players.P1.cleanCash).toBe(650)
    expect(after.players.P2.cleanCash).toBe(150)
    expect(after.options).toEqual([])
  })

  it('can be exercised on the expiry round itself but not after', () => {
    const cmd = { type: 'ExerciseDeedOption' as const, player: 'P2' as const, contract: OPTION.id }
    expect(isRejection(decideDeedOptions(optioned(20), cmd))).toBe(false)
    expect(decideDeedOptions(optioned(21), cmd))
      .toMatchObject({ rejected: true, code: 'CONTRACT_NOT_FOUND' })
  })

  it('can only be exercised by the current holder', () => {
    expect(decideDeedOptions(optioned(18), {
      type: 'ExerciseDeedOption', player: 'P3', contract: OPTION.id,
    })).toMatchObject({ rejected: true, code: 'NOT_ASSET_OWNER' })
  })

  it('rejects a holder who cannot pay the strike', () => {
    expect(decideDeedOptions(optioned(18, { cash: { P2: 100 } }), {
      type: 'ExerciseDeedOption', player: 'P2', contract: OPTION.id,
    })).toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('carries houses and any rent future across with the deed', () => {
    const before = testState({
      round: 18,
      options: [OPTION],
      deeds: { 'st-james-place': { ...stJames('P1'), houses: 3 } },
      futures: [{
        id: 'rf:st-james-place:19-22',
        deed: 'st-james-place',
        holder: 'P4',
        startRound: 19,
        endRound: 22,
      }],
    })
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250,
    })
    expect(after.deeds['st-james-place']?.houses).toBe(3)
    expect(after.futures[0]?.holder).toBe('P4')
  })
})

describe('reselling a deed option', () => {
  it('moves the holder and the price', () => {
    const before = optioned(18, { cash: { P2: 400, P3: 400 } })
    expect(decideDeedOptions(before, {
      type: 'SellDeedOption', player: 'P2', contract: OPTION.id, to: 'P3', price: 90,
    })).toEqual([
      { type: 'DeedOptionSold', id: OPTION.id, from: 'P2', to: 'P3', price: 90 },
    ])
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionSold', id: OPTION.id, from: 'P2', to: 'P3', price: 90,
    })
    expect(after.options[0]?.holder).toBe('P3')
    expect(after.options[0]?.writer).toBe('P1')
    expect(after.players.P2.cleanCash).toBe(490)
    expect(after.players.P3.cleanCash).toBe(310)
  })

  it('cannot be resold by anyone but the holder', () => {
    expect(decideDeedOptions(optioned(18), {
      type: 'SellDeedOption', player: 'P1', contract: OPTION.id, to: 'P3', price: 90,
    })).toMatchObject({ rejected: true, code: 'NOT_ASSET_OWNER' })
  })
})

describe('the underlying deed is locked while an option is outstanding', () => {
  it('refuses sale, trade and mortgage', () => {
    const state = optioned(18)
    expect(isDeedLocked(state, 'st-james-place')).toBe(true)
    expect(assertDeedTransferable(state, 'st-james-place'))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('releases the lock once the option lapses', () => {
    const state = optioned(20)
    const after = reduceDeedOptions(state, { type: 'DeedOptionExpired', id: OPTION.id })
    expect(isDeedLocked(after, 'st-james-place')).toBe(false)
    expect(assertDeedTransferable(after, 'st-james-place')).toBeNull()
  })
})

describe('settlement step 11 and scoring', () => {
  it('lapses options reaching expiry and nothing earlier', () => {
    expect(lapseDeedOptions(optioned(20))).toEqual([
      { type: 'DeedOptionExpired', id: OPTION.id },
    ])
    expect(lapseDeedOptions(optioned(19))).toEqual([])
  })

  it('marks at max(0, deed face value - strike)', () => {
    // St. James face $180 against a $250 strike: out of the money.
    expect(markDeedOption(optioned(18), OPTION.id)).toBe(0)
    const cheap = testState({
      round: 18, options: [{ ...OPTION, id: 'do:st-james-place:P1:22', strike: 100, expiry: 22 }],
    })
    expect(markDeedOption(cheap, 'do:st-james-place:P1:22')).toBe(80)
    expect(markDeedOption(cheap, 'do:nonexistent:P1:22')).toBe(0)
  })
})
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/markets/markets-options.test.ts`
Expected: FAIL — cannot resolve `./reduce-options.js`.

- [ ] **Step 11: Write `reduce-options.ts`**

`packages/engine/src/contexts/markets/reduce-options.ts`:

```ts
import type { DeedOption, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { payClean } from './reduce.js'

export function reduceDeedOptions(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'DeedOptionWritten': {
      const option: DeedOption = {
        id: event.id,
        deed: event.deed,
        writer: event.writer,
        holder: event.holder,
        strike: event.strike,
        expiry: event.expiry,
      }
      const withOption: GameState = { ...state, options: [...state.options, option] }
      return payClean(withOption, event.holder, event.writer, event.premium)
    }

    case 'DeedOptionSold': {
      const moved: GameState = {
        ...state,
        options: state.options.map(
          (o) => (o.id === event.id ? { ...o, holder: event.to } : o),
        ),
      }
      return payClean(moved, event.to, event.from, event.price)
    }

    case 'DeedOptionExercised': {
      const o = state.options.find((x) => x.id === event.id)
      if (o === undefined) return state
      const deed = state.deeds[o.deed]
      if (deed === undefined) return state
      /*
       * The deed transfers whole: houses, mortgage status and any rent future
       * encumbrance go with it, because the future references the deed and not
       * its owner.
       */
      const transferred: GameState = {
        ...state,
        deeds: { ...state.deeds, [o.deed]: { ...deed, owner: o.holder } },
        options: state.options.filter((x) => x.id !== event.id),
      }
      return payClean(transferred, o.holder, o.writer, event.strikePaid)
    }

    case 'DeedOptionExpired':
      return { ...state, options: state.options.filter((o) => o.id !== event.id) }

    default:
      return state
  }
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/markets/markets-options.test.ts`
Expected: PASS, twenty tests.

- [ ] **Step 13: Widen `decideMarkets` and `reduceMarkets` to cover both instruments**

In `decide.ts`, widen the union and delegate:

```ts
import { type DeedOptionCommand, decideDeedOptions } from './decide-options.js'

export type MarketsCommand =
  | OriginateRentFuture
  | SellRentFuture
  | DeedOptionCommand

export function decideMarkets(
  state: GameState, cmd: MarketsCommand,
): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'OriginateRentFuture': return decideOriginate(state, cmd)
    case 'SellRentFuture': return decideSell(state, cmd)
    default: return decideDeedOptions(state, cmd)
  }
}
```

In `reduce.ts`, delegate the option events by replacing the `default` arm:

```ts
import { reduceDeedOptions } from './reduce-options.js'

    default:
      return reduceDeedOptions(state, event)
```

- [ ] **Step 14: Extend `index.ts` with the deed-option surface**

Append to `packages/engine/src/contexts/markets/index.ts`:

```ts
export type {
  DeedOptionCommand, ExerciseDeedOption, SellDeedOption, WriteDeedOption,
} from './decide-options.js'
export { decideDeedOptions, deedOptionId, lapseDeedOptions } from './decide-options.js'

export {
  assertDeedTransferable, isDeedLocked, markDeedOption, outstandingOption,
} from './selectors.js'

export { reduceDeedOptions } from './reduce-options.js'
```

- [ ] **Step 15: Wire deed options into the root pipelines**

In `core/decide.ts`, add the three `DeedOptionCommand` cases behind the Era III unlock gate
from Task 4, and make the mortgage, trade and forced-liquidation deciders call
`assertDeedTransferable` before acting. In `core/reduce.ts` the delegation from Step 13
means no change is needed. In the Settlement pipeline, call `lapseDeedOptions` at
**step 11**, after margin-call flagging at step 10, per spec 19.1.

- [ ] **Step 16: Run the full suite, typecheck and lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass. Confirm no file in `contexts/markets/` exceeds 500 lines:
`wc -l packages/engine/src/contexts/markets/*.ts`

- [ ] **Step 17: Commit Task 15**

```bash
git add packages/engine/src/contexts/markets/ packages/engine/src/core/
git commit -m "feat(markets): deed options

Premium at origination, strike on exercise, expiry lapsing at Settlement
step 11. The underlying deed is locked against sale, trade, mortgage and
forced liquidation while an option is outstanding. Marks at
max(0, face value - strike) per spec section 12."
```

---

## NEW EVENTS REQUIRED

One event Task 2 does not define. Add it to the markets block of
`packages/engine/src/core/events.ts` and to the review of that file's test:

```ts
| { type: 'DeedOptionSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
```

Spec section 9 states "Options may be resold by the holder", and Task 2 gave both rent
futures (`RentFutureSold`) and peer loan notes (`PeerLoanSold`) a resale event but omitted
the equivalent for deed options. The shape matches `RentFutureSold` exactly.

No other new event is required. In particular, contract termination by make-whole reuses
`RentFutureExpired` rather than introducing a second removal path — `RentFutureMadeWhole`
moves the cash and `RentFutureExpired` removes the contract, so the reducer has exactly one
place that deletes a future.

## NEW REJECTION CODES REQUIRED

Three codes Task 2's `RejectionCode` union does not define, all used by both tasks:

```ts
| 'SELF_DEALING'          // a contract must have two distinct counterparties
| 'NEGATIVE_AMOUNT'       // a negotiated price, premium or strike below zero
| 'DUPLICATE_CONTRACT_ID' // defensive: derived contract identity already in use
```

## CONSTANTS ADDED TO `config/economy.ts`

Four, all cited from the spec. None appears inline anywhere else:

| Constant | Value | Source |
|---|---|---|
| `RENT_OBLIGORS` | 3 | Spec 19.2, "all players other than the owner" |
| `DOUBLES_ROLL_MULTIPLIER` | 1.19 | Spec 19.2, extra rolls generated by doubles |
| `VALUATION_PERCENTILE_LOW` | 0.1 | Spec section 6, displayed outcome band |
| `VALUATION_PERCENTILE_HIGH` | 0.9 | Spec section 6, displayed outcome band |

`MAX_FUTURE_WINDOW` (8) and `TOTAL_ROUNDS` (24) already exist from Task 2 and are consumed,
not redefined.

## SYMBOLS REQUIRED FROM SIBLING TASKS, TO RECONCILE AT MERGE

| Symbol | Owner | Assumed signature |
|---|---|---|
| `landingProbability` | Task 7, `board` | `(state: GameState, square: SquareIndex) => number` — per roll, per token, from the 120-state stationary distribution; reproduces `tests/fixtures/landing-probabilities.json`; square 30 returns 0 |
| `rentFor` | Task 6, `board` | `(state: GameState, deed: DeedId, dice: DiceRoll) => Money` |
| `MEAN_DICE` | Task 5, `board` | `DiceRoll` = `[3, 4]`, the modal 2d6 total, so utilities can be valued without a live roll |
| `borrowingBase` | Task 9, `credit` | `(state: GameState, player: PlayerId) => Money` |

If Tasks 5–7 land under different names, rename at the three import sites in
`valuation.ts` and `selectors.ts`. These four are the entire coupling surface between
`markets` and the rest of the engine.

## JUDGMENT CALLS WHERE THE SPEC IS AMBIGUOUS

1. **The end round of a futures window still pays.** Spec 19.1 puts futures expiry at
   Settlement step 1, and Settlement follows Movement in the round loop, so rent landed on
   during the end round routes to the holder and the contract dies afterwards.
   `roundsRemaining` therefore counts the current round as live and computes
   `end - max(current, start) + 1`.

2. **The valuation multiplier stays at 3 even when the holder is not the owner.** Spec 19.2
   fixes the obligor count at three and separately says a holder landing on a deed they do
   not own pays nothing. Taken together, the displayed expected value marginally overstates
   a contract held by a non-owner, since one of the three obligors is the holder. The spec
   text is binding and states 3 flatly, so `RENT_OBLIGORS` is 3 with no adjustment. This is
   also the right call for the game: the number must be the same for every player looking
   at the same deed, or it stops being a market price.

3. **Percentiles come from a Poisson model of hit count.** Spec section 6 requires 10th and
   90th percentiles but does not name a distribution. Hits are modelled as Poisson with
   lambda equal to expected hits, which is exact enough at the lambdas this game produces
   (an 8-round window on the busiest square is 0.78) and is computable by pure summation
   with no randomness. The percentile is a whole number of hits multiplied by current rent,
   which is also the honest presentation: the outcome distribution really is discrete.

4. **Make-whole is valued before the mortgage applies.** A mortgaged deed values at zero, so
   calling the valuation after `DeedMortgaged` would make every make-whole payment zero and
   reopen exactly the rug-pull spec section 6 closes. `makeWholeOnMortgage` therefore takes
   the pre-mortgage state and adds the mortgage proceeds itself when testing affordability.

5. **An unaffordable make-whole becomes distressed debt, not a liquidation.** Spec 19.8:
   liquidation applies only to uncured margin calls; every other unmet obligation becomes
   distressed debt immediately. The holder is made whole in full.

6. **`RentCharged.to` is the actual recipient, not the deed owner.** Spec 19.5 needs the
   owner for venture bonuses, and that is read from `state.deeds[deed].owner` rather than
   from the event. `RentRoutedToFuture` moves no money; it exists so pooled futures have an
   attributable cashflow for the Task 16 waterfall. Note for Task 12: Chop Shop pays on any
   opponent landing on a deed you own, so it keys off `TokenMoved`, not `RentCharged`, and
   still pays when a futures holder lands and no rent is charged.

7. **Options may be written on a mortgaged deed.** Spec section 9 forbids the writer from
   mortgaging while an option is outstanding but says nothing about writing one on a deed
   already mortgaged. That is allowed: the option still has value, and the deed transfers in
   its mortgaged state on exercise. Rent futures, by contrast, explicitly may not originate
   while mortgaged.

8. **Option expiry may equal the current round.** Spec section 9 says the holder may
   exercise "up to and including the expiry round" but, unlike rent futures, does not
   require the expiry to be in the future. A same-round option is therefore legal; it is
   exercisable in the Open phase it was written in and lapses at that round's Settlement
   step 11.

9. **Exercise transfers the deed whole.** Houses, mortgage status and any rent-future
   encumbrance travel with the deed. The future references the deed, not its owner, which is
   the same mechanism that makes encumbrance survive a trade.

10. **A locked deed is skipped by forced liquidation.** Spec section 9 lists sale, trade and
    mortgage; forced liquidation is a fourth kind of transfer it does not name. Locked deeds
    are excluded from the descending-face-value auction, because the writer's obligation to
    deliver on exercise cannot be satisfied once the bank owns the deed. Task 10 must call
    `assertDeedTransferable`.

11. **Era gating lives in `core/decide.ts`, not in `markets`.** Rent futures unlock in Era II
    and deed options in Era III, but the unlock table belongs to `session`, which `markets`
    is forbidden from importing by the dependency graph in spec section 14. The root decider
    applies the gate before dispatch, so `INSTRUMENT_LOCKED_THIS_ERA` is never returned from
    this context.

12. **Contract ids are derived, not generated.** The engine contains no `Math.random`, so
    `rf:<deed>:<start>-<end>` and `do:<deed>:<writer>:<expiry>` are derived deterministically
    and proven unique by the window rules. A `DUPLICATE_CONTRACT_ID` guard exists anyway so
    a future rule change cannot silently corrupt the log.

13. **`payClean` floors the payer at zero and pays the payee in full.** This preserves the
    "clean cash never goes negative" invariant while making the counterparty whole. It means
    Task 20's money-conservation identity must count distressed debt as issued money, since
    `DistressedDebtIncurred` is what balances the difference.
