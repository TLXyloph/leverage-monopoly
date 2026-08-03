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

---

### Task 11: `credit` — peer loans, interest, default, note transfer

Spec section 7 is four sentences long and every one of them is a rule the app enforces:
principal, per-round rate, term in rounds, and zero or more pledged deeds. The lender holds
a **note**, which is a transferable asset — sellable outright, and poolable into a CDO by
`securitization` (Tasks 16–17). Interest falls due at Settlement **step 5**, immediately
after credit-line interest at step 4, and the ordering is observable.

**Prerequisite reconciliation, before Step 1.** Tasks 9 and 10 above were drafted against
two conventions that the contract has since settled differently. Task 11 codes against the
contract, so Step 1 brings the two earlier tasks' *output* into line. Nothing in this plan
file is rewritten; the edits are mechanical and confined to source:

1. **The money helper is `floorPercent`, not `applyRate`.** Task 2 Step 2 ships
   `core/money.ts` with `floorPercent`, `ceilPercent` and `floorPercentSum`, computed in
   integer basis points. Task 16 consumes `floorPercent` for the same liquidation floor, so
   the two contexts must call the same function or they will disagree on the same rule.
2. **Unpayable obligations emit `ObligationCapitalised`, not a boolean on another event and
   not `DistressedDebtIncurred`.** Spec 19.8's universal waterfall has exactly two steps —
   clean cash, then uncapped capitalisation into the drawn balance — and Task 2 already
   defines both `ObligationCapitalised` and the closed `ObligationKind` union that carries
   `'peer-loan-interest'`. Spec 19.8 also reserves distressed debt for one circumstance
   only: an uncured margin call whose liquidation ran out of unmortgaged deeds. Unpaid
   bills never reach it directly.

**Files:**
- Modify: `packages/engine/src/core/money.ts` (rename `applyRate` → `floorPercent` if Task 9
  shipped it under the old name; keep `isWholeDollars`)
- Modify: `packages/engine/src/core/errors.ts` (add `INVALID_LOAN_TERMS`; add
  `SELF_DEALING`, `NEGATIVE_AMOUNT`, `DUPLICATE_CONTRACT_ID`, `ASSET_ALREADY_POOLED` if the
  sibling tasks have not already)
- Modify: `packages/engine/src/config/economy.ts` (add `PEER_LOAN_UNLOCK_ERA`)
- Modify: `packages/engine/src/contexts/credit/reduce.ts` (the `ObligationCapitalised` case)
- Modify: `packages/engine/src/contexts/credit/selectors.ts`
- Modify: `packages/engine/src/contexts/credit/settlement.ts`
- Modify: `packages/engine/src/contexts/credit/decide.ts`
- Modify: `packages/engine/src/contexts/credit/fixture.ts`
- Modify: `packages/engine/src/contexts/credit/index.ts`
- Modify: `packages/engine/src/core/reduce.ts` (compose `reducePeerLoans`)
- Create: `packages/engine/src/contexts/credit/decide-loans.ts`
- Create: `packages/engine/src/contexts/credit/reduce-loans.ts`
- Test: `packages/engine/src/contexts/credit/peer-loans.test.ts`

`decide-loans.ts` and `reduce-loans.ts` are the split this file's preamble anticipated.
The seam is the command switch and the event switch, exactly as forecast, and it matches
the `reduce-options.ts` / `decide-options.ts` split `markets` makes for the same reason in
Task 15. `reduce-loans.ts` imports the mutation helpers from `reduce.ts` and `reduce.ts`
imports nothing back, so there is no cycle; the root reducer composes the two.

**Interfaces:**
- Consumes from Task 2, never redefined: `GameState`, `PlayerState`, `DeedState`,
  `PeerLoan`, `Pool`, `Swap`, `GameEvent`, `ObligationKind`, `Rejection`, `reject`,
  `ECONOMY`, `ContractId`, `DeedId`, `Money`, `PlayerId`, `RoundNumber`.
- Consumes from Tasks 9–10: `deedsOwnedBy`, `creditHeadroom`, `liquidationPrice`,
  `activeLoans`, `pledgedDeeds`, `poolHoldingLoan`, `collateralLiquidationProceeds`,
  `peerLoanInterestDue`, `reduceCredit`, `addCash`, `withDeed`, `withLoan`, `withPlayer`,
  `floorPercent`, `isWholeDollars`.
- Consumed by `securitization` (Tasks 16–17), which imports `contexts/credit/index.js` and
  nothing deeper. **These five signatures are the entire coupling surface and must match at
  merge:**

```ts
/** Deed face x DEED_ADVANCE_RATE + building cost x BUILDING_ADVANCE_RATE, halved when
 *  creditImpaired, then NET of swapCollateralPosted, floored at zero. Integer dollars. */
export function borrowingBase(state: GameState, player: PlayerId): Money
/** The player's currently drawn credit-line balance. Integer dollars. */
export function drawnCredit(state: GameState, player: PlayerId): Money
/** borrowingBase - drawnCredit. SIGNED: negative is exactly a margin breach. */
export function creditHeadroom(state: GameState, player: PlayerId): Money
/** Sum over active swaps sold by this player of floorPercent(notional, CDS_COLLATERAL_RATE). */
export function swapCollateralPosted(state: GameState, player: PlayerId): Money
/** Lookup by contract id. Does not filter on status. */
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined
```

  `swapCollateralPosted` lives here rather than in `securitization` because `credit` owns
  `borrowingBase` and the dependency arrow runs securitization → credit and never back.
  `state.swaps` is core state, so reading it is not a context import. Task 16's interface
  block describes `creditHeadroom` as "floored at 0"; it is **not**, because Task 10's
  margin machinery needs the negative value. The one caller that wants a clamp — Task 17's
  check that a CDS writer has unused base — writes `Math.max(0, creditHeadroom(s, p))`.

- Also produces:
  - `fundPeerLoanInterest(state: GameState, loan: PeerLoan): PeerLoanFunding`
  - `settlePeerLoans(state: GameState): readonly GameEvent[]` — Settlement step 5
  - `peerLoanId(lender: PlayerId, borrower: PlayerId, round: RoundNumber): ContractId`
  - `reducePeerLoans(state: GameState, event: GameEvent): GameState`
  - `decidePeerLoan(state: GameState, command: PeerLoanCommand): readonly GameEvent[] | Rejection`
  - `CreditCommand` widens by `OriginatePeerLoan | RepayPeerLoan | SellPeerLoanNote`
  - `type PeerLoanCommand`, `interface PeerLoanFunding`

**Rounding.** Peer loan interest is `floorPercent(outstanding, ratePerRound)` — floored,
per loan, never on a sum across loans. Collateral converts at
`floorPercent(faceValue, LIQUIDATION_FLOOR)` **per deed, then summed**, which is the rule
Task 16 states in its own rounding table; flooring the sum instead would disagree with
`securitization` on the same spec 19.4 conversion. The credit-impairment halving is
`Math.floor(base / 2)`, integer division rather than a percentage, and is unchanged.

- [ ] **Step 1: Reconcile Tasks 9–10's output with the contract**

Three mechanical edits. None changes a rule; each aligns a name or an event shape.

First, in `core/money.ts`, keep Task 2's exported names. If Task 9 shipped `applyRate`,
rename the export to `floorPercent` and update its seven call sites in `selectors.ts`
(`borrowingBase` twice, `creditInterestDue`, `distressedInterestDue`, `liquidationPrice`,
`groupBuildingStrip`, `peerLoanInterestDue`) and its uses in `credit.test.ts`.
`isWholeDollars` is Task 9's own addition and stays.

Second, `InterestAccrued` keeps Task 2's shape — `{ player, amount, rate }`, with no
`capitalised` field. `settleCreditInterest` emits the accrual and, when clean cash cannot
cover it, a paired `ObligationCapitalised` with `obligation: 'interest'`.
`settleCarryingCost`'s shortfall likewise emits `ObligationCapitalised` with
`obligation: 'carrying-cost'` in place of `DistressedDebtIncurred`. Both charge reducers
then follow one shape: **debit the payer by `Math.min(cleanCash, amount)` and credit the
payee the full `amount`**, the difference being bank money that the paired
`ObligationCapitalised` puts on the drawn balance. `PeerLoanInterestPaid` at Step 12 is the
same shape with the lender as payee instead of the Treasury.

Third, add the waterfall's own reducer case to `contexts/credit/reduce.ts`, before the
`default` arm. Task 5 introduced this case; Task 11 depends on it directly, because a
borrower who cannot cover peer-loan interest from clean cash reaches it.

```ts
    /**
     * Step 2 of the universal obligation waterfall, spec 19.8. Raises the drawn balance
     * with NO borrowing-base check. Voluntary draws are capped at the base; automatic
     * obligations are not, and the gap the two open up is the only thing in the game
     * that produces a margin call.
     */
    case 'ObligationCapitalised': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, { drawnCredit: p.drawnCredit + event.amount })
    }
```

Run: `npm run typecheck && npx vitest run packages/engine/src/contexts/credit`
Expected: PASS. The two Task 9 assertions naming `capitalised` become two events instead
of one boolean; adjust those assertions and nothing else.

- [ ] **Step 2: Extend `core/errors.ts` and `config/economy.ts`**

In `core/errors.ts`, add to the `RejectionCode` union. Only the first is new to the whole
plan; the other four are shared with Tasks 14–16 and whichever task merges first writes
the identical literal:

```ts
  | 'INVALID_LOAN_TERMS'
  | 'SELF_DEALING' | 'NEGATIVE_AMOUNT' | 'DUPLICATE_CONTRACT_ID'
  | 'ASSET_ALREADY_POOLED'
```

In `config/economy.ts`, add one constant inside the `ECONOMY` object:

```ts
  /** Spec section 7. Peer loans unlock in Era II. */
  PEER_LOAN_UNLOCK_ERA: 2 as Era,
```

- [ ] **Step 3: Extend `contexts/credit/fixture.ts` with loan, pool and swap builders**

Append to `fixture.ts`, adding `PeerLoan`, `Pool` and `Swap` to the `../../core/state.js`
type import and `ContractId` to the `../../core/types.js` type import. `applyAll` gains the
peer-loan reducer so every existing Task 9 and Task 10 test keeps working unchanged —
`reducePeerLoans` returns the state untouched for every event it does not own.

```ts
export function loan(id: ContractId, patch: Partial<PeerLoan> = {}): PeerLoan {
  return {
    id,
    lender: 'P2',
    borrower: 'P1',
    principal: 600,
    outstanding: 600,
    ratePerRound: 0.1,
    maturesAtRound: 12,
    collateral: [],
    status: 'active',
    ...patch,
  }
}

export function pool(id: ContractId, patch: Partial<Pool> = {}): Pool {
  return {
    id,
    originator: 'P2',
    assets: [],
    tranches: [
      { kind: 'senior', face: 300, paid: 0, holder: 'P3' },
      { kind: 'mezzanine', face: 200, paid: 0, holder: 'P4' },
      { kind: 'equity', face: 0, paid: 0, holder: 'P2' },
    ],
    terminated: false,
    ...patch,
  }
}

export function swap(id: ContractId, patch: Partial<Swap> = {}): Swap {
  return {
    id,
    buyer: 'P3',
    seller: 'P1',
    reference: { kind: 'peer-loan', id: 'pl:P2:P1:8' },
    notional: 500,
    premiumPerRound: 25,
    status: 'active',
    ...patch,
  }
}

export function withLoans(state: GameState, loans: readonly PeerLoan[]): GameState {
  return { ...state, loans: [...state.loans, ...loans] }
}
```

Then replace `applyAll`:

```ts
export function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce<GameState>(
    (acc, event) => reducePeerLoans(reduceCredit(acc, event), event),
    state,
  )
}
```

and add `import { reducePeerLoans } from './reduce-loans.js'` alongside the existing
`reduceCredit` import. `reduce-loans.ts` arrives at Step 12; until then this import is the
only thing keeping the fixture from resolving, which is what makes Step 10 fail cleanly.

- [ ] **Step 4: Write the failing test for CDS collateral against the base, and `drawnCredit`**

`packages/engine/src/contexts/credit/peer-loans.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import { deed, gameState, swap, withDeeds, withPlayers } from './fixture.js'
import { borrowingBase, creditHeadroom, drawnCredit, swapCollateralPosted } from './selectors.js'

describe('CDS collateral is posted against the borrowing base (spec section 8)', () => {
  const table = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])

  it('posts CDS_COLLATERAL_RATE of notional per active swap the player sold', () => {
    const one = { ...table, swaps: [swap('cds-1', { notional: 500 })] }
    expect(ECONOMY.CDS_COLLATERAL_RATE).toBe(0.3)
    expect(swapCollateralPosted(one, 'P1')).toBe(150) // floorPercent(500, 0.3)
    const two = { ...table, swaps: [swap('cds-1'), swap('cds-2', { notional: 250 })] }
    expect(swapCollateralPosted(two, 'P1')).toBe(225) // 150 + 75
  })

  it('counts only swaps this player SOLD, and only while they are active', () => {
    const mixed = {
      ...table,
      swaps: [
        swap('cds-1', { seller: 'P1', notional: 500 }),
        swap('cds-2', { seller: 'P2', notional: 500 }),
        swap('cds-3', { seller: 'P1', notional: 500, status: 'triggered' as const }),
        swap('cds-4', { seller: 'P1', notional: 500, status: 'expired' as const }),
      ],
    }
    expect(swapCollateralPosted(mixed, 'P1')).toBe(150)
    expect(swapCollateralPosted(mixed, 'P2')).toBe(150)
    expect(swapCollateralPosted(mixed, 'P3')).toBe(0)
  })

  it('subtracts the posted collateral from the borrowing base', () => {
    expect(borrowingBase(table, 'P1')).toBe(300)
    const written = { ...table, swaps: [swap('cds-1', { notional: 500 })] }
    expect(borrowingBase(written, 'P1')).toBe(150)
    expect(creditHeadroom(written, 'P1')).toBe(150)
  })

  it('floors the base at zero when a writer posts more than they own', () => {
    const overwritten = { ...table, swaps: [swap('cds-1', { notional: 1000 })] }
    expect(swapCollateralPosted(overwritten, 'P1')).toBe(300)
    expect(borrowingBase(overwritten, 'P1')).toBe(0)
    // Headroom is still signed, so a drawn balance still shows as a breach.
    expect(creditHeadroom(withPlayers(overwritten, { P1: { drawnCredit: 40 } }), 'P1')).toBe(-40)
  })

  it('halves for impairment BEFORE netting the collateral, not after', () => {
    // Order is observable: halve-then-net gives 150 - 150 = 0; net-then-halve gives 75.
    const impaired = withPlayers(
      { ...table, swaps: [swap('cds-1', { notional: 500 })] },
      { P1: { creditImpaired: true } },
    )
    expect(borrowingBase(impaired, 'P1')).toBe(0)
  })

  it('reports the drawn balance directly, for securitization leverage', () => {
    expect(drawnCredit(withPlayers(table, { P1: { drawnCredit: 275 } }), 'P1')).toBe(275)
    expect(drawnCredit(table, 'P2')).toBe(0)
  })
})
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — `swapCollateralPosted` and `drawnCredit` are not exported from
`./selectors.js`, and `swap` is not exported from `./fixture.js` if Step 3 was skipped.

- [ ] **Step 6: Extend `contexts/credit/selectors.ts`**

Replace `borrowingBase` and append the two new reads. `findLoan` is renamed to
`findPeerLoan`, which is the name `securitization` imports; it has no other caller yet.

```ts
/**
 * Spec section 8. A CDS writer must post CDS_COLLATERAL_RATE of notional against their
 * borrowing base for the life of the swap, which is what prevents unlimited writing.
 * It lives in `credit` because `credit` owns the borrowing base and the dependency arrow
 * runs securitization -> credit, never back; `state.swaps` is core state, so reading it
 * here is not a context import. Spec section 12: this reduces borrowing base, not net worth.
 */
export function swapCollateralPosted(state: GameState, player: PlayerId): Money {
  return state.swaps
    .filter((s) => s.seller === player && s.status === 'active')
    .reduce((sum, s) => sum + floorPercent(s.notional, ECONOMY.CDS_COLLATERAL_RATE), 0)
}

/** The drawn credit-line balance. Exported for `securitization`'s leverage term. */
export function drawnCredit(state: GameState, player: PlayerId): Money {
  return state.players[player].drawnCredit
}

/**
 * Spec section 5. DEED_ADVANCE_RATE against unmortgaged deed face value plus
 * BUILDING_ADVANCE_RATE against building cost. Each component floors independently.
 *
 * Then, in this order: a credit-impaired player (peer-loan default, spec section 7) has
 * the total halved, rounded down, permanently — spec 19.10 makes that a single halving
 * however many times they default, which the boolean `creditImpaired` gives for free —
 * and CDS collateral posted comes off what is left. Halving before netting is the
 * conservative reading and the one a lender would recognise: impairment discounts the
 * asset side, collateral is a claim already carved out of it.
 *
 * Floored at zero. A base is a quantity of available credit and cannot be negative; a
 * player whose posted collateral exceeds their assets shows the deficit through
 * `creditHeadroom`, which stays signed.
 */
export function borrowingBase(state: GameState, player: PlayerId): Money {
  const eligible = deedsOwnedBy(state, player).filter((d) => !d.mortgaged)
  const face = eligible.reduce((sum, d) => sum + d.faceValue, 0)
  const buildings = eligible.reduce((sum, d) => sum + d.houses * d.houseCost, 0)
  const gross =
    floorPercent(face, ECONOMY.DEED_ADVANCE_RATE) +
    floorPercent(buildings, ECONOMY.BUILDING_ADVANCE_RATE)
  const halved = state.players[player].creditImpaired ? Math.floor(gross / 2) : gross
  return Math.max(0, halved - swapCollateralPosted(state, player))
}

/** Lookup by contract id, whatever its status. Consumed by `securitization`. */
export function findPeerLoan(state: GameState, id: ContractId): PeerLoan | undefined {
  return state.loans.find((l) => l.id === id)
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 6 tests. `credit.test.ts` and `margin.test.ts` must still pass — every
fixture there carries `swaps: []`, so the netting is a no-op for them.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/core packages/engine/src/config packages/engine/src/contexts/credit
git commit -m "feat(credit): net CDS collateral out of the borrowing base

swapCollateralPosted lives in credit because credit owns borrowingBase and
the dependency arrow runs securitization -> credit. Impairment halves before
collateral is netted, and the base floors at zero while headroom stays
signed, because a negative headroom is exactly what a margin call is."
```

- [ ] **Step 9: Write the failing test for peer loan origination**

Append to `peer-loans.test.ts`:

```ts
import type { GameState, PeerLoan } from '../../core/state.js'
import type { ContractId } from '../../core/types.js'
import { decideCredit } from './decide.js'
import type { PeerLoanCommand } from './decide-loans.js'
import { peerLoanId } from './decide-loans.js'
import { applyAll, eventsOf, loan, rejectionOf, withLoans } from './fixture.js'
import { findPeerLoan } from './selectors.js'

const ERA_II = { era: 2 as const, round: 8, phase: 'open' as const }

const BORROWER_DEEDS = [
  deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
  deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
]

type Originate = Extract<PeerLoanCommand, { type: 'OriginatePeerLoan' }>

function originate(over: Partial<Omit<Originate, 'type'>> = {}): Originate {
  return {
    type: 'OriginatePeerLoan',
    lender: 'P2',
    borrower: 'P1',
    principal: 600,
    ratePerRound: 0.1,
    termRounds: 4,
    collateral: ['boardwalk'],
    ...over,
  }
}

/** Narrows away the `undefined` a lookup returns, in the style of `eventsOf`. */
function theLoan(state: GameState, id: ContractId = 'pl:P2:P1:8'): PeerLoan {
  const found = findPeerLoan(state, id)
  if (found === undefined) throw new Error(`expected a loan with id ${id}`)
  return found
}

describe('peer loan origination (spec section 7)', () => {
  const table = withDeeds(gameState(ERA_II), BORROWER_DEEDS)

  it('derives the contract id and moves the principal from lender to borrower', () => {
    expect(peerLoanId('P2', 'P1', 8)).toBe('pl:P2:P1:8')
    const events = eventsOf(decideCredit(table, originate()))
    expect(events).toEqual([{
      type: 'PeerLoanOriginated',
      id: 'pl:P2:P1:8',
      lender: 'P2',
      borrower: 'P1',
      principal: 600,
      ratePerRound: 0.1,
      maturesAtRound: 12,
      collateral: ['boardwalk'],
    }])
    const after = applyAll(table, events)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH - 600)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 600)
    expect(after.loans).toEqual([{
      id: 'pl:P2:P1:8',
      lender: 'P2',
      borrower: 'P1',
      principal: 600,
      outstanding: 600,
      ratePerRound: 0.1,
      maturesAtRound: 12,
      collateral: ['boardwalk'],
      status: 'active',
    }])
  })

  it('does not touch the borrower\'s credit line: the principal is another player\'s cash', () => {
    const after = applyAll(table, eventsOf(decideCredit(table, originate())))
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(borrowingBase(after, 'P1')).toBe(562)
    expect(after.treasury).toBe(0)
  })

  it('locks in Era I and opens in Era II, unless every instrument is unlocked', () => {
    const eraI = withDeeds(gameState({ era: 1, round: 3, phase: 'open' }), BORROWER_DEEDS)
    expect(rejectionOf(decideCredit(eraI, originate())).code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
    const sandbox = { ...eraI, config: { ...eraI.config, unlockMode: 'all' as const } }
    expect(eventsOf(decideCredit(sandbox, originate()))).toHaveLength(1)
  })

  it('refuses a loan to yourself, and a principal the lender does not hold', () => {
    expect(rejectionOf(decideCredit(table, originate({ borrower: 'P2' }))).code).toBe('SELF_DEALING')
    const poor = withPlayers(table, { P2: { cleanCash: 599 } })
    expect(rejectionOf(decideCredit(poor, originate())).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses a zero, negative or fractional principal', () => {
    for (const principal of [0, -100, 12.5]) {
      expect(rejectionOf(decideCredit(table, originate({ principal }))).code).toBe('INVALID_AMOUNT')
    }
  })

  it('requires a whole-percentage rate between 0 and 100 per round', () => {
    for (const ratePerRound of [-0.01, 0.125, 1.01]) {
      expect(rejectionOf(decideCredit(table, originate({ ratePerRound }))).code)
        .toBe('INVALID_LOAN_TERMS')
    }
    expect(eventsOf(decideCredit(table, originate({ ratePerRound: 0 })))).toHaveLength(1)
    expect(eventsOf(decideCredit(table, originate({ ratePerRound: 1 })))).toHaveLength(1)
  })

  it('requires a whole term of at least one round that matures inside the game', () => {
    for (const termRounds of [0, -2, 1.5]) {
      expect(rejectionOf(decideCredit(table, originate({ termRounds }))).code)
        .toBe('INVALID_LOAN_TERMS')
    }
    // Round 8 + 17 = 25, past the end of the game: a loan that can never fall due.
    expect(rejectionOf(decideCredit(table, originate({ termRounds: 17 }))).code)
      .toBe('INVALID_WINDOW')
    expect(eventsOf(decideCredit(table, originate({ termRounds: 16 })))).toHaveLength(1)
  })

  it('accepts a loan with no collateral at all', () => {
    const events = eventsOf(decideCredit(table, originate({ collateral: [] })))
    expect(events[0]).toMatchObject({ collateral: [] })
  })

  it('refuses collateral the borrower does not own, has mortgaged, or has pledged twice', () => {
    expect(rejectionOf(decideCredit(table, originate({ collateral: ['marvin-gardens'] }))).code)
      .toBe('NOT_OWNER')
    const mortgaged = withDeeds(table, [deed('baltic', 60, { owner: 'P1', mortgaged: true })])
    expect(rejectionOf(decideCredit(mortgaged, originate({ collateral: ['baltic'] }))).code)
      .toBe('DEED_MORTGAGED')
    expect(rejectionOf(decideCredit(table, originate({
      collateral: ['boardwalk', 'boardwalk'],
    }))).code).toBe('DEED_ENCUMBERED')
    const alreadyPledged = withLoans(table, [loan('pl:P3:P1:7', {
      lender: 'P3', collateral: ['boardwalk'],
    })])
    expect(rejectionOf(decideCredit(alreadyPledged, originate())).code).toBe('DEED_ENCUMBERED')
  })

  it('refuses a second loan between the same pair in the same round', () => {
    const existing = withLoans(table, [loan('pl:P2:P1:8')])
    expect(rejectionOf(decideCredit(existing, originate())).code).toBe('DUPLICATE_CONTRACT_ID')
  })

  it('refuses origination outside the Open phase', () => {
    const settling = { ...table, phase: 'settlement' as const }
    expect(rejectionOf(decideCredit(settling, originate())).code).toBe('WRONG_PHASE')
  })
})
```

- [ ] **Step 10: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — cannot resolve `./decide-loans.js`.

- [ ] **Step 11: Write `contexts/credit/decide-loans.ts`**

The three loan commands share the era gate and the phase gate, so `decideCredit` keeps
owning the phase check and this module owns the rest.

```ts
import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import { isWholeDollars } from '../../core/money.js'
import type { GameState } from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import { pledgedDeeds } from './selectors.js'

export type PeerLoanCommand =
  | { readonly type: 'OriginatePeerLoan'
      readonly lender: PlayerId
      readonly borrower: PlayerId
      readonly principal: Money
      readonly ratePerRound: number
      readonly termRounds: number
      readonly collateral: readonly DeedId[] }
  | { readonly type: 'RepayPeerLoan'
      readonly player: PlayerId
      readonly id: ContractId
      readonly amount: Money }
  | { readonly type: 'SellPeerLoanNote'
      readonly player: PlayerId
      readonly id: ContractId
      readonly to: PlayerId
      readonly price: Money }

/**
 * Contract ids are DERIVED, never generated: the engine holds no Math.random, so an
 * identity has to be a pure function of the terms. Matches the `rf:` and `do:` forms
 * `markets` uses. Two loans between the same pair in the same round collide, which is
 * reported as DUPLICATE_CONTRACT_ID rather than silently overwriting.
 */
export function peerLoanId(
  lender: PlayerId,
  borrower: PlayerId,
  round: RoundNumber,
): ContractId {
  return `pl:${lender}:${borrower}:${round}`
}

/**
 * Spec section 2. Peer loans unlock in Era II. The check is inlined from `state.config`
 * and `state.era`, both core state, rather than importing `session.instrumentUnlocked`:
 * `session` is free to depend on `credit`, so importing it here would invert the graph.
 */
function locked(state: GameState): boolean {
  return state.config.unlockMode !== 'all' && state.era < ECONOMY.PEER_LOAN_UNLOCK_ERA
}

export function decidePeerLoan(
  state: GameState,
  command: PeerLoanCommand,
): readonly GameEvent[] | Rejection {
  if (locked(state)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Peer loans unlock in Era II.')
  }
  switch (command.type) {
    case 'OriginatePeerLoan':
      return decideOriginate(state, command)
    case 'RepayPeerLoan':
    case 'SellPeerLoanNote':
      return reject('CONTRACT_NOT_FOUND', 'Not yet implemented.')
  }
}

function decideOriginate(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'OriginatePeerLoan' }>,
): readonly GameEvent[] | Rejection {
  if (cmd.lender === cmd.borrower) {
    return reject('SELF_DEALING', 'A peer loan needs two different players.')
  }
  if (!isWholeDollars(cmd.principal) || cmd.principal === 0) {
    return reject('INVALID_AMOUNT', 'Lend at least $1, in whole dollars.')
  }
  const lenderCash = state.players[cmd.lender].cleanCash
  if (cmd.principal > lenderCash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.lender} holds $${lenderCash} in clean cash.`)
  }
  const basisPoints = Math.round(cmd.ratePerRound * 10_000)
  if (basisPoints < 0 || basisPoints > 10_000 || basisPoints % 100 !== 0) {
    return reject('INVALID_LOAN_TERMS', 'The rate must be a whole percentage from 0% to 100% per round.')
  }
  if (!Number.isInteger(cmd.termRounds) || cmd.termRounds < 1) {
    return reject('INVALID_LOAN_TERMS', 'The term must be a whole number of rounds, at least one.')
  }
  const maturesAtRound = state.round + cmd.termRounds
  if (maturesAtRound > ECONOMY.TOTAL_ROUNDS) {
    return reject(
      'INVALID_WINDOW',
      `The game ends at round ${ECONOMY.TOTAL_ROUNDS}, so the term must mature by then.`,
    )
  }
  const alreadyPledged = pledgedDeeds(state)
  const seen = new Set<DeedId>()
  for (const deedId of cmd.collateral) {
    const d = state.deeds[deedId]
    if (d === undefined || d.owner !== cmd.borrower) {
      return reject('NOT_OWNER', `${cmd.borrower} does not own ${deedId}.`)
    }
    if (d.mortgaged) {
      return reject('DEED_MORTGAGED', `${deedId} is mortgaged and secures nothing.`)
    }
    if (seen.has(deedId) || alreadyPledged.includes(deedId)) {
      return reject('DEED_ENCUMBERED', `${deedId} is already pledged against a loan.`)
    }
    seen.add(deedId)
  }
  const id = peerLoanId(cmd.lender, cmd.borrower, state.round)
  if (state.loans.some((l) => l.id === id)) {
    return reject(
      'DUPLICATE_CONTRACT_ID',
      'These two players already originated a loan this round. Wait a round or change the pairing.',
    )
  }
  return [{
    type: 'PeerLoanOriginated',
    id,
    lender: cmd.lender,
    borrower: cmd.borrower,
    principal: cmd.principal,
    ratePerRound: cmd.ratePerRound,
    maturesAtRound,
    collateral: cmd.collateral,
  }]
}
```

Only `pledgedDeeds` is imported from `./selectors.js` at this step. `findPeerLoan` and
`poolHoldingLoan` join it at Step 18, when the commands that need them arrive, so
`noUnusedLocals` stays quiet in between.

- [ ] **Step 12: Write `contexts/credit/reduce-loans.ts`**

The reducer for every peer-loan event. `PeerLoanDefaulted` is written here in the shape
spec section 7 states literally — collateral to the lender, balance written off — and gains
its two refinements at Steps 29 and 34.

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState, PeerLoan } from '../../core/state.js'
import { addCash, withDeed, withLoan } from './reduce.js'

/**
 * Spec section 7. Peer-loan events only; every other event returns the state untouched,
 * so the root reducer can compose this beside `reduceCredit` the way it composes
 * `reduceDeedOptions` beside `reduceMarkets`.
 */
export function reducePeerLoans(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PeerLoanOriginated': {
      const loan: PeerLoan = {
        id: event.id,
        lender: event.lender,
        borrower: event.borrower,
        principal: event.principal,
        outstanding: event.principal,
        ratePerRound: event.ratePerRound,
        maturesAtRound: event.maturesAtRound,
        collateral: event.collateral,
        status: 'active',
      }
      const funded = addCash(
        addCash(state, event.lender, -event.principal),
        event.borrower,
        event.principal,
      )
      return { ...funded, loans: [...funded.loans, loan] }
    }

    /**
     * The lender is paid the full coupon. Whatever the borrower could not cover from
     * clean cash is bank money, and arrives as its own ObligationCapitalised raising the
     * drawn balance — spec 19.8's two-step waterfall, with the lender never short.
     */
    case 'PeerLoanInterestPaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const fromCash = Math.min(state.players[loan.borrower].cleanCash, event.amount)
      return addCash(addCash(state, loan.borrower, -fromCash), loan.lender, event.amount)
    }

    case 'PeerLoanRepaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const moved = addCash(
        addCash(state, loan.borrower, -event.amount),
        loan.lender,
        event.amount,
      )
      const outstanding = loan.outstanding - event.amount
      return withLoan(moved, loan.id, {
        outstanding,
        status: outstanding === 0 ? 'repaid' : 'active',
      })
    }

    /** The note is the asset; selling it moves the right to be repaid, not the debt. */
    case 'PeerLoanSold': {
      const paid = addCash(addCash(state, event.to, -event.price), event.from, event.price)
      return withLoan(paid, event.id, { lender: event.to })
    }

    /**
     * Spec section 7. Collateral still owned by the borrower transfers to the note
     * holder, and the remaining balance is written off. Deeds that left the borrower's
     * hands in the meantime — a forced liquidation under Task 10 outranks a peer pledge —
     * are simply not there to take, which is the risk of lending against a levered player.
     */
    case 'PeerLoanDefaulted': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      let next = state
      for (const deedId of loan.collateral) {
        if (next.deeds[deedId]?.owner !== loan.borrower) continue
        next = withDeed(next, deedId, { owner: event.collateralTo })
      }
      return withLoan(next, loan.id, { outstanding: 0, status: 'defaulted' })
    }

    default:
      return state
  }
}
```

- [ ] **Step 13: Wire `decide.ts`, the root reducer, and the context index**

In `decide.ts`, widen the command union and dispatch. Add
`import { decidePeerLoan, type PeerLoanCommand } from './decide-loans.js'`:

```ts
export type CreditCommand =
  | { readonly type: 'DrawCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'RepayCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'SettleLiquidationLot'
      readonly player: PlayerId
      readonly deed: DeedId
      readonly bids: readonly { readonly player: PlayerId; readonly amount: Money }[] }
  | { readonly type: 'RepayDistressedDebt'; readonly player: PlayerId; readonly amount: Money }
  | PeerLoanCommand
```

and, inside `decideCredit`'s switch, three cases delegating as one:

```ts
    case 'OriginatePeerLoan':
    case 'RepayPeerLoan':
    case 'SellPeerLoanNote':
      return decidePeerLoan(state, command)
```

In `core/reduce.ts`, compose the new reducer alongside the existing ones:

```ts
export function reduce(state: GameState, event: GameEvent): GameState {
  return reducePeerLoans(reduceCredit(reduceBoard(reduceSession(state, event), event), event), event)
}
```

In `contexts/credit/index.ts`, add `export { reducePeerLoans } from './reduce-loans.js'` so
the root reducer reaches it through the context's public surface and nothing deeper.

- [ ] **Step 14: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 15: Commit**

```bash
git add packages/engine/src/contexts/credit packages/engine/src/core/reduce.ts
git commit -m "feat(credit): originate peer loans with enforced terms

Principal, whole-percentage per-round rate, whole term maturing inside the
game, and collateral the borrower actually owns unmortgaged and unpledged.
The contract id is derived from lender, borrower and round rather than
generated, because the engine holds no Math.random."
```

- [ ] **Step 16: Write the failing test for repayment, note sale, and the live-pool guard**

Append to `peer-loans.test.ts`:

```ts
import { pool } from './fixture.js'
import { pledgedDeeds } from './selectors.js'

describe('repaying a peer loan', () => {
  const lent = withLoans(withDeeds(gameState(ERA_II), BORROWER_DEEDS), [
    loan('pl:P2:P1:8', { collateral: ['boardwalk'] }),
  ])

  it('pays the lender and reduces the outstanding balance', () => {
    const events = eventsOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 250,
    }))
    expect(events).toEqual([{ type: 'PeerLoanRepaid', id: 'pl:P2:P1:8', amount: 250 }])
    const after = applyAll(lent, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 250)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 250)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.outstanding).toBe(350)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('active')
  })

  it('closes the loan and frees the collateral when the last dollar is repaid', () => {
    const after = applyAll(lent, eventsOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('repaid')
    expect(after.deeds.boardwalk?.owner).toBe('P1')
    expect(pledgedDeeds(after)).toEqual([])
  })

  it('refuses repayment from anyone but the borrower, or of more than is owed', () => {
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P3', id: 'pl:P2:P1:8', amount: 100,
    })).code).toBe('NOT_OWNER')
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 601,
    })).code).toBe('INVALID_AMOUNT')
    const broke = withPlayers(lent, { P1: { cleanCash: 40 } })
    expect(rejectionOf(decideCredit(broke, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 100,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P9:P1:2', amount: 100,
    })).code).toBe('CONTRACT_NOT_FOUND')
  })
})

describe('the note is a transferable asset (spec section 7)', () => {
  const lent = withLoans(withDeeds(gameState(ERA_II), BORROWER_DEEDS), [
    loan('pl:P2:P1:8', { collateral: ['boardwalk'] }),
  ])

  it('sells outright: cash to the seller, the note to the buyer', () => {
    const events = eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    }))
    expect(events).toEqual([
      { type: 'PeerLoanSold', id: 'pl:P2:P1:8', from: 'P2', to: 'P3', price: 500 },
    ])
    const after = applyAll(lent, events)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 500)
    expect(after.players.P3.cleanCash).toBe(ECONOMY.STARTING_CASH - 500)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.lender).toBe('P3')
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.borrower).toBe('P1')
  })

  it('sends every later payment to the new holder', () => {
    const sold = applyAll(lent, eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    })))
    const repaid = applyAll(sold, eventsOf(decideCredit(sold, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(repaid.players.P3.cleanCash).toBe(ECONOMY.STARTING_CASH - 500 + 600)
    expect(repaid.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 500)
  })

  it('allows a price of zero, and refuses a fractional or negative one', () => {
    expect(eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 0,
    }))).toHaveLength(1)
    for (const price of [-1, 12.5]) {
      expect(rejectionOf(decideCredit(lent, {
        type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price,
      })).code).toBe('NEGATIVE_AMOUNT')
    }
  })

  it('refuses a seller who does not hold the note, and a sale to the borrower', () => {
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P3', id: 'pl:P2:P1:8', to: 'P4', price: 100,
    })).code).toBe('NOT_ASSET_OWNER')
    // Selling the note to the borrower would leave them owing themselves. Repay instead.
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P1', price: 100,
    })).code).toBe('SELF_DEALING')
    const buyerBroke = withPlayers(lent, { P3: { cleanCash: 99 } })
    expect(rejectionOf(decideCredit(buyerBroke, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 100,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses to sell a note out of a live pool, and allows it once the pool terminates', () => {
    // `credit` must never transfer an asset `securitization` has already tranched and
    // sold: the tranche holders bought that cashflow.
    const pooled = {
      ...lent,
      pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
    }
    expect(rejectionOf(decideCredit(pooled, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    })).code).toBe('ASSET_ALREADY_POOLED')

    const dead = {
      ...pooled,
      pools: [pool('pool-1', {
        assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }], terminated: true,
      })],
    }
    expect(eventsOf(decideCredit(dead, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    }))).toHaveLength(1)
  })

  it('still lets the borrower REPAY a pooled note, because that is cash, not a transfer', () => {
    // Spec 19.4's whole point: cash flows through a waterfall, assets do not.
    const pooled = {
      ...lent,
      pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
    }
    expect(eventsOf(decideCredit(pooled, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    }))).toEqual([{ type: 'PeerLoanRepaid', id: 'pl:P2:P1:8', amount: 600 }])
  })
})
```

`findPeerLoan` is already imported at the top of the file by `theLoan`.

- [ ] **Step 17: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — every repayment and note-sale case is rejected `CONTRACT_NOT_FOUND` by
the placeholder arm in Step 11.

- [ ] **Step 18: Implement `RepayPeerLoan` and `SellPeerLoanNote` in `decide-loans.ts`**

Replace the placeholder arm with real dispatch and append the two deciders:

```ts
    case 'RepayPeerLoan':
      return decideRepay(state, command)
    case 'SellPeerLoanNote':
      return decideSellNote(state, command)
```

```ts
/** An `active` loan the caller borrowed on, or the rejection explaining why not. */
function activeLoanOr(state: GameState, id: ContractId): PeerLoan | Rejection {
  const loan = findPeerLoan(state, id)
  if (loan === undefined) return reject('CONTRACT_NOT_FOUND', 'There is no loan with that id.')
  if (loan.status !== 'active') {
    return reject('CONTRACT_NOT_FOUND', `That loan is already ${loan.status}.`)
  }
  return loan
}

function decideRepay(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'RepayPeerLoan' }>,
): readonly GameEvent[] | Rejection {
  const loan = activeLoanOr(state, cmd.id)
  if ('rejected' in loan) return loan
  if (loan.borrower !== cmd.player) {
    return reject('NOT_OWNER', 'Only the borrower can repay a loan.')
  }
  if (!isWholeDollars(cmd.amount) || cmd.amount === 0) {
    return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
  }
  if (cmd.amount > loan.outstanding) {
    return reject('INVALID_AMOUNT', `You owe $${loan.outstanding} on this loan.`)
  }
  const cash = state.players[cmd.player].cleanCash
  if (cmd.amount > cash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${cash} in clean cash.`)
  }
  return [{ type: 'PeerLoanRepaid', id: loan.id, amount: cmd.amount }]
}

function decideSellNote(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'SellPeerLoanNote' }>,
): readonly GameEvent[] | Rejection {
  const loan = activeLoanOr(state, cmd.id)
  if ('rejected' in loan) return loan
  if (loan.lender !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of the note can sell it.')
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A sale needs two different players.')
  }
  if (cmd.to === loan.borrower) {
    return reject(
      'SELF_DEALING',
      'The borrower cannot buy their own note. Repay the loan instead.',
    )
  }
  if (poolHoldingLoan(state, loan.id) !== null) {
    return reject(
      'ASSET_ALREADY_POOLED',
      'That note is inside a live pool. Its cashflow belongs to the tranche holders.',
    )
  }
  if (!isWholeDollars(cmd.price)) {
    return reject('NEGATIVE_AMOUNT', 'A price must be a whole, non-negative number of dollars.')
  }
  const buyerCash = state.players[cmd.to].cleanCash
  if (cmd.price > buyerCash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.to} holds $${buyerCash} in clean cash.`)
  }
  return [{ type: 'PeerLoanSold', id: loan.id, from: cmd.player, to: cmd.to, price: cmd.price }]
}
```

Add `PeerLoan` to the `../../core/state.js` type import.

- [ ] **Step 19: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 26 tests. The Step 12 reducer already handles both events.

- [ ] **Step 20: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): repay peer loans and sell the note

The note is an asset and follows its holder, so every later payment goes
to whoever holds it. credit refuses to transfer a note sitting inside a
live pool — that cashflow belongs to the tranche holders — while still
allowing the borrower to repay it, because cash flows through a waterfall
and assets do not."
```

- [ ] **Step 21: Write the failing test for Settlement step 5, the obligation waterfall, and the default boundary**

Append to `peer-loans.test.ts`. The last two cases are the point of the whole task: they
pin down what "a missed interest payment" means once every obligation capitalises.

```ts
import { settlePeerLoans } from './settlement.js'
import { fundPeerLoanInterest } from './selectors.js'

describe('Settlement step 5: peer loan interest (spec 19.1, 19.8)', () => {
  // Base = (400 + 350) * 0.75 = 562. Loan of 600 at 10% = 60 due each round.
  const settling = withLoans(
    withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
    [loan('pl:P2:P1:8', { collateral: ['boardwalk'] })],
  )

  it('pays from clean cash when the borrower can afford the coupon', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 100 } })
    const events = settlePeerLoans(flush)
    expect(events).toEqual([{ type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 }])
    const after = applyAll(flush, events)
    expect(after.players.P1.cleanCash).toBe(40)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.treasury).toBe(0) // peer interest is player-to-player, not Treasury income
  })

  it('capitalises the shortfall into the drawn balance, and the lender is still paid in full', () => {
    const short = withPlayers(settling, { P1: { cleanCash: 20 } })
    const events = settlePeerLoans(short)
    expect(events).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 40, obligation: 'peer-loan-interest' },
    ])
    const after = applyAll(short, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(40)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P1.distressedDebt).toBe(0) // never distressed debt, spec 19.8
  })

  it('capitalises the whole coupon when the borrower has no clean cash at all', () => {
    const dry = withPlayers(settling, { P1: { cleanCash: 0 } })
    expect(settlePeerLoans(dry)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'peer-loan-interest' },
    ])
  })

  it('floors each loan\'s interest independently, never on a sum', () => {
    const odd = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { outstanding: 105, ratePerRound: 0.05 }),
        loan('pl:P3:P1:8', { lender: 'P3', outstanding: 105, ratePerRound: 0.05 }),
      ],
    )
    // floor(5.25) twice is 10; floor of 210 * 0.05 would be 10 as well, but the two
    // rules diverge the moment the rates differ, so the per-loan rule is asserted here.
    expect(settlePeerLoans(odd).filter((e) => e.type === 'PeerLoanInterestPaid')).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 5 },
      { type: 'PeerLoanInterestPaid', id: 'pl:P3:P1:8', amount: 5 },
    ])
  })

  it('services loans in origination order, each seeing what the last one left', () => {
    const two = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { outstanding: 400, ratePerRound: 0.1 }),
        loan('pl:P3:P1:8', { lender: 'P3', outstanding: 400, ratePerRound: 0.1 }),
      ],
    )
    const start = withPlayers(two, { P1: { cleanCash: 50 } })
    expect(settlePeerLoans(start)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 40 },
      { type: 'PeerLoanInterestPaid', id: 'pl:P3:P1:8', amount: 40 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 30, obligation: 'peer-loan-interest' },
    ])
    // The first coupon took 40 of the 50; only 10 was left for the second.
    const after = applyAll(start, settlePeerLoans(start))
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(30)
  })

  it('emits nothing for a repaid, defaulted or zero-rate loan', () => {
    const quiet = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { status: 'repaid', outstanding: 0 }),
        loan('pl:P3:P1:8', { lender: 'P3', status: 'defaulted', outstanding: 0 }),
        loan('pl:P4:P1:8', { lender: 'P4', ratePerRound: 0 }),
      ],
    )
    expect(settlePeerLoans(quiet)).toEqual([])
    expect(settlePeerLoans(gameState())).toEqual([])
  })

  it('DEFAULTS when the coupon cannot be paid from cash AND capitalising would breach the base', () => {
    // This is the reading of "a missed interest payment" that survives spec 19.8.
    // Base 562. Drawn 502 leaves headroom 60, exactly the coupon: it capitalises.
    const exactly = withPlayers(settling, { P1: { cleanCash: 0, drawnCredit: 502 } })
    expect(fundPeerLoanInterest(exactly, theLoan(exactly))).toEqual({
      fromCash: 0, capitalised: 60, defaults: false,
    })
    expect(settlePeerLoans(exactly)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'peer-loan-interest' },
    ])
    // and lands the drawn balance exactly ON the base, which is not a breach.
    expect(creditHeadroom(applyAll(exactly, settlePeerLoans(exactly)), 'P1')).toBe(0)

    // One dollar more drawn and the same coupon is a default instead.
    const short = withPlayers(settling, { P1: { cleanCash: 0, drawnCredit: 503 } })
    expect(fundPeerLoanInterest(short, theLoan(short))).toEqual({
      fromCash: 0, capitalised: 60, defaults: true,
    })
    expect(settlePeerLoans(short)).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
    ])
  })

  it('pays nothing and capitalises nothing on the round it defaults', () => {
    const short = withPlayers(settling, { P1: { cleanCash: 30, drawnCredit: 550 } })
    const events = settlePeerLoans(short)
    expect(events.some((e) => e.type === 'PeerLoanInterestPaid')).toBe(false)
    expect(events.some((e) => e.type === 'ObligationCapitalised')).toBe(false)
    const after = applyAll(short, events)
    expect(after.players.P1.cleanCash).toBe(30) // the $30 it could have paid stays put
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH)
  })
})
```

- [ ] **Step 22: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — `fundPeerLoanInterest` and `settlePeerLoans` are not exported.

- [ ] **Step 23: Add `fundPeerLoanInterest` to `selectors.ts`**

This is the one genuinely ambiguous rule in section 7, and it is resolved here rather than
inside the settler so that the resolution has a name, a doc comment and a direct test.

```ts
export interface PeerLoanFunding {
  /** Paid out of the borrower's clean cash. */
  readonly fromCash: Money
  /** The remainder, which capitalises into the drawn credit balance. */
  readonly capitalised: Money
  /** True when the coupon is a MISSED payment under spec section 7 rather than a paid one. */
  readonly defaults: boolean
}

/**
 * Spec section 7 says default occurs on "a missed interest payment". Spec 19.8 says every
 * obligation, peer loan interest explicitly included, resolves through clean cash and then
 * uncapped capitalisation into the drawn balance, and that "a player is never left unable
 * to pay". Read naively together, no coupon is ever missed and section 7's first default
 * trigger is dead letter.
 *
 * The resolution: a coupon is MISSED when the borrower cannot cover it from clean cash AND
 * capitalising the remainder would push the drawn balance past their borrowing base.
 * Inside the base, 19.8 governs and the lender is paid in full from the credit line.
 * Beyond it, the borrower has no lawful way to fund the payment and section 7 governs.
 *
 * Two consequences worth being explicit about. First, the borrowing base is a DEFAULT
 * TRIGGER here, not a cap on the capitalisation: the waterfall still has exactly two steps
 * and there is no partial payment — either the whole coupon is funded or the loan
 * defaults and no cash moves at all. Second, a borrower already over their base has zero
 * headroom, so their next coupon defaults; a margin call and a peer default are meant to
 * arrive together for a player who has run out of room.
 */
export function fundPeerLoanInterest(state: GameState, loan: PeerLoan): PeerLoanFunding {
  const due = peerLoanInterestDue(loan)
  const fromCash = Math.min(state.players[loan.borrower].cleanCash, due)
  const capitalised = due - fromCash
  const headroom = Math.max(0, creditHeadroom(state, loan.borrower))
  return { fromCash, capitalised, defaults: capitalised > headroom }
}
```

- [ ] **Step 24: Add `settlePeerLoans` to `settlement.ts`**

Append, adding `fundPeerLoanInterest` and `peerLoanInterestDue` to the `./selectors.js`
import, `PeerLoan` to the type imports, and `reduceCredit` / `reducePeerLoans` imports.

```ts
/** Folds a batch through both credit reducers, so the next loan sees the last one's effect. */
function applyLocally(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce<GameState>(
    (acc, event) => reducePeerLoans(reduceCredit(acc, event), event),
    state,
  )
}

/**
 * Spec section 7 default. Collateral to the note holder, the remaining balance written
 * off, and the borrower permanently credit-impaired — spec 19.10 makes the halving a
 * single event however many times they default, which the reducer's boolean guarantees.
 */
function defaultEvents(loan: PeerLoan): readonly GameEvent[] {
  return [{
    type: 'PeerLoanDefaulted',
    id: loan.id,
    collateralTo: loan.lender,
    writtenOff: loan.outstanding,
  }]
}

function settleOneLoan(state: GameState, loan: PeerLoan): readonly GameEvent[] {
  const funding = fundPeerLoanInterest(state, loan)
  if (funding.defaults) return defaultEvents(loan)

  const events: GameEvent[] = []
  const due = funding.fromCash + funding.capitalised
  if (due > 0) {
    events.push({ type: 'PeerLoanInterestPaid', id: loan.id, amount: due })
    if (funding.capitalised > 0) {
      events.push({
        type: 'ObligationCapitalised',
        player: loan.borrower,
        amount: funding.capitalised,
        obligation: 'peer-loan-interest',
      })
    }
  }

  // Spec section 7's second default trigger: an outstanding balance at term expiry. The
  // borrower's escape is to repay during that round's Open phase, which closes the loan
  // before Settlement ever reaches it.
  if (state.round >= loan.maturesAtRound && loan.outstanding > 0) {
    events.push(...defaultEvents(loan))
  }
  return events
}

/**
 * Settlement step 5, immediately after credit-line interest at step 4. The ordering is
 * observable and deliberate: interest capitalised at step 4 has already consumed the
 * headroom that step 5 measures against, so a Settlement can charge bank interest and
 * default a peer loan in the same pass.
 *
 * Loans are serviced in origination order — `state.loans` is append-only, so that order
 * is identical under replay — and each is folded into a working state before the next is
 * priced, because the first coupon spends the cash the second was counting on.
 */
export function settlePeerLoans(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  let working = state
  for (const loan of state.loans) {
    if (loan.status !== 'active') continue
    const current = working.loans.find((l) => l.id === loan.id)
    if (current === undefined || current.status !== 'active') continue
    const batch = settleOneLoan(working, current)
    events.push(...batch)
    working = applyLocally(working, batch)
  }
  return events
}
```

Note the ordering inside `settleOneLoan`: interest is charged in the maturity round too,
and only then does the principal fall due. A borrower who repays during the Open phase of
the maturity round pays no final coupon at all, because the loan is `repaid` before
Settlement sees it — which is a real incentive to close early rather than an accident.

- [ ] **Step 25: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 34 tests.

- [ ] **Step 26: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): peer loan interest at Settlement step 5

Interest runs the universal obligation waterfall from spec 19.8 — clean
cash, then capitalisation into the drawn balance — so the lender is always
paid in full and the shortfall lands on the borrower's credit line, never
on distressed debt. A coupon counts as MISSED, and the loan defaults, only
when clean cash cannot cover it and capitalising would breach the base."
```

- [ ] **Step 27: Write the failing test for the consequences of default**

Append to `peer-loans.test.ts`:

```ts
describe('peer loan default (spec section 7 and 19.10)', () => {
  const settling = withLoans(
    withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
    [loan('pl:P2:P1:8', { collateral: ['boardwalk'], maturesAtRound: 12 })],
  )

  it('defaults on an outstanding balance at term expiry, after the final coupon', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    expect(settlePeerLoans(flush)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
    ])
  })

  it('does not default a loan repaid before the maturity Settlement', () => {
    const openPhase = { ...settling, phase: 'open' as const }
    const repaid = applyAll(openPhase, eventsOf(decideCredit(openPhase, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(settlePeerLoans({ ...repaid, phase: 'settlement' })).toEqual([])
    expect(findPeerLoan(repaid, 'pl:P2:P1:8')?.status).toBe('repaid')
  })

  it('transfers the collateral, writes the balance off, and impairs the borrower', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(after.deeds.boardwalk?.owner).toBe('P2')
    expect(after.deeds['park-place']?.owner).toBe('P1')
    const closed = findPeerLoan(after, 'pl:P2:P1:8')
    expect(closed?.status).toBe('defaulted')
    expect(closed?.outstanding).toBe(0)
    expect(after.players.P1.creditImpaired).toBe(true)
    // The write-off is a write-off: it becomes neither drawn credit nor distressed debt.
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.players.P1.distressedDebt).toBe(0)
  })

  it('halves the borrowing base permanently, from that moment on', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    expect(borrowingBase(flush, 'P1')).toBe(562)
    const after = applyAll(flush, settlePeerLoans(flush))
    // Boardwalk is gone AND the remainder is halved: floor(floor(350 * 0.75) / 2).
    expect(borrowingBase(after, 'P1')).toBe(131)
  })

  it('takes only collateral the borrower still owns', () => {
    // A Task 10 forced liquidation outranks a peer pledge, so the deed may already be gone.
    const gone = withPlayers(
      withDeeds(settling, [deed('boardwalk', 400, { owner: 'bank', group: 'dark-blue' })]),
      { P1: { cleanCash: 500 } },
    )
    const after = applyAll(gone, settlePeerLoans(gone))
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('defaulted')
  })

  it('sends the collateral to whoever holds the note, not to whoever wrote it', () => {
    const openPhase = { ...settling, phase: 'open' as const }
    const sold = applyAll(openPhase, eventsOf(decideCredit(openPhase, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 400,
    })))
    const due = withPlayers({ ...sold, phase: 'settlement' as const }, { P1: { cleanCash: 500 } })
    expect(settlePeerLoans(due)).toContainEqual({
      type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P3', writtenOff: 600,
    })
    expect(applyAll(due, settlePeerLoans(due)).deeds.boardwalk?.owner).toBe('P3')
  })

  it('SPEC 19.10: a second default does not halve the base again', () => {
    // Both loans are uncollateralised, so nothing but the halving can move the base.
    // Gross base = floor((400 + 350 + 60) * 0.75) = floor(607.5) = 607.
    const twice = withLoans(
      withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), [
        ...BORROWER_DEEDS,
        deed('baltic', 60, { owner: 'P1', group: 'brown' }),
      ]),
      [
        loan('pl:P2:P1:8', { collateral: [], maturesAtRound: 12, outstanding: 600 }),
        loan('pl:P3:P1:9', { lender: 'P3', collateral: [], maturesAtRound: 12, outstanding: 400 }),
      ],
    )
    const flush = withPlayers(twice, { P1: { cleanCash: 5000 } })
    expect(borrowingBase(flush, 'P1')).toBe(607)

    const events = settlePeerLoans(flush)
    expect(events.filter((e) => e.type === 'PeerLoanDefaulted')).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
      { type: 'PeerLoanDefaulted', id: 'pl:P3:P1:9', collateralTo: 'P3', writtenOff: 400 },
    ])

    const afterFirst = applyAll(flush, events.slice(0, 2))
    expect(afterFirst.players.P1.creditImpaired).toBe(true)
    expect(borrowingBase(afterFirst, 'P1')).toBe(303) // floor(607 / 2)

    const afterBoth = applyAll(flush, events)
    expect(borrowingBase(afterBoth, 'P1')).toBe(303) // NOT floor(303 / 2) === 151
    expect(afterBoth.players.P1.creditImpaired).toBe(true)
  })

  it('SPEC 19.10: a second default still takes collateral and still writes the balance off', () => {
    const impaired = withPlayers(
      withLoans(
        withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
        [loan('pl:P3:P1:9', {
          lender: 'P3', collateral: ['park-place'], maturesAtRound: 12, outstanding: 400,
        })],
      ),
      { P1: { cleanCash: 5000, creditImpaired: true } },
    )
    const after = applyAll(impaired, settlePeerLoans(impaired))
    expect(after.deeds['park-place']?.owner).toBe('P3')
    expect(findPeerLoan(after, 'pl:P3:P1:9')?.outstanding).toBe(0)
    expect(borrowingBase(after, 'P1')).toBe(150) // floor(floor(400 * 0.75) / 2), halved once
  })

  it('SPEC 19.1: step 4 capitalisation can push step 5 over the edge', () => {
    // Base 562, drawn 500, no cash, Era IV at 12%. Peer coupon is 40.
    // Before step 4 the headroom is 62 and the coupon capitalises comfortably.
    const eraIV = withLoans(
      withDeeds(gameState({ era: 4, round: 20, phase: 'settlement' }), BORROWER_DEEDS),
      [loan('pl:P2:P1:8', { outstanding: 400, ratePerRound: 0.1, maturesAtRound: 24 })],
    )
    const start = withPlayers(eraIV, { P1: { cleanCash: 0, drawnCredit: 500 } })
    expect(creditHeadroom(start, 'P1')).toBe(62)
    expect(settlePeerLoans(start)[0]).toEqual({
      type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 40,
    })

    // Step 4 charges floorPercent(500, 0.12) = 60, which the player cannot pay, so it
    // capitalises and leaves 2 of headroom. Now the same coupon is a default.
    const afterStep4 = applyAll(start, [
      { type: 'InterestAccrued', player: 'P1', amount: 60, rate: 0.12 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'interest' },
    ])
    expect(creditHeadroom(afterStep4, 'P1')).toBe(2)
    expect(settlePeerLoans(afterStep4)).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 400 },
    ])
  })
})
```

- [ ] **Step 28: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — `creditImpaired` is never set, so the impairment and 19.10 cases fail on
`false` and on an unhalved base. Everything else in the block passes: Steps 12 and 24
already move the collateral and write the balance off.

- [ ] **Step 29: Set `creditImpaired` in the `PeerLoanDefaulted` reducer**

In `reduce-loans.ts`, add `withPlayer` to the `./reduce.js` import and one line to the
`PeerLoanDefaulted` case, before the `withLoan` return:

```ts
      /**
       * Spec section 7 point 3, and 19.10. The penalty is a single permanent halving.
       * Writing a boolean rather than scaling a number is what makes a second default
       * carry the collateral loss and the write-off without compounding the penalty —
       * two halvings against a 75% advance rate would land the player at 18.75%, which
       * spec 19.10 rejects by name as a different and much crueller game.
       */
      next = withPlayer(next, loan.borrower, { creditImpaired: true })
```

- [ ] **Step 30: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 43 tests.

- [ ] **Step 31: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): peer loan default, and the single permanent halving

Collateral to the note holder, the balance written off, and the borrower
credit-impaired. Spec 19.10 makes the halving happen once however many
times a player defaults, which a boolean flag gives for free and which is
asserted directly: a second default leaves the base at half, not a quarter."
```

- [ ] **Step 32: Write the failing test for spec 19.4, a note inside a live pool**

Append to `peer-loans.test.ts`:

```ts
import { collateralLiquidationProceeds, poolHoldingLoan } from './selectors.js'

describe('a defaulted note inside a live pool (spec 19.4)', () => {
  const pooled = {
    ...withLoans(
      withDeeds(gameState({ era: 3, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
      [loan('pl:P2:P1:8', { collateral: ['boardwalk'], maturesAtRound: 12 })],
    ),
    pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
  }
  const flush = withPlayers(pooled, { P1: { cleanCash: 5000 } })

  it('still defaults, and still impairs and writes off, exactly as an unpooled note does', () => {
    const after = applyAll(flush, settlePeerLoans(flush))
    const closed = findPeerLoan(after, 'pl:P2:P1:8')
    expect(closed?.status).toBe('defaulted')
    expect(closed?.outstanding).toBe(0)
    expect(after.players.P1.creditImpaired).toBe(true)
  })

  it('does NOT move the collateral, because securitization sells it to the bank', () => {
    // Deeds cannot be distributed through a waterfall, only cash. If credit handed
    // boardwalk to P2 here, securitization's PoolCollateralLiquidated would then hand the
    // same deed to the bank and the pool would collect cash for a deed it never held.
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(after.deeds.boardwalk?.owner).toBe('P1')
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH)
  })

  it('leaves the collateral list intact for securitization to read at step 6', () => {
    // Step 5 defaults the loan; step 6 runs the waterfall. The list must survive between.
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.collateral).toEqual(['boardwalk'])
    expect(poolHoldingLoan(after, 'pl:P2:P1:8')).toBe('pool-1')
  })

  it('exposes the conversion price securitization needs, floored per deed', () => {
    expect(collateralLiquidationProceeds(flush, theLoan(flush))).toBe(320) // 400 * 0.80
    const two = withLoans(
      withDeeds(gameState({ era: 3, round: 12 }), [
        deed('st-james', 180, { owner: 'P1' }),
        deed('tennessee', 180, { owner: 'P1' }),
      ]),
      [loan('pl:P2:P1:8', { collateral: ['st-james', 'tennessee'] })],
    )
    // Floored per deed and then summed, which is the rule securitization applies too.
    expect(collateralLiquidationProceeds(two, theLoan(two))).toBe(288)
    expect(collateralLiquidationProceeds(two, loan('pl:X', { collateral: ['nonexistent'] }))).toBe(0)
  })

  it('DOES move the collateral once the pool has terminated', () => {
    const dead = {
      ...flush,
      pools: [pool('pool-1', {
        assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }], terminated: true,
      })],
    }
    expect(applyAll(dead, settlePeerLoans(dead)).deeds.boardwalk?.owner).toBe('P2')
  })
})
```

- [ ] **Step 33: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — the pooled note's collateral is handed to P2 by the Step 12 reducer.

- [ ] **Step 34: Add the live-pool guard to the `PeerLoanDefaulted` reducer**

In `reduce-loans.ts`, add `poolHoldingLoan` to the `./selectors.js` import and wrap the
transfer loop:

```ts
      /**
       * Spec 19.4. A note inside a LIVE pool keeps its collateral where it is. The
       * securitization context sells those same deeds to the bank at LIQUIDATION_FLOOR
       * and puts the cash into that round's waterfall, via PoolCollateralLiquidated,
       * because deeds cannot be distributed through a waterfall and cash can.
       *
       * The collateral list is deliberately NOT cleared: this runs at Settlement step 5
       * and securitization reads `loan.collateral` at step 6, one step later.
       */
      if (poolHoldingLoan(state, loan.id) === null) {
        for (const deedId of loan.collateral) {
          if (next.deeds[deedId]?.owner !== loan.borrower) continue
          next = withDeed(next, deedId, { owner: event.collateralTo })
        }
      }
```

- [ ] **Step 35: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 48 tests.

- [ ] **Step 36: Extend `contexts/credit/index.ts`, run the toolchain, and commit**

Add to the `./selectors.js` export block: `activeLoans`, `collateralLiquidationProceeds`,
`drawnCredit`, `findPeerLoan`, `fundPeerLoanInterest`, `peerLoanInterestDue`,
`pledgedDeeds`, `poolHoldingLoan`, `swapCollateralPosted`. Add `settlePeerLoans` to the
`./settlement.js` block. Add two new lines:

```ts
export type { PeerLoanCommand } from './decide-loans.js'
export { peerLoanId } from './decide-loans.js'
export type { PeerLoanFunding } from './selectors.js'
export { reducePeerLoans } from './reduce-loans.js'
```

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. `fixture.ts` must still not be reachable from
`contexts/credit/index.ts`, and the five signatures in this task's Interfaces block must
be exported verbatim — `securitization` imports exactly those.

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): spec 19.4, a defaulted note inside a live pool

credit refuses to move an asset sitting inside a live pool: the collateral
stays with the borrower and securitization converts it to cash at the
liquidation floor for that round's waterfall, because deeds cannot be
distributed through a waterfall and cash can. The collateral list survives
the default so step 6 can still read it after step 5 has closed the loan."
```

---

## NEW EVENTS REQUIRED

Everything below is what Tasks 9, 10 and 11 collectively need beyond the contract fixed by
Task 2. Each item is applied by the step named against it.

### New `GameEvent` variants

| Event | Shape | Task, step | Why Task 2 lacks it |
|---|---|---|---|
| `DistressedDebtRepaid` | `{ type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }` | 10, 1 | Spec 19.7 makes distressed debt repayable during any Open phase. Task 2 gave it an accrual event and an incurrence event but no discharge. |
| `CreditWrittenDown` | `{ type: 'CreditWrittenDown'; player: PlayerId; amount: Money }` | 10, 1 | Spec section 5's second liquidation stop condition converts residual drawn credit into distressed debt. Two balances move in opposite directions, which no existing event expresses. |
| `BuildingsStripped` | `{ type: 'BuildingsStripped'; player: PlayerId; deeds: readonly DeedId[]; proceeds: Money }` | 10, 1 | Spec section 5 strips buildings across the whole colour group before a lot is auctioned. `HouseSold` is per deed and per house and cannot carry a group operation atomically. |
| `EncumbranceExtinguished` | `{ type: 'EncumbranceExtinguished'; player: PlayerId; deed: DeedId; contract: ContractId; kind: 'rent-future' \| 'deed-option'; holder: PlayerId; amount: Money }` | 10, 1 | Spec 19.12 cancels a contract, pays its holder, and adds the amount to the debtor's shortfall in one atomic move. `RentFutureExpired` and `DeedOptionExpired` carry no cash and no debtor. |

**No new event is required for peer loans.** Task 2's five variants — `PeerLoanOriginated`,
`PeerLoanInterestPaid`, `PeerLoanRepaid`, `PeerLoanDefaulted`, `PeerLoanSold` — cover
section 7 completely, and `PeerLoanDefaulted`'s existing `{ id, collateralTo, writtenOff }`
shape is left **exactly** as Task 2 wrote it because Task 16 constructs that literal in its
own tests. In particular the credit impairment is carried by the reducer rather than by a
sixth event: `creditImpaired` is a boolean, and spec 19.10's "a second default does not
halve again" is then a property of the type rather than a rule anyone can forget.

### Changed fields on existing variants — none

`InterestAccrued` keeps Task 2's `{ player, amount, rate }`. An earlier draft of Task 9 added
a `capitalised: boolean` to it; that is superseded by `ObligationCapitalised`, which Task 2
already defines and whose `ObligationKind` union already contains `'peer-loan-interest'`.
Task 11 Step 1 reconciles this.

### New `PlayerState` field in `core/state.ts` — none

`creditImpaired`, `drawnCredit`, `distressedDebt` and `marginCallFlaggedAt` all exist.

### New field on `DeedOption` in `core/state.ts`

| Field | Type | Task, step | Why |
|---|---|---|---|
| `premium` | `Money` | 10, referenced by `deedOptionRefund` | Spec 19.12 refunds the option holder "their premium" on forced liquidation. Task 2's `DeedOption` carries `strike` and `expiry` but not the premium actually paid, and `markets`' own reducer (Task 15) builds the record without it. `markets` owns the shape, so the field is added there and `credit` only reads it through the injected `CreditPorts.deedOptionRefund`. |

### New `RejectionCode` values in `core/errors.ts`

| Code | Task, step | Shared with |
|---|---|---|
| `INVALID_AMOUNT` | 9, 3 | — |
| `NO_PENDING_LIQUIDATION` | 10, 1 | — |
| `WRONG_LIQUIDATION_LOT` | 10, 1 | — |
| `INVALID_LOAN_TERMS` | 11, 2 | — |
| `SELF_DEALING` | 11, 2 | Tasks 14–15 |
| `NEGATIVE_AMOUNT` | 11, 2 | Tasks 14–15 |
| `DUPLICATE_CONTRACT_ID` | 11, 2 | Tasks 14–15 |
| `ASSET_ALREADY_POOLED` | 11, 2 | Task 16 |

The last four are declared identically by their sibling tasks. Whichever merges first
writes the literal; the other finds it present and moves on.

### New `core/money.ts` exports

`floorPercent`, `ceilPercent` and `floorPercentSum` are Task 2's. `isWholeDollars` is added
by Task 9 Step 1 and is a validation predicate rather than arithmetic, so it does not
belong to the basis-point family.

### New `ECONOMY` keys in `config/economy.ts`

| Key | Value | Task, step |
|---|---|---|
| `BUILDING_SELLBACK_RATE` | `0.5` | 9, 2 |
| `PEER_LOAN_UNLOCK_ERA` | `2` | 11, 2 |

`LIQUIDATION_FLOOR` moves from `0.7` to `0.8` in Task 9 Step 2, under a startup assertion
that it strictly exceeds `DEED_ADVANCE_RATE`. **Task 16's worked examples still show the
0.7 figures** (`floorPercent(180, 0.7) = 126`); those expected values must be recomputed at
`0.8` when the two branches merge, or `securitization` and `credit` will price the same
spec 19.4 conversion differently.

### Symbols required from sibling tasks, to reconcile at merge

| Symbol | Owner | Assumed signature |
|---|---|---|
| `rentFutureMakeWhole` | Task 14, `markets` | `(state: GameState, deed: DeedId) => Money` — injected through `CreditPorts`, never imported |
| `deedOptionRefund` | Task 15, `markets` | `(state: GameState, deed: DeedId) => Money` — injected through `CreditPorts`, never imported |
| `instrumentUnlocked` | Task 4, `session` | Not consumed. Task 11 inlines the Era II gate from `state.era` and `state.config.unlockMode`, both core state, to keep the dependency arrow pointing session → credit. |

---

## JUDGMENT CALLS

Each resolves a point the spec leaves open across Tasks 9–11. Each is a small change if the
resolution turns out to be wrong.

1. **"A missed interest payment" means the coupon cannot be funded within the borrowing
   base.** This is the one genuinely ambiguous rule in section 7 and it is worth stating
   twice. Spec section 7 makes a missed coupon a default trigger. Spec 19.8 puts peer loan
   interest through the universal waterfall by name — clean cash, then *uncapped*
   capitalisation into the drawn balance — and says outright that "a player is never left
   unable to pay". Taken literally together, a coupon can never be missed and section 7's
   first trigger never fires in a 24-round game.

   Resolution: a coupon is missed when clean cash cannot cover it **and** capitalising the
   remainder would push the drawn balance past the borrower's borrowing base. Inside the
   base, 19.8 governs and the lender is paid in full from the credit line. Beyond it,
   there is no lawful way to fund the payment and section 7 governs.

   The borrowing base here is a **default trigger, not a cap on the capitalisation**: the
   waterfall keeps exactly two steps, there is no partial coupon, and on the round a loan
   defaults no cash moves at all. This preserves 19.8's distinctive property — that only
   automatic obligations can carry a drawn balance past its base — while giving section 7
   something to bite on. The alternative readings were rejected: "default whenever clean
   cash alone is short" contradicts 19.8's explicit inclusion of peer loan interest and
   would default nearly every leveraged borrower on their first Settlement; "never default
   on a coupon, only at term expiry" deletes half of section 7's default clause.

2. **Distressed debt is never reached by an unpaid bill.** Spec 19.8 names exactly one
   circumstance: an uncured margin call whose forced liquidation stopped because the player
   had no unmortgaged deeds left. Carrying cost, taxes, rent, audit fines, CDS premiums and
   peer loan interest all capitalise instead. Task 9's `settleCarryingCost` and Task 13's
   audit fine therefore both emit `ObligationCapitalised`, and Task 11 Step 1 reconciles
   the earlier drafting.

3. **Impairment halves before CDS collateral is netted.** Spec sections 7, 8 and 12 each
   describe their own adjustment to the borrowing base and none of them orders the three.
   Halve-then-net is the conservative reading: impairment discounts the asset side of the
   base, and posted collateral is a claim carved out of what is left. Netting first and
   then halving would halve the collateral too, effectively refunding an impaired writer
   half of what they posted. The order is pinned by a test.

4. **The borrowing base floors at zero; headroom stays signed.** A base is a quantity of
   available credit, so it cannot be negative. A player whose posted collateral exceeds
   their assets shows the deficit through `creditHeadroom`, which must stay signed because
   a negative headroom is exactly Task 10's definition of a margin breach. Task 16's
   interface block describes `creditHeadroom` as floored at zero; its one caller clamps at
   the call site instead.

5. **Pledged deeds stay in the borrower's bank borrowing base, and a bank liquidation
   outranks a peer pledge.** Spec section 7 does not say a pledge removes a deed from the
   base, and section 12 names only CDS collateral as reducing it. Pledged deeds are locked
   against *voluntary* mortgage, trade and sale through `pledgedDeeds`, but a forced
   liquidation under Task 10 may still take one, in which case the default handler simply
   finds fewer deeds to transfer. Lending against a levered borrower's collateral is
   supposed to be risky.

6. **Collateral must be owned, unmortgaged and unpledged at origination.** The spec says
   only "zero or more deeds pledged as collateral". A mortgaged deed secures nothing and a
   twice-pledged deed cannot satisfy both lenders, so both are rejected at the command
   rather than discovered at default. Zero collateral remains explicitly legal.

7. **Interest accrues in the maturity round, and the principal falls due after it.**
   Section 7 gives no ordering between the last coupon and the term expiry. Charging the
   coupon first is right because the borrower had the use of the money for that round, and
   it leaves a real escape: repaying during that round's Open phase closes the loan before
   Settlement reaches it, so an early closer pays no final coupon.

8. **Loans are serviced in origination order, each folded into a working state.** Two loans
   against one borrower who can only afford one coupon must resolve deterministically.
   `state.loans` is append-only, so its order is identical under replay, and the older loan
   is serviced first — the ordinary seniority convention. Each payment is applied before
   the next loan is priced, because the first coupon spends the cash and the headroom the
   second was counting on.

9. **The rate is a whole percentage from 0% to 100% per round; the term is whole rounds and
   must mature inside the game.** "Freely negotiated" is not "arbitrary float": a rate that
   is not a whole percentage cannot be displayed or agreed at a table, and a loan maturing
   after round 24 can never default, which makes it a free option rather than a loan. A 0%
   loan is legal and useful — it is how a player lends a friend money against collateral.

10. **Selling the note to the borrower is rejected rather than netted.** A borrower holding
    their own note owes themselves, which every downstream selector would then have to
    special-case. `RepayPeerLoan` already expresses the intent exactly and moves the same
    cash.

11. **A pooled note can be repaid but not sold, and its collateral does not move on
    default.** Spec 19.4 only covers the collateral. The general rule Task 11 adopts is
    that `credit` may move *cash* into or out of a pooled asset but may never transfer or
    liquidate the asset itself, because `securitization` has already sold that cashflow to
    tranche holders. Repayment is cash and is allowed; a note sale is a transfer and is
    refused; defaulted collateral is converted to cash by `securitization` at
    `LIQUIDATION_FLOOR` rather than handed to the note holder as deeds.

12. **The defaulted loan's `collateral` list is not cleared.** Settlement step 5 defaults
    the loan and step 6 runs the waterfall, and `securitization` reads `loan.collateral`
    at step 6 to build `PoolCollateralLiquidated`. Clearing the list at default would make
    spec 19.4 unimplementable one step later. `findPeerLoan` deliberately does not filter
    on status for the same reason.

13. **The Era II gate is inlined in `credit` rather than imported from `session`.** Spec
    section 14 lets `session` depend on `credit`, so importing `session.instrumentUnlocked`
    here would invert the dependency graph and trip Task 1's `no-restricted-imports` rule.
    Both inputs — `state.era` and `state.config.unlockMode` — are core state. The root
    decider may still route through `session` for consistency; the two must agree, and the
    `unlockMode: 'all'` sandbox path is tested on both sides.

14. **Peer loan interest is player-to-player and never touches the Treasury.** Spec section
    4 gives the Treasury interest income on the *credit line* only. A peer coupon funded by
    capitalisation is bank money reaching the lender through the borrower's credit line,
    which is exactly what a drawn balance is for.
