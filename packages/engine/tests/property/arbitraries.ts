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
 * Twenty-four arms. Nineteen are the credit/markets/securitization/underworld
 * vocabulary; five — `build-house`, `sell-house`, `mortgage-deed`, `unmortgage-deed`,
 * `trade-deeds` — drive `board`'s `decideProperty` (Task 21), without which no property
 * in this suite constrains the even-build rule, the 32-house/12-hotel supply, or
 * mortgage economics, and the generator would never touch `HouseBuilt`, `HouseSold`,
 * `DeedMortgaged`, `DeedUnmortgaged` or `DeedTraded` at all. Every arm carries *slots and
 * percentages*, never identities and dollars, so that no arm can be generated in a form
 * the engine will reject for a boring reason (naming a deed the actor does not own, or a
 * dollar amount that happens to exceed a balance neither side of the generator can see).
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
  | { readonly kind: 'insider-trade'; readonly actor: Slot; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly kind: 'build-house'; readonly actor: Slot; readonly deed: Slot }
  | { readonly kind: 'sell-house'; readonly actor: Slot; readonly deed: Slot }
  | { readonly kind: 'mortgage-deed'; readonly actor: Slot; readonly deed: Slot }
  | { readonly kind: 'unmortgage-deed'; readonly actor: Slot; readonly deed: Slot }
  | { readonly kind: 'trade-deeds'; readonly actor: Slot; readonly counterparty: Slot
      readonly deedFrom: Slot; readonly deedTo: Slot
      readonly cashFromPercent: Percent; readonly cashToPercent: Percent }

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
  /**
   * Bids on the front lot of a forced liquidation, one slot per non-liquidating
   * player, resolved as a percentage of THAT bidder's own clean cash (never the
   * liquidated deed's price — the driver has no way to see it before the auction
   * closes). Without this, `playersAwaitingLiquidation` would only ever reach
   * `exhaustLiquidation`'s empty-queue branch and `DeedLiquidated` would never fire.
   */
  readonly liquidationBidPercents: readonly Percent[]
}

export interface GameScript {
  readonly config: GameConfig
  readonly shuffles: Readonly<Record<Era, readonly number[]>>
  readonly draft: readonly ScriptedDraftRound[]
  readonly rounds: readonly ScriptedRound[]
}

const slot = fc.integer({ min: 0, max: 63 })
const percent = fc.integer({ min: 0, max: 120 })
const die = fc.integer({ min: 1, max: 6 })

export const arbDice: fc.Arbitrary<DiceRoll> = fc.tuple(die, die)

/**
 * A quarter of rolls are doubles against a true rate of one in six. Doubles drive the
 * extra-roll path and the triple-doubles jail rule, both of which a uniform generator
 * reaches roughly once per 216 turns — too rare to be load-bearing at 100-200 runs.
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

const arbShuffles: fc.Arbitrary<Readonly<Record<Era, readonly number[]>>> = fc.record({
  1: arbPermutation(1), 2: arbPermutation(2),
  3: arbPermutation(3), 4: arbPermutation(4),
})

const funded = fc.constantFrom('clean' as const, 'dirty' as const)

/**
 * Weighted, not uniform. Every arm still has SOME weight — the coverage floor in
 * `coverage.test.ts` protects against any arm being starved to zero — but three
 * clusters are boosted because they are compound events: reaching them needs an
 * earlier action to have already succeeded and left its result lying around for a
 * later one to consume.
 *
 * `originate-peer-loan` / `originate-future` / `write-option` / `create-pool` at 2x:
 * `create-pool` needs three of the other three's OUTPUTS held simultaneously by one
 * actor, so the whole chain needs to fire more than once per script just to give
 * `create-pool` a nonzero chance, and `create-pool` itself then needs to fire again on
 * top of that. `originate-peer-loan` at high leverage (short term, high rate) is also
 * the main engineered path to a peer-loan default, which is what feeds a pooled loan's
 * `PoolCollateralLiquidated` path and the `creditImpaired` base-halving the capped/
 * uncapped asymmetry property depends on.
 *
 * `draw-credit` at 2x: `DrawCredit` is capped at the borrowing base by construction
 * (spec 19.8), so no amount of `draw-credit` alone can breach it — but pushing more
 * players closer to their headroom more often makes the automatic obligations that
 * DO breach it (carrying cost, interest, a stimulus advance against a small base)
 * land on someone already thin, which is what the credit-crisis coverage floor needs.
 */
export const arbAction: fc.Arbitrary<ScriptedAction> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('draw-credit' as const), actor: slot, percent }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('repay-credit' as const), actor: slot, percent }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('repay-distressed' as const), actor: slot, percent }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('originate-peer-loan' as const), actor: slot, counterparty: slot,
      // Rate skewed up (5-30%, was 1-20%) and term skewed down (1-4 rounds, was 1-8):
      // a short, expensive note is far more likely to blow through the borrower's
      // headroom and default (spec section 7) before it would otherwise amortise away.
      // Defaults are what set `creditImpaired` (a permanent base halving, spec 19.10)
      // and feed `PoolCollateralLiquidated` — without engineering toward them, the
      // `CreditWrittenDown` terminal state (this codebase's real analogue of spec
      // 19.7's "liquidation exhausted the portfolio") is too rare to floor reliably.
      percent, ratePerRound: fc.integer({ min: 5, max: 30 }).map((n) => n / 100),
      termRounds: fc.integer({ min: 1, max: 4 }), collateral: slot,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('repay-peer-loan' as const), actor: slot, contract: slot, percent }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sell-peer-loan' as const), actor: slot, contract: slot,
      counterparty: slot, percent,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('originate-future' as const), actor: slot, deed: slot,
      counterparty: slot, window: fc.integer({ min: 1, max: 8 }), percent,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sell-future' as const), actor: slot, contract: slot,
      counterparty: slot, percent,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('write-option' as const), actor: slot, deed: slot, counterparty: slot,
      strikePercent: percent, premiumPercent: fc.integer({ min: 0, max: 30 }),
      window: fc.integer({ min: 1, max: 6 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sell-option' as const), actor: slot, contract: slot,
      counterparty: slot, percent,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('exercise-option' as const), actor: slot, contract: slot }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('create-pool' as const), actor: slot,
      seniorPercent: fc.integer({ min: 10, max: 60 }),
      mezzaninePercent: fc.integer({ min: 10, max: 40 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sell-tranche' as const), actor: slot, pool: slot,
      tranche: fc.constantFrom(0 as const, 1 as const, 2 as const),
      counterparty: slot, percent,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('write-swap' as const), actor: slot, counterparty: slot,
      reference: slot, notionalPercent: percent,
      premiumPercent: fc.integer({ min: 1, max: 20 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('launch-venture' as const), actor: slot,
      venture: fc.constantFrom('escort' as const, 'numbers' as const, 'chop-shop' as const),
      fundedFrom: funded,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('speakeasy' as const), actor: slot, dice: arbDice, fundedFrom: funded,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('launder' as const), actor: slot, percent }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('bribe' as const), actor: slot,
      effect: fc.constantFrom(0 as const, 1 as const, 2 as const), target: slot,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('insider-trade' as const), actor: slot, fundedFrom: funded }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('build-house' as const), actor: slot, deed: slot }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('sell-house' as const), actor: slot, deed: slot }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('mortgage-deed' as const), actor: slot, deed: slot }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('unmortgage-deed' as const), actor: slot, deed: slot }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('trade-deeds' as const), actor: slot, counterparty: slot,
      deedFrom: slot, deedTo: slot,
      cashFromPercent: fc.integer({ min: 0, max: 40 }), cashToPercent: fc.integer({ min: 0, max: 40 }),
    }),
  },
)

export const arbDraftRound: fc.Arbitrary<ScriptedDraftRound> = fc.record({
  offsets: fc.array(slot, { minLength: 4, maxLength: 4 }),
  bidPercents: fc.array(fc.integer({ min: 90, max: 180 }), { minLength: 4, maxLength: 4 }),
})

export const arbRound: fc.Arbitrary<ScriptedRound> = fc.record({
  // `size: 'max'` overrides fast-check's default length heuristic, which scales array
  // sizes to a fraction of `maxLength` (roughly proportional to run depth) rather than
  // sampling the full range. Without it, `fc.sample`/`fc.assert` rarely generate more
  // than 6-8 actions total across a WHOLE script even when `maxLength: 8` is per round,
  // which starves every multi-action-per-round invariant (pools need three assets in
  // one hand; margin calls need several aggressive draws) of the density it needs.
  actions: fc.array(arbAction, { minLength: 0, maxLength: 8, size: 'max' }),
  rolls: fc.array(arbDiceBiased, { minLength: 4, maxLength: 4 }),
  auditDice: fc.record({ P1: arbDice, P2: arbDice, P3: arbDice, P4: arbDice }),
  drawCard: fc.boolean(),
  liquidationBidPercents: fc.array(percent, { minLength: 4, maxLength: 4 }),
})

/**
 * `maxRounds` is capped at ECONOMY.TOTAL_ROUNDS by the driver, not here.
 *
 * `size: 'max'` on the `rounds` array is load bearing for exactly the same reason as
 * `actions` above, and more severely: fast-check's default heuristic sampled almost
 * exclusively 1-12 round scripts even when called as `arbGameScript(24)`, which meant
 * no generated history ever reached Era III's audits (round 13+) or accumulated enough
 * rounds of peer-loan/futures/options activity to fill a pool. Round DEPTH is what the
 * margin-call, audit and pool properties need; `size: 'max'` is what makes the depth
 * `maxRounds` promises actually reachable instead of a theoretical upper bound nothing
 * ever samples near.
 */
export function arbGameScript(maxRounds: number): fc.Arbitrary<GameScript> {
  return fc.record({
    config: arbConfig,
    shuffles: arbShuffles,
    draft: fc.array(arbDraftRound, { minLength: 7, maxLength: 7 }),
    rounds: fc.array(arbRound, { minLength: 1, maxLength: maxRounds, size: 'max' }),
  })
}
