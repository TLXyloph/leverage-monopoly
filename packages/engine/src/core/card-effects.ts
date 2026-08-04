import { ECONOMY } from '../config/economy.js'
import type { Entitlement, TimedModifier } from '../contexts/decks/index.js'
import type { GameState } from './state.js'
import type { DeedId, Money, PlayerId } from './types.js'

/**
 * The read surface every other context uses to let a card change a rule without that
 * context importing card data.
 *
 * This lives in `core/` rather than in `contexts/decks/` for one concrete reason: the
 * lint rule "import a context only through its index.ts" means a consumer would have to
 * import `contexts/decks/index.js`, and that barrel pulls in `decks/select.ts` and
 * `decks/interpret-structural.ts`, which import `board`, `credit`, `markets` and
 * `securitization`. Wiring these selectors into `board`'s rent formula through the
 * barrel therefore closes a runtime cycle (board -> decks -> board).
 *
 * No port was needed to break it. Unlike `CreditPorts`/`PropertyPorts`, which inject
 * BEHAVIOUR that genuinely belongs to another context, these functions are pure reads
 * over `state.cardEffects` — a field of core `GameState` — plus `ECONOMY`. They have no
 * dependency on card DATA at all (the two type imports below are `import type`, erased
 * at build; `core/state.ts` already imports `CardEffectsState` the same way). So they
 * belong at the layer every context can already see, and each consumer calls them
 * directly with no injection point to forget to wire — which is exactly the defect
 * class that let 23 `modify()` and 11 `grant()` calls sit inert.
 *
 * `contexts/decks/selectors.ts` re-exports the whole surface, so `decks`' public API
 * is unchanged.
 */

export function activeModifiers(state: GameState): readonly TimedModifier[] {
  return [...state.cardEffects.modifiers].sort((a, b) => a.seq - b.seq)
}

const forPlayer = (state: GameState, p: PlayerId): readonly TimedModifier[] =>
  activeModifiers(state).filter((m) => m.players.includes(p))

/**
 * era-decks 6.2: rent modifiers compose MULTIPLICATIVELY against base rent, applied in
 * card-draw order. Callers apply a single `floorPercent` after multiplying base rent by
 * this. Wired into `board/rent.ts`'s `rentDue`.
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
 * additive terms, then multipliers, then subtract CDS postings. `credit`'s
 * `borrowingBase` does exactly that.
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

/** Added to `ECONOMY.GO_SALARY` by `board/decide.ts` when the token passes GO. */
export function goSalaryAddend(state: GameState, p: PlayerId): Money {
  return forPlayer(state, p).reduce(
    (t, m) => (m.effect.kind === 'go-salary-addend' ? t + m.effect.dollars : t), 0,
  )
}

/** Wired into `credit`'s `creditInterestDue` (Settlement step 4). */
export function interestRateFor(state: GameState, p: PlayerId, base: number): number {
  const override = forPlayer(state, p).find((m) => m.effect.kind === 'interest-rate-override')
  if (override !== undefined && override.effect.kind === 'interest-rate-override') {
    return override.effect.rate
  }
  return base
}

/**
 * Non-null while a card has waived this player's credit-line interest. The value is
 * what they pay INSTEAD if their drawn balance is zero — the card charges the debt-free
 * player rather than letting the waiver be a pure no-op for them.
 */
export function creditInterestWaived(state: GameState, p: PlayerId): Money | null {
  const waiver = forPlayer(state, p).find((m) => m.effect.kind === 'waive-credit-interest')
  if (waiver === undefined || waiver.effect.kind !== 'waive-credit-interest') return null
  return waiver.effect.ifZeroBalanceCollect
}

/** Wired into `board/decide-property.ts`'s `BuildHouse` pricing. */
export function buildingCostMultiplier(state: GameState, p: PlayerId): number {
  return forPlayer(state, p).reduce(
    (f, m) => (m.effect.kind === 'building-cost-multiplier' ? f * m.effect.factor : f), 1,
  )
}

/**
 * The fraction of the borrowing base the drawn balance may reach before it is a breach.
 * 1 (the default) is the ordinary rule "drawn > base". Wired into `credit`'s
 * `marginShortfall`, which every margin check and the liquidation gate read.
 */
export function marginThreshold(state: GameState, p: PlayerId): number {
  return forPlayer(state, p).reduce(
    (r, m) => (m.effect.kind === 'margin-threshold' ? Math.min(r, m.effect.ratio) : r), 1,
  )
}

/** Wired into `underworld/decide.ts`'s `Bribe` pricing. */
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

/**
 * Spends `used` units of an entitlement's remaining capacity. Called by `reduceDecks`'s
 * `EntitlementConsumed` case, never by a decider: a decider prices the discount and
 * emits the event, and the reducer is the only thing that moves state, so a replayed log
 * spends exactly what the live game spent.
 */
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

/**
 * Cash a card escrowed into the Treasury for a pool's next waterfall, by pool id.
 * `session/settlement.ts` releases it at Settlement step 6.
 */
export function pendingPoolInjections(state: GameState): Readonly<Record<string, Money>> {
  return state.cardEffects.poolInjections
}

/** Pools a card scheduled to wind down. `session/settlement.ts` terminates them after
 * step 6, so the injected cash reaches the waterfall before the pool closes. */
export function scheduledPoolTerminations(state: GameState): readonly string[] {
  return state.cardEffects.scheduledPoolTerminations
}
