import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import type { Entitlement, TimedModifier } from './effects.js'

/**
 * The read surface every other context uses to let a card change a rule without that
 * context importing card data. Task 18 does not wire these into `credit`/`board`/
 * `markets` itself — those files are not in scope for this task — but every formula
 * a card can touch has a selector here, ready for that integration.
 */

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
  return { cost: ECONOMY.BRIBERY_COST, heat: ECONOMY.BRIBERY_HEAT }
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
