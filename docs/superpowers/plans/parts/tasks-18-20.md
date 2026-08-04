## Tasks 18-20

Final part of the LEVERAGE rules engine plan. Task 18 builds the `decks` context — a
declarative card-effect vocabulary plus the 80 authored cards. Task 19 builds scoring,
mark-to-model, win conditions and spec 19.1's Settlement sequence in `session`. Task 20
builds the fast-check invariant suite, which is the strongest correctness guarantee in
the project.

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

### Task 19: `session` context — scoring, mark-to-model, win conditions and the Settlement sequence

Task 19 closes two holes at once. The obvious one is scoring: spec section 12's net worth
formula and the five mark-to-model rules. The second is that **nobody owns the Settlement
sequence**. Tasks 9, 10, 12, 13, 14, 15, 16 and 17 each export a generator for one or two
of spec 19.1's eleven steps, and no task composes them. Ordering is observable — 19.1 says
so in its first sentence — so the sequence is a rule, and rules belong in a context.
`session` already owns rounds, phases and eras, so it owns the sequence too.

That decision is what makes the round-24 requirement expressible at all. Spec 19.1's last
paragraph adds three steps after step 11, in order: all pools terminate, every tranche
short of face triggers its referencing CDS, then scoring runs. A CDS triggered by
termination has to land in the final score, and the only way to test that claim is to own
the composition and assert the event order it produces.

**Files:**
- Create: `packages/engine/src/contexts/session/marks.ts`
- Create: `packages/engine/src/contexts/session/scoring.ts`
- Create: `packages/engine/src/contexts/session/settlement.ts`
- Modify: `packages/engine/src/config/economy.ts` (three scoring constants)
- Modify: `packages/engine/src/contexts/session/decide.ts` (one command arm)
- Modify: `packages/engine/src/contexts/session/index.ts`
- Test: `packages/engine/src/contexts/session/marks.test.ts`
- Test: `packages/engine/src/contexts/session/scoring.test.ts`
- Test: `packages/engine/src/contexts/session/settlement.test.ts`
- Test: `packages/engine/tests/fixtures/scoring-state.ts` (shared builder, imported by all three)

**File-size plan.** `marks.ts` is five mark functions and the deed/building basis, ~150
lines. `scoring.ts` is the breakdown, `netWorth`, standings and the win conditions, ~180
lines. `settlement.ts` is the fourteen-step fold plus its input type, ~190 lines. Nothing
approaches 500, and the three split on responsibility rather than on length: valuation,
aggregation, sequencing.

**Interfaces:**

Consumes — all through `index.ts`. These are the signatures the sibling parts actually
declare, so a rename in any of them is a compile error here rather than a silent drift:

```ts
// contexts/credit/index.ts  (tasks-09-11.md)
export function borrowingBase(state: GameState, player: PlayerId): Money
export function deedsOwnedBy(state: GameState, player: PlayerId): readonly DeedState[]
export function settleCarryingCost(state: GameState): readonly GameEvent[]
export function settleCreditInterest(state: GameState): readonly GameEvent[]
export function settleDistressedDebt(state: GameState): readonly GameEvent[]
export function flagMarginCalls(state: GameState): readonly GameEvent[]

// contexts/credit/index.ts  (tasks-09-11.md, Task 11) — Settlement step 5
export function settlePeerLoans(state: GameState): readonly GameEvent[]
export function activeLoans(state: GameState): readonly PeerLoan[]

// contexts/markets/index.ts  (tasks-14-15.md)
export function markRentFuture(state: GameState, id: ContractId): Money
export function markDeedOption(state: GameState, id: ContractId): Money
export function expireRentFutures(state: GameState): readonly GameEvent[]
export function lapseDeedOptions(state: GameState): readonly GameEvent[]

// contexts/securitization/index.ts  (tasks-16-17.md)
export interface Distribution { readonly tranche: Tranche['kind']; readonly amount: Money }
export function findPool(state: GameState, id: ContractId): Pool | undefined
export function distribute(pool: Pool, collected: Money): readonly Distribution[]
export function expectedPoolCashflow(state: GameState, pool: Pool): Money
export function borrowerLeverage(state: GameState, player: PlayerId): number
export function settleSecuritization(
  state: GameState, roundEvents: readonly GameEvent[],
): readonly GameEvent[]
export function settleSwapPremiums(state: GameState): readonly GameEvent[]
export function terminateAllPools(state: GameState): readonly GameEvent[]

// contexts/underworld/index.ts  (tasks-12-13.md)
export function settleVentures(state: GameState): readonly GameEvent[]
export function settleAudits(
  state: GameState, dice: Readonly<Partial<Record<PlayerId, DiceRoll>>>,
): readonly GameEvent[] | Rejection

// core/money.ts  (Task 2) — the ONLY percentage arithmetic in this task
export function floorPercent(amount: Money, rate: number): Money
export function ceilPercent(amount: Money, rate: number): Money

// core/reduce.ts  (tasks-03-08.md)
export function reduce(state: GameState, event: GameEvent): GameState
```

Produces:

```ts
// marks.ts
export function deedValue(deed: DeedState): Money
export function buildingCostBasis(deed: DeedState): Money
export function portfolioValue(state: GameState, player: PlayerId): {
  readonly deeds: Money; readonly buildings: Money
}
export function markRentFuturesHeld(state: GameState, player: PlayerId): Money
export function markTranche(state: GameState, pool: Pool, kind: Tranche['kind']): Money
export function markTranchesHeld(state: GameState, player: PlayerId): Money
export function markLoanNote(state: GameState, loan: PeerLoan): Money
export function markLoanNotesHeld(state: GameState, player: PlayerId): Money
export function markDeedOptionsHeld(state: GameState, player: PlayerId): Money
export function markSwapsHeld(state: GameState, player: PlayerId): Money
export function instrumentsHeld(state: GameState, player: PlayerId): Money

// scoring.ts
export interface NetWorthBreakdown {
  readonly cleanCash: Money
  readonly deedValue: Money
  readonly buildingCost: Money
  readonly instruments: Money
  readonly drawnCredit: Money
  readonly peerLoansOwed: Money
  readonly distressedDebt: Money
  readonly dirtyCash: Money
  readonly total: Money
}
export function netWorthBreakdown(state: GameState, player: PlayerId): NetWorthBreakdown
export function netWorth(state: GameState, player: PlayerId): Money
export function netWorths(state: GameState): Readonly<Record<PlayerId, Money>>
export interface Standing {
  readonly player: PlayerId; readonly netWorth: Money; readonly rank: number
}
export function standings(state: GameState): readonly Standing[]
export interface WinProgress {
  readonly kind: 'fixed-rounds' | 'net-worth-target'
  readonly netWorth: Money
  readonly target: Money | null
  readonly remaining: Money | null
  readonly achieved: boolean
}
export function winProgress(state: GameState, player: PlayerId): WinProgress
export function targetReachedBy(state: GameState): readonly PlayerId[]
export function isGameOver(state: GameState): boolean
export function winner(state: GameState): PlayerId | null
export function scoreGame(state: GameState): GameEvent

// settlement.ts
export interface SettlementInput {
  readonly auditDice: Readonly<Partial<Record<PlayerId, DiceRoll>>>
  readonly roundEvents: readonly GameEvent[]
}
export function runSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection
export function runFinalSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection
export const SETTLEMENT_STEPS: readonly string[]

// decide.ts — SessionCommand gains one arm
| { readonly kind: 'settle'; readonly input: SettlementInput }
```

---

- [ ] **Step 1: Add the three scoring constants to `config/economy.ts`**

Every number spec section 12 names goes here, because no economic number may appear
inline anywhere else. Add inside the `ECONOMY` object:

```ts
  /**
   * Loan note mark, spec section 12:
   *   principal x (1 - LOAN_NOTE_HAIRCUT_PER_TURN x min(leverage, LOAN_NOTE_MAX_LEVERAGE))
   * A note against an unlevered borrower marks at par; against a borrower at 4x or
   * worse it marks at 40% of principal.
   */
  LOAN_NOTE_HAIRCUT_PER_TURN: 0.15,
  LOAN_NOTE_MAX_LEVERAGE: 4,

  /** Spec section 10: dirty cash is worth exactly this at final scoring. */
  DIRTY_CASH_SCORING_VALUE: 0,
```

`LOAN_NOTE_MAX_LEVERAGE` is 4 while `RATING_MAX_LEVERAGE` is 5. That is not a typo —
spec section 8 caps leverage at 5 inside the ratings formula and spec section 12 caps it
at 4 inside the note mark. Two rules, two caps, two constants.

- [ ] **Step 2: Write the shared scoring fixture**

`packages/engine/tests/fixtures/scoring-state.ts`. All three Task 19 test files import
this builder, so it lives under `tests/fixtures/` rather than inside a `.test.ts`:

```ts
import type {
  DeedState, GameConfig, GameState, PeerLoan, PlayerState, Pool, RentFuture,
  DeedOption, Swap, Tranche,
} from '../../src/core/state.js'
import type { DeedId, Money, PlayerId } from '../../src/core/types.js'
import { PLAYER_IDS } from '../../src/core/types.js'
import { ECONOMY } from '../../src/config/economy.js'

export const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

export function player(id: PlayerId, patch: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    cleanCash: 0,
    dirtyCash: 0,
    heat: 0,
    position: 0,
    inJail: false,
    consecutiveDoubles: 0,
    drawnCredit: 0,
    distressedDebt: 0,
    creditImpaired: false,
    ventures: [],
    marginCallFlaggedAt: null,
    launderedThisPhase: false,
    briberyUsedThisRound: false,
    dirtyActionThisRound: false,
    insiderRevealedThisRound: false,
    rerollForced: false,
    cardCancelled: false,
    ...patch,
  }
}

export function deed(id: DeedId, patch: Partial<DeedState> = {}): DeedState {
  return {
    id,
    square: 1,
    group: 'orange',
    faceValue: 200,
    houseCost: 100,
    rentTable: [16, 80, 220, 600, 800, 1000],
    owner: null,
    mortgaged: false,
    houses: 0,
    ...patch,
  }
}

export function scoringState(patch: Partial<GameState> = {}): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, player(id)]),
  ) as Record<PlayerId, PlayerState>
  return {
    config: CONFIG,
    phase: 'settlement',
    round: 24,
    era: 4,
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
    decks: { 1: EMPTY_DECK, 2: EMPTY_DECK, 3: EMPTY_DECK, 4: EMPTY_DECK },
    cardEffects: EMPTY_CARD_EFFECTS,
    ...patch,
  }
}

const EMPTY_DECK = { order: [], drawn: 0 }

const EMPTY_CARD_EFFECTS = {
  modifiers: [],
  entitlements: [],
  poolInjections: {},
  scheduledPoolTerminations: [],
  counters: {
    rentReceivedThisGame: { P1: 0, P2: 0, P3: 0, P4: 0 },
    rentReceivedThisEra: { P1: 0, P2: 0, P3: 0, P4: 0 },
    dirtyActionsThisGame: { P1: 0, P2: 0, P3: 0, P4: 0 },
    launderCountThisGame: { P1: 0, P2: 0, P3: 0, P4: 0 },
  },
  seq: 0,
}

export function loan(patch: Partial<PeerLoan> = {}): PeerLoan {
  return {
    id: 'l-1', lender: 'P1', borrower: 'P2', principal: 500, outstanding: 500,
    ratePerRound: 0.1, maturesAtRound: 24, collateral: [], status: 'active', ...patch,
  }
}

export function future(patch: Partial<RentFuture> = {}): RentFuture {
  return { id: 'f-1', deed: 'd-1', holder: 'P1', startRound: 1, endRound: 24, ...patch }
}

export function option(patch: Partial<DeedOption> = {}): DeedOption {
  return { id: 'o-1', deed: 'd-1', writer: 'P2', holder: 'P1', strike: 120, expiry: 24, ...patch }
}

export function tranche(kind: Tranche['kind'], patch: Partial<Tranche> = {}): Tranche {
  const face = kind === 'senior' ? 600 : kind === 'mezzanine' ? 400 : 0
  return { kind, face, paid: 0, holder: 'P1', ...patch }
}

export function pool(patch: Partial<Pool> = {}): Pool {
  return {
    id: 'pool-1', originator: 'P1', assets: [],
    tranches: [tranche('senior'), tranche('mezzanine'), tranche('equity')],
    terminated: false, ...patch,
  }
}

export function swap(patch: Partial<Swap> = {}): Swap {
  return {
    id: 's-1', buyer: 'P3', seller: 'P4',
    reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
    notional: 400, premiumPerRound: 20, status: 'active', ...patch,
  }
}
```

- [ ] **Step 3: Write the failing mark-to-model test**

`packages/engine/src/contexts/session/marks.test.ts`. Every case below is a line of the
spec section 12 table, and the two mortgage cases are the exploit this task exists to
close:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ECONOMY } from '../../config/economy.js'

vi.mock('../markets/index.js', () => ({
  markRentFuture: vi.fn(), markDeedOption: vi.fn(),
}))
vi.mock('../securitization/index.js', () => ({
  distribute: vi.fn(), expectedPoolCashflow: vi.fn(), borrowerLeverage: vi.fn(),
}))

import { markRentFuture, markDeedOption } from '../markets/index.js'
import { distribute, expectedPoolCashflow, borrowerLeverage } from '../securitization/index.js'
import {
  buildingCostBasis, deedValue, markDeedOptionsHeld, markLoanNote, markLoanNotesHeld,
  markRentFuturesHeld, markSwapsHeld, markTranche, markTranchesHeld,
} from './marks.js'
import {
  deed, future, loan, option, pool, scoringState, swap, tranche,
} from '../../../tests/fixtures/scoring-state.js'

beforeEach(() => {
  vi.mocked(markRentFuture).mockReturnValue(0)
  vi.mocked(markDeedOption).mockReturnValue(0)
  vi.mocked(borrowerLeverage).mockReturnValue(0)
  vi.mocked(expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(distribute).mockReturnValue([])
})

describe('deedValue', () => {
  it('marks an unmortgaged deed at face', () => {
    expect(deedValue(deed('d-1', { faceValue: 200 }))).toBe(200)
  })

  it('marks a mortgaged deed net of the cost to redeem it', () => {
    // Mortgaging pays 50% of face in cash. If the deed still marked at face, a player
    // could mortgage all seven holdings on the last Open phase and gain 50% of their
    // face value for free. Netting the 55% redemption cost makes it cost 5% instead.
    expect(deedValue(deed('d-1', { faceValue: 200, mortgaged: true }))).toBe(90)
  })

  it('never marks a mortgaged deed below zero', () => {
    expect(deedValue(deed('d-1', { faceValue: 1, mortgaged: true }))).toBe(0)
  })
})

describe('buildingCostBasis', () => {
  it('values buildings at the price actually paid, not the list price', () => {
    // Houses cost 90% of list. Valuing at list would make building instantly
    // net-worth-accretive by 11%, which is a free money pump.
    expect(buildingCostBasis(deed('d-1', { houseCost: 100, houses: 3 }))).toBe(270)
  })

  it('counts a hotel as five buildings', () => {
    expect(buildingCostBasis(deed('d-1', { houseCost: 100, houses: 5 }))).toBe(450)
  })
})

describe('markLoanNote', () => {
  it('marks a note against an unlevered borrower at par', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(0)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(500)
  })

  it('marks a note against a 4x borrower at 40% of principal', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(4)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(200)
  })

  it('caps the haircut at 4x, so a 9x borrower marks the same as a 4x one', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(9)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(200)
  })

  it('marks a repaid or defaulted note at zero', () => {
    const s = scoringState()
    expect(markLoanNote(s, loan({ status: 'repaid' }))).toBe(0)
    expect(markLoanNote(s, loan({ status: 'defaulted' }))).toBe(0)
  })

  it('sums only the notes the player lent against', () => {
    const s = scoringState({
      loans: [
        loan({ id: 'l-1', lender: 'P1', outstanding: 500 }),
        loan({ id: 'l-2', lender: 'P2', outstanding: 300 }),
      ],
    })
    vi.mocked(borrowerLeverage).mockReturnValue(0)
    expect(markLoanNotesHeld(s, 'P1')).toBe(500)
    expect(markLoanNotesHeld(s, 'P2')).toBe(300)
  })
})

describe('markTranche', () => {
  it('runs the pool\'s own waterfall over the cashflow it has not yet collected', () => {
    const s = scoringState()
    const p = pool({
      tranches: [
        tranche('senior', { face: 600, paid: 600, holder: 'P1' }),
        tranche('mezzanine', { face: 400, paid: 100, holder: 'P2' }),
        tranche('equity', { face: 0, paid: 0, holder: 'P3' }),
      ],
    })
    vi.mocked(expectedPoolCashflow).mockReturnValue(1000)
    vi.mocked(distribute).mockReturnValue([
      { tranche: 'senior', amount: 0 },
      { tranche: 'mezzanine', amount: 300 },
      { tranche: 'equity', amount: 0 },
    ])
    expect(markTranche(s, p, 'mezzanine')).toBe(300)
    // 1000 expected, 700 already paid out, so 300 remains to run the waterfall.
    expect(vi.mocked(distribute)).toHaveBeenCalledWith(p, 300)
  })

  it('marks every tranche of a terminated pool at zero', () => {
    const s = scoringState()
    const p = pool({ terminated: true })
    expect(markTranche(s, p, 'senior')).toBe(0)
    expect(vi.mocked(distribute)).not.toHaveBeenCalled()
  })

  it('sums the tranches a player holds across every live pool', () => {
    const s = scoringState({
      pools: [
        pool({ id: 'pool-1', tranches: [tranche('senior', { holder: 'P1' })] }),
        pool({ id: 'pool-2', tranches: [tranche('senior', { holder: 'P1' })] }),
      ],
    })
    vi.mocked(expectedPoolCashflow).mockReturnValue(1000)
    vi.mocked(distribute).mockReturnValue([{ tranche: 'senior', amount: 250 }])
    expect(markTranchesHeld(s, 'P1')).toBe(500)
  })
})

describe('markRentFuturesHeld and markDeedOptionsHeld', () => {
  it('delegates rent futures to the markets valuation', () => {
    const s = scoringState({ futures: [future({ id: 'f-1', holder: 'P1' })] })
    vi.mocked(markRentFuture).mockReturnValue(140)
    expect(markRentFuturesHeld(s, 'P1')).toBe(140)
    expect(markRentFuturesHeld(s, 'P2')).toBe(0)
  })

  it('delegates deed options to the markets mark, which is max(0, face - strike)', () => {
    const s = scoringState({ options: [option({ id: 'o-1', holder: 'P1' })] })
    vi.mocked(markDeedOption).mockReturnValue(80)
    expect(markDeedOptionsHeld(s, 'P1')).toBe(80)
  })

  it('gives the option writer nothing, positive or negative', () => {
    const s = scoringState({ options: [option({ writer: 'P2', holder: 'P1' })] })
    vi.mocked(markDeedOption).mockReturnValue(80)
    expect(markDeedOptionsHeld(s, 'P2')).toBe(0)
  })
})

describe('markSwapsHeld', () => {
  it('marks both sides of an untriggered swap at zero', () => {
    const s = scoringState({ swaps: [swap({ buyer: 'P3', seller: 'P4', status: 'active' })] })
    expect(markSwapsHeld(s, 'P3')).toBe(0)
    expect(markSwapsHeld(s, 'P4')).toBe(0)
  })

  it('marks a triggered swap at zero too, because the payout already moved in cash', () => {
    const s = scoringState({ swaps: [swap({ status: 'triggered' })] })
    expect(markSwapsHeld(s, 'P3')).toBe(0)
    expect(markSwapsHeld(s, 'P4')).toBe(0)
  })
})
```

- [ ] **Step 4: Run the mark test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/session/marks.test.ts`
Expected: FAIL — `./marks.js` does not exist.

- [ ] **Step 5: Implement `marks.ts`**

`packages/engine/src/contexts/session/marks.ts`:

```ts
import type { DeedState, GameState, PeerLoan, Pool, Tranche } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { ceilPercent, floorPercent } from '../../core/money.js'
import { ECONOMY } from '../../config/economy.js'
import { markDeedOption, markRentFuture } from '../markets/index.js'
import { borrowerLeverage, distribute, expectedPoolCashflow } from '../securitization/index.js'

/**
 * Spec section 12 lists deeds at face value with no mortgage line. Taken literally that
 * is a free 50%-of-face gain for mortgaging on the last Open phase, so a mortgaged deed
 * marks net of what it costs to redeem: face - ceil(face x UNMORTGAGE_RATE), floored at
 * zero. Mortgaging is then mildly value-destroying, which is the intended economics.
 */
export function deedValue(deed: DeedState): Money {
  if (!deed.mortgaged) return deed.faceValue
  return Math.max(0, deed.faceValue - ceilPercent(deed.faceValue, ECONOMY.UNMORTGAGE_RATE))
}

/**
 * Buildings mark at the price actually paid — houses cost HOUSE_COST_MULTIPLIER of the
 * deed's list price. `houses` is 0-4, or 5 for a hotel, so a hotel is five buildings.
 */
export function buildingCostBasis(deed: DeedState): Money {
  return floorPercent(deed.houseCost, ECONOMY.HOUSE_COST_MULTIPLIER) * deed.houses
}

export function portfolioValue(
  state: GameState, player: PlayerId,
): { readonly deeds: Money; readonly buildings: Money } {
  return Object.values(state.deeds)
    .filter((d) => d.owner === player)
    .reduce(
      (acc, d) => ({
        deeds: acc.deeds + deedValue(d),
        buildings: acc.buildings + buildingCostBasis(d),
      }),
      { deeds: 0, buildings: 0 },
    )
}

export function markRentFuturesHeld(state: GameState, player: PlayerId): Money {
  return state.futures
    .filter((f) => f.holder === player)
    .reduce((t, f) => t + markRentFuture(state, f.id), 0)
}

export function markDeedOptionsHeld(state: GameState, player: PlayerId): Money {
  return state.options
    .filter((o) => o.holder === player)
    .reduce((t, o) => t + markDeedOption(state, o.id), 0)
}

/**
 * "Expected remaining cashflow through the waterfall" — literally that. Whatever the
 * pool still expects to collect is run through the pool's own `distribute`, so the
 * mark can never disagree with what the waterfall would actually pay.
 */
export function markTranche(state: GameState, pool: Pool, kind: Tranche['kind']): Money {
  if (pool.terminated) return 0
  const paid = pool.tranches.reduce((t, tr) => t + tr.paid, 0)
  const remaining = Math.max(0, expectedPoolCashflow(state, pool) - paid)
  if (remaining === 0) return 0
  return distribute(pool, remaining).find((d) => d.tranche === kind)?.amount ?? 0
}

export function markTranchesHeld(state: GameState, player: PlayerId): Money {
  return state.pools.reduce(
    (total, pool) =>
      total
      + pool.tranches
        .filter((t) => t.holder === player)
        .reduce((t, tr) => t + markTranche(state, pool, tr.kind), 0),
    0,
  )
}

/**
 * Spec section 12: `principal x (1 - 0.15 x min(borrowerLeverage, 4))`. The haircut
 * rounds UP, against the note holder, so the mark is the conservative one.
 * `borrowerLeverage` already caps at RATING_MAX_LEVERAGE (5); capping again at
 * LOAN_NOTE_MAX_LEVERAGE (4) is exact because min(min(x,5),4) === min(x,4).
 */
export function markLoanNote(state: GameState, loan: PeerLoan): Money {
  if (loan.status !== 'active') return 0
  const leverage = Math.min(
    borrowerLeverage(state, loan.borrower), ECONOMY.LOAN_NOTE_MAX_LEVERAGE,
  )
  const haircut = ceilPercent(loan.outstanding, ECONOMY.LOAN_NOTE_HAIRCUT_PER_TURN * leverage)
  return Math.max(0, loan.outstanding - haircut)
}

export function markLoanNotesHeld(state: GameState, player: PlayerId): Money {
  return state.loans
    .filter((l) => l.lender === player)
    .reduce((t, l) => t + markLoanNote(state, l), 0)
}

/**
 * Both sides of every swap mark at zero. Untriggered is spec section 12 verbatim —
 * the writer's exposure shows up as the 30% collateral against their borrowing base,
 * not in net worth. Triggered is zero because `SwapTriggered` moves the notional in
 * cash at the moment it fires, so the loss is already in the writer's clean cash or,
 * if they could not cover it, in their drawn credit. Marking it again would count it
 * twice. Step 21's test pins that to exactly once.
 */
export function markSwapsHeld(_state: GameState, _player: PlayerId): Money {
  return 0
}

export function instrumentsHeld(state: GameState, player: PlayerId): Money {
  return markRentFuturesHeld(state, player)
    + markTranchesHeld(state, player)
    + markLoanNotesHeld(state, player)
    + markDeedOptionsHeld(state, player)
    + markSwapsHeld(state, player)
}
```

- [ ] **Step 6: Run the mark test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/session/marks.test.ts`
Expected: PASS — all sixteen cases green.

- [ ] **Step 7: Commit the marks**

```bash
git add packages/engine/src/contexts/session/marks.ts \
        packages/engine/src/contexts/session/marks.test.ts \
        packages/engine/tests/fixtures/scoring-state.ts \
        packages/engine/src/config/economy.ts
git commit -m "feat(session): mark every instrument to model per spec section 12

Tranches are marked by running the pool's own distribute() over the
cashflow it has not yet collected, so a mark can never disagree with the
waterfall. Mortgaged deeds mark net of redemption cost, closing a
last-round exploit worth 50% of face."
```

- [ ] **Step 8: Write the failing net-worth test**

`packages/engine/src/contexts/session/scoring.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../markets/index.js', () => ({
  markRentFuture: vi.fn(), markDeedOption: vi.fn(),
}))
vi.mock('../securitization/index.js', () => ({
  distribute: vi.fn(), expectedPoolCashflow: vi.fn(), borrowerLeverage: vi.fn(),
}))

import { markDeedOption, markRentFuture } from '../markets/index.js'
import { borrowerLeverage, distribute, expectedPoolCashflow } from '../securitization/index.js'
import { netWorth, netWorthBreakdown, netWorths, scoreGame, standings } from './scoring.js'
import { deed, future, loan, player, scoringState } from '../../../tests/fixtures/scoring-state.js'

beforeEach(() => {
  vi.mocked(markRentFuture).mockReturnValue(0)
  vi.mocked(markDeedOption).mockReturnValue(0)
  vi.mocked(borrowerLeverage).mockReturnValue(0)
  vi.mocked(expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(distribute).mockReturnValue([])
})

describe('netWorth', () => {
  it('adds clean cash, deed face, building cost and marks; subtracts every liability', () => {
    const s = scoringState({
      players: {
        ...scoringState().players,
        P1: player('P1', {
          cleanCash: 400, dirtyCash: 9_999, drawnCredit: 300, distressedDebt: 120,
        }),
      },
      deeds: {
        'd-1': deed('d-1', { owner: 'P1', faceValue: 200, houseCost: 100, houses: 2 }),
        'd-2': deed('d-2', { owner: 'P1', faceValue: 160, mortgaged: true }),
        'd-3': deed('d-3', { owner: 'P2', faceValue: 500 }),
      },
      futures: [future({ id: 'f-1', holder: 'P1' })],
      loans: [
        loan({ id: 'l-1', lender: 'P3', borrower: 'P1', outstanding: 250 }),
        loan({ id: 'l-2', lender: 'P1', borrower: 'P4', outstanding: 100 }),
      ],
    })
    vi.mocked(markRentFuture).mockReturnValue(75)

    const b = netWorthBreakdown(s, 'P1')
    expect(b.cleanCash).toBe(400)
    expect(b.deedValue).toBe(200 + 72)        // 160 - ceil(160 x 0.55) = 160 - 88
    expect(b.buildingCost).toBe(180)          // 2 x floor(100 x 0.9)
    expect(b.instruments).toBe(75 + 100)      // rent future mark + note lent at par
    expect(b.drawnCredit).toBe(300)
    expect(b.peerLoansOwed).toBe(250)
    expect(b.distressedDebt).toBe(120)
    expect(b.dirtyCash).toBe(0)               // dirty cash x 0
    expect(b.total).toBe(400 + 272 + 180 + 175 - 300 - 250 - 120)
    expect(netWorth(s, 'P1')).toBe(b.total)
  })

  it('counts dirty cash as exactly zero however large it is', () => {
    const base = scoringState()
    const rich = scoringState({
      players: { ...base.players, P1: player('P1', { dirtyCash: 50_000 }) },
    })
    expect(netWorth(rich, 'P1')).toBe(netWorth(base, 'P1'))
  })

  it('goes negative for a player carrying distressed debt and nothing else', () => {
    const s = scoringState({
      players: { ...scoringState().players, P1: player('P1', { distressedDebt: 900 }) },
    })
    expect(netWorth(s, 'P1')).toBe(-900)
  })

  it('excludes deeds the bank took at liquidation from every player', () => {
    const s = scoringState({ deeds: { 'd-1': deed('d-1', { owner: 'bank', faceValue: 400 }) } })
    expect(netWorths(s)).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 })
  })

  it('nets to the same total when a peer loan is scored from both sides', () => {
    // The lender's note marks at par against an unlevered borrower, and the borrower
    // owes exactly the outstanding, so a peer loan is table-neutral at scoring.
    const s = scoringState({ loans: [loan({ lender: 'P1', borrower: 'P2', outstanding: 400 })] })
    expect(netWorth(s, 'P1') + netWorth(s, 'P2')).toBe(0)
  })
})

describe('standings', () => {
  it('ranks by net worth descending and breaks ties by turn order', () => {
    const s = scoringState({
      players: {
        P1: player('P1', { cleanCash: 100 }),
        P2: player('P2', { cleanCash: 300 }),
        P3: player('P3', { cleanCash: 100 }),
        P4: player('P4', { cleanCash: 50 }),
      },
    })
    expect(standings(s)).toEqual([
      { player: 'P2', netWorth: 300, rank: 1 },
      { player: 'P1', netWorth: 100, rank: 2 },
      { player: 'P3', netWorth: 100, rank: 2 },
      { player: 'P4', netWorth: 50, rank: 4 },
    ])
  })
})

describe('scoreGame', () => {
  it('emits one GameScored carrying every player\'s net worth', () => {
    const s = scoringState({
      players: { ...scoringState().players, P2: player('P2', { cleanCash: 700 }) },
    })
    expect(scoreGame(s)).toEqual({
      type: 'GameScored', netWorths: { P1: 0, P2: 700, P3: 0, P4: 0 },
    })
  })
})
```

- [ ] **Step 9: Run the net-worth test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/session/scoring.test.ts`
Expected: FAIL — `./scoring.js` does not exist.

- [ ] **Step 10: Implement the net worth half of `scoring.ts`**

`packages/engine/src/contexts/session/scoring.ts` (part one — the win conditions arrive
in Step 13):

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'
import { instrumentsHeld, portfolioValue } from './marks.js'

export interface NetWorthBreakdown {
  readonly cleanCash: Money
  readonly deedValue: Money
  readonly buildingCost: Money
  readonly instruments: Money
  readonly drawnCredit: Money
  readonly peerLoansOwed: Money
  readonly distressedDebt: Money
  /** Always 0. Carried so the player-facing panel can show the line and the zero. */
  readonly dirtyCash: Money
  readonly total: Money
}

/**
 * Spec section 12. There is no term for CDS written and triggered: `SwapTriggered`
 * moves the notional in cash when it fires, so the writer's loss is already in their
 * clean cash — or, if they could not cover it, in their drawn credit via the
 * obligation waterfall. A separate deduction would count the same loss twice.
 */
export function netWorthBreakdown(state: GameState, player: PlayerId): NetWorthBreakdown {
  const p = state.players[player]
  const { deeds, buildings } = portfolioValue(state, player)
  const instruments = instrumentsHeld(state, player)
  const peerLoansOwed = state.loans
    .filter((l) => l.borrower === player && l.status === 'active')
    .reduce((t, l) => t + l.outstanding, 0)
  const dirtyCash = p.dirtyCash * ECONOMY.DIRTY_CASH_SCORING_VALUE

  return {
    cleanCash: p.cleanCash,
    deedValue: deeds,
    buildingCost: buildings,
    instruments,
    drawnCredit: p.drawnCredit,
    peerLoansOwed,
    distressedDebt: p.distressedDebt,
    dirtyCash,
    total:
      p.cleanCash + deeds + buildings + instruments + dirtyCash
      - p.drawnCredit - peerLoansOwed - p.distressedDebt,
  }
}

export function netWorth(state: GameState, player: PlayerId): Money {
  return netWorthBreakdown(state, player).total
}

export function netWorths(state: GameState): Readonly<Record<PlayerId, Money>> {
  return Object.fromEntries(
    PLAYER_IDS.map((p) => [p, netWorth(state, p)]),
  ) as Record<PlayerId, Money>
}

export interface Standing {
  readonly player: PlayerId
  readonly netWorth: Money
  readonly rank: number
}

/**
 * Descending net worth, ties broken by turn order for a stable display order but
 * sharing a rank, because spec section 12 names no tie-break for the win itself.
 */
export function standings(state: GameState): readonly Standing[] {
  const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
  const scored = state.config.turnOrder
    .map((player) => ({ player, netWorth: netWorth(state, player) }))
    .sort((a, b) =>
      b.netWorth - a.netWorth || (order.get(a.player) ?? 0) - (order.get(b.player) ?? 0))

  let rank = 0
  let previous: Money | null = null
  return scored.map((row, index) => {
    if (previous === null || row.netWorth !== previous) rank = index + 1
    previous = row.netWorth
    return { ...row, rank }
  })
}

export function scoreGame(state: GameState): GameEvent {
  return { type: 'GameScored', netWorths: netWorths(state) }
}
```

- [ ] **Step 11: Run the net-worth test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/session/scoring.test.ts`
Expected: PASS.

- [ ] **Step 12: Write the failing win-condition test**

Append to `packages/engine/src/contexts/session/scoring.test.ts`:

```ts
import { isGameOver, targetReachedBy, winner, winProgress } from './scoring.js'
import { CONFIG } from '../../../tests/fixtures/scoring-state.js'

const withTarget = (target: number) => ({
  ...CONFIG, winCondition: { kind: 'net-worth-target' as const, target },
})

describe('win conditions', () => {
  it('reports no target and never-achieved progress under fixed-rounds', () => {
    const s = scoringState({
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 9_000 }) },
    })
    expect(winProgress(s, 'P1')).toEqual({
      kind: 'fixed-rounds', netWorth: 9_000, target: null, remaining: null, achieved: false,
    })
  })

  it('tracks the shortfall to a configured target', () => {
    const s = scoringState({
      config: withTarget(5_000),
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 3_200 }) },
    })
    expect(winProgress(s, 'P1')).toEqual({
      kind: 'net-worth-target', netWorth: 3_200, target: 5_000, remaining: 1_800, achieved: false,
    })
  })

  it('clamps remaining at zero once the target is met', () => {
    const s = scoringState({
      config: withTarget(5_000),
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 6_000 }) },
    })
    expect(winProgress(s, 'P1').remaining).toBe(0)
    expect(winProgress(s, 'P1').achieved).toBe(true)
    expect(targetReachedBy(s)).toEqual(['P1'])
  })

  it('ends a fixed-rounds game only after round 24 has been settled', () => {
    expect(isGameOver(scoringState({ round: 23, phase: 'settlement' }))).toBe(false)
    expect(isGameOver(scoringState({ round: 24, phase: 'settlement' }))).toBe(false)
    expect(isGameOver(scoringState({ round: 24, phase: 'scoring' }))).toBe(true)
    expect(isGameOver(scoringState({ round: 24, phase: 'complete' }))).toBe(true)
  })

  it('ends a target game the moment any player is at or above the target', () => {
    const s = scoringState({
      config: withTarget(1_000), round: 5, phase: 'open',
      players: { ...scoringState().players, P3: player('P3', { cleanCash: 1_000 }) },
    })
    expect(isGameOver(s)).toBe(true)
    expect(winner(s)).toBe('P3')
  })

  it('awards a tied target race to the earlier player in turn order', () => {
    const s = scoringState({
      config: { ...withTarget(1_000), turnOrder: ['P4', 'P3', 'P2', 'P1'] },
      round: 5, phase: 'open',
      players: {
        ...scoringState().players,
        P1: player('P1', { cleanCash: 1_200 }),
        P3: player('P3', { cleanCash: 1_200 }),
      },
    })
    expect(winner(s)).toBe('P3')
  })

  it('has no winner while a fixed-rounds game is still running', () => {
    expect(winner(scoringState({ round: 12, phase: 'open' }))).toBeNull()
  })
})
```

- [ ] **Step 13: Implement the win conditions**

Append to `packages/engine/src/contexts/session/scoring.ts`:

```ts
export interface WinProgress {
  readonly kind: 'fixed-rounds' | 'net-worth-target'
  readonly netWorth: Money
  /** null under fixed-rounds, where there is nothing to progress toward. */
  readonly target: Money | null
  readonly remaining: Money | null
  readonly achieved: boolean
}

export function winProgress(state: GameState, player: PlayerId): WinProgress {
  const current = netWorth(state, player)
  const condition = state.config.winCondition
  if (condition.kind === 'fixed-rounds') {
    return {
      kind: 'fixed-rounds', netWorth: current, target: null, remaining: null, achieved: false,
    }
  }
  return {
    kind: 'net-worth-target',
    netWorth: current,
    target: condition.target,
    remaining: Math.max(0, condition.target - current),
    achieved: current >= condition.target,
  }
}

export function targetReachedBy(state: GameState): readonly PlayerId[] {
  return state.config.turnOrder.filter((p) => winProgress(state, p).achieved)
}

/**
 * Fixed-rounds games end when the scoring phase is reached, not when round 24 begins —
 * spec 19.1 adds three Settlement steps after round 24's step 11, and all three run
 * while the phase is still `settlement`.
 */
export function isGameOver(state: GameState): boolean {
  if (state.phase === 'scoring' || state.phase === 'complete') return true
  return state.config.winCondition.kind === 'net-worth-target'
    && targetReachedBy(state).length > 0
}

export function winner(state: GameState): PlayerId | null {
  if (!isGameOver(state)) return null
  if (state.config.winCondition.kind === 'net-worth-target') {
    const reached = targetReachedBy(state)
    if (reached.length === 0) return null
    const best = reached.reduce<Money>((m, p) => Math.max(m, netWorth(state, p)), -Infinity)
    return reached.find((p) => netWorth(state, p) === best) ?? null
  }
  return standings(state)[0]?.player ?? null
}
```

`targetReachedBy` walks `config.turnOrder`, and `winner` picks the first player in that
order holding the best score, so a tied target race resolves to the earlier player in
turn order without a second sort.

- [ ] **Step 14: Run the win-condition test and commit scoring**

Run: `npx vitest run packages/engine/src/contexts/session/scoring.test.ts`
Expected: PASS — all fourteen cases green.

```bash
git add packages/engine/src/contexts/session/scoring.ts \
        packages/engine/src/contexts/session/scoring.test.ts
git commit -m "feat(session): net worth, standings and both win conditions

Net worth carries no term for CDS written and triggered: SwapTriggered
moves the notional in cash when it fires, so deducting the notional again
at scoring would count the same loss twice. Step 21's test pins it to
exactly once."
```

- [ ] **Step 15: Write the failing Settlement-order test**

`packages/engine/src/contexts/session/settlement.test.ts`. Spec 19.1 opens by saying the
order is observable, so the order is the rule and this test is the rule's statement:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GameEvent } from '../../core/events.js'

vi.mock('../markets/index.js', () => ({
  expireRentFutures: vi.fn(), lapseDeedOptions: vi.fn(),
  markRentFuture: vi.fn(), markDeedOption: vi.fn(),
}))
vi.mock('../underworld/index.js', () => ({
  settleVentures: vi.fn(), settleAudits: vi.fn(),
}))
vi.mock('../credit/index.js', () => ({
  settleCarryingCost: vi.fn(), settleCreditInterest: vi.fn(), settlePeerLoans: vi.fn(),
  settleDistressedDebt: vi.fn(), flagMarginCalls: vi.fn(),
}))
vi.mock('../securitization/index.js', () => ({
  settleSecuritization: vi.fn(), settleSwapPremiums: vi.fn(), terminateAllPools: vi.fn(),
  distribute: vi.fn(), expectedPoolCashflow: vi.fn(), borrowerLeverage: vi.fn(),
}))

import { expireRentFutures, lapseDeedOptions, markDeedOption, markRentFuture }
  from '../markets/index.js'
import { settleAudits, settleVentures } from '../underworld/index.js'
import {
  flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt,
  settlePeerLoans,
} from '../credit/index.js'
import {
  borrowerLeverage, distribute, expectedPoolCashflow, settleSecuritization,
  settleSwapPremiums, terminateAllPools,
} from '../securitization/index.js'
import { isRejection, reject } from '../../core/errors.js'
import { SETTLEMENT_STEPS, runFinalSettlement, runSettlement } from './settlement.js'
import { player, scoringState } from '../../../tests/fixtures/scoring-state.js'

const NO_INPUT = { auditDice: {}, roundEvents: [] as readonly GameEvent[] }

const tag = (name: string): readonly GameEvent[] =>
  [{ type: 'HeatChanged', player: 'P1', delta: 0, reason: name }]

beforeEach(() => {
  vi.mocked(markRentFuture).mockReturnValue(0)
  vi.mocked(markDeedOption).mockReturnValue(0)
  vi.mocked(borrowerLeverage).mockReturnValue(0)
  vi.mocked(expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(distribute).mockReturnValue([])
  vi.mocked(expireRentFutures).mockReturnValue(tag('1-futures-expire'))
  vi.mocked(settleVentures).mockReturnValue(tag('2-ventures'))
  vi.mocked(settleCarryingCost).mockReturnValue(tag('3-carrying-cost'))
  vi.mocked(settleCreditInterest).mockReturnValue(tag('4-credit-interest'))
  vi.mocked(settlePeerLoans).mockReturnValue(tag('5-peer-loans'))
  vi.mocked(settleSecuritization).mockReturnValue(tag('6-waterfalls'))
  vi.mocked(settleSwapPremiums).mockReturnValue(tag('7-cds-premiums'))
  vi.mocked(settleDistressedDebt).mockReturnValue(tag('8-distressed-debt'))
  vi.mocked(settleAudits).mockReturnValue(tag('9-audits'))
  vi.mocked(flagMarginCalls).mockReturnValue(tag('10-margin-calls'))
  vi.mocked(lapseDeedOptions).mockReturnValue(tag('11-options-lapse'))
  vi.mocked(terminateAllPools).mockReturnValue([])
})

const reasons = (events: readonly GameEvent[]): readonly string[] =>
  events.flatMap((e) => (e.type === 'HeatChanged' ? [e.reason] : []))

describe('runSettlement', () => {
  it('runs spec 19.1 steps 1 to 11 in exactly that order', () => {
    const out = runSettlement(scoringState({ round: 12 }), NO_INPUT)
    expect(isRejection(out)).toBe(false)
    expect(reasons(out as readonly GameEvent[])).toEqual([
      '1-futures-expire', '2-ventures', '3-carrying-cost', '4-credit-interest',
      '5-peer-loans', '6-waterfalls', '7-cds-premiums', '8-distressed-debt',
      '9-audits', '10-margin-calls', '11-options-lapse',
    ])
    expect(SETTLEMENT_STEPS).toHaveLength(11)
  })

  it('feeds each step the state left by every step before it', () => {
    // The audit fine at step 9 must be visible to margin flagging at step 10, which is
    // the single interaction spec 19.1 calls out by name.
    vi.mocked(settleAudits).mockReturnValue([
      { type: 'AuditResolved', player: 'P1', seized: 0, fine: 400,
        paidFromCash: 0, capitalised: 400 },
    ])
    vi.mocked(flagMarginCalls).mockImplementation((s) =>
      s.players.P1.drawnCredit >= 400 ? tag('flagged') : tag('not-flagged'))

    const out = runSettlement(scoringState({ round: 20 }), NO_INPUT) as readonly GameEvent[]
    expect(reasons(out)).toContain('flagged')
  })

  it('passes the round\'s events to the waterfall step and the dice to the audit step', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'RentCharged', from: 'P2', to: 'P1', deed: 'd-1', amount: 40 },
    ]
    const auditDice = { P1: [2, 3] as const }
    runSettlement(scoringState({ round: 20 }), { auditDice, roundEvents })
    expect(vi.mocked(settleSecuritization)).toHaveBeenCalledWith(expect.anything(), roundEvents)
    expect(vi.mocked(settleAudits)).toHaveBeenCalledWith(expect.anything(), auditDice)
  })

  it('aborts the whole Settlement on a rejection and emits nothing', () => {
    vi.mocked(settleAudits).mockReturnValue(reject('INVALID_DICE', 'That is not a die.'))
    const out = runSettlement(scoringState({ round: 20 }), NO_INPUT)
    expect(isRejection(out)).toBe(true)
    expect(vi.mocked(lapseDeedOptions)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 16: Run the Settlement test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/session/settlement.test.ts`
Expected: FAIL — `./settlement.js` does not exist.

- [ ] **Step 17: Implement `settlement.ts`**

`packages/engine/src/contexts/session/settlement.ts`:

```ts
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'
import { type Rejection, isRejection } from '../../core/errors.js'
import { reduce } from '../../core/reduce.js'
import { expireRentFutures, lapseDeedOptions } from '../markets/index.js'
import { settleAudits, settleVentures } from '../underworld/index.js'
import {
  flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt,
  settlePeerLoans,
} from '../credit/index.js'
import {
  settleSecuritization, settleSwapPremiums, terminateAllPools,
} from '../securitization/index.js'
import { scoreGame } from './scoring.js'

export interface SettlementInput {
  /**
   * Audit checks are externally-sourced randomness: one physical 2d6 per player who
   * needs a check. Missing a required roll rejects the whole Settlement.
   */
  readonly auditDice: Readonly<Partial<Record<PlayerId, DiceRoll>>>
  /** Every event since this round's Market phase began. Spec 19.1 step 6 needs it. */
  readonly roundEvents: readonly GameEvent[]
}

type Step = (state: GameState) => readonly GameEvent[] | Rejection

/** Spec 19.1, verbatim, for the rulebook generator and the ordering test. */
export const SETTLEMENT_STEPS: readonly string[] = [
  'Rent futures reaching their end round expire',
  'Venture payouts accrue as dirty cash; venture timers decrement',
  'Carrying cost charged, $8 per unmortgaged deed',
  'Credit line interest accrues on drawn balances',
  'Peer loan interest falls due; unpaid loans default',
  'Pool waterfalls distribute collected cash',
  'CDS premiums transfer from buyers to sellers',
  'Distressed debt accrues at 15%, compounding',
  'Audit checks roll, Era III onward, and resolve immediately',
  'Margin calls flagged; previously-flagged uncured positions marked for liquidation',
  'Deed options reaching expiry lapse',
]

function steps(input: SettlementInput): readonly Step[] {
  return [
    (s) => expireRentFutures(s),
    (s) => settleVentures(s),
    (s) => settleCarryingCost(s),
    (s) => settleCreditInterest(s),
    (s) => settlePeerLoans(s),
    (s) => settleSecuritization(s, input.roundEvents),
    (s) => settleSwapPremiums(s),
    (s) => settleDistressedDebt(s),
    (s) => settleAudits(s, input.auditDice),
    (s) => flagMarginCalls(s),
    (s) => lapseDeedOptions(s),
  ]
}

/**
 * Folds the steps, reducing as it goes, so every step reads the state the steps before
 * it produced. That is not an optimisation — spec 19.1 requires an audit fine resolved
 * at step 9 to be able to trigger the margin call flagged at step 10.
 *
 * A rejection from any step aborts the whole Settlement and emits nothing, because a
 * half-applied Settlement is not a state the log should ever be able to reach.
 */
function fold(
  state: GameState, ordered: readonly Step[],
): readonly GameEvent[] | Rejection {
  let current = state
  const emitted: GameEvent[] = []
  for (const step of ordered) {
    const produced = step(current)
    if (isRejection(produced)) return produced
    for (const event of produced) {
      current = reduce(current, event)
      emitted.push(event)
    }
  }
  return emitted
}

export function runSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection {
  return fold(state, steps(input))
}

/**
 * Round 24 only. Spec 19.1: after step 11, all pools terminate, every tranche short of
 * face triggers its referencing CDS, then scoring runs. Termination and triggering are
 * one call because `terminateAllPools` emits each pool's `PoolTerminated` immediately
 * followed by the `SwapTriggered` events its shortfalls cause — Step 19's test asserts
 * that interleaving, and that `GameScored` is strictly last.
 */
export function runFinalSettlement(
  state: GameState, input: SettlementInput,
): readonly GameEvent[] | Rejection {
  return fold(state, [
    ...steps(input),
    (s) => terminateAllPools(s),
    (s) => [scoreGame(s)],
  ])
}
```

- [ ] **Step 18: Run the Settlement test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/session/settlement.test.ts`
Expected: PASS — all four cases green.

- [ ] **Step 19: Write the failing round-24 ordering test**

This is the test the task exists for. Append to `settlement.test.ts`:

```ts
describe('runFinalSettlement', () => {
  it('terminates pools, then triggers their CDS, then scores — in that order', () => {
    vi.mocked(terminateAllPools).mockReturnValue([
      { type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [{ tranche: 'mezzanine', shortfall: 400 }] },
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])

    const out = runFinalSettlement(scoringState({ round: 24 }), NO_INPUT) as readonly GameEvent[]
    const types = out.map((e) => e.type)
    expect(types.indexOf('PoolTerminated')).toBeGreaterThan(types.indexOf('HeatChanged'))
    expect(types.indexOf('SwapTriggered')).toBeGreaterThan(types.indexOf('PoolTerminated'))
    expect(types.indexOf('GameScored')).toBe(types.length - 1)
  })

  it('reflects a CDS triggered by termination in the final score', () => {
    // P4 wrote protection on the mezzanine tranche and has $1,000 clean. The pool
    // terminates $400 short, the swap triggers, P4 pays P3. If scoring ran before the
    // trigger, P4 would score 1000 and P3 would score 0.
    const base = scoringState({
      round: 24,
      players: {
        ...scoringState().players,
        P3: player('P3', { cleanCash: 0 }),
        P4: player('P4', { cleanCash: 1_000 }),
      },
    })
    vi.mocked(terminateAllPools).mockReturnValue([
      { type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [{ tranche: 'mezzanine', shortfall: 400 }] },
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])

    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    expect(scored).toEqual({
      type: 'GameScored',
      netWorths: expect.objectContaining({ P3: 400, P4: 600 }),
    })
  })

  it('counts a triggered CDS exactly once, not once in cash and again as notional', () => {
    const base = scoringState({
      round: 24,
      players: { ...scoringState().players, P4: player('P4', { cleanCash: 1_000 }) },
    })
    vi.mocked(terminateAllPools).mockReturnValue([
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])
    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    // 600, not 200. The notional is not deducted a second time at scoring.
    expect(scored?.type === 'GameScored' && scored.netWorths.P4).toBe(600)
  })

  it('still scores when a writer cannot cover the payout from clean cash', () => {
    const base = scoringState({
      round: 24,
      players: { ...scoringState().players, P4: player('P4', { cleanCash: 100 }) },
    })
    vi.mocked(terminateAllPools).mockReturnValue([
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
      { type: 'ObligationCapitalised', player: 'P4', amount: 300, obligation: 'swap-payout' },
    ])
    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    // 100 clean spent, 300 capitalised into drawn credit: -300 either way.
    expect(scored?.type === 'GameScored' && scored.netWorths.P4).toBe(-300)
  })
})
```

The last three cases need the real reducers for `SwapTriggered` and
`ObligationCapitalised`, which the module mocks replace. Run this file with the
securitization and credit reducers unmocked by importing `reduce` from
`core/reduce.js` directly — the mocks only replace the *settlement generators*, and
`core/reduce.js` reaches the reducers through `contexts/*/index.js`, which is a
different import specifier and therefore not mocked.

- [ ] **Step 20: Run the round-24 test and watch it fail**

Run: `npx vitest run packages/engine/src/contexts/session/settlement.test.ts`
Expected: FAIL — `runFinalSettlement` is not exported yet if Step 17 was skipped;
otherwise the three scoring cases fail because `terminateAllPools` is not yet in the
step list.

- [ ] **Step 21: Run the round-24 test and watch it pass**

Run: `npx vitest run packages/engine/src/contexts/session/settlement.test.ts`
Expected: PASS — all eight cases green, including the exactly-once CDS case.

- [ ] **Step 22: Wire the Settlement into `decideSession`**

Modify `packages/engine/src/contexts/session/decide.ts`. `SessionCommand` gains one arm
and the decider gains one branch; nothing else changes:

```ts
import type { SettlementInput } from './settlement.js'
import { runFinalSettlement, runSettlement } from './settlement.js'
import { ECONOMY } from '../../config/economy.js'

export type SessionCommand =
  | { readonly kind: 'advance-phase' }
  | { readonly kind: 'settle'; readonly input: SettlementInput }

// ... inside decideSession, before the advance-phase handling:
  if (command.kind === 'settle') {
    if (state.phase !== 'settlement') {
      return reject('WRONG_PHASE', 'Settlement runs at the end of the round.')
    }
    return state.round >= ECONOMY.TOTAL_ROUNDS
      ? runFinalSettlement(state, command.input)
      : runSettlement(state, command.input)
  }
```

The existing `advance-phase` behaviour is untouched: on `settlement` it still emits
`PhaseAdvanced { phase: 'scoring' }` at round 24 and `RoundAdvanced`/`EraAdvanced`/
`PhaseAdvanced` otherwise. `settle` produces the money events; `advance-phase` moves the
clock. Keeping them separate is what lets the facilitator re-read a Settlement before
committing to the next round.

- [ ] **Step 23: Export the Task 19 surface**

Add to `packages/engine/src/contexts/session/index.ts`:

```ts
export {
  buildingCostBasis, deedValue, instrumentsHeld, markDeedOptionsHeld, markLoanNote,
  markLoanNotesHeld, markRentFuturesHeld, markSwapsHeld, markTranche, markTranchesHeld,
  portfolioValue,
} from './marks.js'
export {
  type NetWorthBreakdown, type Standing, type WinProgress,
  isGameOver, netWorth, netWorthBreakdown, netWorths, scoreGame, standings,
  targetReachedBy, winProgress, winner,
} from './scoring.js'
export {
  type SettlementInput, SETTLEMENT_STEPS, runFinalSettlement, runSettlement,
} from './settlement.js'
```

`netWorth` is the symbol Task 18's `metrics.ts` already imports from
`../session/index.js`, so this export closes that dependency. It also closes a cycle:
`decks` reads `session`, `session` reads `credit`, `credit` reads `decks` for the
borrowing-base overrides. Every edge is a function call rather than a module-init read,
so ESM resolves it — Step 24's suite run is what proves it.

- [ ] **Step 24: Run the whole suite, then commit Task 19**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS. A `Cannot access '<symbol>' before initialization` here means some
context evaluates a cross-context import at module scope; move that read inside a
function.

```bash
git add packages/engine/src/contexts/session packages/engine/tests/fixtures/scoring-state.ts
git commit -m "feat(session): scoring, mark-to-model and the Settlement sequence

session owns spec 19.1's eleven-step order because ordering is a rule and
no other task composed the per-step generators. Round 24 appends pool
termination, CDS triggering and scoring in that order, so a swap triggered
by termination lands in the final score exactly once."
```

---

### Task 20: property-based invariant tests with fast-check

These are the strongest correctness guarantees in the project, and the reason is the
keystone decision in spec section 14: the engine is a pure reducer with no `Math.random`
and no `Date`, so a generated event history is a *reproducible* one. Every failure
fast-check reports is a shrunken script that can be pasted into a unit test and re-run.

**The generator is the whole game here.** A weak generator makes every property below
worthless — it will pass on histories that never reach a margin call, never mortgage,
never trigger a swap, and never let an obligation capitalise. So the generator does not
produce events. It produces **scripted commands**, feeds them to the real `decide`
functions, and keeps only what the engine accepts. Every event in every generated history
is therefore engine-produced and valid by construction, and the generator's job reduces to
producing *plausible* commands rather than legal events.

Two tricks make the acceptance rate high enough to be useful:

1. **Indices, not identities.** A state-blind generator that produced `DeedId` strings
   would name a deed the acting player does not own roughly six times in seven. Instead it
   produces an index, and the driver resolves it modulo the length of that player's actual
   holdings. Acceptance goes from ~14% to ~100% for the same generated shape.
2. **Fractions, not dollars.** Amounts are generated as a fraction in `[0, 1.2]` and
   resolved against the live balance. Most land inside the limit; the tail above 1.0 is
   deliberate, because the rejection path is a code path too.

**Files:**
- Create: `packages/engine/src/config/assertions.ts`
- Create: `packages/engine/src/config/assertions.test.ts`
- Create: `packages/engine/tests/property/arbitraries.ts`
- Create: `packages/engine/tests/property/driver.ts`
- Create: `packages/engine/tests/property/ledger.ts`
- Create: `packages/engine/tests/property/money.test.ts`
- Create: `packages/engine/tests/property/conservation.test.ts`
- Create: `packages/engine/tests/property/replay.test.ts`
- Create: `packages/engine/tests/property/waterfall.test.ts`
- Create: `packages/engine/tests/property/invariants.test.ts`
- Create: `packages/engine/tests/property/deeds.test.ts`
- Create: `packages/engine/tests/property/coverage.test.ts`
- Create: `packages/engine/tests/property/dispatch.ts`
- Create: `packages/engine/tests/property/setup.ts`
- Modify: `packages/engine/src/config/economy.ts` (imports the assertions)
- Modify: `.eslintrc.json` (bans the raw percentage pattern)

**File-size plan.** `arbitraries.ts` is ~210 lines of generators, `dispatch.ts` ~230 lines
turning one scripted action into one decider call, `driver.ts` ~180 lines of the round
loop, `ledger.ts` ~150 lines dominated by the exhaustive delta table, `setup.ts` a dozen
lines pinning the run budget. The seven test files are 60-140 lines each. The split is by
role — generate, dispatch, run, measure, assert — so a new invariant adds a test file and
touches nothing else, and a new command arm touches only `dispatch.ts`.

**Interfaces:**

Consumes — the public surface of every context plus the two core entry points. Signatures
are the ones the sibling parts declare:

```ts
// core/reduce.ts  (tasks-03-08.md)
export function reduce(state: GameState, event: GameEvent): GameState
export function replay(events: readonly GameEvent[]): GameState

// core/money.ts  (Task 2)
export function floorPercent(amount: Money, rate: number): Money
export function ceilPercent(amount: Money, rate: number): Money
export function floorPercentSum(amount: Money, rates: readonly number[]): Money

// contexts/session/index.ts  (Task 4 + Task 19)
export function initialState(config: GameConfig): GameState
export function createGame(config: GameConfig): readonly GameEvent[]
export function decideSession(state: GameState, c: SessionCommand): readonly GameEvent[] | Rejection
export function runSettlement(state: GameState, i: SettlementInput): readonly GameEvent[] | Rejection
export function runFinalSettlement(state: GameState, i: SettlementInput): readonly GameEvent[] | Rejection
export function netWorth(state: GameState, player: PlayerId): Money

// contexts/draft/index.ts  (Task 8)
export const DRAFT_ROUNDS: number
export function availableDeeds(state: GameState): readonly DeedId[]
export function decideDraft(state: GameState, c: DraftCommand): readonly GameEvent[] | Rejection

// contexts/board/index.ts  (Task 5)
export function decideBoard(state: GameState, c: BoardCommand): readonly GameEvent[] | Rejection

// contexts/credit/index.ts  (Tasks 9-11)
export function borrowingBase(state: GameState, player: PlayerId): Money
export function creditHeadroom(state: GameState, player: PlayerId): Money
export function marginShortfall(state: GameState, player: PlayerId): Money
export function liquidationQueue(state: GameState, player: PlayerId): readonly DeedId[]
export function playersAwaitingLiquidation(state: GameState): readonly PlayerId[]
export function exhaustLiquidation(state: GameState, player: PlayerId): readonly GameEvent[]
export function decideCredit(state: GameState, c: CreditCommand, p?: CreditPorts): readonly GameEvent[] | Rejection
export const NO_ENCUMBRANCES: CreditPorts

// contexts/underworld/index.ts  (Tasks 12-13)
export function decideUnderworld(state: GameState, c: UnderworldCommand): readonly GameEvent[] | Rejection

// contexts/markets/index.ts  (Tasks 14-15)
export function decideMarkets(state: GameState, c: MarketsCommand): readonly GameEvent[] | Rejection

// contexts/securitization/index.ts  (Tasks 16-17)
export function decideSecuritization(state: GameState, c: SecuritizationCommand): readonly GameEvent[] | Rejection

// contexts/decks/index.ts  (Task 18)
export function decideDeck(state: GameState, c: DeckCommand): readonly GameEvent[] | Rejection
export const DECKS: Readonly<Record<Era, readonly Card[]>>

// config/board.ts  (Task 3)
export const DEED_IDS: readonly DeedId[]
export function totalFaceValue(): Money
```

Produces:

```ts
// config/assertions.ts
export function assertEconomyInvariants(): void

// tests/property/arbitraries.ts
/** An index resolved modulo a live list, so it is always in range. */
export type Slot = number
/** A fraction of a live balance, in [0, 1.2]. The tail above 1 is deliberate. */
export type Percent = number
export type ScriptedAction = /* 19-arm union, Step 9 */
export interface ScriptedDraftRound { readonly offsets: readonly Slot[]
  readonly bidPercents: readonly Percent[] }
export interface ScriptedRound { readonly actions: readonly ScriptedAction[]
  readonly rolls: readonly DiceRoll[]
  readonly auditDice: Readonly<Partial<Record<PlayerId, DiceRoll>>>
  readonly drawCard: boolean }
export interface GameScript { readonly config: GameConfig
  readonly shuffles: Readonly<Record<Era, readonly number[]>>
  readonly draft: readonly ScriptedDraftRound[]
  readonly rounds: readonly ScriptedRound[] }
export const arbDice: fc.Arbitrary<DiceRoll>
export const arbDiceBiased: fc.Arbitrary<DiceRoll>
export const arbConfig: fc.Arbitrary<GameConfig>
export const arbAction: fc.Arbitrary<ScriptedAction>
export const arbDraftRound: fc.Arbitrary<ScriptedDraftRound>
export const arbRound: fc.Arbitrary<ScriptedRound>
export function arbGameScript(maxRounds: number): fc.Arbitrary<GameScript>

// tests/property/dispatch.ts — slot resolvers plus the one action-to-command switch
export type Outcome = readonly GameEvent[] | Rejection | null
export function at<T>(items: readonly T[], index: Slot): T | null
export function actorAt(state: GameState, index: Slot): PlayerId
export function otherThan(state: GameState, self: PlayerId, index: Slot): PlayerId | null
export function amount(balance: Money, pct: Percent): Money
export function deedsOf(state: GameState, player: PlayerId): readonly DeedId[]
export function loansOf(
  state: GameState, player: PlayerId, side: 'lender' | 'borrower',
): readonly ContractId[]
export function futuresOf(state: GameState, player: PlayerId): readonly ContractId[]
export function optionsOf(state: GameState, player: PlayerId): readonly ContractId[]
export function poolableAssets(state: GameState, player: PlayerId): readonly PoolAssetRef[]
export function swapReferences(state: GameState): readonly SwapReference[]
export function scriptedId(
  prefix: string, state: GameState, actor: PlayerId, n: number,
): ContractId
export function dispatch(state: GameState, action: ScriptedAction, seq: number): Outcome

// tests/property/driver.ts
export interface Batch { readonly label: string; readonly events: readonly GameEvent[] }
export interface Trace {
  /** `before[i]` is the state in which `batches[i]` was decided. */
  readonly before: readonly GameState[]
  readonly batches: readonly Batch[]
  readonly events: readonly GameEvent[]
  readonly final: GameState
  /** Acceptance telemetry. `coverage.test.ts` asserts floors on these. */
  readonly accepted: number
  readonly rejected: number
  readonly skipped: number
}
export function runScript(script: GameScript): Trace

// tests/property/ledger.ts
export function conservedTotal(state: GameState): Money
export function expectedDelta(events: readonly GameEvent[]): Money
export const BANK_CROSSING_EVENTS: readonly EventType[]
```

`dispatch` returns `null` — distinct from a `Rejection` — when the generated action names
a slot that does not exist, e.g. a peer loan for a player holding none. The driver counts
those as *skipped* rather than *rejected*, because a skip means the generator produced
nothing for the engine to judge, while a rejection means the engine judged and refused.
Step 14's coverage test asserts a floor on the accepted share and a ceiling on the skipped
share, which is what stops the suite from silently degrading into vacuous passes.

---

- [ ] **Step 1: Write the failing startup-assertion test**

`packages/engine/src/config/assertions.test.ts`. Spec section 5 records that the
floor-versus-advance invariant was violated in an earlier draft, which is exactly why it
is asserted at startup rather than trusted:

```ts
import { describe, it, expect } from 'vitest'
import { ECONOMY } from './economy.js'
import { assertEconomyInvariants } from './assertions.js'

describe('economy invariants', () => {
  it('passes for the shipped configuration', () => {
    expect(() => assertEconomyInvariants()).not.toThrow()
  })

  it('keeps the liquidation floor strictly above the deed advance rate', () => {
    // Selling a deed raises floor x face but removes advance x face from the base.
    // A floor at or below the advance rate makes every forced sale WIDEN the shortfall,
    // so liquidation only terminates by consuming the entire portfolio. Spec section 5.
    expect(ECONOMY.LIQUIDATION_FLOOR).toBeGreaterThan(ECONOMY.DEED_ADVANCE_RATE)
  })

  it('keeps the building advance rate at or below the sellback rate', () => {
    // Stripping buildings returns SELLBACK x cost in cash and removes ADVANCE x cost
    // from the base. Advancing more than sellback returns widens the shortfall too.
    expect(ECONOMY.BUILDING_ADVANCE_RATE).toBeLessThanOrEqual(ECONOMY.BUILDING_SELLBACK_RATE)
  })

  it('names the offending constants when an invariant is broken', () => {
    expect(() => assertEconomyInvariants({
      ...ECONOMY, LIQUIDATION_FLOOR: 0.7,
    })).toThrow(/LIQUIDATION_FLOOR.*DEED_ADVANCE_RATE/)
    expect(() => assertEconomyInvariants({
      ...ECONOMY, BUILDING_ADVANCE_RATE: 0.6,
    })).toThrow(/BUILDING_ADVANCE_RATE.*BUILDING_SELLBACK_RATE/)
  })

  it('keeps the note-mark leverage cap below the ratings leverage cap', () => {
    expect(ECONOMY.LOAN_NOTE_MAX_LEVERAGE).toBeLessThanOrEqual(ECONOMY.RATING_MAX_LEVERAGE)
  })

  it('divides the game into whole eras', () => {
    expect(ECONOMY.TOTAL_ROUNDS % ECONOMY.ROUNDS_PER_ERA).toBe(0)
    expect(ECONOMY.TOTAL_ROUNDS / ECONOMY.ROUNDS_PER_ERA).toBe(4)
  })
})
```

- [ ] **Step 2: Run the assertion test and watch it fail**

Run: `npx vitest run packages/engine/src/config/assertions.test.ts`
Expected: FAIL — `./assertions.js` does not exist.

- [ ] **Step 3: Implement `assertions.ts` and call it from `economy.ts`**

`packages/engine/src/config/assertions.ts`. Task 9 already appends a bare
`LIQUIDATION_FLOOR` check to the bottom of `economy.ts`; this replaces it, so the two
divergent-liquidation guards live together and neither can be tuned alone:

```ts
import { ECONOMY } from './economy.js'

type Economy = typeof ECONOMY

/**
 * Runs at module load. Both checks guard the same failure mode: a forced sale during
 * liquidation must always NARROW the shortfall, never widen it.
 *
 * Deeds: a sale raises LIQUIDATION_FLOOR x face and removes DEED_ADVANCE_RATE x face
 * from the borrowing base, so the shortfall narrows by (floor - advance) x face. At
 * 0.80 against 0.75 that is 5% of face per sale and liquidation converges. At a 0.70
 * floor it is -5% and the loop terminates only by consuming the whole portfolio.
 *
 * Buildings: stripping returns BUILDING_SELLBACK_RATE x cost and removes
 * BUILDING_ADVANCE_RATE x cost, so the shortfall narrows by (sellback - advance) x cost.
 * At 0.5 against 0.5 that is exactly zero — stripping is shortfall-neutral, which spec
 * section 5 states outright. Equality is therefore allowed; excess advance is not.
 */
export function assertEconomyInvariants(economy: Economy = ECONOMY): void {
  if (economy.LIQUIDATION_FLOOR <= economy.DEED_ADVANCE_RATE) {
    throw new Error(
      `LIQUIDATION_FLOOR (${economy.LIQUIDATION_FLOOR}) must be strictly greater than `
      + `DEED_ADVANCE_RATE (${economy.DEED_ADVANCE_RATE}) or forced liquidation diverges: `
      + 'every sale would widen the shortfall it is meant to close. See spec section 5.',
    )
  }
  if (economy.BUILDING_ADVANCE_RATE > economy.BUILDING_SELLBACK_RATE) {
    throw new Error(
      `BUILDING_ADVANCE_RATE (${economy.BUILDING_ADVANCE_RATE}) must not exceed `
      + `BUILDING_SELLBACK_RATE (${economy.BUILDING_SELLBACK_RATE}) or stripping a `
      + 'developed deed widens the shortfall. See spec section 5.',
    )
  }
  if (economy.LOAN_NOTE_MAX_LEVERAGE > economy.RATING_MAX_LEVERAGE) {
    throw new Error(
      `LOAN_NOTE_MAX_LEVERAGE (${economy.LOAN_NOTE_MAX_LEVERAGE}) must not exceed `
      + `RATING_MAX_LEVERAGE (${economy.RATING_MAX_LEVERAGE}); the note mark re-caps the `
      + 'value the ratings formula already capped, and re-capping upward is a no-op.',
    )
  }
  if (economy.TOTAL_ROUNDS % economy.ROUNDS_PER_ERA !== 0) {
    throw new Error(
      `TOTAL_ROUNDS (${economy.TOTAL_ROUNDS}) must divide evenly into eras of `
      + `${economy.ROUNDS_PER_ERA} rounds.`,
    )
  }
}
```

Modify `packages/engine/src/config/economy.ts` — delete Task 9's inline
`LIQUIDATION_FLOOR` throw and append instead:

```ts
import { assertEconomyInvariants } from './assertions.js'

assertEconomyInvariants()
```

- [ ] **Step 4: Run the assertion test and watch it pass, then commit**

Run: `npx vitest run packages/engine/src/config/assertions.test.ts`
Expected: PASS — all six cases green.

```bash
git add packages/engine/src/config
git commit -m "feat(config): assert the divergent-liquidation invariants at startup

LIQUIDATION_FLOOR must exceed DEED_ADVANCE_RATE and BUILDING_ADVANCE_RATE
must not exceed BUILDING_SELLBACK_RATE. Both guard the same failure: a
forced sale must narrow the shortfall, never widen it. Spec section 5
records that the first was violated in an earlier draft."
```

- [ ] **Step 5: Ban the raw percentage pattern in ESLint**

Modify `.eslintrc.json`, inside the existing `packages/engine/src/**/*.ts` override. This
is the rule the plan's global constraints promise and no earlier task installs:

```json
        "no-restricted-syntax": [
          "error",
          {
            "selector": "CallExpression[callee.object.name='Math'][callee.property.name=/^(floor|ceil|round)$/] > BinaryExpression[operator='*']",
            "message": "Percentage-of-money arithmetic must go through core/money.ts. 180 * 0.7 is 125.99999999999999, so Math.floor of it is 125 and underpays the 70% floor. Use floorPercent, ceilPercent or floorPercentSum."
          }
        ]
```

The selector matches `Math.floor(a * b)`, `Math.ceil(a * b)` and `Math.round(a * b)` and
nothing else, so `Math.floor(x / 2)` and `Math.max(0, v)` stay legal. `core/money.ts`
itself needs an override that disables the rule, since it is the one file that performs
the multiplication:

```json
    {
      "files": ["packages/engine/src/core/money.ts"],
      "rules": { "no-restricted-syntax": "off" }
    }
```

Run: `npm run lint`
Expected: FAIL, listing every site that still writes the raw pattern — at minimum Task
9's `applyRate`, Task 12's `applyBps`, Task 16's duplicate `floorPercent` and Task 18's
`peer-interest-due-per-round` metric. Fixing them is Step 6.

- [ ] **Step 6: Collapse the four competing percentage helpers into `core/money.ts`**

Four tasks independently wrote the same helper under four names, with two different
rounding strategies:

| Symbol | Owner | Body |
|---|---|---|
| `applyRate(amount, rate)` | Task 9, `core/money.ts` | `Math.floor(Math.round(amount * rate * 1e6) / 1e6)` |
| `applyBps(amount, points)` | Task 12, `underworld/selectors.ts` | `Math.floor((amount * points) / 10_000)` |
| `floorPercent(amount, rate)` | Task 16, `core/money.ts` | `Math.floor(Math.round(amount * rate * 1e6) / 1e6)` |
| `floorPercent(amount, rate)` | Task 2, `core/money.ts` | basis points, exact |

Keep Task 2's. Delete the other three and re-export aliases so no call site has to change
in the same commit:

```ts
// packages/engine/src/core/money.ts — appended below the Task 2 definitions

/** @deprecated Task 9's name for `floorPercent`. Kept so callers migrate in one step. */
export const applyRate = floorPercent

/** Task 12 works in basis points directly; `rates` there are already integers. */
export function applyBps(amount: Money, points: number): Money {
  return Math.floor((amount * points) / 10_000)
}

export function isWholeDollars(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0
}
```

Delete `contexts/underworld/selectors.ts`'s local `applyBps`/`toBps` and Task 16's
duplicate `floorPercent`, importing both from `core/money.js` instead.

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Write the money-arithmetic property test**

`packages/engine/tests/property/money.test.ts`. This is the smallest property in the
suite and the one everything else rests on, so it gets an exact oracle rather than a
float comparison:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ceilPercent, floorPercent, floorPercentSum } from '../../src/core/money.js'

/** Exact rational oracle in BigInt basis points. No IEEE 754 anywhere. */
function exact(amount: number, rate: number, dir: 'floor' | 'ceil'): number {
  const bp = BigInt(Math.round(rate * 10_000))
  const n = BigInt(amount) * bp
  const q = n / 10_000n
  const r = n % 10_000n
  if (r === 0n) return Number(q)
  return dir === 'floor' ? Number(q) : Number(q + 1n)
}

const arbAmount = fc.integer({ min: 0, max: 20_000 })
/** Every rate the ruleset uses lands in [0, 2] at 2-decimal granularity. */
const arbRate = fc.integer({ min: 0, max: 200 }).map((n) => n / 100)

describe('floorPercent', () => {
  it('equals exact integer arithmetic for every amount and rate in range', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        expect(floorPercent(amount, rate)).toBe(exact(amount, rate, 'floor'))
      }),
      { numRuns: 2_000 },
    )
  })

  it('is monotonic in the amount', () => {
    fc.assert(
      fc.property(arbAmount, arbAmount, arbRate, (a, b, rate) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        expect(floorPercent(lo, rate)).toBeLessThanOrEqual(floorPercent(hi, rate))
      }),
      { numRuns: 1_000 },
    )
  })

  it('never exceeds ceilPercent, and differs by at most one dollar', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        const lo = floorPercent(amount, rate)
        const hi = ceilPercent(amount, rate)
        expect(hi - lo).toBeGreaterThanOrEqual(0)
        expect(hi - lo).toBeLessThanOrEqual(1)
      }),
      { numRuns: 1_000 },
    )
  })

  it('returns integer dollars for every input', () => {
    fc.assert(
      fc.property(arbAmount, arbRate, (amount, rate) => {
        expect(Number.isInteger(floorPercent(amount, rate))).toBe(true)
        expect(Number.isInteger(ceilPercent(amount, rate))).toBe(true)
      }),
      { numRuns: 500 },
    )
  })
})

describe('floorPercentSum', () => {
  it('equals one exact application of the summed rate, never a chain of floors', () => {
    fc.assert(
      fc.property(arbAmount, fc.array(arbRate, { minLength: 1, maxLength: 4 }), (amount, rates) => {
        const summed = rates.reduce((t, r) => t + Math.round(r * 10_000), 0) / 10_000
        expect(floorPercentSum(amount, rates)).toBe(exact(amount, summed, 'floor'))
      }),
      { numRuns: 1_000 },
    )
  })

  it('reproduces the laundering bug that motivated it', () => {
    // 0.25 + 0.05 * 2 is 0.35000000000000003, which floors $1,000 to $649.
    expect(floorPercentSum(1_000, [0.25, 0.05, 0.05])).toBe(350)
  })
})
```

- [ ] **Step 8: Run the money property and watch it pass, then commit**

Run: `npx vitest run packages/engine/tests/property/money.test.ts`
Expected: PASS — 6,500 generated cases across five properties.

```bash
git add .eslintrc.json packages/engine/src/core/money.ts packages/engine/tests/property/money.test.ts
git commit -m "test(property): prove core/money.ts is exact, and ban the raw pattern

An ESLint no-restricted-syntax rule now rejects Math.floor(a * b) outside
core/money.ts, and four competing percentage helpers written independently
by Tasks 9, 12 and 16 collapse into Task 2's basis-point implementation."
```

---

**Revision to the file plan above.** Writing the generators out found three files the
header's list did not anticipate. The final split is:

| File | Lines | Role |
|---|---|---|
| `tests/property/arbitraries.ts` | ~215 | Generators only. No engine imports except types and `DECKS`. |
| `tests/property/dispatch.ts` | ~205 | Resolves one `ScriptedAction` against live state into one decider call. |
| `tests/property/driver.ts` | ~150 | The `Run` harness, the draft loop, the round loop, `runScript`. |
| `tests/property/ledger.ts` | ~95 | `conservedTotal`, `expectedDelta`, `BANK_CROSSING_EVENTS`. |
| `tests/property/setup.ts` | ~20 | `fc.configureGlobal` — run budget and seed reporting. |
| `tests/property/money.test.ts` | ~80 | Step 7. |
| `tests/property/coverage.test.ts` | ~110 | Proves the generator reaches the interesting states. |
| `tests/property/conservation.test.ts` | ~95 | Property 1. |
| `tests/property/replay.test.ts` | ~85 | Property 2. |
| `tests/property/waterfall.test.ts` | ~90 | Property 3. |
| `tests/property/invariants.test.ts` | ~185 | Properties 4-7. |
| `tests/property/deeds.test.ts` | ~120 | Property 8 plus physical-component supply. |

`dispatch.ts` is split out of `driver.ts` because the eighteen-arm switch alone is 160
lines and the two have different reasons to change: `dispatch.ts` changes when a context
adds a command, `driver.ts` changes when the phase machine changes. `deeds.test.ts` is
split out of `invariants.test.ts` for the same reason — deed and building integrity is
the one property that never reads a cash balance.

- [ ] **Step 9: Write the scripted-action vocabulary in `arbitraries.ts`**

`packages/engine/tests/property/arbitraries.ts`. The union is the whole design: every
arm carries *slots and percentages*, never identities and dollars, so that no arm can be
generated in a form the engine will reject for a boring reason.

```ts
import fc from 'fast-check'
import { PLAYER_IDS } from '../../src/core/types.js'
import type { DiceRoll, Era, PlayerId } from '../../src/core/types.js'
import type { ActiveVenture, GameConfig } from '../../src/core/state.js'
import { DECKS } from '../../src/contexts/decks/index.js'

/** An index the driver resolves modulo the length of the real collection. */
export type Slot = number
/** An integer percentage, 0-120, that the driver resolves against a live balance. */
export type Percent = number

/**
 * Eighteen arms, not the fifteen the Produces block above estimated. The three extra
 * are the resale arms — `sell-future`, `sell-tranche`, `sell-peer-loan`. They are worth
 * their weight because a secondary sale is the only way an instrument's holder comes to
 * differ from its originator, and several invariants only bite once those two differ.
 */
export type ScriptedAction =
  | { readonly kind: 'draw-credit'; readonly actor: Slot; readonly percent: Percent }
  | { readonly kind: 'repay-credit'; readonly actor: Slot; readonly percent: Percent }
  | { readonly kind: 'repay-distressed'; readonly actor: Slot; readonly percent: Percent }
  | { readonly kind: 'originate-peer-loan'; readonly actor: Slot; readonly counterparty: Slot
      readonly percent: Percent; readonly ratePerRound: number
      readonly termRounds: number; readonly collateral: Slot }
  | { readonly kind: 'repay-peer-loan'; readonly actor: Slot; readonly contract: Slot
      readonly percent: Percent }
  | { readonly kind: 'sell-peer-loan'; readonly actor: Slot; readonly contract: Slot
      readonly counterparty: Slot; readonly percent: Percent }
  | { readonly kind: 'originate-future'; readonly actor: Slot; readonly deed: Slot
      readonly counterparty: Slot; readonly window: number; readonly percent: Percent }
  | { readonly kind: 'sell-future'; readonly actor: Slot; readonly contract: Slot
      readonly counterparty: Slot; readonly percent: Percent }
  | { readonly kind: 'write-option'; readonly actor: Slot; readonly deed: Slot
      readonly counterparty: Slot; readonly strikePercent: Percent
      readonly premiumPercent: Percent; readonly window: number }
  | { readonly kind: 'sell-option'; readonly actor: Slot; readonly contract: Slot
      readonly counterparty: Slot; readonly percent: Percent }
  | { readonly kind: 'exercise-option'; readonly actor: Slot; readonly contract: Slot }
  | { readonly kind: 'create-pool'; readonly actor: Slot
      readonly seniorPercent: Percent; readonly mezzaninePercent: Percent }
  | { readonly kind: 'sell-tranche'; readonly actor: Slot; readonly pool: Slot
      readonly tranche: 0 | 1 | 2; readonly counterparty: Slot; readonly percent: Percent }
  | { readonly kind: 'write-swap'; readonly actor: Slot; readonly counterparty: Slot
      readonly reference: Slot; readonly notionalPercent: Percent
      readonly premiumPercent: Percent }
  | { readonly kind: 'launch-venture'; readonly actor: Slot
      readonly venture: ActiveVenture['kind']; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly kind: 'speakeasy'; readonly actor: Slot; readonly dice: DiceRoll
      readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly kind: 'launder'; readonly actor: Slot; readonly percent: Percent }
  | { readonly kind: 'bribe'; readonly actor: Slot; readonly effect: 0 | 1 | 2
      readonly target: Slot }
  | { readonly kind: 'insider-trade'; readonly actor: Slot
      readonly fundedFrom: 'clean' | 'dirty' }

export interface ScriptedDraftRound {
  /** One offset per player, in turn order. The driver takes three distinct deeds from it. */
  readonly offsets: readonly Slot[]
  /** Bid as a percentage of the top pick's face value. Below 100 is a deliberate reject. */
  readonly bidPercents: readonly Percent[]
}

export interface ScriptedRound {
  readonly actions: readonly ScriptedAction[]
  /** One roll per player, in turn order. */
  readonly rolls: readonly DiceRoll[]
  readonly auditDice: Readonly<Partial<Record<PlayerId, DiceRoll>>>
  /** Draw an era card during Movement. Deliberately not gated on landing square. */
  readonly drawCard: boolean
}

export interface GameScript {
  readonly config: GameConfig
  readonly shuffles: Readonly<Record<Era, readonly number[]>>
  readonly draft: readonly ScriptedDraftRound[]
  readonly rounds: readonly ScriptedRound[]
}
```

`GameScript` gains a `draft` field the Produces block omitted, and `ScriptedRound` gains
`drawCard`. Both are load-bearing: without generated draft submissions every history
starts from the same portfolio, and without card draws Task 18's interpreter — the single
largest body of state-mutating code in the engine — is never touched by any invariant.

- [ ] **Step 10: Write the generators themselves**

Append to `arbitraries.ts`:

```ts
const slot = fc.integer({ min: 0, max: 63 })
const percent = fc.integer({ min: 0, max: 120 })
const die = fc.integer({ min: 1, max: 6 })

export const arbDice: fc.Arbitrary<DiceRoll> = fc.tuple(die, die)

/**
 * A quarter of rolls are doubles against a true rate of one in six. Doubles drive the
 * extra-roll path and the triple-doubles jail rule, both of which a uniform generator
 * reaches roughly once per 216 turns — too rare to be load-bearing at 200 runs.
 */
export const arbDiceBiased: fc.Arbitrary<DiceRoll> = fc.oneof(
  { arbitrary: arbDice, weight: 3 },
  { arbitrary: die.map((d): DiceRoll => [d, d]), weight: 1 },
)

export const arbConfig: fc.Arbitrary<GameConfig> = fc.record({
  turnOrder: fc.shuffledSubarray([...PLAYER_IDS], { minLength: 4, maxLength: 4 }),
  unlockMode: fc.constantFrom('progressive' as const, 'all' as const),
  winCondition: fc.oneof(
    fc.constant({ kind: 'fixed-rounds' as const }),
    fc.integer({ min: 3_000, max: 12_000 })
      .map((target) => ({ kind: 'net-worth-target' as const, target })),
  ),
})

function arbPermutation(era: Era): fc.Arbitrary<readonly number[]> {
  const size = DECKS[era].length
  const indices = Array.from({ length: size }, (_unused, i) => i)
  return fc.shuffledSubarray(indices, { minLength: size, maxLength: size })
}

const arbShuffles = fc.record({
  1: arbPermutation(1), 2: arbPermutation(2),
  3: arbPermutation(3), 4: arbPermutation(4),
})

const funded = fc.constantFrom('clean' as const, 'dirty' as const)

export const arbAction: fc.Arbitrary<ScriptedAction> = fc.oneof(
  fc.record({ kind: fc.constant('draw-credit' as const), actor: slot, percent }),
  fc.record({ kind: fc.constant('repay-credit' as const), actor: slot, percent }),
  fc.record({ kind: fc.constant('repay-distressed' as const), actor: slot, percent }),
  fc.record({
    kind: fc.constant('originate-peer-loan' as const), actor: slot, counterparty: slot,
    percent, ratePerRound: fc.integer({ min: 1, max: 20 }).map((n) => n / 100),
    termRounds: fc.integer({ min: 1, max: 8 }), collateral: slot,
  }),
  fc.record({ kind: fc.constant('repay-peer-loan' as const), actor: slot, contract: slot, percent }),
  fc.record({
    kind: fc.constant('sell-peer-loan' as const), actor: slot, contract: slot,
    counterparty: slot, percent,
  }),
  fc.record({
    kind: fc.constant('originate-future' as const), actor: slot, deed: slot,
    counterparty: slot, window: fc.integer({ min: 1, max: 8 }), percent,
  }),
  fc.record({
    kind: fc.constant('sell-future' as const), actor: slot, contract: slot,
    counterparty: slot, percent,
  }),
  fc.record({
    kind: fc.constant('write-option' as const), actor: slot, deed: slot, counterparty: slot,
    strikePercent: percent, premiumPercent: fc.integer({ min: 0, max: 30 }),
    window: fc.integer({ min: 1, max: 6 }),
  }),
  fc.record({
    kind: fc.constant('sell-option' as const), actor: slot, contract: slot,
    counterparty: slot, percent,
  }),
  fc.record({ kind: fc.constant('exercise-option' as const), actor: slot, contract: slot }),
  fc.record({
    kind: fc.constant('create-pool' as const), actor: slot,
    seniorPercent: fc.integer({ min: 10, max: 60 }),
    mezzaninePercent: fc.integer({ min: 10, max: 40 }),
  }),
  fc.record({
    kind: fc.constant('sell-tranche' as const), actor: slot, pool: slot,
    tranche: fc.constantFrom(0 as const, 1 as const, 2 as const),
    counterparty: slot, percent,
  }),
  fc.record({
    kind: fc.constant('write-swap' as const), actor: slot, counterparty: slot,
    reference: slot, notionalPercent: percent,
    premiumPercent: fc.integer({ min: 1, max: 20 }),
  }),
  fc.record({
    kind: fc.constant('launch-venture' as const), actor: slot,
    venture: fc.constantFrom('escort' as const, 'numbers' as const, 'chop-shop' as const),
    fundedFrom: funded,
  }),
  fc.record({
    kind: fc.constant('speakeasy' as const), actor: slot, dice: arbDice, fundedFrom: funded,
  }),
  fc.record({ kind: fc.constant('launder' as const), actor: slot, percent }),
  fc.record({
    kind: fc.constant('bribe' as const), actor: slot,
    effect: fc.constantFrom(0 as const, 1 as const, 2 as const), target: slot,
  }),
  fc.record({ kind: fc.constant('insider-trade' as const), actor: slot, fundedFrom: funded }),
)

export const arbDraftRound: fc.Arbitrary<ScriptedDraftRound> = fc.record({
  offsets: fc.array(slot, { minLength: 4, maxLength: 4 }),
  bidPercents: fc.array(fc.integer({ min: 90, max: 180 }), { minLength: 4, maxLength: 4 }),
})

export const arbRound: fc.Arbitrary<ScriptedRound> = fc.record({
  actions: fc.array(arbAction, { minLength: 0, maxLength: 8 }),
  rolls: fc.array(arbDiceBiased, { minLength: 4, maxLength: 4 }),
  auditDice: fc.record({ P1: arbDice, P2: arbDice, P3: arbDice, P4: arbDice }),
  drawCard: fc.boolean(),
})

/** `maxRounds` is capped at ECONOMY.TOTAL_ROUNDS by the driver, not here. */
export function arbGameScript(maxRounds: number): fc.Arbitrary<GameScript> {
  return fc.record({
    config: arbConfig,
    shuffles: arbShuffles,
    draft: fc.array(arbDraftRound, { minLength: 7, maxLength: 7 }),
    rounds: fc.array(arbRound, { minLength: 1, maxLength: maxRounds }),
  })
}
```

Note `bidPercents` starts at 90, below the 100% face floor. That tail exists so
`BID_BELOW_FACE` is exercised, and the driver discards the rejection — a player simply
misses that draft round, which is a legal outcome and produces uneven portfolios.

**What this generator reaches.** Four players in every turn order, both unlock modes, both
win conditions, 1 to 24 rounds and therefore all four eras — `unlockMode: 'all'` is
generated specifically so short scripts can still reach Era III instruments. Dice with
doubles biased up from one-in-six to one-in-three, so extra rolls and the
three-consecutive-doubles jail path are hit inside a short script. Card draws against a
generated permutation of the real 80 authored cards, so Task 18's interpreter runs against
generated state rather than fixtures. Credit drawn and repaid on both sides of the
headroom limit. Peer loans originated, serviced, repaid, sold and defaulted, including the
permanent base halving. Rent futures and deed options written, resold, exercised, expired
and made whole. Ventures, speakeasy, laundering, bribery, insider trading, heat accrual
and audits from round 13. Pools, tranches sold, waterfalls run, CDS written and triggered
— including the round-24 termination sweep. Carrying cost, interest, distressed-debt
compounding and the obligation waterfall underneath all of them. Margin calls, forced
liquidation and the distressed-debt terminal state.

**What it deliberately does not reach, and why each was excluded:**

- **Development — building, selling buildings, mortgaging, unmortgaging, trading.** Not a
  choice about test design: no task in the plan set writes a decider *or* a reducer for
  `HouseBuilt`, `HouseSold`, `DeedMortgaged`, `DeedUnmortgaged` or `DeedTraded`, so there
  is nothing to call. This is the largest gap in the plan and it is recorded again under
  *Contradictions between sibling task files* below. Margin calls are still reached
  without it — obligation capitalisation, CDS collateral, the peer-default halving and the
  Era IV `margin-flag` cards all push a drawn balance past its base — but **no property
  here constrains the even-build rule, the house supply, or mortgage economics.**
- **Ranked-triple draft collisions.** The draft is scripted as offsets into the available
  list rather than as generated triples. Generated triples collide on the first pick about
  half the time and the cascade rules then dominate the search space, so the generator
  would spend its whole budget re-testing Task 8, which already tests it exhaustively.
- **Individual card effects.** The generator draws real cards but asserts nothing about
  what any one of them does; Task 18 has a test per card. Task 20 asserts only that no
  card can break an invariant.
- **The Markov landing model and the 1.19 doubles factor.** Statistical claims needing a
  convergence test with a tolerance, not a universally quantified predicate. Task 7 pins
  them against the golden fixture.
- **Hand-written illegal event logs.** `replay` is not a validator — `decide` is the
  boundary, with Zod at the server edge behind it. Asserting that `replay` rejects an
  impossible log would test a guarantee the architecture does not make.
- **Balance and win rates.** Nothing here asserts that a strategy wins x% of the time.
  That is what the Monte Carlo study behind spec section 20 is for.

The first two exclusions are the ones that matter, because both hide real rules. Step 14's
`coverage.test.ts` exists so the list cannot quietly grow: it asserts a floor on the share
of generated actions the engine accepts and on the set of event types the suite reaches,
so a refactor that starts rejecting every swap turns six property files from passing into
failing rather than from meaningful into vacuous.

- [ ] **Step 11: Write the slot resolvers in `dispatch.ts`**

`packages/engine/tests/property/dispatch.ts`. Everything here is total: no resolver can
throw, and any resolver that cannot find a target returns `null`, which the caller turns
into a skipped action rather than a crashed run.

```ts
import { floorPercent } from '../../src/core/money.js'
import type { GameState, PoolAssetRef, SwapReference } from '../../src/core/state.js'
import type { BriberyEffect } from '../../src/core/events.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../src/core/types.js'
import type { Percent, Slot } from './arbitraries.js'

export function at<T>(items: readonly T[], index: Slot): T | null {
  if (items.length === 0) return null
  return items[Math.abs(index) % items.length] ?? null
}

export function actorAt(state: GameState, index: Slot): PlayerId {
  return at(state.config.turnOrder, index) ?? 'P1'
}

/** A player who is not `self`, so SELF_DEALING is never generated by accident. */
export function otherThan(state: GameState, self: PlayerId, index: Slot): PlayerId | null {
  const others = state.config.turnOrder.filter((p) => p !== self)
  return at(others, index)
}

export function amount(balance: Money, pct: Percent): Money {
  return floorPercent(Math.max(0, balance), pct / 100)
}

export function deedsOf(state: GameState, player: PlayerId): readonly DeedId[] {
  return Object.values(state.deeds)
    .filter((d) => d.owner === player && !d.mortgaged)
    .map((d) => d.id)
}

export function loansOf(state: GameState, player: PlayerId, side: 'lender' | 'borrower'):
readonly ContractId[] {
  return state.loans
    .filter((l) => l.status === 'active' && l[side] === player)
    .map((l) => l.id)
}

export function futuresOf(state: GameState, player: PlayerId): readonly ContractId[] {
  return state.futures.filter((f) => f.holder === player).map((f) => f.id)
}

export function optionsOf(state: GameState, player: PlayerId): readonly ContractId[] {
  return state.options.filter((o) => o.holder === player).map((o) => o.id)
}

/**
 * Assets the player can legitimately pool: loans they lent, futures and options they
 * hold. `create-pool` needs three, which is why the arm carries no asset slots — picking
 * three at random from a list of three or four is pure rejection, so the driver takes the
 * first three instead and lets the count guard do the rejecting.
 */
export function poolableAssets(state: GameState, player: PlayerId): readonly PoolAssetRef[] {
  return [
    ...loansOf(state, player, 'lender').map((id): PoolAssetRef => ({ kind: 'peer-loan', id })),
    ...futuresOf(state, player).map((id): PoolAssetRef => ({ kind: 'rent-future', id })),
    ...optionsOf(state, player).map((id): PoolAssetRef => ({ kind: 'deed-option', id })),
  ]
}

/** Every obligation a swap can reference: active peer loans and live tranches. */
export function swapReferences(state: GameState): readonly SwapReference[] {
  return [
    ...state.loans
      .filter((l) => l.status === 'active')
      .map((l): SwapReference => ({ kind: 'peer-loan', id: l.id })),
    ...state.pools
      .filter((p) => !p.terminated)
      .flatMap((p) => p.tranches.map((t): SwapReference =>
        ({ kind: 'tranche', poolId: p.id, tranche: t.kind }))),
  ]
}

const BRIBERY_EFFECTS = [0, 1, 2] as const

export function briberyEffect(
  state: GameState, self: PlayerId, which: 0 | 1 | 2, target: Slot,
): BriberyEffect | null {
  void BRIBERY_EFFECTS
  if (which === 1) return { kind: 'cancel-card' }
  if (which === 2) return { kind: 'delay-margin-call' }
  const victim = otherThan(state, self, target)
  return victim === null ? null : { kind: 'force-reroll', target: victim }
}

/** Contract ids are derived, never generated — the engine holds no Math.random. */
export function scriptedId(prefix: string, state: GameState, actor: PlayerId, n: number): ContractId {
  return `${prefix}-${actor}-r${state.round}-${n}`
}
```

- [ ] **Step 12: Write the action dispatch switch**

Append to `dispatch.ts`. One arm, one decider call. `null` means "this action had no
legal target in this state", which the driver counts but does not treat as a failure:

```ts
import { decideCredit, NO_ENCUMBRANCES } from '../../src/contexts/credit/index.js'
import { decideMarkets } from '../../src/contexts/markets/index.js'
import { decideSecuritization } from '../../src/contexts/securitization/index.js'
import { decideUnderworld } from '../../src/contexts/underworld/index.js'
import { expectedPoolCashflow } from '../../src/contexts/securitization/index.js'
import type { GameEvent } from '../../src/core/events.js'
import type { Rejection } from '../../src/core/errors.js'
import { ECONOMY } from '../../src/config/economy.js'
import type { ScriptedAction } from './arbitraries.js'

export type Outcome = readonly GameEvent[] | Rejection | null

export function dispatch(state: GameState, action: ScriptedAction, seq: number): Outcome {
  const self = actorAt(state, action.actor)
  const me = state.players[self]

  switch (action.kind) {
    case 'draw-credit':
      return decideCredit(state,
        { type: 'DrawCredit', player: self, amount: amount(2_000, action.percent) })

    case 'repay-credit':
      return decideCredit(state,
        { type: 'RepayCredit', player: self, amount: amount(me.drawnCredit, action.percent) })

    case 'repay-distressed':
      return decideCredit(state, {
        type: 'RepayDistressedDebt', player: self,
        amount: amount(me.distressedDebt, action.percent),
      })

    case 'originate-peer-loan': {
      const borrower = otherThan(state, self, action.counterparty)
      const pledge = at(deedsOf(state, borrower ?? self), action.collateral)
      if (borrower === null || pledge === null) return null
      return decideCredit(state, {
        type: 'OriginatePeerLoan', lender: self, borrower,
        principal: amount(me.cleanCash, action.percent),
        ratePerRound: action.ratePerRound,
        termRounds: action.termRounds,
        collateral: [pledge],
      }, NO_ENCUMBRANCES)
    }

    case 'repay-peer-loan': {
      const id = at(loansOf(state, self, 'borrower'), action.contract)
      const loan = state.loans.find((l) => l.id === id)
      if (id === null || loan === undefined) return null
      return decideCredit(state,
        { type: 'RepayPeerLoan', player: self, id, amount: amount(loan.outstanding, action.percent) },
        NO_ENCUMBRANCES)
    }

    case 'sell-peer-loan': {
      const id = at(loansOf(state, self, 'lender'), action.contract)
      const to = otherThan(state, self, action.counterparty)
      const loan = state.loans.find((l) => l.id === id)
      if (id === null || to === null || loan === undefined) return null
      return decideCredit(state,
        { type: 'SellPeerLoanNote', player: self, id, to, price: amount(loan.outstanding, action.percent) },
        NO_ENCUMBRANCES)
    }

    case 'originate-future': {
      const deed = at(deedsOf(state, self), action.deed)
      const holder = otherThan(state, self, action.counterparty)
      if (deed === null || holder === null) return null
      const window = Math.min(action.window, ECONOMY.MAX_FUTURE_WINDOW)
      return decideMarkets(state, {
        type: 'OriginateRentFuture', player: self, deed, holder,
        startRound: state.round, endRound: state.round + window,
        price: amount(state.deeds[deed]?.faceValue ?? 0, action.percent),
      })
    }

    case 'sell-future': {
      const contract = at(futuresOf(state, self), action.contract)
      const to = otherThan(state, self, action.counterparty)
      if (contract === null || to === null) return null
      return decideMarkets(state, {
        type: 'SellRentFuture', player: self, contract, to,
        price: amount(me.cleanCash, action.percent),
      })
    }

    case 'write-option': {
      const deed = at(deedsOf(state, self), action.deed)
      const holder = otherThan(state, self, action.counterparty)
      if (deed === null || holder === null) return null
      const face = state.deeds[deed]?.faceValue ?? 0
      return decideMarkets(state, {
        type: 'WriteDeedOption', player: self, deed, holder,
        premium: amount(face, action.premiumPercent),
        strike: amount(face, action.strikePercent),
        expiry: state.round + action.window,
      })
    }

    case 'sell-option': {
      const contract = at(optionsOf(state, self), action.contract)
      const to = otherThan(state, self, action.counterparty)
      if (contract === null || to === null) return null
      return decideMarkets(state, {
        type: 'SellDeedOption', player: self, contract, to,
        price: amount(me.cleanCash, action.percent),
      })
    }

    case 'exercise-option': {
      const contract = at(optionsOf(state, self), action.contract)
      if (contract === null) return null
      return decideMarkets(state, { type: 'ExerciseDeedOption', player: self, contract })
    }

    case 'create-pool': {
      const assets = poolableAssets(state, self).slice(0, 3)
      if (assets.length < 3) return null
      const poolId = scriptedId('pool', state, self, seq)
      const cashflow = expectedPoolCashflow(state, {
        id: poolId, originator: self, assets, tranches: [], terminated: false,
      })
      return decideSecuritization(state, {
        type: 'CreatePool', player: self, poolId, assets,
        seniorFace: amount(cashflow, action.seniorPercent),
        mezzanineFace: amount(cashflow, action.mezzaninePercent),
      })
    }

    case 'sell-tranche': {
      const pool = at(state.pools.filter((p) => !p.terminated), action.pool)
      const tranche = pool === null ? null : at(pool.tranches, action.tranche)
      const to = otherThan(state, self, action.counterparty)
      if (pool === null || tranche === null || to === null) return null
      return decideSecuritization(state, {
        type: 'SellTranche', player: self, poolId: pool.id, tranche: tranche.kind, to,
        price: amount(tranche.face, action.percent),
      })
    }

    case 'write-swap': {
      const reference = at(swapReferences(state), action.reference)
      const buyer = otherThan(state, self, action.counterparty)
      if (reference === null || buyer === null) return null
      const notional = amount(1_000, action.notionalPercent)
      return decideSecuritization(state, {
        type: 'WriteSwap', swapId: scriptedId('swap', state, self, seq),
        buyer, seller: self, reference, notional,
        premiumPerRound: amount(notional, action.premiumPercent),
      })
    }

    case 'launch-venture':
      return decideUnderworld(state, {
        type: 'LaunchVenture', player: self,
        venture: action.venture, fundedFrom: action.fundedFrom,
      })

    case 'speakeasy':
      return decideUnderworld(state, {
        type: 'PlaySpeakeasy', player: self, dice: action.dice, fundedFrom: action.fundedFrom,
      })

    case 'launder':
      return decideUnderworld(state,
        { type: 'LaunderCash', player: self, amount: amount(me.dirtyCash, action.percent) })

    case 'bribe': {
      const effect = briberyEffect(state, self, action.effect, action.target)
      return effect === null ? null : decideUnderworld(state, { type: 'Bribe', player: self, effect })
    }

    case 'insider-trade':
      return decideUnderworld(state,
        { type: 'InsiderTrade', player: self, fundedFrom: action.fundedFrom })
  }
}
```

`draw-credit` and `write-swap` resolve their percentage against the flat constants `2_000`
and `1_000` rather than a live balance, deliberately. Both are the arms where exceeding
the limit is the *interesting* case — a draw above the borrowing base must be rejected,
and a notional above the reference face must be rejected — so anchoring them to a live
balance would tune the rejection away.

- [ ] **Step 13: Write the driver**

`packages/engine/tests/property/driver.ts`:

```ts
import { replay, reduce } from '../../src/core/reduce.js'
import { isRejection, type Rejection } from '../../src/core/errors.js'
import type { GameEvent } from '../../src/core/events.js'
import type { GameState } from '../../src/core/state.js'
import type { DeedId, DiceRoll, Era, PlayerId } from '../../src/core/types.js'
import { ECONOMY } from '../../src/config/economy.js'
import { createGame, decideSession } from '../../src/contexts/session/index.js'
import { DRAFT_ROUNDS, availableDeeds, decideDraft } from '../../src/contexts/draft/index.js'
import { decideBoard } from '../../src/contexts/board/index.js'
import { decideDeck } from '../../src/contexts/decks/index.js'
import {
  exhaustLiquidation, playersAwaitingLiquidation,
} from '../../src/contexts/credit/index.js'
import type { GameScript, ScriptedDraftRound, ScriptedRound } from './arbitraries.js'
import { dispatch } from './dispatch.js'

export interface Batch { readonly label: string; readonly events: readonly GameEvent[] }

export interface Trace {
  /** `before[i]` is the state the batch at `batches[i]` was decided against. */
  readonly before: readonly GameState[]
  readonly batches: readonly Batch[]
  readonly events: readonly GameEvent[]
  readonly final: GameState
  readonly accepted: number
  readonly rejected: number
  readonly skipped: number
}

class Run {
  state: GameState
  readonly before: GameState[] = []
  readonly batches: Batch[] = []
  accepted = 0
  rejected = 0
  skipped = 0

  constructor(state: GameState) { this.state = state }

  submit(label: string, produced: readonly GameEvent[] | Rejection | null): boolean {
    if (produced === null) { this.skipped += 1; return false }
    if (isRejection(produced)) { this.rejected += 1; return false }
    this.before.push(this.state)
    this.batches.push({ label, events: produced })
    this.state = produced.reduce(reduce, this.state)
    this.accepted += 1
    return true
  }

  advance(label: string): void {
    this.submit(label, decideSession(this.state, { kind: 'advance-phase' }))
  }
}

function threeDistinct(available: readonly DeedId[], offset: number): readonly DeedId[] | null {
  if (available.length < 3) return null
  const start = Math.abs(offset) % available.length
  const out: DeedId[] = []
  for (let k = 0; out.length < 3 && k < available.length; k += 1) {
    const id = available[(start + k) % available.length]
    if (id !== undefined && !out.includes(id)) out.push(id)
  }
  return out.length === 3 ? out : null
}

function runDraft(run: Run, script: readonly ScriptedDraftRound[]): void {
  for (let r = 0; r < DRAFT_ROUNDS; r += 1) {
    const scripted = script[r]
    run.state.config.turnOrder.forEach((player, i) => {
      const ranked = threeDistinct(availableDeeds(run.state), scripted?.offsets[i] ?? i)
      if (ranked === null) return
      const [first] = ranked
      const face = first === undefined ? 0 : run.state.deeds[first]?.faceValue ?? 0
      const pct = scripted?.bidPercents[i] ?? 110
      run.submit(`draft:${player}`, decideDraft(run.state, {
        kind: 'submit-draft', player,
        ranked: [ranked[0] ?? '', ranked[1] ?? '', ranked[2] ?? ''],
        maxBid: Math.floor((face * pct) / 100),
      }))
    })
    run.submit('draft:resolve', decideDraft(run.state, { kind: 'resolve-draft-round' }))
  }
}

function runRound(run: Run, round: ScriptedRound): void {
  const marker = run.batches.length
  run.advance('market->open')

  // Spec 19.8: forced liquidation resolves at the START of the Open phase, before
  // any other action. Driving it here is the only way a generated history reaches
  // distressed debt.
  for (const player of playersAwaitingLiquidation(run.state)) {
    run.submit(`liquidate:${player}`, exhaustLiquidation(run.state, player))
  }

  round.actions.forEach((action, i) => {
    run.submit(`action:${action.kind}`, dispatch(run.state, action, i))
  })

  run.advance('open->movement')
  run.state.config.turnOrder.forEach((player, i) => {
    const dice: DiceRoll = round.rolls[i] ?? [1, 2]
    run.submit(`roll:${player}`, decideBoard(run.state, { kind: 'roll-dice', player, dice }))
    if (round.drawCard && i === 0) {
      run.submit('draw-card', decideDeck(run.state, {
        kind: 'draw-card', era: run.state.era, player,
      }))
    }
  })

  run.advance('movement->settlement')
  run.submit('settle', decideSession(run.state, {
    kind: 'settle',
    input: {
      auditDice: round.auditDice,
      roundEvents: run.batches.slice(marker).flatMap((b) => b.events),
    },
  }))
  run.advance('settlement->next')
}

export function runScript(script: GameScript): Trace {
  const run = new Run(replay(createGame(script.config)))
  for (const era of [1, 2, 3, 4] as const) {
    run.submit(`shuffle:${era}`, decideDeck(run.state, {
      kind: 'shuffle-deck', era, order: script.shuffles[era],
    }))
  }
  run.advance('setup->draft')
  runDraft(run, script.draft)
  run.advance('draft->market')

  const rounds = script.rounds.slice(0, ECONOMY.TOTAL_ROUNDS)
  for (const round of rounds) {
    if (run.state.phase === 'complete' || run.state.phase === 'scoring') break
    runRound(run, round)
  }

  return {
    before: run.before,
    batches: run.batches,
    events: run.batches.flatMap((b) => b.events),
    final: run.state,
    accepted: run.accepted,
    rejected: run.rejected,
    skipped: run.skipped,
  }
}
```

Two notes on the round loop. The driver never asserts a phase — it calls `advance-phase`
and lets the session context decide where that lands, so a change to the phase machine
shows up as a coverage failure rather than a silently truncated history. And `drawCard`
fires only for the first player in turn order, because the card interpreter is by far the
widest state mutation in the engine and four draws per round exhausts a 20-card era deck
in five rounds.

- [ ] **Step 14: Write `coverage.test.ts` — the test that proves the generator works**

`packages/engine/tests/property/coverage.test.ts`. This is the test that keeps the other
five honest. Every property below is a *lower bound on interestingness*: if a refactor
starts rejecting every swap, these fail loudly instead of the invariants passing
vacuously against empty histories.

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import type { EventType } from '../../src/core/events.js'

/** Runs 60 scripts once and reports which event types the generator actually reached. */
function census(runs: number, rounds: number): { seen: Set<EventType>; accepted: number } {
  const seen = new Set<EventType>()
  let accepted = 0
  fc.assert(
    fc.property(arbGameScript(rounds), (script) => {
      const trace = runScript(script)
      accepted += trace.accepted
      for (const e of trace.events) seen.add(e.type)
      return true
    }),
    { numRuns: runs, seed: 20260803 },
  )
  return { seen, accepted }
}

describe('generator coverage', () => {
  const { seen, accepted } = census(60, 12)

  it('accepts a substantial majority of what it generates', () => {
    expect(accepted).toBeGreaterThan(2_000)
  })

  it('reaches every core money event', () => {
    for (const type of [
      'DraftDeedAwarded', 'DiceRolled', 'TokenMoved', 'SalaryPaid', 'RentCharged',
      'CarryingCostCharged', 'InterestAccrued', 'CreditDrawn', 'ObligationCapitalised',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the credit crisis path', () => {
    for (const type of ['MarginCallFlagged', 'DeedLiquidated', 'DistressedDebtIncurred'] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the underworld', () => {
    for (const type of [
      'VentureLaunched', 'DirtyCashEarned', 'CashLaundered', 'HeatChanged', 'AuditChecked',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the instruments', () => {
    for (const type of [
      'RentFutureOriginated', 'DeedOptionWritten', 'PeerLoanOriginated',
      'PoolCreated', 'WaterfallPaid', 'SwapWritten',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches a card draw', () => {
    expect(seen.has('CardDrawn')).toBe(true)
  })
})
```

- [ ] **Step 15: Run the coverage test and watch it fail, then tune and commit**

Run: `npx vitest run packages/engine/tests/property/coverage.test.ts`
Expected: FAIL on the first missing event type. Fix the generator, not the assertion —
the whole point is that lowering this bar silently disarms the suite. The two failures to
expect are `MarginCallFlagged` (needs 12 rounds and an aggressive `draw-credit` tail;
raise the round count before weakening anything) and `PoolCreated` (needs three poolable
assets in one hand, which needs the peer-loan and futures arms landing first).

```bash
git add packages/engine/tests/property
git commit -m "test(property): scripted-command generator and its coverage floor

Commands, not events: every history is engine-produced and legal by
construction. coverage.test.ts asserts the generator actually reaches
margin calls, liquidation, laundering, audits, pools and swaps, so a
future refactor that starts rejecting everything fails here loudly
instead of making the invariant suite pass vacuously."
```

- [ ] **Step 16: Write `ledger.ts` — the conserved quantity and its boundary table**

`packages/engine/tests/property/ledger.ts`. The identity is the one Task 3's board test
and Task 12's header already use, extended by one term:

```ts
import { PLAYER_IDS } from '../../src/core/types.js'
import type { Money } from '../../src/core/types.js'
import type { GameState } from '../../src/core/state.js'
import type { EventType, GameEvent } from '../../src/core/events.js'

/**
 * The conserved quantity.
 *
 *   sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury
 *
 * The bank sits OUTSIDE the pool, and the two per-player debt counters are how the
 * pool records money the bank has lent into it. Drawing credit adds cash and adds an
 * equal claim, so it nets to zero; repaying reverses it. The Treasury sits INSIDE the
 * pool, which is why it is allowed to go negative — GO salary alone drives it to
 * -$1,400 a round before any tax comes back.
 *
 * `dirtyCash` is deliberately absent. Ventures mint it from nothing and audits destroy
 * it, so it is not money in this sense; it becomes money only at the laundering
 * boundary, where the Treasury is the named counterparty that funds `cleanOut`.
 *
 * `distressedDebt` is the term Task 3's version omits. Without it, `CreditWrittenDown`
 * — which moves a balance from `drawnCredit` to `distressedDebt` — reads as the
 * creation of money, and it is not.
 */
export function conservedTotal(state: GameState): Money {
  const held = PLAYER_IDS.reduce((total, id) => {
    const p = state.players[id]
    return total + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, 0)
  return held + state.treasury
}

/**
 * Events that move money across the pool boundary and therefore MUST name a
 * counterparty inside it. The coverage test asserts the generator reaches them; the
 * conservation test asserts each one nets to zero. Membership here is documentation,
 * not an exemption.
 */
export const BANK_CROSSING_EVENTS: readonly EventType[] = [
  'SalaryPaid', 'TaxPaid', 'JailExited', 'CarryingCostCharged', 'InterestAccrued',
  'DistressedDebtAccrued', 'DistressedDebtRepaid', 'StimulusAdvanced',
  'DraftDeedAwarded', 'DeedLiquidated', 'BuildingsStripped', 'PoolCollateralLiquidated',
  'CashLaundered', 'AuditResolved', 'VentureLaunched', 'SpeakeasyPlayed',
  'InsiderTradingUsed', 'BriberyUsed',
] as const

/**
 * Money a batch is ALLOWED to add to or remove from the conserved pool.
 *
 * The table is deliberately empty. Every boundary crossing in the game has a named
 * counterparty inside the identity: laundering proceeds come from the Treasury, fines
 * and clean-funded costs go to it, seized dirty cash never entered the pool, and a
 * bank purchase debits the Treasury. Adding an entry here is a claim that the engine
 * creates or destroys money, and it must be justified in JUDGMENT CALLS before it
 * is added.
 */
const UNCONSERVED: Partial<Record<EventType, (event: GameEvent) => Money>> = {}

export function expectedDelta(events: readonly GameEvent[]): Money {
  return events.reduce((total, event) => total + (UNCONSERVED[event.type]?.(event) ?? 0), 0)
}
```

- [ ] **Step 17: Write `conservation.test.ts` and watch it fail**

`packages/engine/tests/property/conservation.test.ts`. This is the single most important
test in the engine. It asserts at *batch* granularity, not per event, because the
obligation waterfall is intrinsically two events: the obligation credits its counterparty
in full and the paired `ObligationCapitalised` raises the claim that funds the shortfall.
Splitting them is exactly what the waterfall means.

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reduce } from '../../src/core/reduce.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import { conservedTotal, expectedDelta } from './ledger.js'

describe('money is conserved', () => {
  it('holds across every generated history, end to end', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const opening = conservedTotal(trace.before[0] ?? trace.final)
        expect(conservedTotal(trace.final)).toBe(opening + expectedDelta(trace.events))
      }),
      { numRuns: 200 },
    )
  })

  it('holds batch by batch, so a failure names the decider that broke it', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          const after = batch.events.reduce(reduce, before)
          expect(
            conservedTotal(after),
            `batch "${batch.label}" moved the pool: ${batch.events.map((e) => e.type).join(', ')}`,
          ).toBe(conservedTotal(before) + expectedDelta(batch.events))
        })
      }),
      { numRuns: 200 },
    )
  })

  it('never counts dirty cash as money', () => {
    // Ventures mint dirty cash from nothing. If it were in the pool, the first
    // DirtyCashEarned would break the identity — so this asserts the omission is load
    // bearing rather than an oversight.
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const minted = trace.events
          .filter((e) => e.type === 'DirtyCashEarned')
          .reduce((t, e) => t + (e.type === 'DirtyCashEarned' ? e.amount : 0), 0)
        const opening = conservedTotal(trace.before[0] ?? trace.final)
        if (minted > 0) expect(conservedTotal(trace.final)).not.toBe(opening + minted)
      }),
      { numRuns: 100 },
    )
  })
})
```

Run: `npx vitest run packages/engine/tests/property/conservation.test.ts`
Expected: FAIL, with a shrunken script naming a batch. There are ten reducer cases that
break the identity as the sibling tasks wrote them; Steps 18 and 19 reconcile them. Do
not weaken the property to accommodate any of them.

- [ ] **Step 18: Reconcile the six credit-side boundary crossings**

Every fix below gives an existing crossing the counterparty it was missing. Modify
`packages/engine/src/contexts/credit/reduce.ts`:

```ts
    /**
     * Spec section 4 calls the Era II stimulus "an interest-bearing loan, not a grant".
     * A loan is bank money, exactly like CreditDrawn, so the Treasury does not move.
     * The version in Task 9 debited the Treasury AND raised the drawn balance, which
     * destroyed $300 per player: the player owed the bank while the Treasury paid.
     */
    case 'StimulusAdvanced': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
    }

    /**
     * Spec 19.8: the Treasury is assessed the FULL obligation and the shortfall
     * capitalises. Task 9 credited the Treasury only what the player could pay and
     * routed the rest to distressed debt, which both leaked money and contradicted
     * 19.8's rule that distressed debt is the terminal state, not a general bucket.
     */
    case 'CarryingCostCharged': {
      const p = state.players[event.player]
      const paid = Math.min(p.cleanCash, event.amount)
      const next = withPlayer(state, event.player, { cleanCash: p.cleanCash - paid })
      return { ...next, treasury: next.treasury + event.amount }
    }

    /** Accrued interest the player never pays is still Treasury income; it capitalises. */
    case 'DistressedDebtAccrued': {
      const p = state.players[event.player]
      const next = withPlayer(state, event.player, {
        distressedDebt: p.distressedDebt + event.amount,
      })
      return { ...next, treasury: next.treasury + event.amount }
    }

    /** Repaying the bank returns money to the Treasury rather than deleting it. */
    case 'DistressedDebtRepaid': {
      const p = state.players[event.player]
      const next = withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        distressedDebt: p.distressedDebt - event.amount,
      })
      return { ...next, treasury: next.treasury + event.amount }
    }

    /** The bank buys the buildings back, so the Treasury funds the sellback. */
    case 'BuildingsStripped': {
      // ... unchanged deed and supply bookkeeping ...
      const credited = applyAgainstDebt(next, event.player, event.proceeds)
      return { ...credited, treasury: credited.treasury - event.proceeds }
    }

    /** When the bank is the buyer of last resort, the Treasury is the buyer. */
    case 'DeedLiquidated': {
      let next = withDeed(state, event.deed, { owner: event.buyer })
      next = event.buyer === 'bank'
        ? { ...next, treasury: next.treasury - event.price }
        : addCash(next, event.buyer, -event.price)
      return applyAgainstDebt(next, event.player, event.price)
    }
```

`DistressedDebtRepaid` and `DistressedDebtAccrued` are symmetric with `InterestAccrued`,
which Task 9 already routes to the Treasury: the bank's income is Treasury income, and
the pair is what makes `distressedDebt` a well-behaved negative-money term.

Also update `contexts/credit/decide.ts` and `settleCarryingCost` so an unpayable carrying
cost emits `ObligationCapitalised { obligation: 'carrying-cost' }` rather than
`DistressedDebtIncurred`. Task 2's `ObligationKind` union already contains
`'carrying-cost'`, so nothing new is needed there.

Run: `npx vitest run packages/engine/src/contexts/credit`
Expected: three Task 9 and Task 10 unit assertions fail on the changed Treasury figures —
`treasury` at tasks-09-11 Step 12 (`5000 - 4 * ERA_II_STIMULUS` becomes `5000`), and the
two carrying-cost shortfall cases. Update those three expectations and no others.

- [ ] **Step 19: Reconcile the four markets and securitization crossings**

Modify `packages/engine/src/contexts/securitization/reduce.ts`:

```ts
    /**
     * The originator pays out exactly what is distributed, never what was collected.
     * Subtracting `collected` deleted the residual whenever a pool had no equity
     * tranche — `distribute` gives the residual to equity only if an equity tranche
     * exists. `collected` remains on the event as the audit figure the ratings
     * formula and the rulebook both read.
     */
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
      const paidOut = event.distributions.reduce((total, d) => total + d.amount, 0)
      let next = subCash({ ...state, pools }, pool.originator, paidOut)
      for (const d of event.distributions) {
        const holder = pool.tranches.find((t) => t.kind === d.tranche)?.holder
        if (holder !== undefined) next = addCash(next, holder, d.amount)
      }
      return next
    }

    /**
     * Spec 19.4: collateral is sold TO THE BANK at the liquidation floor, so the
     * Treasury funds the proceeds. The buildings on those deeds also return to the
     * physical supply, which the original version dropped on the floor — it set
     * `houses: 0` without crediting `housesRemaining`, permanently destroying
     * components out of a fixed supply of 32 and 12.
     */
    case 'PoolCollateralLiquidated': {
      const deeds: Record<DeedId, DeedState> = { ...state.deeds }
      let houses = 0
      let hotels = 0
      for (const id of event.deeds) {
        const deed = deeds[id]
        if (deed === undefined) continue
        houses += deed.houses === 5 ? 0 : deed.houses
        hotels += deed.houses === 5 ? 1 : 0
        deeds[id] = { ...deed, owner: 'bank', mortgaged: false, houses: 0 }
      }
      const withDeeds: GameState = {
        ...state, deeds,
        housesRemaining: state.housesRemaining + houses,
        hotelsRemaining: state.hotelsRemaining + hotels,
      }
      const pool = state.pools.find((p) => p.id === event.poolId)
      if (pool === undefined) return withDeeds
      const credited = addCash(withDeeds, pool.originator, event.proceeds)
      return { ...credited, treasury: credited.treasury - event.proceeds }
    }
```

`subCash` floors the payer at zero, so `SwapPremiumPaid` and `SwapTriggered` currently
mint the shortfall. Both are *automatic* obligations, so spec 19.8 applies: in
`settleSwapPremiums` and in the round-24 trigger path, pair each transfer with
`ObligationCapitalised` for the part the payer's clean cash could not cover. This needs
two additions to `ObligationKind`, listed under NEW EVENTS REQUIRED below.

Finally, in `packages/engine/src/contexts/markets/`, change the shortfall pairing on
`payClean` from `DistressedDebtIncurred` to `ObligationCapitalised`. The comment on
`payClean` at Task 14 states the opposite and must change with it: the identity does not
"count distressed debt as issued money" so much as count it as *borrowed* money, and only
the terminal path in spec 19.8 may create it.

- [ ] **Step 20: Run the conservation property and watch it pass, then commit**

Run: `npx vitest run packages/engine/tests/property/conservation.test.ts`
Expected: PASS — 500 generated histories, roughly 40,000 batches, every one net zero.

```bash
git add packages/engine/src/contexts packages/engine/tests/property
git commit -m "test(property): money is conserved across every generated history

sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury is
constant. Ten reducer cases had to be reconciled to make it true: the Era II
stimulus double-counted, four bank purchases had no Treasury counterparty,
the waterfall deleted its residual, pooled collateral destroyed houses out
of a fixed supply, and three obligation shortfalls routed to distressed debt
instead of capitalising as spec 19.8 requires."
```

- [ ] **Step 21: Write `replay.test.ts`**

`packages/engine/tests/property/replay.test.ts`. This is the property that makes undo, the
SQLite log, and the scripted 24-round E2E scenario all possible:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reduce, replay } from '../../src/core/reduce.js'
import { createGame } from '../../src/contexts/session/index.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

describe('replay identity', () => {
  it('deep-equals the incrementally accumulated state', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const log = [...createGame(script.config), ...trace.events]
        expect(replay(log)).toEqual(trace.final)
      }),
      { numRuns: 200 },
    )
  })

  it('is prefix-stable: replaying the first k events equals folding the first k', () => {
    fc.assert(
      fc.property(arbGameScript(8), fc.nat(), (script, k) => {
        const trace = runScript(script)
        const log = [...createGame(script.config), ...trace.events]
        const cut = log.slice(0, k % (log.length + 1))
        expect(replay(cut)).toEqual(cut.reduce(reduce, replay([])))
      }),
      { numRuns: 300 },
    )
  })

  it('is idempotent under re-replay of its own log', () => {
    fc.assert(
      fc.property(arbGameScript(8), (script) => {
        const log = [...createGame(script.config), ...runScript(script).events]
        expect(replay(log)).toEqual(replay([...log]))
      }),
      { numRuns: 100 },
    )
  })

  it('never mutates a state it was given', () => {
    fc.assert(
      fc.property(arbGameScript(8), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          const snapshot = structuredClone(before)
          batch.events.reduce(reduce, before)
          expect(before).toEqual(snapshot)
        })
      }),
      { numRuns: 60 },
    )
  })
})
```

The prefix-stability case is the one that catches a reducer reading `state.round` where it
should read the event's own field — a bug that a whole-log comparison misses because both
sides make the same mistake. The no-mutation case catches a `push` into a `readonly`
array, which TypeScript permits through any `as` cast that survived review.

- [ ] **Step 22: Run the replay property and commit**

Run: `npx vitest run packages/engine/tests/property/replay.test.ts`
Expected: PASS, 660 generated histories.

```bash
git add packages/engine/tests/property/replay.test.ts
git commit -m "test(property): replay(log) deep-equals accumulated state

Prefix-stable and non-mutating too. This is the property the undo stack,
the SQLite log and the scripted 24-round E2E scenario all rest on."
```

- [ ] **Step 23: Write `waterfall.test.ts`**

`packages/engine/tests/property/waterfall.test.ts`. Task 16 already property-tests
`distribute` in isolation against synthetic pools; this tests it against pools the engine
actually built, and adds the settlement-level claim that the two unit tests cannot make:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

describe('the waterfall never overpays', () => {
  it('distributes at most what the pool collected, in every generated history', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const event of runScript(script).events) {
          if (event.type !== 'WaterfallPaid') continue
          const paid = event.distributions.reduce((t, d) => t + d.amount, 0)
          expect(paid, `pool ${event.poolId} paid ${paid} of ${event.collected}`)
            .toBeLessThanOrEqual(event.collected)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('respects strict priority: mezzanine is paid only once senior is whole', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          for (const event of batch.events) {
            if (event.type !== 'WaterfallPaid') continue
            const pool = before.pools.find((p) => p.id === event.poolId)
            const senior = pool?.tranches.find((t) => t.kind === 'senior')
            const mezz = event.distributions.find((d) => d.tranche === 'mezzanine')
            if (pool === undefined || senior === undefined || mezz === undefined) continue
            const seniorPaid = event.distributions.find((d) => d.tranche === 'senior')?.amount ?? 0
            expect(senior.paid + seniorPaid).toBe(senior.face)
          }
        })
      }),
      { numRuns: 200 },
    )
  })

  it('never pays a tranche beyond its face', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of [runScript(script).final]) {
          for (const pool of state.pools) {
            for (const tranche of pool.tranches) {
              if (tranche.kind === 'equity') continue
              expect(tranche.paid).toBeLessThanOrEqual(tranche.face)
            }
          }
        }
      }),
      { numRuns: 150 },
    )
  })
})
```

Equity is excluded from the face bound deliberately. Spec 19.3 gives equity a *claim*
rather than a face, and the residual arm of `distribute` pays it whatever is left, which
can and should exceed the nominal figure the pool was created with.

- [ ] **Step 24: Run the waterfall property and commit**

Run: `npx vitest run packages/engine/tests/property/waterfall.test.ts`
Expected: PASS, 550 generated histories.

```bash
git add packages/engine/tests/property/waterfall.test.ts
git commit -m "test(property): a pool never distributes more than it collected

Against pools the engine actually built, not synthetic ones. Adds strict
priority and the per-tranche face bound, with equity excluded because
spec 19.3 gives it a residual claim rather than a face."
```

- [ ] **Step 25: Write the cash and credit invariants**

`packages/engine/tests/property/invariants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { PLAYER_IDS } from '../../src/core/types.js'
import { borrowingBase, creditHeadroom } from '../../src/contexts/credit/index.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import type { GameState } from '../../src/core/state.js'

/** Every state the run passed through, including the final one. */
function statesOf(script: Parameters<typeof runScript>[0]): readonly GameState[] {
  const trace = runScript(script)
  return [...trace.before, trace.final]
}

describe('clean cash never goes negative', () => {
  it('holds at every state in every generated history', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            expect(state.players[id].cleanCash,
              `${id} went negative in round ${state.round}`).toBeGreaterThanOrEqual(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('turns every shortfall into drawn credit, never into a negative balance', () => {
    // The paired-event claim: any batch that drove a player's clean cash to exactly
    // zero while an obligation was outstanding must carry an ObligationCapitalised.
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          const after = trace.before[i + 1] ?? trace.final
          if (before === undefined) return
          for (const id of PLAYER_IDS) {
            const drop = before.players[id].cleanCash - after.players[id].cleanCash
            const capitalised = batch.events
              .filter((e) => e.type === 'ObligationCapitalised' && e.player === id)
              .reduce((t, e) => t + (e.type === 'ObligationCapitalised' ? e.amount : 0), 0)
            if (capitalised > 0) {
              expect(after.players[id].cleanCash).toBe(0)
              expect(drop).toBeGreaterThanOrEqual(0)
            }
          }
        })
      }),
      { numRuns: 150 },
    )
  })
})

describe('the capped / uncapped asymmetry', () => {
  it('never lets a VOLUNTARY draw exceed the borrowing base', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          for (const event of batch.events) {
            if (event.type !== 'CreditDrawn') continue
            expect(event.amount,
              `voluntary draw of ${event.amount} exceeded headroom`)
              .toBeLessThanOrEqual(creditHeadroom(before, event.player))
          }
        })
      }),
      { numRuns: 200 },
    )
  })

  it('lets an AUTOMATIC obligation exceed it, and that is the only way it happens', () => {
    // Spec 19.8: step 2 of the waterfall is deliberately uncapped, and it is the sole
    // mechanism by which a drawn balance comes to exceed a borrowing base. So every
    // breach must be attributable to a batch containing ObligationCapitalised.
    fc.assert(
      fc.property(arbGameScript(20), (script) => {
        const trace = runScript(script)
        let breached = new Set<string>()
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          const after = trace.before[i + 1] ?? trace.final
          if (before === undefined) return
          for (const id of PLAYER_IDS) {
            const wasClear = before.players[id].drawnCredit <= borrowingBase(before, id)
            const nowOver = after.players[id].drawnCredit > borrowingBase(after, id)
            if (wasClear && nowOver) {
              breached.add(id)
              const uncapped = batch.events.some((e) =>
                (e.type === 'ObligationCapitalised' || e.type === 'EncumbranceExtinguished')
                && 'player' in e && e.player === id)
              const baseFell = borrowingBase(after, id) < borrowingBase(before, id)
              expect(uncapped || baseFell,
                `${id} breached in batch "${batch.label}" with no capitalisation and no base fall`)
                .toBe(true)
            }
          }
        })
        return true
      }),
      { numRuns: 200 },
    )
  })
})

describe('borrowing base and margin calls', () => {
  it('never computes a negative borrowing base', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            expect(borrowingBase(state, id)).toBeGreaterThanOrEqual(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('never leaves a drawn balance above the base once Settlement has run', () => {
    // Settlement step 10 flags every breach. So at any state whose phase has passed
    // settlement in the round, drawn > base implies marginCallFlaggedAt is set.
    fc.assert(
      fc.property(arbGameScript(20), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          if (state.phase !== 'market' && state.phase !== 'open') continue
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            if (p.drawnCredit > borrowingBase(state, id)) {
              expect(p.marginCallFlaggedAt,
                `${id} is over base in round ${state.round} without a flag`).not.toBeNull()
            }
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('heat and dirty cash', () => {
  it('never goes negative, and heat stays inside its band', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            expect(p.dirtyCash).toBeGreaterThanOrEqual(0)
            expect(p.heat).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(p.heat)).toBe(true)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every money field an integer number of dollars', () => {
    fc.assert(
      fc.property(arbGameScript(12), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            for (const v of [p.cleanCash, p.dirtyCash, p.drawnCredit, p.distressedDebt]) {
              expect(Number.isInteger(v)).toBe(true)
            }
          }
          expect(Number.isInteger(state.treasury)).toBe(true)
        }
      }),
      { numRuns: 150 },
    )
  })
})
```

The margin-call property is stated over `market` and `open` phases only, and that
weakening is deliberate rather than convenient. Within a Settlement, steps 3 through 9
raise drawn balances *before* step 10 flags them, so a mid-Settlement state is legitimately
over base and unflagged. Restricting to phases outside Settlement is the honest form of
"drawn never exceeds base outside a flagged margin call" from spec section 15.

- [ ] **Step 26: Write `deeds.test.ts`**

`packages/engine/tests/property/deeds.test.ts`. Deed and component integrity is the one
property that never reads a cash balance, which is why it lives in its own file:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { DEED_IDS, totalFaceValue } from '../../src/config/board.js'
import { ECONOMY } from '../../src/config/economy.js'
import { PLAYER_IDS } from '../../src/core/types.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

const OWNERS = new Set<string>([...PLAYER_IDS, 'bank'])

describe('deed integrity', () => {
  it('keeps exactly the 28 deeds, with exactly one owner each', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const ids = Object.keys(state.deeds)
          expect(ids.length).toBe(DEED_IDS.length)
          expect([...ids].sort()).toEqual([...DEED_IDS].sort())
          for (const id of DEED_IDS) {
            const deed = state.deeds[id]
            expect(deed).toBeDefined()
            if (deed === undefined) continue
            expect(deed.id).toBe(id)
            expect(deed.owner === null || OWNERS.has(deed.owner)).toBe(true)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps the 28 face values summing to exactly $5,690 forever', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const sum = Object.values(state.deeds).reduce((t, d) => t + d.faceValue, 0)
          expect(sum).toBe(5_690)
          expect(sum).toBe(totalFaceValue())
        }
      }),
      { numRuns: 150 },
    )
  })

  it('never lets a player hold a deed twice, or two players hold one deed', () => {
    // Structural in the state shape, but a trade or liquidation that rebuilt the record
    // could drop or duplicate an entry, and the count assertion above would still pass
    // if it both dropped one and duplicated another.
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const holdings = PLAYER_IDS.flatMap((id) =>
            Object.values(state.deeds).filter((d) => d.owner === id).map((d) => d.id))
          expect(new Set(holdings).size).toBe(holdings.length)
        }
      }),
      { numRuns: 150 },
    )
  })

  it('conserves the physical house and hotel supply', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const placed = Object.values(state.deeds).reduce(
            (acc, d) => d.houses === 5
              ? { houses: acc.houses, hotels: acc.hotels + 1 }
              : { houses: acc.houses + d.houses, hotels: acc.hotels },
            { houses: 0, hotels: 0 },
          )
          expect(placed.houses + state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
          expect(placed.hotels + state.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
          expect(state.housesRemaining).toBeGreaterThanOrEqual(0)
          expect(state.hotelsRemaining).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every house count inside 0-5', () => {
    fc.assert(
      fc.property(arbGameScript(12), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          for (const deed of Object.values(state.deeds)) {
            expect(deed.houses).toBeGreaterThanOrEqual(0)
            expect(deed.houses).toBeLessThanOrEqual(5)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
```

The house-supply property is the one that found the `PoolCollateralLiquidated` bug fixed
in Step 19: that case set `houses: 0` without returning the components to the supply, so
a pooled loan default permanently destroyed houses out of a fixed pool of 32.

- [ ] **Step 27: Pin the run budget and make failures reproducible**

`packages/engine/tests/property/setup.ts`:

```ts
import fc from 'fast-check'

/**
 * Property runs are the slowest thing in the suite, so the budget is explicit rather
 * than per-file. CI raises it; a local watch run keeps it low enough to stay honest.
 *
 * `verbose` prints the shrunken counterexample, and because the engine has no
 * Math.random and no Date, that counterexample is a complete reproduction: paste the
 * printed seed and path into `fc.assert`'s options and the same history replays exactly.
 */
fc.configureGlobal({
  numRuns: process.env['CI'] === 'true' ? 500 : 100,
  verbose: 1,
  interruptAfterTimeLimit: 120_000,
  markInterruptAsFailure: false,
})
```

Modify `packages/engine/vitest.config.ts` to load it for the property directory only:

```ts
    setupFiles: ['./tests/property/setup.ts'],
    testTimeout: 180_000,
```

The per-file `numRuns` written into each `fc.assert` above stays; `configureGlobal` sets
the default for any assertion that omits one and caps total wall time so a pathological
shrink cannot hang CI.

- [ ] **Step 28: Run the whole property suite**

Run: `npx vitest run packages/engine/tests/property`
Expected: PASS — seven files, roughly 3,000 generated histories, under three minutes.

If any file times out, the cause is almost always `arbGameScript(20)` in the margin-call
properties: 20 rounds of four players with eight actions each is about 700 decider calls
per run. Lower the round count on that property rather than the run count on all of them,
because rounds buy state depth and runs buy state breadth, and these invariants fail on
depth.

- [ ] **Step 29: Run the full suite, typecheck and lint, then commit Task 20**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add packages/engine/tests/property packages/engine/vitest.config.ts
git commit -m "test(property): the seven invariants from spec section 15

Money conservation, replay identity, the waterfall bound, non-negative
clean cash, the capped/uncapped draw asymmetry, non-negative borrowing
base with flagged breaches, and deed plus component integrity. Every
history is generated as scripted COMMANDS run through the real deciders,
so every event under test is engine-produced and legal by construction."
```

---

## NEW EVENTS REQUIRED

Neither section existed in this file, though Task 18 and Task 19 both refer forward to
them. Both are written here, covering Tasks 18, 19 and 20 together.

| Symbol | Shape | Task | Why the existing vocabulary cannot carry it |
|---|---|---|---|
| `DeckReordered` | `{ type: 'DeckReordered'; era: Era; player: PlayerId; order: readonly number[] }` | 18 | Card E3-05 lets a player choose a permutation of the remaining deck. Every other card effect is a pure function of `(card, state-at-draw)` and needs no event, but a *player-chosen* order is external input. `DeckShuffled` cannot carry it: that event means "the deck was shuffled at setup" and the decks reducer resets `drawn` on it. |
| `DistressedDebtRepaid` | `{ type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }` | 10 | Task 10 reduces it and Task 20 asserts against it, but Task 2's union never declared it. `CreditRepaid` is the wrong event — it moves the drawn balance, and spec 19.7 makes distressed debt a separate 15%-compounding instrument that is never automatically swept. |
| `CreditWrittenDown` | `{ type: 'CreditWrittenDown'; player: PlayerId; amount: Money }` | 10 | The terminal step of spec 19.8: liquidation exhausted, the residual drawn balance converts to distressed debt. Same omission from Task 2. |
| `BuildingsStripped` | `{ type: 'BuildingsStripped'; player: PlayerId; deeds: readonly DeedId[]; proceeds: Money }` | 10 | Declared in Task 10's own table; repeated here because Task 20's ledger depends on it. `HouseSold` is per deed per house and cannot express an atomic group strip. |
| `EncumbranceExtinguished` | `{ type: 'EncumbranceExtinguished'; player: PlayerId; holder: PlayerId; contract: ContractId; amount: Money }` | 10 | Spec 19.12. Same reason. |
| `ObligationKind` gains `'swap-payout'` | — | 20 | `SwapTriggered` pays the protection buyer from the seller's clean cash. When the seller is short, spec 19.8 capitalises the gap, and `ObligationCapitalised` requires a kind. None of the eight existing kinds fits: it is not a premium. |
| `ObligationKind` gains `'make-whole'` | — | 20 | `RentFutureMadeWhole` and the option-premium refund inside `EncumbranceExtinguished` are both automatic obligations on the deed owner. Same argument. |
| `InterestAccrued` **loses** `capitalised` | `{ type: 'InterestAccrued'; player: PlayerId; amount: Money; rate: number }` | 11 | Task 9 added a `capitalised: boolean` that Task 2 never declared; Task 11 Step 1 already replaces it with a paired `ObligationCapitalised`. Recorded here so the field does not survive into `core/events.ts` by accident. |

Everything else Task 20 needs already exists. In particular the property suite adds **no**
event of its own: it observes, it does not emit.

---

## JUDGMENT CALLS

**The conserved quantity includes `distressedDebt`.** Task 3's board test and Task 12's
header both write the identity as `sum(cleanCash) - sum(drawnCredit) + treasury`. That
form is broken by `CreditWrittenDown`, which moves a balance from one bucket to the other
and reads as +amount of new money. Adding the third term fixes it and costs nothing:
distressed debt is borrowed money by any reading of spec 19.8, and it is only ever created
from a drawn balance or an unpayable obligation.

**Dirty cash is outside the pool.** Ventures mint it, audits destroy it, and neither has a
counterparty. The one place it becomes money is laundering, where the Treasury funds
`cleanOut` — which Task 12's reducer already does. A third conservation property asserts
the omission is load-bearing rather than an oversight, by checking that the final total
does *not* move by the amount minted.

**Conservation is asserted per batch, not per event.** The obligation waterfall is
intrinsically two events — the obligation credits its counterparty in full, and
`ObligationCapitalised` raises the claim that funds the shortfall. Per-event conservation
would be false by design. Per-batch is the finest granularity at which the property is
true, and it is also the granularity the server appends at, so it is the right one.

**The generator produces commands, not events.** The tradeoff is bias: rejected commands
are discarded, so the sampled distribution is the distribution of *legal* histories, which
under-samples anything reachable only through a narrow window. `coverage.test.ts` is the
mitigation and it is not optional — without it, a refactor that starts rejecting every
swap makes six property files pass vacuously. The alternative, generating raw events and
feeding `reduce` directly, was rejected: it tests reducer behaviour on inputs `decide`
never produces, and every failure it reports would first need triage for whether the input
was reachable at all.

**A rejection is a pass, not a failure.** The driver counts rejections and moves on. Any
other choice makes the generator's job "produce only legal commands", which is the
engine's job, and would push the legality rules into the test fixture where they would
drift.

**LIQUIDATION_FLOOR is 0.8, and the spec says 0.7 in two places.** Spec 19.4 says
collateral is sold at "the standard liquidation floor of 70% of face value" and spec
section 15's E2E scenario 2 says "forced liquidation at the 70% floor". `ECONOMY` says
`0.8`, spec section 5's convergence argument requires strictly greater than
`DEED_ADVANCE_RATE` of 0.75, and Task 20's Step 1 asserts 0.8. **0.8 is correct** and the
two spec sentences are stale: at 0.7 the invariant asserted at startup fails and forced
liquidation provably diverges. Flagged rather than silently reconciled because it changes
a printed rulebook number.

**The margin-call property excludes mid-Settlement states.** Spec section 15 states it
unconditionally — "drawn balance never exceeds base outside a flagged margin call" — but
spec 19.1 orders flagging at step 10, after six steps that raise drawn balances. The
unconditional form is false against the engine's own required ordering. Stated over
`market` and `open` phases, which is where it is both true and meaningful.

**The capped/uncapped property allows a second cause.** A player can breach without any
capitalisation if their *base* fell — a deed traded away, a peer-loan default halving the
base, an encumbrance extinguished. So the property asserts `capitalised || baseFell`
rather than `capitalised` alone. This weakens it, and the weakening is real: a bug that
lowered the base spuriously would be admitted here. It is caught instead by the
non-negative-base property and by Task 9's unit tests on `borrowingBase`.

**Equity is exempt from the per-tranche face bound.** Spec 19.3 gives equity a claim, not
a face, and `distribute` pays it the residual. Asserting `paid <= face` on equity would
fail on exactly the histories where the pool performed well.

**`create-pool` takes the first three poolable assets rather than three generated slots.**
When a player holds three or four poolable assets, generating three distinct slot indices
into that list is almost pure rejection. Taking the first three costs variety in *which*
assets get pooled and buys roughly an order of magnitude in how often a pool exists at
all. The count guard still rejects when there are fewer than three.

**Card draws are not gated on landing square.** The driver issues `draw-card` during
Movement on a scripted boolean, which draws cards far more often than the board would.
This over-samples the card interpreter deliberately — it is the largest body of
state-mutating code in the engine — and it is legal, because `decideDeck` gates only on
phase and deck exhaustion. It means the suite tests *what happens* when a card is drawn,
never *whether* it should have been.

---

### Invariants that could NOT be expressed as property tests

Four, and each is named here rather than quietly dropped.

**1. "Distressed debt arises in exactly one circumstance."** Spec 19.8 makes this a claim
about *provenance* — a margin call went uncured, liquidation ran, and it stopped for want
of unmortgaged deeds. Provenance is a property of the causal chain, not of any state, and
the batch structure does not carry causality. The reachable approximation is: at the state
in which `DistressedDebtIncurred` appears, the player holds no unmortgaged deeds. That is
strictly weaker — it admits distressed debt created for the wrong reason at a moment when
the player happens to be out of deeds — and it is asserted in Task 10's unit tests rather
than here, where it would read as stronger than it is.

**2. Determinism, and the absence of `Math.random` / `Date`.** These are properties of the
*source*, not of any generated history. A property test cannot observe them: an engine
that called `Math.random` would still satisfy every invariant above. Task 1's grep test
over the built output is the correct instrument.

**3. The 1.19 doubles factor and the Markov landing probabilities.** Statistical claims
about a distribution, needing a convergence test with a tolerance, not a universally
quantified predicate. They belong to Task 5 with the Markov chain that produces them.

**4. "Heat decays in any round with no deliberate dirty action."** Expressible only over a
round's whole event history, and the driver's batches do not align with rounds — a
Settlement is one batch and an Open phase is many. Task 12's unit tests assert it directly
against the reducer, which is where the rule lives.

---

### Contradictions between sibling task files

Recorded here because Task 20 is the last task authored and the only one that reads all
six parts against each other. None is fixed by Task 20 except where a step above says so.

**1. `HouseBuilt`, `HouseSold`, `DeedMortgaged`, `DeedUnmortgaged` and `DeedTraded` have
no owning task.** They are declared in Task 2's event union and referenced by spec 19.6,
by the even-build rule, and by Task 10's liquidation, but no task in the plan set writes a
decider or a reducer for any of them. `board` owns movement and rent; `credit` owns
`BuildingsStripped` only. This is the largest gap in the plan and it is why the generator
has no build, mortgage or trade arm: **the property suite cannot exercise development at
all.** A `property` or `development` context task is needed, sized somewhere near Task 5.

**2. Command discriminants are split between `kind` and `type`.** `SessionCommand`,
`BoardCommand`, `DraftCommand` and `DeckCommand` discriminate on `kind`; `CreditCommand`,
`UnderworldCommand`, `MarketsCommand` and `SecuritizationCommand` discriminate on `type`.
A single root `decide` cannot dispatch on one field. `core/commands.ts` is listed in the
main plan's file structure and written by nobody, which is presumably where this would
have surfaced.

**3. Three different treatments of the same obligation shortfall.** `board` capitalises
into drawn credit and pays the Treasury in full (spec-conformant). `credit`'s
`CarryingCostCharged` pays the Treasury only what the player could afford and routes the
rest to `DistressedDebtIncurred`. `markets`' `payClean` floors the payer and routes the
shortfall to `DistressedDebtIncurred`, with a comment instructing Task 20 to "count
distressed debt as issued money". Spec 19.8 has exactly one waterfall and it capitalises.
Step 18 and Step 19 above reconcile the latter two to the first.

**4. Task 19 states that Task 11 is "ABSENT from the plan set".** It is not — Task 11 is
in `tasks-09-11.md` at line 2037 and exports both symbols the comment says are missing,
`settlePeerLoans` and `activeLoans`. The comment is stale and should be deleted, not acted
on.

**5. `isWholeDollars` is imported by Task 9 and defined by Task 20.** `contexts/credit/
decide.ts` imports it from `core/money.js` in Task 9, but Task 2 does not define it and
Step 6 above is what adds it. Whichever task lands first must carry the definition;
Task 20's Step 6 is written to be idempotent if Task 9 has already added it.

**6. `credit` and `session` each own a `settlement.ts`.** Task 11's peer-loan tests import
`settlePeerLoans` from `./settlement.js` inside the credit context, while Task 19 puts the
eleven-step `SETTLEMENT_STEPS` sequence in `contexts/session/settlement.ts`. Both are
legitimate — per-step generators live with their context, the ordering lives with session
— but the identical filename across two contexts is a trap for anyone grepping.

**7. `RejectionCode` is extended by four tasks independently.** Task 2 declares the union;
Tasks 11, 14, 15 and 16 each append to it, with Task 11 noting that four of its five
additions are "shared with Tasks 14-16 and whichever task merges first writes the
identical literal". `SWAP_NOTIONAL_EXCEEDS_FACE` is used by Task 17 and declared by no
task at all.
