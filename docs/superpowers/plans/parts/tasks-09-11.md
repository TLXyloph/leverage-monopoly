## Tasks 9-11

The `credit` bounded context, in three tasks. Every step codes against the contract
fixed by Tasks 1-2: `GameState`, `PlayerState`, `DeedState`, `PeerLoan`, `Pool`,
`GameEvent`, `Rejection`, `ECONOMY`. No parallel types are introduced.

**Context file layout.** The canonical five files are `index.ts`, `reduce.ts`,
`decide.ts`, `selectors.ts`, `credit.test.ts`. This context is large enough that two
splits are made up front rather than retrofitted:

| File | Responsibility | Projected lines |
|---|---|---|
| `index.ts` | public surface only, no logic | ~50 |
| `selectors.ts` | pure derived reads: base, headroom, queues, loan lookups | ~200 |
| `reduce.ts` | `(state, event) => state` for all 18 credit events | ~260 |
| `decide.ts` | `(state, command, ports) => GameEvent[] \| Rejection`, 7 commands | ~300 |
| `settlement.ts` | the spec 19.1 step generators (3, 4, 5, 8, 10) and the stimulus | ~200 |
| `fixture.ts` | test-support state builders, not exported from `index.ts` | ~130 |
| `credit.test.ts` | Task 9 | ~250 |
| `margin.test.ts` | Task 10 | ~340 |
| `peer-loans.test.ts` | Task 11 | ~300 |

`settlement.ts` exists because Settlement step generators are neither deciders (they
take no command) nor reducers (they emit rather than apply). Folding them into
`decide.ts` would push it past 500 lines by Task 11. If `reduce.ts` or `decide.ts` later
approaches 500 lines, split the peer-loan cases into `reduce-loans.ts` and
`decide-loans.ts` and re-export; the event switch and the command switch are the natural
seams.

**Rounding.** Every percentage and interest calculation floors to whole dollars via
`applyRate` (Task 9, Step 1). The only division is the credit-impairment halving, which
is `Math.floor(base / 2)`. Each is restated at its step.

---

### Task 9: `credit` — borrowing base, drawing, interest, carrying cost, stimulus

**Files:**
- Create: `packages/engine/src/core/money.ts`
- Create: `packages/engine/src/contexts/credit/selectors.ts`
- Create: `packages/engine/src/contexts/credit/reduce.ts`
- Create: `packages/engine/src/contexts/credit/decide.ts`
- Create: `packages/engine/src/contexts/credit/settlement.ts`
- Create: `packages/engine/src/contexts/credit/index.ts`
- Create: `packages/engine/src/contexts/credit/fixture.ts`
- Modify: `packages/engine/src/config/economy.ts` (`LIQUIDATION_FLOOR` 0.7 → 0.8, add
  `BUILDING_SELLBACK_RATE`, add the startup assertion)
- Modify: `packages/engine/src/core/events.ts` (add `capitalised` to `InterestAccrued`)
- Modify: `packages/engine/src/core/errors.ts` (add `INVALID_AMOUNT`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/credit/credit.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerState`, `DeedState`, `GameEvent`, `Rejection`, `reject`,
  `isRejection`, `PlayerId`, `DeedId`, `ColorGroup`, `Money`, `ECONOMY`, `PLAYER_IDS`.
- Produces:
  - `applyRate(amount: Money, rate: number): Money`
  - `isWholeDollars(amount: number): boolean`
  - `borrowingBase(state: GameState, player: PlayerId): Money`
  - `creditHeadroom(state: GameState, player: PlayerId): Money`
  - `carryingCostFor(state: GameState, player: PlayerId): Money`
  - `unmortgagedDeedCount(state: GameState, player: PlayerId): number`
  - `prevailingRate(state: GameState): number`
  - `creditInterestDue(state: GameState, player: PlayerId): Money`
  - `reduceCredit(state: GameState, event: GameEvent): GameState`
  - `decideCredit(state: GameState, command: CreditCommand, ports?: CreditPorts): readonly GameEvent[] | Rejection`
  - `settleCarryingCost(state: GameState): readonly GameEvent[]` — Settlement step 3
  - `settleCreditInterest(state: GameState): readonly GameEvent[]` — Settlement step 4
  - `advanceEraIIStimulus(state: GameState): readonly GameEvent[]` — Market phase, round 7
  - `STIMULUS_ROUND: number`
  - `type CreditCommand`

- [ ] **Step 1: Write `core/money.ts`**

The IEEE-754 note is load-bearing, not decoration: `350 * 0.7` evaluates to
`244.99999999999997`, so a naive `Math.floor` returns 244 where the correct floor of 70%
of $350 is 245. The same class of error bites at the 80% floor and at every interest rate.

```ts
import type { Money } from './types.js'

/**
 * Multiply an integer-dollar amount by a rate and round DOWN to whole dollars.
 *
 * The 1e6 pre-round removes IEEE-754 representation error before flooring. Without it,
 * 350 * 0.7 evaluates to 244.99999999999997 and Math.floor yields 244 rather than the
 * correct 245. Amounts in this game never exceed 1e6, so the pre-round can never mask a
 * genuine fractional dollar.
 */
export function applyRate(amount: Money, rate: number): Money {
  return Math.floor(Math.round(amount * rate * 1e6) / 1e6)
}

/** True for a finite, non-negative, whole-dollar amount. */
export function isWholeDollars(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0
}
```

- [ ] **Step 2: Update `config/economy.ts` and add the divergence assertion**

Change `LIQUIDATION_FLOOR` from `0.7` to `0.8` and add `BUILDING_SELLBACK_RATE`:

```ts
  /** Floor price in a forced liquidation, as a fraction of deed face value. */
  LIQUIDATION_FLOOR: 0.8,

  /** Spec 19.6. Buildings sell back to the bank at this fraction of purchase cost. */
  BUILDING_SELLBACK_RATE: 0.5,
```

Then append below the `ECONOMY` object, outside it:

```ts
/**
 * Spec section 5: LIQUIDATION_FLOOR must be strictly greater than DEED_ADVANCE_RATE.
 *
 * A forced sale raises LIQUIDATION_FLOOR x face in cash but removes
 * DEED_ADVANCE_RATE x face from the borrowing base. If the floor were the lower of the
 * two, every forced sale would WIDEN the shortfall — at a 70% floor against a 75%
 * advance rate each sale makes the position 5% of face worse — and the auction would
 * terminate only by consuming the player's entire portfolio, leaving them worse off
 * than when it began. At 80% against 75% each sale narrows the shortfall by 5% of face
 * and liquidation converges.
 *
 * This invariant was violated in an earlier draft of the spec. These two constants must
 * never be tuned independently again, which is what this assertion guarantees.
 */
if (ECONOMY.LIQUIDATION_FLOOR <= ECONOMY.DEED_ADVANCE_RATE) {
  throw new Error(
    `LIQUIDATION_FLOOR (${ECONOMY.LIQUIDATION_FLOOR}) must exceed DEED_ADVANCE_RATE ` +
      `(${ECONOMY.DEED_ADVANCE_RATE}) or forced liquidation diverges. See spec section 5.`,
  )
}
```

A module-level throw is permitted here: it is deterministic, performs no I/O, and reads
no clock, so it does not weaken the engine's purity guarantees.

- [ ] **Step 3: Extend `core/events.ts` and `core/errors.ts`**

In `core/events.ts`, replace the `InterestAccrued` variant:

```ts
  | { type: 'InterestAccrued'; player: PlayerId; amount: Money; rate: number
      /** True when the player could not pay from clean cash and it rolled into the drawn balance. */
      capitalised: boolean }
```

In `core/errors.ts`, add `'INVALID_AMOUNT'` to the `RejectionCode` union.

- [ ] **Step 4: Write `contexts/credit/fixture.ts`**

Test-support builders, deliberately not re-exported from `index.ts`. Deed face values,
groups, house costs and rent tables here are arbitrary stand-ins for Task 3's
`config/board.ts`; they are board data, not economic policy, so they are not required to
come from `ECONOMY`.

```ts
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import type { DeedState, GameConfig, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { reduceCredit } from './reduce.js'

const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

export function player(id: PlayerId, patch: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    cleanCash: ECONOMY.STARTING_CASH,
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
    ...patch,
  }
}

/** Board data placeholder. Task 3 supplies the real 28 deeds. */
export function deed(id: DeedId, faceValue: Money, patch: Partial<DeedState> = {}): DeedState {
  return {
    id,
    square: 1,
    group: 'brown',
    faceValue,
    houseCost: 50,
    rentTable: [2, 10, 30, 90, 160, 250],
    owner: null,
    mortgaged: false,
    houses: 0,
    ...patch,
  }
}

export function gameState(patch: Partial<GameState> = {}): GameState {
  const players: Record<PlayerId, PlayerState> = {
    P1: player('P1'), P2: player('P2'), P3: player('P3'), P4: player('P4'),
  }
  return {
    config: CONFIG,
    phase: 'open',
    round: 1,
    era: 1,
    activePlayer: null,
    players,
    deeds: {},
    treasury: 0,
    housesRemaining: ECONOMY.HOUSE_SUPPLY,
    hotelsRemaining: ECONOMY.HOTEL_SUPPLY,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: {
      1: { order: [], drawn: 0 },
      2: { order: [], drawn: 0 },
      3: { order: [], drawn: 0 },
      4: { order: [], drawn: 0 },
    },
    ...patch,
  }
}

export function withDeeds(state: GameState, deeds: readonly DeedState[]): GameState {
  const map: Record<DeedId, DeedState> = { ...state.deeds }
  for (const d of deeds) map[d.id] = d
  return { ...state, deeds: map }
}

export function withPlayers(
  state: GameState,
  patches: Partial<Record<PlayerId, Partial<PlayerState>>>,
): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  for (const id of PLAYER_IDS) {
    const patch = patches[id]
    if (patch !== undefined) players[id] = { ...players[id], ...patch }
  }
  return { ...state, players }
}

export function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`expected events, got rejection ${result.code}`)
  return result
}

export function rejectionOf(result: readonly GameEvent[] | Rejection): Rejection {
  if (!isRejection(result)) throw new Error('expected a rejection, got events')
  return result
}

export function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce<GameState>((acc, event) => reduceCredit(acc, event), state)
}
```

- [ ] **Step 5: Write the failing test for the borrowing base, the flat charges, and the floor invariant**

`packages/engine/src/contexts/credit/credit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { applyRate } from '../../core/money.js'
import { deed, gameState, withDeeds, withPlayers } from './fixture.js'
import {
  borrowingBase, carryingCostFor, creditHeadroom, creditInterestDue, prevailingRate,
} from './selectors.js'

describe('the liquidation floor must exceed the advance rate (spec section 5)', () => {
  it('holds for the shipped constants', () => {
    // A forced sale raises LIQUIDATION_FLOOR x face but removes DEED_ADVANCE_RATE x
    // face from the base. Floor below advance means every sale widens the shortfall.
    expect(ECONOMY.LIQUIDATION_FLOOR).toBeGreaterThan(ECONOMY.DEED_ADVANCE_RATE)
    expect(ECONOMY.LIQUIDATION_FLOOR).toBe(0.8)
    expect(ECONOMY.DEED_ADVANCE_RATE).toBe(0.75)
  })

  it('narrows the shortfall by exactly the gap between the two rates, per dollar of face', () => {
    const face = 400
    const cashRaised = applyRate(face, ECONOMY.LIQUIDATION_FLOOR)
    const baseLost = applyRate(face, ECONOMY.DEED_ADVANCE_RATE)
    expect(cashRaised - baseLost).toBe(20) // 400 * (0.80 - 0.75)
    expect(cashRaised).toBeGreaterThan(baseLost)
  })
})

describe('borrowing base (spec section 5)', () => {
  it('advances DEED_ADVANCE_RATE against unmortgaged deed face value', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('park-place', 350, { owner: 'P1' }),
    ])
    // (400 + 350) * 0.75 = 562.5, floored to 562
    expect(borrowingBase(s, 'P1')).toBe(562)
    expect(borrowingBase(s, 'P1')).toBe(applyRate(750, ECONOMY.DEED_ADVANCE_RATE))
  })

  it('excludes mortgaged deeds entirely', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('park-place', 350, { owner: 'P1', mortgaged: true }),
    ])
    expect(borrowingBase(s, 'P1')).toBe(300) // 400 * 0.75
  })

  it('advances BUILDING_ADVANCE_RATE against building cost', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1', houses: 3, houseCost: 200 }),
    ])
    // deeds 400 * 0.75 = 300, buildings (3 * 200) * 0.5 = 300
    expect(borrowingBase(s, 'P1')).toBe(600)
  })

  it('counts only deeds the player actually owns', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('marvin-gardens', 280, { owner: 'P2' }),
      deed('baltic', 60, { owner: null }),
    ])
    expect(borrowingBase(s, 'P1')).toBe(300)
    expect(borrowingBase(s, 'P2')).toBe(210)
  })

  it('halves the base permanently once the player is credit-impaired', () => {
    const clean = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])
    const impaired = withPlayers(clean, { P1: { creditImpaired: true } })
    expect(borrowingBase(clean, 'P1')).toBe(300)
    expect(borrowingBase(impaired, 'P1')).toBe(150)
  })

  it('rounds the impairment halving down', () => {
    const clean = withDeeds(gameState(), [deed('park-place', 350, { owner: 'P1' })])
    const impaired = withPlayers(clean, { P1: { creditImpaired: true } })
    expect(borrowingBase(clean, 'P1')).toBe(262)    // 350 * 0.75 = 262.5 -> 262
    expect(borrowingBase(impaired, 'P1')).toBe(131) // floor(262 / 2)
  })

  it('reports headroom net of the drawn balance, and lets it go negative', () => {
    const base = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])
    expect(creditHeadroom(withPlayers(base, { P1: { drawnCredit: 120 } }), 'P1')).toBe(180)
    expect(creditHeadroom(withPlayers(base, { P1: { drawnCredit: 400 } }), 'P1')).toBe(-100)
  })
})

describe('carrying cost and the prevailing rate', () => {
  it('charges CARRYING_COST_PER_DEED per unmortgaged deed, and nothing for buildings', () => {
    const s = withDeeds(gameState(), [
      deed('a', 100, { owner: 'P1', houses: 4 }),
      deed('b', 120, { owner: 'P1' }),
      deed('c', 140, { owner: 'P1', mortgaged: true }),
      deed('d', 160, { owner: 'P2' }),
    ])
    expect(carryingCostFor(s, 'P1')).toBe(2 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(carryingCostFor(s, 'P2')).toBe(ECONOMY.CARRYING_COST_PER_DEED)
  })

  it('reads the prevailing rate from the current era', () => {
    expect(prevailingRate(gameState({ era: 1 }))).toBe(ECONOMY.INTEREST_RATE_BY_ERA[1])
    expect(prevailingRate(gameState({ era: 4 }))).toBe(ECONOMY.INTEREST_RATE_BY_ERA[4])
  })

  it('floors credit interest to whole dollars', () => {
    const s = withPlayers(gameState({ era: 3 }), { P1: { drawnCredit: 507 } })
    expect(creditInterestDue(s, 'P1')).toBe(40) // 507 * 0.08 = 40.56 -> 40
  })
})
```

- [ ] **Step 6: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./selectors.js`.

- [ ] **Step 7: Write `contexts/credit/selectors.ts`**

Rounding, stated once and honoured throughout: each borrowing-base component floors
independently and then sums; the credit-impairment halving floors the sum. The
liquidation queue holds **unmortgaged deeds only**, which is what makes spec section 5's
stop condition ("no unmortgaged deeds left") expressible as an empty queue.

```ts
import { ECONOMY } from '../../config/economy.js'
import { applyRate } from '../../core/money.js'
import type { DeedState, GameState, PeerLoan } from '../../core/state.js'
import type { ColorGroup, ContractId, DeedId, Money, PlayerId } from '../../core/types.js'

function byIdAscending(a: DeedState, b: DeedState): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function deedsOwnedBy(state: GameState, player: PlayerId): readonly DeedState[] {
  return Object.values(state.deeds).filter((d) => d.owner === player)
}

export function unmortgagedDeedCount(state: GameState, player: PlayerId): number {
  return deedsOwnedBy(state, player).filter((d) => !d.mortgaged).length
}

/**
 * Spec section 5. DEED_ADVANCE_RATE against unmortgaged deed face value plus
 * BUILDING_ADVANCE_RATE against building cost. Each component floors independently.
 * A credit-impaired player (peer-loan default, spec section 7) has the total halved,
 * rounded down, permanently. Spec 19.10: the halving is applied once however many
 * times the player defaults, which the boolean `creditImpaired` flag makes automatic.
 */
export function borrowingBase(state: GameState, player: PlayerId): Money {
  const eligible = deedsOwnedBy(state, player).filter((d) => !d.mortgaged)
  const face = eligible.reduce((sum, d) => sum + d.faceValue, 0)
  const buildings = eligible.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  const raw =
    applyRate(face, ECONOMY.DEED_ADVANCE_RATE) +
    applyRate(buildings, ECONOMY.BUILDING_ADVANCE_RATE)
  return state.players[player].creditImpaired ? Math.floor(raw / 2) : raw
}

/** May be negative; a negative headroom is exactly a margin breach. */
export function creditHeadroom(state: GameState, player: PlayerId): Money {
  return borrowingBase(state, player) - state.players[player].drawnCredit
}

/** The amount by which the drawn balance exceeds the base. Zero or negative when clear. */
export function marginShortfall(state: GameState, player: PlayerId): Money {
  return state.players[player].drawnCredit - borrowingBase(state, player)
}

/** Settlement step 3. Flat per unmortgaged deed, from round 1. Buildings are exempt. */
export function carryingCostFor(state: GameState, player: PlayerId): Money {
  return unmortgagedDeedCount(state, player) * ECONOMY.CARRYING_COST_PER_DEED
}

export function prevailingRate(state: GameState): number {
  return ECONOMY.INTEREST_RATE_BY_ERA[state.era]
}

/** Settlement step 4. Floored. */
export function creditInterestDue(state: GameState, player: PlayerId): Money {
  return applyRate(state.players[player].drawnCredit, prevailingRate(state))
}

/** Settlement step 8. Floored. Compounds because it applies to the running balance. */
export function distressedInterestDue(state: GameState, player: PlayerId): Money {
  return applyRate(state.players[player].distressedDebt, ECONOMY.DISTRESSED_DEBT_RATE)
}

export function isUnderMarginCall(state: GameState, player: PlayerId): boolean {
  return marginShortfall(state, player) > 0
}

/**
 * Spec section 5 plus 19.8. Flagged at Settlement of round N, cure window is the Open
 * phase of round N+1, liquidation auction runs at the start of the Open phase of N+2.
 */
export function liquidationRound(flaggedAt: number): number {
  return flaggedAt + 2
}

/** The LIQUIDATION_FLOOR price, floored. 80% of a $350 deed is 280, of a $400 deed 320. */
export function liquidationPrice(deed: DeedState): Money {
  return applyRate(deed.faceValue, ECONOMY.LIQUIDATION_FLOOR)
}

/**
 * Spec section 5: unmortgaged deeds only, descending face value. Ties break on deed id
 * ascending, for determinism under replay. An empty queue IS the stop condition
 * "the player has no unmortgaged deeds left".
 */
export function liquidationQueue(state: GameState, player: PlayerId): readonly DeedId[] {
  return deedsOwnedBy(state, player)
    .filter((d) => !d.mortgaged)
    .slice()
    .sort((a, b) => b.faceValue - a.faceValue || byIdAscending(a, b))
    .map((d) => d.id)
}

/**
 * Spec section 5. Buildings across the whole colour group sell back to the bank at
 * BUILDING_SELLBACK_RATE of purchase cost before the lot is auctioned. Clearing the
 * entire group to zero satisfies the even-build rule trivially.
 *
 * This is exactly shortfall-neutral: the base loses BUILDING_ADVANCE_RATE of cost and
 * the debt falls by BUILDING_SELLBACK_RATE of cost, and the two constants are equal.
 * Neutrality is exact rather than approximate because every Monopoly house cost is even,
 * so half of it is always a whole dollar and neither floor loses anything.
 */
export function groupBuildingStrip(
  state: GameState,
  player: PlayerId,
  group: ColorGroup,
): { readonly deeds: readonly DeedId[]; readonly proceeds: Money } {
  const built = deedsOwnedBy(state, player)
    .filter((d) => d.group === group && d.houses > 0)
    .slice()
    .sort(byIdAscending)
  const cost = built.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  return { deeds: built.map((d) => d.id), proceeds: applyRate(cost, ECONOMY.BUILDING_SELLBACK_RATE) }
}

/** Players whose flagged position survived its cure window and must be auctioned. */
export function playersAwaitingLiquidation(state: GameState): readonly PlayerId[] {
  return state.config.turnOrder.filter((id) => {
    const flaggedAt = state.players[id].marginCallFlaggedAt
    return (
      flaggedAt !== null &&
      state.round >= liquidationRound(flaggedAt) &&
      isUnderMarginCall(state, id)
    )
  })
}

export function activeLoans(state: GameState): readonly PeerLoan[] {
  return state.loans.filter((l) => l.status === 'active')
}

export function findLoan(state: GameState, id: ContractId): PeerLoan | undefined {
  return state.loans.find((l) => l.id === id)
}

/** Settlement step 5. Floored. */
export function peerLoanInterestDue(loan: PeerLoan): Money {
  return applyRate(loan.outstanding, loan.ratePerRound)
}

/** Deeds pledged against any still-active peer loan. */
export function pledgedDeeds(state: GameState): readonly DeedId[] {
  return activeLoans(state).flatMap((l) => [...l.collateral])
}

/** Spec 19.4. The live pool holding this note, or null if nobody has pooled it. */
export function poolHoldingLoan(state: GameState, id: ContractId): ContractId | null {
  const pool = state.pools.find(
    (p) => !p.terminated && p.assets.some((a) => a.kind === 'peer-loan' && a.id === id),
  )
  return pool === undefined ? null : pool.id
}

/** Spec 19.4. Pooled collateral sells to the bank at LIQUIDATION_FLOOR; cash enters the waterfall. */
export function collateralLiquidationProceeds(state: GameState, loan: PeerLoan): Money {
  return loan.collateral.reduce((sum, deedId) => {
    const d = state.deeds[deedId]
    return d === undefined ? sum : sum + liquidationPrice(d)
  }, 0)
}
```

- [ ] **Step 8: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/core/money.ts packages/engine/src/core/errors.ts \
        packages/engine/src/config/economy.ts packages/engine/src/contexts/credit
git commit -m "feat(credit): borrowing base, carrying cost, and the floor invariant

75% against unmortgaged deed face plus 50% against building cost, halved
permanently for a credit-impaired player. LIQUIDATION_FLOOR moves to 0.80
with a startup assertion that it strictly exceeds DEED_ADVANCE_RATE, since
a floor below the advance rate makes forced liquidation divergent."
```

- [ ] **Step 10: Write the failing test for drawing and repaying**

Append to `credit.test.ts`:

```ts
import { decideCredit } from './decide.js'
import { applyAll, eventsOf, rejectionOf } from './fixture.js'

describe('drawing and repaying the credit line', () => {
  const table = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])

  it('credits clean cash and raises the drawn balance', () => {
    const events = eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 250 }))
    expect(events).toEqual([{ type: 'CreditDrawn', player: 'P1', amount: 250 }])
    const after = applyAll(table, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 250)
    expect(after.players.P1.drawnCredit).toBe(250)
    expect(after.treasury).toBe(0) // principal is bank money, not Treasury money
  })

  it('refuses a draw beyond the borrowing base, and allows one exactly to it', () => {
    expect(rejectionOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 301 })).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
    const at = eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 300 }))
    expect(applyAll(table, at).players.P1.drawnCredit).toBe(300)
  })

  it('refuses a zero, negative or fractional draw', () => {
    for (const amount of [0, -50, 12.5]) {
      expect(rejectionOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount })).code)
        .toBe('INVALID_AMOUNT')
    }
  })

  it('refuses any credit action outside the Open phase', () => {
    const settling = { ...table, phase: 'settlement' as const }
    expect(rejectionOf(decideCredit(settling, { type: 'DrawCredit', player: 'P1', amount: 10 })).code)
      .toBe('WRONG_PHASE')
  })

  it('repays from clean cash and lowers the drawn balance', () => {
    const drawn = withPlayers(table, { P1: { cleanCash: 500, drawnCredit: 300 } })
    const events = eventsOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 200 }))
    expect(events).toEqual([{ type: 'CreditRepaid', player: 'P1', amount: 200 }])
    const after = applyAll(drawn, events)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.drawnCredit).toBe(100)
  })

  it('refuses to repay more than is drawn, or more clean cash than is held', () => {
    const drawn = withPlayers(table, { P1: { cleanCash: 50, drawnCredit: 300 } })
    expect(rejectionOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 301 })).code)
      .toBe('INVALID_AMOUNT')
    expect(rejectionOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 200 })).code)
      .toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('lets a credit-impaired player draw only against the halved base', () => {
    const impaired = withPlayers(table, { P1: { creditImpaired: true } })
    expect(rejectionOf(decideCredit(impaired, { type: 'DrawCredit', player: 'P1', amount: 151 })).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
    expect(eventsOf(decideCredit(impaired, { type: 'DrawCredit', player: 'P1', amount: 150 })))
      .toHaveLength(1)
  })
})
```

- [ ] **Step 11: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./decide.js` or `./reduce.js`.

- [ ] **Step 12: Write `contexts/credit/reduce.ts` with the credit-line cases**

The liquidation and peer-loan cases are added in Tasks 10 and 11; the `default` arm keeps
the reducer total.

```ts
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState, PeerLoan, PlayerState } from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'

export function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...patch }
  return { ...state, players }
}

export function addCash(state: GameState, id: PlayerId, delta: Money): GameState {
  return withPlayer(state, id, { cleanCash: state.players[id].cleanCash + delta })
}

export function withDeed(state: GameState, id: DeedId, patch: Partial<DeedState>): GameState {
  const existing = state.deeds[id]
  if (existing === undefined) return state
  return { ...state, deeds: { ...state.deeds, [id]: { ...existing, ...patch } } }
}

export function withLoan(state: GameState, id: ContractId, patch: Partial<PeerLoan>): GameState {
  return { ...state, loans: state.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}

/** Applies `amount` against the drawn balance; anything beyond it returns as clean cash. */
export function applyAgainstDebt(state: GameState, id: PlayerId, amount: Money): GameState {
  const p = state.players[id]
  const applied = Math.min(amount, p.drawnCredit)
  return withPlayer(state, id, {
    drawnCredit: p.drawnCredit - applied,
    cleanCash: p.cleanCash + (amount - applied),
  })
}

export function reduceCredit(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'CreditDrawn': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
    }

    case 'CreditRepaid': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        drawnCredit: p.drawnCredit - event.amount,
      })
    }

    /** Spec section 5: interest is paid to the Treasury, or capitalises if unpayable. */
    case 'InterestAccrued': {
      const p = state.players[event.player]
      if (event.capitalised) {
        return withPlayer(state, event.player, { drawnCredit: p.drawnCredit + event.amount })
      }
      const next = withPlayer(state, event.player, { cleanCash: p.cleanCash - event.amount })
      return { ...next, treasury: next.treasury + event.amount }
    }

    /** Spec section 4: the Era II stimulus is a loan, so it lands on the drawn balance too. */
    case 'StimulusAdvanced': {
      const p = state.players[event.player]
      const next = withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
      return { ...next, treasury: next.treasury - event.amount }
    }

    /** Pays what the player has; any shortfall arrives as its own DistressedDebtIncurred. */
    case 'CarryingCostCharged': {
      const p = state.players[event.player]
      const paid = Math.min(p.cleanCash, event.amount)
      const next = withPlayer(state, event.player, { cleanCash: p.cleanCash - paid })
      return { ...next, treasury: next.treasury + paid }
    }

    case 'DistressedDebtIncurred':
    case 'DistressedDebtAccrued': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, { distressedDebt: p.distressedDebt + event.amount })
    }

    default:
      return state
  }
}
```

- [ ] **Step 13: Write `contexts/credit/decide.ts` with the draw and repay commands**

`CreditPorts` is declared now, in the shape Task 10 needs, so that the signature does not
change once liquidation lands. See the note under Task 10's Interfaces for why the
markets functions are injected rather than imported.

```ts
import { isWholeDollars } from '../../core/money.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { creditHeadroom } from './selectors.js'

/**
 * Functions owned by the `markets` context that liquidation needs (spec 19.12).
 * They are injected rather than imported because spec section 14 makes `markets` depend
 * on `credit`, so a direct import would invert the dependency graph and cycle.
 * The root decider, which may import both contexts, supplies the real implementations.
 */
export interface CreditPorts {
  /** Remaining expected value of any rent future on this deed, or 0 if there is none. */
  readonly rentFutureMakeWhole: (state: GameState, deed: DeedId) => Money
  /** Premium to refund on any deed option on this deed, or 0 if there is none. */
  readonly deedOptionRefund: (state: GameState, deed: DeedId) => Money
}

/** Safe default for states that carry no futures or options. Task 20 asserts the wiring. */
export const NO_ENCUMBRANCES: CreditPorts = {
  rentFutureMakeWhole: () => 0,
  deedOptionRefund: () => 0,
}

export type CreditCommand =
  | { readonly type: 'DrawCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'RepayCredit'; readonly player: PlayerId; readonly amount: Money }

export function decideCredit(
  state: GameState,
  command: CreditCommand,
  ports: CreditPorts = NO_ENCUMBRANCES,
): readonly GameEvent[] | Rejection {
  void ports // consumed by SettleLiquidationLot in Task 10
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Financial actions are only available during the Open phase.')
  }

  switch (command.type) {
    case 'DrawCredit': {
      if (!isWholeDollars(command.amount) || command.amount === 0) {
        return reject('INVALID_AMOUNT', 'Draw at least $1, in whole dollars.')
      }
      const headroom = creditHeadroom(state, command.player)
      if (command.amount > headroom) {
        return reject(
          'INSUFFICIENT_BORROWING_BASE',
          `Your borrowing base allows at most $${Math.max(0, headroom)} more.`,
        )
      }
      return [{ type: 'CreditDrawn', player: command.player, amount: command.amount }]
    }

    case 'RepayCredit': {
      const p = state.players[command.player]
      if (!isWholeDollars(command.amount) || command.amount === 0) {
        return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
      }
      if (command.amount > p.drawnCredit) {
        return reject('INVALID_AMOUNT', `You owe only $${p.drawnCredit} on your credit line.`)
      }
      if (command.amount > p.cleanCash) {
        return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${p.cleanCash} in clean cash.`)
      }
      return [{ type: 'CreditRepaid', player: command.player, amount: command.amount }]
    }
  }
}
```

- [ ] **Step 14: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 15: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): draw and repay the revolving credit line

Draws are capped at borrowing base minus drawn balance. Principal moves
between the player and the bank; the Treasury is untouched, because spec
section 4 gives the Treasury interest income only. CreditPorts is declared
now so liquidation can reach markets valuations without inverting the
context dependency graph."
```

- [ ] **Step 16: Write the failing test for Settlement steps 3 and 4, in spec 19.1 order**

Append to `credit.test.ts`. This is the ordering test the spec's step numbering demands:
carrying cost drains the cash that would otherwise have paid the interest, so the
interest capitalises. Reverse the two steps and the assertions change.

```ts
import { settleCarryingCost, settleCreditInterest } from './settlement.js'

const SEVEN_DEEDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) =>
  deed(id, 200, { owner: 'P1' }),
)

describe('Settlement steps 3 and 4 in spec 19.1 order', () => {
  // Base = (7 * 200) * 0.75 = 1050. Carrying cost = 7 * 8 = 56.
  // Interest at era 1 on 1010 drawn = floor(1010 * 0.05) = floor(50.5) = 50.
  const start = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), {
    P1: { cleanCash: 60, drawnCredit: 1010 },
  })

  it('charges carrying cost at step 3, to the Treasury', () => {
    const step3 = settleCarryingCost(start)
    expect(step3).toEqual([{ type: 'CarryingCostCharged', player: 'P1', deeds: 7, amount: 56 }])
    const after = applyAll(start, step3)
    expect(after.players.P1.cleanCash).toBe(4)
    expect(after.treasury).toBe(56)
  })

  it('capitalises interest at step 4 because step 3 already took the cash', () => {
    const afterStep3 = applyAll(start, settleCarryingCost(start))
    const step4 = settleCreditInterest(afterStep3)
    expect(step4).toEqual([
      { type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05, capitalised: true },
    ])
    const after = applyAll(afterStep3, step4)
    expect(after.players.P1.drawnCredit).toBe(1060) // 1010 + 50, now above the 1050 base
    expect(after.players.P1.cleanCash).toBe(4)
    expect(after.treasury).toBe(56) // capitalised interest never reaches the Treasury
  })

  it('pays interest to the Treasury when the player can afford it in full', () => {
    const rich = withPlayers(start, { P1: { cleanCash: 900 } })
    const afterStep3 = applyAll(rich, settleCarryingCost(rich))
    const step4 = settleCreditInterest(afterStep3)
    expect(step4).toEqual([
      { type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05, capitalised: false },
    ])
    const after = applyAll(afterStep3, step4)
    expect(after.players.P1.cleanCash).toBe(794) // 900 - 56 - 50
    expect(after.players.P1.drawnCredit).toBe(1010)
    expect(after.treasury).toBe(106)
  })

  it('capitalises all-or-nothing, never partially (spec section 5)', () => {
    const nearly = withPlayers(start, { P1: { cleanCash: 105 } }) // 105 - 56 = 49, one short
    const afterStep3 = applyAll(nearly, settleCarryingCost(nearly))
    expect(settleCreditInterest(afterStep3)).toEqual([
      { type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05, capitalised: true },
    ])
  })

  it('turns an unpayable carrying cost into distressed debt, with no auction (spec 19.8)', () => {
    const broke = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), { P1: { cleanCash: 20 } })
    const events = settleCarryingCost(broke)
    expect(events).toEqual([
      { type: 'CarryingCostCharged', player: 'P1', deeds: 7, amount: 56 },
      { type: 'DistressedDebtIncurred', player: 'P1', amount: 36 },
    ])
    const after = applyAll(broke, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.distressedDebt).toBe(36)
    expect(after.treasury).toBe(20)
  })

  it('emits nothing for a player who owns no unmortgaged deeds', () => {
    expect(settleCarryingCost(gameState())).toEqual([])
    expect(settleCreditInterest(gameState())).toEqual([])
  })
})
```

- [ ] **Step 17: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./settlement.js`.

- [ ] **Step 18: Write `contexts/credit/settlement.ts` with steps 3 and 4 and the stimulus**

```ts
import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import {
  carryingCostFor, creditInterestDue, prevailingRate, unmortgagedDeedCount,
} from './selectors.js'

/** Era II opens at the round after Era I ends. Spec section 2. */
export const STIMULUS_ROUND: number = ECONOMY.ROUNDS_PER_ERA + 1

/**
 * Spec section 4. The Treasury advances every player ERA_II_STIMULUS at the start of
 * round 7 as an interest-bearing loan, not a grant: it lands on clean cash AND on the
 * drawn credit balance, so Settlement step 4 charges the era rate on it from that round.
 * Called by `session` on entering the Market phase.
 */
export function advanceEraIIStimulus(state: GameState): readonly GameEvent[] {
  if (state.round !== STIMULUS_ROUND || state.phase !== 'market') return []
  return state.config.turnOrder.map((player) => ({
    type: 'StimulusAdvanced' as const,
    player,
    amount: ECONOMY.ERA_II_STIMULUS,
  }))
}

/**
 * Settlement step 3. CARRYING_COST_PER_DEED per unmortgaged deed, to the Treasury.
 * Spec 19.8: a shortfall becomes distressed debt immediately, with no auction.
 */
export function settleCarryingCost(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = carryingCostFor(state, player)
    if (amount === 0) continue
    events.push({
      type: 'CarryingCostCharged',
      player,
      deeds: unmortgagedDeedCount(state, player),
      amount,
    })
    const shortfall = amount - state.players[player].cleanCash
    if (shortfall > 0) events.push({ type: 'DistressedDebtIncurred', player, amount: shortfall })
  }
  return events
}

/**
 * Settlement step 4. Interest on the drawn balance at the era rate, floored, paid to the
 * Treasury. Spec section 5: a player who cannot pay from clean cash capitalises it into
 * the drawn balance. All-or-nothing — the spec says "cannot pay", not "pays what it can"
 * — which is what makes capitalisation able to push a position past its base.
 */
export function settleCreditInterest(state: GameState): readonly GameEvent[] {
  const rate = prevailingRate(state)
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = creditInterestDue(state, player)
    if (amount === 0) continue
    events.push({
      type: 'InterestAccrued',
      player,
      amount,
      rate,
      capitalised: state.players[player].cleanCash < amount,
    })
  }
  return events
}
```

- [ ] **Step 19: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 20: Write the failing test for the Era II stimulus**

Append to `credit.test.ts`:

```ts
import { advanceEraIIStimulus, STIMULUS_ROUND } from './settlement.js'

describe('Era II stimulus (spec section 4)', () => {
  it('fires once, at the Market phase of round 7', () => {
    expect(STIMULUS_ROUND).toBe(7)
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market' })
    expect(advanceEraIIStimulus(market)).toEqual([
      { type: 'StimulusAdvanced', player: 'P1', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P2', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P3', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P4', amount: ECONOMY.ERA_II_STIMULUS },
    ])
  })

  it('fires in no other round and no other phase', () => {
    expect(advanceEraIIStimulus(gameState({ round: 6, era: 1, phase: 'market' }))).toEqual([])
    expect(advanceEraIIStimulus(gameState({ round: 8, era: 2, phase: 'market' }))).toEqual([])
    expect(advanceEraIIStimulus(gameState({ round: 7, era: 2, phase: 'open' }))).toEqual([])
  })

  it('is a loan: it lands on clean cash and on the drawn balance, and drains the Treasury', () => {
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market', treasury: 5000 })
    const after = applyAll(market, advanceEraIIStimulus(market))
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + ECONOMY.ERA_II_STIMULUS)
    expect(after.players.P1.drawnCredit).toBe(ECONOMY.ERA_II_STIMULUS)
    expect(after.treasury).toBe(5000 - 4 * ECONOMY.ERA_II_STIMULUS)
  })

  it('accrues at the Era II rate from that same round', () => {
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market' })
    const advanced = applyAll(market, advanceEraIIStimulus(market))
    const settling = { ...advanced, phase: 'settlement' as const }
    expect(settleCreditInterest(settling)[0]).toEqual({
      type: 'InterestAccrued', player: 'P1', amount: 18, rate: 0.06, capitalised: false,
    }) // floor(300 * 0.06) = 18
  })
})
```

- [ ] **Step 21: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS — Step 18 already implemented `advanceEraIIStimulus`. If any case fails,
fix `settlement.ts` before continuing.

- [ ] **Step 22: Write `contexts/credit/index.ts`**

Liquidation and peer-loan exports are appended in Tasks 10 and 11.

```ts
export type { CreditCommand, CreditPorts } from './decide.js'
export { NO_ENCUMBRANCES, decideCredit } from './decide.js'
export { reduceCredit } from './reduce.js'
export {
  STIMULUS_ROUND,
  advanceEraIIStimulus,
  settleCarryingCost,
  settleCreditInterest,
} from './settlement.js'
export {
  borrowingBase,
  carryingCostFor,
  creditHeadroom,
  creditInterestDue,
  deedsOwnedBy,
  distressedInterestDue,
  isUnderMarginCall,
  marginShortfall,
  prevailingRate,
  unmortgagedDeedCount,
} from './selectors.js'
```

Add to `packages/engine/src/index.ts`:

```ts
export * from './contexts/credit/index.js'
```

- [ ] **Step 23: Run the whole toolchain and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. `fixture.ts` must not be reachable from `contexts/credit/index.ts`.

```bash
git add packages/engine/src/contexts/credit packages/engine/src/index.ts
git commit -m "feat(credit): Settlement steps 3 and 4, and the Era II stimulus

Carrying cost precedes interest exactly as spec 19.1 orders them, so a
player drained by the levy capitalises interest rather than paying it.
The round-7 stimulus lands on clean cash and the drawn balance together,
which is what makes it a loan rather than \$1,200 of permanent inflation."
```

---

### Task 10: `credit` — margin calls, forced liquidation, distressed debt

**Files:**
- Modify: `packages/engine/src/core/events.ts` (add `DistressedDebtRepaid`,
  `CreditWrittenDown`, `BuildingsStripped`, `EncumbranceExtinguished`)
- Modify: `packages/engine/src/core/errors.ts` (add `NO_PENDING_LIQUIDATION`,
  `WRONG_LIQUIDATION_LOT`)
- Modify: `packages/engine/src/contexts/credit/reduce.ts`
- Modify: `packages/engine/src/contexts/credit/decide.ts`
- Modify: `packages/engine/src/contexts/credit/settlement.ts`
- Modify: `packages/engine/src/contexts/credit/index.ts`
- Test: `packages/engine/src/contexts/credit/margin.test.ts`

**Interfaces:**
- Consumes from Task 9: `borrowingBase`, `marginShortfall`, `isUnderMarginCall`,
  `liquidationPrice`, `liquidationQueue`, `liquidationRound`,
  `playersAwaitingLiquidation`, `groupBuildingStrip`, `distressedInterestDue`,
  `applyAgainstDebt`, `CreditPorts`, `NO_ENCUMBRANCES`.
- **Consumes from `markets`, injected via `CreditPorts` (spec 19.12):**
  - `rentFutureMakeWhole(state: GameState, deed: DeedId): Money` — the remaining
    expected value of the rent future on that deed, or 0 if there is none
  - `deedOptionRefund(state: GameState, deed: DeedId): Money` — the premium to refund on
    the deed option on that deed, or 0 if there is none

  These are **injected, not imported.** Spec section 14 makes `markets` depend on
  `credit`, so importing `markets` from `credit` would invert the dependency graph, cycle
  the build order, and trip the `no-restricted-imports` rule from Task 1. The root
  decider — which may import both contexts — constructs a `CreditPorts` from the two
  markets functions and passes it to `decideCredit`. The signatures above are exactly
  what the markets agent specified, so they reconcile at merge; only the call site moves.
  `deedOptionRefund` additionally requires `DeedOption` to carry the premium paid at
  origination, which Task 2's shape lacks — see NEW STATE FIELDS REQUIRED.
- Produces:
  - `flagMarginCalls(state: GameState): readonly GameEvent[]` — Settlement step 10
  - `settleDistressedDebt(state: GameState): readonly GameEvent[]` — Settlement step 8
  - `exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[]`
  - `CreditCommand` gains `SettleLiquidationLot` and `RepayDistressedDebt`

- [ ] **Step 1: Extend `core/events.ts` and `core/errors.ts`**

Add four variants in the `--- credit ---` block of `core/events.ts`:

```ts
  | { type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }
  /** Drawn credit that liquidation could not clear, converted to distressed debt. */
  | { type: 'CreditWrittenDown'; player: PlayerId; amount: Money }
  /** Spec section 5. Colour group stripped to bare land before a lot is auctioned. */
  | { type: 'BuildingsStripped'; player: PlayerId; deeds: readonly DeedId[]; proceeds: Money }
  /** Spec 19.12. Liquidation cancels the contract and the debtor owes the holder. */
  | { type: 'EncumbranceExtinguished'; player: PlayerId; deed: DeedId; contract: ContractId
      kind: 'rent-future' | 'deed-option'; holder: PlayerId; amount: Money }
```

Add two codes to `RejectionCode` in `core/errors.ts`:

```ts
  | 'NO_PENDING_LIQUIDATION' | 'WRONG_LIQUIDATION_LOT'
```

- [ ] **Step 2: Write the failing test for margin flagging at Settlement step 10**

`packages/engine/src/contexts/credit/margin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import type { CreditPorts } from './decide.js'
import { decideCredit } from './decide.js'
import { applyAll, deed, eventsOf, gameState, rejectionOf, withDeeds, withPlayers } from './fixture.js'
import {
  borrowingBase, liquidationPrice, liquidationQueue, marginShortfall, playersAwaitingLiquidation,
} from './selectors.js'
import {
  exhaustLiquidation, flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt,
} from './settlement.js'

const SEVEN_DEEDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) =>
  deed(id, 200, { owner: 'P1' }),
)

describe('margin flagging, Settlement step 10 (spec section 5)', () => {
  it('flags a position whose drawn balance exceeds the borrowing base', () => {
    const s = withPlayers(withDeeds(gameState({ round: 4 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200 }, // base is 1050
    })
    expect(flagMarginCalls(s)).toEqual([
      { type: 'MarginCallFlagged', player: 'P1', shortfall: 150 },
    ])
    expect(applyAll(s, flagMarginCalls(s)).players.P1.marginCallFlaggedAt).toBe(4)
  })

  it('does not flag a position drawn exactly to the base', () => {
    const s = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), { P1: { drawnCredit: 1050 } })
    expect(flagMarginCalls(s)).toEqual([])
  })

  it('leaves an already-flagged position flagged, emitting nothing', () => {
    const s = withPlayers(withDeeds(gameState({ round: 5 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200, marginCallFlaggedAt: 4 },
    })
    expect(flagMarginCalls(s)).toEqual([])
    expect(s.players.P1.marginCallFlaggedAt).toBe(4) // the clock does not restart
  })

  it('clears the flag when the position is back inside the base', () => {
    const s = withPlayers(withDeeds(gameState({ round: 5 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 900, marginCallFlaggedAt: 4 },
    })
    expect(flagMarginCalls(s)).toEqual([{ type: 'MarginCallCured', player: 'P1' }])
    expect(applyAll(s, flagMarginCalls(s)).players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('flags on the capitalisation produced at step 4 of the same Settlement', () => {
    // Base 1050, drawn 1010, cash 60. Step 3 takes 56, step 4 capitalises 50 -> 1060.
    const start = withPlayers(withDeeds(gameState({ round: 3 }), SEVEN_DEEDS), {
      P1: { cleanCash: 60, drawnCredit: 1010 },
    })
    const afterStep3 = applyAll(start, settleCarryingCost(start))
    const afterStep4 = applyAll(afterStep3, settleCreditInterest(afterStep3))
    const afterStep8 = applyAll(afterStep4, settleDistressedDebt(afterStep4))
    expect(flagMarginCalls(afterStep8)).toEqual([
      { type: 'MarginCallFlagged', player: 'P1', shortfall: 10 },
    ])
  })

  it('does not flag on a step-9 audit fine, which is distressed debt, not drawn credit', () => {
    // Spec 19.8: an unpayable audit fine becomes distressed debt. Distressed debt sits
    // outside both the drawn balance and the borrowing base, so it cannot breach.
    const s = withPlayers(withDeeds(gameState({ round: 3 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1000, distressedDebt: 900, cleanCash: 0 },
    })
    expect(flagMarginCalls(s)).toEqual([])
  })

  it('marks a position for liquidation only after its cure window has passed', () => {
    const flagged = withPlayers(withDeeds(gameState({ round: 4 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200, marginCallFlaggedAt: 4 },
    })
    expect(playersAwaitingLiquidation(flagged)).toEqual([])                      // Settlement of round 4
    expect(playersAwaitingLiquidation({ ...flagged, round: 5 })).toEqual([])     // cure window
    expect(playersAwaitingLiquidation({ ...flagged, round: 6 })).toEqual(['P1']) // auction
  })
})
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: FAIL — `flagMarginCalls`, `settleDistressedDebt` and `exhaustLiquidation` are
not exported.

- [ ] **Step 4: Add steps 8 and 10 and the stop condition to `settlement.ts`**

Append, adding `borrowingBase`, `distressedInterestDue`, `liquidationQueue`,
`marginShortfall` to the `./selectors.js` import and `PlayerId` to the type imports:

```ts
/**
 * Settlement step 8. Spec 19.7: DISTRESSED_DEBT_RATE per round, COMPOUNDING, floored.
 * Compounding falls out of applying the rate to the running balance rather than to the
 * original principal. Never swept from spare clean cash — repayment is the player's
 * choice during any Open phase, and the compounding is the pressure.
 */
export function settleDistressedDebt(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const amount = distressedInterestDue(state, player)
    if (amount === 0) continue
    events.push({ type: 'DistressedDebtAccrued', player, amount })
  }
  return events
}

/**
 * Settlement step 10, after audits at step 9. A breached position not yet flagged is
 * flagged now; one already flagged keeps its original round, so the cure clock cannot be
 * restarted by breaching again; one back inside its base is cured. Liquidation itself
 * does not happen here — spec 19.8 puts it at the start of the Open phase two rounds on.
 */
export function flagMarginCalls(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const p = state.players[player]
    const shortfall = marginShortfall(state, player)
    if (shortfall > 0 && p.marginCallFlaggedAt === null) {
      events.push({ type: 'MarginCallFlagged', player, shortfall })
    } else if (shortfall <= 0 && p.marginCallFlaggedAt !== null) {
      events.push({ type: 'MarginCallCured', player })
    }
  }
  return events
}

/**
 * Spec section 5's second stop condition, and spec 19.8. Liquidation stops when the
 * position is cured OR when the player has no unmortgaged deeds left; any residual
 * shortfall becomes distressed debt. Called at the start of the Open phase once the
 * auction has emptied the queue.
 *
 * At LIQUIDATION_FLOOR 0.80 against DEED_ADVANCE_RATE 0.75 each sale narrows the
 * shortfall, so this path is reached only when the whole portfolio is worth less than
 * the drawn balance — not, as under the divergent 0.70 floor, on every liquidation.
 */
export function exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[] {
  const shortfall = marginShortfall(state, player)
  if (shortfall <= 0) return []
  if (liquidationQueue(state, player).length > 0) return []
  return [
    { type: 'CreditWrittenDown', player, amount: shortfall },
    { type: 'MarginCallCured', player },
  ]
}
```

Keep `borrowingBase` imported for the doc reference or drop it if unused; `marginShortfall`
supersedes it here.

- [ ] **Step 5: Add the flagging and distressed cases to `reduce.ts`**

Insert before the `default` arm:

```ts
    case 'MarginCallFlagged':
      return withPlayer(state, event.player, { marginCallFlaggedAt: state.round })

    case 'MarginCallCured':
      return withPlayer(state, event.player, { marginCallFlaggedAt: null })

    case 'DistressedDebtRepaid': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        distressedDebt: p.distressedDebt - event.amount,
      })
    }

    case 'CreditWrittenDown': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        drawnCredit: p.drawnCredit - event.amount,
        distressedDebt: p.distressedDebt + event.amount,
      })
    }
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/core packages/engine/src/contexts/credit
git commit -m "feat(credit): margin flagging at Settlement step 10

Flags after audits at step 9, exactly as spec 19.1 orders. An already
flagged position keeps its original round so the cure clock cannot be
restarted by breaching again."
```

- [ ] **Step 8: Write the failing test for the auction, its convergence, and the 80% floor**

Append to `margin.test.ts`:

```ts
describe('forced liquidation at the start of the Open phase (spec 19.8)', () => {
  // P1 flagged at round 5, so the auction runs in the Open phase of round 7.
  // P1 owns boardwalk 400 and park-place 350: base = 750 * 0.75 = 562, drawn 800.
  const table = withPlayers(
    withDeeds(gameState({ round: 7 }), [
      deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
      deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      deed('baltic', 60, { owner: 'P1', mortgaged: true }),
    ]),
    {
      P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
      P2: { cleanCash: 1000 },
      P3: { cleanCash: 1000 },
      P4: { cleanCash: 100 },
    },
  )

  it('queues unmortgaged deeds only, in descending face value order', () => {
    expect(liquidationQueue(table, 'P1')).toEqual(['boardwalk', 'park-place'])
  })

  it('prices the floor at LIQUIDATION_FLOOR of face', () => {
    expect(liquidationPrice(deed('boardwalk', 400))).toBe(320) // 400 * 0.80
    expect(liquidationPrice(deed('park-place', 350))).toBe(280) // 350 * 0.80
  })

  it('sells to the highest eligible bid', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 340 }, { player: 'P3', amount: 330 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'P2', price: 340 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('P2')
    expect(after.players.P2.cleanCash).toBe(660)
    expect(after.players.P1.drawnCredit).toBe(460)
  })

  it('ignores bids below the 80% floor and hands the deed to the bank at exactly 80%', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 319 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'bank', price: 320 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(after.players.P2.cleanCash).toBe(1000)
    expect(after.players.P1.drawnCredit).toBe(480)
  })

  it('CONVERGES: every forced sale strictly narrows the shortfall', () => {
    // This is the property LIQUIDATION_FLOOR > DEED_ADVANCE_RATE exists to protect.
    // At the old 0.70 floor each of these deltas would have been positive.
    let s = table
    const shortfalls = [marginShortfall(s, 'P1')]
    for (const lot of ['boardwalk', 'park-place']) {
      s = applyAll(s, eventsOf(decideCredit(s, {
        type: 'SettleLiquidationLot', player: 'P1', deed: lot, bids: [], // bank at the floor
      })))
      shortfalls.push(marginShortfall(s, 'P1'))
    }
    expect(shortfalls).toEqual([238, 218, 200])
    // 400 * (0.80 - 0.75) = 20, then 350 * (0.80 - 0.75) = 18
    for (let i = 1; i < shortfalls.length; i += 1) {
      expect(shortfalls[i]).toBeLessThan(shortfalls[i - 1] ?? 0)
    }
  })

  it('breaks tied top bids by turn order', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P3', amount: 340 }, { player: 'P2', amount: 340 }],
    }))
    expect(events[0]).toMatchObject({ buyer: 'P2', price: 340 })
  })

  it('stops the auction the moment the position is cured', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 800 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'P2', price: 800 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
    const after = applyAll(table, events)
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('returns proceeds beyond the drawn balance as clean cash', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 900 }],
    }))
    expect(applyAll(table, events).players.P1.cleanCash).toBe(100)
  })

  it('enforces the descending-face lot order', () => {
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'park-place', bids: [],
    })).code).toBe('WRONG_LIQUIDATION_LOT')
  })

  it('refuses to auction a player with no marked position', () => {
    const clear = withPlayers(table, { P1: { marginCallFlaggedAt: null } })
    expect(rejectionOf(decideCredit(clear, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    })).code).toBe('NO_PENDING_LIQUIDATION')
  })

  it('refuses a bid larger than the bidder holds, and a bid from the debtor', () => {
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P4', amount: 500 }],
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P1', amount: 500 }],
    })).code).toBe('NOT_OWNER')
  })
})
```

- [ ] **Step 9: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: FAIL — `SettleLiquidationLot` is not a `CreditCommand`.

- [ ] **Step 10: Add the liquidation cases to `reduce.ts`**

Insert before the `default` arm. Note `DeedLiquidated` no longer touches buildings: the
strip is its own event, emitted first, because spec section 5 makes it a colour-group
operation rather than a per-deed one.

```ts
    /**
     * Spec section 5. The whole colour group is cleared to bare land at
     * BUILDING_SELLBACK_RATE of purchase cost — which satisfies the even-build rule
     * trivially — and the proceeds go against the debt before the lot is auctioned.
     */
    case 'BuildingsStripped': {
      let next: GameState = state
      let houses = 0
      let hotels = 0
      for (const id of event.deeds) {
        const d = next.deeds[id]
        if (d === undefined) continue
        houses += d.houses === 5 ? 0 : d.houses
        hotels += d.houses === 5 ? 1 : 0
        next = withDeed(next, id, { houses: 0 })
      }
      next = {
        ...next,
        housesRemaining: next.housesRemaining + houses,
        hotelsRemaining: next.hotelsRemaining + hotels,
      }
      return applyAgainstDebt(next, event.player, event.proceeds)
    }

    /**
     * Spec 19.12. The holder is made whole in cash and the amount is ADDED to the
     * liquidated player's shortfall, so encumbrances make the position worse rather
     * than shielding it. Removing the contract from state.futures / state.options is
     * `markets`' reducer for this same event (Tasks 14 and 15).
     */
    case 'EncumbranceExtinguished': {
      const next = addCash(state, event.holder, event.amount)
      const debtor = next.players[event.player]
      return withPlayer(next, event.player, { drawnCredit: debtor.drawnCredit + event.amount })
    }

    case 'DeedLiquidated': {
      let next = withDeed(state, event.deed, { owner: event.buyer })
      if (event.buyer !== 'bank') next = addCash(next, event.buyer, -event.price)
      return applyAgainstDebt(next, event.player, event.price)
    }
```

- [ ] **Step 11: Add `SettleLiquidationLot` and `RepayDistressedDebt` to `decide.ts`**

Extend the `CreditCommand` union:

```ts
  | { readonly type: 'SettleLiquidationLot'
      readonly player: PlayerId
      readonly deed: DeedId
      readonly bids: readonly { readonly player: PlayerId; readonly amount: Money }[] }
  | { readonly type: 'RepayDistressedDebt'; readonly player: PlayerId; readonly amount: Money }
```

Add the extinguishment helper above `decideCredit`, and the two cases inside it. Remove
the `void ports` line added in Task 9. Imports needed: `reduceCredit`, and
`groupBuildingStrip`, `isUnderMarginCall`, `liquidationPrice`, `liquidationQueue`,
`playersAwaitingLiquidation` from `./selectors.js`.

```ts
/**
 * Spec 19.12. Liquidation extinguishes every encumbrance on the lot: the rent future
 * holder is made whole, the deed option holder gets their premium back, and both
 * amounts are added to the debtor's shortfall. The deed then reaches auction clean.
 *
 * There is deliberately NO transferability guard here. If an option lock blocked
 * liquidation, a distressed player could write a $1 option on all seven deeds and
 * become judgment-proof. If encumbrances instead followed the deed into the auction, a
 * player could write a $1-strike option to a confederate, be liquidated, collect the
 * bank's 80% floor and have the confederate exercise for a dollar. Extinguishing kills
 * both manoeuvres, which is why the rule exists.
 */
function extinguishmentEvents(
  state: GameState,
  player: PlayerId,
  deedId: DeedId,
  ports: CreditPorts,
): readonly GameEvent[] {
  const out: GameEvent[] = []
  const future = state.futures.find((f) => f.deed === deedId)
  if (future !== undefined) {
    out.push({
      type: 'EncumbranceExtinguished',
      player, deed: deedId, contract: future.id, kind: 'rent-future',
      holder: future.holder, amount: ports.rentFutureMakeWhole(state, deedId),
    })
  }
  const option = state.options.find((o) => o.deed === deedId)
  if (option !== undefined) {
    out.push({
      type: 'EncumbranceExtinguished',
      player, deed: deedId, contract: option.id, kind: 'deed-option',
      holder: option.holder, amount: ports.deedOptionRefund(state, deedId),
    })
  }
  return out
}
```

```ts
    case 'SettleLiquidationLot': {
      if (!playersAwaitingLiquidation(state).includes(command.player)) {
        return reject('NO_PENDING_LIQUIDATION', 'That player has no uncured margin call to resolve.')
      }
      const queue = liquidationQueue(state, command.player)
      if (queue[0] !== command.deed) {
        return reject(
          'WRONG_LIQUIDATION_LOT',
          `Lots are auctioned in descending face value. The next lot is ${String(queue[0])}.`,
        )
      }
      const lot = state.deeds[command.deed]
      if (lot === undefined) return reject('DEED_UNAVAILABLE', 'That deed is not on the board.')

      for (const bid of command.bids) {
        if (bid.player === command.player) {
          return reject('NOT_OWNER', 'The liquidating player may not bid on their own deeds.')
        }
        if (!isWholeDollars(bid.amount)) {
          return reject('INVALID_AMOUNT', 'Bids must be whole dollars.')
        }
        if (bid.amount > state.players[bid.player].cleanCash) {
          return reject(
            'INSUFFICIENT_CLEAN_CASH',
            `${bid.player} bid $${bid.amount} but holds $${state.players[bid.player].cleanCash}.`,
          )
        }
      }

      const events: GameEvent[] = []
      let working = state

      // 1. strip buildings across the colour group, proceeds against the debt
      const strip = groupBuildingStrip(working, command.player, lot.group)
      if (strip.proceeds > 0) {
        const stripped: GameEvent = {
          type: 'BuildingsStripped',
          player: command.player, deeds: strip.deeds, proceeds: strip.proceeds,
        }
        events.push(stripped)
        working = reduceCredit(working, stripped)
      }

      // 2. extinguish encumbrances, both amounts added to the shortfall (spec 19.12)
      for (const extinguished of extinguishmentEvents(working, command.player, command.deed, ports)) {
        events.push(extinguished)
        working = reduceCredit(working, extinguished)
      }

      // 3. auction the now-clean deed at or above the floor
      const floorPrice = liquidationPrice(lot)
      const ranked = command.bids
        .filter((b) => b.amount >= floorPrice)
        .slice()
        .sort(
          (a, b) =>
            b.amount - a.amount ||
            state.config.turnOrder.indexOf(a.player) - state.config.turnOrder.indexOf(b.player),
        )
      const winner = ranked[0]
      const sale: GameEvent = {
        type: 'DeedLiquidated',
        player: command.player,
        deed: command.deed,
        buyer: winner === undefined ? 'bank' : winner.player,
        price: winner === undefined ? floorPrice : winner.amount,
      }
      events.push(sale)
      working = reduceCredit(working, sale)

      // 4. stop the auction if the proceeds cured the position
      if (!isUnderMarginCall(working, command.player)) {
        events.push({ type: 'MarginCallCured', player: command.player })
      }
      return events
    }

    case 'RepayDistressedDebt': {
      const p = state.players[command.player]
      if (!isWholeDollars(command.amount) || command.amount === 0) {
        return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
      }
      if (command.amount > p.distressedDebt) {
        return reject('INVALID_AMOUNT', `Your distressed debt is $${p.distressedDebt}.`)
      }
      if (command.amount > p.cleanCash) {
        return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${p.cleanCash} in clean cash.`)
      }
      return [{ type: 'DistressedDebtRepaid', player: command.player, amount: command.amount }]
    }
```

- [ ] **Step 12: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 13: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): converging liquidation auction at the 80% floor

Unmortgaged lots in descending face value, to the highest bid at or above
80% of face, to the bank at exactly 80% if nobody bids. A convergence test
asserts every sale strictly narrows the shortfall — the property the
floor-above-advance-rate invariant exists to protect."
```

- [ ] **Step 14: Write the failing test for the building strip and its shortfall neutrality**

Append to `margin.test.ts`:

```ts
describe('developed deeds are stripped before auction (spec section 5)', () => {
  // P1 holds the full orange group, two houses on each. Face 180 + 180 + 200 = 560,
  // base = 420 + (6 * 100) * 0.5 = 420 + 300 = 720. Drawn 900, shortfall 180.
  const developed = withPlayers(
    withDeeds(gameState({ round: 7 }), [
      deed('new-york', 200, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
      deed('st-james', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
      deed('tennessee', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
    ]),
    { P1: { drawnCredit: 900, marginCallFlaggedAt: 5, cleanCash: 0 } },
  )

  it('strips the whole colour group first, then auctions the bare deed', () => {
    expect(borrowingBase(developed, 'P1')).toBe(720)
    const events = eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    }))
    expect(events).toEqual([
      { type: 'BuildingsStripped', player: 'P1',
        deeds: ['new-york', 'st-james', 'tennessee'], proceeds: 300 },
      { type: 'DeedLiquidated', player: 'P1', deed: 'new-york', buyer: 'bank', price: 160 },
    ])
    const after = applyAll(developed, events)
    expect(after.deeds['st-james']?.houses).toBe(0)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY + 6)
    expect(after.deeds['new-york']?.owner).toBe('bank')
  })

  it('is exactly shortfall-neutral, because the two building constants are equal', () => {
    expect(ECONOMY.BUILDING_SELLBACK_RATE).toBe(ECONOMY.BUILDING_ADVANCE_RATE)
    const strip = eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    }))[0]
    const afterStrip = applyAll(developed, strip === undefined ? [] : [strip])
    // base falls by 300, drawn falls by 300, so the shortfall does not move at all.
    expect(marginShortfall(developed, 'P1')).toBe(180)
    expect(borrowingBase(afterStrip, 'P1')).toBe(420)
    expect(afterStrip.players.P1.drawnCredit).toBe(600)
    expect(marginShortfall(afterStrip, 'P1')).toBe(180)
  })

  it('still converges once the bare deed is auctioned', () => {
    const after = applyAll(developed, eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    })))
    expect(marginShortfall(after, 'P1')).toBe(170) // 180 - 200 * (0.80 - 0.75)
  })
})
```

- [ ] **Step 15: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 21 tests. Steps 10 and 11 already implemented the strip; if the
neutrality assertion fails, one of the two building constants has moved.

- [ ] **Step 16: Write the failing test for encumbrance extinguishment and the anti-exploit property**

Append to `margin.test.ts`:

```ts
/** Stands in for the markets context until Task 15 lands. Spec 19.12. */
const PORTS: CreditPorts = {
  rentFutureMakeWhole: () => 90,
  deedOptionRefund: () => 25,
}

describe('liquidation extinguishes encumbrances (spec 19.12)', () => {
  const encumbered = withPlayers(
    {
      ...withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      ]),
      futures: [{ id: 'fut-1', deed: 'boardwalk', holder: 'P3', startRound: 6, endRound: 12 }],
      options: [{ id: 'opt-1', deed: 'boardwalk', writer: 'P1', holder: 'P2', strike: 1, expiry: 20 }],
    },
    {
      P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
      P2: { cleanCash: 1000 }, P3: { cleanCash: 1000 },
    },
  )

  it('is NOT blocked by an outstanding deed option on the lot', () => {
    // The anti-exploit property. A distressed player writing a $1 option on every deed
    // must not become judgment-proof. If anyone reintroduces a transferability guard,
    // this fails loudly.
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    expect(events.some((e) => e.type === 'DeedLiquidated')).toBe(true)
  })

  it('makes the future holder whole, refunds the option premium, then auctions clean', () => {
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    expect(events).toEqual([
      { type: 'EncumbranceExtinguished', player: 'P1', deed: 'boardwalk', contract: 'fut-1',
        kind: 'rent-future', holder: 'P3', amount: 90 },
      { type: 'EncumbranceExtinguished', player: 'P1', deed: 'boardwalk', contract: 'opt-1',
        kind: 'deed-option', holder: 'P2', amount: 25 },
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'bank', price: 320 },
    ])
  })

  it('adds both amounts to the shortfall, so encumbrances make the position worse', () => {
    expect(marginShortfall(encumbered, 'P1')).toBe(238)
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    const extinguished = applyAll(encumbered, events.slice(0, 2))
    expect(extinguished.players.P3.cleanCash).toBe(1090)
    expect(extinguished.players.P2.cleanCash).toBe(1025)
    expect(extinguished.players.P1.drawnCredit).toBe(915) // 800 + 90 + 25
    expect(marginShortfall(extinguished, 'P1')).toBe(353) // strictly worse than 238

    const after = applyAll(encumbered, events)
    expect(marginShortfall(after, 'P1')).toBe(333) // the sale itself still narrows by 20
  })

  it('emits nothing extra for an unencumbered deed', () => {
    const clean = { ...encumbered, futures: [], options: [] }
    expect(eventsOf(decideCredit(clean, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))).toHaveLength(1)
  })
})
```

- [ ] **Step 17: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 25 tests. Step 11 already implemented `extinguishmentEvents`.

- [ ] **Step 18: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): strip buildings and extinguish encumbrances before auction

Spec section 5 strips the colour group at 50% of cost, which is exactly
shortfall-neutral. Spec 19.12 cancels any rent future and deed option on
the lot, pays the holders, and adds both to the debtor's shortfall. There
is deliberately no transferability guard: a \$1 option must never make a
distressed player judgment-proof."
```

- [ ] **Step 19: Write the failing test for the exhaustion stop condition**

Append to `margin.test.ts`:

```ts
describe('the second stop condition: no unmortgaged deeds left (spec section 5)', () => {
  it('writes the residual shortfall down to distressed debt', () => {
    const start = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      ]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 } },
    )
    let s = start
    for (const lot of ['boardwalk', 'park-place']) {
      s = applyAll(s, eventsOf(decideCredit(s, {
        type: 'SettleLiquidationLot', player: 'P1', deed: lot, bids: [],
      })))
    }
    expect(s.players.P1.drawnCredit).toBe(200)
    expect(liquidationQueue(s, 'P1')).toEqual([])

    const wind = exhaustLiquidation(s, 'P1')
    expect(wind).toEqual([
      { type: 'CreditWrittenDown', player: 'P1', amount: 200 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
    const done = applyAll(s, wind)
    expect(done.players.P1.drawnCredit).toBe(0)
    expect(done.players.P1.distressedDebt).toBe(200)
    expect(done.players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('treats a portfolio of only mortgaged deeds as exhausted', () => {
    const mortgagedOnly = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', mortgaged: true }),
      ]),
      { P1: { drawnCredit: 300, marginCallFlaggedAt: 5 } },
    )
    expect(liquidationQueue(mortgagedOnly, 'P1')).toEqual([])
    expect(exhaustLiquidation(mortgagedOnly, 'P1')).toEqual([
      { type: 'CreditWrittenDown', player: 'P1', amount: 300 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
  })

  it('does nothing while unmortgaged deeds remain, or when the position is cured', () => {
    const remaining = withPlayers(
      withDeeds(gameState({ round: 7 }), [deed('boardwalk', 400, { owner: 'P1' })]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5 } },
    )
    expect(exhaustLiquidation(remaining, 'P1')).toEqual([])
    expect(exhaustLiquidation(gameState(), 'P1')).toEqual([])
  })
})
```

- [ ] **Step 20: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 28 tests.

- [ ] **Step 21: Write the failing test for distressed debt**

Append to `margin.test.ts`:

```ts
describe('distressed debt (spec 5, 19.7 and 19.8)', () => {
  it('compounds at DISTRESSED_DEBT_RATE per round, floored each round', () => {
    let s = withPlayers(gameState(), { P1: { distressedDebt: 100 } })
    const trace: number[] = []
    for (let round = 0; round < 3; round += 1) {
      s = applyAll(s, settleDistressedDebt(s))
      trace.push(s.players.P1.distressedDebt)
    }
    // 100 + 15 = 115; 115 + floor(17.25) = 132; 132 + floor(19.8) = 151
    expect(trace).toEqual([115, 132, 151])
    expect(ECONOMY.DISTRESSED_DEBT_RATE).toBe(0.15)
  })

  it('is never swept from spare clean cash at Settlement', () => {
    const rich = withPlayers(gameState(), { P1: { cleanCash: 5000, distressedDebt: 200 } })
    const after = applyAll(rich, settleDistressedDebt(rich))
    expect(after.players.P1.cleanCash).toBe(5000)
    expect(after.players.P1.distressedDebt).toBe(230)
    expect(after.treasury).toBe(0)
  })

  it('emits nothing for a player carrying none', () => {
    expect(settleDistressedDebt(gameState())).toEqual([])
  })

  it('is repayable in whole or in part during any Open phase', () => {
    const s = withPlayers(gameState(), { P1: { cleanCash: 500, distressedDebt: 230 } })
    const events = eventsOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 200,
    }))
    expect(events).toEqual([{ type: 'DistressedDebtRepaid', player: 'P1', amount: 200 }])
    const after = applyAll(s, events)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.distressedDebt).toBe(30)
  })

  it('refuses to repay more than is owed, or more than is held', () => {
    const s = withPlayers(gameState(), { P1: { cleanCash: 50, distressedDebt: 230 } })
    expect(rejectionOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 231,
    })).code).toBe('INVALID_AMOUNT')
    expect(rejectionOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 200,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('never triggers an auction: only uncured margin calls do (spec 19.8)', () => {
    // Rent, audit fines, taxes and carrying cost all land here. None is liquidatable.
    const s = withPlayers(
      withDeeds(gameState({ round: 12 }), SEVEN_DEEDS),
      { P1: { cleanCash: 0, drawnCredit: 0, distressedDebt: 4000 } },
    )
    expect(flagMarginCalls(s)).toEqual([])
    expect(playersAwaitingLiquidation(s)).toEqual([])
  })
})
```

- [ ] **Step 22: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 34 tests.

- [ ] **Step 23: Extend `contexts/credit/index.ts`, run the toolchain, and commit**

Add to the `./settlement.js` export block: `exhaustLiquidation`, `flagMarginCalls`,
`settleDistressedDebt`. Add to the `./selectors.js` export block: `groupBuildingStrip`,
`liquidationPrice`, `liquidationQueue`, `liquidationRound`, `playersAwaitingLiquidation`.

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): distressed debt at 15% compounding, never auto-swept

Liquidation now has both stop conditions from spec section 5: cured, or no
unmortgaged deeds left, with any residual written down to distressed debt.
Spec 19.8's boundary is enforced by test — liquidation is reachable only
from an uncured margin call."
```
