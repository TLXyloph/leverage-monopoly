import type { ColorGroup, Money } from '../../../core/types.js'
import type {
  Amount, CardClause, Effect, EntitlementTemplate, EntityExtremum, EntityKind,
  Expiry, MetricRef, ModifierTemplate, PlayerMetric, PlayerPredicate, Target, WorldPredicate,
} from '../effects.js'

/**
 * Combinators for the 80 authored cards. Without these each card costs 30+ lines of
 * nested object literals and the era files blow the 500-line limit; with them each
 * card costs roughly 9-14 lines including its verbatim rules and targets strings.
 */

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
): Target => (among === undefined
  ? { kind: 'extremum', by: hi(metric), tieBreak }
  : { kind: 'extremum', by: hi(metric), tieBreak, among })

export const least = (
  metric: PlayerMetric, tieBreak: readonly MetricRef[] = [], among?: PlayerPredicate,
): Target => (among === undefined
  ? { kind: 'extremum', by: lo(metric), tieBreak }
  : { kind: 'extremum', by: lo(metric), tieBreak, among })

export const topN = (
  take: number, metric: PlayerMetric, tieBreak: readonly MetricRef[], among?: PlayerPredicate,
): Target => (among === undefined
  ? { kind: 'extremum', by: hi(metric), tieBreak, take }
  : { kind: 'extremum', by: hi(metric), tieBreak, take, among })

export const holderOf = (entity: EntityExtremum): Target => ({ kind: 'entity-holder', entity })

export const flat = (dollars: Money): Amount =>
  ({ kind: 'sum', terms: [{ metric: 'one', rate: dollars }] })
export const per = (metric: PlayerMetric, rate: number, cap?: Money): Amount =>
  (cap === undefined
    ? { kind: 'sum', terms: [{ metric, rate }] }
    : { kind: 'sum', terms: [{ metric, rate }], cap })
export const sumOf = (
  terms: readonly { readonly metric: PlayerMetric; readonly rate: number }[], cap?: Money,
): Amount => (cap === undefined ? { kind: 'sum', terms } : { kind: 'sum', terms, cap })
export const clampedTo = (amount: Amount, ...clampTo: readonly PlayerMetric[]): Amount =>
  (amount.kind === 'sum' ? { ...amount, clampTo } : amount)
export const branch = (when: PlayerPredicate, then: Amount, otherwise: Amount): Amount =>
  ({ kind: 'branch', when, then, otherwise })

const TREASURY = { kind: 'treasury' } as const
const BANK = { kind: 'bank' } as const
const SELF = { kind: 'target' } as const

export const collect = (
  target: Target, amount: Amount, applyFirstTo?: 'drawn-credit' | 'distressed-debt',
): Effect => (applyFirstTo === undefined
  ? { op: 'transfer', target, from: TREASURY, to: SELF, amount }
  : { op: 'transfer', target, from: TREASURY, to: SELF, amount, applyFirstTo })

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
  (extraPenalty === undefined ? { op: 'audit', target } : { op: 'audit', target, extraPenalty })
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
  (when === undefined ? { effects } : { when, effects })
export const otherwise = (effects: readonly Effect[]): CardClause => ({ effects })
