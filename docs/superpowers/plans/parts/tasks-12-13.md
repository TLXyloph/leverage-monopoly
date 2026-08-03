## Tasks 12-13

`underworld` bounded context. Spec sections 10, 12, 19.1, 19.5 and 19.9 are the
authority. Per spec section 14 this context depends on `session` and `board` only —
it may **not** import `credit`, so everything below is expressed either in terms
`underworld` owns outright or as events the credit reducer applies.

Two invariants established here and asserted by tests, because every later task
depends on them:

- **`DirtyCashEarned` is the only event that increases `dirtyCash`.** Every other
  underworld event either spends it, converts it, or seizes it.
- **Clean money is conserved.** Dirty cash sits outside the conserved pool (it is
  created ex nihilo by ventures and worth $0 at scoring, spec section 12), so every
  movement that crosses the boundary has a Treasury counterparty:

  | Movement | Clean leg |
  |---|---|
  | Venture / speakeasy / insider cost paid in clean | player → Treasury |
  | Venture / speakeasy / insider / bribery cost paid in dirty | destroyed, no clean leg |
  | Laundering proceeds | Treasury → player (Treasury may run a deficit, spec section 4) |
  | Audit fine | player clean + capitalised draw → Treasury |
  | Audit seizure of dirty cash | destroyed, no clean leg |

  The identity `Σ cleanCash − Σ drawnCredit + treasury` is unchanged by every
  underworld event. Task 20's property suite reuses it directly.

---

### Task 12: `underworld` context — ventures and dirty cash

**Files:**
- Modify: `packages/engine/src/core/state.ts`
- Modify: `packages/engine/src/core/events.ts`
- Modify: `packages/engine/src/core/errors.ts`
- Modify: `packages/engine/src/config/economy.ts`
- Create: `packages/engine/src/contexts/underworld/selectors.ts`
- Create: `packages/engine/src/contexts/underworld/reduce.ts`
- Create: `packages/engine/src/contexts/underworld/decide.ts`
- Create: `packages/engine/src/contexts/underworld/ventures.ts`
- Create: `packages/engine/src/contexts/underworld/index.ts`
- Create: `packages/engine/src/contexts/underworld/underworld.fixture.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/underworld/underworld.test.ts`

**Interfaces:**

- Consumes, from Task 2 and nowhere else:
  - `GameState`, `PlayerState`, `ActiveVenture`, `DeedState` from `core/state.js`
  - `GameEvent` from `core/events.js`
  - `Rejection`, `reject` from `core/errors.js`
  - `Money`, `PlayerId`, `DeedId`, `DiceRoll`, `Era`, `RoundNumber`, `PLAYER_IDS`
    from `core/types.js`
  - `ECONOMY` from `config/economy.js`
- Produces, exported from `contexts/underworld/index.ts`:
  ```ts
  export type BriberyEffect  // re-exported from core/events.js
  export type UnderworldCommand
  export function reduceUnderworld(state: GameState, event: GameEvent): GameState
  export function decideUnderworld(
    state: GameState, command: UnderworldCommand,
  ): readonly GameEvent[] | Rejection
  export function ventureIncomeFromRent(
    state: GameState, rent: Extract<GameEvent, { type: 'RentCharged' }>,
  ): readonly GameEvent[]
  export function settleVentures(state: GameState): readonly GameEvent[]
  export function activeVenture(
    state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
  ): ActiveVenture | undefined
  export function runsVenture(
    state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
  ): boolean
  export function speakeasyPayout(dice: DiceRoll): Money
  export function isUnlocked(state: GameState, minEra: Era): boolean
  export function toBps(fraction: number): number
  export function applyBps(amount: Money, points: number): Money
  ```
- Consumed by later tasks: Task 6 (`board`, rent) calls `ventureIncomeFromRent` for
  every `RentCharged` it emits. Task 4 (`session`) calls `settleVentures` at
  Settlement step 2 and `settleAudits` (Task 13) at Settlement step 9.

---

- [ ] **Step 1: Add the four underworld flags to `PlayerState`**

`packages/engine/src/core/state.ts` — extend the existing `PlayerState` interface.
`dirtyActionThisRound` is what spec 19.9's decay rule reads; the other three are
where bribery and insider trading deposit their scoped effects for `board` and
`decks` to consume:

```ts
export interface PlayerState {
  // ... every existing field is unchanged ...

  /** Set by any HeatChanged with a positive delta. Blocks Heat decay. Spec 19.9. */
  readonly dirtyActionThisRound: boolean
  /** Insider trading buyer may see the current era deck's top card this round. */
  readonly insiderRevealedThisRound: boolean
  /** A bribe has forced this player to re-roll. Consumed by `board`. */
  readonly rerollForced: boolean
  /** A bribe has cancelled the era card targeting this player. Consumed by `decks`. */
  readonly cardCancelled: boolean
}
```

- [ ] **Step 2: Extend the event schema for the underworld**

`packages/engine/src/core/events.ts`. Add `BriberyEffect` above the union, add the
`VentureTicked` variant, and replace the four listed variants. Everything else in
the file is untouched:

```ts
/** The three scoped effects a bribe may buy. Spec section 10. */
export type BriberyEffect =
  | { readonly kind: 'force-reroll'; readonly target: PlayerId }
  | { readonly kind: 'cancel-card' }
  | { readonly kind: 'delay-margin-call' }

export type GameEvent =
  // ... all other variants unchanged ...

  // --- underworld ---
  | { type: 'VentureLaunched'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      cost: Money; rounds: number; fundedFrom: 'clean' | 'dirty' }
  | { type: 'VentureTicked'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      roundsRemaining: number }
  | { type: 'SpeakeasyPlayed'; player: PlayerId; dice: DiceRoll; payout: Money
      fundedFrom: 'clean' | 'dirty' }
  | { type: 'AuditResolved'; player: PlayerId; seized: Money; fine: Money
      paidFromCash: Money; capitalised: Money }
  | { type: 'BriberyUsed'; player: PlayerId; cost: Money; effect: BriberyEffect }
  | { type: 'InsiderTradingUsed'; player: PlayerId; cost: Money
      fundedFrom: 'clean' | 'dirty' }
```

- [ ] **Step 3: Add the three underworld rejection codes**

`packages/engine/src/core/errors.ts` — extend the `RejectionCode` union:

```ts
export type RejectionCode =
  // ... existing codes unchanged ...
  | 'VENTURE_ALREADY_ACTIVE' | 'INVALID_DICE' | 'INVALID_BRIBERY_TARGET'
```

- [ ] **Step 4: Create the context test fixture builder**

`packages/engine/src/contexts/underworld/underworld.fixture.ts`. Test support only;
no production file imports it. It exists so every test below is three lines rather
than forty:

```ts
import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { ColorGroup, DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

export function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    cleanCash: 1000,
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
    dirtyActionThisRound: false,
    insiderRevealedThisRound: false,
    rerollForced: false,
    cardCancelled: false,
    ...over,
  }
}

export function makeDeed(
  id: DeedId, owner: PlayerId | 'bank' | null, over: Partial<DeedState> = {},
): DeedState {
  return {
    id,
    square: 16,
    group: 'orange' as ColorGroup,
    faceValue: 180 as Money,
    houseCost: 100 as Money,
    rentTable: [14, 70, 200, 550, 750, 950],
    owner,
    mortgaged: false,
    houses: 0,
    ...over,
  }
}

export function makeState(over: Partial<GameState> = {}): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, makePlayer(id)]),
  ) as Record<PlayerId, PlayerState>

  return {
    config: {
      turnOrder: PLAYER_IDS,
      unlockMode: 'progressive',
      winCondition: { kind: 'fixed-rounds' },
    },
    phase: 'open',
    round: 7,
    era: 2,
    activePlayer: null,
    players,
    deeds: {},
    treasury: 6000 as Money,
    housesRemaining: 32,
    hotelsRemaining: 12,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: {
      1: { order: [], drawn: 0 },
      2: { order: [], drawn: 0 },
      3: { order: [4, 9, 1], drawn: 0 },
      4: { order: [], drawn: 0 },
    },
    ...over,
  }
}

export function withPlayer(
  state: GameState, id: PlayerId, over: Partial<PlayerState>,
): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...over }
  return { ...state, players }
}

export function withDeed(state: GameState, deed: DeedState): GameState {
  return { ...state, deeds: { ...state.deeds, [deed.id]: deed } }
}

/** The clean-money identity. Unchanged by every underworld event. */
export function cleanMoneyTotal(state: GameState): Money {
  return PLAYER_IDS.reduce(
    (sum, id) => sum + state.players[id].cleanCash - state.players[id].drawnCredit,
    state.treasury,
  )
}
```

- [ ] **Step 5: Write the failing test for the venture config table and the speakeasy payouts**

`packages/engine/src/contexts/underworld/underworld.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { speakeasyPayout } from './selectors.js'

describe('venture configuration (spec section 10)', () => {
  it('holds every venture cost, duration and Heat charge in ECONOMY', () => {
    expect(ECONOMY.VENTURES.escort).toEqual({ cost: 300, rounds: 4, heat: 2 })
    expect(ECONOMY.VENTURES.numbers).toEqual({ cost: 150, rounds: 6, heat: 2 })
    expect(ECONOMY.VENTURES['chop-shop']).toEqual({ cost: 250, rounds: 4, heat: 3 })
    expect(ECONOMY.SPEAKEASY_COST).toBe(250)
    expect(ECONOMY.SPEAKEASY_HEAT).toBe(2)
  })

  it('holds every venture payout rate in ECONOMY', () => {
    expect(ECONOMY.ESCORT_RENT_SHARE).toBe(0.4)
    expect(ECONOMY.NUMBERS_PER_ROUND).toBe(60)
    expect(ECONOMY.CHOP_SHOP_PER_LANDING).toBe(150)
  })
})

describe('speakeasy payout table (spec section 10)', () => {
  it('pays the published amount for every 2d6 total', () => {
    const payouts = [
      [[1, 1], 0],
      [[1, 2], 100], [[2, 2], 100], [[2, 3], 100],
      [[3, 3], 250], [[3, 4], 250], [[4, 4], 250],
      [[4, 5], 500], [[5, 5], 500], [[5, 6], 500],
      [[6, 6], 1200],
    ] as const
    for (const [dice, expected] of payouts) {
      expect(speakeasyPayout(dice)).toBe(expected)
    }
  })

  it('has an expected payout of $294, marginally negative against the $250 cost', () => {
    let total = 0
    for (let a = 1; a <= 6; a += 1) {
      for (let b = 1; b <= 6; b += 1) total += speakeasyPayout([a, b])
    }
    expect(Math.round(total / 36)).toBe(294)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: FAIL — `./selectors.js` does not exist and `ECONOMY.VENTURES` is undefined.

- [ ] **Step 7: Add the venture constants to `config/economy.ts`**

Append inside the existing `ECONOMY` object, before the closing `} as const`. The
rebalancing note is load-bearing, not decoration — spec section 10's honeymoon
window has not been simulated the way section 4's constants have:

```ts
  /**
   * Underworld ventures. Spec section 10.
   *
   * UNDER ACTIVE REBALANCING. Unlike section 4's constants these have no Monte
   * Carlo backing — the six-round Era II honeymoon before audits begin has not
   * been simulated. They are grouped here, keyed by the same string literals the
   * events use, so retuning any venture is a one-line edit that touches no other
   * file and no test that is not about that venture.
   */
  VENTURES: {
    escort: { cost: 300 as Money, rounds: 4, heat: 2 },
    numbers: { cost: 150 as Money, rounds: 6, heat: 2 },
    'chop-shop': { cost: 250 as Money, rounds: 4, heat: 3 },
  },

  /** One-shot. Never becomes an ActiveVenture, so it is not in VENTURES. */
  SPEAKEASY_COST: 250 as Money,
  SPEAKEASY_HEAT: 2,
  /** [highest 2d6 total in the band, payout]. First band the roll fits wins. */
  SPEAKEASY_PAYOUTS: [
    [2, 0], [5, 100], [8, 250], [11, 500], [12, 1200],
  ] as readonly (readonly [number, Money])[],

  /** Escort Service: share of rent CHARGED on the runner's own deeds. Spec 19.5. */
  ESCORT_RENT_SHARE: 0.4,
  /** Numbers Racket: flat dirty cash each Settlement while running. */
  NUMBERS_PER_ROUND: 60 as Money,
  /** Chop Shop: flat dirty cash per opponent landing on the runner's deeds. */
  CHOP_SHOP_PER_LANDING: 150 as Money,

  /** Bribery is payable in DIRTY cash only. Insider trading takes either. */
  BRIBERY_COST: 200 as Money,
  BRIBERY_HEAT: 1,
  INSIDER_TRADING_COST: 100 as Money,
  INSIDER_TRADING_HEAT: 1,
  LAUNDER_HEAT: 1,
  /** Heat lost in any round with no deliberate dirty action. Spec 19.9. */
  HEAT_DECAY: 1,

  /** Era in which each underworld action unlocks. Spec section 2. */
  VENTURES_UNLOCK_ERA: 2 as Era,
  LAUNDERING_UNLOCK_ERA: 2 as Era,
  BRIBERY_UNLOCK_ERA: 2 as Era,
  INSIDER_TRADING_UNLOCK_ERA: 3 as Era,
```

- [ ] **Step 8: Write `contexts/underworld/selectors.ts`**

Money arithmetic goes through integer basis points throughout. This is not
pedantry: `0.25 + 0.05 * 2` evaluates to `0.35000000000000003` in IEEE 754, and
Task 13's laundering haircut is exactly that expression:

```ts
import type { ActiveVenture, GameState } from '../../core/state.js'
import type { DiceRoll, Era, Money, PlayerId } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'

/** A config fraction as integer basis points. Keeps money arithmetic exact. */
export function toBps(fraction: number): number {
  return Math.round(fraction * 10_000)
}

/** amount x points/10000, rounded DOWN. All money is integer dollars. */
export function applyBps(amount: Money, points: number): Money {
  return Math.floor((amount * points) / 10_000)
}

/** Era gating. `unlockMode: 'all'` is the admin setting from spec section 2. */
export function isUnlocked(state: GameState, minEra: Era): boolean {
  return state.config.unlockMode === 'all' || state.era >= minEra
}

export function activeVenture(
  state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
): ActiveVenture | undefined {
  return state.players[id].ventures.find((v) => v.kind === kind)
}

export function runsVenture(
  state: GameState, id: PlayerId, kind: ActiveVenture['kind'],
): boolean {
  return activeVenture(state, id, kind) !== undefined
}

export function speakeasyPayout(dice: DiceRoll): Money {
  const total = dice[0] + dice[1]
  for (const [highestInBand, payout] of ECONOMY.SPEAKEASY_PAYOUTS) {
    if (total <= highestInBand) return payout
  }
  return 0
}

/** The physical dice produce 1-6 on each die. Anything else is operator error. */
export function isLegal2d6(dice: DiceRoll): boolean {
  return dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)
}

/** Reveals the current era deck's top card, or null if this player has not bought it. */
export function insiderRevealedCard(state: GameState, id: PlayerId): number | null {
  if (!state.players[id].insiderRevealedThisRound) return null
  const deck = state.decks[state.era]
  return deck.order[deck.drawn] ?? null
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: PASS, both describe blocks.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/config/economy.ts packages/engine/src/core \
        packages/engine/src/contexts/underworld
git commit -m "feat(underworld): venture constants, speakeasy payout table, selectors

Venture costs, durations and payout rates are grouped in ECONOMY under an
explicit rebalancing note: unlike section 4's constants they have no Monte
Carlo backing. Money arithmetic goes through integer basis points because
0.25 + 0.05 * 2 is not 0.35 in IEEE 754."
```

- [ ] **Step 11: Write the failing test for launching a venture**

Append to `underworld.test.ts`:

```ts
import { decideUnderworld } from './decide.js'
import { reduceUnderworld } from './reduce.js'
import { cleanMoneyTotal, makeState, withPlayer } from './underworld.fixture.js'
import { isRejection } from '../../core/errors.js'

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceUnderworld, state)
}

function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`unexpected rejection: ${result.code}`)
  return result
}

describe('launching a venture', () => {
  it('charges clean cash to the Treasury, starts the timer and adds Heat', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'VentureLaunched', player: 'P1', venture: 'escort',
        cost: 300, rounds: 4, fundedFrom: 'clean' },
      { type: 'HeatChanged', player: 'P1', delta: 2, reason: 'launched escort' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(700)
    expect(after.players.P1.ventures).toEqual([{ kind: 'escort', roundsRemaining: 4 }])
    expect(after.players.P1.heat).toBe(2)
    expect(after.players.P1.dirtyActionThisRound).toBe(true)
    expect(after.treasury).toBe(6300)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('charges the Chop Shop +3 Heat rather than +2', () => {
    const events = eventsOf(decideUnderworld(makeState(), {
      type: 'LaunchVenture', player: 'P2', venture: 'chop-shop', fundedFrom: 'clean',
    }))
    expect(events[1]).toEqual({
      type: 'HeatChanged', player: 'P2', delta: 3, reason: 'launched chop-shop',
    })
  })

  it('destroys dirty cash when the venture is funded dirty, leaving the Treasury alone', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'dirty',
    })))
    expect(after.players.P1.dirtyCash).toBe(250)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('rejects a venture launched before Era II', () => {
    const state = makeState({ round: 3, era: 1 })
    const result = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('allows a venture before Era II when the admin set unlockMode to all', () => {
    const base = makeState({ round: 3, era: 1 })
    const state = { ...base, config: { ...base.config, unlockMode: 'all' as const } }
    expect(isRejection(decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    }))).toBe(false)
  })

  it('rejects relaunching a venture already running', () => {
    const state = withPlayer(makeState(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 2 }],
    })
    const result = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('VENTURE_ALREADY_ACTIVE')
  })

  it('allows two different ventures to run at once', () => {
    const state = withPlayer(makeState(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 2 }],
    })
    const after = apply(state, eventsOf(decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
    })))
    expect(after.players.P1.ventures).toEqual([
      { kind: 'escort', roundsRemaining: 2 },
      { kind: 'numbers', roundsRemaining: 6 },
    ])
  })

  it('rejects a launch the player cannot fund, naming the right pocket', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 100, dirtyCash: 100 })
    const clean = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(clean) && clean.code).toBe('INSUFFICIENT_CLEAN_CASH')
    const dirty = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'dirty',
    })
    expect(isRejection(dirty) && dirty.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('rejects a launch outside the Open phase', () => {
    const result = decideUnderworld(makeState({ phase: 'settlement' }), {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })
})
```

Add the imports this block needs to the top of the file:

```ts
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: FAIL — `./decide.js` and `./reduce.js` do not exist.

- [ ] **Step 13: Write `contexts/underworld/reduce.ts`**

The reducer for every underworld event. `HeatChanged` is the single place
`dirtyActionThisRound` is set, which is what makes spec 19.9's "automatic payouts
do not block decay" fall out for free — automatic payouts emit `DirtyCashEarned`
and never `HeatChanged`:

```ts
import type { GameState, PlayerState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'

function patch(state: GameState, id: PlayerId, over: Partial<PlayerState>): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  players[id] = { ...players[id], ...over }
  return { ...state, players }
}

function patchAll(state: GameState, over: Partial<PlayerState>): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...state.players[id], ...over }]),
  ) as Record<PlayerId, PlayerState>
  return { ...state, players }
}

export function reduceUnderworld(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'VentureLaunched': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? event.cost : 0
      const dirty = event.fundedFrom === 'dirty' ? event.cost : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
          ventures: [...p.ventures, { kind: event.venture, roundsRemaining: event.rounds }],
        }),
        treasury: state.treasury + clean,
      }
    }

    case 'VentureTicked': {
      const p = state.players[event.player]
      const ventures = p.ventures
        .map((v) => (v.kind === event.venture
          ? { kind: v.kind, roundsRemaining: event.roundsRemaining }
          : v))
        .filter((v) => v.roundsRemaining > 0)
      return patch(state, event.player, { ventures })
    }

    /** Charges the cost only. The payout arrives as DirtyCashEarned. */
    case 'SpeakeasyPlayed': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? ECONOMY.SPEAKEASY_COST : 0
      const dirty = event.fundedFrom === 'dirty' ? ECONOMY.SPEAKEASY_COST : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
        }),
        treasury: state.treasury + clean,
      }
    }

    /** The ONLY event that increases dirty cash. */
    case 'DirtyCashEarned': {
      const p = state.players[event.player]
      return patch(state, event.player, { dirtyCash: p.dirtyCash + event.amount })
    }

    case 'HeatChanged': {
      const p = state.players[event.player]
      return patch(state, event.player, {
        heat: Math.max(0, p.heat + event.delta),
        dirtyActionThisRound: p.dirtyActionThisRound || event.delta > 0,
      })
    }

    case 'PhaseAdvanced':
      return event.phase === 'open'
        ? patchAll(state, { launderedThisPhase: false })
        : state

    case 'RoundAdvanced':
      return patchAll(state, {
        briberyUsedThisRound: false,
        dirtyActionThisRound: false,
        insiderRevealedThisRound: false,
        rerollForced: false,
        cardCancelled: false,
      })

    default:
      return state
  }
}
```

- [ ] **Step 14: Write `contexts/underworld/decide.ts` with the venture launch branch**

```ts
import type { ActiveVenture, GameState } from '../../core/state.js'
import type { BriberyEffect, GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import type { DiceRoll, Money, PlayerId } from '../../core/types.js'
import { reject } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import { isUnlocked, runsVenture, speakeasyPayout, isLegal2d6 } from './selectors.js'

export type UnderworldCommand =
  | { readonly type: 'LaunchVenture'; readonly player: PlayerId
      readonly venture: ActiveVenture['kind']; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'PlaySpeakeasy'; readonly player: PlayerId
      readonly dice: DiceRoll; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'LaunderCash'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'Bribe'; readonly player: PlayerId; readonly effect: BriberyEffect }
  | { readonly type: 'InsiderTrade'; readonly player: PlayerId
      readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'RunAuditChecks'
      readonly dice: Readonly<Partial<Record<PlayerId, DiceRoll>>> }

/** Shared funding guard. Returns a Rejection or null. */
function checkFunds(
  state: GameState, player: PlayerId, cost: Money, from: 'clean' | 'dirty', what: string,
): Rejection | null {
  const p = state.players[player]
  if (from === 'clean' && p.cleanCash < cost) {
    return reject('INSUFFICIENT_CLEAN_CASH',
      `${what} costs $${cost} and you hold $${p.cleanCash} in clean cash.`)
  }
  if (from === 'dirty' && p.dirtyCash < cost) {
    return reject('INSUFFICIENT_DIRTY_CASH',
      `${what} costs $${cost} and you hold $${p.dirtyCash} in dirty cash.`)
  }
  return null
}

function decideLaunchVenture(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'LaunchVenture' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Ventures are launched during the Open phase.')
  }
  if (!isUnlocked(state, ECONOMY.VENTURES_UNLOCK_ERA)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Ventures unlock in Era II, from round 7.')
  }
  if (runsVenture(state, cmd.player, cmd.venture)) {
    return reject('VENTURE_ALREADY_ACTIVE',
      `Your ${cmd.venture} is already running. Wait for it to finish.`)
  }
  const spec = ECONOMY.VENTURES[cmd.venture]
  const funds = checkFunds(state, cmd.player, spec.cost, cmd.fundedFrom, `The ${cmd.venture}`)
  if (funds !== null) return funds

  return [
    { type: 'VentureLaunched', player: cmd.player, venture: cmd.venture,
      cost: spec.cost, rounds: spec.rounds, fundedFrom: cmd.fundedFrom },
    { type: 'HeatChanged', player: cmd.player, delta: spec.heat,
      reason: `launched ${cmd.venture}` },
  ]
}

export function decideUnderworld(
  state: GameState, command: UnderworldCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'LaunchVenture': return decideLaunchVenture(state, command)
    default: return reject('WRONG_PHASE', 'Not implemented yet.')
  }
}
```

The `default` arm is a placeholder replaced branch by branch in the steps below; it
never survives to the end of Task 13.

- [ ] **Step 15: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: PASS — all nine launch assertions, including the clean-money identity.

- [ ] **Step 16: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): venture launch, funding and Heat accrual

Ventures are payable in clean or dirty cash; clean costs flow to the
Treasury and dirty costs are destroyed, which is what keeps the clean-money
identity intact while dirty cash is created ex nihilo."
```

- [ ] **Step 17: Write the failing test for spec 19.5 — ventures pay the deed's owner**

This is the single most important behaviour in Task 12. Append to `underworld.test.ts`:

```ts
import { ventureIncomeFromRent } from './ventures.js'
import { makeDeed, withDeed } from './underworld.fixture.js'

describe('venture income follows the deed, not the cashflow (spec 19.5)', () => {
  /** P1 owns St James Place. P2 holds a rent future on it. P3 lands and pays P2. */
  function tableWithFuture(): GameState {
    return withDeed(makeState({ phase: 'movement' }),
      makeDeed('st-james-place', 'P1'))
  }

  const rent = {
    type: 'RentCharged', from: 'P3', to: 'P2', deed: 'st-james-place', amount: 250,
  } as const

  it('pays the Escort Service bonus to the OWNER even though the future holder receives the rent', () => {
    const state = withPlayer(tableWithFuture(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 100, source: 'escort' },
    ])
  })

  it('pays a futures holder nothing from a deed they do not own', () => {
    const state = withPlayer(tableWithFuture(), 'P2', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([])
  })

  it('pays the Chop Shop a flat $150 to the owner, independent of the rent charged', () => {
    const base = withPlayer(tableWithFuture(), 'P1', {
      ventures: [{ kind: 'chop-shop', roundsRemaining: 4 }],
    })
    const cheap = { ...rent, amount: 8 } as const
    expect(ventureIncomeFromRent(base, cheap)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })

  it('pays both ventures when the owner runs both', () => {
    const state = withPlayer(tableWithFuture(), 'P1', {
      ventures: [
        { kind: 'escort', roundsRemaining: 3 },
        { kind: 'chop-shop', roundsRemaining: 4 },
      ],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 100, source: 'escort' },
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })

  it('rounds the Escort Service share DOWN to whole dollars', () => {
    const state = withPlayer(tableWithFuture(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    // 45 x 0.40 = 18.0 exactly; 47 x 0.40 = 18.8, floored to 18.
    expect(ventureIncomeFromRent(state, { ...rent, amount: 45 }))
      .toEqual([{ type: 'DirtyCashEarned', player: 'P1', amount: 18, source: 'escort' }])
    expect(ventureIncomeFromRent(state, { ...rent, amount: 47 }))
      .toEqual([{ type: 'DirtyCashEarned', player: 'P1', amount: 18, source: 'escort' }])
  })

  it('pays nothing on a deed the bank holds or nobody owns', () => {
    const unowned = withDeed(makeState({ phase: 'movement' }),
      makeDeed('st-james-place', null))
    expect(ventureIncomeFromRent(unowned, rent)).toEqual([])
  })

  it('pays nothing when Escort income would round to zero', () => {
    const state = withPlayer(tableWithFuture(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(ventureIncomeFromRent(state, { ...rent, amount: 2 })).toEqual([])
  })
})
```

- [ ] **Step 18: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: FAIL — `./ventures.js` does not exist.

- [ ] **Step 19: Write `contexts/underworld/ventures.ts`**

```ts
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { applyBps, runsVenture, toBps } from './selectors.js'

type RentCharged = Extract<GameEvent, { type: 'RentCharged' }>

/**
 * Spec 19.5. Escort Service and Chop Shop pay the DEED'S OWNER, computed on rent
 * CHARGED on deeds they own, regardless of who receives it. `rent.to` — which is
 * the futures holder whenever a contract is active — is deliberately ignored;
 * only `state.deeds[rent.deed].owner` is consulted. Selling a rent future
 * therefore does not extinguish venture income, and a futures holder earns
 * nothing from deeds they do not own.
 *
 * Called by `board` for every RentCharged event it emits. Because spec 19.2
 * suppresses the payment entirely when the futures holder lands on a deed they
 * do not own, no RentCharged event exists in that case and no venture income
 * accrues — which is correct: no rent was charged.
 */
export function ventureIncomeFromRent(
  state: GameState, rent: RentCharged,
): readonly GameEvent[] {
  const deed = state.deeds[rent.deed]
  if (deed === undefined) return []
  const owner = deed.owner
  if (owner === null || owner === 'bank') return []

  const events: GameEvent[] = []

  if (runsVenture(state, owner, 'escort')) {
    const amount = applyBps(rent.amount, toBps(ECONOMY.ESCORT_RENT_SHARE))
    if (amount > 0) {
      events.push({ type: 'DirtyCashEarned', player: owner, amount, source: 'escort' })
    }
  }

  if (runsVenture(state, owner, 'chop-shop')) {
    events.push({
      type: 'DirtyCashEarned', player: owner,
      amount: ECONOMY.CHOP_SHOP_PER_LANDING, source: 'chop-shop',
    })
  }

  return events
}

/**
 * Settlement step 2, spec 19.1: "Venture payouts accrue as dirty cash; venture
 * timers decrement." Only the Numbers Racket has a flat per-round payout — the
 * Escort Service and Chop Shop are event-driven and already paid at the moment
 * rent was charged during Movement, which precedes Settlement in the same round.
 *
 * Emission order is turn order then venture order, so replay is exact.
 */
export function settleVentures(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const id of state.config.turnOrder) {
    for (const venture of state.players[id].ventures) {
      if (venture.kind === 'numbers') {
        events.push({
          type: 'DirtyCashEarned', player: id,
          amount: ECONOMY.NUMBERS_PER_ROUND, source: 'numbers',
        })
      }
      events.push({
        type: 'VentureTicked', player: id, venture: venture.kind,
        roundsRemaining: venture.roundsRemaining - 1,
      })
    }
  }
  return events
}
```

- [ ] **Step 20: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: PASS — all seven spec 19.5 assertions.

- [ ] **Step 21: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): venture income keyed to deed ownership (spec 19.5)

Escort Service and Chop Shop read state.deeds[deed].owner and ignore
RentCharged.to entirely, so selling a rent future does not extinguish
venture income and a futures holder earns nothing from deeds they do not own."
```

- [ ] **Step 22: Write the failing test for Settlement step 2 — flat payouts and timers**

```ts
import { settleVentures } from './ventures.js'

describe('Settlement step 2: venture payouts and timers (spec 19.1)', () => {
  it('pays the Numbers Racket $60 flat and decrements every timer', () => {
    const before = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [
        { kind: 'numbers', roundsRemaining: 6 },
        { kind: 'escort', roundsRemaining: 2 },
      ],
    })
    const events = settleVentures(before)

    expect(events).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 60, source: 'numbers' },
      { type: 'VentureTicked', player: 'P1', venture: 'numbers', roundsRemaining: 5 },
      { type: 'VentureTicked', player: 'P1', venture: 'escort', roundsRemaining: 1 },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(60)
    expect(after.players.P1.ventures).toEqual([
      { kind: 'numbers', roundsRemaining: 5 },
      { kind: 'escort', roundsRemaining: 1 },
    ])
  })

  it('retires a venture on its final tick', () => {
    const before = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 1 }],
    })
    const after = apply(before, settleVentures(before))
    expect(after.players.P1.ventures).toEqual([])
  })

  it('pays a 6-round Numbers Racket exactly six times', () => {
    let state = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [{ kind: 'numbers', roundsRemaining: ECONOMY.VENTURES.numbers.rounds }],
    })
    for (let round = 0; round < 8; round += 1) state = apply(state, settleVentures(state))
    expect(state.players.P1.dirtyCash).toBe(6 * ECONOMY.NUMBERS_PER_ROUND)
    expect(state.players.P1.ventures).toEqual([])
  })

  it('emits nothing for a player with no ventures', () => {
    expect(settleVentures(makeState({ phase: 'settlement' }))).toEqual([])
  })
})
```

- [ ] **Step 23: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: PASS — `settleVentures` and the `VentureTicked` reducer arm were both
written in earlier steps, so this cycle is a characterisation test. Confirm it is
real by temporarily changing `roundsRemaining: venture.roundsRemaining - 1` to
`- 2` and seeing three tests fail, then change it back.

- [ ] **Step 24: Write the failing test for the Speakeasy**

```ts
describe('the Speakeasy (spec section 10)', () => {
  it('takes the roll from the command and never generates one', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'SpeakeasyPlayed', player: 'P1', dice: [6, 6], payout: 1200,
        fundedFrom: 'clean' },
      { type: 'DirtyCashEarned', player: 'P1', amount: 1200, source: 'speakeasy' },
      { type: 'HeatChanged', player: 'P1', delta: 2, reason: 'played the Speakeasy' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(750)
    expect(after.players.P1.dirtyCash).toBe(1200)
    expect(after.players.P1.heat).toBe(2)
    expect(after.players.P1.ventures).toEqual([])
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('takes the cost and the Heat even on a snake-eyes zero payout', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [1, 1], fundedFrom: 'clean',
    }))
    expect(events.map((e) => e.type)).toEqual(['SpeakeasyPlayed', 'HeatChanged'])
    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(750)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.heat).toBe(2)
  })

  it('rejects a roll the physical dice cannot produce', () => {
    const result = decideUnderworld(makeState(), {
      type: 'PlaySpeakeasy', player: 'P1', dice: [0, 7], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })

  it('rejects a Speakeasy the player cannot fund', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 100 })
    const result = decideUnderworld(state, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [3, 4], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_CLEAN_CASH')
  })
})
```

- [ ] **Step 25: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: FAIL — `decideUnderworld` returns the placeholder `WRONG_PHASE` rejection
for `PlaySpeakeasy`.

- [ ] **Step 26: Add the Speakeasy branch to `decide.ts`**

Insert the function and replace the dispatch arm:

```ts
function decidePlaySpeakeasy(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'PlaySpeakeasy' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'The Speakeasy is played during the Open phase.')
  }
  if (!isUnlocked(state, ECONOMY.VENTURES_UNLOCK_ERA)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Ventures unlock in Era II, from round 7.')
  }
  if (!isLegal2d6(cmd.dice)) {
    return reject('INVALID_DICE',
      `${cmd.dice[0]} and ${cmd.dice[1]} is not a legal 2d6 result.`)
  }
  const funds = checkFunds(
    state, cmd.player, ECONOMY.SPEAKEASY_COST, cmd.fundedFrom, 'The Speakeasy')
  if (funds !== null) return funds

  const payout = speakeasyPayout(cmd.dice)
  const events: GameEvent[] = [
    { type: 'SpeakeasyPlayed', player: cmd.player, dice: cmd.dice, payout,
      fundedFrom: cmd.fundedFrom },
  ]
  if (payout > 0) {
    events.push({
      type: 'DirtyCashEarned', player: cmd.player, amount: payout, source: 'speakeasy',
    })
  }
  events.push({
    type: 'HeatChanged', player: cmd.player, delta: ECONOMY.SPEAKEASY_HEAT,
    reason: 'played the Speakeasy',
  })
  return events
}
```

```ts
    case 'PlaySpeakeasy': return decidePlaySpeakeasy(state, command)
```

- [ ] **Step 27: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld.test.ts`
Expected: PASS

- [ ] **Step 28: Write the context's public interface**

`packages/engine/src/contexts/underworld/index.ts`. This is the only file other
contexts may import, per the plan's import rule:

```ts
export type { UnderworldCommand } from './decide.js'
export { decideUnderworld } from './decide.js'
export { reduceUnderworld } from './reduce.js'
export { ventureIncomeFromRent, settleVentures } from './ventures.js'
export {
  activeVenture, runsVenture, speakeasyPayout,
  insiderRevealedCard, isUnlocked, toBps, applyBps,
} from './selectors.js'
```

And add to `packages/engine/src/index.ts`:

```ts
export * from './contexts/underworld/index.js'
```

- [ ] **Step 29: Add the determinism guard test**

Append to `underworld.test.ts`. This asserts the keystone architectural property
from spec section 14 for this context specifically:

```ts
describe('determinism', () => {
  it('never generates its own randomness', () => {
    const state = makeState()
    const cmd = {
      type: 'PlaySpeakeasy', player: 'P1', dice: [2, 3], fundedFrom: 'clean',
    } as const
    const first = decideUnderworld(state, cmd)
    const second = decideUnderworld(state, cmd)
    expect(first).toEqual(second)
    expect(eventsOf(first)[0]).toMatchObject({ dice: [2, 3], payout: 100 })
  })

  it('replays to an identical state', () => {
    const before = makeState()
    const events = [
      ...eventsOf(decideUnderworld(before, {
        type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
      })),
      ...eventsOf(decideUnderworld(before, {
        type: 'PlaySpeakeasy', player: 'P2', dice: [4, 5], fundedFrom: 'clean',
      })),
    ]
    expect(apply(before, events)).toEqual(apply(before, events))
  })
})
```

- [ ] **Step 30: Run the full suite, typecheck and lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass. Lint in particular must confirm the underworld imports nothing
from `credit`.

- [ ] **Step 31: Commit**

```bash
git add packages/engine/src/contexts/underworld packages/engine/src/index.ts
git commit -m "feat(underworld): speakeasy, settlement timers and public interface

The speakeasy roll arrives on the command as data from the physical dice;
the engine reads the payout table and never rolls. Dirty cash only ever
increases through DirtyCashEarned."
```

---

### Task 13: `underworld` context — Heat, laundering and audits

**Files:**
- Modify: `packages/engine/src/contexts/underworld/selectors.ts`
- Modify: `packages/engine/src/contexts/underworld/reduce.ts`
- Modify: `packages/engine/src/contexts/underworld/decide.ts`
- Modify: `packages/engine/src/contexts/underworld/index.ts`
- Create: `packages/engine/src/contexts/underworld/audit.ts`
- Test: `packages/engine/src/contexts/underworld/underworld-heat.test.ts`

`underworld.test.ts` is at roughly 380 lines after Task 12, so Task 13's tests go
in a sibling file rather than pushing it past the 500-line limit. Settlement step 9
goes in `audit.ts` for the same reason — `decide.ts` reaches ~250 lines with the
four remaining command branches.

**Interfaces:**

- Consumes: everything Task 12 consumes, plus `ECONOMY.LAUNDER_BASE_HAIRCUT`,
  `LAUNDER_HAIRCUT_PER_HEAT`, `LAUNDER_HEAT_FREE_THRESHOLD`, `LAUNDER_MAX_HAIRCUT`,
  `AUDIT_FIRST_ROUND`, `AUDIT_FINE_PER_HEAT` — all already in Task 2's `economy.ts`.
- Produces, added to `contexts/underworld/index.ts`:
  ```ts
  export function launderHaircutBps(heat: number): number
  export function launderProceeds(dirtyIn: Money, heat: number): Money
  export function auditFine(heat: number): Money
  export function auditProbability(heat: number): number
  export function settleAudits(
    state: GameState, dice: Readonly<Partial<Record<PlayerId, DiceRoll>>>,
  ): readonly GameEvent[] | Rejection
  ```
  plus the `LaunderCash`, `Bribe`, `InsiderTrade` and `RunAuditChecks` arms of
  `decideUnderworld`.
- Consumed by later tasks: Task 4 (`session`) calls `settleAudits` as Settlement
  step 9, **strictly before** the credit context's step 10 margin flagging (spec
  19.1). Task 5 (`board`) consumes `PlayerState.rerollForced`. Task 18 (`decks`)
  consumes `PlayerState.cardCancelled` and `insiderRevealedCard`.

---

- [ ] **Step 1: Write the failing test for the laundering haircut curve**

`packages/engine/src/contexts/underworld/underworld-heat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import { decideUnderworld } from './decide.js'
import { reduceUnderworld } from './reduce.js'
import { settleAudits } from './audit.js'
import { auditFine, launderHaircutBps, launderProceeds } from './selectors.js'
import {
  cleanMoneyTotal, makeDeed, makeState, withDeed, withPlayer,
} from './underworld.fixture.js'

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceUnderworld, state)
}

function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`unexpected rejection: ${result.code}`)
  return result
}

describe('laundering haircut curve (spec section 10)', () => {
  it('charges the 25% base haircut at or below the free Heat threshold', () => {
    for (const heat of [0, 1, 2, 3]) {
      expect(launderHaircutBps(heat)).toBe(2500)
    }
  })

  it('worsens by 5 percentage points per Heat point above 3', () => {
    expect(launderHaircutBps(4)).toBe(3000)
    expect(launderHaircutBps(5)).toBe(3500)
    expect(launderHaircutBps(7)).toBe(4500)
  })

  it('caps the haircut at 60%', () => {
    expect(launderHaircutBps(10)).toBe(6000)
    expect(launderHaircutBps(11)).toBe(6000)
    expect(launderHaircutBps(40)).toBe(6000)
  })

  it('computes proceeds in integer dollars, rounded DOWN', () => {
    // 333 x 0.75 = 249.75 -> 249. Floating point would give 249.75000000000003.
    expect(launderProceeds(333, 3)).toBe(249)
    // 333 x 0.70 = 233.1 -> 233.
    expect(launderProceeds(333, 4)).toBe(233)
    expect(launderProceeds(1, 10)).toBe(0)
    expect(launderProceeds(0, 0)).toBe(0)
  })

  it('never loses a cent to IEEE 754 drift at any Heat level', () => {
    for (let heat = 0; heat <= 20; heat += 1) {
      const bps = launderHaircutBps(heat)
      expect(Number.isInteger(bps)).toBe(true)
      expect(Number.isInteger(launderProceeds(1000, heat))).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — `launderHaircutBps`, `launderProceeds` and `./audit.js` do not exist.

- [ ] **Step 3: Add the laundering and audit selectors**

Append to `contexts/underworld/selectors.ts`:

```ts
/**
 * The laundering haircut in integer basis points. Spec section 10: 25% base,
 * worsening 5 percentage points per Heat point above 3, capped at 60%.
 *
 * Basis points rather than fractions is not style. `0.25 + 0.05 * 2` evaluates
 * to 0.35000000000000003 in IEEE 754, which floors a $1,000 launder to $649
 * instead of $650.
 */
export function launderHaircutBps(heat: number): number {
  const excess = Math.max(0, heat - ECONOMY.LAUNDER_HEAT_FREE_THRESHOLD)
  const raw = toBps(ECONOMY.LAUNDER_BASE_HAIRCUT)
    + toBps(ECONOMY.LAUNDER_HAIRCUT_PER_HEAT) * excess
  return Math.min(toBps(ECONOMY.LAUNDER_MAX_HAIRCUT), raw)
}

/**
 * Clean dollars received for `dirtyIn`, rounded DOWN. `heat` is the player's
 * Heat BEFORE the transaction's +1 is applied — spec 19.9.
 */
export function launderProceeds(dirtyIn: Money, heat: number): Money {
  return applyBps(dirtyIn, 10_000 - launderHaircutBps(heat))
}

/** $100 x Heat, payable in clean cash. Spec section 10. */
export function auditFine(heat: number): Money {
  return ECONOMY.AUDIT_FINE_PER_HEAT * heat
}

/** The lowest total two dice can produce. Below it an audit check cannot fire. */
export const MIN_AUDITABLE_HEAT = 2

/**
 * P(2d6 <= heat), for the assist panel's "your audit probability this round is
 * 58%" warning in spec section 14. Counted over the 36 equally likely outcomes.
 */
export function auditProbability(heat: number): number {
  let hits = 0
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) if (a + b <= heat) hits += 1
  }
  return hits / 36
}
```

- [ ] **Step 4: Create `contexts/underworld/audit.ts` as a stub**

Enough to resolve the import so the haircut tests can go green on their own:

```ts
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'

export function settleAudits(
  _state: GameState, _dice: Readonly<Partial<Record<PlayerId, DiceRoll>>>,
): readonly GameEvent[] | Rejection {
  return []
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all five haircut assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): laundering haircut curve in integer basis points

25% base, +5pp per Heat point above 3, capped at 60%. Computed in basis
points because 0.25 + 0.05 * 2 is 0.35000000000000003 in IEEE 754."
```

- [ ] **Step 7: Write the failing test for the laundering transaction, including spec 19.9**

Append to `underworld-heat.test.ts`:

```ts
describe('laundering (spec section 10, 19.9)', () => {
  it('converts dirty to clean at the pre-transaction Heat, then charges +1 Heat', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 3 })
    const events = eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 400,
    }))

    // Spec 19.9: at Heat 3 the haircut is 25%, NOT 30%.
    expect(events).toEqual([
      { type: 'CashLaundered', player: 'P1', dirtyIn: 400, cleanOut: 300, haircut: 0.25 },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'laundering' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.cleanCash).toBe(1300)
    expect(after.players.P1.heat).toBe(4)
    expect(after.players.P1.launderedThisPhase).toBe(true)
    expect(after.players.P1.dirtyActionThisRound).toBe(true)
  })

  it('draws laundering proceeds from the Treasury so clean money is conserved', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 0 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 400,
    })))
    expect(after.treasury).toBe(6000 - 300)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('launders a partial balance', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 0 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })))
    expect(after.players.P1.dirtyCash).toBe(300)
    expect(after.players.P1.cleanCash).toBe(1075)
  })

  it('allows at most one laundering transaction per Open phase', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })))
    const second = decideUnderworld(after, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(second) && second.code).toBe('ALREADY_LAUNDERED_THIS_PHASE')
  })

  it('clears the once-per-phase lock when the next Open phase begins', () => {
    const locked = withPlayer(makeState(), 'P1', {
      dirtyCash: 400, launderedThisPhase: true,
    })
    const reopened = reduceUnderworld(locked, { type: 'PhaseAdvanced', phase: 'open' })
    expect(reopened.players.P1.launderedThisPhase).toBe(false)
    expect(isRejection(decideUnderworld(reopened, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    }))).toBe(false)
  })

  it('does not clear the lock when a non-Open phase begins', () => {
    const locked = withPlayer(makeState(), 'P1', { launderedThisPhase: true })
    const moved = reduceUnderworld(locked, { type: 'PhaseAdvanced', phase: 'movement' })
    expect(moved.players.P1.launderedThisPhase).toBe(true)
  })

  it('rejects laundering more dirty cash than the player holds', () => {
    const state = withPlayer(makeState(), 'P1', { dirtyCash: 50 })
    const result = decideUnderworld(state, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('rejects laundering outside the Open phase and before Era II', () => {
    const settling = withPlayer(makeState({ phase: 'settlement' }), 'P1', { dirtyCash: 400 })
    const wrongPhase = decideUnderworld(settling, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(wrongPhase) && wrongPhase.code).toBe('WRONG_PHASE')

    const eraOne = withPlayer(makeState({ round: 4, era: 1 }), 'P1', { dirtyCash: 400 })
    const locked = decideUnderworld(eraOne, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(locked) && locked.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })
})
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — `decideUnderworld` hits its placeholder arm for `LaunderCash` and
the reducer has no `CashLaundered` case.

- [ ] **Step 9: Add the `CashLaundered` arm to `reduce.ts`**

Insert into the switch:

```ts
    case 'CashLaundered': {
      const p = state.players[event.player]
      return {
        ...patch(state, event.player, {
          dirtyCash: p.dirtyCash - event.dirtyIn,
          cleanCash: p.cleanCash + event.cleanOut,
          launderedThisPhase: true,
        }),
        // The Treasury is the counterparty, so clean money stays conserved.
        // It may run a deficit; spec section 4 permits it explicitly.
        treasury: state.treasury - event.cleanOut,
      }
    }
```

- [ ] **Step 10: Add the `LaunderCash` branch to `decide.ts`**

```ts
function decideLaunder(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'LaunderCash' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Laundering happens during the Open phase.')
  }
  if (!isUnlocked(state, ECONOMY.LAUNDERING_UNLOCK_ERA)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Laundering unlocks in Era II, from round 7.')
  }
  const p = state.players[cmd.player]
  if (p.launderedThisPhase) {
    return reject('ALREADY_LAUNDERED_THIS_PHASE',
      'You may launder at most once per Open phase.')
  }
  if (cmd.amount <= 0 || !Number.isInteger(cmd.amount)) {
    return reject('INSUFFICIENT_DIRTY_CASH', 'Enter a whole-dollar amount above zero.')
  }
  if (p.dirtyCash < cmd.amount) {
    return reject('INSUFFICIENT_DIRTY_CASH',
      `You hold $${p.dirtyCash} in dirty cash.`)
  }

  // Spec 19.9: the haircut reads Heat BEFORE this transaction's +1.
  const haircutBps = launderHaircutBps(p.heat)
  const cleanOut = applyBps(cmd.amount, 10_000 - haircutBps)

  return [
    { type: 'CashLaundered', player: cmd.player, dirtyIn: cmd.amount, cleanOut,
      haircut: haircutBps / 10_000 },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.LAUNDER_HEAT,
      reason: 'laundering' },
  ]
}
```

Add to the imports and the dispatch:

```ts
import { applyBps, isUnlocked, launderHaircutBps, runsVenture,
         speakeasyPayout, isLegal2d6 } from './selectors.js'
```
```ts
    case 'LaunderCash': return decideLaunder(state, command)
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all eight laundering assertions.

- [ ] **Step 12: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): laundering transaction, once per Open phase

Per spec 19.9 the haircut is computed from Heat before the transaction's
+1 is applied, so laundering at Heat 3 costs 25% and not 30%. Proceeds come
from the Treasury, which keeps clean money conserved."
```

- [ ] **Step 13: Write the failing test for Heat decay (spec 19.9)**

```ts
describe('Heat decay (spec 19.9)', () => {
  it('decays 1 in a round with no deliberate dirty action', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5, dirtyActionThisRound: false,
    })
    const events = eventsOf(settleAudits(before, {}))
    expect(events).toEqual([
      { type: 'HeatChanged', player: 'P1', delta: -1,
        reason: 'no deliberate dirty action this round' },
    ])
    expect(apply(before, events).players.P1.heat).toBe(4)
  })

  it('does NOT decay in a round the player launched a venture', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5, dirtyActionThisRound: true,
    })
    expect(settleAudits(before, {})).toEqual([])
  })

  it('does NOT let an already-running venture payout block decay', () => {
    // The keystone of 19.9: a 6-round Numbers Racket must not make cooling
    // down impossible. Its payout is DirtyCashEarned, which never sets the flag.
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5,
      ventures: [{ kind: 'numbers', roundsRemaining: 4 }],
      dirtyActionThisRound: false,
    })
    const paid = apply(before, [
      { type: 'DirtyCashEarned', player: 'P1', amount: 60, source: 'numbers' },
      { type: 'VentureTicked', player: 'P1', venture: 'numbers', roundsRemaining: 3 },
    ])
    expect(paid.players.P1.dirtyActionThisRound).toBe(false)
    expect(apply(paid, eventsOf(settleAudits(paid, {}))).players.P1.heat).toBe(4)
  })

  it('does not decay Heat below zero', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', { heat: 0 })
    expect(settleAudits(before, {})).toEqual([])
  })

  it('clears the dirty-action flag when the round advances', () => {
    const acted = withPlayer(makeState(), 'P1', {
      dirtyActionThisRound: true, briberyUsedThisRound: true,
      insiderRevealedThisRound: true, rerollForced: true, cardCancelled: true,
    })
    const next = reduceUnderworld(acted, { type: 'RoundAdvanced', round: 10 })
    expect(next.players.P1).toMatchObject({
      dirtyActionThisRound: false, briberyUsedThisRound: false,
      insiderRevealedThisRound: false, rerollForced: false, cardCancelled: false,
    })
  })

  it('lets an era card reduce Heat without setting the dirty-action flag', () => {
    // Era II: "Vice squad reshuffle. All players reduce Heat by 2."
    const before = withPlayer(makeState(), 'P1', { heat: 5 })
    const after = reduceUnderworld(before, {
      type: 'HeatChanged', player: 'P1', delta: -2, reason: 'vice squad reshuffle',
    })
    expect(after.players.P1.heat).toBe(3)
    expect(after.players.P1.dirtyActionThisRound).toBe(false)
  })

  it('cools a six-round Numbers Racket from Heat 2 to Heat 0 before audits begin', () => {
    let state = withPlayer(makeState({ phase: 'settlement', round: 7 }), 'P1', {
      heat: 2, ventures: [{ kind: 'numbers', roundsRemaining: 6 }],
    })
    for (let round = 7; round <= 12; round += 1) {
      state = apply(state, eventsOf(settleAudits(state, {})))
      state = reduceUnderworld(state, { type: 'RoundAdvanced', round: round + 1 })
    }
    expect(state.players.P1.heat).toBe(0)
  })
})
```

- [ ] **Step 14: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — `settleAudits` is still the stub returning `[]`.

- [ ] **Step 15: Implement Settlement step 9 in `audit.ts`**

Replace the stub. This is Settlement step 9 in full — the audit check and the Heat
decay both live here, because both are end-of-round Heat bookkeeping and spec 19.1
lists no separate step for decay:

```ts
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'
import { reject } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import { auditFine, isLegal2d6, MIN_AUDITABLE_HEAT } from './selectors.js'

/**
 * Settlement step 9, spec 19.1. Runs every round; the audit check itself is
 * gated to round 13 onward but Heat decay is not.
 *
 * Per player, in turn order:
 *   1. From round 13, and only if Heat could actually lose to 2d6, roll the
 *      audit check. `audited` when the roll is <= Heat.
 *   2. On an audit: seize ALL dirty cash, fine $100 x Heat in clean cash, reset
 *      Heat to 0. No decay follows — Heat is already zero.
 *   3. Otherwise decay Heat by 1 if the player took no deliberate dirty action.
 *
 * The audit rolls against the Heat the player carried through the round; decay
 * is the reward carried into the next one.
 *
 * Any part of the fine the player cannot cover in clean cash capitalises into
 * their drawn credit balance, exactly as unpayable credit-line interest does in
 * spec section 5. That is what lets an audit fine trigger a margin call at step
 * 10 of the SAME Settlement, which spec 19.1 requires. The underworld does not
 * import `credit`; it moves `drawnCredit` through the AuditResolved event and
 * the credit context reads the raised balance when it flags at step 10.
 */
export function settleAudits(
  state: GameState, dice: Readonly<Partial<Record<PlayerId, DiceRoll>>>,
): readonly GameEvent[] | Rejection {
  const events: GameEvent[] = []
  const auditsActive = state.round >= ECONOMY.AUDIT_FIRST_ROUND

  for (const id of state.config.turnOrder) {
    const p = state.players[id]

    if (auditsActive && p.heat >= MIN_AUDITABLE_HEAT) {
      const roll = dice[id]
      if (roll === undefined) {
        return reject('INVALID_DICE',
          `${id} is carrying Heat ${p.heat} and needs a 2d6 audit roll.`)
      }
      if (!isLegal2d6(roll)) {
        return reject('INVALID_DICE',
          `${id}'s audit roll ${roll[0]} and ${roll[1]} is not a legal 2d6 result.`)
      }

      const audited = roll[0] + roll[1] <= p.heat
      events.push({ type: 'AuditChecked', player: id, dice: roll, heat: p.heat, audited })

      if (audited) {
        const fine = auditFine(p.heat)
        const paidFromCash = Math.min(fine, Math.max(0, p.cleanCash))
        events.push({
          type: 'AuditResolved', player: id,
          seized: p.dirtyCash, fine,
          paidFromCash, capitalised: fine - paidFromCash,
        })
        continue
      }
    }

    if (p.heat > 0 && !p.dirtyActionThisRound) {
      events.push({
        type: 'HeatChanged', player: id, delta: -ECONOMY.HEAT_DECAY,
        reason: 'no deliberate dirty action this round',
      })
    }
  }

  return events
}
```

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all seven decay assertions, including the six-round cool-down.

- [ ] **Step 17: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): Heat decay at Settlement step 9

Decay is blocked only by a deliberate dirty action, which is exactly the set
of actions that emit a positive HeatChanged. An already-running venture pays
through DirtyCashEarned and never blocks decay, per spec 19.9."
```

- [ ] **Step 18: Write the failing test for audit checks and resolution**

```ts
describe('audit checks (spec section 10, 19.1)', () => {
  const auditRound = { phase: 'settlement' as const, round: ECONOMY.AUDIT_FIRST_ROUND }

  it('does not check before round 13', () => {
    const before = withPlayer(
      makeState({ phase: 'settlement', round: 12 }), 'P1', { heat: 9, dirtyCash: 500 })
    const events = eventsOf(settleAudits(before, { P1: [1, 1] }))
    expect(events.some((e) => e.type === 'AuditChecked')).toBe(false)
  })

  it('audits when the roll is at or below Heat, seizing all dirty cash', () => {
    const before = withPlayer(makeState(auditRound), 'P1', {
      heat: 7, dirtyCash: 640, cleanCash: 1000,
    })
    const events = eventsOf(settleAudits(before, { P1: [3, 4] }))

    expect(events).toEqual([
      { type: 'AuditChecked', player: 'P1', dice: [3, 4], heat: 7, audited: true },
      { type: 'AuditResolved', player: 'P1', seized: 640, fine: 700,
        paidFromCash: 700, capitalised: 0 },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.heat).toBe(0)
    expect(after.treasury).toBe(6700)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('does not audit when the roll exceeds Heat, and decays instead', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 5, dirtyCash: 640 })
    const events = eventsOf(settleAudits(before, { P1: [4, 4] }))
    expect(events).toEqual([
      { type: 'AuditChecked', player: 'P1', dice: [4, 4], heat: 5, audited: false },
      { type: 'HeatChanged', player: 'P1', delta: -1,
        reason: 'no deliberate dirty action this round' },
    ])
    expect(apply(before, events).players.P1.dirtyCash).toBe(640)
  })

  it('skips the roll entirely for a player 2d6 cannot reach', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 1 })
    const events = eventsOf(settleAudits(before, {}))
    expect(events.some((e) => e.type === 'AuditChecked')).toBe(false)
    expect(apply(before, events).players.P1.heat).toBe(0)
  })

  it('rejects a Settlement missing a roll for a player who needs one', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 4 })
    const result = settleAudits(before, {})
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })

  it('checks every player in turn order', () => {
    let state = withPlayer(makeState(auditRound), 'P1', { heat: 2, dirtyCash: 100 })
    state = withPlayer(state, 'P3', { heat: 12, dirtyCash: 900 })
    const events = eventsOf(settleAudits(state, { P1: [1, 2], P3: [6, 5] }))
    expect(events.map((e) => `${e.type}:${'player' in e ? e.player : ''}`)).toEqual([
      'AuditChecked:P1', 'HeatChanged:P1', 'AuditChecked:P3', 'AuditResolved:P3',
    ])
  })

  it('seizes dirty cash without adding it to the Treasury', () => {
    const before = withPlayer(makeState(auditRound), 'P1', {
      heat: 3, dirtyCash: 500, cleanCash: 1000,
    })
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 1] })))
    // Fine $300 to the Treasury; the $500 dirty is destroyed, never banked.
    expect(after.treasury).toBe(6300)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })
})
```

- [ ] **Step 19: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — the reducer has no `AuditResolved` case, so nothing moves.

- [ ] **Step 20: Add the `AuditChecked` and `AuditResolved` arms to `reduce.ts`**

```ts
    /** The check itself moves nothing. AuditResolved carries every consequence. */
    case 'AuditChecked':
      return state

    case 'AuditResolved': {
      const p = state.players[event.player]
      return {
        ...patch(state, event.player, {
          dirtyCash: 0,
          cleanCash: p.cleanCash - event.paidFromCash,
          drawnCredit: p.drawnCredit + event.capitalised,
          heat: 0,
        }),
        // The whole fine reaches the Treasury; the bank advances whatever the
        // player could not cover. Seized dirty cash is destroyed, not banked —
        // it was never part of the clean money supply.
        treasury: state.treasury + event.fine,
      }
    }
```

- [ ] **Step 21: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all seven audit assertions.

- [ ] **Step 22: Write the failing test for the audit-fine-triggers-margin-call interaction**

This is the test spec 19.1 exists for. It proves the step 9 / step 10 ordering is
observable, which is the whole reason the spec pins the sequence:

```ts
/**
 * Mirrors the credit context's borrowingBase selector (Task 9): 75% of
 * unmortgaged deed face value + 50% of building cost. Computed locally because
 * spec section 14 forbids `underworld` from importing `credit`.
 */
function borrowingBase(state: GameState, id: PlayerId): number {
  return Object.values(state.deeds).reduce((base, deed) => {
    if (deed === undefined || deed.owner !== id || deed.mortgaged) return base
    return base
      + Math.floor(deed.faceValue * ECONOMY.DEED_ADVANCE_RATE)
      + Math.floor(deed.houses * deed.houseCost * ECONOMY.BUILDING_ADVANCE_RATE)
  }, 0)
}

describe('an audit fine triggers a margin call in the same Settlement (spec 19.1)', () => {
  /**
   * P1 owns one $400 deed, so their borrowing base is $300. They are drawn
   * $250 — comfortably inside the base — and hold $100 clean against Heat 9.
   * The $900 fine takes the $100 and capitalises the remaining $800 into the
   * drawn balance, exactly as unpayable interest does. Step 10 then sees
   * $1,050 drawn against a $300 base.
   */
  function tableOnTheEdge(): GameState {
    const state = withDeed(
      makeState({ phase: 'settlement', round: 13 }),
      makeDeed('boardwalk', 'P1', { faceValue: 400, houseCost: 200, houses: 0 }),
    )
    return withPlayer(state, 'P1', {
      heat: 9, dirtyCash: 300, cleanCash: 100, drawnCredit: 250,
    })
  }

  it('leaves the player inside their borrowing base before the audit', () => {
    const before = tableOnTheEdge()
    expect(borrowingBase(before, 'P1')).toBe(300)
    expect(before.players.P1.drawnCredit).toBeLessThanOrEqual(borrowingBase(before, 'P1'))
  })

  it('capitalises the unpayable part of the fine into the drawn balance', () => {
    const before = tableOnTheEdge()
    const events = eventsOf(settleAudits(before, { P1: [1, 3] }))

    expect(events[1]).toEqual({
      type: 'AuditResolved', player: 'P1',
      seized: 300, fine: 900, paidFromCash: 100, capitalised: 800,
    })

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(1050)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.heat).toBe(0)
  })

  it('leaves the player OVER their borrowing base, which step 10 must flag', () => {
    const before = tableOnTheEdge()
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 3] })))

    const base = borrowingBase(after, 'P1')
    expect(base).toBe(300)
    expect(after.players.P1.drawnCredit).toBeGreaterThan(base)
    expect(after.players.P1.drawnCredit - base).toBe(750)
    expect(after.players.P1.marginCallFlaggedAt).toBeNull() // step 10 flags, not step 9
  })

  it('conserves clean money across the whole interaction', () => {
    const before = tableOnTheEdge()
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 3] })))
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })
})
```

Add `PlayerId` to the test file's type imports.

- [ ] **Step 23: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — step 20's reducer already capitalises. If it fails, the reducer is
adding `capitalised` to the wrong balance. Confirm the test is real by temporarily
setting `capitalised: 0` in `audit.ts` and watching three of the four fail.

- [ ] **Step 24: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): audit checks, seizure and fines at Settlement step 9

Audits roll 2d6 against Heat from round 13, seize all dirty cash, fine
\$100 x Heat and reset Heat to 0. The unpayable part of a fine capitalises
into the drawn credit balance the way unpayable interest does, which is
what lets an audit fine trigger a margin call at step 10 of the same
Settlement, as spec 19.1 requires."
```

- [ ] **Step 25: Write the failing test for bribery**

```ts
describe('bribery (spec section 10)', () => {
  function briber(over: Partial<GameState> = {}): GameState {
    return withPlayer(makeState(over), 'P1', { dirtyCash: 500 })
  }

  it('costs $200 in DIRTY cash and +1 Heat, and never touches clean cash', () => {
    const before = briber()
    const events = eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P3' },
    }))

    expect(events).toEqual([
      { type: 'BriberyUsed', player: 'P1', cost: 200,
        effect: { kind: 'force-reroll', target: 'P3' } },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'bribery' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(300)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.players.P1.heat).toBe(1)
    expect(after.players.P1.briberyUsedThisRound).toBe(true)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('rejects bribery paid from clean cash however rich the briber is', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 9999, dirtyCash: 0 })
    const result = decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('forces a re-roll by flagging the TARGET, who may be another player', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P3' },
    })))
    expect(after.players.P3.rerollForced).toBe(true)
    expect(after.players.P1.rerollForced).toBe(false)
  })

  it('cancels an era card by flagging the briber', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })))
    expect(after.players.P1.cardCancelled).toBe(true)
  })

  it('delays a margin call by exactly one round', () => {
    const before = withPlayer(briber(), 'P1', { marginCallFlaggedAt: 9 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'delay-margin-call' },
    })))
    expect(after.players.P1.marginCallFlaggedAt).toBe(10)
  })

  it('rejects delaying a margin call the player does not have', () => {
    const result = decideUnderworld(briber(), {
      type: 'Bribe', player: 'P1', effect: { kind: 'delay-margin-call' },
    })
    expect(isRejection(result) && result.code).toBe('INVALID_BRIBERY_TARGET')
  })

  it('allows one bribe per round only', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })))
    const second = decideUnderworld(after, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })
    expect(isRejection(second) && second.code).toBe('BRIBERY_ALREADY_USED')

    const nextRound = reduceUnderworld(after, { type: 'RoundAdvanced', round: 8 })
    expect(isRejection(decideUnderworld(nextRound, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    }))).toBe(false)
  })

  it('is available during Movement so a die roll can actually be re-rolled', () => {
    const state = briber({ phase: 'movement' })
    expect(isRejection(decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P2' },
    }))).toBe(false)
  })

  it('is unavailable during Settlement, so it can never race an audit', () => {
    const state = briber({ phase: 'settlement' })
    const result = decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P2' },
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })
})
```

- [ ] **Step 26: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — no `Bribe` branch and no `BriberyUsed` reducer arm.

- [ ] **Step 27: Add the `BriberyUsed` arm to `reduce.ts`**

```ts
    case 'BriberyUsed': {
      const p = state.players[event.player]
      const paid = patch(state, event.player, {
        dirtyCash: p.dirtyCash - event.cost,
        briberyUsedThisRound: true,
      })
      switch (event.effect.kind) {
        case 'force-reroll':
          // Consumed by `board`, which discards the target's next roll.
          return patch(paid, event.effect.target, { rerollForced: true })
        case 'cancel-card':
          // Consumed by `decks`, which must still refuse to cancel a card
          // targeting all players. Spec section 10.
          return patch(paid, event.player, { cardCancelled: true })
        case 'delay-margin-call': {
          const flagged = paid.players[event.player].marginCallFlaggedAt
          return flagged === null
            ? paid
            : patch(paid, event.player, { marginCallFlaggedAt: flagged + 1 })
        }
      }
    }
```

- [ ] **Step 28: Add the `Bribe` branch to `decide.ts`**

```ts
function decideBribe(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'Bribe' }>,
): readonly GameEvent[] | Rejection {
  // Open and Movement only. Spec section 10 forbids bribery during Settlement
  // once an audit has resolved; restricting it to the two phases where its
  // three effects are actually useful satisfies that without extra state.
  if (state.phase !== 'open' && state.phase !== 'movement') {
    return reject('WRONG_PHASE',
      'Bribery is available during the Open and Movement phases only.')
  }
  if (!isUnlocked(state, ECONOMY.BRIBERY_UNLOCK_ERA)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Bribery unlocks in Era II, from round 7.')
  }
  const p = state.players[cmd.player]
  if (p.briberyUsedThisRound) {
    return reject('BRIBERY_ALREADY_USED', 'You have already paid a bribe this round.')
  }
  if (p.dirtyCash < ECONOMY.BRIBERY_COST) {
    return reject('INSUFFICIENT_DIRTY_CASH',
      `Bribery costs $${ECONOMY.BRIBERY_COST} in dirty cash and you hold $${p.dirtyCash}.`)
  }
  if (cmd.effect.kind === 'delay-margin-call' && p.marginCallFlaggedAt === null) {
    return reject('INVALID_BRIBERY_TARGET', 'You have no margin call to delay.')
  }

  return [
    { type: 'BriberyUsed', player: cmd.player, cost: ECONOMY.BRIBERY_COST,
      effect: cmd.effect },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.BRIBERY_HEAT,
      reason: 'bribery' },
  ]
}
```
```ts
    case 'Bribe': return decideBribe(state, command)
```

- [ ] **Step 29: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all nine bribery assertions.

- [ ] **Step 30: Write the failing test for insider trading**

```ts
import { insiderRevealedCard } from './selectors.js'

describe('insider trading (spec section 10)', () => {
  const eraThree = { round: 13, era: 3 as const }

  it('costs $100 in clean cash, +1 Heat, and reveals the deck top to the buyer', () => {
    const before = makeState(eraThree)
    const events = eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'InsiderTradingUsed', player: 'P1', cost: 100, fundedFrom: 'clean' },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'insider trading' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(900)
    expect(after.players.P1.heat).toBe(1)
    expect(after.treasury).toBe(6100)
    expect(insiderRevealedCard(after, 'P1')).toBe(4)
    expect(insiderRevealedCard(after, 'P2')).toBeNull()
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('accepts dirty cash, which is then destroyed rather than banked', () => {
    const before = withPlayer(makeState(eraThree), 'P1', { dirtyCash: 250 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'dirty',
    })))
    expect(after.players.P1.dirtyCash).toBe(150)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('is locked until Era III', () => {
    const result = decideUnderworld(makeState({ round: 8, era: 2 }), {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('stops revealing the card once the round advances', () => {
    const before = makeState(eraThree)
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })))
    const next = reduceUnderworld(after, { type: 'RoundAdvanced', round: 14 })
    expect(insiderRevealedCard(next, 'P1')).toBeNull()
  })
})
```

- [ ] **Step 31: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: FAIL — no `InsiderTrade` branch and no `InsiderTradingUsed` reducer arm.

- [ ] **Step 32: Add the `InsiderTradingUsed` arm to `reduce.ts`**

```ts
    case 'InsiderTradingUsed': {
      const p = state.players[event.player]
      const clean = event.fundedFrom === 'clean' ? event.cost : 0
      const dirty = event.fundedFrom === 'dirty' ? event.cost : 0
      return {
        ...patch(state, event.player, {
          cleanCash: p.cleanCash - clean,
          dirtyCash: p.dirtyCash - dirty,
          insiderRevealedThisRound: true,
        }),
        treasury: state.treasury + clean,
      }
    }
```

- [ ] **Step 33: Add the `InsiderTrade` and `RunAuditChecks` branches to `decide.ts`**

```ts
function decideInsiderTrade(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'InsiderTrade' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Insider trading happens during the Open phase.')
  }
  if (!isUnlocked(state, ECONOMY.INSIDER_TRADING_UNLOCK_ERA)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      'Insider trading unlocks in Era III, from round 13.')
  }
  const funds = checkFunds(
    state, cmd.player, ECONOMY.INSIDER_TRADING_COST, cmd.fundedFrom, 'Insider trading')
  if (funds !== null) return funds

  return [
    { type: 'InsiderTradingUsed', player: cmd.player,
      cost: ECONOMY.INSIDER_TRADING_COST, fundedFrom: cmd.fundedFrom },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.INSIDER_TRADING_HEAT,
      reason: 'insider trading' },
  ]
}
```

Replace the whole dispatch, dropping the placeholder default:

```ts
export function decideUnderworld(
  state: GameState, command: UnderworldCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'LaunchVenture': return decideLaunchVenture(state, command)
    case 'PlaySpeakeasy': return decidePlaySpeakeasy(state, command)
    case 'LaunderCash': return decideLaunder(state, command)
    case 'Bribe': return decideBribe(state, command)
    case 'InsiderTrade': return decideInsiderTrade(state, command)
    case 'RunAuditChecks':
      return state.phase !== 'settlement'
        ? reject('WRONG_PHASE', 'Audit checks run during Settlement.')
        : settleAudits(state, command.dice)
  }
}
```

Add `import { settleAudits } from './audit.js'` to `decide.ts`.

- [ ] **Step 34: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — all four insider-trading assertions.

- [ ] **Step 35: Export the Task 13 surface**

Append to `contexts/underworld/index.ts`:

```ts
export { settleAudits } from './audit.js'
export {
  auditFine, auditProbability, launderHaircutBps, launderProceeds,
  MIN_AUDITABLE_HEAT,
} from './selectors.js'
```

- [ ] **Step 36: Add the audit-probability test the assist panel depends on**

```ts
import { auditProbability } from './selectors.js'

describe('audit probability (assist panel, spec section 14)', () => {
  it('reproduces the published table in spec section 10', () => {
    expect(Math.round(auditProbability(3) * 1000) / 10).toBe(8.3)
    expect(Math.round(auditProbability(5) * 1000) / 10).toBe(27.8)
    expect(Math.round(auditProbability(7) * 1000) / 10).toBe(58.3)
    expect(Math.round(auditProbability(9) * 1000) / 10).toBe(83.3)
  })

  it('is zero below Heat 2 and certain at Heat 12', () => {
    expect(auditProbability(0)).toBe(0)
    expect(auditProbability(1)).toBe(0)
    expect(auditProbability(12)).toBe(1)
  })
})
```

- [ ] **Step 37: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/contexts/underworld/underworld-heat.test.ts`
Expected: PASS — the four published percentages match exactly.

- [ ] **Step 38: Add the invariant test for the whole context**

```ts
describe('underworld invariants', () => {
  it('only ever increases dirty cash through DirtyCashEarned', () => {
    const before = withPlayer(makeState({ round: 13, era: 3 }), 'P1', {
      dirtyCash: 500, heat: 4, cleanCash: 2000,
    })
    const nonEarning: readonly GameEvent[] = [
      { type: 'VentureLaunched', player: 'P1', venture: 'numbers',
        cost: 150, rounds: 6, fundedFrom: 'dirty' },
      { type: 'SpeakeasyPlayed', player: 'P1', dice: [2, 2], payout: 100,
        fundedFrom: 'dirty' },
      { type: 'CashLaundered', player: 'P1', dirtyIn: 50, cleanOut: 35, haircut: 0.3 },
      { type: 'BriberyUsed', player: 'P1', cost: 200, effect: { kind: 'cancel-card' } },
      { type: 'InsiderTradingUsed', player: 'P1', cost: 100, fundedFrom: 'dirty' },
    ]
    for (const event of nonEarning) {
      expect(reduceUnderworld(before, event).players.P1.dirtyCash)
        .toBeLessThanOrEqual(before.players.P1.dirtyCash)
    }
  })

  it('conserves clean money across a full Era III round', () => {
    const before = withDeed(
      withPlayer(makeState({ round: 13, era: 3, phase: 'open' }), 'P1',
        { dirtyCash: 900, cleanCash: 1200, heat: 4 }),
      makeDeed('boardwalk', 'P1', { faceValue: 400 }),
    )

    let state = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'dirty',
    })))
    state = apply(state, eventsOf(decideUnderworld(state, {
      type: 'LaunderCash', player: 'P1', amount: 200,
    })))
    state = apply(state, eventsOf(decideUnderworld(state, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })))
    state = { ...state, phase: 'settlement' }
    state = apply(state, eventsOf(settleAudits(state, { P1: [1, 1] })))

    expect(cleanMoneyTotal(state)).toBe(cleanMoneyTotal(before))
    expect(state.players.P1.dirtyCash).toBe(0)
    expect(state.players.P1.heat).toBe(0)
  })
})
```

- [ ] **Step 39: Run the full suite, typecheck and lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass. Confirm no file in `contexts/underworld` exceeds 500 lines:
`wc -l packages/engine/src/contexts/underworld/*.ts`

- [ ] **Step 40: Commit**

```bash
git add packages/engine/src/contexts/underworld
git commit -m "feat(underworld): bribery, insider trading and the audit probability model

Bribery is payable in dirty cash only and deposits its three scoped effects
as player flags for board, decks and credit to consume. Insider trading takes
either currency. Dirty cash spent anywhere is destroyed rather than banked,
which is what keeps the clean-money identity exact."
```

---

## NEW EVENTS REQUIRED

Task 2's `core/events.ts`, `core/state.ts` and `core/errors.ts` must be amended
before Task 12 step 5. Every item below is applied in Task 12 steps 1-3.

### New `GameEvent` variant

| Event | Shape | Why Task 2 lacks it |
|---|---|---|
| `VentureTicked` | `{ type: 'VentureTicked'; player: PlayerId; venture: 'escort' \| 'numbers' \| 'chop-shop'; roundsRemaining: number }` | Spec 19.1 step 2 decrements venture timers every Settlement, and `ActiveVenture.roundsRemaining` is stored state. With no event for the decrement the countdown is not replayable. One event per active venture per Settlement; at most three per player. |

### Changed fields on existing variants

| Event | Change | Why |
|---|---|---|
| `VentureLaunched` | add `fundedFrom: 'clean' \| 'dirty'` | Spec section 10 makes dirty cash spendable on ventures. Dirty is worth $0 at scoring but has a positive shadow value through laundering, so which pocket pays is a real decision the log must record. |
| `SpeakeasyPlayed` | add `fundedFrom: 'clean' \| 'dirty'` | Same reason. |
| `InsiderTradingUsed` | add `fundedFrom: 'clean' \| 'dirty'` | Spec section 10 states outright: "costs $100 in clean or dirty cash". |
| `AuditResolved` | add `paidFromCash: Money` and `capitalised: Money` | The fine splits between clean cash on hand and the part that capitalises into the drawn credit balance. Both legs must be in the log for replay and for spec 19.1's margin-call interaction to be reconstructable. `fine` stays as the total. |
| `BriberyUsed` | `effect: string` becomes `effect: BriberyEffect` | The reducer must dispatch on the effect and, for `force-reroll`, on a target player id. Parsing a display string inside a reducer is not acceptable. The display string is derivable from the typed value. |

### New exported type in `core/events.ts`

```ts
export type BriberyEffect =
  | { readonly kind: 'force-reroll'; readonly target: PlayerId }
  | { readonly kind: 'cancel-card' }
  | { readonly kind: 'delay-margin-call' }
```

### New `PlayerState` fields in `core/state.ts`

| Field | Type | Why |
|---|---|---|
| `dirtyActionThisRound` | `boolean` | Spec 19.9's decay rule needs to know whether the player took a *deliberate* dirty action. Set by the reducer on any `HeatChanged` with a positive delta, which is exactly the set of deliberate actions — so automatic venture payouts cannot block decay by construction. |
| `insiderRevealedThisRound` | `boolean` | The card reveal is per-buyer and lasts the round. `insiderRevealedCard` reads it. |
| `rerollForced` | `boolean` | Where the `force-reroll` bribe lands. Consumed by `board` (Task 5). |
| `cardCancelled` | `boolean` | Where the `cancel-card` bribe lands. Consumed by `decks` (Task 18). |

### New `RejectionCode` values in `core/errors.ts`

`VENTURE_ALREADY_ACTIVE`, `INVALID_DICE`, `INVALID_BRIBERY_TARGET`.

### New `ECONOMY` keys in `config/economy.ts`

`VENTURES`, `SPEAKEASY_COST`, `SPEAKEASY_HEAT`, `SPEAKEASY_PAYOUTS`,
`ESCORT_RENT_SHARE`, `NUMBERS_PER_ROUND`, `CHOP_SHOP_PER_LANDING`, `BRIBERY_COST`,
`BRIBERY_HEAT`, `INSIDER_TRADING_COST`, `INSIDER_TRADING_HEAT`, `LAUNDER_HEAT`,
`HEAT_DECAY`, `VENTURES_UNLOCK_ERA`, `LAUNDERING_UNLOCK_ERA`, `BRIBERY_UNLOCK_ERA`,
`INSIDER_TRADING_UNLOCK_ERA`. Added in Task 12 step 7 under an explicit
rebalancing note; the venture rows are keyed by the same literals the events use
so retuning a venture is a one-line edit.

---

## JUDGMENT CALLS

Each of these resolves a point the spec leaves open. Each is a one-line change if
the resolution is wrong.

1. **The audit fine capitalises into drawn credit.** Spec 19.1 states an audit
   fine "can and should trigger a margin call in the same Settlement", but a
   margin call is defined in section 5 purely as drawn balance exceeding
   borrowing base — paying a fine from clean cash moves neither. The only
   mechanism that makes 19.1's sentence true is the fine raising the drawn
   balance, which section 5 already licenses for unpayable credit interest
   ("the interest capitalises into the drawn balance"). Task 13 extends that to
   the audit fine. Spec 19.8's "an audit fine ... becomes distressed debt
   immediately" is then reached one step later through section 5's stated
   sequence — credit, then liquidation, then distressed debt — for a player
   whose credit line cannot absorb it. **`credit` (Tasks 9-10) must confirm this
   reading**; if it instead routes the shortfall straight to distressed debt,
   change `capitalised` to emit `DistressedDebtIncurred` and 19.1's interaction
   disappears.

2. **Heat decay runs after the audit check, inside Settlement step 9.** Spec 19.1
   lists no step for decay. Placing it at the end of step 9 means the audit rolls
   against the Heat the player carried through the round and cooling is the
   reward carried into the next one. Decay-before-audit is the alternative and
   would buy a point of protection in the same round the player went quiet.

3. **Escort and Chop Shop key off the `RentCharged` event.** Spec 19.5 says both
   are "calculated on rent *charged* on deeds they own". Two consequences follow
   that the spec does not spell out: a mortgaged deed collects no rent, so it
   pays no Chop Shop bonus even though an opponent physically landed on it; and
   under 19.2, when a futures holder lands on a deed they do not own no payment
   occurs at all, so no rent is charged and no venture income accrues. Both are
   tested explicitly.

4. **Escort and Chop Shop pay at the moment of the rent, during Movement;
   Numbers Racket pays at Settlement step 2.** Spec 19.1 step 2 says "venture
   payouts accrue as dirty cash", but the event-driven ventures have a natural
   trigger and the flat one does not. Both land in the same round either way,
   since Movement precedes Settlement. Alternative: accumulate escort and chop
   income in a state field and pay it all at step 2 — more state, same numbers.

5. **One venture of each kind per player at a time; different kinds run
   concurrently.** The spec is silent. Relaunching a running venture is rejected
   with `VENTURE_ALREADY_ACTIVE`.

6. **Bribery is available in the Open and Movement phases only.** Spec section 10
   says it "cannot be used during Settlement after an audit has already
   resolved". Barring it from Settlement outright satisfies that without a
   per-Settlement audit-resolved flag, and none of the three effects needs a
   Settlement window: delaying a margin call is done in the next Open phase,
   inside the cure window spec section 5 grants.

7. **Insider trading is unlimited per round.** The spec caps bribery ("once per
   round per player") and laundering ("at most once per Open phase") but says
   nothing about insider trading. At $100 and +1 Heat each, repeat purchases are
   self-limiting — and after the first, the reveal is already known.

8. **Audit rolls are skipped for players below Heat 2.** Two dice cannot total
   less than 2, so the check provably cannot fire. The decider rejects with
   `INVALID_DICE` if a roll is missing for any player at Heat 2 or above, and
   ignores rolls supplied for players below it. This removes roughly half the
   physical rolls from a late-game Settlement with no change to any outcome.

9. **Seized dirty cash is destroyed; the fine goes to the Treasury; laundering
   proceeds come from the Treasury.** The spec does not name a counterparty for
   any of the three. Dirty cash cannot be inside the money-conservation pool of
   spec section 15 because ventures create it from nothing, so the boundary
   crossings need a clean-side counterparty and the Treasury is the only
   candidate — it already runs a deficit by design (section 4). This makes
   `Σ cleanCash − Σ drawnCredit + treasury` invariant across every underworld
   event, which Task 20's property suite can assert directly.

10. **Bribery's `cancel-card` restriction is enforced by `decks`, not here.**
    Spec section 10 forbids cancelling a card that targets all players.
    `underworld` cannot see card targeting without importing `decks`, which the
    section 14 dependency graph does not permit, so it sets `cardCancelled` and
    Task 18 must refuse to honour it against an all-player card.

11. **All money rounds down.** `Math.floor` on the Escort share, on laundering
    proceeds, and on the locally-computed borrowing base in the margin-call test.
    Haircut arithmetic runs in integer basis points throughout, because
    `0.25 + 0.05 * 2` is `0.35000000000000003` in IEEE 754 and would floor a
    $1,000 launder to $649 instead of $650.
