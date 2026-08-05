import { z } from 'zod'

/**
 * Validation at the system boundary. Every field the engine's deciders read is checked
 * here for shape; the engine still owns every *rule*, so this file must never encode an
 * economic constraint (a price floor, an unlock era, a headroom check). Its job is to
 * guarantee that whatever reaches `decide*Action` is structurally a command, so a
 * malformed body produces a 400 rather than an exception inside a pure function.
 *
 * Two commands are deliberately narrower on the wire than in the engine:
 *
 * - `settle` carries only `auditDice`. `SettlementInput.roundEvents` is derived from
 *   the log by the server (`roundEventsSince`), because a client that supplied its own
 *   could rewrite what Settlement step 6 distributes.
 * - `CreatePool` / `WriteSwap` take an OPTIONAL contract id. The engine generates
 *   nothing random, so ids must be supplied; the server derives one from state when the
 *   client omits it, which keeps id generation off the client without inventing
 *   randomness anywhere.
 */

const playerId = z.enum(['P1', 'P2', 'P3', 'P4'])
const era = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
const deedId = z.string().min(1)
const contractId = z.string().min(1)
const money = z.number().int()
/** Non-negative money. `isWholeDollars(-1)` is true in the engine, so amounts that must
 * not be negative are guarded here as well as there. */
const amount = money.nonnegative()
const round = z.number().int().positive()
const die = z.number().int().min(1).max(6)

const dice = z.tuple([die, die])
const auditDice = z.record(playerId, dice)
const funding = z.enum(['clean', 'dirty'])

const poolAssetRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('peer-loan'), id: contractId }),
  z.object({ kind: z.literal('rent-future'), id: contractId }),
  z.object({ kind: z.literal('deed-option'), id: contractId }),
])

const trancheKind = z.enum(['senior', 'mezzanine', 'equity'])

const swapReference = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('peer-loan'), id: contractId }),
  z.object({ kind: z.literal('tranche'), poolId: contractId, tranche: trancheKind }),
])

const briberyEffect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('force-reroll'), target: playerId }),
  z.object({ kind: z.literal('cancel-card') }),
  z.object({ kind: z.literal('delay-margin-call') }),
])

/** Session and draft. */
const sessionCommands = [
  z.object({ type: z.literal('advance-phase') }),
  z.object({ type: z.literal('settle'), auditDice: auditDice.default({}) }),
  z.object({
    type: z.literal('submit-draft'),
    player: playerId,
    ranked: z.tuple([deedId, deedId, deedId]),
    maxBid: amount,
  }),
  z.object({ type: z.literal('resolve-draft-round') }),
  z.object({ type: z.literal('roll-dice'), player: playerId, dice }),
] as const

/** Deeds, building, mortgages, trades. */
const propertyCommands = [
  z.object({ type: z.literal('BuildHouse'), player: playerId, deed: deedId }),
  z.object({ type: z.literal('SellHouse'), player: playerId, deed: deedId }),
  z.object({ type: z.literal('MortgageDeed'), player: playerId, deed: deedId }),
  z.object({ type: z.literal('UnmortgageDeed'), player: playerId, deed: deedId }),
  z.object({
    type: z.literal('TradeAssets'),
    from: playerId,
    to: playerId,
    deedsFrom: z.array(deedId),
    deedsTo: z.array(deedId),
    cashFrom: amount,
    cashTo: amount,
    confirmedBy: z.array(playerId),
  }),
] as const

/** Bank credit, liquidation, peer loans. */
const creditCommands = [
  z.object({ type: z.literal('DrawCredit'), player: playerId, amount }),
  z.object({ type: z.literal('RepayCredit'), player: playerId, amount }),
  z.object({
    type: z.literal('SettleLiquidationLot'),
    player: playerId,
    deed: deedId,
    bids: z.array(z.object({ player: playerId, amount })),
  }),
  z.object({ type: z.literal('RepayDistressedDebt'), player: playerId, amount }),
  z.object({
    type: z.literal('OriginatePeerLoan'),
    lender: playerId,
    borrower: playerId,
    principal: amount,
    ratePerRound: z.number().min(0).max(1),
    termRounds: z.number().int().positive(),
    collateral: z.array(deedId),
  }),
  z.object({ type: z.literal('RepayPeerLoan'), player: playerId, id: contractId, amount }),
  z.object({
    type: z.literal('SellPeerLoanNote'),
    player: playerId, id: contractId, to: playerId, price: amount,
  }),
] as const

/** Rent futures and deed options. */
const marketsCommands = [
  z.object({
    type: z.literal('OriginateRentFuture'),
    player: playerId, deed: deedId, holder: playerId,
    startRound: round, endRound: round, price: amount,
  }),
  z.object({
    type: z.literal('SellRentFuture'),
    player: playerId, contract: contractId, to: playerId, price: amount,
  }),
  z.object({
    type: z.literal('WriteDeedOption'),
    player: playerId, deed: deedId, holder: playerId,
    premium: amount, strike: amount, expiry: round,
  }),
  z.object({
    type: z.literal('SellDeedOption'),
    player: playerId, contract: contractId, to: playerId, price: amount,
  }),
  z.object({ type: z.literal('ExerciseDeedOption'), player: playerId, contract: contractId }),
] as const

/** Pools, tranches, swaps. */
const securitizationCommands = [
  z.object({
    type: z.literal('CreatePool'),
    player: playerId,
    poolId: contractId.optional(),
    assets: z.array(poolAssetRef),
    seniorFace: amount,
    mezzanineFace: amount,
  }),
  z.object({
    type: z.literal('SellTranche'),
    player: playerId, poolId: contractId, tranche: trancheKind, to: playerId, price: amount,
  }),
  z.object({
    type: z.literal('WriteSwap'),
    swapId: contractId.optional(),
    buyer: playerId,
    seller: playerId,
    reference: swapReference,
    notional: amount,
    premiumPerRound: amount,
  }),
] as const

/** Ventures, laundering, heat, audits. */
const underworldCommands = [
  z.object({
    type: z.literal('LaunchVenture'),
    player: playerId,
    venture: z.enum(['escort', 'numbers', 'chop-shop']),
    fundedFrom: funding,
  }),
  z.object({ type: z.literal('PlaySpeakeasy'), player: playerId, dice, fundedFrom: funding }),
  z.object({ type: z.literal('LaunderCash'), player: playerId, amount }),
  z.object({ type: z.literal('Bribe'), player: playerId, effect: briberyEffect }),
  z.object({ type: z.literal('InsiderTrade'), player: playerId, fundedFrom: funding }),
  z.object({ type: z.literal('RunAuditChecks'), dice: auditDice }),
] as const

/** Era decks. */
const deckCommands = [
  z.object({ type: z.literal('ShuffleDeck'), era, order: z.array(z.number().int().nonnegative()) }),
  z.object({ type: z.literal('DrawCard'), era, player: playerId }),
  z.object({
    type: z.literal('ReorderDeck'),
    era, player: playerId, order: z.array(z.number().int().nonnegative()),
  }),
] as const

export const wireCommandSchema = z.discriminatedUnion('type', [
  ...sessionCommands,
  ...propertyCommands,
  ...creditCommands,
  ...marketsCommands,
  ...securitizationCommands,
  ...underworldCommands,
  ...deckCommands,
])

export type WireCommand = z.infer<typeof wireCommandSchema>
export type WireCommandType = WireCommand['type']

export const undoSchema = z.object({
  /** The log length to rewind to. Absent means "one command", resolved by the room. */
  toLength: z.number().int().nonnegative().optional(),
})

export const createGameSchema = z.object({
  label: z.string().min(1).max(80).default('LEVERAGE'),
  unlockMode: z.enum(['progressive', 'all']).default('progressive'),
  winCondition: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('fixed-rounds') }),
      z.object({ kind: z.literal('net-worth-target'), target: amount }),
    ])
    .default({ kind: 'fixed-rounds' }),
})

export type CreateGameBody = z.infer<typeof createGameSchema>
