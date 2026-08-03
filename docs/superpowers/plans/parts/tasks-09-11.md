## Tasks 9-11

The `credit` bounded context, in three tasks. Every step codes against the contract
fixed by Tasks 1-2: `GameState`, `PlayerState`, `DeedState`, `PeerLoan`, `Pool`,
`GameEvent`, `Rejection`, `ECONOMY`. No parallel types are introduced.

**Context file layout.** The canonical five files are `index.ts`, `reduce.ts`,
`decide.ts`, `selectors.ts`, `credit.test.ts`. This context is large enough that two
splits are made up front rather than retrofitted:

| File | Responsibility | Projected lines |
|---|---|---|
| `index.ts` | public surface only, no logic | ~40 |
| `selectors.ts` | pure derived reads: base, headroom, queues, loan lookups | ~180 |
| `reduce.ts` | `(state, event) => state` for all 16 credit events | ~230 |
| `decide.ts` | `(state, command) => GameEvent[] \| Rejection` for 7 commands | ~250 |
| `settlement.ts` | the spec 19.1 step generators (3, 4, 5, 8, 10) and the stimulus | ~190 |
| `fixture.ts` | test-support state builders, not exported from `index.ts` | ~120 |
| `credit.test.ts` | Task 9 | ~230 |
| `margin.test.ts` | Task 10 | ~280 |
| `peer-loans.test.ts` | Task 11 | ~280 |

`settlement.ts` exists because Settlement step generators are neither deciders (they
take no command) nor reducers (they emit rather than apply). Folding them into
`decide.ts` would push it past 450 lines by Task 11. If `reduce.ts` later approaches
500 lines, split the peer-loan cases into `reduce-loans.ts` and re-export from
`reduce.ts`; the event switch is the natural seam.

**Rounding.** Every percentage and interest calculation floors to whole dollars via
`applyRate` (Task 9, Step 1). The only division is the credit-impairment halving,
which is `Math.floor(base / 2)`. Each is stated again at its step.

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
- Modify: `packages/engine/src/core/events.ts` (add `capitalised` to `InterestAccrued`)
- Modify: `packages/engine/src/core/errors.ts` (add `INVALID_AMOUNT`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/credit/credit.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerState`, `DeedState`, `GameEvent`, `Rejection`, `reject`,
  `isRejection`, `PlayerId`, `DeedId`, `Money`, `ECONOMY`, `PLAYER_IDS`.
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
  - `decideCredit(state: GameState, command: CreditCommand): readonly GameEvent[] | Rejection`
  - `settleCarryingCost(state: GameState): readonly GameEvent[]` — Settlement step 3
  - `settleCreditInterest(state: GameState): readonly GameEvent[]` — Settlement step 4
  - `advanceEraIIStimulus(state: GameState): readonly GameEvent[]` — Market phase, round 7
  - `STIMULUS_ROUND: number`
  - `type CreditCommand`

- [ ] **Step 1: Write `core/money.ts`**

The IEEE-754 note is load-bearing, not decoration: `350 * 0.7` evaluates to
`244.99999999999997`, so a naive `Math.floor` returns 244 where the 70% liquidation
floor must be 245.

```ts
import type { Money } from './types.js'

/**
 * Multiply an integer-dollar amount by a rate and round DOWN to whole dollars.
 *
 * The 1e6 pre-round removes IEEE-754 representation error before flooring.
 * Without it, 350 * 0.7 evaluates to 244.99999999999997 and Math.floor yields
 * 244 rather than the correct 245. Amounts in this game never exceed 1e6, so
 * the pre-round can never mask a genuine fractional cent.
 */
export function applyRate(amount: Money, rate: number): Money {
  return Math.floor(Math.round(amount * rate * 1e6) / 1e6)
}

/** True for a finite, non-negative, whole-dollar amount. */
export function isWholeDollars(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0
}
```

- [ ] **Step 2: Extend `core/events.ts` and `core/errors.ts`**

In `core/events.ts`, replace the `InterestAccrued` variant with:

```ts
  | { type: 'InterestAccrued'; player: PlayerId; amount: Money; rate: number
      /** True when the player could not pay from clean cash and it rolled into the drawn balance. */
      capitalised: boolean }
```

In `core/errors.ts`, add `'INVALID_AMOUNT'` to the `RejectionCode` union:

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
  | 'INVALID_AMOUNT'
```

- [ ] **Step 3: Write `contexts/credit/fixture.ts`**

Test-support builders. Deliberately not re-exported from `index.ts`. Deed face values,
house costs and rent tables here are arbitrary test data standing in for Task 3's
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

- [ ] **Step 4: Write the failing test for the borrowing base and the flat charges**

`packages/engine/src/contexts/credit/credit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { applyRate } from '../../core/money.js'
import { deed, gameState, withDeeds, withPlayers } from './fixture.js'
import {
  borrowingBase, carryingCostFor, creditHeadroom, creditInterestDue, prevailingRate,
} from './selectors.js'

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

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./selectors.js`.

- [ ] **Step 6: Write `contexts/credit/selectors.ts`**

Rounding, stated once and honoured everywhere below: each borrowing-base component is
floored independently and then summed; the credit-impairment halving floors the sum.

```ts
import { ECONOMY } from '../../config/economy.js'
import { applyRate } from '../../core/money.js'
import type { DeedState, GameState, PeerLoan } from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'

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
 * rounded down, permanently for the rest of the game.
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
  return state.players[player].drawnCredit > borrowingBase(state, player)
}

/**
 * Spec section 5 plus 19.8. Flagged at Settlement of round N, cure window is the Open
 * phase of round N+1, liquidation auction runs at the start of the Open phase of N+2.
 */
export function liquidationRound(flaggedAt: number): number {
  return flaggedAt + 2
}

/** The LIQUIDATION_FLOOR price, floored. On a $350 deed this is 245, not 244. */
export function liquidationPrice(deed: DeedState): Money {
  return applyRate(deed.faceValue, ECONOMY.LIQUIDATION_FLOOR)
}

/** Spec 19.6: buildings sell back to the bank at 50% of purchase cost. Floored. */
export function buildingSellbackValue(deed: DeedState): Money {
  return applyRate(deed.houses * deed.houseCost, ECONOMY.MORTGAGE_RATE)
}

/** Spec section 5: descending face value. Ties break on deed id ascending, for determinism. */
export function liquidationQueue(state: GameState, player: PlayerId): readonly DeedId[] {
  return deedsOwnedBy(state, player)
    .slice()
    .sort((a, b) => b.faceValue - a.faceValue || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => d.id)
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

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/core/money.ts packages/engine/src/core/errors.ts \
        packages/engine/src/contexts/credit
git commit -m "feat(credit): borrowing base, headroom and carrying cost selectors

75% against unmortgaged deed face plus 50% against building cost, halved
permanently for a credit-impaired player. applyRate pre-rounds before
flooring so the 70% floor on a \$350 deed is 245, not 244."
```

- [ ] **Step 9: Write the failing test for drawing and repaying**

Append to `credit.test.ts`:

```ts
import { decideCredit } from './decide.js'
import { reduceCredit } from './reduce.js'
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

  it('refuses a draw beyond the borrowing base', () => {
    const r = rejectionOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 301 }))
    expect(r.code).toBe('INSUFFICIENT_BORROWING_BASE')
  })

  it('allows a draw to exactly the borrowing base', () => {
    const events = eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 300 }))
    expect(applyAll(table, events).players.P1.drawnCredit).toBe(300)
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

- [ ] **Step 10: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./decide.js` or `./reduce.js`.

- [ ] **Step 11: Write `contexts/credit/reduce.ts` with the credit-line cases**

The peer-loan cases are added in Task 11; the `default` arm keeps the reducer total.

```ts
import { buildingSellbackValue } from './selectors.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState, PeerLoan, PlayerState } from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...patch }
  return { ...state, players }
}

function addCash(state: GameState, id: PlayerId, delta: Money): GameState {
  return withPlayer(state, id, { cleanCash: state.players[id].cleanCash + delta })
}

function withDeed(state: GameState, id: DeedId, patch: Partial<DeedState>): GameState {
  const existing = state.deeds[id]
  if (existing === undefined) return state
  return { ...state, deeds: { ...state.deeds, [id]: { ...existing, ...patch } } }
}

function withLoan(state: GameState, id: ContractId, patch: Partial<PeerLoan>): GameState {
  return { ...state, loans: state.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
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

    /** Pays what the player has; the shortfall arrives as its own DistressedDebtIncurred. */
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

export { withPlayer, addCash, withDeed, withLoan }
```

- [ ] **Step 12: Write `contexts/credit/decide.ts` with the draw and repay commands**

The peer-loan and liquidation commands are added in Tasks 10 and 11.

```ts
import { isWholeDollars } from '../../core/money.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { creditHeadroom } from './selectors.js'

export type CreditCommand =
  | { readonly type: 'DrawCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'RepayCredit'; readonly player: PlayerId; readonly amount: Money }

export function decideCredit(
  state: GameState,
  command: CreditCommand,
): readonly GameEvent[] | Rejection {
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

- [ ] **Step 13: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 14: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): draw and repay the revolving credit line

Draws are capped at borrowing base minus drawn balance. Principal moves
between the player and the bank; the Treasury is untouched, because spec
section 4 gives the Treasury interest income only."
```

- [ ] **Step 15: Write the failing test for Settlement steps 3 and 4, in spec 19.1 order**

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
    expect(step3).toEqual([
      { type: 'CarryingCostCharged', player: 'P1', deeds: 7, amount: 56 },
    ])
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
    const nearly = withPlayers(start, { P1: { cleanCash: 105 } }) // 105 - 56 = 49, one short of 50
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

- [ ] **Step 16: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: FAIL — cannot resolve `./settlement.js`.

- [ ] **Step 17: Write `contexts/credit/settlement.ts` with steps 3 and 4 and the stimulus**

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
    if (shortfall > 0) {
      events.push({ type: 'DistressedDebtIncurred', player, amount: shortfall })
    }
  }
  return events
}

/**
 * Settlement step 4. Interest on the drawn balance at the era rate, floored, paid to
 * the Treasury. Spec section 5: a player who cannot pay from clean cash capitalises it
 * into the drawn balance. All-or-nothing — the spec says "cannot pay", not "pays what
 * it can" — which is what makes capitalisation able to push a position past its base.
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

- [ ] **Step 18: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 19: Write the failing test for the Era II stimulus**

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

- [ ] **Step 20: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/credit.test.ts`
Expected: PASS — step 17 already implemented `advanceEraIIStimulus`. If any case fails,
fix `settlement.ts` before continuing.

- [ ] **Step 21: Write `contexts/credit/index.ts`**

Peer-loan and liquidation exports are appended in Tasks 10 and 11.

```ts
export type { CreditCommand } from './decide.js'
export { decideCredit } from './decide.js'
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
  prevailingRate,
  unmortgagedDeedCount,
} from './selectors.js'
```

Add to `packages/engine/src/index.ts`:

```ts
export * from './contexts/credit/index.js'
```

- [ ] **Step 22: Run the whole toolchain**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. `fixture.ts` must not be reachable from `contexts/credit/index.ts`.

- [ ] **Step 23: Commit**

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
- Modify: `packages/engine/src/core/events.ts` (add `DistressedDebtRepaid`, `CreditWrittenDown`)
- Modify: `packages/engine/src/core/errors.ts` (add `NO_PENDING_LIQUIDATION`, `WRONG_LIQUIDATION_LOT`)
- Modify: `packages/engine/src/contexts/credit/reduce.ts`
- Modify: `packages/engine/src/contexts/credit/decide.ts`
- Modify: `packages/engine/src/contexts/credit/settlement.ts`
- Modify: `packages/engine/src/contexts/credit/index.ts`
- Test: `packages/engine/src/contexts/credit/margin.test.ts`

**Interfaces:**
- Consumes: everything Task 9 produced, plus `liquidationPrice`, `liquidationQueue`,
  `liquidationRound`, `playersAwaitingLiquidation`, `buildingSellbackValue`,
  `distressedInterestDue`, `isUnderMarginCall` from `selectors.ts`.
- Produces:
  - `flagMarginCalls(state: GameState): readonly GameEvent[]` — Settlement step 10
  - `settleDistressedDebt(state: GameState): readonly GameEvent[]` — Settlement step 8
  - `exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[]`
  - `CreditCommand` gains `SettleLiquidationLot` and `RepayDistressedDebt`

- [ ] **Step 1: Extend `core/events.ts` and `core/errors.ts`**

Add two variants in the `--- credit ---` block of `core/events.ts`:

```ts
  | { type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }
  /** Drawn credit that liquidation could not clear, converted to distressed debt. */
  | { type: 'CreditWrittenDown'; player: PlayerId; amount: Money }
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
import { decideCredit } from './decide.js'
import { applyAll, deed, eventsOf, gameState, rejectionOf, withDeeds, withPlayers } from './fixture.js'
import { borrowingBase, liquidationPrice, liquidationQueue, playersAwaitingLiquidation } from './selectors.js'
import { flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt } from './settlement.js'

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
Expected: FAIL — `flagMarginCalls` and `settleDistressedDebt` are not exported.

- [ ] **Step 4: Add steps 8 and 10 to `contexts/credit/settlement.ts`**

Append to `settlement.ts`, and add `borrowingBase`, `distressedInterestDue`,
`liquidationQueue` to its import from `./selectors.js`:

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
 * Settlement step 10, after audits at step 9. A breached position that is not yet
 * flagged is flagged now; one already flagged stays flagged with its original round,
 * so the cure clock does not restart; one back inside its base is cured.
 * Liquidation itself does not happen here — spec 19.8 puts it at the start of the
 * Open phase two rounds after the flag.
 */
export function flagMarginCalls(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const player of state.config.turnOrder) {
    const p = state.players[player]
    const breached = p.drawnCredit > borrowingBase(state, player)
    if (breached && p.marginCallFlaggedAt === null) {
      events.push({
        type: 'MarginCallFlagged',
        player,
        shortfall: p.drawnCredit - borrowingBase(state, player),
      })
    } else if (!breached && p.marginCallFlaggedAt !== null) {
      events.push({ type: 'MarginCallCured', player })
    }
  }
  return events
}

/**
 * Spec 19.8 and section 5. Called at the start of the Open phase once the auction has
 * consumed every deed the player owns and the position is still short. The residual
 * drawn balance is written down into distressed debt, which is what spec section 5
 * means by "after exhausting credit and liquidation". Guarantees termination: without
 * it a bank sale at exactly LIQUIDATION_FLOOR always widens the gap, because 70% of
 * face is less than the 75% of face it removes from the borrowing base.
 */
export function exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[] {
  const shortfall = state.players[player].drawnCredit - borrowingBase(state, player)
  if (shortfall <= 0) return []
  if (liquidationQueue(state, player).length > 0) return []
  return [
    { type: 'CreditWrittenDown', player, amount: shortfall },
    { type: 'MarginCallCured', player },
  ]
}
```

Add `import type { PlayerId } from '../../core/types.js'` to the file header.

- [ ] **Step 5: Add the new reducer cases to `contexts/credit/reduce.ts`**

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

    /**
     * Spec section 5. Buildings on the lot are sold back to the bank at 50% of purchase
     * cost first (spec 19.6), then the bare deed transfers. Both proceeds pay down the
     * drawn balance; anything beyond the drawn balance returns as clean cash. The buyer
     * pays only the deed price — the bank pays the building sellback.
     */
    case 'DeedLiquidated': {
      const lot = state.deeds[event.deed]
      if (lot === undefined) return state
      const proceeds = event.price + buildingSellbackValue(lot)

      let next = withDeed(state, event.deed, { owner: event.buyer, houses: 0 })
      next = {
        ...next,
        housesRemaining: next.housesRemaining + (lot.houses === 5 ? 0 : lot.houses),
        hotelsRemaining: next.hotelsRemaining + (lot.houses === 5 ? 1 : 0),
      }
      if (event.buyer !== 'bank') next = addCash(next, event.buyer, -event.price)

      const debtor = next.players[event.player]
      const applied = Math.min(proceeds, debtor.drawnCredit)
      return withPlayer(next, event.player, {
        drawnCredit: debtor.drawnCredit - applied,
        cleanCash: debtor.cleanCash + (proceeds - applied),
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

- [ ] **Step 8: Write the failing test for the liquidation auction**

Append to `margin.test.ts`:

```ts
describe('forced liquidation at the start of the Open phase (spec 19.8)', () => {
  // P1 flagged at round 5, so the auction runs in the Open phase of round 7.
  // P1 owns boardwalk 400 and park-place 350: base = 750 * 0.75 = 562, drawn 800.
  const table = withPlayers(
    withDeeds(gameState({ round: 7 }), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('park-place', 350, { owner: 'P1' }),
    ]),
    {
      P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
      P2: { cleanCash: 1000 },
      P3: { cleanCash: 1000 },
      P4: { cleanCash: 100 },
    },
  )

  it('offers deeds in descending face value order', () => {
    expect(liquidationQueue(table, 'P1')).toEqual(['boardwalk', 'park-place'])
  })

  it('prices the floor at LIQUIDATION_FLOOR of face, correctly, on a $350 deed', () => {
    // 350 * 0.7 evaluates to 244.99999999999997 in IEEE-754. The floor is 245.
    expect(liquidationPrice(deed('park-place', 350))).toBe(245)
    expect(liquidationPrice(deed('boardwalk', 400))).toBe(280)
  })

  it('sells to the highest eligible bid', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot',
      player: 'P1',
      deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 300 }, { player: 'P3', amount: 290 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'P2', price: 300 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('P2')
    expect(after.players.P2.cleanCash).toBe(700)
    expect(after.players.P1.drawnCredit).toBe(500)
  })

  it('ignores bids below the 70% floor and hands the deed to the bank', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot',
      player: 'P1',
      deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 279 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'bank', price: 280 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(after.players.P2.cleanCash).toBe(1000)
    expect(after.players.P1.drawnCredit).toBe(520)
  })

  it('breaks tied top bids by turn order', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot',
      player: 'P1',
      deed: 'boardwalk',
      bids: [{ player: 'P3', amount: 300 }, { player: 'P2', amount: 300 }],
    }))
    expect(events[0]).toMatchObject({ buyer: 'P2', price: 300 })
  })

  it('stops the auction the moment the position is cured', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot',
      player: 'P1',
      deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 800 }],
    }))
    // drawn 800 - 800 = 0, base is now 350 * 0.75 = 262, so the position is cured.
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
      type: 'SettleLiquidationLot',
      player: 'P1',
      deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 900 }],
    }))
    expect(applyAll(table, events).players.P1.cleanCash).toBe(100)
  })

  it('sells buildings back to the bank at 50% and applies that to the debt too', () => {
    const built = withDeeds(table, [
      deed('boardwalk', 400, { owner: 'P1', houses: 2, houseCost: 200 }),
    ])
    const events = eventsOf(decideCredit(built, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }))
    const after = applyAll(built, events)
    // bank pays 280 for the deed plus 200 for (2 * 200) * 0.5 of buildings
    expect(after.players.P1.drawnCredit).toBe(320)
    expect(after.deeds.boardwalk?.houses).toBe(0)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY + 2)
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

- [ ] **Step 10: Add `SettleLiquidationLot` to `contexts/credit/decide.ts`**

Extend the `CreditCommand` union:

```ts
  | { readonly type: 'SettleLiquidationLot'
      readonly player: PlayerId
      readonly deed: DeedId
      readonly bids: readonly { readonly player: PlayerId; readonly amount: Money }[] }
  | { readonly type: 'RepayDistressedDebt'; readonly player: PlayerId; readonly amount: Money }
```

Add the cases, and import `reduceCredit`, `isUnderMarginCall`, `liquidationPrice`,
`liquidationQueue`, `playersAwaitingLiquidation` and `DeedId`:

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

      const after = reduceCredit(state, sale)
      return isUnderMarginCall(after, command.player)
        ? [sale]
        : [sale, { type: 'MarginCallCured', player: command.player }]
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

- [ ] **Step 11: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 12: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): facilitator-run liquidation auction at the 70% floor

Lots go in descending face value, to the highest bid at or above 70% of
face, to the bank at exactly 70% if nobody bids. Buildings sell back to
the bank at 50% first. The auction stops the instant the position cures."
```

- [ ] **Step 13: Write the failing test for the exhaustion path**

Append to `margin.test.ts`:

```ts
import { exhaustLiquidation } from './settlement.js'

describe('a liquidation that runs out of deeds', () => {
  it('walks the whole portfolio and then writes the residual down to distressed debt', () => {
    const start = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1' }),
        deed('park-place', 350, { owner: 'P1' }),
      ]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 }, P2: { cleanCash: 400 } },
    )

    const lot1 = eventsOf(decideCredit(start, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 300 }],
    }))
    const afterLot1 = applyAll(start, lot1)
    expect(afterLot1.players.P1.drawnCredit).toBe(500)
    expect(borrowingBase(afterLot1, 'P1')).toBe(262) // 350 * 0.75
    expect(lot1).toHaveLength(1) // still breached, the auction continues

    const lot2 = eventsOf(decideCredit(afterLot1, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'park-place', bids: [],
    }))
    expect(lot2).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'park-place', buyer: 'bank', price: 245 },
    ])
    const afterLot2 = applyAll(afterLot1, lot2)
    expect(afterLot2.players.P1.drawnCredit).toBe(255)
    expect(borrowingBase(afterLot2, 'P1')).toBe(0)
    expect(liquidationQueue(afterLot2, 'P1')).toEqual([])

    const wind = exhaustLiquidation(afterLot2, 'P1')
    expect(wind).toEqual([
      { type: 'CreditWrittenDown', player: 'P1', amount: 255 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
    const done = applyAll(afterLot2, wind)
    expect(done.players.P1.drawnCredit).toBe(0)
    expect(done.players.P1.distressedDebt).toBe(255)
    expect(done.players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('does nothing while deeds remain, or when the position is already cured', () => {
    const withDeedsLeft = withPlayers(
      withDeeds(gameState({ round: 7 }), [deed('boardwalk', 400, { owner: 'P1' })]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5 } },
    )
    expect(exhaustLiquidation(withDeedsLeft, 'P1')).toEqual([])
    expect(exhaustLiquidation(gameState(), 'P1')).toEqual([])
  })
})
```

- [ ] **Step 14: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS — `exhaustLiquidation` was written in Step 4. Fix `settlement.ts` if not.

- [ ] **Step 15: Write the failing test for distressed debt**

Append to `margin.test.ts`:

```ts
describe('distressed debt (spec 5 and 19.7)', () => {
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
    // A player with large distressed debt, zero cash and no drawn credit is not
    // liquidatable. Rent, audit fines, taxes and carrying cost all land here.
    const s = withPlayers(
      withDeeds(gameState({ round: 12 }), SEVEN_DEEDS),
      { P1: { cleanCash: 0, drawnCredit: 0, distressedDebt: 4000 } },
    )
    expect(flagMarginCalls(s)).toEqual([])
    expect(playersAwaitingLiquidation(s)).toEqual([])
  })
})
```

- [ ] **Step 16: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/margin.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 17: Extend `contexts/credit/index.ts`**

```ts
export {
  STIMULUS_ROUND,
  advanceEraIIStimulus,
  exhaustLiquidation,
  flagMarginCalls,
  settleCarryingCost,
  settleCreditInterest,
  settleDistressedDebt,
} from './settlement.js'
export {
  borrowingBase,
  buildingSellbackValue,
  carryingCostFor,
  creditHeadroom,
  creditInterestDue,
  deedsOwnedBy,
  distressedInterestDue,
  isUnderMarginCall,
  liquidationPrice,
  liquidationQueue,
  liquidationRound,
  playersAwaitingLiquidation,
  prevailingRate,
  unmortgagedDeedCount,
} from './selectors.js'
```

- [ ] **Step 18: Run the whole toolchain and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): distressed debt at 15% compounding, never auto-swept

Spec 19.8 boundary enforced by test: liquidation is reachable only from
an uncured margin call. Rent, audit fines, tax and carrying cost all
become distressed debt immediately, with no auction and no elimination."
```

---

### Task 11: `credit` — peer loans, default, and the transferable note

**Files:**
- Modify: `packages/engine/src/core/events.ts` (widen `PeerLoanDefaulted`)
- Modify: `packages/engine/src/core/errors.ts` (add `INVALID_LOAN_TERMS`)
- Modify: `packages/engine/src/contexts/credit/reduce.ts`
- Modify: `packages/engine/src/contexts/credit/decide.ts`
- Modify: `packages/engine/src/contexts/credit/settlement.ts`
- Modify: `packages/engine/src/contexts/credit/index.ts`
- Test: `packages/engine/src/contexts/credit/peer-loans.test.ts`

**Interfaces:**
- Consumes: everything Tasks 9-10 produced, plus `activeLoans`, `findLoan`,
  `peerLoanInterestDue`, `pledgedDeeds`, `poolHoldingLoan`,
  `collateralLiquidationProceeds` from `selectors.ts`; `PeerLoan` and `Pool` from
  `core/state.ts`.
- Produces:
  - `settlePeerLoanInterest(state: GameState): readonly GameEvent[]` — Settlement step 5
  - `buildPeerLoanDefault(state: GameState, loan: PeerLoan): GameEvent`
  - `CreditCommand` gains `OriginatePeerLoan`, `RepayPeerLoan`, `SellPeerLoanNote`

- [ ] **Step 1: Extend `core/events.ts` and `core/errors.ts`**

Replace the `PeerLoanDefaulted` variant. `collateralTo` widens to include the bank, and
two fields carry spec 19.4's pooled resolution:

```ts
  | { type: 'PeerLoanDefaulted'; id: ContractId
      /** The lender, or 'bank' when the note sat inside a live pool (spec 19.4). */
      collateralTo: PlayerId | 'bank'
      writtenOff: Money
      /** Spec 19.4: the pool whose waterfall receives `proceeds`, or null. */
      proceedsToPool: ContractId | null
      proceeds: Money }
```

Add to `RejectionCode` in `core/errors.ts`:

```ts
  | 'INVALID_LOAN_TERMS'
```

- [ ] **Step 2: Write the failing test for origination**

`packages/engine/src/contexts/credit/peer-loans.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import type { Pool } from '../../core/state.js'
import { decideCredit } from './decide.js'
import { applyAll, deed, eventsOf, gameState, rejectionOf, withDeeds, withPlayers } from './fixture.js'
import { borrowingBase, findLoan, peerLoanInterestDue } from './selectors.js'
import { flagMarginCalls, settlePeerLoanInterest } from './settlement.js'

const ERA_II = gameState({ round: 8, era: 2 })

const TABLE = withPlayers(
  withDeeds(ERA_II, [
    deed('boardwalk', 400, { owner: 'P1' }),
    deed('park-place', 350, { owner: 'P1' }),
  ]),
  { P1: { cleanCash: 300 }, P2: { cleanCash: 1000 } },
)

const ORIGINATE = {
  type: 'OriginatePeerLoan' as const,
  id: 'loan-1',
  lender: 'P2' as const,
  borrower: 'P1' as const,
  principal: 500,
  ratePerRound: 0.1,
  maturesAtRound: 12,
  collateral: ['boardwalk'] as readonly string[],
}

describe('peer loan origination (spec section 7)', () => {
  it('is locked until Era II under progressive unlocking', () => {
    const eraI = { ...TABLE, round: 3, era: 1 as const }
    expect(rejectionOf(decideCredit(eraI, ORIGINATE)).code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('is available from round 1 when unlockMode is all', () => {
    const open = {
      ...TABLE,
      round: 3,
      era: 1 as const,
      config: { ...TABLE.config, unlockMode: 'all' as const },
    }
    expect(eventsOf(decideCredit(open, ORIGINATE))).toHaveLength(1)
  })

  it('moves principal from lender to borrower and records the note', () => {
    const events = eventsOf(decideCredit(TABLE, ORIGINATE))
    expect(events).toEqual([{
      type: 'PeerLoanOriginated', id: 'loan-1', lender: 'P2', borrower: 'P1',
      principal: 500, ratePerRound: 0.1, maturesAtRound: 12, collateral: ['boardwalk'],
    }])
    const after = applyAll(TABLE, events)
    expect(after.players.P2.cleanCash).toBe(500)
    expect(after.players.P1.cleanCash).toBe(800)
    expect(findLoan(after, 'loan-1')).toEqual({
      id: 'loan-1', lender: 'P2', borrower: 'P1', principal: 500, outstanding: 500,
      ratePerRound: 0.1, maturesAtRound: 12, collateral: ['boardwalk'], status: 'active',
    })
  })

  it('accepts zero collateral and a zero rate — terms are freely negotiated', () => {
    const friendly = { ...ORIGINATE, id: 'loan-2', ratePerRound: 0, collateral: [] }
    expect(eventsOf(decideCredit(TABLE, friendly))).toHaveLength(1)
  })

  it('rejects a principal the lender does not hold', () => {
    expect(rejectionOf(decideCredit(TABLE, { ...ORIGINATE, principal: 1001 })).code)
      .toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('rejects a term that does not end in the future, or runs past round 24', () => {
    expect(rejectionOf(decideCredit(TABLE, { ...ORIGINATE, maturesAtRound: 8 })).code)
      .toBe('INVALID_LOAN_TERMS')
    expect(rejectionOf(decideCredit(TABLE, {
      ...ORIGINATE, maturesAtRound: ECONOMY.TOTAL_ROUNDS + 1,
    })).code).toBe('INVALID_LOAN_TERMS')
  })

  it('rejects a negative rate, self-lending, and a duplicate loan id', () => {
    expect(rejectionOf(decideCredit(TABLE, { ...ORIGINATE, ratePerRound: -0.1 })).code)
      .toBe('INVALID_LOAN_TERMS')
    expect(rejectionOf(decideCredit(TABLE, { ...ORIGINATE, lender: 'P1' })).code)
      .toBe('INVALID_LOAN_TERMS')
    const existing = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
    expect(rejectionOf(decideCredit(existing, ORIGINATE)).code).toBe('INVALID_LOAN_TERMS')
  })

  it('rejects collateral the borrower does not own, or that is already pledged', () => {
    expect(rejectionOf(decideCredit(TABLE, {
      ...ORIGINATE, collateral: ['not-a-deed'],
    })).code).toBe('NOT_OWNER')
    const pledged = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
    expect(rejectionOf(decideCredit(pledged, {
      ...ORIGINATE, id: 'loan-3', principal: 100,
    })).code).toBe('DEED_ENCUMBERED')
  })

  it('floors interest on the outstanding balance', () => {
    const after = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
    const loan = findLoan(after, 'loan-1')
    expect(loan === undefined ? -1 : peerLoanInterestDue(loan)).toBe(50)
  })
})
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — `OriginatePeerLoan` is not a `CreditCommand`.

- [ ] **Step 4: Add the peer-loan commands to `contexts/credit/decide.ts`**

Extend the union, importing `ContractId` and `RoundNumber`:

```ts
  | { readonly type: 'OriginatePeerLoan'
      readonly id: ContractId
      readonly lender: PlayerId
      readonly borrower: PlayerId
      readonly principal: Money
      readonly ratePerRound: number
      readonly maturesAtRound: RoundNumber
      readonly collateral: readonly DeedId[] }
  | { readonly type: 'RepayPeerLoan'
      readonly player: PlayerId; readonly id: ContractId; readonly amount: Money }
  | { readonly type: 'SellPeerLoanNote'
      readonly id: ContractId; readonly from: PlayerId
      readonly to: PlayerId; readonly price: Money }
```

Add the cases, importing `ECONOMY`, `findLoan`, `pledgedDeeds` and `poolHoldingLoan`:

```ts
    case 'OriginatePeerLoan': {
      if (state.config.unlockMode === 'progressive' && state.era < 2) {
        return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Peer loans unlock in Era II.')
      }
      if (command.lender === command.borrower) {
        return reject('INVALID_LOAN_TERMS', 'A player cannot lend to themselves.')
      }
      if (findLoan(state, command.id) !== undefined) {
        return reject('INVALID_LOAN_TERMS', 'That loan id is already in use.')
      }
      if (!isWholeDollars(command.principal) || command.principal === 0) {
        return reject('INVALID_AMOUNT', 'Principal must be at least $1, in whole dollars.')
      }
      if (command.principal > state.players[command.lender].cleanCash) {
        return reject(
          'INSUFFICIENT_CLEAN_CASH',
          `${command.lender} holds $${state.players[command.lender].cleanCash} in clean cash.`,
        )
      }
      if (!Number.isFinite(command.ratePerRound) || command.ratePerRound < 0) {
        return reject('INVALID_LOAN_TERMS', 'The per-round rate must be zero or greater.')
      }
      if (
        !Number.isInteger(command.maturesAtRound) ||
        command.maturesAtRound <= state.round ||
        command.maturesAtRound > ECONOMY.TOTAL_ROUNDS
      ) {
        return reject(
          'INVALID_LOAN_TERMS',
          `The term must end after round ${state.round} and no later than round ${ECONOMY.TOTAL_ROUNDS}.`,
        )
      }
      if (new Set(command.collateral).size !== command.collateral.length) {
        return reject('DEED_ENCUMBERED', 'The same deed cannot be pledged twice on one loan.')
      }
      const alreadyPledged = pledgedDeeds(state)
      for (const deedId of command.collateral) {
        const pledge = state.deeds[deedId]
        if (pledge === undefined || pledge.owner !== command.borrower) {
          return reject('NOT_OWNER', `${command.borrower} does not own ${deedId}.`)
        }
        if (alreadyPledged.includes(deedId)) {
          return reject('DEED_ENCUMBERED', `${deedId} is already pledged against another loan.`)
        }
      }
      return [{
        type: 'PeerLoanOriginated',
        id: command.id,
        lender: command.lender,
        borrower: command.borrower,
        principal: command.principal,
        ratePerRound: command.ratePerRound,
        maturesAtRound: command.maturesAtRound,
        collateral: command.collateral,
      }]
    }

    case 'RepayPeerLoan': {
      const loan = findLoan(state, command.id)
      if (loan === undefined || loan.status !== 'active') {
        return reject('CONTRACT_NOT_FOUND', 'That loan is not outstanding.')
      }
      if (loan.borrower !== command.player) {
        return reject('NOT_OWNER', 'Only the borrower may repay this loan.')
      }
      if (
        !isWholeDollars(command.amount) ||
        command.amount === 0 ||
        command.amount > loan.outstanding
      ) {
        return reject('INVALID_AMOUNT', `Repay between $1 and $${loan.outstanding}.`)
      }
      if (command.amount > state.players[command.player].cleanCash) {
        return reject(
          'INSUFFICIENT_CLEAN_CASH',
          `You hold $${state.players[command.player].cleanCash} in clean cash.`,
        )
      }
      return [{ type: 'PeerLoanRepaid', id: command.id, amount: command.amount }]
    }

    case 'SellPeerLoanNote': {
      const loan = findLoan(state, command.id)
      if (loan === undefined || loan.status !== 'active') {
        return reject('CONTRACT_NOT_FOUND', 'That note is not outstanding.')
      }
      if (loan.lender !== command.from) {
        return reject('NOT_OWNER', 'Only the note holder may sell it.')
      }
      if (poolHoldingLoan(state, command.id) !== null) {
        return reject('NOT_ASSET_OWNER', 'That note has been pooled and is no longer yours to sell.')
      }
      if (command.to === loan.borrower) {
        return reject('INVALID_LOAN_TERMS', 'The borrower cannot buy their own note.')
      }
      if (!isWholeDollars(command.price)) {
        return reject('INVALID_AMOUNT', 'The price must be whole dollars, zero or more.')
      }
      if (command.price > state.players[command.to].cleanCash) {
        return reject(
          'INSUFFICIENT_CLEAN_CASH',
          `${command.to} holds $${state.players[command.to].cleanCash} in clean cash.`,
        )
      }
      return [{
        type: 'PeerLoanSold', id: command.id, from: command.from, to: command.to, price: command.price,
      }]
    }
```

- [ ] **Step 5: Add the peer-loan cases to `contexts/credit/reduce.ts`**

Insert before the `default` arm:

```ts
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
      let next: GameState = { ...state, loans: [...state.loans, loan] }
      next = addCash(next, event.lender, -event.principal)
      return addCash(next, event.borrower, event.principal)
    }

    case 'PeerLoanInterestPaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const next = addCash(state, loan.borrower, -event.amount)
      return addCash(next, loan.lender, event.amount)
    }

    case 'PeerLoanRepaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const outstanding = loan.outstanding - event.amount
      let next = addCash(state, loan.borrower, -event.amount)
      next = addCash(next, loan.lender, event.amount)
      return withLoan(next, event.id, {
        outstanding,
        status: outstanding === 0 ? 'repaid' : 'active',
      })
    }

    /**
     * Spec section 7. Collateral transfers, the remaining balance is written off, and
     * the borrower's borrowing base is halved permanently. Spec 19.4: when the note was
     * pooled, `collateralTo` is 'bank' and `proceeds` belongs to the pool's waterfall —
     * crediting the pool is `securitization`'s reducer for this same event (Task 16).
     */
    case 'PeerLoanDefaulted': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      let next: GameState = state
      for (const deedId of loan.collateral) {
        next = withDeed(next, deedId, { owner: event.collateralTo })
      }
      next = withPlayer(next, loan.borrower, { creditImpaired: true })
      return withLoan(next, event.id, { outstanding: 0, status: 'defaulted' })
    }

    case 'PeerLoanSold': {
      let next = addCash(state, event.to, -event.price)
      next = addCash(next, event.from, event.price)
      return withLoan(next, event.id, { lender: event.to })
    }
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/core packages/engine/src/contexts/credit
git commit -m "feat(credit): peer loan origination with freely negotiated terms

Principal, per-round rate, term and zero or more collateral deeds. The
engine enforces every term; it does not price them. Era-gated to Era II
unless unlockMode is 'all'."
```

- [ ] **Step 8: Write the failing test for Settlement step 5**

Append to `peer-loans.test.ts`:

```ts
describe('peer loan interest, Settlement step 5', () => {
  const lent = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
  // P1 cash 800, P2 cash 500, loan-1 outstanding 500 at 0.1 per round, matures round 12.

  it('transfers interest from borrower to lender', () => {
    const settling = { ...lent, phase: 'settlement' as const }
    const events = settlePeerLoanInterest(settling)
    expect(events).toEqual([{ type: 'PeerLoanInterestPaid', id: 'loan-1', amount: 50 }])
    const after = applyAll(settling, events)
    expect(after.players.P1.cleanCash).toBe(750)
    expect(after.players.P2.cleanCash).toBe(550)
    expect(after.treasury).toBe(0) // peer interest never touches the Treasury
  })

  it('defaults on a missed interest payment (spec section 7)', () => {
    const broke = withPlayers(lent, { P1: { cleanCash: 49 } })
    expect(settlePeerLoanInterest(broke)).toEqual([{
      type: 'PeerLoanDefaulted', id: 'loan-1', collateralTo: 'P2',
      writtenOff: 500, proceedsToPool: null, proceeds: 0,
    }])
  })

  it('defaults on an outstanding balance at term, after that round\'s interest', () => {
    const matured = { ...lent, round: 12 }
    expect(settlePeerLoanInterest(matured)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'loan-1', amount: 50 },
      { type: 'PeerLoanDefaulted', id: 'loan-1', collateralTo: 'P2',
        writtenOff: 500, proceedsToPool: null, proceeds: 0 },
    ])
  })

  it('does not default a loan repaid in full before its term', () => {
    const repaid = applyAll(lent, eventsOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'loan-1', amount: 500,
    })))
    expect(findLoan(repaid, 'loan-1')?.status).toBe('repaid')
    expect(settlePeerLoanInterest({ ...repaid, round: 12 })).toEqual([])
  })

  it('folds state across loans, so a borrower drained by the first defaults on the second', () => {
    const two = applyAll(
      applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE))),
      eventsOf(decideCredit(
        applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE))),
        { ...ORIGINATE, id: 'loan-9', lender: 'P3', principal: 100,
          ratePerRound: 1, collateral: ['park-place'] },
      )),
    )
    // P1 holds 900. loan-1 interest 50 leaves 850; loan-9 interest is 100, payable.
    const drained = withPlayers(two, { P1: { cleanCash: 60 } })
    expect(settlePeerLoanInterest(drained)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'loan-1', amount: 50 },
      { type: 'PeerLoanDefaulted', id: 'loan-9', collateralTo: 'P3',
        writtenOff: 100, proceedsToPool: null, proceeds: 0 },
    ])
  })
})
```

- [ ] **Step 9: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: FAIL — `settlePeerLoanInterest` is not exported.

- [ ] **Step 10: Add step 5 to `contexts/credit/settlement.ts`**

Append, importing `reduceCredit`, `PeerLoan`, and `collateralLiquidationProceeds`,
`findLoan`, `peerLoanInterestDue`, `poolHoldingLoan` from `./selectors.js`:

```ts
/**
 * Spec section 7 and 19.4. Unpooled: collateral goes to the lender. Pooled: collateral
 * is sold to the bank at LIQUIDATION_FLOOR of face and the cash enters that pool's
 * waterfall, because a waterfall can only distribute cash.
 */
export function buildPeerLoanDefault(state: GameState, loan: PeerLoan): GameEvent {
  const poolId = poolHoldingLoan(state, loan.id)
  if (poolId === null) {
    return {
      type: 'PeerLoanDefaulted',
      id: loan.id,
      collateralTo: loan.lender,
      writtenOff: loan.outstanding,
      proceedsToPool: null,
      proceeds: 0,
    }
  }
  return {
    type: 'PeerLoanDefaulted',
    id: loan.id,
    collateralTo: 'bank',
    writtenOff: loan.outstanding,
    proceedsToPool: poolId,
    proceeds: collateralLiquidationProceeds(state, loan),
  }
}

/**
 * Settlement step 5. Interest falls due on every active loan, floored, paid in clean
 * cash from borrower to lender. A borrower who cannot pay in full misses the payment
 * and the loan defaults — there is no partial peer interest payment. A loan still
 * outstanding at its term defaults after that round's interest has been handled.
 *
 * Loans fold in origination order, because one borrower's cash is finite across several
 * loans and one lender's receipts may fund their own obligations later in the step.
 */
export function settlePeerLoanInterest(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  let working = state

  for (const snapshot of state.loans) {
    if (snapshot.status !== 'active') continue
    const loan = findLoan(working, snapshot.id)
    if (loan === undefined || loan.status !== 'active') continue

    const due = peerLoanInterestDue(loan)
    const canPay = working.players[loan.borrower].cleanCash >= due

    if (due > 0 && canPay) {
      const paid: GameEvent = { type: 'PeerLoanInterestPaid', id: loan.id, amount: due }
      events.push(paid)
      working = reduceCredit(working, paid)
    }

    const missedInterest = due > 0 && !canPay
    const unpaidAtTerm = working.round >= loan.maturesAtRound && loan.outstanding > 0
    if (missedInterest || unpaidAtTerm) {
      const defaulted = buildPeerLoanDefault(working, loan)
      events.push(defaulted)
      working = reduceCredit(working, defaulted)
    }
  }

  return events
}
```

- [ ] **Step 11: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 12: Write the failing test for the consequences of default**

Append to `peer-loans.test.ts`:

```ts
describe('default consequences (spec section 7)', () => {
  const lent = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
  const broke = withPlayers(lent, { P1: { cleanCash: 0 } })
  const defaulted = applyAll(broke, settlePeerLoanInterest(broke))

  it('transfers the collateral to the lender', () => {
    expect(defaulted.deeds.boardwalk?.owner).toBe('P2')
    expect(defaulted.deeds['park-place']?.owner).toBe('P1')
  })

  it('writes off the remaining balance and closes the note', () => {
    expect(findLoan(defaulted, 'loan-1')).toMatchObject({ outstanding: 0, status: 'defaulted' })
  })

  it('halves the borrower\'s borrowing base permanently', () => {
    expect(borrowingBase(broke, 'P1')).toBe(562)  // (400 + 350) * 0.75
    expect(defaulted.players.P1.creditImpaired).toBe(true)
    expect(borrowingBase(defaulted, 'P1')).toBe(131) // floor(floor(350 * 0.75) / 2)
  })

  it('keeps the base halved even after the player buys the collateral back', () => {
    const restored = applyAll(defaulted, [
      { type: 'DeedTraded', from: 'P2', to: 'P1', deeds: ['boardwalk'], cash: 0 },
    ])
    // reduceCredit ignores DeedTraded; board owns it. Assert the flag, not the deed.
    expect(restored.players.P1.creditImpaired).toBe(true)
  })

  it('cascades into a margin call at step 10 of the same Settlement', () => {
    const levered = withPlayers(broke, { P1: { drawnCredit: 400 } })
    const after = applyAll(levered, settlePeerLoanInterest(levered))
    expect(borrowingBase(after, 'P1')).toBe(131)
    expect(flagMarginCalls(after)).toEqual([
      { type: 'MarginCallFlagged', player: 'P1', shortfall: 269 },
    ])
  })
})
```

- [ ] **Step 13: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 19 tests. Step 5 of this task already wrote the reducer case; if the
base-halving assertion fails, the bug is the halving order in `borrowingBase`.

- [ ] **Step 14: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): peer loan interest, default and permanent impairment

Default fires on a missed interest payment or a balance outstanding at
term. Collateral transfers, the balance is written off, and the borrower
carries a halved borrowing base for the rest of the game — which routinely
cascades into a margin call at step 10 of that same Settlement."
```

- [ ] **Step 15: Write the failing test for the transferable note and pooled default**

Append to `peer-loans.test.ts`:

```ts
describe('the note is a transferable asset (spec section 7)', () => {
  const lent = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))

  it('sells outright and redirects future interest to the new holder', () => {
    const withCash = withPlayers(lent, { P3: { cleanCash: 600 } })
    const sold = applyAll(withCash, eventsOf(decideCredit(withCash, {
      type: 'SellPeerLoanNote', id: 'loan-1', from: 'P2', to: 'P3', price: 420,
    })))
    expect(sold.players.P2.cleanCash).toBe(920) // 500 + 420
    expect(sold.players.P3.cleanCash).toBe(180)
    expect(findLoan(sold, 'loan-1')?.lender).toBe('P3')

    const after = applyAll(sold, settlePeerLoanInterest(sold))
    expect(after.players.P3.cleanCash).toBe(230) // received the 50 of interest
    expect(after.players.P2.cleanCash).toBe(920)
  })

  it('sends collateral to whoever holds the note at default', () => {
    const withCash = withPlayers(lent, { P3: { cleanCash: 600 } })
    const sold = applyAll(withCash, eventsOf(decideCredit(withCash, {
      type: 'SellPeerLoanNote', id: 'loan-1', from: 'P2', to: 'P3', price: 420,
    })))
    const broke = withPlayers(sold, { P1: { cleanCash: 0 } })
    expect(applyAll(broke, settlePeerLoanInterest(broke)).deeds.boardwalk?.owner).toBe('P3')
  })

  it('refuses a sale by anyone but the holder, and to the borrower', () => {
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', id: 'loan-1', from: 'P3', to: 'P4', price: 100,
    })).code).toBe('NOT_OWNER')
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', id: 'loan-1', from: 'P2', to: 'P1', price: 100,
    })).code).toBe('INVALID_LOAN_TERMS')
  })

  it('refuses a sale once the note has been pooled', () => {
    const pooled = { ...lent, pools: [POOL] }
    expect(rejectionOf(decideCredit(pooled, {
      type: 'SellPeerLoanNote', id: 'loan-1', from: 'P2', to: 'P3', price: 400,
    })).code).toBe('NOT_ASSET_OWNER')
  })
})

const POOL: Pool = {
  id: 'pool-1',
  originator: 'P2',
  assets: [{ kind: 'peer-loan', id: 'loan-1' }],
  tranches: [
    { kind: 'senior', face: 300, paid: 0, holder: 'P2' },
    { kind: 'mezzanine', face: 150, paid: 0, holder: 'P3' },
    { kind: 'equity', face: 0, paid: 0, holder: 'P4' },
  ],
  terminated: false,
}

describe('a pooled note that defaults (spec 19.4)', () => {
  const lent = applyAll(TABLE, eventsOf(decideCredit(TABLE, ORIGINATE)))
  const pooled = withPlayers({ ...lent, pools: [POOL] }, { P1: { cleanCash: 0 } })

  it('sells the collateral to the bank at the 70% floor, for the pool\'s waterfall', () => {
    expect(settlePeerLoanInterest(pooled)).toEqual([{
      type: 'PeerLoanDefaulted',
      id: 'loan-1',
      collateralTo: 'bank',
      writtenOff: 500,
      proceedsToPool: 'pool-1',
      proceeds: 280, // 400 * 0.7
    }])
  })

  it('moves the deed to the bank and still impairs the borrower', () => {
    const after = applyAll(pooled, settlePeerLoanInterest(pooled))
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(after.players.P1.creditImpaired).toBe(true)
    expect(after.players.P2.cleanCash).toBe(500) // the originator receives nothing directly
  })

  it('ignores a terminated pool and pays the lender directly', () => {
    const dead = { ...pooled, pools: [{ ...POOL, terminated: true }] }
    expect(settlePeerLoanInterest(dead)[0]).toMatchObject({
      collateralTo: 'P2', proceedsToPool: null, proceeds: 0,
    })
  })
})
```

- [ ] **Step 16: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/credit/peer-loans.test.ts`
Expected: PASS, 26 tests. Steps 4, 5 and 10 already implemented all three behaviours.

- [ ] **Step 17: Extend `contexts/credit/index.ts`**

```ts
export {
  STIMULUS_ROUND,
  advanceEraIIStimulus,
  buildPeerLoanDefault,
  exhaustLiquidation,
  flagMarginCalls,
  settleCarryingCost,
  settleCreditInterest,
  settleDistressedDebt,
  settlePeerLoanInterest,
} from './settlement.js'
```

and add to the `./selectors.js` re-export block:

```ts
  activeLoans,
  collateralLiquidationProceeds,
  findLoan,
  peerLoanInterestDue,
  pledgedDeeds,
  poolHoldingLoan,
```

- [ ] **Step 18: Run the whole toolchain**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. Confirm no file in `contexts/credit/` exceeds 500 lines with
`wc -l packages/engine/src/contexts/credit/*.ts`; if `reduce.ts` has, split the five
peer-loan cases into `reduce-loans.ts` and delegate from the `default` arm.

- [ ] **Step 19: Commit**

```bash
git add packages/engine/src/contexts/credit
git commit -m "feat(credit): note transfer and spec 19.4 pooled-collateral default

A note is an asset: sellable outright, and poolable once securitization
lands. When a pooled note defaults its collateral goes to the bank at 70%
of face and the cash is routed to the pool, because a waterfall can only
distribute cash. Crediting the pool is Task 16's reducer for this event."
```

---

## NEW EVENTS REQUIRED

Four changes to `core/events.ts` beyond what Task 2 defines. Each is introduced in a
numbered step above and each needs Task 2's `events.test.ts` updated alongside it.

**New variants:**

```ts
  | { type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }
  | { type: 'CreditWrittenDown'; player: PlayerId; amount: Money }
```

`DistressedDebtRepaid` — Task 2 has `DistressedDebtIncurred` and `DistressedDebtAccrued`
but nothing that reduces the balance, and spec 19.7 makes it repayable during any Open
phase. Encoding it as a negative `DistressedDebtIncurred` would break the whole-dollar
non-negative invariant.

`CreditWrittenDown` — the residual drawn balance after liquidation has consumed every
deed, converted to distressed debt. Required for termination: a sale at exactly
`LIQUIDATION_FLOOR` removes 70% of face from the drawn balance but 75% of face from the
borrowing base, so a floor sale always widens the gap. Without this event a player with
no deeds and a positive drawn balance re-flags forever.

**Payload extensions to existing variants:**

`InterestAccrued` gains `capitalised: boolean`. Spec section 5 has two distinct outcomes
— paid to the Treasury from clean cash, or rolled into the drawn balance — and the
Task 2 payload cannot express which occurred. The alternative, a separate
`InterestCapitalised` variant, adds a variant rather than a field.

`PeerLoanDefaulted` widens `collateralTo` from `PlayerId` to `PlayerId | 'bank'` and
gains `proceedsToPool: ContractId | null` and `proceeds: Money`. Spec 19.4 sends a
pooled note's collateral to the bank at the 70% floor with the cash entering the pool's
waterfall, which the Task 2 payload cannot represent.

## NEW REJECTION CODES REQUIRED

Four additions to `RejectionCode` in `core/errors.ts`:

- `INVALID_AMOUNT` — non-positive, fractional, or over-large draws, repayments and bids.
- `INVALID_LOAN_TERMS` — self-lending, duplicate loan id, negative rate, a term that
  does not end in the future or runs past `ECONOMY.TOTAL_ROUNDS`, borrower buying their
  own note.
- `NO_PENDING_LIQUIDATION` — a liquidation lot submitted for a player with no marked
  margin call.
- `WRONG_LIQUIDATION_LOT` — a lot submitted out of descending-face order.

## OTHER NEW FILES

`packages/engine/src/core/money.ts` — `applyRate` and `isWholeDollars`. Shared rather
than context-local because `underworld` (laundering haircut), `markets` (make-whole
valuation) and `securitization` (ratings, waterfall, CDS collateral) all need the same
float-safe floor. See Task 9, Step 1 for why a naive `Math.floor` is wrong.

`packages/engine/src/contexts/credit/settlement.ts` and `fixture.ts` — see the file
layout table at the top of this document.

## JUDGMENT CALLS WHERE THE SPEC IS AMBIGUOUS

Each of these blocked an implementation decision. Each should be confirmed or overruled
by a spec amendment; the spec wins wherever it later disagrees.

1. **Spec 19.1's audit-fine claim does not follow from spec 19.8.** Section 19.1 says an
   audit fine at step 9 "can and should trigger a margin call" at step 10. Under 19.8 an
   unpayable audit fine becomes distressed debt, and neither clean cash nor distressed
   debt enters the drawn balance or the borrowing base — so it arithmetically cannot
   breach. The step order is implemented exactly as 19.1 requires and a test asserts the
   19.8 outcome, but the mechanism that actually produces same-Settlement margin calls is
   step 4 interest capitalisation, not step 9. **Needs a ruling.**

2. **Obligations do not auto-draw on the credit line.** Section 5 says the shortfall
   becomes distressed debt "after exhausting credit and liquidation", which could mean
   the engine draws remaining headroom first. Spec 19.7's "repayment is always the
   player's choice" and 19.8's "immediately" both point the other way, so an unpayable
   obligation becomes distressed debt without touching the credit line. The player can
   draw and repay it next Open phase at 5-12% instead of 15% compounding; the design
   keeps the decision with them.

3. **Credit interest capitalises all-or-nothing.** Section 5 says "if a player cannot pay
   interest from clean cash, the interest capitalises". A player holding $49 against $50
   of interest capitalises the full $50 rather than paying $49. Carrying cost, by
   contrast, takes partial payment and the remainder becomes distressed debt, because
   19.8 speaks of "the shortfall".

4. **Peer loan interest is all-or-nothing and defaults on any shortfall.** Section 7
   makes default follow "a missed interest payment". A partial payment is treated as
   missed and no cash moves.

5. **Liquidation includes mortgaged deeds, at 70% of face regardless.** Section 5 says
   "deeds", in descending face order, with no exclusion. The deed transfers with its
   mortgaged flag intact. Note that a mortgaged deed is the most effective lot to sell —
   it contributes nothing to the base, so its proceeds are a pure cure — but the spec's
   ordering rule is followed literally rather than optimised for the debtor.

6. **Buildings are sold back to the bank at 50% before the lot is auctioned**, per 19.6,
   and those proceeds also pay down the drawn balance. The bidder buys a bare deed. This
   uses `ECONOMY.MORTGAGE_RATE`, which is 0.5 and documented as mortgage economics; a
   dedicated `BUILDING_SELLBACK_RATE` in `config/economy.ts` would be cleaner and is
   recommended.

7. **Building cost counted toward the borrowing base is `houses * houseCost`**, with
   `houses === 5` (a hotel) counting as five house-costs, matching standard Monopoly
   hotel pricing. Buildings on a mortgaged deed are excluded, which is moot given 19.6.

8. **The cure window is measured at Settlement, not at the end of the Open phase.**
   Section 5 says "until the end of the next Open phase", but the engine's only
   observable checkpoint is Settlement step 10. A player who cures during Open and
   breaches again during Movement is therefore still uncured, and the original
   `marginCallFlaggedAt` is kept so the clock cannot be restarted by re-breaching. This
   makes the timeline: flagged at Settlement of round N, cure window is Open of N+1,
   auction at the start of Open of N+2.

9. **Excess auction proceeds return to the debtor as clean cash.** Section 5 says
   proceeds "pay down the drawn balance until the position is cured"; a winning bid
   larger than the remaining balance has nowhere else to go.

10. **Tied top bids resolve to the earlier player in turn order**, and lots with equal
    face value are auctioned in ascending deed-id order. Neither is specified; both are
    needed for the engine to stay deterministic under replay.

11. **The Era II stimulus fires at the Market phase of round 7**, once, for all four
    players in turn order. Section 4 says "at the start of round 7"; Market is the first
    phase of a round. `session` (Task 4) must call `advanceEraIIStimulus` on entering
    Market, and the function is idempotent-by-guard rather than by a state flag, because
    `GameState` has no place to record that it has run.

12. **Crediting a pool with 19.4 collateral proceeds is Task 16's job.** `Pool` in Task 2
    has no collected-cash field, so `PeerLoanDefaulted` carries `proceedsToPool` and
    `proceeds` and `securitization`'s reducer must handle the same event. This requires
    the root `reduce.ts` to fold every event through every context reducer in dependency
    order rather than dispatching to exactly one — worth confirming when Task 16 lands.
