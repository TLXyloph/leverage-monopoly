import type { ContractId, Money, PlayerId } from '../../core/types.js'
import type { GameState, Pool, PoolAssetRef, SwapReference, Tranche } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { reject, type Rejection } from '../../core/errors.js'
import { isWholeDollars } from '../../core/money.js'
import { creditHeadroom, findPeerLoan } from '../credit/index.js'
import { assetKey, expectedPoolCashflow, findPool, pooledAssetKeys, trancheOf } from './selectors.js'
import { referenceFace, requiredCollateral } from './swaps.js'

/** Contract ids are supplied by the caller; the engine generates nothing random. */
export interface CreatePoolCommand {
  readonly type: 'CreatePool'
  readonly player: PlayerId
  readonly poolId: ContractId
  readonly assets: readonly PoolAssetRef[]
  readonly seniorFace: Money
  readonly mezzanineFace: Money
}

export interface SellTrancheCommand {
  readonly type: 'SellTranche'
  readonly player: PlayerId
  readonly poolId: ContractId
  readonly tranche: Tranche['kind']
  readonly to: PlayerId
  readonly price: Money
}

export interface WriteSwapCommand {
  readonly type: 'WriteSwap'
  readonly swapId: ContractId
  readonly buyer: PlayerId
  readonly seller: PlayerId
  readonly reference: SwapReference
  readonly notional: Money
  readonly premiumPerRound: Money
}

export type SecuritizationCommand = CreatePoolCommand | SellTrancheCommand | WriteSwapCommand

/**
 * Spec section 2: CDOs and CDS both unlock in Era III. Inlined against
 * `ECONOMY.UNLOCK_ERA` rather than through `session`'s `isUnlocked` — spec section 14's
 * dependency table lists `securitization`'s allowed dependencies as exactly `credit`
 * and `markets`, not `session` — the same resolution `credit/decide-loans.ts` and
 * `markets/decide.ts` take for their own instruments.
 */
function locked(state: GameState, instrument: 'cdo' | 'cds'): boolean {
  return state.config.unlockMode !== 'all' && state.era < ECONOMY.UNLOCK_ERA[instrument]
}

function ownsAsset(state: GameState, player: PlayerId, ref: PoolAssetRef): boolean {
  if (ref.kind === 'peer-loan') {
    const loan = findPeerLoan(state, ref.id)
    return loan !== undefined && loan.lender === player && loan.status === 'active'
  }
  if (ref.kind === 'rent-future') {
    return state.futures.find((f) => f.id === ref.id)?.holder === player
  }
  return state.options.find((o) => o.id === ref.id)?.holder === player
}

function decideCreatePool(
  state: GameState, cmd: CreatePoolCommand,
): readonly GameEvent[] | Rejection {
  if (locked(state, 'cdo')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', `CDO pools unlock in Era ${ECONOMY.UNLOCK_ERA.cdo}.`)
  }
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Pools can only be built during an Open phase.')
  }
  if (findPool(state, cmd.poolId) !== undefined) {
    return reject('DUPLICATE_CONTRACT_ID', 'A pool with this id already exists.')
  }
  if (cmd.assets.length < 3) {
    return reject('POOL_NEEDS_THREE_ASSETS', 'A pool needs at least three assets.')
  }
  for (const ref of cmd.assets) {
    if (!ownsAsset(state, cmd.player, ref)) {
      return reject('NOT_ASSET_OWNER', 'You can only pool assets you own.')
    }
  }
  const alreadyPooled = pooledAssetKeys(state)
  for (const ref of cmd.assets) {
    if (alreadyPooled.has(assetKey(ref))) {
      return reject('ASSET_ALREADY_POOLED', 'That asset is already inside a live pool.')
    }
  }
  if (
    !isWholeDollars(cmd.seniorFace) || cmd.seniorFace < 0
    || !isWholeDollars(cmd.mezzanineFace) || cmd.mezzanineFace < 0
  ) {
    return reject('NEGATIVE_AMOUNT', 'Tranche face amounts must be whole, non-negative dollars.')
  }

  // The cashflow check needs a provisional pool record — `expectedPoolCashflow` reads
  // only `pool.assets`, so the not-yet-decided tranches are irrelevant to it.
  const provisional: Pool = {
    id: cmd.poolId, originator: cmd.player, assets: cmd.assets, tranches: [], terminated: false,
  }
  const cashflow = expectedPoolCashflow(state, provisional)
  if (cmd.seniorFace + cmd.mezzanineFace > cashflow) {
    return reject(
      'TRANCHES_EXCEED_POOL',
      `Senior and mezzanine together cannot exceed the pool's expected cashflow of $${cashflow}.`,
    )
  }

  // Spec 19.3: equity has no face amount of its own, so the engine stores its residual
  // claim as `face`. It is a claim marker for the coverage formula and for CDS
  // notional, never a cap: equity keeps taking the residual for the life of the pool
  // and never retires (see `selectors.ts`'s `isRetired`).
  const tranches: readonly Tranche[] = [
    { kind: 'senior', face: cmd.seniorFace, paid: 0, holder: cmd.player },
    { kind: 'mezzanine', face: cmd.mezzanineFace, paid: 0, holder: cmd.player },
    { kind: 'equity', face: cashflow - cmd.seniorFace - cmd.mezzanineFace, paid: 0, holder: cmd.player },
  ]
  return [{
    type: 'PoolCreated', id: cmd.poolId, originator: cmd.player, assets: cmd.assets, tranches,
  }]
}

function decideSellTranche(
  state: GameState, cmd: SellTrancheCommand,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Tranches can only be sold during an Open phase.')
  }
  const pool = findPool(state, cmd.poolId)
  if (pool === undefined) return reject('CONTRACT_NOT_FOUND', 'No such pool.')
  if (pool.terminated) return reject('CONTRACT_NOT_FOUND', 'That pool has already terminated.')
  const t = trancheOf(pool, cmd.tranche)
  if (t === undefined) return reject('CONTRACT_NOT_FOUND', 'That pool has no such tranche.')
  if (t.holder !== cmd.player) return reject('NOT_OWNER', 'You do not hold that tranche.')
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'You cannot sell a tranche to yourself.')
  }
  if (!isWholeDollars(cmd.price) || cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'A price must be a whole, non-negative number of dollars.')
  }
  if (state.players[cmd.to].cleanCash < cmd.price) {
    return reject('INSUFFICIENT_CLEAN_CASH', 'The buyer cannot cover that price.')
  }
  return [{
    type: 'TrancheSold', poolId: pool.id, tranche: cmd.tranche, from: cmd.player, to: cmd.to, price: cmd.price,
  }]
}

/**
 * Spec section 8: naked CDS is legal by design — the buyer is deliberately never
 * checked for ownership of, or exposure to, the reference obligation.
 */
function decideWriteSwap(
  state: GameState, cmd: WriteSwapCommand,
): readonly GameEvent[] | Rejection {
  if (locked(state, 'cds')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', `Credit default swaps unlock in Era ${ECONOMY.UNLOCK_ERA.cds}.`)
  }
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Swaps can only be written during an Open phase.')
  }
  if (cmd.buyer === cmd.seller) {
    return reject('SELF_DEALING', 'You cannot buy protection from yourself.')
  }
  if (state.swaps.some((s) => s.id === cmd.swapId)) {
    return reject('DUPLICATE_CONTRACT_ID', 'A swap with this id already exists.')
  }
  const face = referenceFace(state, cmd.reference)
  if (face === null) {
    return reject('CONTRACT_NOT_FOUND', 'That reference obligation does not exist or has settled.')
  }
  if (!isWholeDollars(cmd.notional) || cmd.notional <= 0) {
    return reject('NEGATIVE_AMOUNT', 'Notional must be a positive, whole number of dollars.')
  }
  if (cmd.notional > face) {
    return reject(
      'SWAP_NOTIONAL_EXCEEDS_FACE',
      `Notional is capped at the reference obligation's face value of $${face}.`,
    )
  }
  if (!isWholeDollars(cmd.premiumPerRound) || cmd.premiumPerRound < 0) {
    return reject('NEGATIVE_AMOUNT', 'Premium must be a non-negative, whole number of dollars.')
  }
  const collateral = requiredCollateral(cmd.notional)
  if (creditHeadroom(state, cmd.seller) < collateral) {
    return reject(
      'INSUFFICIENT_BORROWING_BASE',
      `Writing this swap requires $${collateral} of unused borrowing base.`,
    )
  }
  return [{
    type: 'SwapWritten', id: cmd.swapId, buyer: cmd.buyer, seller: cmd.seller,
    reference: cmd.reference, notional: cmd.notional, premiumPerRound: cmd.premiumPerRound,
  }]
}

export function decideSecuritization(
  state: GameState, command: SecuritizationCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'CreatePool': return decideCreatePool(state, command)
    case 'SellTranche': return decideSellTranche(state, command)
    case 'WriteSwap': return decideWriteSwap(state, command)
  }
}
