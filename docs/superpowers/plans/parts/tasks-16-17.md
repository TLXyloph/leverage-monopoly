## Tasks 16-17

`securitization` context — pools, tranches, the waterfall, ratings and credit default
swaps. Spec sections 8, 12, 19.1, 19.3 and 19.4 are the authority. Where this file and the
spec disagree, the spec wins and this file is wrong.

**Context layout produced by these two tasks:**

```
packages/engine/src/contexts/securitization/
  index.ts                public interface, the only file other contexts may import
  selectors.ts            pool/tranche/asset reads and the expected-cashflow model
  waterfall.ts            distribution, collection, collateral conversion, termination
  swaps.ts                CDS reference face, premiums, credit events
  ratings.ts              the deterministic ratings formula
  reduce.ts               (state, event) => state
  decide.ts               (state, command) => GameEvent[] | Rejection
  fixtures.ts             test-only state builders, NOT exported from index.ts
  securitization.test.ts  Task 16 — pools, waterfall, reducer, termination
  ratings.test.ts         Task 17 — the ratings formula
  swaps.test.ts           Task 17 — credit default swaps
```

`waterfall.ts` and `swaps.ts` are separate files from the outset, and the tests are split
three ways, because the combined surfaces would otherwise pass 500 lines. `fixtures.ts` is
a plain module rather than a test file so the three test files can share builders without
importing each other's `describe` blocks.

### Rounding, stated once and binding on both tasks

| Quantity | Direction |
|---|---|
| Waterfall distributions | **No rounding.** Every input is already an integer dollar amount and `distribute` only takes minima and subtracts, so the distributions sum to exactly the amount collected. |
| Collateral conversion, spec 19.4 | `floorPercent(deed.faceValue, ECONOMY.LIQUIDATION_FLOOR)` **per deed**, then summed. Never floor the sum. |
| Peer-loan expected cashflow | `floorPercent(outstanding, ratePerRound)` per round, then multiplied by rounds remaining. |
| Rent-future / deed-option expected cashflow | Already integer dollars from `markets`. No further rounding. |
| CDS collateral posted | `floorPercent(notional, ECONOMY.CDS_COLLATERAL_RATE)` |
| CDS payout | Exactly `swap.notional`. Integer by construction. |
| CDS premium | Exactly `swap.premiumPerRound`. Integer by construction. |
| `coverage`, `concentration`, `leverage`, `score` | **Not money.** Full IEEE-754 precision, never rounded at any stage. Only their money inputs are integers. |

`floorPercent` is a required new core helper, not decoration. `Math.floor(180 * 0.7)` is
**125**, because `180 * 0.7 === 125.99999999999999` in IEEE-754. St. James Place, Tennessee
Avenue and New York Avenue all cost $180, and Park Place costs $350 — where
`Math.floor(350 * 0.7)` is **244**. A naive floor silently underpays the liquidation floor
on real board deeds, in this context and identically in `credit`'s forced liquidation.
Task 16 Step 1 adds it to `core/`, and `credit` must use the same helper so the two paths
can never disagree.

### Dependency prerequisite

These tasks import `credit`, `markets` and `session` **only through their `index.ts`**.
Tasks 09–11 (`credit`) and 14–15 (`markets`) should be merged first. If Wave 3 runs them in
parallel, create `contexts/credit/index.ts` and `contexts/markets/index.ts` **only if
absent**, containing exactly the signatures in the Interfaces blocks below with
`throw new Error('not implemented')` bodies, and delete those stubs at merge. Every unit
test below mocks all three modules, so nothing in these two tasks depends on the sibling
implementations being correct — only on the signatures matching.

---

### Task 16: `securitization` — pools, tranches and the waterfall

**Files:**
- Create: `packages/engine/src/core/money.ts` (the `floorPercent` helper)
- Modify: `packages/engine/src/core/events.ts` (one new event, listed at the end of this file)
- Modify: `packages/engine/src/core/errors.ts` (two new rejection codes)
- Modify: `packages/engine/src/index.ts` (export `floorPercent`)
- Create: `packages/engine/src/contexts/securitization/fixtures.ts`
- Create: `packages/engine/src/contexts/securitization/selectors.ts`
- Create: `packages/engine/src/contexts/securitization/waterfall.ts`
- Create: `packages/engine/src/contexts/securitization/reduce.ts`
- Create: `packages/engine/src/contexts/securitization/decide.ts`
- Create: `packages/engine/src/contexts/securitization/index.ts`
- Test: `packages/engine/src/contexts/securitization/securitization.test.ts`

**Interfaces:**

- Consumes, from Task 2 (`core/`), unchanged and never redefined:

```ts
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type {
  DeedState, GameState, PeerLoan, Pool, PoolAssetRef, Tranche,
} from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { reject, type Rejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
```

- Consumes, from `contexts/credit/index.js` (tasks 09–11). **These are the exact
  signatures assumed; reconcile at merge:**

```ts
/** Deed face x DEED_ADVANCE_RATE + building cost x BUILDING_ADVANCE_RATE, halved when
 *  `creditImpaired`, already NET of `swapCollateralPosted`. Integer dollars. */
export function borrowingBase(state: GameState, player: PlayerId): Money

/** The player's currently drawn credit-line balance. Integer dollars. */
export function drawnCredit(state: GameState, player: PlayerId): Money

/** borrowingBase(state, p) - drawnCredit(state, p), floored at 0. Integer dollars. */
export function creditHeadroom(state: GameState, player: PlayerId): Money

/** Sum over active swaps where seller === player of
 *  floorPercent(notional, ECONOMY.CDS_COLLATERAL_RATE). It lives in `credit` because
 *  `credit` owns borrowingBase and the dependency arrow points securitization -> credit,
 *  never back; `credit` derives it from `state.swaps`, which is core state, not a context
 *  import. Spec section 12: this reduces borrowing base, not net worth. */
export function swapCollateralPosted(state: GameState, player: PlayerId): Money

/** Lookup by contract id, or undefined. Does not filter on status. */
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined
```

- Consumes, from `contexts/markets/index.js` (tasks 14–15). **Exact signatures assumed:**

```ts
export function findRentFuture(state: GameState, id: ContractId): RentFuture | undefined
export function findDeedOption(state: GameState, id: ContractId): DeedOption | undefined

/** Remaining expected value over the unexpired window, from the Markov landing model.
 *  Integer dollars, already floored. 0 once the window has passed. Spec section 6. */
export function rentFutureExpectedValue(state: GameState, id: ContractId): Money

/** max(0, deed face value - strike). Integer dollars. Spec section 12. */
export function deedOptionMark(state: GameState, id: ContractId): Money
```

- Consumes, from `contexts/session/index.js` (task 4):

```ts
export type Instrument =
  | 'credit-line' | 'peer-loan' | 'rent-future' | 'deed-option'
  | 'venture' | 'laundering' | 'bribery' | 'insider-trading'
  | 'pool' | 'swap'

/** true when config.unlockMode === 'all', otherwise gated on state.era per spec section 2.
 *  'pool' and 'swap' unlock in Era III. */
export function instrumentUnlocked(state: GameState, instrument: Instrument): boolean
```

- Produces, exported from `contexts/securitization/index.ts`:

```ts
export function findPool(state: GameState, id: ContractId): Pool | undefined
export function trancheOf(pool: Pool, kind: Tranche['kind']): Tranche | undefined
export function trancheFace(pool: Pool, kind: Tranche['kind']): Money
export function cumulativeClaim(pool: Pool, kind: Tranche['kind']): Money
export function isRetired(t: Tranche): boolean
export function assetKey(ref: PoolAssetRef): string
export function pooledAssetKeys(state: GameState): ReadonlySet<string>
export function assetObligor(state: GameState, ref: PoolAssetRef): PlayerId | null
export function expectedLoanCashflow(loan: PeerLoan, round: RoundNumber): Money
export function expectedAssetCashflow(state: GameState, ref: PoolAssetRef): Money
export function expectedPoolCashflow(state: GameState, pool: Pool): Money
export function assetIsResolved(state: GameState, ref: PoolAssetRef): boolean
export function poolIsExhausted(state: GameState, pool: Pool): boolean

export interface Distribution {
  readonly tranche: Tranche['kind']
  readonly amount: Money
}
export function distribute(pool: Pool, collected: Money): readonly Distribution[]
export function collectedThisRound(pool: Pool, roundEvents: readonly GameEvent[]): Money
export function collateralLiquidationEvents(
  state: GameState, roundEvents: readonly GameEvent[],
): readonly GameEvent[]
export function waterfallEvents(
  state: GameState, roundEvents: readonly GameEvent[],
): readonly GameEvent[]

/** Settlement step 6, spec 19.1. `roundEvents` is every event emitted since this round's
 *  Market phase began, so rent routed during Movement is visible here. */
export function settleSecuritization(
  state: GameState, roundEvents: readonly GameEvent[],
): readonly GameEvent[]

/** The extra round-24 step in spec 19.1: every live pool terminates regardless of assets. */
export function terminateAllPools(state: GameState): readonly GameEvent[]

export function reduceSecuritization(state: GameState, event: GameEvent): GameState
export type SecuritizationCommand = CreatePoolCommand | SellTrancheCommand   // + WriteSwapCommand in Task 17
export function decideSecuritization(
  state: GameState, command: SecuritizationCommand,
): readonly GameEvent[] | Rejection
```

- Produces, for other contexts at merge: `pooledAssetKeys` is the guard `markets` and
  `credit` need so a note, future or option **inside a live pool cannot be sold or
  transferred out from under the waterfall**. Because the dependency arrow forbids them
  importing `securitization`, they derive the same set from `state.pools` directly.
  Recorded here so the rule is not lost at merge.

---

- [ ] **Step 1: Create the integer-safe percentage helper**

`packages/engine/src/core/money.ts`:

```ts
import type { Money } from './types.js'

/**
 * `amount * rate`, floored to whole dollars, without IEEE-754 representation error.
 *
 * A plain `Math.floor(180 * 0.7)` is 125, not 126, because `180 * 0.7` evaluates to
 * 125.99999999999999. Three deeds on the board cost $180 and Park Place costs $350, where
 * the same defect loses another dollar, so every percentage-of-money rule in the engine
 * routes through here: the liquidation floor, peer-loan interest, CDS collateral,
 * mortgage proceeds and the laundering haircut.
 *
 * Rounding direction is always DOWN, after the representation error is removed.
 */
export function floorPercent(amount: Money, rate: number): Money {
  return Math.floor(Math.round(amount * rate * 1e6) / 1e6)
}
```

Add to `packages/engine/src/index.ts`:

```ts
export { floorPercent } from './core/money.js'
```

- [ ] **Step 2: Add the one new event to the core event schema**

In `packages/engine/src/core/events.ts`, inside the `// --- securitization ---` block,
immediately after `WaterfallPaid`:

```ts
  | { type: 'PoolCollateralLiquidated'; poolId: ContractId; loanId: ContractId
      deeds: readonly DeedId[]; proceeds: Money }
```

Spec 19.4 needs this. `PeerLoanDefaulted` sends collateral to a `PlayerId` lender and
carries no cash figure; `DeedLiquidated` belongs to `credit`'s margin-call path where its
proceeds pay down a drawn balance. Neither can express "deeds to the bank at the
liquidation floor, cash into this pool".

- [ ] **Step 3: Add the two new rejection codes**

In `packages/engine/src/core/errors.ts`, extend `RejectionCode`:

```ts
  | 'ASSET_ALREADY_POOLED' | 'POOL_TERMINATED'
```

- [ ] **Step 4: Write the shared test fixtures**

`packages/engine/src/contexts/securitization/fixtures.ts`. Deliberately imports nothing
from any context, so it is unaffected by the `vi.mock` hoisting in the test files. It is
**not** re-exported from `index.ts`:

```ts
import type { ContractId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import type {
  DeedState, GameState, PeerLoan, PlayerState, Pool, PoolAssetRef, Swap, Tranche,
} from '../../core/state.js'
import { ECONOMY } from '../../config/economy.js'

export function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  const base: PlayerState = {
    id, cleanCash: 1000, dirtyCash: 0, heat: 0, position: 0, inJail: false,
    drawnCredit: 0, distressedDebt: 0, creditImpaired: false, ventures: [],
    draftBudget: 0, marginCallFlaggedAt: null, launderedThisPhase: false,
    briberyUsedThisRound: false,
  }
  return { ...base, ...over }
}

export function makeDeed(id: string, faceValue: Money, owner: PlayerId | 'bank' | null): DeedState {
  return {
    id, square: 16, group: 'orange', faceValue, houseCost: 100,
    rentTable: [14, 70, 200, 550, 750, 950], owner, mortgaged: false, houses: 0,
  }
}

export function makeLoan(over: Partial<PeerLoan> & { id: ContractId }): PeerLoan {
  const base: PeerLoan = {
    id: over.id, lender: 'P1', borrower: 'P2', principal: 500, outstanding: 500,
    ratePerRound: 0.1, maturesAtRound: 15, collateral: [], status: 'active',
  }
  return { ...base, ...over }
}

export function makeTranches(
  senior: Money, mezzanine: Money, equity: Money, holder: PlayerId = 'P1',
): readonly Tranche[] {
  return [
    { kind: 'senior', face: senior, paid: 0, holder },
    { kind: 'mezzanine', face: mezzanine, paid: 0, holder },
    { kind: 'equity', face: equity, paid: 0, holder },
  ]
}

export const THREE_LOANS: readonly PoolAssetRef[] = [
  { kind: 'peer-loan', id: 'l-1' },
  { kind: 'peer-loan', id: 'l-2' },
  { kind: 'peer-loan', id: 'l-3' },
]

export function makePool(over: Partial<Pool> = {}): Pool {
  const base: Pool = {
    id: 'pool-1', originator: 'P1', assets: THREE_LOANS,
    tranches: makeTranches(600, 500, 810), terminated: false,
  }
  return { ...base, ...over }
}

export function makeSwap(over: Partial<Swap> & { id: ContractId }): Swap {
  const base: Swap = {
    id: over.id, buyer: 'P3', seller: 'P4',
    reference: { kind: 'peer-loan', id: 'l-1' },
    notional: 400, premiumPerRound: 40, status: 'active',
  }
  return { ...base, ...over }
}

export function makeState(over: Partial<GameState> = {}): GameState {
  const base: GameState = {
    config: { turnOrder: PLAYER_IDS, unlockMode: 'all', winCondition: { kind: 'fixed-rounds' } },
    phase: 'open', round: 13, era: 3, activePlayer: null,
    players: {
      P1: makePlayer('P1'), P2: makePlayer('P2'),
      P3: makePlayer('P3'), P4: makePlayer('P4'),
    },
    deeds: {}, treasury: 0,
    housesRemaining: ECONOMY.HOUSE_SUPPLY, hotelsRemaining: ECONOMY.HOTEL_SUPPLY,
    draft: null, futures: [], options: [], loans: [], pools: [], swaps: [],
    decks: {
      1: { order: [], drawn: 0 }, 2: { order: [], drawn: 0 },
      3: { order: [], drawn: 0 }, 4: { order: [], drawn: 0 },
    },
  }
  return { ...base, ...over }
}

/** The three loans whose expected cashflow is exactly $1,910 at round 13. */
export function loansTotalling1910(): readonly PeerLoan[] {
  return [
    makeLoan({ id: 'l-1', outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }), // 600
    makeLoan({ id: 'l-2', outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }), // 600
    makeLoan({ id: 'l-3', outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15 }), // 710
  ]
}
```

- [ ] **Step 5: Write the failing test for pool and tranche reads**

`packages/engine/src/contexts/securitization/securitization.test.ts`. The mock factories
are the executable statement of the sibling-context contract:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type { GameState, Pool, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { PLAYER_IDS } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'

vi.mock('../credit/index.js', () => ({
  borrowingBase: vi.fn(),
  drawnCredit: vi.fn(),
  creditHeadroom: vi.fn(),
  swapCollateralPosted: vi.fn(),
  findPeerLoan: vi.fn(),
}))
vi.mock('../markets/index.js', () => ({
  findRentFuture: vi.fn(),
  findDeedOption: vi.fn(),
  rentFutureExpectedValue: vi.fn(),
  deedOptionMark: vi.fn(),
}))
vi.mock('../session/index.js', () => ({ instrumentUnlocked: vi.fn() }))

import {
  borrowingBase, creditHeadroom, drawnCredit, findPeerLoan, swapCollateralPosted,
} from '../credit/index.js'
import {
  deedOptionMark, findDeedOption, findRentFuture, rentFutureExpectedValue,
} from '../markets/index.js'
import { instrumentUnlocked } from '../session/index.js'
import {
  loansTotalling1910, makeDeed, makeLoan, makePlayer, makePool, makeState, makeTranches,
  THREE_LOANS,
} from './fixtures.js'
import {
  cumulativeClaim, expectedPoolCashflow, findPool, isRetired, trancheFace,
} from './selectors.js'

beforeEach(() => {
  vi.mocked(findPeerLoan).mockImplementation((state, id) => state.loans.find((l) => l.id === id))
  vi.mocked(findRentFuture).mockImplementation((state, id) => state.futures.find((f) => f.id === id))
  vi.mocked(findDeedOption).mockImplementation((state, id) => state.options.find((o) => o.id === id))
  vi.mocked(rentFutureExpectedValue).mockReturnValue(0)
  vi.mocked(deedOptionMark).mockReturnValue(0)
  vi.mocked(borrowingBase).mockReturnValue(0)
  vi.mocked(drawnCredit).mockReturnValue(0)
  vi.mocked(creditHeadroom).mockReturnValue(0)
  vi.mocked(swapCollateralPosted).mockReturnValue(0)
  vi.mocked(instrumentUnlocked).mockReturnValue(true)
})

describe('pool and tranche reads', () => {
  const pool = makePool()

  it('finds a pool by contract id', () => {
    const state = makeState({ pools: [pool] })
    expect(findPool(state, 'pool-1')?.originator).toBe('P1')
    expect(findPool(state, 'pool-9')).toBeUndefined()
  })

  it('accumulates the claim standing ahead of and including each tranche', () => {
    expect(trancheFace(pool, 'senior')).toBe(600)
    expect(cumulativeClaim(pool, 'senior')).toBe(600)
    expect(cumulativeClaim(pool, 'mezzanine')).toBe(1100)
    expect(cumulativeClaim(pool, 'equity')).toBe(1910)
  })

  it('retires senior and mezzanine at face but never retires equity', () => {
    expect(isRetired({ kind: 'senior', face: 600, paid: 600, holder: 'P2' })).toBe(true)
    expect(isRetired({ kind: 'senior', face: 600, paid: 599, holder: 'P2' })).toBe(false)
    expect(isRetired({ kind: 'equity', face: 810, paid: 99_999, holder: 'P2' })).toBe(false)
  })

  it('sums expected cashflow across the pooled peer loans', () => {
    // 500 @ 10%/round with 2 rounds to run -> 500 + 50*2  = 600
    // 592 @ 10%/round with 2 rounds to run -> 592 + 59*2  = 710
    const state = makeState({ loans: loansTotalling1910(), pools: [pool] })
    expect(expectedPoolCashflow(state, pool)).toBe(1910)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `./selectors.js` cannot be resolved.

- [ ] **Step 7: Write `selectors.ts`**

`packages/engine/src/contexts/securitization/selectors.ts`:

```ts
import type { ContractId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState, PeerLoan, Pool, PoolAssetRef, Tranche } from '../../core/state.js'
import { floorPercent } from '../../core/money.js'
import { findPeerLoan } from '../credit/index.js'
import {
  deedOptionMark, findDeedOption, findRentFuture, rentFutureExpectedValue,
} from '../markets/index.js'

export function findPool(state: GameState, id: ContractId): Pool | undefined {
  return state.pools.find((p) => p.id === id)
}

export function trancheOf(pool: Pool, kind: Tranche['kind']): Tranche | undefined {
  return pool.tranches.find((t) => t.kind === kind)
}

export function trancheFace(pool: Pool, kind: Tranche['kind']): Money {
  return trancheOf(pool, kind)?.face ?? 0
}

/**
 * The claim standing ahead of and including this tranche, for the coverage formula.
 * Equity carries a stored face equal to its spec 19.3 residual claim, so the cumulative
 * claim through equity is the pool's expected cashflow as measured at creation, and its
 * coverage evaluates to approximately 1.0.
 */
export function cumulativeClaim(pool: Pool, kind: Tranche['kind']): Money {
  const senior = trancheFace(pool, 'senior')
  if (kind === 'senior') return senior
  const throughMezz = senior + trancheFace(pool, 'mezzanine')
  if (kind === 'mezzanine') return throughMezz
  return throughMezz + trancheFace(pool, 'equity')
}

/** Equity is an uncapped residual: it keeps receiving past its face and never retires. */
export function isRetired(t: Tranche): boolean {
  return t.kind !== 'equity' && t.paid >= t.face
}

export function assetKey(ref: PoolAssetRef): string {
  return `${ref.kind}:${ref.id}`
}

/** Every asset currently locked inside a live pool. */
export function pooledAssetKeys(state: GameState): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const pool of state.pools) {
    if (pool.terminated) continue
    for (const ref of pool.assets) keys.add(assetKey(ref))
  }
  return keys
}

/**
 * The player standing behind an asset's cashflow, for concentration and leverage.
 * A loan's obligor is its borrower. A rent future's obligor is the deed's owner, because
 * that owner's building and mortgaging decisions govern the cashflow. A deed option's
 * obligor is its writer, who must deliver the deed on exercise.
 */
export function assetObligor(state: GameState, ref: PoolAssetRef): PlayerId | null {
  if (ref.kind === 'peer-loan') return findPeerLoan(state, ref.id)?.borrower ?? null
  if (ref.kind === 'rent-future') {
    const future = findRentFuture(state, ref.id)
    if (future === undefined) return null
    const owner = state.deeds[future.deed]?.owner
    return owner === undefined || owner === null || owner === 'bank' ? null : owner
  }
  return findDeedOption(state, ref.id)?.writer ?? null
}

/** Outstanding plus simple interest for every round left to run. Interest floors per round. */
export function expectedLoanCashflow(loan: PeerLoan, round: RoundNumber): Money {
  if (loan.status !== 'active') return 0
  const roundsRemaining = Math.max(0, loan.maturesAtRound - round)
  return loan.outstanding + floorPercent(loan.outstanding, loan.ratePerRound) * roundsRemaining
}

export function expectedAssetCashflow(state: GameState, ref: PoolAssetRef): Money {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined ? 0 : expectedLoanCashflow(loan, state.round)
  }
  if (ref.kind === 'rent-future') return rentFutureExpectedValue(state, ref.id)
  // A pooled deed option contributes its spec section 12 mark to expected cashflow. It
  // produces waterfall cash only if it is resold while pooled; exercising it yields a
  // deed, and deeds cannot be distributed through a waterfall.
  return deedOptionMark(state, ref.id)
}

export function expectedPoolCashflow(state: GameState, pool: Pool): Money {
  return pool.assets.reduce((sum, ref) => sum + expectedAssetCashflow(state, ref), 0)
}

/** An asset has run its course when it has matured, defaulted, expired or vanished. */
export function assetIsResolved(state: GameState, ref: PoolAssetRef): boolean {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined || loan.status !== 'active'
  }
  if (ref.kind === 'rent-future') {
    const future = findRentFuture(state, ref.id)
    return future === undefined || future.endRound <= state.round
  }
  const option = findDeedOption(state, ref.id)
  return option === undefined || option.expiry <= state.round
}

export function poolIsExhausted(state: GameState, pool: Pool): boolean {
  return !pool.terminated && pool.assets.every((ref) => assetIsResolved(state, ref))
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Pin the `floorPercent` behaviour that motivates it**

Append to `securitization.test.ts`:

```ts
import { floorPercent } from '../../core/money.js'

describe('floorPercent', () => {
  it('does not lose a dollar to IEEE-754 on real board deed prices', () => {
    // Math.floor(180 * 0.7) is 125 and Math.floor(350 * 0.7) is 244.
    expect(floorPercent(180, ECONOMY.LIQUIDATION_FLOOR)).toBe(126)
    expect(floorPercent(350, ECONOMY.LIQUIDATION_FLOOR)).toBe(245)
    expect(floorPercent(400, ECONOMY.LIQUIDATION_FLOOR)).toBe(280)
  })

  it('still rounds genuinely fractional results down', () => {
    expect(floorPercent(125, ECONOMY.LIQUIDATION_FLOOR)).toBe(87) // 87.5
    expect(floorPercent(592, 0.1)).toBe(59)                       // 59.2
  })
})
```

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/core/ packages/engine/src/index.ts \
        packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): pool selectors, cashflow model, floorPercent helper

Equity carries a stored face equal to its spec 19.3 residual claim so the
coverage denominator is well defined, but it never retires: it is an
uncapped residual for the life of the pool.

floorPercent exists because Math.floor(180 * 0.7) is 125, and three deeds
on the board cost 180. credit must use the same helper for the forced
liquidation floor so the two paths cannot disagree."
```

- [ ] **Step 11: Write the failing test for the waterfall's strict priority**

Append to `securitization.test.ts`:

```ts
import { distribute } from './waterfall.js'

describe('waterfall priority', () => {
  const fresh = makePool()

  it('pays senior first and stops there when cash runs out', () => {
    expect(distribute(fresh, 400)).toEqual([{ tranche: 'senior', amount: 400 }])
  })

  it('fills senior to face then spills into mezzanine', () => {
    expect(distribute(fresh, 900)).toEqual([
      { tranche: 'senior', amount: 600 },
      { tranche: 'mezzanine', amount: 300 },
    ])
  })

  it('gives the whole residual to equity once senior and mezzanine are satisfied', () => {
    expect(distribute(fresh, 2000)).toEqual([
      { tranche: 'senior', amount: 600 },
      { tranche: 'mezzanine', amount: 500 },
      { tranche: 'equity', amount: 900 },
    ])
  })

  it('skips a retired tranche and pays only the unpaid remainder of the next', () => {
    const partial = makePool({
      tranches: [
        { kind: 'senior', face: 600, paid: 600, holder: 'P2' },
        { kind: 'mezzanine', face: 500, paid: 450, holder: 'P3' },
        { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
      ],
    })
    expect(distribute(partial, 200)).toEqual([
      { tranche: 'mezzanine', amount: 50 },
      { tranche: 'equity', amount: 150 },
    ])
  })

  it('distributes nothing when nothing was collected', () => {
    expect(distribute(fresh, 0)).toEqual([])
  })
})
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `./waterfall.js` cannot be resolved.

- [ ] **Step 13: Write `distribute` in `waterfall.ts`**

`packages/engine/src/contexts/securitization/waterfall.ts`:

```ts
import type { Money } from '../../core/types.js'
import type { GameState, Pool, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import { findPeerLoan } from '../credit/index.js'
import { assetKey, poolIsExhausted, trancheOf } from './selectors.js'
import { reduceSecuritization } from './reduce.js'

export interface Distribution {
  readonly tranche: Tranche['kind']
  readonly amount: Money
}

/**
 * Strict priority, spec section 8: senior to its remaining face, then mezzanine to its
 * remaining face, then equity takes the residual. No rounding occurs; every figure is
 * already an integer dollar amount and the function only takes minima and subtracts, so
 * the distributions can never sum above `collected`.
 */
export function distribute(pool: Pool, collected: Money): readonly Distribution[] {
  let remaining = Math.max(0, Math.floor(collected))
  const out: Distribution[] = []

  for (const kind of ['senior', 'mezzanine'] as const) {
    if (remaining <= 0) break
    const t = trancheOf(pool, kind)
    if (t === undefined) continue
    const owed = Math.max(0, t.face - t.paid)
    const paid = Math.min(owed, remaining)
    if (paid > 0) {
      out.push({ tranche: kind, amount: paid })
      remaining -= paid
    }
  }

  if (remaining > 0 && trancheOf(pool, 'equity') !== undefined) {
    out.push({ tranche: 'equity', amount: remaining })
    remaining = 0
  }

  return out
}
```

The `reduceSecuritization` import is used from Step 20 onward; add it now so the import
block is written once. `reduce.ts` imports only core modules, so there is no cycle.

- [ ] **Step 14: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL on module resolution until `reduce.ts` exists. Comment out the
`reduceSecuritization` import for now and re-run; expected PASS, 11 tests. Restore the
import at Step 20.

- [ ] **Step 15: Write the explicit bound test — the waterfall never over-distributes**

This is the spec section 15 invariant, asserted here at the unit level as well as in the
property suite of Task 20. Append to `securitization.test.ts`:

```ts
describe('waterfall bound', () => {
  const money = fc.integer({ min: 0, max: 20_000 })

  it('never distributes more than the pool collected, for any pool and any collection', () => {
    fc.assert(
      fc.property(
        money, money, money, money, money, money,
        (seniorFace, seniorPaid, mezzFace, mezzPaid, equityFace, collected) => {
          const pool = makePool({
            tranches: [
              { kind: 'senior', face: seniorFace, paid: seniorPaid, holder: 'P2' },
              { kind: 'mezzanine', face: mezzFace, paid: mezzPaid, holder: 'P3' },
              { kind: 'equity', face: equityFace, paid: 0, holder: 'P1' },
            ],
          })
          const total = distribute(pool, collected).reduce((s, d) => s + d.amount, 0)
          return total <= collected
        },
      ),
      { numRuns: 500 },
    )
  })

  it('distributes exactly what was collected, because equity is uncapped', () => {
    const pool = makePool()
    for (const collected of [1, 599, 600, 601, 1100, 1101, 5000]) {
      const total = distribute(pool, collected).reduce((s, d) => s + d.amount, 0)
      expect(total).toBe(collected)
    }
  })
})
```

- [ ] **Step 16: Run the bound test**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS. To confirm the property has teeth, temporarily change
`Math.min(owed, remaining)` to `Math.min(owed, remaining) + 1` and watch it fail, then
change it back.

- [ ] **Step 17: Commit**

```bash
git add packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): waterfall distribution in strict tranche priority

Distributions sum to exactly the amount collected because equity is an
uncapped residual, which makes the spec section 15 bound an equality."
```

- [ ] **Step 18: Write the failing test for collection and spec 19.4 collateral conversion**

Append to `securitization.test.ts`:

```ts
import { collateralLiquidationEvents, collectedThisRound } from './waterfall.js'

describe('pool collection', () => {
  const pool = makePool({
    assets: [
      { kind: 'peer-loan', id: 'l-1' },
      { kind: 'peer-loan', id: 'l-2' },
      { kind: 'rent-future', id: 'f-1' },
    ],
  })

  it('collects interest, repayments and routed rent from its own assets only', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 50 },
      { type: 'PeerLoanInterestPaid', id: 'l-9', amount: 999 },
      { type: 'PeerLoanRepaid', id: 'l-2', amount: 500 },
      { type: 'RentRoutedToFuture', contract: 'f-1', holder: 'P1', amount: 120 },
      { type: 'RentRoutedToFuture', contract: 'f-9', holder: 'P4', amount: 999 },
    ]
    expect(collectedThisRound(pool, roundEvents)).toBe(670)
  })

  it('counts liquidated collateral proceeds tagged to this pool', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1', deeds: ['a'], proceeds: 140 },
      { type: 'PoolCollateralLiquidated', poolId: 'pool-2', loanId: 'l-7', deeds: ['b'], proceeds: 999 },
    ]
    expect(collectedThisRound(pool, roundEvents)).toBe(140)
  })

  it('converts a defaulted pooled loan\'s collateral to cash at the liquidation floor', () => {
    // Spec 19.4: deeds cannot be distributed through a waterfall, only cash.
    const state = makeState({
      deeds: {
        'st-james-place': makeDeed('st-james-place', 180, 'P2'),
        'tennessee-avenue': makeDeed('tennessee-avenue', 180, 'P2'),
        'boardwalk': makeDeed('boardwalk', 400, 'P2'),
      },
      loans: [
        makeLoan({ id: 'l-1', collateral: ['st-james-place', 'tennessee-avenue'] }),
        makeLoan({ id: 'l-2', collateral: ['boardwalk'] }),
      ],
      pools: [pool],
    })
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 300 },
    ]
    expect(collateralLiquidationEvents(state, roundEvents)).toEqual([
      {
        type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1',
        deeds: ['st-james-place', 'tennessee-avenue'],
        proceeds: 252, // floorPercent(180, 0.7) = 126, per deed, then summed
      },
    ])
  })

  it('emits nothing for a defaulted loan that is not inside a pool', () => {
    const state = makeState({
      deeds: { 'boardwalk': makeDeed('boardwalk', 400, 'P2') },
      loans: [makeLoan({ id: 'l-8', collateral: ['boardwalk'] })],
      pools: [pool],
    })
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-8', collateralTo: 'P1', writtenOff: 500 },
    ]
    expect(collateralLiquidationEvents(state, roundEvents)).toEqual([])
  })
})
```

- [ ] **Step 19: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `collectedThisRound` and `collateralLiquidationEvents` are not exported.

- [ ] **Step 20: Implement collection and collateral conversion**

Append to `waterfall.ts` (its imports are already in place from Step 13; restore the
`reduceSecuritization` import now):

```ts
/**
 * All cash the pool's underlying assets collected this round. Derived from the round's
 * events rather than stored on the pool, because rent routes to a future during Movement
 * while loan interest falls due at Settlement step 5, and both must land in the same
 * waterfall.
 */
export function collectedThisRound(pool: Pool, roundEvents: readonly GameEvent[]): Money {
  const keys = new Set(pool.assets.map(assetKey))
  let total = 0
  for (const e of roundEvents) {
    switch (e.type) {
      case 'PeerLoanInterestPaid':
      case 'PeerLoanRepaid':
        if (keys.has(`peer-loan:${e.id}`)) total += e.amount
        break
      case 'RentRoutedToFuture':
        if (keys.has(`rent-future:${e.contract}`)) total += e.amount
        break
      case 'PoolCollateralLiquidated':
        if (e.poolId === pool.id) total += e.proceeds
        break
      default:
        break
    }
  }
  return total
}

/**
 * Spec 19.4. A peer loan inside a pool defaulted this round, so its collateral deeds are
 * sold to the bank at ECONOMY.LIQUIDATION_FLOOR of face and the cash enters the pool's
 * collected cash for this round's waterfall. Floors per deed, then sums.
 */
export function collateralLiquidationEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const defaulted = new Set(
    roundEvents.filter((e) => e.type === 'PeerLoanDefaulted').map((e) => e.id),
  )
  const out: GameEvent[] = []
  for (const pool of state.pools) {
    if (pool.terminated) continue
    for (const ref of pool.assets) {
      if (ref.kind !== 'peer-loan' || !defaulted.has(ref.id)) continue
      const loan = findPeerLoan(state, ref.id)
      if (loan === undefined || loan.collateral.length === 0) continue
      let proceeds = 0
      for (const deedId of loan.collateral) {
        const deed = state.deeds[deedId]
        if (deed === undefined) continue
        proceeds += floorPercent(deed.faceValue, ECONOMY.LIQUIDATION_FLOOR)
      }
      out.push({
        type: 'PoolCollateralLiquidated',
        poolId: pool.id, loanId: ref.id, deeds: loan.collateral, proceeds,
      })
    }
  }
  return out
}
```

- [ ] **Step 21: Run the test to verify it fails on the missing reducer**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `./reduce.js` cannot be resolved, because Step 20 restored the import.

- [ ] **Step 22: Write the failing test for the reducer's cash movement**

Append to `securitization.test.ts`:

```ts
import { reduceSecuritization } from './reduce.js'

describe('reducer', () => {
  const pool = makePool({
    tranches: [
      { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
      { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
      { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
    ],
  })

  it('moves cash from the originator to the tranche holders and accrues paid', () => {
    const state = makeState({ pools: [pool] })
    const next = reduceSecuritization(state, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected: 900,
      distributions: [
        { tranche: 'senior', amount: 600 },
        { tranche: 'mezzanine', amount: 300 },
      ],
    })
    expect(next.players.P1.cleanCash).toBe(100)  // 1000 - 900 collected
    expect(next.players.P2.cleanCash).toBe(1600) // 1000 + 600 senior
    expect(next.players.P3.cleanCash).toBe(1300) // 1000 + 300 mezzanine
    expect(next.pools[0]?.tranches.map((t) => t.paid)).toEqual([600, 300, 0])
  })

  it('conserves money exactly across a full waterfall', () => {
    const state = makeState({
      players: {
        P1: makePlayer('P1', { cleanCash: 3000 }), P2: makePlayer('P2'),
        P3: makePlayer('P3'), P4: makePlayer('P4'),
      },
      pools: [pool],
    })
    const before = PLAYER_IDS.reduce((s, p) => s + state.players[p].cleanCash, 0)
    const next = reduceSecuritization(state, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected: 2000,
      distributions: [
        { tranche: 'senior', amount: 600 },
        { tranche: 'mezzanine', amount: 500 },
        { tranche: 'equity', amount: 900 },
      ],
    })
    const after = PLAYER_IDS.reduce((s, p) => s + next.players[p].cleanCash, 0)
    expect(after).toBe(before)
    expect(next.players.P1.cleanCash).toBe(1900) // 3000 - 2000 + 900 as equity holder
  })

  it('moves defaulted collateral to the bank and its proceeds to the originator', () => {
    const state = makeState({
      deeds: { 'boardwalk': makeDeed('boardwalk', 400, 'P2') },
      pools: [pool],
    })
    const next = reduceSecuritization(state, {
      type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1',
      deeds: ['boardwalk'], proceeds: 280,
    })
    expect(next.deeds['boardwalk']?.owner).toBe('bank')
    expect(next.players.P1.cleanCash).toBe(1280)
  })

  it('marks a pool terminated', () => {
    const state = makeState({ pools: [pool] })
    const next = reduceSecuritization(state, {
      type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [],
    })
    expect(next.pools[0]?.terminated).toBe(true)
  })
})
```

- [ ] **Step 23: Write `reduce.ts`**

`packages/engine/src/contexts/securitization/reduce.ts`:

```ts
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import type { DeedState, GameState, Pool, Swap } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'

function setCash(state: GameState, player: PlayerId, cleanCash: Money): GameState {
  return {
    ...state,
    players: { ...state.players, [player]: { ...state.players[player], cleanCash } },
  }
}

function addCash(state: GameState, player: PlayerId, amount: Money): GameState {
  return setCash(state, player, state.players[player].cleanCash + amount)
}

/** Clean cash never goes negative; the shortfall is emitted separately as distressed debt. */
function subCash(state: GameState, player: PlayerId, amount: Money): GameState {
  return setCash(state, player, Math.max(0, state.players[player].cleanCash - amount))
}

function transferCash(state: GameState, from: PlayerId, to: PlayerId, amount: Money): GameState {
  return addCash(subCash(state, from, amount), to, amount)
}

export function reduceSecuritization(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PoolCreated': {
      const pool: Pool = {
        id: event.id, originator: event.originator,
        assets: event.assets, tranches: event.tranches, terminated: false,
      }
      return { ...state, pools: [...state.pools, pool] }
    }

    case 'TrancheSold': {
      const pools = state.pools.map((p) =>
        p.id !== event.poolId ? p : {
          ...p,
          tranches: p.tranches.map((t) =>
            t.kind === event.tranche ? { ...t, holder: event.to } : t),
        })
      return transferCash({ ...state, pools }, event.to, event.from, event.price)
    }

    case 'WaterfallPaid': {
      const pool = state.pools.find((p) => p.id === event.poolId)
      const pools = state.pools.map((p) =>
        p.id !== event.poolId ? p : {
          ...p,
          tranches: p.tranches.map((t) => {
            const d = event.distributions.find((x) => x.tranche === t.kind)
            return d === undefined ? t : { ...t, paid: t.paid + d.amount }
          }),
        })
      if (pool === undefined) return { ...state, pools }
      // The originator holds the pooled assets in their own name, so the cash arrived in
      // their hands earlier this round. The waterfall pays it straight back out.
      let next = subCash({ ...state, pools }, pool.originator, event.collected)
      for (const d of event.distributions) {
        const holder = pool.tranches.find((t) => t.kind === d.tranche)?.holder
        if (holder !== undefined) next = addCash(next, holder, d.amount)
      }
      return next
    }

    case 'PoolCollateralLiquidated': {
      const deeds: Record<DeedId, DeedState> = { ...state.deeds }
      for (const id of event.deeds) {
        const deed = deeds[id]
        if (deed !== undefined) deeds[id] = { ...deed, owner: 'bank', mortgaged: false, houses: 0 }
      }
      const withDeeds: GameState = { ...state, deeds }
      const pool = state.pools.find((p) => p.id === event.poolId)
      return pool === undefined ? withDeeds : addCash(withDeeds, pool.originator, event.proceeds)
    }

    case 'PoolTerminated':
      return {
        ...state,
        pools: state.pools.map((p) => p.id === event.poolId ? { ...p, terminated: true } : p),
      }

    case 'SwapWritten': {
      const swap: Swap = {
        id: event.id, buyer: event.buyer, seller: event.seller,
        reference: event.reference, notional: event.notional,
        premiumPerRound: event.premiumPerRound, status: 'active',
      }
      return { ...state, swaps: [...state.swaps, swap] }
    }

    case 'SwapPremiumPaid': {
      const swap = state.swaps.find((s) => s.id === event.id)
      return swap === undefined ? state : transferCash(state, swap.buyer, swap.seller, event.amount)
    }

    case 'SwapTriggered': {
      const swap = state.swaps.find((s) => s.id === event.id)
      const swaps = state.swaps.map((s) =>
        s.id === event.id ? { ...s, status: 'triggered' as const } : s)
      const next: GameState = { ...state, swaps }
      return swap === undefined ? next : transferCash(next, swap.seller, swap.buyer, event.payout)
    }

    case 'SwapExpired':
      return {
        ...state,
        swaps: state.swaps.map((s) =>
          s.id === event.id ? { ...s, status: 'expired' as const } : s),
      }

    default:
      return state
  }
}
```

- [ ] **Step 24: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 25: Commit**

```bash
git add packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): collection, spec 19.4 collateral conversion, reducer

Pooled cash is received by the originator during the round as the assets'
legal owner and paid straight out down the waterfall at Settlement step 6,
so money is conserved without a pool cash balance in state."
```

- [ ] **Step 26: Write the failing test for `CreatePool` validation**

Append to `securitization.test.ts`:

```ts
import { decideSecuritization } from './decide.js'

describe('CreatePool', () => {
  const loanState = (): GameState => makeState({ loans: loansTotalling1910() })

  it('creates three tranches, sizing equity as the spec 19.3 residual', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 600, mezzanineFace: 500,
    })
    expect(isRejection(result)).toBe(false)
    expect(result).toEqual([{
      type: 'PoolCreated', id: 'pool-1', originator: 'P1', assets: THREE_LOANS,
      tranches: [
        { kind: 'senior', face: 600, paid: 0, holder: 'P1' },
        { kind: 'mezzanine', face: 500, paid: 0, holder: 'P1' },
        { kind: 'equity', face: 810, paid: 0, holder: 'P1' }, // 1910 - 600 - 500
      ],
    }])
  })

  it('rejects a pool of fewer than three assets', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS.slice(0, 2), seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result) && result.code).toBe('POOL_NEEDS_THREE_ASSETS')
  })

  it('rejects pooling an asset the originator does not own', () => {
    const state = makeState({
      loans: [
        makeLoan({ id: 'l-1', lender: 'P1' }),
        makeLoan({ id: 'l-2', lender: 'P1' }),
        makeLoan({ id: 'l-3', lender: 'P4' }),
      ],
    })
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result) && result.code).toBe('NOT_ASSET_OWNER')
  })

  it('rejects senior plus mezzanine above the pool\'s expected cashflow', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 1500, mezzanineFace: 411, // 1911 > 1910
    })
    expect(isRejection(result) && result.code).toBe('TRANCHES_EXCEED_POOL')
  })

  it('accepts senior plus mezzanine at exactly the pool\'s expected cashflow', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 1500, mezzanineFace: 410,
    })
    expect(isRejection(result)).toBe(false)
  })

  it('rejects an asset already locked inside a live pool', () => {
    const state = makeState({ loans: loansTotalling1910(), pools: [makePool({ id: 'pool-0' })] })
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result) && result.code).toBe('ASSET_ALREADY_POOLED')
  })

  it('rejects pooling before Era III', () => {
    vi.mocked(instrumentUnlocked).mockReturnValue(false)
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })
})
```

- [ ] **Step 27: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `./decide.js` cannot be resolved.

- [ ] **Step 28: Write `decide.ts` for the pool commands**

`packages/engine/src/contexts/securitization/decide.ts`:

```ts
import type { ContractId, Money, PlayerId } from '../../core/types.js'
import type { GameState, Pool, PoolAssetRef, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { reject, type Rejection } from '../../core/errors.js'
import { findPeerLoan } from '../credit/index.js'
import { findDeedOption, findRentFuture } from '../markets/index.js'
import { instrumentUnlocked } from '../session/index.js'
import {
  assetKey, expectedPoolCashflow, findPool, pooledAssetKeys, trancheOf,
} from './selectors.js'

/** Contract ids are supplied by the caller; the engine generates nothing random. */
export interface CreatePoolCommand {
  readonly type: 'CreatePool'
  readonly player: PlayerId
  readonly poolId: ContractId
  readonly assets: readonly PoolAssetRef[]
  readonly seniorFace: Money
  readonly mezzanineFace: Money
}

export interface SellTrancheCommand {
  readonly type: 'SellTranche'
  readonly player: PlayerId
  readonly poolId: ContractId
  readonly tranche: Tranche['kind']
  readonly to: PlayerId
  readonly price: Money
}

export type SecuritizationCommand = CreatePoolCommand | SellTrancheCommand

function ownsAsset(state: GameState, player: PlayerId, ref: PoolAssetRef): boolean {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan !== undefined && loan.lender === player && loan.status === 'active'
  }
  if (ref.kind === 'rent-future') return findRentFuture(state, ref.id)?.holder === player
  return findDeedOption(state, ref.id)?.holder === player
}

function decideCreatePool(
  state: GameState, command: CreatePoolCommand,
): readonly GameEvent[] | Rejection {
  if (!instrumentUnlocked(state, 'pool')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'CDO pools unlock in Era III.')
  }
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Pools can only be built during an Open phase.')
  }
  if (command.assets.length < 3) {
    return reject('POOL_NEEDS_THREE_ASSETS', 'A pool needs at least three assets.')
  }
  for (const ref of command.assets) {
    if (!ownsAsset(state, command.player, ref)) {
      return reject('NOT_ASSET_OWNER', 'You can only pool assets you own.')
    }
  }
  const alreadyPooled = pooledAssetKeys(state)
  for (const ref of command.assets) {
    if (alreadyPooled.has(assetKey(ref))) {
      return reject('ASSET_ALREADY_POOLED', 'That asset is already inside a live pool.')
    }
  }
  const senior = Math.floor(command.seniorFace)
  const mezzanine = Math.floor(command.mezzanineFace)
  if (senior < 0 || mezzanine < 0) {
    return reject('TRANCHES_EXCEED_POOL', 'Tranche face amounts cannot be negative.')
  }

  const provisional: Pool = {
    id: command.poolId, originator: command.player, assets: command.assets,
    tranches: [], terminated: false,
  }
  const cashflow = expectedPoolCashflow(state, provisional)
  if (senior + mezzanine > cashflow) {
    return reject(
      'TRANCHES_EXCEED_POOL',
      `Senior and mezzanine together cannot exceed the pool's expected cashflow of $${cashflow}.`,
    )
  }

  // Spec 19.3: equity has no face amount of its own, so the engine stores its residual
  // claim as `face`. It is a claim marker for the coverage formula and for CDS, never a
  // cap: equity keeps taking the residual for the life of the pool and never retires.
  const tranches: readonly Tranche[] = [
    { kind: 'senior', face: senior, paid: 0, holder: command.player },
    { kind: 'mezzanine', face: mezzanine, paid: 0, holder: command.player },
    { kind: 'equity', face: cashflow - senior - mezzanine, paid: 0, holder: command.player },
  ]
  return [{
    type: 'PoolCreated', id: command.poolId, originator: command.player,
    assets: command.assets, tranches,
  }]
}

function decideSellTranche(
  state: GameState, command: SellTrancheCommand,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Tranches can only be sold during an Open phase.')
  }
  const pool = findPool(state, command.poolId)
  if (pool === undefined) return reject('CONTRACT_NOT_FOUND', 'No such pool.')
  if (pool.terminated) return reject('POOL_TERMINATED', 'That pool has already terminated.')
  const t = trancheOf(pool, command.tranche)
  if (t === undefined) return reject('CONTRACT_NOT_FOUND', 'That pool has no such tranche.')
  if (t.holder !== command.player) return reject('NOT_OWNER', 'You do not hold that tranche.')
  if (command.to === command.player) {
    return reject('NOT_OWNER', 'You cannot sell a tranche to yourself.')
  }
  const price = Math.floor(command.price)
  if (state.players[command.to].cleanCash < price) {
    return reject('INSUFFICIENT_CLEAN_CASH', 'The buyer cannot cover that price.')
  }
  return [{
    type: 'TrancheSold', poolId: pool.id, tranche: command.tranche,
    from: command.player, to: command.to, price,
  }]
}

export function decideSecuritization(
  state: GameState, command: SecuritizationCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'CreatePool': return decideCreatePool(state, command)
    case 'SellTranche': return decideSellTranche(state, command)
  }
}
```

- [ ] **Step 29: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS, 28 tests.

- [ ] **Step 30: Write the failing test for termination and the Settlement step 6 entry point**

Append to `securitization.test.ts`:

```ts
import { settleSecuritization, terminateAllPools } from './waterfall.js'

describe('termination', () => {
  const partlyPaid = makePool({
    tranches: [
      { kind: 'senior', face: 600, paid: 600, holder: 'P2' },
      { kind: 'mezzanine', face: 500, paid: 200, holder: 'P3' },
      { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
    ],
  })

  it('terminates a pool once every underlying asset has matured or defaulted', () => {
    const state = makeState({
      loans: [
        makeLoan({ id: 'l-1', status: 'repaid' }),
        makeLoan({ id: 'l-2', status: 'defaulted' }),
        makeLoan({ id: 'l-3', status: 'repaid' }),
      ],
      pools: [partlyPaid],
    })
    expect(settleSecuritization(state, [])).toEqual([{
      type: 'PoolTerminated', poolId: 'pool-1',
      shortfalls: [
        { tranche: 'mezzanine', shortfall: 300 },
        { tranche: 'equity', shortfall: 810 },
      ],
    }])
  })

  it('leaves a pool alive while any asset is still running', () => {
    const state = makeState({
      loans: [
        makeLoan({ id: 'l-1', status: 'repaid' }),
        makeLoan({ id: 'l-2', status: 'active' }),
        makeLoan({ id: 'l-3', status: 'repaid' }),
      ],
      pools: [partlyPaid],
    })
    expect(settleSecuritization(state, [])).toEqual([])
  })

  it('terminates every live pool at the end of round 24 regardless of its assets', () => {
    const state = makeState({
      round: ECONOMY.TOTAL_ROUNDS,
      loans: loansTotalling1910(),
      pools: [partlyPaid],
    })
    expect(terminateAllPools(state)).toEqual([{
      type: 'PoolTerminated', poolId: 'pool-1',
      shortfalls: [
        { tranche: 'mezzanine', shortfall: 300 },
        { tranche: 'equity', shortfall: 810 },
      ],
    }])
  })

  it('converts collateral, runs the waterfall and terminates in one settlement pass', () => {
    const state = makeState({
      deeds: { 'boardwalk': makeDeed('boardwalk', 400, 'P2') },
      loans: [
        makeLoan({ id: 'l-1', status: 'defaulted', collateral: ['boardwalk'] }),
        makeLoan({ id: 'l-2', status: 'repaid' }),
        makeLoan({ id: 'l-3', status: 'repaid' }),
      ],
      pools: [makePool({
        tranches: [
          { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
          { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
          { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
        ],
      })],
    })
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
      { type: 'PeerLoanRepaid', id: 'l-2', amount: 550 },
    ]
    expect(settleSecuritization(state, roundEvents)).toEqual([
      {
        type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1',
        deeds: ['boardwalk'], proceeds: 280, // floorPercent(400, 0.7)
      },
      {
        type: 'WaterfallPaid', poolId: 'pool-1', collected: 830, // 280 + 550
        distributions: [
          { tranche: 'senior', amount: 600 },
          { tranche: 'mezzanine', amount: 230 },
        ],
      },
      {
        // Shortfalls are judged AFTER this round's own distribution, so senior, paid in
        // full by this very waterfall, is not recorded as short.
        type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [
          { tranche: 'mezzanine', shortfall: 270 },
          { tranche: 'equity', shortfall: 810 },
        ],
      },
    ])
  })

  it('books the originator\'s shortfall as distressed debt rather than negative cash', () => {
    const state = makeState({
      players: {
        P1: makePlayer('P1', { cleanCash: 100 }), P2: makePlayer('P2'),
        P3: makePlayer('P3'), P4: makePlayer('P4'),
      },
      loans: loansTotalling1910(),
      pools: [makePool({
        tranches: [
          { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
          { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
          { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
        ],
      })],
    })
    const events = settleSecuritization(state, [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 500 },
    ])
    expect(events).toContainEqual({
      type: 'DistressedDebtIncurred', player: 'P1', amount: 400,
    })
  })
})
```

- [ ] **Step 31: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: FAIL — `settleSecuritization` and `terminateAllPools` are not exported.

- [ ] **Step 32: Implement termination and the settlement entry point**

Append to `waterfall.ts`:

```ts
interface Shortfall {
  readonly tranche: Tranche['kind']
  readonly shortfall: Money
}

function shortfallsOf(pool: Pool): readonly Shortfall[] {
  return pool.tranches
    .map((t) => ({ tranche: t.kind, shortfall: Math.max(0, t.face - t.paid) }))
    .filter((s) => s.shortfall > 0)
}

/**
 * Spec section 8: a pool terminates when all its underlying assets have matured or
 * defaulted, and unconditionally at the end of round 24. Every tranche short of its face
 * at that moment is recorded, which is what a referencing CDS settles against.
 */
export function terminationEvents(pool: Pool): readonly GameEvent[] {
  return [{ type: 'PoolTerminated', poolId: pool.id, shortfalls: shortfallsOf(pool) }]
}

/** Waterfall for every live pool, plus the originator's distressed-debt shortfall. */
export function waterfallEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const out: GameEvent[] = []
  for (const pool of state.pools) {
    if (pool.terminated) continue
    const collected = collectedThisRound(pool, roundEvents)
    if (collected <= 0) continue
    out.push({
      type: 'WaterfallPaid', poolId: pool.id, collected,
      distributions: distribute(pool, collected),
    })
    // Spec 19.8: any shortfall that is not an uncured margin call becomes distressed debt
    // immediately, so the waterfall always pays out in full.
    const cash = state.players[pool.originator].cleanCash
    if (cash < collected) {
      out.push({ type: 'DistressedDebtIncurred', player: pool.originator, amount: collected - cash })
    }
  }
  return out
}

/**
 * Settlement step 6, spec 19.1, in order: convert defaulted pooled collateral to cash,
 * distribute every waterfall, then terminate any pool whose assets have all run their
 * course. `roundEvents` is every event emitted since this round's Market phase began.
 *
 * Terminations are evaluated against a locally-reduced copy of the state so that a
 * tranche paid off by this very round's distribution is not recorded as short.
 */
export function settleSecuritization(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const collateral = collateralLiquidationEvents(state, roundEvents)
  const seen = [...roundEvents, ...collateral]
  const waterfalls = waterfallEvents(state, seen)
  const after = [...collateral, ...waterfalls].reduce(reduceSecuritization, state)
  const terminations = after.pools
    .filter((pool) => poolIsExhausted(after, pool))
    .flatMap((pool) => terminationEvents(pool))
  return [...collateral, ...waterfalls, ...terminations]
}

/** The extra round-24 step in spec 19.1: all pools terminate, whatever their assets. */
export function terminateAllPools(state: GameState): readonly GameEvent[] {
  return state.pools.filter((p) => !p.terminated).flatMap((pool) => terminationEvents(pool))
}
```

- [ ] **Step 33: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/securitization.test.ts`
Expected: PASS, 33 tests.

- [ ] **Step 34: Write the context's `index.ts`**

`packages/engine/src/contexts/securitization/index.ts`. `fixtures.ts` is deliberately
absent — it is test-only and never part of the public surface:

```ts
export {
  assetIsResolved, assetKey, assetObligor, cumulativeClaim, expectedAssetCashflow,
  expectedLoanCashflow, expectedPoolCashflow, findPool, isRetired, poolIsExhausted,
  pooledAssetKeys, trancheFace, trancheOf,
} from './selectors.js'

export type { Distribution } from './waterfall.js'
export {
  collateralLiquidationEvents, collectedThisRound, distribute, settleSecuritization,
  terminateAllPools, terminationEvents, waterfallEvents,
} from './waterfall.js'

export { reduceSecuritization } from './reduce.js'
export type { CreatePoolCommand, SellTrancheCommand, SecuritizationCommand } from './decide.js'
export { decideSecuritization } from './decide.js'
```

- [ ] **Step 35: Verify the whole toolchain**

Run: `npm run lint && npm run typecheck && npm test`
Run: `wc -l packages/engine/src/contexts/securitization/*.ts`
Expected: all checks pass, every file under 500 lines.

- [ ] **Step 36: Commit**

```bash
git add packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): pool creation, tranche sales and pool termination

Pools terminate when their assets run out and unconditionally at the end
of round 24 per spec section 8. Termination shortfalls are judged after
the same Settlement's own waterfall."
```

---

### Task 17: `securitization` — the ratings formula and credit default swaps

**Files:**
- Modify: `packages/engine/src/config/economy.ts` (three additive rating constants)
- Modify: `packages/engine/src/core/errors.ts` (one new rejection code)
- Create: `packages/engine/src/contexts/securitization/ratings.ts`
- Create: `packages/engine/src/contexts/securitization/swaps.ts`
- Modify: `packages/engine/src/contexts/securitization/waterfall.ts`
- Modify: `packages/engine/src/contexts/securitization/decide.ts`
- Modify: `packages/engine/src/contexts/securitization/index.ts`
- Test: `packages/engine/src/contexts/securitization/ratings.test.ts`
- Test: `packages/engine/src/contexts/securitization/swaps.test.ts`

**Interfaces:**

- Consumes: everything Task 16 consumes, plus `RATING_BANDS` and `RATING_FLOOR` from
  `config/economy.ts`, and from `contexts/credit/index.js` the same four signatures:

```ts
export function borrowingBase(state: GameState, player: PlayerId): Money
export function drawnCredit(state: GameState, player: PlayerId): Money
export function creditHeadroom(state: GameState, player: PlayerId): Money
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined
```

  `creditHeadroom` is the only new draw: a CDS writer must have unused borrowing base
  covering `floorPercent(notional, ECONOMY.CDS_COLLATERAL_RATE)`. Once written,
  `credit.swapCollateralPosted` keeps that amount out of the seller's base for the life of
  the swap, so the origination check is not double-counted afterwards.

- Produces, added to `contexts/securitization/index.ts`:

```ts
export interface RatingInputs {
  readonly cashflow: Money       // expected pool cashflow, integer dollars
  readonly claim: Money          // cumulative claim through this tranche, integer dollars
  readonly concentration: number // 0..1
  readonly leverage: number      // 0..ECONOMY.RATING_MAX_LEVERAGE
}
export function scoreFrom(inputs: RatingInputs): number
export function ratingFrom(inputs: RatingInputs): string
export function ratingForScore(score: number): string

export interface TrancheRating {
  readonly tranche: Tranche['kind']
  readonly coverage: number
  readonly concentration: number
  readonly leverage: number
  readonly score: number
  readonly rating: string
}
export function obligorConcentration(state: GameState, pool: Pool): number
export function borrowerLeverage(state: GameState, player: PlayerId): number
export function weightedBorrowerLeverage(state: GameState, pool: Pool): number
export function rateTranche(state: GameState, pool: Pool, kind: Tranche['kind']): TrancheRating
export function ratePool(state: GameState, pool: Pool): readonly TrancheRating[]

export function referenceFace(state: GameState, ref: SwapReference): Money | null
export function requiredCollateral(notional: Money): Money
/** Settlement step 7, spec 19.1. */
export function settleSwapPremiums(state: GameState): readonly GameEvent[]
/** Loan-note credit events, folded into Settlement step 6. */
export function loanCreditEvents(
  state: GameState, roundEvents: readonly GameEvent[],
): readonly GameEvent[]
/** Tranche credit events, evaluated at pool termination including the forced round-24 one. */
export function trancheCreditEvents(
  state: GameState,
  poolId: ContractId,
  shortfalls: readonly { readonly tranche: Tranche['kind']; readonly shortfall: Money }[],
): readonly GameEvent[]

export interface WriteSwapCommand {
  readonly type: 'WriteSwap'
  readonly swapId: ContractId
  readonly buyer: PlayerId
  readonly seller: PlayerId
  readonly reference: SwapReference
  readonly notional: Money
  readonly premiumPerRound: Money
}
```

  `TrancheRating` is what the player view and `/api/game/:id/valuation/:ref` render: the
  rating **plus** raw `concentration` and `leverage`, always returned together, because
  spec section 8 requires the app to display obligor concentration and weighted borrower
  leverage as raw figures alongside every letter.

---

- [ ] **Step 1: Add the three rating coefficients to `config/economy.ts`**

The score formula's coefficients are economic numbers and must not be inlined. In
`packages/engine/src/config/economy.ts`, inside `ECONOMY`, after `CDS_COLLATERAL_RATE`:

```ts
  /** Ratings formula, spec section 8:
   *  score = coverage * (1 - RATING_CONCENTRATION_WEIGHT * concentration)
   *                   / (1 + RATING_LEVERAGE_WEIGHT * leverage) */
  RATING_CONCENTRATION_WEIGHT: 0.25,
  RATING_LEVERAGE_WEIGHT: 0.1,
  /** Borrower leverage is capped at this before it enters the weighted mean. */
  RATING_MAX_LEVERAGE: 5,
```

- [ ] **Step 2: Add the new rejection code**

In `packages/engine/src/core/errors.ts`, extend `RejectionCode`:

```ts
  | 'SWAP_NOTIONAL_EXCEEDS_FACE'
```

- [ ] **Step 3: Write the failing test reproducing the spec section 8 worked example**

This is the mandatory test. `packages/engine/src/contexts/securitization/ratings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../../config/economy.js'

vi.mock('../credit/index.js', () => ({
  borrowingBase: vi.fn(),
  drawnCredit: vi.fn(),
  creditHeadroom: vi.fn(),
  swapCollateralPosted: vi.fn(),
  findPeerLoan: vi.fn(),
}))
vi.mock('../markets/index.js', () => ({
  findRentFuture: vi.fn(),
  findDeedOption: vi.fn(),
  rentFutureExpectedValue: vi.fn(),
  deedOptionMark: vi.fn(),
}))
vi.mock('../session/index.js', () => ({ instrumentUnlocked: vi.fn() }))

import { borrowingBase, drawnCredit, findPeerLoan } from '../credit/index.js'
import {
  deedOptionMark, findDeedOption, findRentFuture, rentFutureExpectedValue,
} from '../markets/index.js'
import { loansTotalling1910, makeLoan, makePool, makeState } from './fixtures.js'
import {
  borrowerLeverage, obligorConcentration, ratePool, ratingForScore, ratingFrom, scoreFrom,
  weightedBorrowerLeverage,
} from './ratings.js'

beforeEach(() => {
  vi.mocked(findPeerLoan).mockImplementation((state, id) => state.loans.find((l) => l.id === id))
  vi.mocked(findRentFuture).mockImplementation((state, id) => state.futures.find((f) => f.id === id))
  vi.mocked(findDeedOption).mockImplementation((state, id) => state.options.find((o) => o.id === id))
  vi.mocked(rentFutureExpectedValue).mockReturnValue(0)
  vi.mocked(deedOptionMark).mockReturnValue(0)
  vi.mocked(borrowingBase).mockReturnValue(0)
  vi.mocked(drawnCredit).mockReturnValue(0)
})

describe('spec section 8 worked example', () => {
  // Pool cashflow $1,910. Senior face $700, mezzanine face $600.
  // Equity's claim is the spec 19.3 residual: 1910 - 700 - 600 = 610.
  // Concentration 0.76, weighted borrower leverage 3.8.
  const CASHFLOW = 1910
  const CONCENTRATION = 0.76
  const LEVERAGE = 3.8

  it('rates the senior tranche AA', () => {
    expect(ratingFrom({
      cashflow: CASHFLOW, claim: 700, concentration: CONCENTRATION, leverage: LEVERAGE,
    })).toBe('AA')
  })

  it('rates the mezzanine tranche BB', () => {
    // Cumulative claim through mezzanine is 700 + 600 = 1300.
    expect(ratingFrom({
      cashflow: CASHFLOW, claim: 1300, concentration: CONCENTRATION, leverage: LEVERAGE,
    })).toBe('BB')
  })

  it('rates the equity tranche CCC, with coverage at exactly 1.0', () => {
    // Cumulative claim through equity is 700 + 600 + 610 = 1910, so coverage is 1.0.
    const inputs = {
      cashflow: CASHFLOW, claim: 1910, concentration: CONCENTRATION, leverage: LEVERAGE,
    }
    expect(CASHFLOW / 1910).toBe(1)
    expect(ratingFrom(inputs)).toBe('CCC')
    expect(ratingFrom(inputs)).toBe(RATING_FLOOR)
  })

  it('computes the three underlying scores exactly', () => {
    expect(scoreFrom({ cashflow: 1910, claim: 700, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(1.6015528, 6)
    expect(scoreFrom({ cashflow: 1910, claim: 1300, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(0.8623746, 6)
    expect(scoreFrom({ cashflow: 1910, claim: 1910, concentration: 0.76, leverage: 3.8 }))
      .toBeCloseTo(0.5869565, 6)
  })
})

describe('rating bands', () => {
  it('evaluates highest first and floors at CCC', () => {
    expect(ratingForScore(3)).toBe('AAA')
    expect(ratingForScore(2.2)).toBe('AAA')
    expect(ratingForScore(2.19)).toBe('AA')
    expect(ratingForScore(1.5)).toBe('AA')
    expect(ratingForScore(1.2)).toBe('A')
    expect(ratingForScore(1.0)).toBe('BBB')
    expect(ratingForScore(0.8)).toBe('BB')
    expect(ratingForScore(0.6)).toBe('B')
    expect(ratingForScore(0.599)).toBe('CCC')
    expect(ratingForScore(0)).toBe(RATING_FLOOR)
    expect(RATING_BANDS.length).toBe(6)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/ratings.test.ts`
Expected: FAIL — `./ratings.js` cannot be resolved.

- [ ] **Step 5: Write the formula half of `ratings.ts`**

`packages/engine/src/contexts/securitization/ratings.ts`:

```ts
import type { Money, PlayerId } from '../../core/types.js'
import type { GameState, Pool, Tranche } from '../../core/state.js'
import { ECONOMY, RATING_BANDS, RATING_FLOOR } from '../../config/economy.js'
import { borrowingBase, drawnCredit } from '../credit/index.js'
import {
  assetObligor, cumulativeClaim, expectedAssetCashflow, expectedPoolCashflow,
} from './selectors.js'

export interface RatingInputs {
  /** Expected pool cashflow, integer dollars. */
  readonly cashflow: Money
  /** Cumulative claim through this tranche, integer dollars. Spec 19.3 for equity. */
  readonly claim: Money
  /** Largest share of expected pool cashflow from a single obligor, 0..1. */
  readonly concentration: number
  /** Cashflow-weighted mean borrower leverage, already capped. */
  readonly leverage: number
}

/**
 * Spec section 8. The money inputs are integers; coverage, the two ratios and the score
 * itself are not money and are never rounded at any stage.
 */
export function scoreFrom(inputs: RatingInputs): number {
  const coverage = inputs.claim <= 0 ? 0 : inputs.cashflow / inputs.claim
  return (
    (coverage * (1 - ECONOMY.RATING_CONCENTRATION_WEIGHT * inputs.concentration)) /
    (1 + ECONOMY.RATING_LEVERAGE_WEIGHT * inputs.leverage)
  )
}

/** RATING_BANDS is ordered best-first, so the first match wins. The floor is CCC. */
export function ratingForScore(score: number): string {
  for (const [minimum, rating] of RATING_BANDS) {
    if (score >= minimum) return rating
  }
  return RATING_FLOOR
}

export function ratingFrom(inputs: RatingInputs): string {
  return ratingForScore(scoreFrom(inputs))
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/ratings.test.ts`
Expected: PASS. Senior AA, mezzanine BB, equity CCC, exactly as spec section 8 states.
A pool of three loans to one over-levered player rating AA at the top is the intended
outcome, not a defect: the formula is deliberately coverage-dominant.

- [ ] **Step 7: Write the failing test for concentration and weighted leverage from state**

Append to `ratings.test.ts`:

```ts
describe('concentration and weighted borrower leverage', () => {
  const pool = makePool()

  beforeEach(() => {
    // P2 is drawn 1900 against a base of 500, so leverage is exactly 3.8.
    vi.mocked(drawnCredit).mockImplementation((_s, p) => (p === 'P2' ? 1900 : 0))
    vi.mocked(borrowingBase).mockImplementation((_s, p) => (p === 'P2' ? 500 : 1000))
  })

  it('caps a single borrower\'s leverage at RATING_MAX_LEVERAGE', () => {
    vi.mocked(borrowingBase).mockReturnValue(0)
    const state = makeState({ loans: loansTotalling1910() })
    expect(borrowerLeverage(state, 'P2')).toBe(ECONOMY.RATING_MAX_LEVERAGE)
  })

  it('reports zero leverage for a borrower with nothing drawn', () => {
    const state = makeState({ loans: loansTotalling1910() })
    expect(borrowerLeverage(state, 'P3')).toBe(0)
  })

  it('reports concentration 1.0 when every asset names the same obligor', () => {
    const state = makeState({ loans: loansTotalling1910() })
    expect(obligorConcentration(state, pool)).toBe(1)
  })

  it('reports the cashflow-weighted mean borrower leverage', () => {
    const state = makeState({ loans: loansTotalling1910() })
    expect(weightedBorrowerLeverage(state, pool)).toBeCloseTo(3.8, 10)
  })

  it('still rates the senior slice AA at full concentration and 3.8x leverage', () => {
    // Spec section 8 calls this case out by name. Concentration is 1.0 here rather than
    // the worked example's 0.76, so the senior face is 600 rather than 700; the point —
    // an AA at the top of a pool of three loans to one over-levered player — is the same,
    // and it is correct and intended.
    const state = makeState({ loans: loansTotalling1910() })
    const ratings = ratePool(state, pool)
    expect(ratings.map((r) => r.rating)).toEqual(['AA', 'BB', 'CCC'])
    // The raw figures ride alongside the letter, per spec section 8.
    expect(ratings[0]?.concentration).toBe(1)
    expect(ratings[0]?.leverage).toBeCloseTo(3.8, 10)
    expect(ratings[0]?.coverage).toBeCloseTo(1910 / 600, 10)
    expect(ratings[2]?.coverage).toBe(1)
  })

  it('weights leverage by each obligor\'s share of expected cashflow', () => {
    const state = makeState({
      loans: [
        makeLoan({ id: 'l-1', borrower: 'P2', outstanding: 500, ratePerRound: 0, maturesAtRound: 15 }),
        makeLoan({ id: 'l-2', borrower: 'P3', outstanding: 500, ratePerRound: 0, maturesAtRound: 15 }),
        makeLoan({ id: 'l-3', borrower: 'P3', outstanding: 1000, ratePerRound: 0, maturesAtRound: 15 }),
      ],
    })
    vi.mocked(drawnCredit).mockImplementation((_s, p) => (p === 'P2' ? 1000 : 500))
    vi.mocked(borrowingBase).mockReturnValue(500)
    // P2 at 2.0x on 500 of 2000; P3 at 1.0x on 1500 of 2000.
    expect(obligorConcentration(state, pool)).toBeCloseTo(0.75, 10)
    expect(weightedBorrowerLeverage(state, pool)).toBeCloseTo(1.25, 10)
  })
})
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/ratings.test.ts`
Expected: FAIL — `borrowerLeverage`, `obligorConcentration`, `weightedBorrowerLeverage`
and `ratePool` are not exported.

- [ ] **Step 9: Write the state half of `ratings.ts`**

Append to `ratings.ts`:

```ts
export interface TrancheRating {
  readonly tranche: Tranche['kind']
  readonly coverage: number
  readonly concentration: number
  readonly leverage: number
  readonly score: number
  readonly rating: string
}

/** Largest share of expected pool cashflow owed by any single obligor, 0..1. */
export function obligorConcentration(state: GameState, pool: Pool): number {
  const total = expectedPoolCashflow(state, pool)
  if (total <= 0) return 0
  const byObligor = new Map<PlayerId, Money>()
  for (const ref of pool.assets) {
    const obligor = assetObligor(state, ref)
    if (obligor === null) continue
    byObligor.set(obligor, (byObligor.get(obligor) ?? 0) + expectedAssetCashflow(state, ref))
  }
  let largest = 0
  for (const amount of byObligor.values()) largest = Math.max(largest, amount)
  return largest / total
}

/**
 * Drawn credit over borrowing base, capped at RATING_MAX_LEVERAGE. A borrower with
 * nothing drawn is unlevered; a borrower with a drawn balance and no base is pinned at
 * the cap rather than dividing by zero.
 */
export function borrowerLeverage(state: GameState, player: PlayerId): number {
  const drawn = drawnCredit(state, player)
  if (drawn <= 0) return 0
  const base = borrowingBase(state, player)
  if (base <= 0) return ECONOMY.RATING_MAX_LEVERAGE
  return Math.min(ECONOMY.RATING_MAX_LEVERAGE, drawn / base)
}

/** Each obligor's capped leverage, weighted by that obligor's share of expected cashflow. */
export function weightedBorrowerLeverage(state: GameState, pool: Pool): number {
  const total = expectedPoolCashflow(state, pool)
  if (total <= 0) return 0
  let weighted = 0
  for (const ref of pool.assets) {
    const obligor = assetObligor(state, ref)
    if (obligor === null) continue
    weighted += borrowerLeverage(state, obligor) * expectedAssetCashflow(state, ref)
  }
  return weighted / total
}

export function rateTranche(state: GameState, pool: Pool, kind: Tranche['kind']): TrancheRating {
  const cashflow = expectedPoolCashflow(state, pool)
  const claim = cumulativeClaim(pool, kind)
  const concentration = obligorConcentration(state, pool)
  const leverage = weightedBorrowerLeverage(state, pool)
  const score = scoreFrom({ cashflow, claim, concentration, leverage })
  return {
    tranche: kind,
    coverage: claim <= 0 ? 0 : cashflow / claim,
    concentration, leverage, score,
    rating: ratingForScore(score),
  }
}

/** Senior, mezzanine, equity — always in priority order, always with the raw figures. */
export function ratePool(state: GameState, pool: Pool): readonly TrancheRating[] {
  return (['senior', 'mezzanine', 'equity'] as const).map((kind) => rateTranche(state, pool, kind))
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/ratings.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 11: Commit**

```bash
git add packages/engine/src/config/economy.ts packages/engine/src/core/errors.ts \
        packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): deterministic tranche ratings

Reproduces the spec section 8 worked example exactly: pool cashflow 1910,
senior 700, mezzanine 600, concentration 0.76, leverage 3.8 gives AA, BB
and CCC. Concentration and weighted borrower leverage are returned as raw
figures alongside every letter."
```

- [ ] **Step 12: Write the failing test for CDS origination, including naked protection**

`packages/engine/src/contexts/securitization/swaps.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'

vi.mock('../credit/index.js', () => ({
  borrowingBase: vi.fn(),
  drawnCredit: vi.fn(),
  creditHeadroom: vi.fn(),
  swapCollateralPosted: vi.fn(),
  findPeerLoan: vi.fn(),
}))
vi.mock('../markets/index.js', () => ({
  findRentFuture: vi.fn(),
  findDeedOption: vi.fn(),
  rentFutureExpectedValue: vi.fn(),
  deedOptionMark: vi.fn(),
}))
vi.mock('../session/index.js', () => ({ instrumentUnlocked: vi.fn() }))

import { creditHeadroom, findPeerLoan } from '../credit/index.js'
import { findDeedOption, findRentFuture } from '../markets/index.js'
import { instrumentUnlocked } from '../session/index.js'
import { decideSecuritization } from './decide.js'
import {
  loanCreditEvents, referenceFace, requiredCollateral, settleSwapPremiums, trancheCreditEvents,
} from './swaps.js'
import { makeLoan, makePlayer, makePool, makeState, makeSwap, makeTranches } from './fixtures.js'

const pool = makePool({ tranches: makeTranches(600, 500, 810, 'P2') })

beforeEach(() => {
  vi.mocked(findPeerLoan).mockImplementation((state, id) => state.loans.find((l) => l.id === id))
  vi.mocked(findRentFuture).mockImplementation((state, id) => state.futures.find((f) => f.id === id))
  vi.mocked(findDeedOption).mockImplementation((state, id) => state.options.find((o) => o.id === id))
  vi.mocked(creditHeadroom).mockReturnValue(10_000)
  vi.mocked(instrumentUnlocked).mockReturnValue(true)
})

describe('CDS origination', () => {
  const state = (): GameState =>
    makeState({ loans: [makeLoan({ id: 'l-1', principal: 500 })], pools: [pool] })

  const write = (over: Partial<{ notional: number }> = {}) => decideSecuritization(state(), {
    type: 'WriteSwap', swapId: 'cds-1', buyer: 'P3', seller: 'P4',
    reference: { kind: 'peer-loan', id: 'l-1' },
    notional: over.notional ?? 400, premiumPerRound: 40,
  })

  it('reports the reference obligation face for a loan note and for a tranche', () => {
    expect(referenceFace(state(), { kind: 'peer-loan', id: 'l-1' })).toBe(500)
    expect(referenceFace(state(), { kind: 'tranche', poolId: 'pool-1', tranche: 'senior' })).toBe(600)
    expect(referenceFace(state(), { kind: 'tranche', poolId: 'pool-1', tranche: 'equity' })).toBe(810)
    expect(referenceFace(state(), { kind: 'peer-loan', id: 'l-9' })).toBeNull()
  })

  it('allows naked protection on debt the buyer does not own', () => {
    // P3 is neither lender nor borrower on l-1. Spec section 8: naked CDS is legal.
    const result = write()
    expect(isRejection(result)).toBe(false)
    expect(result).toEqual([{
      type: 'SwapWritten', id: 'cds-1', buyer: 'P3', seller: 'P4',
      reference: { kind: 'peer-loan', id: 'l-1' }, notional: 400, premiumPerRound: 40,
    }])
  })

  it('caps the notional at the reference obligation\'s face', () => {
    expect(isRejection(write({ notional: 500 }))).toBe(false)
    const over = write({ notional: 501 })
    expect(isRejection(over) && over.code).toBe('SWAP_NOTIONAL_EXCEEDS_FACE')
  })

  it('requires the seller to post CDS_COLLATERAL_RATE of notional against their base', () => {
    expect(ECONOMY.CDS_COLLATERAL_RATE).toBe(0.3)
    expect(requiredCollateral(400)).toBe(120)

    vi.mocked(creditHeadroom).mockReturnValue(119)
    const short = write()
    expect(isRejection(short) && short.code).toBe('INSUFFICIENT_BORROWING_BASE')

    vi.mocked(creditHeadroom).mockReturnValue(120)
    expect(isRejection(write())).toBe(false)
  })

  it('rejects a swap before Era III', () => {
    vi.mocked(instrumentUnlocked).mockReturnValue(false)
    const result = write()
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })
})
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/securitization/swaps.test.ts`
Expected: FAIL — `./swaps.js` cannot be resolved.

- [ ] **Step 14: Write `swaps.ts`**

`packages/engine/src/contexts/securitization/swaps.ts`:

```ts
import type { ContractId, Money } from '../../core/types.js'
import type { GameState, SwapReference, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import { findPeerLoan } from '../credit/index.js'
import { findPool, trancheOf } from './selectors.js'

/**
 * The face value of the reference obligation, which caps the notional at origination.
 * A loan note's face is its principal, matching how spec section 12 marks notes to model.
 * A tranche's face is its stored face, which for equity is its spec 19.3 residual claim.
 * Returns null when the obligation does not exist or is no longer live.
 */
export function referenceFace(state: GameState, ref: SwapReference): Money | null {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan === undefined || loan.status !== 'active' ? null : loan.principal
  }
  const pool = findPool(state, ref.poolId)
  if (pool === undefined || pool.terminated) return null
  return trancheOf(pool, ref.tranche)?.face ?? null
}

/** What the seller keeps out of their borrowing base for the life of the swap. */
export function requiredCollateral(notional: Money): Money {
  return floorPercent(notional, ECONOMY.CDS_COLLATERAL_RATE)
}

/**
 * Settlement step 7, spec 19.1. The buyer pays the negotiated premium to the seller. A
 * buyer who cannot cover it books the shortfall as distressed debt, spec 19.8.
 */
export function settleSwapPremiums(state: GameState): readonly GameEvent[] {
  const out: GameEvent[] = []
  for (const s of state.swaps) {
    if (s.status !== 'active' || s.premiumPerRound <= 0) continue
    out.push({ type: 'SwapPremiumPaid', id: s.id, amount: s.premiumPerRound })
    const cash = state.players[s.buyer].cleanCash
    if (cash < s.premiumPerRound) {
      out.push({ type: 'DistressedDebtIncurred', player: s.buyer, amount: s.premiumPerRound - cash })
    }
  }
  return out
}

function payoutEvents(state: GameState, id: ContractId, payout: Money): readonly GameEvent[] {
  const s = state.swaps.find((x) => x.id === id)
  if (s === undefined) return []
  const out: GameEvent[] = [{ type: 'SwapTriggered', id, payout }]
  const cash = state.players[s.seller].cleanCash
  if (cash < payout) {
    out.push({ type: 'DistressedDebtIncurred', player: s.seller, amount: payout - cash })
  }
  return out
}

/**
 * The credit event for a loan-note CDS is borrower default, spec section 8. The seller
 * pays the buyer the full notional. Fires for every active referencing swap, naked or not.
 */
export function loanCreditEvents(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const defaulted = new Set(
    roundEvents.filter((e) => e.type === 'PeerLoanDefaulted').map((e) => e.id),
  )
  const out: GameEvent[] = []
  for (const s of state.swaps) {
    if (s.status !== 'active') continue
    const ref = s.reference
    if (ref.kind !== 'peer-loan' || !defaulted.has(ref.id)) continue
    out.push(...payoutEvents(state, s.id, s.notional))
  }
  return out
}

/**
 * The credit event for a tranche CDS is the tranche receiving less than its full face by
 * pool termination, so tranche swaps settle at termination — including the forced
 * termination at the end of round 24, spec section 8. A tranche paid in full lets its
 * referencing swaps expire worthless.
 */
export function trancheCreditEvents(
  state: GameState,
  poolId: ContractId,
  shortfalls: readonly { readonly tranche: Tranche['kind']; readonly shortfall: Money }[],
): readonly GameEvent[] {
  const out: GameEvent[] = []
  for (const s of state.swaps) {
    if (s.status !== 'active') continue
    const ref = s.reference
    if (ref.kind !== 'tranche' || ref.poolId !== poolId) continue
    const short = shortfalls.find((x) => x.tranche === ref.tranche)
    if (short === undefined || short.shortfall <= 0) {
      out.push({ type: 'SwapExpired', id: s.id })
      continue
    }
    out.push(...payoutEvents(state, s.id, s.notional))
  }
  return out
}
```

- [ ] **Step 15: Add the `WriteSwap` command to `decide.ts`**

In `packages/engine/src/contexts/securitization/decide.ts`, add to the import block, then
add the interface, the handler, and extend the union and the dispatch:

```ts
import type { SwapReference } from '../../core/state.js'
import { creditHeadroom } from '../credit/index.js'
import { referenceFace, requiredCollateral } from './swaps.js'

export interface WriteSwapCommand {
  readonly type: 'WriteSwap'
  readonly swapId: ContractId
  readonly buyer: PlayerId
  readonly seller: PlayerId
  readonly reference: SwapReference
  readonly notional: Money
  readonly premiumPerRound: Money
}

export type SecuritizationCommand = CreatePoolCommand | SellTrancheCommand | WriteSwapCommand

function decideWriteSwap(
  state: GameState, command: WriteSwapCommand,
): readonly GameEvent[] | Rejection {
  if (!instrumentUnlocked(state, 'swap')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Credit default swaps unlock in Era III.')
  }
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Swaps can only be written during an Open phase.')
  }
  if (command.buyer === command.seller) {
    return reject('NOT_OWNER', 'You cannot buy protection from yourself.')
  }
  const face = referenceFace(state, command.reference)
  if (face === null) {
    return reject('CONTRACT_NOT_FOUND', 'That reference obligation does not exist or has settled.')
  }
  const notional = Math.floor(command.notional)
  if (notional <= 0) {
    return reject('SWAP_NOTIONAL_EXCEEDS_FACE', 'Notional must be a positive amount.')
  }
  if (notional > face) {
    return reject(
      'SWAP_NOTIONAL_EXCEEDS_FACE',
      `Notional is capped at the reference obligation's face value of $${face}.`,
    )
  }
  // Naked protection is legal by design: the buyer is deliberately not checked for
  // ownership of the reference obligation. Spec section 8.
  const collateral = requiredCollateral(notional)
  if (creditHeadroom(state, command.seller) < collateral) {
    return reject(
      'INSUFFICIENT_BORROWING_BASE',
      `Writing this swap requires $${collateral} of unused borrowing base.`,
    )
  }
  return [{
    type: 'SwapWritten', id: command.swapId, buyer: command.buyer, seller: command.seller,
    reference: command.reference, notional, premiumPerRound: Math.floor(command.premiumPerRound),
  }]
}
```

and extend the dispatch:

```ts
export function decideSecuritization(
  state: GameState, command: SecuritizationCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'CreatePool': return decideCreatePool(state, command)
    case 'SellTranche': return decideSellTranche(state, command)
    case 'WriteSwap': return decideWriteSwap(state, command)
  }
}
```

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/swaps.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 17: Write the failing test for premiums and credit events**

Append to `swaps.test.ts`:

```ts
describe('CDS settlement', () => {
  it('transfers the premium from buyer to seller each Settlement', () => {
    const state = makeState({ swaps: [makeSwap({ id: 'cds-1', premiumPerRound: 40 })] })
    expect(settleSwapPremiums(state)).toEqual([
      { type: 'SwapPremiumPaid', id: 'cds-1', amount: 40 },
    ])
  })

  it('books an unaffordable premium as distressed debt', () => {
    const state = makeState({
      players: {
        P1: makePlayer('P1'), P2: makePlayer('P2'),
        P3: makePlayer('P3', { cleanCash: 10 }), P4: makePlayer('P4'),
      },
      swaps: [makeSwap({ id: 'cds-1', buyer: 'P3', premiumPerRound: 40 })],
    })
    expect(settleSwapPremiums(state)).toEqual([
      { type: 'SwapPremiumPaid', id: 'cds-1', amount: 40 },
      { type: 'DistressedDebtIncurred', player: 'P3', amount: 30 },
    ])
  })

  it('pays nothing on a swap that has already triggered or expired', () => {
    const state = makeState({
      swaps: [
        makeSwap({ id: 'cds-1', status: 'triggered' }),
        makeSwap({ id: 'cds-2', status: 'expired' }),
      ],
    })
    expect(settleSwapPremiums(state)).toEqual([])
  })

  it('triggers a loan-note CDS on borrower default, paying the full notional', () => {
    const state = makeState({
      loans: [makeLoan({ id: 'l-1' })],
      swaps: [makeSwap({ id: 'cds-1', notional: 400 })],
    })
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ]
    expect(loanCreditEvents(state, roundEvents)).toEqual([
      { type: 'SwapTriggered', id: 'cds-1', payout: 400 },
    ])
  })

  it('does not trigger a loan-note CDS while the borrower is current', () => {
    const state = makeState({
      loans: [makeLoan({ id: 'l-1' })],
      swaps: [makeSwap({ id: 'cds-1' })],
    })
    expect(loanCreditEvents(state, [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 50 },
    ])).toEqual([])
  })

  it('triggers a tranche CDS only when that tranche is short at pool termination', () => {
    const state = makeState({
      pools: [pool],
      swaps: [
        makeSwap({
          id: 'cds-senior', notional: 600,
          reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'senior' },
        }),
        makeSwap({
          id: 'cds-mezz', notional: 500,
          reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
        }),
      ],
    })
    expect(trancheCreditEvents(state, 'pool-1', [{ tranche: 'mezzanine', shortfall: 300 }])).toEqual([
      { type: 'SwapExpired', id: 'cds-senior' },
      { type: 'SwapTriggered', id: 'cds-mezz', payout: 500 },
    ])
  })

  it('settles tranche CDS on the forced termination at the end of round 24', () => {
    // terminateAllPools is what session calls in the extra round-24 step of spec 19.1;
    // its shortfalls feed straight into trancheCreditEvents.
    const state = makeState({
      round: ECONOMY.TOTAL_ROUNDS,
      players: {
        P1: makePlayer('P1'), P2: makePlayer('P2'),
        P3: makePlayer('P3'), P4: makePlayer('P4', { cleanCash: 300 }),
      },
      pools: [pool],
      swaps: [makeSwap({
        id: 'cds-eq', notional: 810,
        reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'equity' },
      })],
    })
    expect(trancheCreditEvents(state, 'pool-1', [{ tranche: 'equity', shortfall: 810 }])).toEqual([
      { type: 'SwapTriggered', id: 'cds-eq', payout: 810 },
      // The seller cannot cover 810 out of 300, so the balance is distressed debt.
      { type: 'DistressedDebtIncurred', player: 'P4', amount: 510 },
    ])
  })
})
```

- [ ] **Step 18: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/securitization/swaps.test.ts`
Expected: PASS, 12 tests. Step 14 already implements all of this; if any assertion fails,
fix `swaps.ts`, not the test.

- [ ] **Step 19: Wire credit events into Settlement step 6 and into termination**

In `waterfall.ts`, add the import and replace `settleSecuritization` and
`terminateAllPools`:

```ts
import { loanCreditEvents, trancheCreditEvents } from './swaps.js'

function terminationEventsWithSwaps(state: GameState, pool: Pool): readonly GameEvent[] {
  const shortfalls = shortfallsOf(pool)
  return [
    { type: 'PoolTerminated', poolId: pool.id, shortfalls },
    ...trancheCreditEvents(state, pool.id, shortfalls),
  ]
}

export function settleSecuritization(
  state: GameState,
  roundEvents: readonly GameEvent[],
): readonly GameEvent[] {
  const collateral = collateralLiquidationEvents(state, roundEvents)
  const seen = [...roundEvents, ...collateral]
  const waterfalls = waterfallEvents(state, seen)
  const loanEvents = loanCreditEvents(state, seen)
  const after = [...collateral, ...waterfalls, ...loanEvents].reduce(reduceSecuritization, state)
  const terminations = after.pools
    .filter((pool) => poolIsExhausted(after, pool))
    .flatMap((pool) => terminationEventsWithSwaps(after, pool))
  return [...collateral, ...waterfalls, ...loanEvents, ...terminations]
}

export function terminateAllPools(state: GameState): readonly GameEvent[] {
  return state.pools
    .filter((p) => !p.terminated)
    .flatMap((pool) => terminationEventsWithSwaps(state, pool))
}
```

`terminationEvents(pool)` stays exported unchanged for callers that want the
`PoolTerminated` event alone. Because `after` already has any loan-note swaps marked
`triggered`, a swap can never be settled twice in one Settlement.

- [ ] **Step 20: Run the whole securitization suite**

Run: `npx vitest run packages/engine/src/contexts/securitization/`
Expected: PASS. The Task 16 termination assertions still hold, because none of their
fixtures carry swaps; the Task 17 tests cover the swap-bearing paths.

- [ ] **Step 21: Extend the context's `index.ts`**

Append to `packages/engine/src/contexts/securitization/index.ts`:

```ts
export type { RatingInputs, TrancheRating } from './ratings.js'
export {
  borrowerLeverage, obligorConcentration, ratePool, rateTranche, ratingForScore,
  ratingFrom, scoreFrom, weightedBorrowerLeverage,
} from './ratings.js'

export {
  loanCreditEvents, referenceFace, requiredCollateral, settleSwapPremiums,
  trancheCreditEvents,
} from './swaps.js'

export type { WriteSwapCommand } from './decide.js'
```

- [ ] **Step 22: Verify the whole toolchain and the file-size limit**

Run: `npm run lint && npm run typecheck && npm test`
Run: `wc -l packages/engine/src/contexts/securitization/*.ts`
Expected: all checks pass, every file under 500 lines. If `waterfall.ts` is close, split
the termination helpers into `termination.ts` and re-export them unchanged from
`waterfall.ts`.

- [ ] **Step 23: Commit**

```bash
git add packages/engine/src/contexts/securitization/
git commit -m "feat(securitization): credit default swaps

Naked protection is legal by design. Sellers post CDS_COLLATERAL_RATE of
notional against their borrowing base. Loan-note swaps settle on borrower
default; tranche swaps settle at pool termination, including the forced
termination at the end of round 24."
```

---

## NEW EVENTS REQUIRED

Task 2's `core/events.ts` does not contain the following. It is added in Task 16 Step 2
and must be reviewed alongside the rest of the event vocabulary.

```ts
| { type: 'PoolCollateralLiquidated'; poolId: ContractId; loanId: ContractId
    deeds: readonly DeedId[]; proceeds: Money }
```

**Why it is unavoidable.** Spec 19.4 requires that when a peer loan held inside a pool
defaults, its collateral deeds are sold to the bank at `ECONOMY.LIQUIDATION_FLOOR` and the
cash enters that round's waterfall. No existing event can express this:

- `PeerLoanDefaulted { id, collateralTo, writtenOff }` sends collateral to a `PlayerId`
  lender and carries no cash figure at all.
- `DeedLiquidated { player, deed, buyer, price }` belongs to `credit`'s margin-call path,
  where its proceeds pay down a drawn credit balance. Reusing it here would make the
  reducer ambiguous between two different rules.

Every other event these tasks emit already exists in Task 2: `PoolCreated`, `TrancheSold`,
`WaterfallPaid`, `PoolTerminated`, `SwapWritten`, `SwapPremiumPaid`, `SwapTriggered`,
`SwapExpired` and `DistressedDebtIncurred`.

**Also required, in `core/errors.ts`** — three additions to `RejectionCode`, all
player-facing:

```ts
| 'ASSET_ALREADY_POOLED'          // Task 16 Step 3
| 'POOL_TERMINATED'               // Task 16 Step 3
| 'SWAP_NOTIONAL_EXCEEDS_FACE'    // Task 17 Step 2
```

**Also required, a new core module `core/money.ts`** (Task 16 Step 1), exporting
`floorPercent(amount: Money, rate: number): Money`. It is not optional polish:
`Math.floor(180 * 0.7)` is 125 and `Math.floor(350 * 0.7)` is 244, and $180 and $350 are
real deed prices. **`credit` must use this same helper** for the forced-liquidation floor
in Task 10 and for peer-loan interest in Task 11, or the two contexts will disagree on the
same rule.

**Also required, in `config/economy.ts`** — three additive constants, because the ratings
formula's coefficients are economic numbers and must not be inlined (Task 17 Step 1):

```ts
RATING_CONCENTRATION_WEIGHT: 0.25,
RATING_LEVERAGE_WEIGHT: 0.1,
RATING_MAX_LEVERAGE: 5,
```

No existing type in Task 2 is redefined or replaced by either task.
