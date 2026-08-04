import type { GameState } from '../../core/state.js'
import type { ContractId, PlayerId } from '../../core/types.js'
import type { EntityExtremum, EntityKind, Target, WorldPredicate } from './effects.js'
import { evalMetric, testPredicate } from './metrics.js'
import { rateTranche, trancheFace, expectedPoolCashflow } from '../securitization/index.js'
import { markRentFuture } from '../markets/index.js'

const cmp = (a: number, b: number, dir: 'max' | 'min'): number =>
  dir === 'max' ? b - a : a - b

/**
 * Ranks players by the target's metric chain and returns the top `take`.
 * The final tie-break is ALWAYS earlier position in turn order, which is fixed
 * at setup and therefore total. Every dynamic target in all four decks resolves here.
 */
export function resolveTarget(
  state: GameState, target: Target, drawer: PlayerId,
): readonly PlayerId[] {
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

export type EntityHandle =
  | { readonly kind: 'pool'; readonly poolId: ContractId }
  | {
      readonly kind: 'tranche'; readonly poolId: ContractId
      readonly tranche: 'senior' | 'mezzanine' | 'equity'
    }
  | { readonly kind: 'rent-future'; readonly contractId: ContractId }

function poolTieValue(state: GameState, poolId: ContractId, by: string): number {
  const pool = state.pools.find((p) => p.id === poolId)
  if (pool === undefined) return 0
  if (by === 'senior-face') return trancheFace(pool, 'senior')
  if (by === 'senior-plus-mezz-face') return trancheFace(pool, 'senior') + trancheFace(pool, 'mezzanine')
  return rateTranche(state, pool, 'senior').coverage
}

function resolvePoolEntity(
  state: GameState, e: Extract<EntityExtremum, { kind: 'pool' }>,
): EntityHandle | null {
  const pools = state.pools.filter((p) => !p.terminated)
  if (pools.length === 0) return null
  const score = (poolId: ContractId): number => {
    const pool = state.pools.find((p) => p.id === poolId)
    if (pool === undefined) return 0
    return e.by === 'expected-cashflow'
      ? expectedPoolCashflow(state, pool)
      : rateTranche(state, pool, 'senior').coverage
  }
  const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
  const best = [...pools].sort((a, b) => {
    const primary = cmp(score(a.id), score(b.id), e.direction)
    if (primary !== 0) return primary
    for (const t of e.tieBreak) {
      const next = cmp(poolTieValue(state, a.id, t.by), poolTieValue(state, b.id, t.by), t.direction)
      if (next !== 0) return next
    }
    return (order.get(a.originator) ?? 0) - (order.get(b.originator) ?? 0)
  })[0]
  return best === undefined ? null : { kind: 'pool', poolId: best.id }
}

interface TrancheHandle {
  readonly poolId: ContractId
  readonly kind: 'senior' | 'mezzanine' | 'equity'
  readonly holder: PlayerId
}

function trancheTieValue(state: GameState, h: TrancheHandle, by: string): number {
  const pool = state.pools.find((p) => p.id === h.poolId)
  if (pool === undefined) return 0
  if (by === 'rating-score') return rateTranche(state, pool, h.kind).score
  if (by === 'remaining-face') {
    const t = pool.tranches.find((x) => x.kind === h.kind)
    return t === undefined ? 0 : Math.max(0, t.face - t.paid)
  }
  return pool.tranches.reduce((sum, t) => sum + Math.max(0, t.face - t.paid), 0)
}

function resolveTrancheEntity(
  state: GameState, e: Extract<EntityExtremum, { kind: 'tranche' }>,
): EntityHandle | null {
  const all: TrancheHandle[] = state.pools
    .filter((p) => !p.terminated)
    .flatMap((p) => p.tranches.map((t) => ({ poolId: p.id, kind: t.kind, holder: t.holder })))
  if (all.length === 0) return null
  const score = (h: TrancheHandle): number => {
    const pool = state.pools.find((p) => p.id === h.poolId)
    if (pool === undefined) return 0
    return e.by === 'rating-score'
      ? rateTranche(state, pool, h.kind).score
      : trancheTieValue(state, h, 'remaining-face')
  }
  const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
  const best = [...all].sort((a, b) => {
    const primary = cmp(score(a), score(b), e.direction)
    if (primary !== 0) return primary
    for (const t of e.tieBreak) {
      const next = cmp(trancheTieValue(state, a, t.by), trancheTieValue(state, b, t.by), t.direction)
      if (next !== 0) return next
    }
    return (order.get(a.holder) ?? 0) - (order.get(b.holder) ?? 0)
  })[0]
  return best === undefined ? null : { kind: 'tranche', poolId: best.poolId, tranche: best.kind }
}

function resolveRentFutureEntity(
  state: GameState, e: Extract<EntityExtremum, { kind: 'rent-future' }>,
): EntityHandle | null {
  if (state.futures.length === 0) return null
  const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
  const best = [...state.futures].sort((a, b) => {
    const primary = cmp(markRentFuture(state, a.id), markRentFuture(state, b.id), e.direction)
    if (primary !== 0) return primary
    return (order.get(a.holder) ?? 0) - (order.get(b.holder) ?? 0)
  })[0]
  return best === undefined ? null : { kind: 'rent-future', contractId: best.id }
}

export function resolveEntity(state: GameState, e: EntityExtremum): EntityHandle | null {
  switch (e.kind) {
    case 'pool': return resolvePoolEntity(state, e)
    case 'tranche': return resolveTrancheEntity(state, e)
    case 'rent-future': return resolveRentFutureEntity(state, e)
  }
}

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
  return state.futures.find((f) => f.id === handle.contractId)?.holder ?? null
}

function entityExists(state: GameState, kind: EntityKind): boolean {
  switch (kind) {
    case 'pool': return state.pools.some((p) => !p.terminated)
    case 'tranche': return state.pools.some((p) => !p.terminated && p.tranches.length > 0)
    case 'rent-future': return state.futures.length > 0
    case 'deed-option': return state.options.length > 0
    case 'peer-loan': return state.loans.some((l) => l.status === 'active')
    case 'written-cds': return state.swaps.some((s) => s.status === 'active')
    case 'building': return Object.values(state.deeds).some((d) => d.houses > 0)
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
