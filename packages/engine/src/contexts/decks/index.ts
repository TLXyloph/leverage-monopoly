export type {
  Amount, Card, CardClause, CardCounters, CardEffectsState, CardId, Effect, Entitlement,
  EntitlementKind, EntitlementTemplate, EntityExtremum, EntityKind, MetricRef, ModifierEffect,
  ModifierTemplate, PlayerMetric, PlayerPredicate, ResolvedExpiry, Target, TimedModifier,
  WorldPredicate,
} from './effects.js'

export { ALL_CARDS, DECKS, cardById, deckFor } from './cards/index.js'

export { evalMetric, testPredicate } from './metrics.js'

export { resolveEntity, resolveTarget, testWorld, type EntityHandle } from './select.js'

export {
  applyCard, applyEffect, evalAmount, isBriberyCancellable, type DrawContext,
} from './interpret.js'

export { resolveExpiry } from './interpret-structural.js'

export { emptyCardEffects, reduceDecks } from './reduce.js'

export { decideDeck, type DeckCommand } from './decide.js'

export {
  type BaseOverride,
  activeModifiers, borrowingBaseOverride, briberyTerms, buildingCostMultiplier,
  consumeEntitlement, creditInterestWaived, entitlementOfKind, entitlementsOf,
  goSalaryAddend, interestRateFor, marginThreshold, pendingPoolInjections, rentMultiplier,
  scheduledPoolTerminations,
} from './selectors.js'

import type { Era } from '../../core/types.js'
import type { Card } from './effects.js'
import { DECKS } from './cards/index.js'

/** A card by its authored (pre-shuffle) index within its era's deck. */
export function cardAt(era: Era, authoredIndex: number): Card {
  const card = DECKS[era][authoredIndex]
  if (card === undefined) throw new Error(`no card at ${era}:${authoredIndex}`)
  return card
}
