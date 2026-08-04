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
      readonly attribute: 'holder'
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
  /** The player's own credit line. Repayment leaves no Treasury trace, matching CreditRepaid. */
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
  /** The Mechanical effect column, verbatim (may be lightly abbreviated for length). */
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
  /** Monotonic, assigned to each modifier/entitlement so stacking order is card-draw order. */
  readonly seq: number
}

export type DeedRef = DeedId
