# LEVERAGE Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, deterministic, event-sourced rules engine implementing the complete LEVERAGE ruleset, with no I/O and no runtime dependencies.

**Architecture:** An append-only event log is the sole source of truth. `reduce(state, event) => state` is a pure function containing no `Math.random` and no `Date.now`. All randomness — dice, card draws, audit checks — enters as event payload carrying values produced by physical dice at the table. Commands are validated against current state by `decide(state, command)`, which returns either events to append or a typed rejection. Seven bounded contexts each own a slice of state and expose a typed interface.

**Tech Stack:** TypeScript 5.7 (strict), Node 22+, npm workspaces, Vitest, fast-check for property-based tests. Zero runtime dependencies in the engine package.

**Spec:** `docs/superpowers/specs/2026-08-03-leverage-design.md` — the authority on every rule. Where this plan and the spec disagree, the spec wins and the plan is wrong.

## Global Constraints

- **Package `@leverage/engine` has zero runtime dependencies.** Dev dependencies only.
- **No `Math.random`, no `Date.now`, no `new Date()`, no I/O anywhere in `packages/engine/src`.** Enforced by an ESLint rule and by a test that greps the built output.
- **All money is integer dollars.** Never floats.
- **Every percentage-of-money calculation MUST go through `core/money.ts`.** Never write
  `Math.floor(amount * rate)` anywhere in the engine — it is wrong.

  Two verified examples, both found while validating this plan:
  - `180 * 0.7` is `125.99999999999999`, so flooring yields **125 instead of 126** and
    silently underpays a deed sale.
  - A laundering haircut at Heat 9 is `0.25 + 0.05 * 6` = `0.55`, but `1 - 0.55` is
    `0.44999999999999996`, so `Math.floor(1000 * that)` yields **449 instead of 450**.
    Heat 10 drifts the same way.

  Note the trap is narrower than it looks and cannot be reasoned about by inspection:
  `0.25 + 0.05 * 2` is *exactly* `0.35` and does NOT drift, so a spot-check at one Heat
  value proves nothing about another. `floorPercent`/`floorPercentSum` work in integer
  basis points and are exact at every input. An ESLint rule bans the raw pattern, and
  every rule that rounds still states its direction in its task.
- **Files stay under 500 lines.** Split by responsibility when approaching the limit.
- **All public APIs are typed interfaces.** No `any`. `strict: true`, `noUncheckedIndexedAccess: true`.
- **TDD.** Every task writes a failing test first, watches it fail, then implements.
- **Commit after every task.** Conventional commit messages.
- **Economic constants live only in `packages/engine/src/config/economy.ts`.** No economic number is written inline anywhere else in the codebase.
- **Player count is exactly 4.** Turn order is `['P1','P2','P3','P4']` permuted at setup.
- **Game length is exactly 24 rounds** in the default win condition. This is a hard constraint from simulation, not a preference.

---

## File structure

```
packages/engine/
  src/
    config/
      economy.ts            all tunable economic constants, single source
      board.ts              40 squares, deeds, rent tables, house costs
    core/
      types.ts              Money, PlayerId, DeedId, Era, Phase, branded types
      money.ts              exact integer-basis-point percentage arithmetic
      state.ts              GameState, PlayerState, DeedState and sub-shapes
      events.ts             the GameEvent discriminated union
      commands.ts           the Command discriminated union
      reduce.ts             the root reducer, dispatches to context reducers
      decide.ts             the root decider, dispatches to context deciders
      errors.ts             Rejection type and rejection codes
      replay.ts             replay(events) => GameState, and snapshot helpers
    contexts/
      session/              players, rounds, eras, phase transitions, scoring
      board/                movement, landing, rent, Markov landing model
      draft/                ranked-triple submission and resolution
      credit/               credit line, interest, carrying cost, peer loans,
                            margin calls, forced liquidation, distressed debt
      underworld/           ventures, dirty cash, heat, laundering, audits
      markets/              rent futures, deed options, valuation
      securitization/       pools, tranches, ratings, waterfall, CDS
      decks/                era deck definitions and the card effect interpreter
    index.ts                the package's entire public surface
  tests/
    fixtures/
    property/
```

Each context directory follows the same shape, which every context task must respect:

```
contexts/<name>/
  index.ts        public interface, the only file other contexts may import
  reduce.ts       (state, event) => state for this context's events
  decide.ts       (state, command) => GameEvent[] | Rejection
  selectors.ts    pure derived reads, e.g. borrowingBase(state, player)
  <name>.test.ts  unit tests
```

**Import rule:** a context may import another context's `index.ts` and nothing deeper. Enforced by an ESLint `no-restricted-imports` rule added in Task 1.

---

### Task 1: Monorepo scaffold, tooling, and CI

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.eslintrc.json`, `vitest.config.ts`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`
- Create: `.github/workflows/ci.yml`
- Test: `packages/engine/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`, `npm run build`, `npm run lint` at repo root. The `@leverage/engine` workspace package resolvable by later packages.

- [ ] **Step 1: Create the root workspace manifest**

`package.json`:

```json
{
  "name": "leverage-monopoly",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint packages --ext .ts",
    "typecheck": "tsc --build --force"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint": "^8.57.1",
    "fast-check": "^3.23.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create the shared TypeScript config**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "declaration": true,
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create the engine package manifest**

`packages/engine/package.json`. Note there is no `dependencies` key at all — this is a constraint, not an oversight:

```json
{
  "name": "@leverage/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc --build" }
}
```

- [ ] **Step 4: Create the ESLint config enforcing the two structural rules**

`.eslintrc.json`. The `no-restricted-globals` block is what keeps the engine deterministic; the `no-restricted-imports` block is what keeps contexts from reaching into each other's internals:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": 2023, "sourceType": "module" },
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-module-boundary-types": "error"
  },
  "overrides": [
    {
      "files": ["packages/engine/src/**/*.ts"],
      "excludedFiles": ["**/*.test.ts"],
      "rules": {
        "no-restricted-globals": [
          "error",
          { "name": "Date", "message": "The engine must be deterministic. Time enters as event data." }
        ],
        "no-restricted-properties": [
          "error",
          { "object": "Math", "property": "random", "message": "The engine must be deterministic. Randomness enters as event data." }
        ],
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              { "group": ["**/contexts/*/*", "!**/contexts/*/index.js"], "message": "Import a context only through its index.ts." },
              { "group": ["node:*", "fs", "path", "crypto"], "message": "The engine performs no I/O." }
            ]
          }
        ]
      }
    }
  ]
}
```

- [ ] **Step 5: Create the Vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/engine/src/**'] },
  },
})
```

- [ ] **Step 6: Write the failing smoke test**

`packages/engine/src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from './index.js'

describe('engine package', () => {
  it('exports a version string', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm install && npx vitest run packages/engine/src/smoke.test.ts`
Expected: FAIL — cannot resolve `./index.js`, or `ENGINE_VERSION` is not exported.

- [ ] **Step 8: Write the minimal implementation**

`packages/engine/src/index.ts`:

```ts
export const ENGINE_VERSION = '0.1.0'
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/smoke.test.ts`
Expected: PASS

- [ ] **Step 10: Add the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 11: Verify the whole toolchain runs clean**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all three pass with no errors.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.base.json .eslintrc.json vitest.config.ts packages/ .github/
git commit -m "chore: scaffold monorepo, engine package, lint rules and CI

ESLint enforces the two structural invariants: the engine may not use
Math.random or Date, and contexts may only import each other through
index.ts."
```

---

### Task 2: Core types, state shape, and the event schema

This task defines the vocabulary every subsequent task codes against. Nothing here is implementation — it is the contract.

**Files:**
- Create: `packages/engine/src/core/types.ts`
- Create: `packages/engine/src/core/state.ts`
- Create: `packages/engine/src/core/events.ts`
- Create: `packages/engine/src/core/errors.ts`
- Create: `packages/engine/src/config/economy.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/core/events.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Money`, `PlayerId`, `DeedId`, `Era`, `Phase`, `ColorGroup`, `GameState`, `PlayerState`, `DeedState`, `GameEvent`, `Rejection`, `ECONOMY`. Every later task imports from here and must not redefine any of them.

- [ ] **Step 1: Write `core/types.ts`**

```ts
/** Integer dollars. Never fractional. */
export type Money = number

export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4'
export const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4'] as const

/** 0-39, index onto the physical board. */
export type SquareIndex = number

/** Kebab-case slug, e.g. 'illinois-avenue', 'reading-railroad'. */
export type DeedId = string

/** 1-24. */
export type RoundNumber = number

export type Era = 1 | 2 | 3 | 4

export type Phase =
  | 'setup'
  | 'draft'
  | 'market'
  | 'open'
  | 'movement'
  | 'settlement'
  | 'scoring'
  | 'complete'

export type ColorGroup =
  | 'brown' | 'light-blue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'dark-blue'
  | 'railroad' | 'utility'

/** A single 2d6 roll, as produced by the physical dice at the table. */
export type DiceRoll = readonly [number, number]

export type ContractId = string
```

- [ ] **Step 2: Write `core/money.ts`**

Every percentage-of-money calculation in the engine routes through here. Working in
integer basis points sidesteps IEEE 754 entirely:

```ts
import type { Money } from './types.js'

/** Convert a rate like 0.7 to integer basis points, e.g. 7000. */
function toBasisPoints(rate: number): number {
  return Math.round(rate * 10_000)
}

/**
 * `amount * rate`, rounded down, computed exactly.
 * Math.floor(180 * 0.7) is 125 because 180 * 0.7 is 125.99999999999999.
 * floorPercent(180, 0.7) is 126.
 */
export function floorPercent(amount: Money, rate: number): Money {
  return Math.floor((amount * toBasisPoints(rate)) / 10_000)
}

/** `amount * rate`, rounded up, computed exactly. */
export function ceilPercent(amount: Money, rate: number): Money {
  return Math.ceil((amount * toBasisPoints(rate)) / 10_000)
}

/** Sum of rates applied as one exact percentage, avoiding float accumulation. */
export function floorPercentSum(amount: Money, rates: readonly number[]): Money {
  const bp = rates.reduce((acc, r) => acc + toBasisPoints(r), 0)
  return Math.floor((amount * bp) / 10_000)
}

/** All money is integer dollars. Used by the property suite and by boundary validation. */
export function isWholeDollars(amount: number): boolean {
  return Number.isInteger(amount)
}
```

- [ ] **Step 3: Write the failing test for money arithmetic**

`packages/engine/src/core/money.test.ts`. Both cases below are real bugs found while
validating this plan, not hypotheticals:

```ts
import { describe, it, expect } from 'vitest'
import { floorPercent, ceilPercent, floorPercentSum } from './money.js'

describe('floorPercent', () => {
  it('is exact where naive float arithmetic is not', () => {
    // Math.floor(180 * 0.7) === 125 — 180 * 0.7 is 125.99999999999999
    expect(floorPercent(180, 0.7)).toBe(126)
    expect(floorPercent(350, 0.7)).toBe(245)
  })

  it('handles the rates the ruleset actually uses', () => {
    expect(floorPercent(200, 0.5)).toBe(100)   // mortgage
    expect(floorPercent(200, 0.55)).toBe(110)  // unmortgage
    expect(floorPercent(400, 0.8)).toBe(320)   // liquidation floor
    expect(floorPercent(100, 0.9)).toBe(90)    // house cost multiplier
  })
})

describe('floorPercentSum', () => {
  it('accumulates rates without float drift', () => {
    // A Heat-9 laundering haircut is 0.25 + 0.05*6. Naively, 1 - 0.55 is
    // 0.44999999999999996, so Math.floor(1000 * that) is 449, not 450.
    expect(floorPercentSum(1000, [0.25, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05])).toBe(550)
    // The complement is what the player actually receives.
    expect(1000 - floorPercentSum(1000, [0.25, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05])).toBe(450)
  })
})

describe('ceilPercent', () => {
  it('rounds up exactly', () => {
    expect(ceilPercent(180, 0.7)).toBe(126)
    expect(ceilPercent(101, 0.5)).toBe(51)
  })
})
```

- [ ] **Step 4: Write `config/economy.ts`**

Every one of these is validated by simulation and cited in spec section 19. This file is the ONLY place any of these numbers may appear:

```ts
import type { Era, Money } from '../core/types.js'

export const ECONOMY = {
  /** Single unified budget. The draft spends from it. Spec section 4. */
  STARTING_CASH: 2500 as Money,

  /** Paid on passing or landing on GO, from the Treasury. */
  GO_SALARY: 350 as Money,

  /** Per unmortgaged deed, per player, every Settlement, from round 1. */
  CARRYING_COST_PER_DEED: 8 as Money,

  /** Advanced at the start of round 7 as an interest-bearing loan, not a grant. */
  ERA_II_STIMULUS: 300 as Money,

  /**
   * Borrowing base = deed face x this + building cost x BUILDING_ADVANCE_RATE.
   * BUILDING_ADVANCE_RATE must never exceed BUILDING_SELLBACK_RATE, or stripping a
   * developed deed during liquidation widens the shortfall. Asserted at startup.
   */
  DEED_ADVANCE_RATE: 0.75,
  BUILDING_ADVANCE_RATE: 0.5,

  /** Houses cost 90% of standard, offsetting carrying-cost development suppression. */
  HOUSE_COST_MULTIPLIER: 0.9,
  /** Buildings sell back to the bank at half the price paid. */
  BUILDING_SELLBACK_RATE: 0.5,

  /** Prevailing per-round interest on drawn credit, by era. */
  INTEREST_RATE_BY_ERA: { 1: 0.05, 2: 0.06, 3: 0.08, 4: 0.12 } as Record<Era, number>,

  /** Accrues on any shortfall a player cannot meet after credit and liquidation. */
  DISTRESSED_DEBT_RATE: 0.15,

  /**
   * Floor price in a forced liquidation, as a fraction of deed face value.
   * MUST be strictly greater than DEED_ADVANCE_RATE or liquidation diverges:
   * a sale raises floor x face but removes advance x face from the borrowing
   * base, so a floor below the advance rate widens the shortfall on every sale.
   * Asserted at startup. See spec section 5.
   */
  LIQUIDATION_FLOOR: 0.8,

  /** Standard Monopoly mortgage economics. */
  MORTGAGE_RATE: 0.5,
  UNMORTGAGE_RATE: 0.55,

  /** Flat taxes, paid to the Treasury. */
  INCOME_TAX: 200 as Money,
  LUXURY_TAX: 100 as Money,
  JAIL_FEE: 50 as Money,

  /** Physical component scarcity. Hoarding is a legitimate strategy. */
  HOUSE_SUPPLY: 32,
  HOTEL_SUPPLY: 12,

  /** Laundering: base haircut, extra per Heat point above the free threshold, and cap. */
  LAUNDER_BASE_HAIRCUT: 0.25,
  LAUNDER_HAIRCUT_PER_HEAT: 0.05,
  LAUNDER_HEAT_FREE_THRESHOLD: 3,
  LAUNDER_MAX_HAIRCUT: 0.6,

  /** Audits begin in Era III. Fine is this multiplied by Heat. */
  AUDIT_FIRST_ROUND: 13 as RoundNumberLiteral,
  AUDIT_FINE_PER_HEAT: 100 as Money,

  /** A CDS writer must post this fraction of notional against their borrowing base. */
  CDS_COLLATERAL_RATE: 0.3,

  /** Rent future windows may not exceed this many rounds. */
  MAX_FUTURE_WINDOW: 8,

  /** Hard game length. Simulation shows 36 rounds produces 82% bankruptcy. */
  TOTAL_ROUNDS: 24,
  ROUNDS_PER_ERA: 6,

  /**
   * The venture table. Keyed by the same literals the events use, so retuning a
   * venture is a one-line edit. These are the values most likely to move after
   * the first playtest — Escort was already recut once from $300/40% to $150/60%
   * after simulation showed it was never worth launching.
   */
  VENTURES: {
    escort: { cost: 150 as Money, rounds: 4, heat: 2, rentShare: 0.6 },
    numbers: { cost: 150 as Money, rounds: 6, heat: 2, perRound: 60 as Money },
    'chop-shop': { cost: 250 as Money, rounds: 4, heat: 3, perLanding: 150 as Money },
  },
  SPEAKEASY_COST: 250 as Money,
  SPEAKEASY_HEAT: 2,
  /** Indexed by 2d6 total, 2-12. Expected payout $294 against a $250 cost. */
  SPEAKEASY_PAYOUTS: {
    2: 0, 3: 100, 4: 100, 5: 100, 6: 250, 7: 250,
    8: 250, 9: 500, 10: 500, 11: 500, 12: 1200,
  } as Record<number, Money>,

  BRIBERY_COST: 200 as Money,
  BRIBERY_HEAT: 1,
  INSIDER_TRADING_COST: 100 as Money,
  INSIDER_TRADING_HEAT: 1,
  LAUNDER_HEAT: 1,
  HEAT_DECAY: 1,

  /** Instrument gating, ignored when config.unlockMode is 'all'. */
  VENTURES_UNLOCK_ERA: 2 as Era,
  LAUNDERING_UNLOCK_ERA: 2 as Era,
  BRIBERY_UNLOCK_ERA: 2 as Era,
  INSIDER_TRADING_UNLOCK_ERA: 3 as Era,
} as const

type RoundNumberLiteral = number

/** Ratings bands, evaluated highest first. Spec section 8. */
export const RATING_BANDS: readonly (readonly [number, string])[] = [
  [2.2, 'AAA'], [1.5, 'AA'], [1.2, 'A'],
  [1.0, 'BBB'], [0.8, 'BB'], [0.6, 'B'],
] as const
export const RATING_FLOOR = 'CCC'
```

- [ ] **Step 3: Write `core/state.ts`**

```ts
import type {
  ColorGroup, ContractId, DeedId, Era, Money,
  PlayerId, Phase, RoundNumber, SquareIndex,
} from './types.js'

export interface GameConfig {
  readonly turnOrder: readonly PlayerId[]
  readonly unlockMode: 'progressive' | 'all'
  readonly winCondition:
    | { readonly kind: 'fixed-rounds' }
    | { readonly kind: 'net-worth-target'; readonly target: Money }
}

export interface ActiveVenture {
  readonly kind: 'escort' | 'numbers' | 'chop-shop'
  readonly roundsRemaining: number
}

export interface PlayerState {
  readonly id: PlayerId
  readonly cleanCash: Money
  readonly dirtyCash: Money
  readonly heat: number
  readonly position: SquareIndex
  readonly inJail: boolean
  /** 0-2. A third consecutive double sends the player to Jail. Cannot be derived — the reducer has no log access. */
  readonly consecutiveDoubles: number
  readonly drawnCredit: Money
  readonly distressedDebt: Money
  /** Set permanently after defaulting on a peer loan. Halves borrowing base. */
  readonly creditImpaired: boolean
  readonly ventures: readonly ActiveVenture[]
  /** Round in which a margin call was flagged, or null if the player is clear. */
  readonly marginCallFlaggedAt: RoundNumber | null
  readonly launderedThisPhase: boolean
  readonly briberyUsedThisRound: boolean
  /**
   * True once the player takes a DELIBERATE dirty action this round. Set by the
   * reducer on any HeatChanged with a positive delta, which is exactly the set of
   * deliberate actions — so per spec 19.13 an automatic venture payout cannot
   * block Heat decay by construction.
   */
  readonly dirtyActionThisRound: boolean
  readonly insiderRevealedThisRound: boolean
  /** Set by a force-reroll bribe, consumed by the board context. */
  readonly rerollForced: boolean
  /** Set by a cancel-card bribe, consumed by the decks context. */
  readonly cardCancelled: boolean
}

export interface DeedState {
  readonly id: DeedId
  readonly square: SquareIndex
  readonly group: ColorGroup
  readonly faceValue: Money
  readonly houseCost: Money
  /** [unimproved, 1 house, 2, 3, 4, hotel]. Railroads and utilities use their own rules. */
  readonly rentTable: readonly Money[]
  readonly owner: PlayerId | 'bank' | null
  readonly mortgaged: boolean
  /** 0-4 houses, 5 represents a hotel. */
  readonly houses: number
}

export interface RentFuture {
  readonly id: ContractId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
}

export interface DeedOption {
  readonly id: ContractId
  readonly deed: DeedId
  readonly writer: PlayerId
  readonly holder: PlayerId
  /** Paid at origination. Refunded to the holder if the deed is force-liquidated. */
  readonly premium: Money
  readonly strike: Money
  readonly expiry: RoundNumber
}

export interface PeerLoan {
  readonly id: ContractId
  readonly lender: PlayerId
  readonly borrower: PlayerId
  readonly principal: Money
  readonly outstanding: Money
  readonly ratePerRound: number
  readonly maturesAtRound: RoundNumber
  readonly collateral: readonly DeedId[]
  readonly status: 'active' | 'repaid' | 'defaulted'
}

export type PoolAssetRef =
  | { readonly kind: 'peer-loan'; readonly id: ContractId }
  | { readonly kind: 'rent-future'; readonly id: ContractId }
  | { readonly kind: 'deed-option'; readonly id: ContractId }

export interface Tranche {
  readonly kind: 'senior' | 'mezzanine' | 'equity'
  readonly face: Money
  readonly paid: Money
  readonly holder: PlayerId
}

export interface Pool {
  readonly id: ContractId
  readonly originator: PlayerId
  readonly assets: readonly PoolAssetRef[]
  readonly tranches: readonly Tranche[]
  readonly terminated: boolean
}

export type SwapReference =
  | { readonly kind: 'peer-loan'; readonly id: ContractId }
  | { readonly kind: 'tranche'; readonly poolId: ContractId; readonly tranche: Tranche['kind'] }

export interface Swap {
  readonly id: ContractId
  readonly buyer: PlayerId
  readonly seller: PlayerId
  readonly reference: SwapReference
  readonly notional: Money
  readonly premiumPerRound: Money
  readonly status: 'active' | 'triggered' | 'expired'
}

export interface DraftSubmission {
  readonly player: PlayerId
  readonly ranked: readonly [DeedId, DeedId, DeedId]
  readonly maxBid: Money
}

export interface DraftState {
  readonly round: number
  readonly submissions: readonly DraftSubmission[]
  readonly complete: boolean
}

export interface DeckState {
  /** Shuffle order recorded as an event, so replay is exact. */
  readonly order: readonly number[]
  readonly drawn: number
}

export interface GameState {
  readonly config: GameConfig
  readonly phase: Phase
  readonly round: RoundNumber
  readonly era: Era
  readonly activePlayer: PlayerId | null
  readonly players: Readonly<Record<PlayerId, PlayerState>>
  readonly deeds: Readonly<Record<DeedId, DeedState>>
  readonly treasury: Money
  readonly housesRemaining: number
  readonly hotelsRemaining: number
  readonly draft: DraftState | null
  readonly futures: readonly RentFuture[]
  readonly options: readonly DeedOption[]
  readonly loans: readonly PeerLoan[]
  readonly pools: readonly Pool[]
  readonly swaps: readonly Swap[]
  readonly decks: Readonly<Record<Era, DeckState>>
}
```

- [ ] **Step 4: Write `core/errors.ts`**

```ts
export type RejectionCode =
  | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'INSUFFICIENT_CLEAN_CASH'
  | 'INSUFFICIENT_DIRTY_CASH' | 'INSUFFICIENT_BORROWING_BASE'
  | 'NOT_OWNER' | 'DEED_MORTGAGED' | 'DEED_ENCUMBERED' | 'DEED_UNAVAILABLE'
  | 'INSTRUMENT_LOCKED_THIS_ERA' | 'CONTRACT_NOT_FOUND' | 'INVALID_WINDOW'
  | 'BID_EXCEEDS_BUDGET' | 'BID_BELOW_FACE' | 'ALREADY_SUBMITTED'
  | 'INCOMPLETE_COLOUR_GROUP' | 'UNEVEN_BUILD' | 'NO_HOUSES_REMAINING'
  | 'ALREADY_LAUNDERED_THIS_PHASE' | 'BRIBERY_ALREADY_USED'
  | 'POOL_NEEDS_THREE_ASSETS' | 'TRANCHES_EXCEED_POOL' | 'NOT_ASSET_OWNER'
  | 'INVALID_DICE' | 'VENTURE_ALREADY_ACTIVE' | 'INVALID_BRIBERY_TARGET'
  | 'SELF_DEALING' | 'NEGATIVE_AMOUNT' | 'DUPLICATE_CONTRACT_ID'
  | 'ASSET_IN_LIVE_POOL' | 'ASSET_ALREADY_POOLED' | 'INVALID_LOAN_TERMS'
  | 'SWAP_NOTIONAL_EXCEEDS_FACE' | 'NO_HOTELS_REMAINING' | 'DEED_DEVELOPED'
  | 'NOT_BUILDABLE' | 'TRADE_NOT_CONFIRMED'

export interface Rejection {
  readonly rejected: true
  readonly code: RejectionCode
  /** Written for the player, not the developer. Shown directly in the UI. */
  readonly message: string
}

export function reject(code: RejectionCode, message: string): Rejection {
  return { rejected: true, code, message }
}

export function isRejection(value: unknown): value is Rejection {
  return typeof value === 'object' && value !== null && 'rejected' in value
}
```

- [ ] **Step 5: Write `core/events.ts`**

The complete event vocabulary. Later tasks add no new event types without updating this file and its test:

```ts
import type {
  ContractId, DeedId, DiceRoll, Era, Money,
  PlayerId, Phase, RoundNumber, SquareIndex,
} from './types.js'
import type { GameConfig, PoolAssetRef, SwapReference, Tranche } from './state.js'

/**
 * Every obligation the universal waterfall in spec 19.8 can capitalise.
 * A closed union so the reducer can dispatch and the facilitator can read
 * why a drawn balance moved.
 */
export type ObligationKind =
  | 'rent' | 'tax' | 'jail-fee' | 'interest' | 'carrying-cost'
  | 'audit-fine' | 'cds-premium' | 'peer-loan-interest'

/** Typed so the reducer never parses a display string. */
export type BriberyEffect =
  | { readonly kind: 'force-reroll'; readonly target: PlayerId }
  | { readonly kind: 'cancel-card' }
  | { readonly kind: 'delay-margin-call' }

export type GameEvent =
  // --- session ---
  | { type: 'GameCreated'; config: GameConfig }
  | { type: 'PhaseAdvanced'; phase: Phase }
  | { type: 'RoundAdvanced'; round: RoundNumber }
  | { type: 'EraAdvanced'; era: Era }
  | { type: 'GameScored'; netWorths: Readonly<Record<PlayerId, Money>> }

  // --- draft ---
  | { type: 'DraftSubmitted'; player: PlayerId; ranked: readonly DeedId[]; maxBid: Money }
  | { type: 'DraftDeedAwarded'; player: PlayerId; deed: DeedId; price: Money; contested: boolean }
  | { type: 'DraftRoundResolved'; round: RoundNumber }

  // --- movement ---
  | { type: 'DiceRolled'; player: PlayerId; dice: DiceRoll }
  | { type: 'TokenMoved'; player: PlayerId; from: SquareIndex; to: SquareIndex; passedGo: boolean }
  | { type: 'SentToJail'; player: PlayerId; reason: 'square' | 'triple-doubles' | 'card' }
  | { type: 'JailExited'; player: PlayerId; fee: Money }

  // --- money movement ---
  | { type: 'RentCharged'; from: PlayerId; to: PlayerId; deed: DeedId; amount: Money }
  | { type: 'RentRoutedToFuture'; contract: ContractId; holder: PlayerId; amount: Money }
  | { type: 'SalaryPaid'; player: PlayerId; amount: Money }
  | { type: 'TaxPaid'; player: PlayerId; amount: Money; kind: 'income' | 'luxury' }
  | { type: 'CarryingCostCharged'; player: PlayerId; deeds: number; amount: Money }

  // --- property ---
  | { type: 'HouseBuilt'; player: PlayerId; deed: DeedId; cost: Money }
  | { type: 'HouseSold'; player: PlayerId; deed: DeedId; proceeds: Money }
  | { type: 'DeedMortgaged'; player: PlayerId; deed: DeedId; proceeds: Money }
  | { type: 'DeedUnmortgaged'; player: PlayerId; deed: DeedId; cost: Money }
  | { type: 'DeedTraded'; from: PlayerId; to: PlayerId; deeds: readonly DeedId[]; cash: Money }

  // --- credit ---
  | { type: 'CreditDrawn'; player: PlayerId; amount: Money }
  | { type: 'CreditRepaid'; player: PlayerId; amount: Money }
  | { type: 'InterestAccrued'; player: PlayerId; amount: Money; rate: number }
  | { type: 'StimulusAdvanced'; player: PlayerId; amount: Money }
  | { type: 'ObligationCapitalised'; player: PlayerId; amount: Money
      obligation: ObligationKind }
  | { type: 'MarginCallFlagged'; player: PlayerId; shortfall: Money }
  | { type: 'MarginCallCured'; player: PlayerId }
  | { type: 'DeedLiquidated'; player: PlayerId; deed: DeedId; buyer: PlayerId | 'bank'; price: Money }
  | { type: 'DistressedDebtIncurred'; player: PlayerId; amount: Money }
  | { type: 'DistressedDebtAccrued'; player: PlayerId; amount: Money }

  // --- peer loans ---
  | { type: 'PeerLoanOriginated'; id: ContractId; lender: PlayerId; borrower: PlayerId
      principal: Money; ratePerRound: number; maturesAtRound: RoundNumber
      collateral: readonly DeedId[] }
  | { type: 'PeerLoanInterestPaid'; id: ContractId; amount: Money }
  | { type: 'PeerLoanRepaid'; id: ContractId; amount: Money }
  | { type: 'PeerLoanDefaulted'; id: ContractId; collateralTo: PlayerId; writtenOff: Money }
  | { type: 'PeerLoanSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }

  // --- markets ---
  | { type: 'RentFutureOriginated'; id: ContractId; deed: DeedId; holder: PlayerId
      startRound: RoundNumber; endRound: RoundNumber; price: Money }
  | { type: 'RentFutureSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
  | { type: 'RentFutureMadeWhole'; id: ContractId; amount: Money }
  | { type: 'RentFutureExpired'; id: ContractId }
  | { type: 'DeedOptionWritten'; id: ContractId; deed: DeedId; writer: PlayerId
      holder: PlayerId; premium: Money; strike: Money; expiry: RoundNumber }
  | { type: 'DeedOptionSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
  | { type: 'DeedOptionExercised'; id: ContractId; strikePaid: Money }
  | { type: 'DeedOptionExpired'; id: ContractId }

  // --- securitization ---
  | { type: 'PoolCreated'; id: ContractId; originator: PlayerId
      assets: readonly PoolAssetRef[]; tranches: readonly Tranche[] }
  | { type: 'TrancheSold'; poolId: ContractId; tranche: Tranche['kind']
      from: PlayerId; to: PlayerId; price: Money }
  | { type: 'WaterfallPaid'; poolId: ContractId; collected: Money
      distributions: readonly { tranche: Tranche['kind']; amount: Money }[] }
  | { type: 'PoolCollateralLiquidated'; poolId: ContractId; loanId: ContractId
      deeds: readonly DeedId[]; proceeds: Money }
  | { type: 'PoolTerminated'; poolId: ContractId
      shortfalls: readonly { tranche: Tranche['kind']; shortfall: Money }[] }
  | { type: 'SwapWritten'; id: ContractId; buyer: PlayerId; seller: PlayerId
      reference: SwapReference; notional: Money; premiumPerRound: Money }
  | { type: 'SwapPremiumPaid'; id: ContractId; amount: Money }
  | { type: 'SwapTriggered'; id: ContractId; payout: Money }
  | { type: 'SwapExpired'; id: ContractId }

  // --- underworld ---
  | { type: 'VentureLaunched'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      cost: Money; rounds: number; fundedFrom: 'clean' | 'dirty' }
  | { type: 'VentureTicked'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      roundsRemaining: number }
  | { type: 'SpeakeasyPlayed'; player: PlayerId; dice: DiceRoll; payout: Money
      fundedFrom: 'clean' | 'dirty' }
  | { type: 'DirtyCashEarned'; player: PlayerId; amount: Money
      source: 'escort' | 'numbers' | 'chop-shop' | 'speakeasy' }
  | { type: 'CashLaundered'; player: PlayerId; dirtyIn: Money; cleanOut: Money; haircut: number }
  | { type: 'HeatChanged'; player: PlayerId; delta: number; reason: string }
  | { type: 'AuditChecked'; player: PlayerId; dice: DiceRoll; heat: number; audited: boolean }
  | { type: 'AuditResolved'; player: PlayerId; seized: Money; fine: Money
      paidFromCash: Money; capitalised: Money }
  | { type: 'BriberyUsed'; player: PlayerId; cost: Money; effect: BriberyEffect }
  | { type: 'InsiderTradingUsed'; player: PlayerId; cost: Money
      fundedFrom: 'clean' | 'dirty' }

  // --- decks ---
  | { type: 'DeckShuffled'; era: Era; order: readonly number[] }
  | { type: 'CardDrawn'; era: Era; index: number; player: PlayerId }

export type EventType = GameEvent['type']

/** Every event carrying externally-sourced randomness. Used by the determinism test. */
export const STOCHASTIC_EVENTS: readonly EventType[] = [
  'DiceRolled', 'AuditChecked', 'SpeakeasyPlayed', 'DeckShuffled',
] as const
```

- [ ] **Step 6: Write the failing test**

`packages/engine/src/core/events.test.ts`. This test exists to make the event vocabulary a deliberate, reviewed surface rather than something that grows by accident:

```ts
import { describe, it, expect } from 'vitest'
import { STOCHASTIC_EVENTS } from './events.js'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../config/economy.js'

describe('event schema', () => {
  it('names every source of externally-supplied randomness', () => {
    expect([...STOCHASTIC_EVENTS].sort()).toEqual(
      ['AuditChecked', 'DeckShuffled', 'DiceRolled', 'SpeakeasyPlayed'],
    )
  })
})

describe('economy constants', () => {
  it('matches the simulated configuration in spec section 4', () => {
    expect(ECONOMY.STARTING_CASH).toBe(2500)
    expect(ECONOMY.GO_SALARY).toBe(350)
    expect(ECONOMY.CARRYING_COST_PER_DEED).toBe(8)
    expect(ECONOMY.DEED_ADVANCE_RATE).toBe(0.75)
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBe(0.5)
    expect(ECONOMY.TOTAL_ROUNDS).toBe(24)
  })

  it('orders rating bands from best to worst so first match wins', () => {
    const scores = RATING_BANDS.map(([score]) => score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(RATING_FLOOR).toBe('CCC')
  })

  it('keeps liquidation convergent', () => {
    // A forced sale must always NARROW the shortfall. It raises floor x face in
    // cash but removes advance x face from the borrowing base, so a floor below
    // the advance rate widens the gap on every sale and the loop never cures.
    expect(ECONOMY.LIQUIDATION_FLOOR).toBeGreaterThan(ECONOMY.DEED_ADVANCE_RATE)
    // Same class of bug for buildings: they must not advance more than they return.
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBeLessThanOrEqual(ECONOMY.BUILDING_SELLBACK_RATE)
  })

  it('reproduces the worked ratings example from spec section 8', () => {
    // Pool cashflow 1910, senior claim 700, concentration 0.76, leverage 3.8
    const score = (1910 / 700) * (1 - 0.25 * 0.76) / (1 + 0.1 * 3.8)
    const rating = RATING_BANDS.find(([min]) => score >= min)?.[1] ?? RATING_FLOOR
    expect(rating).toBe('AA')
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/core/events.test.ts`
Expected: FAIL — the modules do not exist yet if steps 1–5 were not saved, or PASS if they were. If it passes immediately, that is correct for a pure type-and-constant task; confirm by temporarily changing `STARTING_CASH` to 2400 and seeing the test fail, then change it back.

- [ ] **Step 8: Export the public surface**

`packages/engine/src/index.ts`:

```ts
export const ENGINE_VERSION = '0.1.0'

export * from './core/types.js'
export * from './core/state.js'
export * from './core/events.js'
export * from './core/errors.js'
export { ECONOMY, RATING_BANDS, RATING_FLOOR } from './config/economy.js'
```

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/core packages/engine/src/config packages/engine/src/index.ts
git commit -m "feat(engine): define core types, state shape and event schema

Establishes the vocabulary every bounded context codes against. All
economic constants are isolated in config/economy.ts and asserted
against the simulated configuration from spec section 4."
```

---

## Merge reconciliation — resolve these BEFORE executing any task

The task parts were authored in parallel against the contract above. Review found the
following collisions between them. **Each is a real defect that will fail the build or
silently corrupt state.** Resolve every one before starting Task 1.

| # | Defect | Resolution |
|---|---|---|
| 1 | `core/money.ts` is created twice — Task 2 Step 2 with `floorPercent`, Task 9 Step 1 with `applyRate`. Whichever lands second overwrites the first. | **Delete `applyRate`.** Task 2's basis-point implementation is canonical. Task 20 Step 6 performs the sweep. |
| 2 | Task 3 Step 4 writes `Math.floor(standardHouseCost * HOUSE_COST_MULTIPLIER)` — the exact pattern the global constraint bans. Values happen to be integral at 0.9, so it passes today. | Rewrite as `floorPercent(...)`. A retune to 0.85 would otherwise underpay silently. |
| 3 | Commands split their discriminant: some contexts use `type`, others `kind`. A root `decide` cannot dispatch across both. | **RESOLVED.** `type` everywhere. Fixed in code at Task 4 and across all plan parts. Data variants (`Target.kind`, `CardEffect.kind`, `Tranche.kind`, `BriberyEffect.kind`, `SquareKind`, and Task 20's `ScriptedAction.kind` test DSL) legitimately keep `kind` — they are payload unions, not commands. |
| 3b | `core/commands.ts` is listed in the plan's file structure but no task creates it. Without it there is no root `Command` union and no root `decide`. | **Task 19 owns it.** It already composes the Settlement fold and touches the root reducer. It creates `core/commands.ts` unioning every context's exported command type, plus a root `decide(state, command)` dispatching on `type`. |
| 4 | Two export-name collisions on the package surface: `prevailingRate` in both `session` and `credit`; `rentRecipient` in both `board` and `markets`. | Keep `prevailingRate` in `session`, `rentRecipient` in `markets`; the other two become internal. |
| 5 | `RejectionCode` is extended independently by five tasks, and `SWAP_NOTIONAL_EXCEEDS_FACE` is referenced but declared nowhere. | All codes live in Task 2's union. Add the missing one. |
| 6 | `isWholeDollars` is imported by Task 9 and defined by Task 20. | Move the definition to `core/money.ts` in Task 2. |
| 7 | Both `credit` and `session` define a `settlement.ts`. | Rename `credit`'s to `credit-settlement.ts`. Spec 19.1's ordering is owned by `session`. |
| 8 | Task 10 references a "NEW STATE FIELDS REQUIRED" section that does not exist; it needs `DeedOption.premium`, which `markets` owns. | Add `premium: Money` to `DeedOption` in `core/state.ts`. |
| 9 | Task 16's interface comment describes `creditHeadroom` as floored at zero; Task 10 needs it signed. | Return signed. Callers clamp. |
| 10 | Circular import risk: `markets` imports `board`, and `board`'s property actions need `markets` for make-whole and transferability. | Task 21's `PropertyPorts` injection, mirroring Task 9's `CreditPorts`. Do not import directly. |

Ten reducer defects in money conservation were found while authoring Task 20's ledger
and are fixed by its Steps 18–19. They are listed there rather than here because each
one is a change to a specific reducer, not a cross-file collision.

## Task index

| Task | Context | Deliverable | Part file |
|---|---|---|---|
| 1–2 | — | Scaffold, CI, core types, event schema, `core/money.ts` | this file |
| 3 | `config` | 40 squares, 28 deeds, rent tables | `parts/tasks-03-08.md` |
| 4 | `session` | Phases, rounds, eras, instrument gating | `parts/tasks-03-08.md` |
| 5 | `board` | Movement, jail, doubles, GO, taxes | `parts/tasks-03-08.md` |
| 6 | `board` | Rent: groups, railroads, utilities | `parts/tasks-03-08.md` |
| 7 | `board` | Markov landing model vs golden fixture | `parts/tasks-03-08.md` |
| 8 | `draft` | Ranked-triple submission and resolution | `parts/tasks-03-08.md` |
| 9 | `credit` | Base, draws, interest, carrying cost, stimulus | `parts/tasks-09-11.md` |
| 10 | `credit` | Margin calls, liquidation, distressed debt | `parts/tasks-09-11.md` |
| 11 | `credit` | Peer loans, default, note transfer | `parts/tasks-09-11.md` |
| 12 | `underworld` | Ventures, dirty cash, speakeasy | `parts/tasks-12-13.md` |
| 13 | `underworld` | Heat, laundering, audits, bribery | `parts/tasks-12-13.md` |
| 14 | `markets` | Rent futures, encumbrance, valuation | `parts/tasks-14-15.md` |
| 15 | `markets` | Deed options | `parts/tasks-14-15.md` |
| 16 | `securitization` | Pools, tranches, waterfall | `parts/tasks-16-17.md` |
| 17 | `securitization` | Ratings formula, CDS | `parts/tasks-16-17.md` |
| 18 | `decks` | Card effect interpreter, 80 cards | `parts/tasks-18-20.md` |
| 19 | `session` | Scoring, mark-to-model, win conditions | `parts/tasks-18-20.md` |
| 20 | tests | Property-based invariants | `parts/tasks-18-20.md` |
| 21 | `board` | Building, mortgaging, trading | `parts/tasks-21.md` |

**Task 20 must be extended to cover Task 21.** Task 20's fast-check generator was
authored before Task 21 existed and deliberately excludes building, mortgaging and
trading — its own coverage statement records this as "no task owns these deciders."
Task 21 now does. Unless Task 20's `ScriptedAction` union gains arms for
`build-house`, `sell-house`, `mortgage-deed`, `unmortgage-deed` and `trade-deeds`,
**no property test constrains the even-build rule, the 32-house/12-hotel supply, or
mortgage economics** — and those interact directly with money conservation, since
buildings advance 50% of cost into the borrowing base and return 50% in cash.
Execute Task 21 BEFORE Task 20, per the order below.

**Execution order.** Tasks 1–2 first and serially — they define the contract. Then
3, 4, 5, 6, 7, 8 (board and draft), then 9, 10, 11 (credit), then 12, 13
(underworld), then 14, 15 (markets), then 21 (property actions, needs both board and
markets), then 16, 17 (securitization), then 18, 19, and 20 last — the property suite
exercises everything.

| Task | Context | Deliverable |
|---|---|---|
| 3 | `config/board.ts` | 40 squares, 28 deeds, rent tables, verified against the golden fixture |
| 4 | `session` | Phase and round transitions, era advancement, instrument gating |
| 5 | `board` | Movement, jail, doubles, GO salary, taxes |
| 6 | `board` | Rent calculation including groups, railroads and utilities |
| 7 | `board` | Markov landing model, asserted against `tests/fixtures/landing-probabilities.json` |
| 8 | `draft` | Ranked-triple submission and collision resolution |
| 9 | `credit` | Borrowing base, draw and repay, interest, carrying cost |
| 10 | `credit` | Margin calls, forced liquidation, distressed debt |
| 11 | `credit` | Peer loans, interest, default, note transfer |
| 12 | `underworld` | Ventures, dirty cash accrual, speakeasy |
| 13 | `underworld` | Heat, laundering, audit checks and resolution |
| 14 | `markets` | Rent futures: origination, routing, encumbrance, make-whole |
| 15 | `markets` | Deed options |
| 16 | `securitization` | Pools, tranches, the waterfall |
| 17 | `securitization` | Ratings formula and CDS |
| 18 | `decks` | Card effect interpreter and the 80 authored cards |
| 19 | `session` | Scoring, mark-to-model, win conditions |
| 20 | property tests | Money conservation, replay identity, waterfall bounds |
