import { describe, it, expect } from 'vitest'
import { ALL_CARDS, DECKS } from './cards/index.js'
import type { Card, Effect } from './effects.js'

const opsOf = (c: Card): Effect['op'][] => c.clauses.flatMap((cl) => cl.effects.map((e) => e.op))

const metricsOf = (c: Card): string[] =>
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

  it('covers all 80 cards with the 15-op effect vocabulary and no other op', () => {
    const vocabulary = new Set<Effect['op']>([
      'transfer', 'dirty', 'heat', 'forgive', 'modifier', 'entitlement', 'audit',
      'margin-flag', 'tranche-face', 'option-strike', 'option-expiry', 'pool-inject',
      'pool-terminate', 'forced-mortgage', 'deck-peek',
    ])
    expect(vocabulary.size).toBe(15)
    const used = new Set(ALL_CARDS.flatMap(opsOf))
    for (const op of used) expect(vocabulary.has(op)).toBe(true)
  })
})

describe('era gating (era-decks.md section 0: no instrument before its era unlocks)', () => {
  const ERA_I_METRICS = new Set([
    'one', 'clean-cash', 'net-worth', 'drawn-credit', 'borrowing-base',
    'drawn-to-base-ratio', 'distressed-debt', 'deed-count', 'unmortgaged-deed-count',
    'mortgaged-deed-count', 'deed-face-value', 'unmortgaged-face-value',
    'mortgaged-face-value', 'railroad-count', 'utility-count', 'house-count',
    'hotel-count', 'building-count', 'complete-group-count', 'best-group-buildings',
    'best-group-face-value', 'rent-received-this-era', 'rent-received-this-game',
  ])
  const ERA_II_ONLY = new Set([
    'dirty-cash', 'heat', 'active-venture-count', 'peer-principal-lent', 'peer-note-count',
    'peer-principal-borrowed', 'peer-max-rate', 'peer-interest-due-per-round',
    'dirty-actions-this-game', 'launder-count-this-game',
  ])
  const ERA_III_ONLY = new Set(['cds-notional-written', 'total-obligations'])
  const ERA_III_PLUS_OPS: Effect['op'][] = [
    'tranche-face', 'option-strike', 'option-expiry', 'pool-inject', 'pool-terminate',
    'audit', 'deck-peek', 'margin-flag',
  ]

  it('lets no Era I card reference an instrument that unlocks later', () => {
    for (const c of DECKS[1]) {
      for (const m of metricsOf(c)) expect(ERA_I_METRICS.has(m)).toBe(true)
      for (const op of opsOf(c)) expect(ERA_III_PLUS_OPS).not.toContain(op)
    }
  })

  it('lets no Era II card reference an Era III+ instrument', () => {
    for (const c of DECKS[2]) {
      for (const m of metricsOf(c)) {
        expect(ERA_I_METRICS.has(m) || ERA_II_ONLY.has(m)).toBe(true)
      }
      for (const op of opsOf(c)) expect(ERA_III_PLUS_OPS).not.toContain(op)
    }
  })

  it('confines Era-III-only metrics to Era III and Era IV', () => {
    for (const c of [...DECKS[1], ...DECKS[2]]) {
      for (const m of metricsOf(c)) expect(ERA_III_ONLY.has(m)).toBe(false)
    }
  })

  it('triggers no audit before round 13, when audits begin — only E3-03 and E4-08', () => {
    const auditing = ALL_CARDS.filter((c) => opsOf(c).includes('audit'))
    expect(auditing.map((c) => c.id).sort()).toEqual(['E3-03', 'E4-08'])
    for (const c of auditing) expect(c.era).toBeGreaterThanOrEqual(3)
  })

  it('contains no movement op, which the landing-probability model depends on', () => {
    for (const c of ALL_CARDS) expect(opsOf(c)).not.toContain('move')
  })
})

describe('money safety (era-decks.md section 0: no card may go below $0 clean cash)', () => {
  // The HARD RULE itself — clean cash never goes negative — is a structural guarantee
  // of `interpret.ts`'s `payToTreasury`/`payToPlayer` (any shortfall capitalises into
  // drawn credit, uncapped) and is exercised directly in interpret.test.ts. This check
  // is the complementary CONTENT rule: every player-PAID, metric-driven amount is
  // bounded by an authored cap or clamp, so no card's charge grows without limit as the
  // ranking metric itself grows. E3-16 (Servicer Demands Cure) is intentionally
  // uncapped: it is bounded by the borrower's own loan book
  // (`peer-interest-due-per-round`), not by a card-authored dollar cap.
  const UNCAPPED_BY_DESIGN = new Set(['E3-16'])

  it('caps or clamps every player-paid, metric-driven transfer amount', () => {
    for (const c of ALL_CARDS) {
      if (UNCAPPED_BY_DESIGN.has(c.id)) continue
      for (const cl of c.clauses) {
        for (const e of cl.effects) {
          if (e.op !== 'transfer' || e.from.kind !== 'target') continue
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
