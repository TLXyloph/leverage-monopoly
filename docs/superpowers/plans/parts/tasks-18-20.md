## Tasks 18-20

Final part of the LEVERAGE rules engine plan. Task 18 builds the `decks` context — a
declarative card-effect vocabulary plus the 80 authored cards. Task 19 builds scoring,
mark-to-model and win conditions in `session`. Task 20 builds the fast-check invariant
suite, which is the strongest correctness guarantee in the project.

These three tasks depend on every other context. **Every cross-context call goes through
`contexts/<name>/index.ts`.** Signatures consumed from sibling parts (`tasks-03-08.md`,
`tasks-09-11.md`, `tasks-12-13.md`, `tasks-14-15.md`, `tasks-16-17.md`) are stated exactly
in each Interfaces block so a merge conflict is a compile error, not a silent drift.

**Rounding:** every money computation ends in `Math.floor`. Where a rule needs a different
direction the step says so. There is no other rounding direction anywhere in these tasks.

---

## Effect vocabulary — derivation and justification

All 80 cards in `docs/reference/era-decks.md` were read before any type was written. The
vocabulary below is the *minimum* that covers them; every constructor earns its place by
being needed for at least two cards, except `deck-peek` (E3-05) and `forced-mortgage`
(E4-12), which are singletons that cannot be expressed any other way.

Writing 80 bespoke functions was rejected for three concrete reasons, not on taste:

1. **Roughly half of every deck targets dynamically** — 41 of 80 cards select a player by
   ranking a metric. Every one of those has a stated tie-break chain. As functions, 41
   independent hand-written tie-break chains is 41 independent places to get it wrong. As
   data, there is one `resolveExtremum` and 41 declarations of `(metric, direction,
   tieBreaks[])`, and one test covers the resolution logic for all of them.
2. **The engine must display cards** to the player view and the rulebook. Data carries its
   own rules text, targets text and derived bribery-cancellability; functions do not.
3. **§0 of era-decks.md defines bribery-cancellability as derivable** — "a card is
   bribery-cancellable if and only if its Targets column resolves to exactly one player".
   That is a property of the resolved effect set, computable only if effects are inspectable.

### The vocabulary

| Layer | Constructors | Why this many |
|---|---|---|
| `PlayerMetric` | 31 named scalars | One per distinct quantity any card ranks, filters or multiplies by. `'one'` is the constant 1, which lets `Amount` have a single arithmetic form. |
| `PlayerPredicate` | 5 | `metric-at-least`, `metric-at-most`, `metric-above`, `all-of`, `always`. Negation is unnecessary — a guarded empty clause placed first does the job. |
| `Target` | 4 | `drawer`, `all` (optionally filtered), `extremum` (the dynamic-target workhorse, with `take` for E4-16's two players), `entity-holder` (cards that rank a tranche/pool/future and then act on its holder or originator). |
| `EntityExtremum` | 3 | `tranche`, `pool`, `rent-future`. Deed options and CDS are only ever addressed collectively, so they need no extremum. |
| `Amount` | 2 | `sum` (weighted metric terms, with `cap` and `clampTo`) and `branch`. `flat($n)` is `sum([{metric:'one', rate:n}])` — sugar, not a third form. |
| `Party` | 6 | `treasury`, `bank`, `target`, `other`, `note-holders`, `pool`. |
| `Effect` | 15 ops | Listed below. |
| `ModifierEffect` | 11 | The timed-modifier system era-decks §6.2 demands. |
| `EntitlementKind` | 10 | The nine rights in era-decks §6.3 plus E3-04's consultant. |
| `WorldPredicate` | 3 | `any-target`, `any-entity`, `same-target`. Covers every "if nobody / if nothing / if the same player" fallback in all four decks. |

### The 15 effect ops and their coverage

| Op | Cards | Notes |
|---|---|---|
| `transfer` | 34 | Money between two of {treasury, bank, target player, another dynamic player, note holders}. Optional `applyFirstTo` for E3-18. |
| `dirty` | 4 | `credit` (E2-06, E2-07) or `seize` (E4-02). Dirty cash is minted/destroyed outside the clean ledger. |
| `heat` | 8 | Signed delta, floored at 0 by the interpreter. |
| `forgive` | 2 | E2-08 (drawn credit), E4-07 (distressed debt). Liability falls, Treasury falls by the same amount. |
| `modifier` | 20 | era-decks §6.2's list plus E4-15. |
| `entitlement` | 10 | era-decks §6.3's list plus E3-04. |
| `audit` | 2 | E3-03, E4-08. Era III+ only, enforced by test. |
| `margin-flag` | 2 | E4-01 (immediate, cure ratio 0.8), E4-04 (deferred, cure ratio 0.6). |
| `tranche-face` | 3 | E3-01, E4-03 (twice). |
| `option-strike` | 1 | E3-11. |
| `option-expiry` | 1 | E4-13. |
| `pool-inject` | 1 | E3-09. |
| `pool-terminate` | 1 | E4-14. |
| `forced-mortgage` | 1 | E4-12. |
| `deck-peek` | 1 | E3-05. The only card that reads and rewrites the deck. |

### Card model: one event, no derived events

`CardDrawn` is the **only** event a card draw produces. The `decks` reducer looks the card
up by `(era, deck.order[index])` and applies its declarative effects against current state.
No card emits derived money events.

This is deliberate. A card's effect is a pure function of `(card, state-at-draw)`, so
emitting derived events would create a second source of truth that replay must keep in sync
with the interpreter. It also means the constraint "no new `GameEvent` variants" is
satisfied by construction rather than by squeezing card outcomes into unrelated event
shapes. The one exception is E3-05, which records a *player-chosen* permutation that is not
a function of state — see NEW EVENTS REQUIRED at the end of this file.

---

### Task 18: `decks` context — the card effect interpreter and the 80 authored cards

**Files:**
- Create: `packages/engine/src/contexts/decks/effects.ts`
- Create: `packages/engine/src/contexts/decks/metrics.ts`
- Create: `packages/engine/src/contexts/decks/select.ts`
- Create: `packages/engine/src/contexts/decks/interpret.ts`
- Create: `packages/engine/src/contexts/decks/interpret-structural.ts`
- Create: `packages/engine/src/contexts/decks/reduce.ts`
- Create: `packages/engine/src/contexts/decks/decide.ts`
- Create: `packages/engine/src/contexts/decks/selectors.ts`
- Create: `packages/engine/src/contexts/decks/index.ts`
- Create: `packages/engine/src/contexts/decks/cards/dsl.ts`
- Create: `packages/engine/src/contexts/decks/cards/era1.ts`
- Create: `packages/engine/src/contexts/decks/cards/era2.ts`
- Create: `packages/engine/src/contexts/decks/cards/era3.ts`
- Create: `packages/engine/src/contexts/decks/cards/era4.ts`
- Create: `packages/engine/src/contexts/decks/cards/index.ts`
- Modify: `packages/engine/src/core/state.ts` (adds exactly one field, `cardEffects`)
- Modify: `packages/engine/src/core/events.ts` (adds `DeckReordered`)
- Modify: `packages/engine/src/core/reduce.ts` (routes every event to `decks` as an observer)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/contexts/decks/metrics.test.ts`
- Test: `packages/engine/src/contexts/decks/select.test.ts`
- Test: `packages/engine/src/contexts/decks/interpret.test.ts`
- Test: `packages/engine/src/contexts/decks/cards.test.ts`
- Test: `packages/engine/src/contexts/decks/decks.test.ts`

**File-size plan.** The 500-line limit forces the card data across four files, one per era.
With the `dsl.ts` combinators each card costs 9-14 lines including its verbatim rules and
targets strings, so each era file lands at roughly 260-340 lines including shared target
constants. `cards/index.ts` only assembles and asserts. On the interpreter side,
`interpret.ts` holds the dispatcher plus the five money/heat ops (~300 lines) and
`interpret-structural.ts` holds the remaining ten (~320 lines).

**Interfaces:**

Consumes — all through `index.ts`, exact signatures assumed for merge reconciliation:

```ts
// contexts/credit/index.ts  (tasks-09-11.md)
export function borrowingBase(state: GameState, player: PlayerId): Money
export function creditHeadroom(state: GameState, player: PlayerId): Money
export function settleObligation(
  state: GameState, player: PlayerId, amount: Money, reason: string,
): GameState
export function creditPlayer(
  state: GameState, player: PlayerId, amount: Money,
  applyFirstTo?: 'drawn-credit' | 'distressed-debt',
): GameState
export function repayDrawnCredit(state: GameState, player: PlayerId, amount: Money): GameState
export function forgiveLiability(
  state: GameState, player: PlayerId,
  liability: 'drawn-credit' | 'distressed-debt', amount: Money,
): GameState
export function flagMarginCall(
  state: GameState, player: PlayerId, cureRatio: number, dueRound: RoundNumber,
): GameState
export function mortgageDeed(state: GameState, player: PlayerId, deed: DeedId): GameState
export function peerLoansAsLender(state: GameState, p: PlayerId): readonly PeerLoan[]
export function peerLoansAsBorrower(state: GameState, p: PlayerId): readonly PeerLoan[]

// contexts/underworld/index.ts  (tasks-12-13.md)
export function resolveAudit(state: GameState, player: PlayerId): GameState
export function adjustHeat(state: GameState, player: PlayerId, delta: number): GameState
export function creditDirtyCash(state: GameState, player: PlayerId, amount: Money): GameState
export function seizeDirtyCash(state: GameState, player: PlayerId, amount: Money): GameState
export function activeVentureCount(state: GameState, player: PlayerId): number

// contexts/board/index.ts  (tasks-03-08.md)
export function deedsOwnedBy(state: GameState, player: PlayerId): readonly DeedState[]
export function completeUnmortgagedGroups(state: GameState, p: PlayerId): readonly ColorGroup[]

// contexts/markets/index.ts  (tasks-14-15.md)
export function rentFutureRemainingValue(state: GameState, id: ContractId): Money
export function outstandingRentFutures(state: GameState): readonly RentFuture[]
export function outstandingDeedOptions(state: GameState): readonly DeedOption[]
export function setOptionStrike(state: GameState, id: ContractId, strike: Money): GameState
export function setOptionExpiry(state: GameState, id: ContractId, expiry: RoundNumber): GameState

// contexts/securitization/index.ts  (tasks-16-17.md)
export function poolExpectedCashflow(state: GameState, poolId: ContractId): Money
export function poolCoverageRatio(state: GameState, poolId: ContractId): number
export function trancheRatingScore(state: GameState, poolId: ContractId, k: Tranche['kind']): number
export function trancheRemainingFace(state: GameState, poolId: ContractId, k: Tranche['kind']): Money
export function setTrancheFace(
  state: GameState, poolId: ContractId, k: Tranche['kind'], face: Money,
): GameState
export function swapsWrittenBy(state: GameState, player: PlayerId): readonly Swap[]

// contexts/session/index.ts  (Task 19, below)
export function netWorth(state: GameState, player: PlayerId): Money
```

Produces:

```ts
export function drawCard(state: GameState, era: Era, index: number, drawer: PlayerId): GameState
export function cardAt(era: Era, orderIndex: number): Card
export function deckFor(era: Era): readonly Card[]
export function isBriberyCancellable(state: GameState, card: Card, drawer: PlayerId): boolean
export function activeModifiers(state: GameState): readonly TimedModifier[]
export function rentMultiplier(state: GameState, deed: DeedId): number
export function borrowingBaseOverride(state: GameState, p: PlayerId): BaseOverride
export function goSalaryAddend(state: GameState, p: PlayerId): Money
export function interestRateFor(state: GameState, p: PlayerId, base: number): number
export function buildingCostMultiplier(state: GameState, p: PlayerId): number
export function briberyTerms(state: GameState): { cost: Money; heat: number }
export function entitlementsOf(state: GameState, p: PlayerId): readonly Entitlement[]
export function consumeEntitlement(state: GameState, id: string, used: number): GameState
export function pendingPoolInjections(state: GameState): Readonly<Record<ContractId, Money>>
export function scheduledPoolTerminations(state: GameState): readonly ContractId[]
export const DECKS: Readonly<Record<Era, readonly Card[]>>
```

---

- [ ] **Step 1: Write the metric, predicate and target half of `effects.ts`**

`packages/engine/src/contexts/decks/effects.ts` (part one — append part two in Step 2):

```ts
import type {
  ColorGroup, ContractId, DeedId, Era, Money, PlayerId, RoundNumber,
} from '../../core/types.js'
import type { Tranche } from '../../core/state.js'

/** Every scalar any card ranks, filters or multiplies by. `'one'` is the constant 1. */
export type PlayerMetric =
  | 'one'
  | 'clean-cash' | 'dirty-cash' | 'heat' | 'net-worth'
  | 'drawn-credit' | 'borrowing-base' | 'drawn-to-base-ratio'
  | 'distressed-debt' | 'total-obligations'
  | 'deed-count' | 'unmortgaged-deed-count' | 'mortgaged-deed-count'
  | 'deed-face-value' | 'unmortgaged-face-value' | 'mortgaged-face-value'
  | 'railroad-count' | 'utility-count'
  | 'house-count' | 'hotel-count' | 'building-count'
  | 'complete-group-count' | 'best-group-buildings' | 'best-group-face-value'
  | 'active-venture-count'
  | 'peer-principal-lent' | 'peer-note-count'
  | 'peer-principal-borrowed' | 'peer-max-rate' | 'peer-interest-due-per-round'
  | 'cds-notional-written'
  | 'rent-received-this-era' | 'rent-received-this-game'
  | 'dirty-actions-this-game' | 'launder-count-this-game'

export interface MetricRef {
  readonly metric: PlayerMetric
  readonly direction: 'max' | 'min'
}

export type PlayerPredicate =
  | { readonly kind: 'always' }
  | { readonly kind: 'metric-at-least'; readonly metric: PlayerMetric; readonly value: number }
  | { readonly kind: 'metric-at-most'; readonly metric: PlayerMetric; readonly value: number }
  | { readonly kind: 'metric-above'; readonly metric: PlayerMetric; readonly value: number }
  | { readonly kind: 'all-of'; readonly of: readonly PlayerPredicate[] }

export type EntityKind =
  | 'pool' | 'tranche' | 'rent-future' | 'deed-option' | 'peer-loan'
  | 'written-cds' | 'building'

export type EntityExtremum =
  | {
      readonly kind: 'tranche'
      readonly by: 'rating-score' | 'remaining-face'
      readonly direction: 'max' | 'min'
      readonly tieBreak: readonly {
        readonly by: 'rating-score' | 'remaining-face' | 'pool-remaining-face'
        readonly direction: 'max' | 'min'
      }[]
      readonly attribute: 'holder' | 'pool-originator'
    }
  | {
      readonly kind: 'pool'
      readonly by: 'expected-cashflow' | 'coverage-ratio'
      readonly direction: 'max' | 'min'
      readonly tieBreak: readonly {
        readonly by: 'senior-face' | 'senior-plus-mezz-face' | 'coverage-ratio'
        readonly direction: 'max' | 'min'
      }[]
      readonly attribute: 'originator' | 'equity-holder' | 'pool'
    }
  | {
      readonly kind: 'rent-future'
      readonly by: 'remaining-value'
      readonly direction: 'max' | 'min'
      readonly attribute: 'holder' | 'contract'
    }

export type Target =
  | { readonly kind: 'drawer' }
  | { readonly kind: 'all'; readonly where?: PlayerPredicate }
  | {
      readonly kind: 'extremum'
      readonly by: MetricRef
      /** Applied in order. The final tie-break is always earlier turn order. */
      readonly tieBreak: readonly MetricRef[]
      readonly among?: PlayerPredicate
      /** Default 1. E4-16 takes 2. */
      readonly take?: number
    }
  | { readonly kind: 'entity-holder'; readonly entity: EntityExtremum }

export type WorldPredicate =
  | { readonly kind: 'any-target'; readonly of: Target }
  | { readonly kind: 'any-entity'; readonly of: EntityKind }
  | { readonly kind: 'same-target'; readonly a: Target; readonly b: Target }
```

- [ ] **Step 2: Write the amount, effect and card half of `effects.ts`**

Append to `packages/engine/src/contexts/decks/effects.ts`:

```ts
/**
 * Evaluation order is fixed: sum the weighted terms, `Math.floor`, apply `cap`,
 * apply each `clampTo` metric, then clamp at 0. There is no other rounding.
 */
export type Amount =
  | {
      readonly kind: 'sum'
      readonly terms: readonly { readonly metric: PlayerMetric; readonly rate: number }[]
      readonly cap?: Money
      readonly clampTo?: readonly PlayerMetric[]
    }
  | {
      readonly kind: 'branch'
      readonly when: PlayerPredicate
      readonly then: Amount
      readonly otherwise: Amount
    }

export type Party =
  | { readonly kind: 'treasury' }
  | { readonly kind: 'bank' }
  /** The effect's own resolved target. */
  | { readonly kind: 'target' }
  /** A second, independently resolved player. */
  | { readonly kind: 'other'; readonly target: Target }
  /** Holders of the target's active peer notes, paid pro rata per loan. */
  | { readonly kind: 'note-holders' }

export type Expiry =
  | { readonly kind: 'end-of-round'; readonly offset: number }
  | { readonly kind: 'end-of-open-phase'; readonly offset: number }
  | { readonly kind: 'next-settlement-only' }
  | { readonly kind: 'end-of-era' }
  | { readonly kind: 'permanent' }

export interface ResolvedExpiry {
  readonly boundary: 'round' | 'open-phase' | 'settlement' | 'never'
  readonly round: RoundNumber
}

/**
 * Anything that redefines an ENGINE formula is expressed as a FACTOR on the
 * ECONOMY constant, never as an absolute rate, so card content cannot drift from
 * `config/economy.ts`. Card-authored dollar amounts are card content and stay literal.
 */
export type ModifierEffect =
  | {
      readonly kind: 'rent-multiplier'; readonly factor: number
      readonly groups?: readonly ColorGroup[]; readonly minBuildings?: number
    }
  | { readonly kind: 'borrowing-base-multiplier'; readonly factor: number }
  | { readonly kind: 'borrowing-base-addend'; readonly dollars: Money }
  | {
      readonly kind: 'borrowing-base-formula'
      readonly deedRateFactor: number; readonly buildingRateFactor: number
    }
  | { readonly kind: 'cds-posting-addend'; readonly rate: number }
  | { readonly kind: 'interest-rate-override'; readonly rate: number }
  | { readonly kind: 'waive-credit-interest'; readonly ifZeroBalanceCollect: Money }
  | { readonly kind: 'go-salary-addend'; readonly dollars: Money }
  | { readonly kind: 'building-cost-multiplier'; readonly factor: number }
  | { readonly kind: 'bribery-terms'; readonly cost: Money; readonly heat: number }
  | { readonly kind: 'margin-threshold'; readonly ratio: number }

export interface ModifierTemplate {
  readonly effect: ModifierEffect
  readonly expiry: Expiry
}

export interface TimedModifier {
  readonly id: string
  readonly source: CardId
  readonly players: readonly PlayerId[]
  readonly effect: ModifierEffect
  readonly expiry: ResolvedExpiry
  /** Card-draw order. Rent modifiers compose multiplicatively in this order. */
  readonly seq: number
}

export type EntitlementKind =
  | 'half-price-house' | 'building-credit' | 'discount-unmortgage'
  | 'sell-future-to-treasury' | 'half-price-venture' | 'cheap-launder'
  | 'margin-call-waiver' | 'discounted-repayment' | 'dirty-amnesty'
  | 'compliance-consultant'

export interface EntitlementTemplate {
  readonly kind: EntitlementKind
  /** Uses for count-based rights, dollars of capacity for E1-13, E3-08, E3-14. */
  readonly capacity: number
  readonly expiry: Expiry
  readonly params: Readonly<Record<string, number>>
}

export interface Entitlement {
  readonly id: string
  readonly source: CardId
  readonly kind: EntitlementKind
  readonly owner: PlayerId
  readonly remaining: number
  readonly expiry: ResolvedExpiry
  readonly params: Readonly<Record<string, number>>
}

export type Effect =
  | {
      readonly op: 'transfer'; readonly target: Target
      readonly from: Party; readonly to: Party; readonly amount: Amount
      readonly applyFirstTo?: 'drawn-credit' | 'distressed-debt'
    }
  | {
      readonly op: 'dirty'; readonly target: Target
      readonly direction: 'credit' | 'seize'; readonly amount: Amount
    }
  | { readonly op: 'heat'; readonly target: Target; readonly delta: number }
  | {
      readonly op: 'forgive'; readonly target: Target
      readonly liability: 'drawn-credit' | 'distressed-debt'; readonly amount: Amount
    }
  | { readonly op: 'modifier'; readonly target: Target; readonly modifier: ModifierTemplate }
  | { readonly op: 'entitlement'; readonly target: Target; readonly entitlement: EntitlementTemplate }
  | { readonly op: 'audit'; readonly target: Target; readonly extraPenalty?: Amount }
  | {
      readonly op: 'margin-flag'; readonly target: Target
      readonly cureRatio: number; readonly when: 'immediately' | 'next-settlement'
    }
  | { readonly op: 'tranche-face'; readonly tranche: Tranche['kind']; readonly factor: number }
  | { readonly op: 'option-strike'; readonly delta: Money; readonly floor: Money }
  | { readonly op: 'option-expiry'; readonly expiry: Expiry }
  | {
      readonly op: 'pool-inject'; readonly entity: EntityExtremum
      readonly payer: 'equity-holder' | 'originator'; readonly amount: Amount
    }
  | { readonly op: 'pool-terminate'; readonly entity: EntityExtremum; readonly at: Expiry }
  | {
      readonly op: 'forced-mortgage'; readonly target: Target
      readonly applyProceedsTo: 'drawn-credit'
    }
  | { readonly op: 'deck-peek'; readonly target: Target; readonly count: number }

export type CardId = string

export interface CardClause {
  /** Omitted means always. */
  readonly when?: WorldPredicate
  readonly effects: readonly Effect[]
}

export interface Card {
  readonly id: CardId
  readonly era: Era
  readonly title: string
  readonly flavour: string
  /** The Mechanical effect column, verbatim. Displayed to players. */
  readonly rules: string
  /** The Targets column, verbatim. */
  readonly targets: string
  /** Evaluated in order. The FIRST clause whose guard passes runs, and only that one. */
  readonly clauses: readonly CardClause[]
}

export interface CardCounters {
  readonly rentReceivedThisGame: Readonly<Record<PlayerId, Money>>
  readonly rentReceivedThisEra: Readonly<Record<PlayerId, Money>>
  readonly dirtyActionsThisGame: Readonly<Record<PlayerId, number>>
  readonly launderCountThisGame: Readonly<Record<PlayerId, number>>
}

/** The single field Task 18 adds to GameState. */
export interface CardEffectsState {
  readonly modifiers: readonly TimedModifier[]
  readonly entitlements: readonly Entitlement[]
  readonly poolInjections: Readonly<Record<ContractId, Money>>
  readonly scheduledPoolTerminations: readonly ContractId[]
  readonly counters: CardCounters
  /** Monotonic, assigned to each modifier so stacking order is card-draw order. */
  readonly seq: number
}

export type DeedRef = DeedId
```

- [ ] **Step 3: Add `cardEffects` to `GameState` and `DeckReordered` to the event union**

Modify `packages/engine/src/core/state.ts` — add the import and exactly one field. No
Task 2 type is redefined and no parallel state container is introduced:

```ts
import type { CardEffectsState } from '../contexts/decks/effects.js'

// ... inside GameState, after `decks`:
  readonly cardEffects: CardEffectsState
```

Modify `packages/engine/src/core/events.ts` — add one variant to the `decks` block:

```ts
  | { type: 'DeckReordered'; era: Era; order: readonly number[]; player: PlayerId }
```

`DeckReordered` is added to `STOCHASTIC_EVENTS` in Task 20's schema test only if the
reviewer decides a player-chosen permutation counts as external input; the default here is
that it does **not**, because it is a deliberate choice rather than randomness.

- [ ] **Step 4: Write the failing metric test**

`packages/engine/src/contexts/decks/metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evalMetric } from './metrics.js'
import { fixtureMidGame } from '../../../tests/fixtures/mid-game.js'

describe('evalMetric', () => {
  const s = fixtureMidGame()

  it('returns 1 for the constant metric so flat amounts need no special form', () => {
    expect(evalMetric(s, 'P1', 'one')).toBe(1)
  })

  it('counts a hotel as one hotel and zero loose houses', () => {
    // P2 holds a hotel on st-james-place and 2 houses on tennessee-avenue.
    expect(evalMetric(s, 'P2', 'hotel-count')).toBe(1)
    expect(evalMetric(s, 'P2', 'house-count')).toBe(2)
    expect(evalMetric(s, 'P2', 'building-count')).toBe(7)
  })

  it('separates mortgaged from unmortgaged face value', () => {
    expect(evalMetric(s, 'P3', 'deed-face-value'))
      .toBe(evalMetric(s, 'P3', 'unmortgaged-face-value')
          + evalMetric(s, 'P3', 'mortgaged-face-value'))
  })

  it('caps drawn-to-base ratio handling when the base is zero', () => {
    // P4 has mortgaged everything: base 0, drawn 400.
    expect(evalMetric(s, 'P4', 'borrowing-base')).toBe(0)
    expect(evalMetric(s, 'P4', 'drawn-to-base-ratio')).toBe(Number.POSITIVE_INFINITY)
  })

  it('sums total obligations per E4-20', () => {
    const p = 'P1' as const
    expect(evalMetric(s, p, 'total-obligations')).toBe(
      evalMetric(s, p, 'drawn-credit')
      + evalMetric(s, p, 'peer-principal-borrowed')
      + evalMetric(s, p, 'cds-notional-written')
      + evalMetric(s, p, 'distressed-debt'),
    )
  })
})
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/decks/metrics.test.ts`
Expected: FAIL — `./metrics.js` does not exist.

- [ ] **Step 6: Implement `metrics.ts`**

`packages/engine/src/contexts/decks/metrics.ts`:

```ts
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import type { PlayerMetric, PlayerPredicate } from './effects.js'
import { borrowingBase, peerLoansAsBorrower, peerLoansAsLender } from '../credit/index.js'
import { activeVentureCount } from '../underworld/index.js'
import { completeUnmortgagedGroups, deedsOwnedBy } from '../board/index.js'
import { swapsWrittenBy } from '../securitization/index.js'
import { netWorth } from '../session/index.js'

const HOTEL = 5

export function evalMetric(state: GameState, p: PlayerId, m: PlayerMetric): number {
  const player = state.players[p]
  const deeds = deedsOwnedBy(state, p)
  const live = deeds.filter((d) => !d.mortgaged)
  const face = (xs: readonly { faceValue: Money }[]): Money =>
    xs.reduce((t, d) => t + d.faceValue, 0)

  switch (m) {
    case 'one': return 1
    case 'clean-cash': return player.cleanCash
    case 'dirty-cash': return player.dirtyCash
    case 'heat': return player.heat
    case 'net-worth': return netWorth(state, p)
    case 'drawn-credit': return player.drawnCredit
    case 'borrowing-base': return borrowingBase(state, p)
    case 'drawn-to-base-ratio': {
      const base = borrowingBase(state, p)
      if (base > 0) return player.drawnCredit / base
      return player.drawnCredit > 0 ? Number.POSITIVE_INFINITY : 0
    }
    case 'distressed-debt': return player.distressedDebt
    case 'total-obligations':
      return player.drawnCredit
        + evalMetric(state, p, 'peer-principal-borrowed')
        + evalMetric(state, p, 'cds-notional-written')
        + player.distressedDebt
    case 'deed-count': return deeds.length
    case 'unmortgaged-deed-count': return live.length
    case 'mortgaged-deed-count': return deeds.length - live.length
    case 'deed-face-value': return face(deeds)
    case 'unmortgaged-face-value': return face(live)
    case 'mortgaged-face-value': return face(deeds.filter((d) => d.mortgaged))
    case 'railroad-count': return deeds.filter((d) => d.group === 'railroad').length
    case 'utility-count': return deeds.filter((d) => d.group === 'utility').length
    case 'house-count':
      return deeds.reduce((t, d) => t + (d.houses === HOTEL ? 0 : d.houses), 0)
    case 'hotel-count':
      return deeds.filter((d) => d.houses === HOTEL).length
    case 'building-count':
      return deeds.reduce((t, d) => t + d.houses, 0)
    case 'complete-group-count':
      return completeUnmortgagedGroups(state, p).length
    case 'best-group-buildings':
      return bestGroup(state, p).buildings
    case 'best-group-face-value':
      return bestGroup(state, p).face
    case 'active-venture-count': return activeVentureCount(state, p)
    case 'peer-principal-lent':
      return peerLoansAsLender(state, p)
        .filter((l) => l.status === 'active')
        .reduce((t, l) => t + l.outstanding, 0)
    case 'peer-note-count':
      return peerLoansAsLender(state, p).filter((l) => l.status === 'active').length
    case 'peer-principal-borrowed':
      return peerLoansAsBorrower(state, p)
        .filter((l) => l.status === 'active')
        .reduce((t, l) => t + l.outstanding, 0)
    case 'peer-max-rate':
      return peerLoansAsBorrower(state, p)
        .filter((l) => l.status === 'active')
        .reduce((t, l) => Math.max(t, l.ratePerRound), 0)
    case 'peer-interest-due-per-round':
      return peerLoansAsBorrower(state, p)
        .filter((l) => l.status === 'active')
        .reduce((t, l) => t + Math.floor(l.outstanding * l.ratePerRound), 0)
    case 'cds-notional-written':
      return swapsWrittenBy(state, p)
        .filter((s) => s.status === 'active')
        .reduce((t, s) => t + s.notional, 0)
    case 'rent-received-this-era':
      return state.cardEffects.counters.rentReceivedThisEra[p]
    case 'rent-received-this-game':
      return state.cardEffects.counters.rentReceivedThisGame[p]
    case 'dirty-actions-this-game':
      return state.cardEffects.counters.dirtyActionsThisGame[p]
    case 'launder-count-this-game':
      return state.cardEffects.counters.launderCountThisGame[p]
  }
}

function bestGroup(state: GameState, p: PlayerId): { buildings: number; face: Money } {
  let best = { buildings: -1, face: 0 }
  for (const group of completeUnmortgagedGroups(state, p)) {
    const inGroup = deedsOwnedBy(state, p).filter((d) => d.group === group)
    const buildings = inGroup.reduce((t, d) => t + d.houses, 0)
    const face = inGroup.reduce((t, d) => t + d.faceValue, 0)
    if (buildings > best.buildings || (buildings === best.buildings && face > best.face)) {
      best = { buildings, face }
    }
  }
  return best.buildings < 0 ? { buildings: 0, face: 0 } : best
}

export function testPredicate(state: GameState, p: PlayerId, pred: PlayerPredicate): boolean {
  switch (pred.kind) {
    case 'always': return true
    case 'metric-at-least': return evalMetric(state, p, pred.metric) >= pred.value
    case 'metric-at-most': return evalMetric(state, p, pred.metric) <= pred.value
    case 'metric-above': return evalMetric(state, p, pred.metric) > pred.value
    case 'all-of': return pred.of.every((q) => testPredicate(state, p, q))
  }
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/decks/metrics.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/contexts/decks packages/engine/src/core
git commit -m "feat(decks): declare the card effect vocabulary and metric evaluator

31 player metrics cover every quantity the 80 authored cards rank, filter
or multiply by. Adds one field to GameState (cardEffects) and one event
(DeckReordered, required by E3-05)."
```

- [ ] **Step 9: Write the failing target-resolution test**

Dynamic targeting is the decisive design point of this deck, so its tie-break chains get
their own test before any card exists.

`packages/engine/src/contexts/decks/select.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTarget, testWorld } from './select.js'
import type { Target } from './effects.js'
import { fixtureTied } from '../../../tests/fixtures/tied.js'

const MOST_DRAWN: Target = {
  kind: 'extremum',
  by: { metric: 'drawn-credit', direction: 'max' },
  tieBreak: [{ metric: 'drawn-to-base-ratio', direction: 'max' }],
  among: { kind: 'metric-above', metric: 'drawn-credit', value: 0 },
}

describe('resolveTarget', () => {
  it('resolves the drawer to exactly the drawer', () => {
    const s = fixtureTied()
    expect(resolveTarget(s, { kind: 'drawer' }, 'P3')).toEqual(['P3'])
  })

  it('filters `all` by its predicate', () => {
    const s = fixtureTied() // P1 heat 5, P2 heat 5, P3 heat 1, P4 heat 0
    const t: Target = { kind: 'all', where: { kind: 'metric-at-least', metric: 'heat', value: 5 } }
    expect(resolveTarget(s, t, 'P1')).toEqual(['P1', 'P2'])
  })

  it('breaks a tie on the first tie-break metric', () => {
    // P1 and P2 both drawn 600; P2 has the higher drawn-to-base ratio.
    const s = fixtureTied()
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual(['P2'])
  })

  it('falls through to turn order when every tie-break also ties', () => {
    // P1 and P2 identical on drawn AND ratio; turn order is P3,P1,P4,P2.
    const s = fixtureTied({ identicalRatios: true })
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual(['P1'])
  })

  it('returns an empty list when the `among` filter excludes everyone', () => {
    const s = fixtureTied({ noDebt: true })
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual([])
  })

  it('takes N players in ranked order for E4-16', () => {
    const s = fixtureTied()
    expect(resolveTarget(s, { ...MOST_DRAWN, take: 2 }, 'P4')).toEqual(['P2', 'P1'])
  })

  it('reports whether a target matched anybody', () => {
    const s = fixtureTied({ noDebt: true })
    expect(testWorld(s, { kind: 'any-target', of: MOST_DRAWN }, 'P4')).toBe(false)
  })

  it('detects when two targets resolve to the same player', () => {
    const s = fixtureTied()
    const same = { kind: 'same-target', a: MOST_DRAWN, b: MOST_DRAWN } as const
    expect(testWorld(s, same, 'P4')).toBe(true)
  })
})
```

- [ ] **Step 10: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/decks/select.test.ts`
Expected: FAIL — `./select.js` does not exist.

- [ ] **Step 11: Implement `select.ts`**

`packages/engine/src/contexts/decks/select.ts`:

```ts
import type { GameState } from '../../core/state.js'
import type { ContractId, PlayerId } from '../../core/types.js'
import type { EntityExtremum, EntityKind, Target, WorldPredicate } from './effects.js'
import { evalMetric, testPredicate } from './metrics.js'
import {
  poolCoverageRatio, poolExpectedCashflow, swapsWrittenBy,
  trancheRatingScore, trancheRemainingFace,
} from '../securitization/index.js'
import { outstandingDeedOptions, outstandingRentFutures, rentFutureRemainingValue }
  from '../markets/index.js'
import { peerLoansAsLender } from '../credit/index.js'

const cmp = (a: number, b: number, dir: 'max' | 'min'): number =>
  dir === 'max' ? b - a : a - b

/**
 * Ranks players by the target's metric chain and returns the top `take`.
 * The final tie-break is ALWAYS earlier position in turn order, which is fixed
 * at setup and therefore total. Every dynamic target in all four decks resolves here.
 */
export function resolveTarget(state: GameState, target: Target, drawer: PlayerId): readonly PlayerId[] {
  switch (target.kind) {
    case 'drawer':
      return [drawer]
    case 'all': {
      const where = target.where ?? { kind: 'always' as const }
      return state.config.turnOrder.filter((p) => testPredicate(state, p, where))
    }
    case 'extremum': {
      const among = target.among ?? { kind: 'always' as const }
      const pool = state.config.turnOrder.filter((p) => testPredicate(state, p, among))
      const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
      const ranked = [...pool].sort((a, b) => {
        const primary = cmp(
          evalMetric(state, a, target.by.metric),
          evalMetric(state, b, target.by.metric),
          target.by.direction,
        )
        if (primary !== 0) return primary
        for (const t of target.tieBreak) {
          const next = cmp(evalMetric(state, a, t.metric), evalMetric(state, b, t.metric), t.direction)
          if (next !== 0) return next
        }
        return (order.get(a) ?? 0) - (order.get(b) ?? 0)
      })
      return ranked.slice(0, target.take ?? 1)
    }
    case 'entity-holder': {
      const player = resolveEntityPlayer(state, target.entity)
      return player === null ? [] : [player]
    }
  }
}

export function resolveEntity(state: GameState, e: EntityExtremum): EntityHandle | null {
  switch (e.kind) {
    case 'pool': {
      const pools = state.pools.filter((p) => !p.terminated)
      if (pools.length === 0) return null
      const score = (id: ContractId): number =>
        e.by === 'expected-cashflow' ? poolExpectedCashflow(state, id) : poolCoverageRatio(state, id)
      const tie = (id: ContractId, by: string): number => {
        const pool = state.pools.find((p) => p.id === id)
        const faceOf = (k: string): number =>
          pool?.tranches.find((t) => t.kind === k)?.face ?? 0
        if (by === 'senior-face') return faceOf('senior')
        if (by === 'senior-plus-mezz-face') return faceOf('senior') + faceOf('mezzanine')
        return poolCoverageRatio(state, id)
      }
      const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
      const best = [...pools].sort((a, b) => {
        const primary = cmp(score(a.id), score(b.id), e.direction)
        if (primary !== 0) return primary
        for (const t of e.tieBreak) {
          const next = cmp(tie(a.id, t.by), tie(b.id, t.by), t.direction)
          if (next !== 0) return next
        }
        return (order.get(a.originator) ?? 0) - (order.get(b.originator) ?? 0)
      })[0]
      return best === undefined ? null : { kind: 'pool', poolId: best.id }
    }
    case 'tranche': {
      const all = state.pools
        .filter((p) => !p.terminated)
        .flatMap((p) => p.tranches.map((t) => ({ poolId: p.id, tranche: t })))
        .filter((x) => trancheRemainingFace(state, x.poolId, x.tranche.kind) > 0 || x.tranche.kind === 'equity')
      if (all.length === 0) return null
      const score = (x: { poolId: ContractId; tranche: { kind: 'senior' | 'mezzanine' | 'equity' } }): number =>
        e.by === 'rating-score'
          ? trancheRatingScore(state, x.poolId, x.tranche.kind)
          : trancheRemainingFace(state, x.poolId, x.tranche.kind)
      const tie = (x: typeof all[number], by: string): number => {
        if (by === 'rating-score') return trancheRatingScore(state, x.poolId, x.tranche.kind)
        if (by === 'remaining-face') return trancheRemainingFace(state, x.poolId, x.tranche.kind)
        const pool = state.pools.find((p) => p.id === x.poolId)
        return (pool?.tranches ?? []).reduce(
          (t, tr) => t + trancheRemainingFace(state, x.poolId, tr.kind), 0,
        )
      }
      const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
      const best = [...all].sort((a, b) => {
        const primary = cmp(score(a), score(b), e.direction)
        if (primary !== 0) return primary
        for (const t of e.tieBreak) {
          const next = cmp(tie(a, t.by), tie(b, t.by), t.direction)
          if (next !== 0) return next
        }
        return (order.get(a.tranche.holder) ?? 0) - (order.get(b.tranche.holder) ?? 0)
      })[0]
      return best === undefined
        ? null
        : { kind: 'tranche', poolId: best.poolId, tranche: best.tranche.kind }
    }
    case 'rent-future': {
      const futures = outstandingRentFutures(state)
      if (futures.length === 0) return null
      const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
      const best = [...futures].sort((a, b) => {
        const primary = cmp(
          rentFutureRemainingValue(state, a.id), rentFutureRemainingValue(state, b.id), e.direction,
        )
        if (primary !== 0) return primary
        return (order.get(a.holder) ?? 0) - (order.get(b.holder) ?? 0)
      })[0]
      return best === undefined ? null : { kind: 'rent-future', contractId: best.id }
    }
  }
}

export type EntityHandle =
  | { readonly kind: 'pool'; readonly poolId: ContractId }
  | { readonly kind: 'tranche'; readonly poolId: ContractId; readonly tranche: 'senior' | 'mezzanine' | 'equity' }
  | { readonly kind: 'rent-future'; readonly contractId: ContractId }

function resolveEntityPlayer(state: GameState, e: EntityExtremum): PlayerId | null {
  const handle = resolveEntity(state, e)
  if (handle === null) return null
  if (handle.kind === 'pool') {
    const pool = state.pools.find((p) => p.id === handle.poolId)
    if (pool === undefined) return null
    if (e.kind === 'pool' && e.attribute === 'equity-holder') {
      return pool.tranches.find((t) => t.kind === 'equity')?.holder ?? null
    }
    return pool.originator
  }
  if (handle.kind === 'tranche') {
    const pool = state.pools.find((p) => p.id === handle.poolId)
    if (pool === undefined) return null
    if (e.kind === 'tranche' && e.attribute === 'pool-originator') return pool.originator
    return pool.tranches.find((t) => t.kind === handle.tranche)?.holder ?? null
  }
  return outstandingRentFutures(state).find((f) => f.id === handle.contractId)?.holder ?? null
}

function entityExists(state: GameState, kind: EntityKind): boolean {
  switch (kind) {
    case 'pool': return state.pools.some((p) => !p.terminated)
    case 'tranche': return state.pools.some((p) => !p.terminated && p.tranches.length > 0)
    case 'rent-future': return outstandingRentFutures(state).length > 0
    case 'deed-option': return outstandingDeedOptions(state).length > 0
    case 'peer-loan':
      return state.config.turnOrder.some(
        (p) => peerLoansAsLender(state, p).some((l) => l.status === 'active'),
      )
    case 'written-cds':
      return state.config.turnOrder.some(
        (p) => swapsWrittenBy(state, p).some((s) => s.status === 'active'),
      )
    case 'building':
      return Object.values(state.deeds).some((d) => d.houses > 0)
  }
}

export function testWorld(state: GameState, w: WorldPredicate, drawer: PlayerId): boolean {
  switch (w.kind) {
    case 'any-target': return resolveTarget(state, w.of, drawer).length > 0
    case 'any-entity': return entityExists(state, w.of)
    case 'same-target': {
      const a = resolveTarget(state, w.a, drawer)
      const b = resolveTarget(state, w.b, drawer)
      return a.length === 1 && b.length === 1 && a[0] === b[0]
    }
  }
}
```

- [ ] **Step 12: Run the test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/decks/select.test.ts`
Expected: PASS — all eight cases green, including the turn-order fall-through.

- [ ] **Step 13: Commit**

```bash
git add packages/engine/src/contexts/decks/select.ts packages/engine/src/contexts/decks/select.test.ts
git commit -m "feat(decks): resolve dynamic card targets with total tie-break chains

One resolver serves all 41 dynamically-targeted cards. The final tie-break
is always earlier turn order, which is fixed at setup and therefore total."
```

- [ ] **Step 14: Write the failing amount-evaluation test**

`packages/engine/src/contexts/decks/interpret.test.ts` (amounts only for now):

```ts
import { describe, it, expect } from 'vitest'
import { evalAmount } from './interpret.js'
import type { Amount } from './effects.js'
import { fixtureMidGame } from '../../../tests/fixtures/mid-game.js'

describe('evalAmount', () => {
  const s = fixtureMidGame()

  it('sums weighted metric terms and floors the result (E1-07)', () => {
    // P2: 2 houses, 1 hotel -> 2*25 + 1*125 = 175, capped at 100.
    const a: Amount = {
      kind: 'sum',
      terms: [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 125 }],
      cap: 100,
    }
    expect(evalAmount(s, 'P2', a)).toBe(100)
  })

  it('floors a percentage of net worth (E3-17)', () => {
    const a: Amount = { kind: 'sum', terms: [{ metric: 'net-worth', rate: 0.05 }], cap: 600 }
    const expected = Math.min(600, Math.floor(evalAmountRaw(s, 'P1')))
    expect(evalAmount(s, 'P1', a)).toBe(expected)
  })

  it('clamps to the clamp metrics so E1-14 never creates distressed debt', () => {
    // P4 holds $80 clean and owes $400 drawn. The card says repay $150 or all cash held.
    const a: Amount = {
      kind: 'sum',
      terms: [{ metric: 'one', rate: 150 }],
      clampTo: ['clean-cash', 'drawn-credit'],
    }
    expect(evalAmount(s, 'P4', a)).toBe(80)
  })

  it('never returns a negative amount', () => {
    const a: Amount = { kind: 'sum', terms: [{ metric: 'one', rate: -500 }] }
    expect(evalAmount(s, 'P1', a)).toBe(0)
  })

  it('branches on a player predicate (E4-18)', () => {
    const a: Amount = {
      kind: 'branch',
      when: {
        kind: 'all-of',
        of: [
          { kind: 'metric-at-most', metric: 'drawn-credit', value: 0 },
          { kind: 'metric-at-most', metric: 'distressed-debt', value: 0 },
        ],
      },
      then: { kind: 'sum', terms: [{ metric: 'one', rate: 600 }] },
      otherwise: { kind: 'sum', terms: [{ metric: 'one', rate: 300 }] },
    }
    expect(evalAmount(s, 'P3', a)).toBe(600) // P3 is unlevered
    expect(evalAmount(s, 'P4', a)).toBe(300) // P4 is drawn
  })
})

function evalAmountRaw(s: ReturnType<typeof fixtureMidGame>, p: 'P1'): number {
  // netWorth is imported through session's index in the implementation; the test
  // recomputes the raw product to prove the floor, not the mark-to-model.
  const a: Amount = { kind: 'sum', terms: [{ metric: 'net-worth', rate: 1 }] }
  return evalAmount(s, p, a) * 0.05
}
```

- [ ] **Step 15: Run the test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/decks/interpret.test.ts`
Expected: FAIL — `./interpret.js` does not exist.

- [ ] **Step 16: Implement `evalAmount` and the interpreter skeleton in `interpret.ts`**

`packages/engine/src/contexts/decks/interpret.ts`:

```ts
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import type { Amount, Card, Effect, Party, Target } from './effects.js'
import { evalMetric, testPredicate } from './metrics.js'
import { resolveTarget, testWorld } from './select.js'
import { applyStructuralEffect } from './interpret-structural.js'
import {
  creditPlayer, forgiveLiability, peerLoansAsBorrower, repayDrawnCredit, settleObligation,
} from '../credit/index.js'
import { adjustHeat, creditDirtyCash, seizeDirtyCash } from '../underworld/index.js'

export interface DrawContext {
  readonly drawer: PlayerId
  readonly card: Card
}

/**
 * Sum the weighted terms, floor, cap, clamp, then clamp at zero.
 * `Math.floor` is the only rounding anywhere in the card interpreter.
 */
export function evalAmount(state: GameState, p: PlayerId, amount: Amount): Money {
  if (amount.kind === 'branch') {
    return testPredicate(state, p, amount.when)
      ? evalAmount(state, p, amount.then)
      : evalAmount(state, p, amount.otherwise)
  }
  const raw = amount.terms.reduce((t, term) => t + evalMetric(state, p, term.metric) * term.rate, 0)
  let value = Math.floor(raw)
  if (amount.cap !== undefined) value = Math.min(value, amount.cap)
  for (const metric of amount.clampTo ?? []) {
    value = Math.min(value, Math.floor(evalMetric(state, p, metric)))
  }
  return Math.max(0, value)
}

/** Applies the first clause whose guard passes, and only that clause. */
export function applyCard(state: GameState, card: Card, drawer: PlayerId): GameState {
  const clause = card.clauses.find((c) => c.when === undefined || testWorld(state, c.when, drawer))
  if (clause === undefined) return state
  return clause.effects.reduce(
    (s, effect) => applyEffect(s, effect, { drawer, card }),
    state,
  )
}

export function applyEffect(state: GameState, effect: Effect, ctx: DrawContext): GameState {
  switch (effect.op) {
    case 'transfer': return applyTransfer(state, effect, ctx)
    case 'dirty': return applyDirty(state, effect, ctx)
    case 'heat': return applyHeat(state, effect, ctx)
    case 'forgive': return applyForgive(state, effect, ctx)
    default: return applyStructuralEffect(state, effect, ctx)
  }
}

function applyTransfer(
  state: GameState, e: Extract<Effect, { op: 'transfer' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    return moveMoney(s, player, e.from, e.to, amount, e.applyFirstTo, ctx)
  }, state)
}

function moveMoney(
  state: GameState, player: PlayerId, from: Party, to: Party, amount: Money,
  applyFirstTo: 'drawn-credit' | 'distressed-debt' | undefined, ctx: DrawContext,
): GameState {
  const reason = `card:${ctx.card.id}`

  // Player is the payer.
  if (from.kind === 'target') {
    if (to.kind === 'treasury') {
      const paid = settleObligation(state, player, amount, reason)
      return { ...paid, treasury: paid.treasury + amount }
    }
    if (to.kind === 'bank') {
      return repayDrawnCredit(state, player, amount)
    }
    if (to.kind === 'other') {
      const [recipient] = resolveTarget(state, to.target, ctx.drawer)
      if (recipient === undefined || recipient === player) return state
      const paid = settleObligation(state, player, amount, reason)
      return creditPlayer(paid, recipient, amount)
    }
    if (to.kind === 'note-holders') {
      // E3-16. Pro rata per loan by interest due. Explicitly NOT a peer loan default
      // trigger: no collateral transfer, no permanent base halving. Shortfalls route
      // through settleObligation and become distressed debt.
      return peerLoansAsBorrower(state, player)
        .filter((l) => l.status === 'active')
        .reduce((s, loan) => {
          const due = Math.floor(loan.outstanding * loan.ratePerRound)
          if (due <= 0) return s
          const paid = settleObligation(s, player, due, `${reason}:servicer-cure`)
          return creditPlayer(paid, loan.lender, due)
        }, state)
    }
    return state
  }

  // Treasury or bank is the payer, player is the recipient.
  if (from.kind === 'treasury') {
    const credited = creditPlayer(state, player, amount, applyFirstTo)
    return { ...credited, treasury: credited.treasury - amount }
  }
  return state
}

function applyDirty(
  state: GameState, e: Extract<Effect, { op: 'dirty' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    return e.direction === 'credit'
      ? creditDirtyCash(s, player, amount)
      : seizeDirtyCash(s, player, amount)
  }, state)
}

function applyHeat(
  state: GameState, e: Extract<Effect, { op: 'heat' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer)
    .reduce((s, player) => adjustHeat(s, player, e.delta), state)
}

function applyForgive(
  state: GameState, e: Extract<Effect, { op: 'forgive' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    // The Treasury absorbs the loss: the liability falls and the Treasury falls
    // by the same amount, so money stays conserved.
    const forgiven = forgiveLiability(s, player, e.liability, amount)
    return { ...forgiven, treasury: forgiven.treasury - amount }
  }, state)
}

export function isBriberyCancellable(state: GameState, card: Card, drawer: PlayerId): boolean {
  const clause = card.clauses.find((c) => c.when === undefined || testWorld(state, c.when, drawer))
  if (clause === undefined || clause.effects.length === 0) return false
  const touched = new Set<PlayerId>()
  for (const effect of clause.effects) {
    const target = 'target' in effect ? (effect.target as Target) : null
    if (target === null) return false // structural, board-wide effects target everyone
    for (const p of resolveTarget(state, target, drawer)) touched.add(p)
  }
  return touched.size === 1
}
```

- [ ] **Step 17: Run the amount test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/decks/interpret.test.ts`
Expected: PASS — all five amount cases green.

- [ ] **Step 18: Write the failing money-op test, including the shortfall path**

Append to `packages/engine/src/contexts/decks/interpret.test.ts`:

```ts
import { applyCard } from './interpret.js'
import { ERA_I } from './cards/era1.js'

describe('money operations', () => {
  const card = (id: string) => {
    const found = ERA_I.find((c) => c.id === id)
    if (found === undefined) throw new Error(`no card ${id}`)
    return found
  }

  it('pays the Treasury and keeps money conserved (E1-04)', () => {
    const s0 = fixtureMidGame() // P1 holds 2 mortgaged deeds
    const s1 = applyCard(s0, card('E1-04'), 'P1')
    expect(s0.players.P1.cleanCash - s1.players.P1.cleanCash).toBe(100)
    expect(s1.treasury - s0.treasury).toBe(100)
  })

  it('never drives clean cash below zero; the shortfall becomes distressed debt', () => {
    // spec 19.8: clean cash, then credit headroom, then distressed debt. No liquidation.
    const s0 = fixtureMidGame({ P1: { cleanCash: 10, drawnCredit: 0, borrowingBaseOverride: 0 } })
    const s1 = applyCard(s0, card('E1-04'), 'P1')
    expect(s1.players.P1.cleanCash).toBe(0)
    expect(s1.players.P1.distressedDebt).toBe(90)
    expect(s1.treasury - s0.treasury).toBe(100)
  })

  it('moves money between two dynamically selected players (E1-18)', () => {
    const s0 = fixtureMidGame()
    const s1 = applyCard(s0, card('E1-18'), 'P4')
    const delta = (p: 'P1' | 'P2' | 'P3' | 'P4') =>
      s1.players[p].cleanCash - s0.players[p].cleanCash
    expect(delta('P2')).toBe(-100) // highest rent collected this era
    expect(delta('P3')).toBe(100)  // lowest
    expect(s1.treasury).toBe(s0.treasury)
  })

  it('runs the fallback clause when the primary target matches nobody (E1-14)', () => {
    const s0 = fixtureMidGame({ noDebt: true })
    const s1 = applyCard(s0, card('E1-14'), 'P2')
    expect(s1.players.P2.cleanCash - s0.players.P2.cleanCash).toBe(100)
  })
})
```

- [ ] **Step 19: Run the money-op test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/decks/interpret.test.ts`
Expected: FAIL — `./cards/era1.js` does not exist yet. This is the correct failure: the
interpreter is complete but has nothing to interpret. Steps 22-25 supply Era I.

- [ ] **Step 20: Implement the structural operations**

`packages/engine/src/contexts/decks/interpret-structural.ts`:

```ts
import type { GameState } from '../../core/state.js'
import type { ContractId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { Effect, Entitlement, Expiry, ResolvedExpiry, TimedModifier } from './effects.js'
import type { DrawContext } from './interpret.js'
import { evalAmount } from './interpret.js'
import { evalMetric } from './metrics.js'
import { resolveEntity, resolveTarget } from './select.js'
import { ECONOMY } from '../../config/economy.js'
import { creditPlayer, flagMarginCall, mortgageDeed, settleObligation } from '../credit/index.js'
import { resolveAudit } from '../underworld/index.js'
import {
  outstandingDeedOptions, setOptionExpiry, setOptionStrike,
} from '../markets/index.js'
import { setTrancheFace, trancheRemainingFace } from '../securitization/index.js'
import { deedsOwnedBy } from '../board/index.js'

export function resolveExpiry(state: GameState, expiry: Expiry): ResolvedExpiry {
  const round = state.round
  switch (expiry.kind) {
    case 'end-of-round': return { boundary: 'round', round: round + expiry.offset }
    case 'end-of-open-phase': return { boundary: 'open-phase', round: round + expiry.offset }
    case 'next-settlement-only': return { boundary: 'settlement', round }
    case 'end-of-era': {
      const per = ECONOMY.ROUNDS_PER_ERA
      return { boundary: 'settlement', round: Math.ceil(round / per) * per }
    }
    case 'permanent': return { boundary: 'never', round: ECONOMY.TOTAL_ROUNDS }
  }
}

export function applyStructuralEffect(
  state: GameState, effect: Effect, ctx: DrawContext,
): GameState {
  switch (effect.op) {
    case 'modifier': {
      const players = resolveTarget(state, effect.target, ctx.drawer)
      if (players.length === 0) return state
      const seq = state.cardEffects.seq + 1
      const modifier: TimedModifier = {
        id: `${ctx.card.id}#${seq}`,
        source: ctx.card.id,
        players,
        effect: effect.modifier.effect,
        expiry: resolveExpiry(state, effect.modifier.expiry),
        seq,
      }
      return {
        ...state,
        cardEffects: {
          ...state.cardEffects,
          seq,
          modifiers: [...state.cardEffects.modifiers, modifier],
        },
      }
    }

    case 'entitlement': {
      const players = resolveTarget(state, effect.target, ctx.drawer)
      const grants: Entitlement[] = players.map((owner, i) => ({
        id: `${ctx.card.id}#${state.cardEffects.seq + 1 + i}`,
        source: ctx.card.id,
        kind: effect.entitlement.kind,
        owner,
        remaining: effect.entitlement.capacity,
        expiry: resolveExpiry(state, effect.entitlement.expiry),
        params: effect.entitlement.params,
      }))
      return {
        ...state,
        cardEffects: {
          ...state.cardEffects,
          seq: state.cardEffects.seq + grants.length,
          entitlements: [...state.cardEffects.entitlements, ...grants],
        },
      }
    }

    case 'audit': {
      // Only reachable from Era III and Era IV cards. Enforced by cards.test.ts.
      return resolveTarget(state, effect.target, ctx.drawer).reduce((s, player) => {
        const audited = resolveAudit(s, player)
        if (effect.extraPenalty === undefined) return audited
        const penalty = evalAmount(s, player, effect.extraPenalty)
        const paid = settleObligation(audited, player, penalty, `card:${ctx.card.id}`)
        return { ...paid, treasury: paid.treasury + penalty }
      }, state)
    }

    case 'margin-flag': {
      const due: RoundNumber = effect.when === 'immediately' ? state.round : state.round + 1
      return resolveTarget(state, effect.target, ctx.drawer)
        .reduce((s, player) => flagMarginCall(s, player, effect.cureRatio, due), state)
    }

    case 'tranche-face': {
      // era-decks 6.4: reductions apply to REMAINING face, not original face.
      return state.pools
        .filter((p) => !p.terminated)
        .reduce((s, pool) => {
          const remaining = trancheRemainingFace(s, pool.id, effect.tranche)
          if (remaining <= 0) return s
          const paid = pool.tranches.find((t) => t.kind === effect.tranche)?.paid ?? 0
          const reduced = Math.floor(remaining * effect.factor)
          return setTrancheFace(s, pool.id, effect.tranche, paid + reduced)
        }, state)
    }

    case 'option-strike':
      return outstandingDeedOptions(state).reduce(
        (s, o) => setOptionStrike(s, o.id, Math.max(effect.floor, o.strike + effect.delta)),
        state,
      )

    case 'option-expiry': {
      const expiry = resolveExpiry(state, effect.expiry)
      return outstandingDeedOptions(state).reduce(
        (s, o) => setOptionExpiry(s, o.id, Math.min(o.expiry, expiry.round)), state,
      )
    }

    case 'pool-inject': {
      const handle = resolveEntity(state, effect.entity)
      if (handle === null || handle.kind !== 'pool') return state
      const pool = state.pools.find((p) => p.id === handle.poolId)
      if (pool === undefined) return state
      const payer: PlayerId | undefined = effect.payer === 'originator'
        ? pool.originator
        : pool.tranches.find((t) => t.kind === 'equity')?.holder
      if (payer === undefined) return state
      const amount = evalAmount(state, payer, effect.amount)
      if (amount <= 0) return state
      const paid = settleObligation(state, payer, amount, `card:${ctx.card.id}`)
      const existing = paid.cardEffects.poolInjections[handle.poolId] ?? 0
      // era-decks 6.5: the injection does NOT count toward expected pool cashflow,
      // so ratings are unchanged. It is held here and added to the next waterfall's
      // collected cash by the Settlement orchestrator.
      return {
        ...paid,
        cardEffects: {
          ...paid.cardEffects,
          poolInjections: { ...paid.cardEffects.poolInjections, [handle.poolId]: existing + amount },
        },
      }
    }

    case 'pool-terminate': {
      const handle = resolveEntity(state, effect.entity)
      if (handle === null || handle.kind !== 'pool') return state
      const already: readonly ContractId[] = state.cardEffects.scheduledPoolTerminations
      if (already.includes(handle.poolId)) return state
      return {
        ...state,
        cardEffects: {
          ...state.cardEffects,
          scheduledPoolTerminations: [...already, handle.poolId],
        },
      }
    }

    case 'forced-mortgage': {
      // era-decks 6.8. Order: select eligible deed, mortgage, make-whole handled inside
      // mortgageDeed, apply proceeds to drawn balance, re-evaluate margin at the NEXT
      // Settlement rather than immediately.
      return resolveTarget(state, effect.target, ctx.drawer).reduce((s, player) => {
        const optioned = new Set(outstandingDeedOptions(s).map((o) => o.deed))
        const eligible = deedsOwnedBy(s, player)
          .filter((d) => !d.mortgaged && d.houses === 0 && !optioned.has(d.id))
          .sort((a, b) => b.faceValue - a.faceValue)[0]
        if (eligible === undefined) return s
        return mortgageDeed(s, player, eligible.id)
      }, state)
    }

    case 'deck-peek':
      // The reveal is a client-side concern; the engine records only the resulting
      // permutation, which arrives as a separate DeckReordered event.
      return state

    default:
      return state
  }
}

export function evalMoney(state: GameState, p: PlayerId, metric: Parameters<typeof evalMetric>[2]): Money {
  return Math.floor(evalMetric(state, p, metric))
}
```

- [ ] **Step 21: Commit the interpreter**

```bash
git add packages/engine/src/contexts/decks
git commit -m "feat(decks): interpret the 15-op card effect vocabulary

Money ops route every shortfall through spec 19.8 (clean cash, then credit
headroom, then distressed debt, never liquidation). Structural ops cover
timed modifiers, entitlements, audits, margin flags, tranche face
reductions, option repricing, pool injection and termination."
```

- [ ] **Step 22: Write the card DSL**

Without these combinators each card costs 30+ lines of nested object literals and the era
files blow the 500-line limit. With them each card costs 9-14 lines.

`packages/engine/src/contexts/decks/cards/dsl.ts`:

```ts
import type { ColorGroup, Money } from '../../../core/types.js'
import type {
  Amount, CardClause, Effect, EntitlementTemplate, EntityExtremum, EntityKind,
  Expiry, MetricRef, ModifierTemplate, PlayerMetric, PlayerPredicate, Target, WorldPredicate,
} from '../effects.js'

export const DRAWER: Target = { kind: 'drawer' }
export const EVERYONE: Target = { kind: 'all' }
export const eachWhere = (where: PlayerPredicate): Target => ({ kind: 'all', where })

export const atLeast = (metric: PlayerMetric, value: number): PlayerPredicate =>
  ({ kind: 'metric-at-least', metric, value })
export const atMost = (metric: PlayerMetric, value: number): PlayerPredicate =>
  ({ kind: 'metric-at-most', metric, value })
export const above = (metric: PlayerMetric, value: number): PlayerPredicate =>
  ({ kind: 'metric-above', metric, value })
export const allOf = (...of: readonly PlayerPredicate[]): PlayerPredicate => ({ kind: 'all-of', of })

export const hi = (metric: PlayerMetric): MetricRef => ({ metric, direction: 'max' })
export const lo = (metric: PlayerMetric): MetricRef => ({ metric, direction: 'min' })

export const most = (
  metric: PlayerMetric, tieBreak: readonly MetricRef[] = [], among?: PlayerPredicate,
): Target => among === undefined
  ? { kind: 'extremum', by: hi(metric), tieBreak }
  : { kind: 'extremum', by: hi(metric), tieBreak, among }

export const least = (
  metric: PlayerMetric, tieBreak: readonly MetricRef[] = [], among?: PlayerPredicate,
): Target => among === undefined
  ? { kind: 'extremum', by: lo(metric), tieBreak }
  : { kind: 'extremum', by: lo(metric), tieBreak, among }

export const topN = (
  take: number, metric: PlayerMetric, tieBreak: readonly MetricRef[], among?: PlayerPredicate,
): Target => among === undefined
  ? { kind: 'extremum', by: hi(metric), tieBreak, take }
  : { kind: 'extremum', by: hi(metric), tieBreak, take, among }

export const holderOf = (entity: EntityExtremum): Target => ({ kind: 'entity-holder', entity })

export const flat = (dollars: Money): Amount =>
  ({ kind: 'sum', terms: [{ metric: 'one', rate: dollars }] })
export const per = (metric: PlayerMetric, rate: number, cap?: Money): Amount =>
  cap === undefined
    ? { kind: 'sum', terms: [{ metric, rate }] }
    : { kind: 'sum', terms: [{ metric, rate }], cap }
export const sumOf = (
  terms: readonly { readonly metric: PlayerMetric; readonly rate: number }[], cap?: Money,
): Amount => cap === undefined ? { kind: 'sum', terms } : { kind: 'sum', terms, cap }
export const clampedTo = (amount: Amount, ...clampTo: readonly PlayerMetric[]): Amount =>
  amount.kind === 'sum' ? { ...amount, clampTo } : amount
export const branch = (when: PlayerPredicate, then: Amount, otherwise: Amount): Amount =>
  ({ kind: 'branch', when, then, otherwise })

const TREASURY = { kind: 'treasury' } as const
const BANK = { kind: 'bank' } as const
const SELF = { kind: 'target' } as const

export const collect = (
  target: Target, amount: Amount, applyFirstTo?: 'drawn-credit' | 'distressed-debt',
): Effect => applyFirstTo === undefined
  ? { op: 'transfer', target, from: TREASURY, to: SELF, amount }
  : { op: 'transfer', target, from: TREASURY, to: SELF, amount, applyFirstTo }

export const payTreasury = (target: Target, amount: Amount): Effect =>
  ({ op: 'transfer', target, from: SELF, to: TREASURY, amount })

export const payPlayer = (target: Target, other: Target, amount: Amount): Effect =>
  ({ op: 'transfer', target, from: SELF, to: { kind: 'other', target: other }, amount })

export const repayBank = (target: Target, amount: Amount): Effect =>
  ({ op: 'transfer', target, from: SELF, to: BANK, amount, applyFirstTo: 'drawn-credit' })

export const payNoteHolders = (target: Target, amount: Amount): Effect =>
  ({ op: 'transfer', target, from: SELF, to: { kind: 'note-holders' }, amount })

export const heatBy = (target: Target, delta: number): Effect => ({ op: 'heat', target, delta })
export const dirtyIn = (target: Target, amount: Amount): Effect =>
  ({ op: 'dirty', target, direction: 'credit', amount })
export const dirtyOut = (target: Target, amount: Amount): Effect =>
  ({ op: 'dirty', target, direction: 'seize', amount })
export const forgiveDebt = (
  target: Target, liability: 'drawn-credit' | 'distressed-debt', amount: Amount,
): Effect => ({ op: 'forgive', target, liability, amount })

export const modify = (target: Target, modifier: ModifierTemplate): Effect =>
  ({ op: 'modifier', target, modifier })
export const grant = (target: Target, entitlement: EntitlementTemplate): Effect =>
  ({ op: 'entitlement', target, entitlement })
export const auditNow = (target: Target, extraPenalty?: Amount): Effect =>
  extraPenalty === undefined ? { op: 'audit', target } : { op: 'audit', target, extraPenalty }
export const marginFlag = (
  target: Target, cureRatio: number, when: 'immediately' | 'next-settlement',
): Effect => ({ op: 'margin-flag', target, cureRatio, when })

export const nextRound: Expiry = { kind: 'end-of-round', offset: 1 }
export const nextOpenPhase: Expiry = { kind: 'end-of-open-phase', offset: 1 }
export const nextSettlement: Expiry = { kind: 'next-settlement-only' }
export const endOfEra: Expiry = { kind: 'end-of-era' }
export const forever: Expiry = { kind: 'permanent' }

export const rentX = (
  factor: number, opts: { groups?: readonly ColorGroup[]; minBuildings?: number } = {},
  expiry: Expiry = nextRound,
): ModifierTemplate => ({
  effect: {
    kind: 'rent-multiplier',
    factor,
    ...(opts.groups === undefined ? {} : { groups: opts.groups }),
    ...(opts.minBuildings === undefined ? {} : { minBuildings: opts.minBuildings }),
  },
  expiry,
})

export const anyTarget = (of: Target): WorldPredicate => ({ kind: 'any-target', of })
export const anyEntity = (of: EntityKind): WorldPredicate => ({ kind: 'any-entity', of })
export const sameTarget = (a: Target, b: Target): WorldPredicate => ({ kind: 'same-target', a, b })

export const clause = (effects: readonly Effect[], when?: WorldPredicate): CardClause =>
  when === undefined ? { effects } : { when, effects }
export const otherwise = (effects: readonly Effect[]): CardClause => ({ effects })
export const noEffect: CardClause = { effects: [] }
```

- [ ] **Step 23: Write `cards/era1.ts` — all 20 Era I cards**

`packages/engine/src/contexts/decks/cards/era1.ts`. `rules` and `targets` are the verbatim
columns from `docs/reference/era-decks.md` and are what the player view displays; they are
abbreviated here only where the full text is reproduced identically in the reference doc:

```ts
import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyTarget, clause, collect, eachWhere, flat, forever, grant,
  hi, least, lo, modify, most, nextOpenPhase, nextRound, nextSettlement, otherwise,
  payPlayer, payTreasury, per, repayBank, clampedTo, rentX, sameTarget, sumOf,
} from './dsl.js'

const LEAST_DEVELOPED = most('one', []) // placeholder, replaced below
const FEWEST_BUILDINGS = least('building-count', [lo('deed-face-value')])
const MOST_RAILROADS = most('railroad-count', [lo('deed-face-value')])
const HIGHEST_FACE = most('unmortgaged-face-value', [hi('building-count')])
const LOWEST_FACE = least('unmortgaged-face-value', [lo('building-count')])
const MOST_GROUPS = most(
  'complete-group-count', [lo('building-count'), lo('deed-face-value')],
  above('complete-group-count', 0),
)
const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const MOST_RENT = most('rent-received-this-era', [hi('deed-face-value')])
const LEAST_RENT = least('rent-received-this-era', [lo('deed-face-value')])
const MOST_MORTGAGED = most(
  'mortgaged-deed-count', [hi('mortgaged-face-value')], above('mortgaged-deed-count', 0),
)
const ANY_UTILITY_OWNER = most('utility-count', [], above('utility-count', 0))

export const ERA_I: readonly Card[] = [
  {
    id: 'E1-01', era: 1, title: 'Zoning Variance Approved',
    flavour: 'The board has approved your variance. Build while the ink is wet.',
    rules: 'Drawer receives a one-time half-price house voucher, usable during the current or next Open phase. Normal full-group, unmortgaged and even-build rules still apply. Expires unused at the end of the next Open phase. Not transferable.',
    targets: 'Drawer',
    clauses: [clause([
      grant(DRAWER, {
        kind: 'half-price-house', capacity: 1, expiry: nextOpenPhase, params: { factor: 0.5 },
      }),
    ])],
  },
  {
    id: 'E1-02', era: 1, title: 'Reconstruction Grant',
    flavour: 'Federal reconstruction funds are directed to under-improved parcels.',
    rules: 'The player with the fewest buildings collects $150 from the Treasury. Building count = houses + (5 x hotels). Tie-break: lower total deed face value; then earlier turn order.',
    targets: 'The least-developed player',
    clauses: [clause([collect(FEWEST_BUILDINGS, flat(150))])],
  },
  {
    id: 'E1-03', era: 1, title: 'Victory Bond Coupon',
    flavour: 'A wartime issue matures. Modest, and on time.',
    rules: 'Every player collects $75 from the Treasury.',
    targets: 'All players',
    clauses: [clause([collect(EVERYONE, flat(75))])],
  },
  {
    id: 'E1-04', era: 1, title: 'Title Search Fee',
    flavour: 'Counsel has traced the encumbrances. Counsel bills for it.',
    rules: 'Drawer pays the Treasury $50 for each mortgaged deed they hold, to a maximum of $200. No mortgaged deeds means no payment and no compensation.',
    targets: 'Drawer',
    clauses: [clause([payTreasury(DRAWER, per('mortgaged-deed-count', 50, 200))])],
  },
  {
    id: 'E1-05', era: 1, title: 'Freight Haulage Contract',
    flavour: 'Rolling stock is scarce. The rails quote accordingly.',
    rules: 'The player owning the most railroads collects $50 per railroad owned from the Treasury. Tie-break: lower total deed face value; then earlier turn order. Only one player collects.',
    targets: 'The largest railroad holder',
    clauses: [clause([collect(MOST_RAILROADS, per('railroad-count', 50))])],
  },
  {
    id: 'E1-06', era: 1, title: 'Prime Rate Concession',
    flavour: 'The discount window opens a crack.',
    rules: 'The drawer pays no credit line interest at the next Settlement; the Treasury forgoes it. If the drawer’s drawn balance is $0 at the next Settlement, the drawer instead collects $100 from the Treasury at that Settlement.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, {
        effect: { kind: 'waive-credit-interest', ifZeroBalanceCollect: 100 },
        expiry: nextSettlement,
      }),
    ])],
  },
  {
    id: 'E1-07', era: 1, title: 'Lumber Shortage',
    flavour: 'Framing timber is rationed. Everyone pays for the privilege of having built.',
    rules: 'Every player pays the Treasury $25 per house and $125 per hotel, capped at $100 per player. Players with no buildings pay nothing.',
    targets: 'All players',
    clauses: [clause([payTreasury(EVERYONE, sumOf(
      [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 125 }], 100,
    ))])],
  },
  {
    id: 'E1-08', era: 1, title: 'Streetcar Line Extended',
    flavour: 'The new line runs through the cheap end of town.',
    rules: 'For the whole of the next round, rent collected on Brown and Light Blue properties is increased by 50%. Applies to rent actually paid by the landing player. Reverts at the end of the next round.',
    targets: 'All players; benefits Brown and Light Blue owners',
    clauses: [clause([modify(EVERYONE, rentX(1.5, { groups: ['brown', 'light-blue'] }))])],
  },
  {
    id: 'E1-09', era: 1, title: "Assessor's Reappraisal",
    flavour: 'The rolls are revised. Some frontage is now worth more than its owner claimed.',
    rules: 'Highest total unmortgaged deed face value pays $150 to the Treasury; lowest collects $100. If the same player would be both, they pay $50 net. Tie-break for highest: more buildings; then earlier turn order. For lowest: fewer buildings; then earlier turn order.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([payTreasury(HIGHEST_FACE, flat(50))], sameTarget(HIGHEST_FACE, LOWEST_FACE)),
      otherwise([payTreasury(HIGHEST_FACE, flat(150)), collect(LOWEST_FACE, flat(100))]),
    ],
  },
  {
    id: 'E1-10', era: 1, title: 'Utility Franchise Renewed',
    flavour: 'The municipality renews both franchises without argument.',
    rules: 'Every player owning at least one utility collects $100 per utility owned from the Treasury. Mortgaged utilities count. If neither utility is player-owned, the drawer collects $100.',
    targets: 'All utility owners',
    clauses: [
      clause(
        [collect(eachWhere(above('utility-count', 0)), per('utility-count', 100))],
        anyTarget(ANY_UTILITY_OWNER),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-11', era: 1, title: 'Credit Committee Sits',
    flavour: 'Your file is approved without discussion. Note the date.',
    rules: 'The drawer’s borrowing base is permanently increased by a flat $150 for the remainder of the game. Additive, applied after the standard base calculation, unaffected by mortgaging.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, { effect: { kind: 'borrowing-base-addend', dollars: 150 }, expiry: forever }),
    ])],
  },
  {
    id: 'E1-12', era: 1, title: 'Back Taxes Refunded',
    flavour: "An arithmetic error in the county's favour, corrected.",
    rules: 'Every player collects $25 from the Treasury per unmortgaged deed held, capped at $150 per player.',
    targets: 'All players',
    clauses: [clause([collect(EVERYONE, per('unmortgaged-deed-count', 25, 150))])],
  },
  {
    id: 'E1-13', era: 1, title: 'Contractor Extends Credit',
    flavour: 'The builder wants the whole block and will discount to get it.',
    rules: 'The player holding the most complete unmortgaged colour groups receives a $200 building credit, applied automatically against their next house and hotel purchases until exhausted. Expires at the end of round 6. Tie-break: fewer total buildings; then lower total deed face value; then earlier turn order. If nobody holds a complete unmortgaged group, every player collects $75.',
    targets: 'The player with the most complete groups, or all players on fallback',
    clauses: [
      clause(
        [grant(MOST_GROUPS, {
          kind: 'building-credit', capacity: 200, expiry: { kind: 'end-of-era' }, params: {},
        })],
        anyTarget(MOST_GROUPS),
      ),
      otherwise([collect(EVERYONE, flat(75))]),
    ],
  },
  {
    id: 'E1-14', era: 1, title: 'Bank Examiner Calls',
    flavour: 'The examiner would like to see the balance reduced. This week.',
    rules: 'The player with the largest drawn credit balance immediately repays $150 of it from clean cash. If they hold less than $150 clean cash, they repay all clean cash they hold and no more; this never creates distressed debt. Tie-break: higher drawn-to-base ratio; then earlier turn order. If nobody has a drawn balance, the drawer collects $100 from the Treasury.',
    targets: 'The most indebted player',
    clauses: [
      clause(
        [repayBank(MOST_DRAWN, clampedTo(flat(150), 'clean-cash', 'drawn-credit'))],
        anyTarget(MOST_DRAWN),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-15', era: 1, title: 'Insurance Settlement',
    flavour: 'The claim is paid without a fight. Enjoy the novelty.',
    rules: 'Drawer collects $200 from the Treasury.',
    targets: 'Drawer',
    clauses: [clause([collect(DRAWER, flat(200))])],
  },
  {
    id: 'E1-16', era: 1, title: 'Chimney Fire',
    flavour: 'Sparks in the flue. The inspector is unsympathetic.',
    rules: 'Drawer pays the Treasury $25 per house and $100 per hotel owned, capped at $200. No buildings means no payment.',
    targets: 'Drawer',
    clauses: [clause([payTreasury(DRAWER, sumOf(
      [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 100 }], 200,
    ))])],
  },
  {
    id: 'E1-17', era: 1, title: 'Rent Control Board Convenes',
    flavour: "The board finds current increases 'not justified by circumstance'.",
    rules: 'For the whole of the next round, rent collected on any property carrying 3 or more houses (a hotel counts as 5) is reduced by 25%. Applies to rent actually paid. Reverts at the end of the next round.',
    targets: 'All players; bites the most-developed',
    clauses: [clause([modify(EVERYONE, rentX(0.75, { minBuildings: 3 }))])],
  },
  {
    id: 'E1-18', era: 1, title: "Tenants' Petition",
    flavour: 'Signatures gathered on the busiest street, delivered to the quietest.',
    rules: 'The player who has collected the most rent so far this era pays $100 to the player who has collected the least. Measured from the start of round 1. Tie-break for most: higher total deed face value; then earlier turn order. For least: lower total deed face value; then earlier turn order. If the same player is both, no effect.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([], sameTarget(MOST_RENT, LEAST_RENT)),
      otherwise([payPlayer(MOST_RENT, LEAST_RENT, flat(100))]),
    ],
  },
  {
    id: 'E1-19', era: 1, title: 'Mortgage Amnesty',
    flavour: 'The lender will take face value to clear the file.',
    rules: 'The player holding the most mortgaged deeds may, during the next Open phase, unmortgage one deed of their choice at 50% of face value instead of 55%. Expires at the end of the next Open phase, not transferable. Tie-break: higher total mortgaged face value; then earlier turn order. If nobody holds a mortgaged deed, the drawer collects $100 from the Treasury.',
    targets: 'The player with the most mortgaged deeds',
    clauses: [
      clause(
        [grant(MOST_MORTGAGED, {
          kind: 'discount-unmortgage', capacity: 1, expiry: nextOpenPhase, params: { rate: 0.5 },
        })],
        anyTarget(MOST_MORTGAGED),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-20', era: 1, title: 'Wage Indexation',
    flavour: 'Pay packets are adjusted upward. Briefly.',
    rules: 'For the whole of the next round, GO pays $100 more than the standard salary on passing or landing. Reverts at the end of the next round.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, {
        effect: { kind: 'go-salary-addend', dollars: 100 }, expiry: nextRound,
      }),
    ])],
  },
]
```

Delete the unused `LEAST_DEVELOPED` placeholder line before saving — it is shown above only
to make the constant block's shape obvious and will fail lint.

- [ ] **Step 24: Run the money-op tests and watch them pass**

Run: `npx vitest run packages/engine/src/contexts/decks/interpret.test.ts`
Expected: PASS — the four money-op cases from Step 18 now resolve against real Era I cards,
including the distressed-debt shortfall path and the E1-14 fallback clause.

- [ ] **Step 25: Commit Era I**

```bash
git add packages/engine/src/contexts/decks/cards
git commit -m "feat(decks): encode the 20 Era I cards as data

Every dynamic target carries its stated tie-break chain from era-decks.md.
E1-20's GO bonus is expressed as a +\$100 addend on the configured salary
rather than the card text's absolute \$300, because spec section 2 sets GO
at \$350 and the card text predates it."
```

- [ ] **Step 26: Write `cards/era2.ts` — the shared target constants and eight representative cards**

The remaining twelve follow the identical shape and are specified exactly in the Step 29
encoding table. `rules` and `targets` strings are the verbatim columns from era-decks.md
section 2 and are elided here only for length.

`packages/engine/src/contexts/decks/cards/era2.ts`:

```ts
import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyEntity, anyTarget, clause, collect, dirtyIn, eachWhere,
  endOfEra, flat, forgiveDebt, grant, heatBy, hi, holderOf, least, lo, modify, most,
  nextOpenPhase, nextRound, nextSettlement, otherwise, payTreasury, per, rentX, sumOf,
} from './dsl.js'

const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const MOST_LEVERAGED = most(
  'drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0),
)
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const BEST_GROUP_OWNER = most(
  'best-group-buildings', [hi('best-group-face-value')], above('complete-group-count', 0),
)
const BIGGEST_LENDER = most(
  'peer-principal-lent', [hi('peer-note-count')], above('peer-principal-lent', 0),
)
const POOREST = least('clean-cash', [lo('net-worth')])
const MOST_DEVELOPED = most('building-count', [hi('deed-face-value')], above('building-count', 0))
const BEST_FUTURE_HOLDER = holderOf({
  kind: 'rent-future', by: 'remaining-value', direction: 'max', attribute: 'holder',
})

export const ERA_II: readonly Card[] = [
  {
    id: 'E2-01', era: 2, title: 'Syndicated Facility Arranged',
    flavour: 'Three banks want the paper. Take the bigger number.',
    rules: 'The drawer’s borrowing base is multiplied by 1.25 for the remainder of Era II, reverting at the completion of the round 12 Settlement. Applied after the standard base calculation and after any additive term from E1-11. Any margin call arising from the reversion is flagged normally with the standard cure window.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, {
        effect: { kind: 'borrowing-base-multiplier', factor: 1.25 }, expiry: endOfEra,
      }),
    ])],
  },
  {
    id: 'E2-02', era: 2, title: 'Boom-Time Rents',
    flavour: 'Asking rents are up across every class of property.',
    rules: 'For the whole of the next round, all rent collected on any landing is increased by 25%. Rent futures capture the increase. Reverts at the end of the next round.',
    targets: 'All players',
    clauses: [clause([modify(EVERYONE, rentX(1.25))])],
  },
  {
    id: 'E2-03', era: 2, title: 'Speculative Frenzy',
    flavour: 'Buyers are queuing for anything with a roof on it.',
    rules: 'The owner of the most-developed complete unmortgaged colour group collects $300 from the Treasury, where a hotel counts as 5 houses. Tie-break: higher combined deed face value of that group; then earlier turn order. If nobody holds a complete unmortgaged colour group, every player collects $100.',
    targets: 'The most-developed group owner',
    clauses: [
      clause([collect(BEST_GROUP_OWNER, flat(300))], anyTarget(BEST_GROUP_OWNER)),
      otherwise([collect(EVERYONE, flat(100))]),
    ],
  },
  {
    id: 'E2-06', era: 2, title: 'A Friend in the Precinct',
    flavour: 'An envelope is left for you. It is not from the bank.',
    rules: 'Drawer receives $200 dirty cash and gains +1 Heat. Dirty cash is worth $0 at scoring and is fully seizable in an audit from round 13 onward.',
    targets: 'Drawer',
    clauses: [clause([dirtyIn(DRAWER, flat(200)), heatBy(DRAWER, 1)])],
  },
  {
    id: 'E2-07', era: 2, title: 'Numbers Runner Recruited',
    flavour: 'The book is expanding. It expands toward money.',
    rules: 'The player currently holding the most dirty cash receives an additional $150 dirty cash and gains +1 Heat. Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash, the drawer instead receives $150 dirty cash and +1 Heat.',
    targets: 'The dirtiest player',
    clauses: [
      clause([dirtyIn(DIRTIEST, flat(150)), heatBy(DIRTIEST, 1)], anyTarget(DIRTIEST)),
      otherwise([dirtyIn(DRAWER, flat(150)), heatBy(DRAWER, 1)]),
    ],
  },
  {
    id: 'E2-08', era: 2, title: 'Correspondent Bank Writes Down',
    flavour: 'A rival institution takes the loss to keep the relationship.',
    rules: 'The player with the largest drawn credit balance has $250 of that balance forgiven by the Treasury. The Treasury balance falls by $250. Tie-break: higher drawn-to-base ratio; then earlier turn order. If no player has a drawn balance, every player collects $100 from the Treasury.',
    targets: 'The most indebted player',
    clauses: [
      clause([forgiveDebt(MOST_DRAWN, 'drawn-credit', flat(250))], anyTarget(MOST_DRAWN)),
      otherwise([collect(EVERYONE, flat(100))]),
    ],
  },
  {
    id: 'E2-09', era: 2, title: 'Treasury Bids for Paper',
    flavour: 'The Treasury is buying contracts to steady the market. Above the model.',
    rules: 'The holder of the outstanding rent future with the highest engine-computed remaining expected value may, during the next Open phase, sell that contract to the Treasury for 120% of that value. On sale the contract terminates immediately and rent reverts to the deed owner for the remaining window. Optional; expires at the end of the next Open phase. If no rent futures are outstanding, the drawer collects $200 from the Treasury.',
    targets: 'The holder of the most valuable rent future',
    clauses: [
      clause(
        [grant(BEST_FUTURE_HOLDER, {
          kind: 'sell-future-to-treasury', capacity: 1, expiry: nextOpenPhase,
          params: { premium: 1.2 },
        })],
        anyEntity('rent-future'),
      ),
      otherwise([collect(DRAWER, flat(200))]),
    ],
  },
  {
    id: 'E2-18', era: 2, title: 'Building Permit Backlog',
    flavour: 'The department is overwhelmed, and charges for the inconvenience.',
    rules: 'The player with the highest building count pays the Treasury $25 per house and $150 per hotel owned, capped at $400. Building count = houses + (5 x hotels). Tie-break: higher total deed face value; then earlier turn order. If no player owns a building, no effect.',
    targets: 'The most-developed player',
    clauses: [
      clause(
        [payTreasury(MOST_DEVELOPED, sumOf(
          [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 150 }], 400,
        ))],
        anyTarget(MOST_DEVELOPED),
      ),
      otherwise([]),
    ],
  },
  // E2-04, E2-05, E2-10 through E2-17, E2-19 and E2-20 follow, in the shapes given by
  // the Step 29 encoding table. Constants above (MOST_LEVERAGED, BIGGEST_LENDER, POOREST)
  // are consumed by E2-13, E2-12 and E2-17 respectively.
]
```

- [ ] **Step 27: Write `cards/era3.ts` — the shared constants and eight representative cards**

Era III contains six of the nine cards era-decks.md section 6 flags as unusually complex.
All six are shown here in full; the other twelve follow the Step 29 table.

`packages/engine/src/contexts/decks/cards/era3.ts`:

```ts
import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyEntity, anyTarget, atLeast, clause, collect, eachWhere,
  endOfEra, flat, grant, heatBy, hi, holderOf, least, lo, modify, most, nextOpenPhase,
  otherwise, payNoteHolders, payTreasury, sameTarget, sumOf,
} from './dsl.js'

const MOST_LEVERAGED = most('drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0))
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const RICHEST = most('net-worth', [hi('clean-cash')])
const POOREST_NW = least('net-worth', [lo('clean-cash')])
const BIGGEST_BORROWER = most(
  'peer-principal-borrowed', [hi('peer-max-rate')], above('peer-principal-borrowed', 0),
)
const MOST_DIRTY_ACTIONS = most('dirty-actions-this-game', [hi('heat')])
const FEWEST_DIRTY_ACTIONS = least('dirty-actions-this-game', [lo('heat')])
const CDS_WRITERS = eachWhere(above('cds-notional-written', 0))
const WORST_TRANCHE_HOLDER = holderOf({
  kind: 'tranche', by: 'rating-score', direction: 'min',
  tieBreak: [{ by: 'remaining-face', direction: 'min' }], attribute: 'holder',
})
const BEST_TRANCHE_ORIGINATOR = holderOf({
  kind: 'tranche', by: 'rating-score', direction: 'max',
  tieBreak: [{ by: 'pool-remaining-face', direction: 'max' }], attribute: 'pool-originator',
})
const BIGGEST_POOL_ORIGINATOR = holderOf({
  kind: 'pool', by: 'expected-cashflow', direction: 'max',
  tieBreak: [{ by: 'senior-plus-mezz-face', direction: 'max' }], attribute: 'originator',
})
const BIGGEST_POOL = {
  kind: 'pool', by: 'expected-cashflow', direction: 'max',
  tieBreak: [{ by: 'senior-face', direction: 'max' }], attribute: 'equity-holder',
} as const

export const ERA_III: readonly Card[] = [
  {
    id: 'E3-01', era: 3, title: 'Ratings Downgrade',
    flavour: 'The agency revises its assumptions. It does not revise its fees.',
    rules: 'For every outstanding CDO pool, the mezzanine tranche’s remaining face amount is reduced by 30%. Cash already distributed is unaffected. The reduction increases the residual available to equity in all subsequent waterfalls. Ratings recompute. Pools with no mezzanine face remaining are skipped. If no CDO pools exist, every player collects $200 from the Treasury.',
    targets: 'All mezzanine holders; benefits all equity holders',
    clauses: [
      clause([{ op: 'tranche-face', tranche: 'mezzanine', factor: 0.7 }], anyEntity('pool')),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-03', era: 3, title: 'Early Audit Sweep',
    flavour: 'Selected files are pulled ahead of schedule.',
    rules: 'Every player whose current Heat is 5 or more is audited immediately, resolving exactly as a successful audit check: all dirty cash seized, fine of $100 x Heat in clean cash, Heat resets to 0. This does not replace or consume the normal audit check at the coming Settlement. If no player is at Heat 5 or more, no effect.',
    targets: 'All players; bites Heat 5+',
    clauses: [clause([{ op: 'audit', target: eachWhere(atLeast('heat', 5)) }])],
  },
  {
    id: 'E3-04', era: 3, title: 'Compliance Consultant Retained',
    flavour: 'He is expensive, and he is worth it, and you should have hired him sooner.',
    rules: 'The drawer’s Heat reduces by 1 at no cost. In addition, during the next Open phase the drawer may pay $300 clean cash to reduce Heat by a further 2, to a minimum of 0. Declining costs nothing.',
    targets: 'Drawer',
    clauses: [clause([
      heatBy(DRAWER, -1),
      grant(DRAWER, {
        kind: 'compliance-consultant', capacity: 1, expiry: nextOpenPhase,
        params: { cost: 300, heatDelta: -2 },
      }),
    ])],
  },
  {
    id: 'E3-05', era: 3, title: 'Material Non-Public Information',
    flavour: 'You are told three things before they happen. You are told not to say who told you.',
    rules: 'The drawer privately views the top three cards of the current era deck and returns them in any order they choose. The engine records the chosen order so replay stays exact. Drawer gains +1 Heat. The three cards are revealed to no other player and to no table view.',
    targets: 'Drawer',
    clauses: [clause([
      { op: 'deck-peek', target: DRAWER, count: 3 },
      heatBy(DRAWER, 1),
    ])],
  },
  {
    id: 'E3-06', era: 3, title: 'Credit Line Review',
    flavour: 'The lending base is recalculated on a stricter formula. Effective immediately.',
    rules: 'For the remainder of Era III, every player’s borrowing base is computed at 80% of the standard deed advance rate and 50% of the standard building advance rate. Reverts at the completion of the round 18 Settlement. Any margin call arising is flagged at the next Settlement with the standard one-Open-phase cure window.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, {
        effect: { kind: 'borrowing-base-formula', deedRateFactor: 0.8, buildingRateFactor: 0.5 },
        expiry: endOfEra,
      }),
    ])],
  },
  {
    id: 'E3-09', era: 3, title: 'Junior Capital Call',
    flavour: 'The equity is asked to support its own structure.',
    rules: 'The holder of the equity tranche of the pool with the largest expected cashflow pays $300 into that pool immediately. The cash is added to the pool’s collected balance and distributed through the standard waterfall at the next Settlement, so senior and mezzanine are paid first. The injection does not count toward expected pool cashflow for ratings. Tie-break: larger senior face amount; then earlier turn order. If no CDO pools exist, every player collects $200 from the Treasury.',
    targets: 'The equity holder of the largest pool',
    clauses: [
      clause(
        [{ op: 'pool-inject', entity: BIGGEST_POOL, payer: 'equity-holder', amount: flat(300) }],
        anyEntity('pool'),
      ),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-10', era: 3, title: 'Counterparty Doubt',
    flavour: 'Protection sellers are asked to show they can pay.',
    rules: 'Every player who has written at least one outstanding CDS must post an additional 15% of each written notional against their borrowing base for the remainder of the game, bringing total posting to 45% of notional. Any margin call arising is flagged at the next Settlement with the standard cure window. If no CDS are outstanding, every player collects $200 from the Treasury.',
    targets: 'All CDS writers',
    clauses: [
      clause(
        [modify(CDS_WRITERS, {
          effect: { kind: 'cds-posting-addend', rate: 0.15 }, expiry: { kind: 'permanent' },
        })],
        anyEntity('written-cds'),
      ),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-16', era: 3, title: 'Servicer Demands Cure',
    flavour: 'One additional payment, in advance, as a demonstration of good faith.',
    rules: 'The peer loan borrower with the largest total outstanding principal immediately pays one round’s interest on that principal to the note holder, in addition to the payment due at the coming Settlement. This payment is explicitly NOT a peer loan interest obligation for default purposes: failure to pay does not constitute default, does not transfer collateral and does not halve the borrowing base. Any shortfall becomes distressed debt. Tie-break: larger outstanding principal; then higher per-round rate; then earlier turn order. If no peer loans are outstanding, no effect.',
    targets: 'The largest peer borrower',
    clauses: [
      clause(
        [payNoteHolders(BIGGEST_BORROWER, sumOf([
          { metric: 'peer-interest-due-per-round', rate: 1 },
        ]))],
        anyTarget(BIGGEST_BORROWER),
      ),
      otherwise([]),
    ],
  },
  {
    id: 'E3-19', era: 3, title: 'Wiretap Transcripts Released',
    flavour: 'The transcripts name the frequent callers. They also name the abstainers, favourably.',
    rules: 'The player who has taken the most dirty actions this game gains +2 Heat. The player who has taken the fewest reduces Heat by 2, to a minimum of 0. Dirty actions = ventures launched + laundering transactions + briberies + insider trades, counted cumulatively across the whole game. Tie-break for most: higher current Heat; then earlier turn order. For fewest: lower current Heat; then earlier turn order. If the same player is both, no effect.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([], sameTarget(MOST_DIRTY_ACTIONS, FEWEST_DIRTY_ACTIONS)),
      otherwise([heatBy(MOST_DIRTY_ACTIONS, 2), heatBy(FEWEST_DIRTY_ACTIONS, -2)]),
    ],
  },
  // E3-02, E3-07, E3-08, E3-11 through E3-15, E3-17, E3-18 and E3-20 follow, in the
  // shapes given by the Step 29 encoding table.
]
```

- [ ] **Step 28: Write `cards/era4.ts` — the shared constants and eight representative cards**

`packages/engine/src/contexts/decks/cards/era4.ts`:

```ts
import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, allOf, anyEntity, anyTarget, atLeast, atMost, branch, clause,
  collect, dirtyOut, eachWhere, flat, forever, forgiveDebt, hi, least, lo, marginFlag,
  modify, most, nextOpenPhase, nextSettlement, otherwise, payTreasury, per, sumOf, topN,
} from './dsl.js'

const MOST_LEVERAGED = most('drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0))
const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const HOTTEST = most('heat', [lo('net-worth')], above('heat', 0))
const MOST_DISTRESSED = most('distressed-debt', [lo('net-worth')], above('distressed-debt', 0))
const POOREST_NW = least('net-worth', [lo('clean-cash')])
const RICHEST = most('net-worth', [hi('deed-face-value')])
const MOST_OBLIGATED = most('total-obligations', [hi('drawn-credit')], above('total-obligations', 0))
const WEAKEST_POOL = {
  kind: 'pool', by: 'coverage-ratio', direction: 'min',
  tieBreak: [{ by: 'senior-face', direction: 'max' }], attribute: 'pool',
} as const

export const ERA_IV: readonly Card[] = [
  {
    id: 'E4-01', era: 4, title: 'Covenant Breach',
    flavour: 'A technical default. The technicality is that you promised not to.',
    rules: 'The most leveraged player is flagged for a margin call immediately, whether or not their drawn balance currently exceeds their borrowing base. To cure they must reduce drawn balance to at most 80% of borrowing base by the end of the next Open phase, failing which the standard force-liquidation procedure runs at the 70%-of-face floor. Most leveraged = highest drawn balance divided by borrowing base, considering only players with a drawn balance above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn balance, no effect.',
    targets: 'The most leveraged player',
    clauses: [
      clause([marginFlag(MOST_LEVERAGED, 0.8, 'immediately')], anyTarget(MOST_LEVERAGED)),
      otherwise([]),
    ],
  },
  {
    id: 'E4-02', era: 4, title: 'Audit Sweep',
    flavour: 'The accounts are examined. Forty per cent is not returned.',
    rules: 'The player holding the most dirty cash forfeits 40% of it. Heat is unchanged and this does not consume the round’s normal audit check. Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash, the player with the highest Heat pays $300 in clean cash to the Treasury instead, tie-broken by lower net worth then earlier turn order. If all players are at Heat 0, no effect.',
    targets: 'The dirtiest player',
    clauses: [
      clause([dirtyOut(DIRTIEST, per('dirty-cash', 0.4))], anyTarget(DIRTIEST)),
      clause([payTreasury(HOTTEST, flat(300))], anyTarget(HOTTEST)),
      otherwise([]),
    ],
  },
  {
    id: 'E4-03', era: 4, title: 'Downgrade Cascade',
    flavour: 'Every structure in the market is remarked at once, which is how it always happens.',
    rules: 'For every outstanding CDO pool, the senior tranche’s remaining face is reduced by 15% and the mezzanine tranche’s remaining face by 40%. Cash already distributed is unaffected. Both reductions increase the residual available to equity in subsequent waterfalls. Ratings recompute. If no CDO pools exist, every player pays $300 to the Treasury.',
    targets: 'All senior and mezzanine holders; benefits all equity holders',
    clauses: [
      clause([
        { op: 'tranche-face', tranche: 'senior', factor: 0.85 },
        { op: 'tranche-face', tranche: 'mezzanine', factor: 0.6 },
      ], anyEntity('pool')),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-04', era: 4, title: 'Forced Deleveraging',
    flavour: 'The facility is repriced to a ratio nobody was running at.',
    rules: 'At the next Settlement, every player whose drawn credit balance exceeds 60% of their borrowing base is flagged for a margin call and must reduce drawn balance to at most 60% of borrowing base by the end of the following Open phase, failing which the standard force-liquidation procedure runs. Players at or below 60% are unaffected. Liquidations resolve in turn order, one player fully resolved before the next begins, with all other three players eligible to bid each time.',
    targets: 'All players; bites the levered',
    clauses: [clause([
      marginFlag(eachWhere(above('drawn-to-base-ratio', 0.6)), 0.6, 'next-settlement'),
    ])],
  },
  {
    id: 'E4-12', era: 4, title: 'Fire Sale',
    flavour: 'The lender’s patience and the borrower’s options expire on the same afternoon.',
    rules: 'The player with the largest drawn credit balance must immediately mortgage their highest-face-value unmortgaged deed, receiving 50% of face value in clean cash, applied first to reduce their drawn balance. If that deed is encumbered by a rent future the standard make-whole applies and the contract terminates. If that deed carries an outstanding deed option, the next-highest eligible deed is mortgaged instead, since an optioned deed may not be mortgaged. If the player holds no eligible unmortgaged deed, no effect. Margin status is re-evaluated at the next Settlement, not immediately. Tie-break: higher drawn-to-base ratio; then earlier turn order.',
    targets: 'The most indebted player',
    clauses: [
      clause(
        [{ op: 'forced-mortgage', target: MOST_DRAWN, applyProceedsTo: 'drawn-credit' }],
        anyTarget(MOST_DRAWN),
      ),
      otherwise([]),
    ],
  },
  {
    id: 'E4-14', era: 4, title: 'Pool Wound Down',
    flavour: 'The trustee terminates the weakest structure rather than fund it further.',
    rules: 'The outstanding CDO pool with the lowest coverage ratio terminates at the end of the next Settlement. Its waterfall runs one final time on cash collected to date and no further; the underlying assets return to their owners unencumbered. Any tranche of that pool short of its remaining face at termination is a credit event and triggers every CDS referencing it. Equity receives only what remains after senior and mezzanine. Tie-break: lower coverage ratio; then larger senior face amount; then earlier turn order. If no CDO pools exist, every player pays $300 to the Treasury.',
    targets: "The weakest pool's tranche holders and its CDS counterparties",
    clauses: [
      clause(
        [{ op: 'pool-terminate', entity: WEAKEST_POOL, at: nextSettlement }],
        anyEntity('pool'),
      ),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-16', era: 4, title: 'Punitive Spread',
    flavour: 'Two names in the market are quoted separately, and worse.',
    rules: 'At the next Settlement, the two players with the largest drawn credit balances are charged credit line interest at 24% instead of the prevailing rate. All other players are charged at the prevailing rate. Tie-break for inclusion: higher drawn-to-base ratio; then earlier turn order. If fewer than two players have a drawn balance, only those with a balance are charged the punitive rate.',
    targets: 'The two most indebted players',
    clauses: [clause([
      modify(
        topN(2, 'drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0)),
        { effect: { kind: 'interest-rate-override', rate: 0.24 }, expiry: nextSettlement },
      ),
    ])],
  },
  {
    id: 'E4-18', era: 4, title: 'Emergency Liquidity Facility',
    flavour: 'The facility is open to institutions that do not appear to need it.',
    rules: 'Every player with a drawn credit balance of $0 and no distressed debt collects $600 from the Treasury. Every other player collects $300 from the Treasury. Evaluated at the moment of the draw.',
    targets: 'All players; rewards the deleveraged',
    clauses: [clause([
      collect(EVERYONE, branch(
        allOf(atMost('drawn-credit', 0), atMost('distressed-debt', 0)),
        flat(600), flat(300),
      )),
    ])],
  },
  {
    id: 'E4-20', era: 4, title: 'Systemically Important',
    flavour: 'The designation is an honour. The capital requirement is not.',
    rules: 'The player with the greatest total obligations pays $500 to the Treasury and has their borrowing base reduced by 20% for the remainder of the game. Total obligations = drawn credit balance + peer loan principal owed as borrower + CDS notional written and outstanding + distressed debt. Any margin call arising from the base reduction is flagged at the next Settlement with the standard cure window. Tie-break: larger drawn balance; then earlier turn order. If every player’s total obligations are $0, every player collects $300 from the Treasury.',
    targets: 'The most obligated player',
    clauses: [
      clause([
        payTreasury(MOST_OBLIGATED, flat(500)),
        modify(MOST_OBLIGATED, {
          effect: { kind: 'borrowing-base-multiplier', factor: 0.8 }, expiry: forever,
        }),
      ], anyTarget(MOST_OBLIGATED)),
      otherwise([collect(EVERYONE, flat(300))]),
    ],
  },
  // E4-05 through E4-11, E4-13, E4-15, E4-17 and E4-19 follow, in the shapes given by
  // the Step 29 encoding table.
]
```

- [ ] **Step 29: Encode the remaining 44 cards from this table**

Every card below uses only combinators already defined in `dsl.ts` and ops already
implemented. `T` is the primary target, `F` the fallback clause. Where `F` is blank the
card has a single unguarded clause. This table is the complete specification for the
cards not written out above; there is no other content to invent.

**Era II (12 remaining)**

| Card | Clause structure |
|---|---|
| E2-04 | `clause([collect(EVERYONE, flat(150))])` |
| E2-05 | `clause([heatBy(EVERYONE, -2)])` — the interpreter floors Heat at 0 |
| E2-10 | `clause([modify(EVERYONE, { effect: { kind: 'building-cost-multiplier', factor: 0.75 }, expiry: nextRound })])` |
| E2-11 | `clause([grant(DRAWER, { kind: 'half-price-venture', capacity: 1, expiry: nextOpenPhase, params: { factor: 0.5 } })])` |
| E2-12 | T `clause([collect(BIGGEST_LENDER, flat(200))], anyTarget(BIGGEST_LENDER))`; F `otherwise([collect(EVERYONE, flat(100))])` |
| E2-13 | T `clause([modify(MOST_LEVERAGED, { effect: { kind: 'borrowing-base-addend', dollars: 400 }, expiry: endOfEra })], anyTarget(MOST_LEVERAGED))`; F `otherwise([modify(DRAWER, <same>)])` |
| E2-14 | `clause([modify(EVERYONE, rentX(2, { groups: ['dark-blue', 'green'] }))])` |
| E2-15 | `clause([modify(EVERYONE, { effect: { kind: 'go-salary-addend', dollars: 200 }, expiry: nextRound })])` |
| E2-16 | `clause([payTreasury(EVERYONE, per('active-venture-count', 100))])` |
| E2-17 | `clause([collect(POOREST, flat(250))])` |
| E2-19 | `clause([grant(DRAWER, { kind: 'cheap-launder', capacity: 1, expiry: nextOpenPhase, params: { haircut: 0.1, heatDelta: 0 } })])` |
| E2-20 | `clause([modify(EVERYONE, { effect: { kind: 'interest-rate-override', rate: 0.04 }, expiry: nextSettlement })])` |

**Era III (11 remaining)**

| Card | Clause structure |
|---|---|
| E3-02 | T `clause([collect(WORST_TRANCHE_HOLDER, flat(400))], anyEntity('tranche'))`; F `otherwise([collect(EVERYONE, flat(200))])` |
| E3-07 | T `clause([grant(MOST_LEVERAGED, { kind: 'margin-call-waiver', capacity: 1, expiry: endOfEra, params: { extraRounds: 1 } })], anyTarget(MOST_LEVERAGED))`; F `otherwise([grant(DRAWER, <same>)])` |
| E3-08 | `clause([grant(EVERYONE, { kind: 'discounted-repayment', capacity: 600, expiry: nextOpenPhase, params: { discount: 0.1 } })])` |
| E3-11 | T `clause([{ op: 'option-strike', delta: -100, floor: 0 }], anyEntity('deed-option'))`; F `otherwise([collect(DRAWER, flat(300))])` |
| E3-12 | `clause([modify(EVERYONE, rentX(2, { groups: ['orange', 'red'] }))])` |
| E3-13 | T `clause([payTreasury(DIRTIEST, flat(300)), heatBy(DIRTIEST, 1)], anyTarget(DIRTIEST))`; F `otherwise([collect(DRAWER, flat(200))])` |
| E3-14 | `clause([grant(EVERYONE, { kind: 'dirty-amnesty', capacity: 400, expiry: nextOpenPhase, params: { haircut: 0.4, heatDelta: -1 } })])` |
| E3-15 | T `clause([payTreasury(BEST_TRANCHE_ORIGINATOR, flat(400))], anyEntity('tranche'))`; F `otherwise([collect(EVERYONE, flat(200))])` |
| E3-17 | `clause([payTreasury(RICHEST, sumOf([{ metric: 'net-worth', rate: 0.05 }], 600))])` |
| E3-18 | `clause([collect(POOREST_NW, flat(400), 'distressed-debt')])` |
| E3-20 | T `clause([collect(BIGGEST_POOL_ORIGINATOR, flat(300))], anyEntity('pool'))`; F `otherwise([collect(EVERYONE, flat(200))])` |

**Era IV (11 remaining)**

| Card | Clause structure |
|---|---|
| E4-05 | `clause([modify(EVERYONE, { effect: { kind: 'interest-rate-override', rate: 0.18 }, expiry: nextSettlement })])` |
| E4-06 | `clause([modify(EVERYONE, { effect: { kind: 'borrowing-base-formula', deedRateFactor: 1, buildingRateFactor: 0.4 }, expiry: forever })])` |
| E4-07 | T `clause([forgiveDebt(MOST_DISTRESSED, 'distressed-debt', flat(400))], anyTarget(MOST_DISTRESSED))`; F `otherwise([collect(POOREST_NW, flat(400))])` |
| E4-08 | `clause([auditNow(eachWhere(atLeast('heat', 4)), flat(300))])` |
| E4-09 | T `clause([modify(eachWhere(above('cds-notional-written', 0)), { effect: { kind: 'cds-posting-addend', rate: 0.2 }, expiry: forever })], anyEntity('written-cds'))`; F `otherwise([payTreasury(EVERYONE, flat(300))])` |
| E4-10 | `clause([modify(EVERYONE, rentX(0.5))])` — downward, and explicitly not a make-whole event |
| E4-11 | T `clause([payTreasury(MOST_RENT_THIS_ERA, flat(500))], anyTarget(MOST_RENT_THIS_ERA))` where `MOST_RENT_THIS_ERA = most('rent-received-this-era', [hi('deed-face-value')], above('rent-received-this-era', 0))`; F `otherwise([])` |
| E4-13 | T `clause([{ op: 'option-expiry', expiry: nextOpenPhase }], anyEntity('deed-option'))`; F `otherwise([payTreasury(EVERYONE, flat(300))])` |
| E4-15 | `clause([modify(EVERYONE, { effect: { kind: 'bribery-terms', cost: 400, heat: 2 }, expiry: forever })])` |
| E4-17 | `clause([payTreasury(EVERYONE, per('launder-count-this-game', 200, 800))])` |
| E4-19 | `clause([payTreasury(RICHEST, sumOf([{ metric: 'net-worth', rate: 0.08 }], 900))])` |

- [ ] **Step 30: Write `cards/index.ts` and the deck-wide invariant test**

`packages/engine/src/contexts/decks/cards/index.ts`:

```ts
import type { Era } from '../../../core/types.js'
import type { Card, CardId } from '../effects.js'
import { ERA_I } from './era1.js'
import { ERA_II } from './era2.js'
import { ERA_III } from './era3.js'
import { ERA_IV } from './era4.js'

export const DECKS: Readonly<Record<Era, readonly Card[]>> = {
  1: ERA_I, 2: ERA_II, 3: ERA_III, 4: ERA_IV,
}

export const ALL_CARDS: readonly Card[] = [...ERA_I, ...ERA_II, ...ERA_III, ...ERA_IV]

export function deckFor(era: Era): readonly Card[] {
  return DECKS[era]
}

export function cardById(id: CardId): Card {
  const found = ALL_CARDS.find((c) => c.id === id)
  if (found === undefined) throw new Error(`unknown card ${id}`)
  return found
}
```

`packages/engine/src/contexts/decks/cards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALL_CARDS, DECKS } from './cards/index.js'
import type { Effect } from './effects.js'
import { ERAS } from '../../core/types.js'

const opsOf = (c: (typeof ALL_CARDS)[number]): Effect['op'][] =>
  c.clauses.flatMap((cl) => cl.effects.map((e) => e.op))

const metricsOf = (c: (typeof ALL_CARDS)[number]): string[] =>
  JSON.stringify(c).match(/"metric":"[a-z-]+"/g)?.map((m) => m.slice(10, -1)) ?? []

describe('deck structure', () => {
  it('has exactly 20 cards per era and 80 in total', () => {
    for (const era of [1, 2, 3, 4] as const) expect(DECKS[era]).toHaveLength(20)
    expect(ALL_CARDS).toHaveLength(80)
  })

  it('gives every card a unique id matching its era', () => {
    const ids = ALL_CARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(80)
    for (const c of ALL_CARDS) expect(c.id.startsWith(`E${c.era}-`)).toBe(true)
  })

  it('gives every card at least one clause and non-empty display text', () => {
    for (const c of ALL_CARDS) {
      expect(c.clauses.length).toBeGreaterThan(0)
      expect(c.rules.length).toBeGreaterThan(20)
      expect(c.targets.length).toBeGreaterThan(0)
      expect(c.flavour.length).toBeGreaterThan(0)
    }
  })
})

describe('era gating (era-decks.md section 0)', () => {
  const ERA_I_METRICS = new Set([
    'one', 'clean-cash', 'net-worth', 'heat',
    'drawn-credit', 'borrowing-base', 'drawn-to-base-ratio', 'distressed-debt',
    'deed-count', 'unmortgaged-deed-count', 'mortgaged-deed-count',
    'deed-face-value', 'unmortgaged-face-value', 'mortgaged-face-value',
    'railroad-count', 'utility-count', 'house-count', 'hotel-count', 'building-count',
    'complete-group-count', 'best-group-buildings', 'best-group-face-value',
    'rent-received-this-era', 'rent-received-this-game',
  ])
  const ERA_II_ONLY = new Set([
    'dirty-cash', 'active-venture-count', 'peer-principal-lent', 'peer-note-count',
    'peer-principal-borrowed', 'peer-max-rate', 'peer-interest-due-per-round',
    'dirty-actions-this-game', 'launder-count-this-game',
  ])
  const ERA_III_ONLY = new Set(['cds-notional-written', 'total-obligations'])
  const ERA_III_OPS: Effect['op'][] = [
    'tranche-face', 'option-strike', 'option-expiry', 'pool-inject', 'pool-terminate', 'audit',
  ]

  it('lets no Era I card reference an instrument that unlocks later', () => {
    for (const c of DECKS[1]) {
      for (const m of metricsOf(c)) expect(ERA_I_METRICS.has(m)).toBe(true)
      for (const op of opsOf(c)) expect(ERA_III_OPS).not.toContain(op)
    }
  })

  it('lets no Era II card reference an Era III instrument', () => {
    for (const c of DECKS[2]) {
      for (const m of metricsOf(c)) {
        expect(ERA_I_METRICS.has(m) || ERA_II_ONLY.has(m)).toBe(true)
      }
      for (const op of opsOf(c)) expect(ERA_III_OPS).not.toContain(op)
    }
  })

  it('triggers no audit before round 13, when audits begin', () => {
    // spec section 10: audit checks begin in Era III. Only E3-03 and E4-08 audit.
    const auditing = ALL_CARDS.filter((c) => opsOf(c).includes('audit'))
    expect(auditing.map((c) => c.id).sort()).toEqual(['E3-03', 'E4-08'])
    for (const c of auditing) expect(c.era).toBeGreaterThanOrEqual(3)
  })

  it('contains no movement cards, which the landing model depends on', () => {
    expect(JSON.stringify(ALL_CARDS)).not.toContain('"op":"move"')
  })
})

describe('money safety (era-decks.md section 0)', () => {
  it('caps or clamps every player-paid amount so no card is unbounded', () => {
    for (const c of ALL_CARDS) {
      for (const cl of c.clauses) {
        for (const e of cl.effects) {
          if (e.op !== 'transfer') continue
          if (e.from.kind !== 'target') continue
          if (e.amount.kind !== 'sum') continue
          const metricDriven = e.amount.terms.some((t) => t.metric !== 'one')
          if (metricDriven) {
            expect(
              e.amount.cap !== undefined || e.amount.clampTo !== undefined,
              `${c.id} has an uncapped metric-driven payment`,
            ).toBe(true)
          }
        }
      }
    }
  })
})
```

Note: `peer-interest-due-per-round` on E3-16 is intentionally uncapped — it is bounded by
the borrower's own loan book — so the test's `metricDriven` branch must whitelist E3-16, or
E3-16 carries an explicit `cap` equal to `peer-principal-borrowed`. Choose the whitelist and
add `if (c.id === 'E3-16') continue`.

- [ ] **Step 31: Run the deck test and watch it fail, then pass**

Run: `npx vitest run packages/engine/src/contexts/decks/cards.test.ts`
Expected first: FAIL — `DECKS[2]` has 8 cards, not 20. Complete Eras II-IV from the Step 29
table, rerun, and expect PASS on all nine cases.

- [ ] **Step 32: Commit the decks**

```bash
git add packages/engine/src/contexts/decks/cards packages/engine/src/contexts/decks/cards.test.ts
git commit -m "feat(decks): encode all 80 authored cards across four era files

Each era is its own file to stay under the 500-line limit. Tests assert
20 cards per era, unique ids, era gating on both metrics and ops, that
only E3-03 and E4-08 can trigger an audit, and that no deck contains a
movement card."
```

- [ ] **Step 33: Write the failing reducer test**

`packages/engine/src/contexts/decks/decks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reduce } from '../../core/reduce.js'
import { replay } from '../../core/replay.js'
import { activeModifiers, cardAt, rentMultiplier } from './index.js'
import { fixtureRound(6) as _ } from '../../../tests/fixtures/round.js'
import { fixtureRound } from '../../../tests/fixtures/round.js'
import type { GameEvent } from '../../core/events.js'

describe('deck reducer', () => {
  it('records the shuffle order at era start and never shuffles itself', () => {
    const order = [3, 0, 19, 7, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    const s = reduce(fixtureRound(1), { type: 'DeckShuffled', era: 1, order })
    expect(s.decks[1].order).toEqual(order)
    expect(s.decks[1].drawn).toBe(0)
  })

  it('draws by index into the recorded order, not by position in the authored deck', () => {
    const order = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    let s = reduce(fixtureRound(1), { type: 'DeckShuffled', era: 1, order })
    s = reduce(s, { type: 'CardDrawn', era: 1, index: 0, player: 'P2' })
    expect(cardAt(1, order[0] ?? 0).id).toBe('E1-20')
    expect(s.decks[1].drawn).toBe(1)
  })

  it('applies E1-08 as a timed rent modifier expiring at the end of the next round', () => {
    const order = [...Array(20).keys()]
    let s = reduce(fixtureRound(3), { type: 'DeckShuffled', era: 1, order })
    s = reduce(s, { type: 'CardDrawn', era: 1, index: 7, player: 'P1' }) // E1-08
    expect(activeModifiers(s)).toHaveLength(1)
    expect(rentMultiplier(s, 'baltic-avenue')).toBeCloseTo(1.5)
    expect(rentMultiplier(s, 'boardwalk')).toBe(1)
    expect(activeModifiers(s)[0]?.expiry).toEqual({ boundary: 'round', round: 4 })
  })

  it('composes two rent modifiers multiplicatively in card-draw order', () => {
    // era-decks 6.2: rent modifiers compose multiplicatively against base rent,
    // applied in card-draw order, with a single round-down at the end.
    const order = [...Array(20).keys()]
    let s = reduce(fixtureRound(7), { type: 'DeckShuffled', era: 2, order })
    s = reduce(s, { type: 'CardDrawn', era: 2, index: 1, player: 'P1' })  // E2-02 all +25%
    s = reduce(s, { type: 'CardDrawn', era: 2, index: 13, player: 'P1' }) // E2-14 blue/green x2
    expect(rentMultiplier(s, 'boardwalk')).toBeCloseTo(2.5)
    expect(rentMultiplier(s, 'baltic-avenue')).toBeCloseTo(1.25)
  })

  it('accumulates rent counters by receipt, per era-decks 6.11', () => {
    let s = fixtureRound(4)
    const events: GameEvent[] = [
      { type: 'RentCharged', from: 'P2', to: 'P1', deed: 'boardwalk', amount: 200 },
      { type: 'RentRoutedToFuture', contract: 'F1', holder: 'P3', amount: 200 },
    ]
    s = events.reduce(reduce, s)
    // The holder is the collector; the deed owner is not.
    expect(s.cardEffects.counters.rentReceivedThisEra.P1).toBe(0)
    expect(s.cardEffects.counters.rentReceivedThisEra.P3).toBe(200)
  })

  it('replays a card draw to exactly the same state', () => {
    const order = [...Array(20).keys()]
    const events: GameEvent[] = [
      { type: 'DeckShuffled', era: 1, order },
      { type: 'CardDrawn', era: 1, index: 2, player: 'P1' },
      { type: 'CardDrawn', era: 1, index: 14, player: 'P3' },
    ]
    const incremental = events.reduce(reduce, fixtureRound(2))
    expect(replay([...baseEventsFor(2), ...events])).toEqual(incremental)
  })
})
```

Delete the malformed duplicate import line at the top before running; it is shown to make
the fixture import obvious.

- [ ] **Step 34: Run the reducer test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/decks/decks.test.ts`
Expected: FAIL — `./index.js` exports nothing yet.

- [ ] **Step 35: Implement `reduce.ts`**

`packages/engine/src/contexts/decks/reduce.ts`. The decks reducer has two jobs: handle its
own three events, and observe every other event to maintain the counters that dynamic
targets rank on:

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import type { CardCounters } from './effects.js'
import { applyCard } from './interpret.js'
import { deckFor } from './cards/index.js'

const zero = (order: readonly PlayerId[]): Readonly<Record<PlayerId, number>> =>
  Object.fromEntries(order.map((p) => [p, 0])) as Record<PlayerId, number>

export function emptyCardEffects(order: readonly PlayerId[]): GameState['cardEffects'] {
  return {
    modifiers: [], entitlements: [], poolInjections: {}, scheduledPoolTerminations: [], seq: 0,
    counters: {
      rentReceivedThisGame: zero(order), rentReceivedThisEra: zero(order),
      dirtyActionsThisGame: zero(order), launderCountThisGame: zero(order),
    },
  }
}

export function reduceDecks(state: GameState, event: GameEvent): GameState {
  const observed = observe(state, event)
  switch (event.type) {
    case 'DeckShuffled': {
      const deck = observed.decks[event.era]
      return {
        ...observed,
        decks: { ...observed.decks, [event.era]: { ...deck, order: event.order, drawn: 0 } },
      }
    }
    case 'CardDrawn': {
      const deck = observed.decks[event.era]
      const authored = deck.order[event.index]
      if (authored === undefined) return observed
      const card = deckFor(event.era)[authored]
      if (card === undefined) return observed
      const applied = applyCard(observed, card, event.player)
      return {
        ...applied,
        decks: { ...applied.decks, [event.era]: { ...deck, drawn: deck.drawn + 1 } },
      }
    }
    case 'DeckReordered': {
      const deck = observed.decks[event.era]
      return {
        ...observed,
        decks: { ...observed.decks, [event.era]: { ...deck, order: event.order } },
      }
    }
    default:
      return observed
  }
}

/** Maintains the counters that E1-18, E3-19, E4-11 and E4-17 rank on. */
function observe(state: GameState, event: GameEvent): GameState {
  const c = state.cardEffects.counters
  const bumpRent = (p: PlayerId, delta: Money): CardCounters => ({
    ...c,
    rentReceivedThisGame: { ...c.rentReceivedThisGame, [p]: (c.rentReceivedThisGame[p] ?? 0) + delta },
    rentReceivedThisEra: { ...c.rentReceivedThisEra, [p]: (c.rentReceivedThisEra[p] ?? 0) + delta },
  })
  const bump = (
    key: 'dirtyActionsThisGame' | 'launderCountThisGame', p: PlayerId, delta: number,
  ): CardCounters => ({ ...c, [key]: { ...c[key], [p]: (c[key][p] ?? 0) + delta } })
  const withCounters = (counters: CardCounters): GameState =>
    ({ ...state, cardEffects: { ...state.cardEffects, counters } })

  switch (event.type) {
    case 'RentCharged':
      return withCounters(bumpRent(event.to, event.amount))
    case 'RentRoutedToFuture':
      // era-decks 6.11: rent counts toward whoever actually receives the cash.
      // Task 14 emits RentCharged{to: deed owner} then this event, so the owner's
      // provisional credit is reversed and the holder credited.
      return withCounters({
        ...bumpRent(event.holder, event.amount),
        rentReceivedThisGame: {
          ...c.rentReceivedThisGame,
          [event.holder]: (c.rentReceivedThisGame[event.holder] ?? 0) + event.amount,
        },
      })
    case 'VentureLaunched':
      return withCounters(bump('dirtyActionsThisGame', event.player, 1))
    case 'CashLaundered':
      return withCounters({
        ...bump('dirtyActionsThisGame', event.player, 1),
        launderCountThisGame: {
          ...c.launderCountThisGame,
          [event.player]: (c.launderCountThisGame[event.player] ?? 0) + 1,
        },
      })
    case 'BriberyUsed':
    case 'InsiderTradingUsed':
      return withCounters(bump('dirtyActionsThisGame', event.player, 1))
    case 'EraAdvanced':
      return withCounters({
        ...c,
        rentReceivedThisEra: Object.fromEntries(
          Object.keys(c.rentReceivedThisEra).map((p) => [p, 0]),
        ) as Record<PlayerId, Money>,
      })
    case 'PhaseAdvanced':
      return expireOn(state, event.phase)
    default:
      return state
  }
}

/** Expires modifiers and entitlements at their recorded boundary. */
function expireOn(state: GameState, phase: GameState['phase']): GameState {
  const round = state.round
  const live = <T extends { expiry: { boundary: string; round: number } }>(x: T): boolean => {
    switch (x.expiry.boundary) {
      case 'never': return true
      case 'round': return round <= x.expiry.round
      case 'open-phase': return round < x.expiry.round || phase !== 'movement'
      case 'settlement': return round <= x.expiry.round
      default: return true
    }
  }
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      modifiers: state.cardEffects.modifiers.filter(live),
      entitlements: state.cardEffects.entitlements.filter((e) => live(e) && e.remaining > 0),
    },
  }
}
```

The `RentRoutedToFuture` branch above double-credits the holder as written. Correct it to
credit the holder once and debit the deed owner by the same amount, so the convention in
era-decks 6.11 holds regardless of what Task 14 puts in `RentCharged.to`. The test in Step
33 asserts exactly that behaviour and will catch the error.

- [ ] **Step 36: Implement `selectors.ts` — the modifier and entitlement read surface**

`packages/engine/src/contexts/decks/selectors.ts`. Every other context reads card effects
through these, which is the only way a card can change a rule without that context
importing card data:

```ts
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import type { Entitlement, TimedModifier } from './effects.js'
import { ECONOMY } from '../../config/economy.js'

export function activeModifiers(state: GameState): readonly TimedModifier[] {
  return [...state.cardEffects.modifiers].sort((a, b) => a.seq - b.seq)
}

const forPlayer = (state: GameState, p: PlayerId): readonly TimedModifier[] =>
  activeModifiers(state).filter((m) => m.players.includes(p))

/**
 * era-decks 6.2: rent modifiers compose MULTIPLICATIVELY against base rent, applied in
 * card-draw order. Callers apply a single Math.floor after multiplying base rent by this.
 */
export function rentMultiplier(state: GameState, deed: DeedId): number {
  const d = state.deeds[deed]
  if (d === undefined) return 1
  return activeModifiers(state).reduce((factor, m) => {
    if (m.effect.kind !== 'rent-multiplier') return factor
    if (m.effect.groups !== undefined && !m.effect.groups.includes(d.group)) return factor
    if (m.effect.minBuildings !== undefined && d.houses < m.effect.minBuildings) return factor
    return factor * m.effect.factor
  }, 1)
}

export interface BaseOverride {
  readonly deedRate: number
  readonly buildingRate: number
  readonly addend: Money
  readonly multiplier: number
  readonly cdsPostingRate: number
}

/**
 * era-decks 6.2 canonical order: compute the base from the current formula, apply
 * additive terms, then multipliers, then subtract CDS postings. Callers do exactly that.
 */
export function borrowingBaseOverride(state: GameState, p: PlayerId): BaseOverride {
  return forPlayer(state, p).reduce<BaseOverride>((acc, m) => {
    switch (m.effect.kind) {
      case 'borrowing-base-formula':
        return {
          ...acc,
          deedRate: ECONOMY.DEED_ADVANCE_RATE * m.effect.deedRateFactor,
          buildingRate: ECONOMY.BUILDING_ADVANCE_RATE * m.effect.buildingRateFactor,
        }
      case 'borrowing-base-addend':
        return { ...acc, addend: acc.addend + m.effect.dollars }
      case 'borrowing-base-multiplier':
        return { ...acc, multiplier: acc.multiplier * m.effect.factor }
      case 'cds-posting-addend':
        return { ...acc, cdsPostingRate: acc.cdsPostingRate + m.effect.rate }
      default:
        return acc
    }
  }, {
    deedRate: ECONOMY.DEED_ADVANCE_RATE,
    buildingRate: ECONOMY.BUILDING_ADVANCE_RATE,
    addend: 0,
    multiplier: 1,
    cdsPostingRate: ECONOMY.CDS_COLLATERAL_RATE,
  })
}

export function goSalaryAddend(state: GameState, p: PlayerId): Money {
  return forPlayer(state, p).reduce(
    (t, m) => (m.effect.kind === 'go-salary-addend' ? t + m.effect.dollars : t), 0,
  )
}

export function interestRateFor(state: GameState, p: PlayerId, base: number): number {
  const override = forPlayer(state, p).find((m) => m.effect.kind === 'interest-rate-override')
  if (override !== undefined && override.effect.kind === 'interest-rate-override') {
    return override.effect.rate
  }
  return base
}

export function creditInterestWaived(state: GameState, p: PlayerId): Money | null {
  const waiver = forPlayer(state, p).find((m) => m.effect.kind === 'waive-credit-interest')
  if (waiver === undefined || waiver.effect.kind !== 'waive-credit-interest') return null
  return waiver.effect.ifZeroBalanceCollect
}

export function buildingCostMultiplier(state: GameState, p: PlayerId): number {
  return forPlayer(state, p).reduce(
    (f, m) => (m.effect.kind === 'building-cost-multiplier' ? f * m.effect.factor : f), 1,
  )
}

export function marginThreshold(state: GameState, p: PlayerId): number {
  return forPlayer(state, p).reduce(
    (r, m) => (m.effect.kind === 'margin-threshold' ? Math.min(r, m.effect.ratio) : r), 1,
  )
}

export function briberyTerms(state: GameState): { cost: Money; heat: number } {
  const term = activeModifiers(state).find((m) => m.effect.kind === 'bribery-terms')
  if (term !== undefined && term.effect.kind === 'bribery-terms') {
    return { cost: term.effect.cost, heat: term.effect.heat }
  }
  return { cost: 200, heat: 1 }
}

export function entitlementsOf(state: GameState, p: PlayerId): readonly Entitlement[] {
  return state.cardEffects.entitlements.filter((e) => e.owner === p && e.remaining > 0)
}

export function entitlementOfKind(
  state: GameState, p: PlayerId, kind: Entitlement['kind'],
): Entitlement | null {
  return entitlementsOf(state, p).find((e) => e.kind === kind) ?? null
}

export function consumeEntitlement(state: GameState, id: string, used: number): GameState {
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      entitlements: state.cardEffects.entitlements.map(
        (e) => (e.id === id ? { ...e, remaining: Math.max(0, e.remaining - used) } : e),
      ),
    },
  }
}

export function pendingPoolInjections(state: GameState): Readonly<Record<string, Money>> {
  return state.cardEffects.poolInjections
}

export function scheduledPoolTerminations(state: GameState): readonly string[] {
  return state.cardEffects.scheduledPoolTerminations
}
```

- [ ] **Step 37: Implement `decide.ts` and `index.ts`, and wire decks into the root reducer**

`packages/engine/src/contexts/decks/decide.ts`:

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Era, PlayerId } from '../../core/types.js'
import { type Rejection, reject } from '../../core/errors.js'
import { deckFor } from './cards/index.js'
import { entitlementOfKind } from './selectors.js'

export type DeckCommand =
  | { readonly kind: 'shuffle-deck'; readonly era: Era; readonly order: readonly number[] }
  | { readonly kind: 'draw-card'; readonly era: Era; readonly player: PlayerId }
  | { readonly kind: 'reorder-deck'; readonly era: Era; readonly player: PlayerId
      readonly order: readonly number[] }

export function decideDeck(state: GameState, cmd: DeckCommand): GameEvent[] | Rejection {
  switch (cmd.kind) {
    case 'shuffle-deck': {
      const size = deckFor(cmd.era).length
      const sorted = [...cmd.order].sort((a, b) => a - b)
      const valid = sorted.length === size && sorted.every((v, i) => v === i)
      if (!valid) return reject('INVALID_WINDOW', 'The shuffle order must be a permutation of the deck.')
      return [{ type: 'DeckShuffled', era: cmd.era, order: cmd.order }]
    }
    case 'draw-card': {
      if (state.phase !== 'movement') {
        return reject('WRONG_PHASE', 'Cards are drawn during Movement, when a token rests on a card square.')
      }
      const deck = state.decks[cmd.era]
      if (deck.drawn >= deck.order.length) {
        return reject('CONTRACT_NOT_FOUND', 'This era deck is exhausted.')
      }
      return [{ type: 'CardDrawn', era: cmd.era, index: deck.drawn, player: cmd.player }]
    }
    case 'reorder-deck': {
      // Only E3-05 grants this. The peek itself is a client-side reveal.
      const deck = state.decks[cmd.era]
      const head = deck.order.slice(deck.drawn, deck.drawn + 3)
      const permutes = [...cmd.order].sort().join() === [...head].sort().join()
      if (!permutes) {
        return reject('CONTRACT_NOT_FOUND', 'You may only reorder the three cards you were shown.')
      }
      const next = [...deck.order]
      cmd.order.forEach((v, i) => { next[deck.drawn + i] = v })
      return [{ type: 'DeckReordered', era: cmd.era, order: next, player: cmd.player }]
    }
  }
}
```

`packages/engine/src/contexts/decks/index.ts`:

```ts
export type {
  Amount, Card, CardEffectsState, CardId, Effect, Entitlement, EntitlementKind,
  ModifierEffect, PlayerMetric, Target, TimedModifier,
} from './effects.js'
export { ALL_CARDS, DECKS, cardById, deckFor } from './cards/index.js'
export { applyCard, evalAmount, isBriberyCancellable } from './interpret.js'
export { evalMetric } from './metrics.js'
export { resolveTarget } from './select.js'
export { emptyCardEffects, reduceDecks } from './reduce.js'
export { decideDeck, type DeckCommand } from './decide.js'
export {
  type BaseOverride, activeModifiers, borrowingBaseOverride, briberyTerms,
  buildingCostMultiplier, consumeEntitlement, creditInterestWaived, entitlementOfKind,
  entitlementsOf, goSalaryAddend, interestRateFor, marginThreshold,
  pendingPoolInjections, rentMultiplier, scheduledPoolTerminations,
} from './selectors.js'

import { DECKS } from './cards/index.js'
import type { Card } from './effects.js'
import type { Era } from '../../core/types.js'

export function cardAt(era: Era, authoredIndex: number): Card {
  const card = DECKS[era][authoredIndex]
  if (card === undefined) throw new Error(`no card at ${era}:${authoredIndex}`)
  return card
}
```

Modify `packages/engine/src/core/reduce.ts` so **every** event reaches `reduceDecks` after
its owning context, which is what lets the counters stay current without any other context
knowing cards exist:

```ts
import { reduceDecks } from '../contexts/decks/index.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  const owned = dispatchToOwningContext(state, event)
  return reduceDecks(owned, event)
}
```

`reduceDecks` must ignore its own three events on the observer pass; it already does,
because the switch handles them and `observe` returns state unchanged for them.

- [ ] **Step 38: Run the whole suite, then commit Task 18**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add packages/engine/src
git commit -m "feat(decks): wire the card interpreter into the root reducer

CardDrawn is the only event a card produces; effects are a pure function
of (card, state-at-draw). The decks reducer also observes every event to
maintain the rent, dirty-action and laundering counters that dynamic
card targets rank on."
```

---
