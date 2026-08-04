/**
 * The card-effect read surface now lives in `core/card-effects.ts` — see its docstring
 * for why. It is re-exported here unchanged so `decks`' public API, and every test and
 * caller that reads these through the `decks` barrel, is unaffected.
 *
 * The move is what made the wiring possible at all: a consumer must import a context
 * through its `index.ts` (lint rule), and `decks/index.ts` reaches `board`, `credit`,
 * `markets` and `securitization`, so `board/rent.ts` importing it would cycle.
 */
export type { BaseOverride } from '../../core/card-effects.js'
export {
  activeModifiers,
  borrowingBaseOverride,
  briberyTerms,
  buildingCostMultiplier,
  consumeEntitlement,
  creditInterestWaived,
  entitlementOfKind,
  entitlementsOf,
  goSalaryAddend,
  interestRateFor,
  marginThreshold,
  pendingPoolInjections,
  rentMultiplier,
  scheduledPoolTerminations,
} from '../../core/card-effects.js'
