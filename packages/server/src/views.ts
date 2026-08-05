import {
  SETTLEMENT_STEPS, UNLOCK_ERA, isGameOver, markDeedOption, markLoanNote, markRentFuture,
  markTranche, netWorths, playersAwaitingLiquidation, prevailingRate, ratePool,
  roundsRemaining, standings, unlockedInstruments, valueRentFuture, winner,
  type ContractId, type Era, type FutureValuation, type GameEvent, type GameState,
  type Instrument, type Money, type PlayerId, type Standing, type TrancheRating,
} from '@leverage/engine'
import { allAssist, type PlayerAssist } from './assist.js'
import type { Role } from './auth.js'

/**
 * What every connected client receives. One payload shape for all three shells: the
 * server is authoritative, the client holds a mirror, and a reload rebuilds exact
 * current state from this (spec section 14's hard constraint).
 *
 * The whole state goes to everyone. LEVERAGE is played around a physical board where
 * cash, deeds and Heat are all visible, so there is no hidden information to protect and
 * a per-role projection would only create a class of bug where one shell renders a
 * number the others cannot see.
 *
 * The one genuinely private thing — the card an insider-trading buyer was shown — lives
 * behind `GET /api/game/:id/insider`, not in the broadcast.
 */

export interface ContractView {
  readonly id: ContractId
  readonly kind: 'rent-future' | 'deed-option' | 'peer-loan' | 'pool' | 'swap'
  readonly counterparties: readonly PlayerId[]
  readonly summary: string
  readonly mark: Money
}

export interface Derived {
  readonly standings: readonly Standing[]
  readonly netWorths: Readonly<Record<PlayerId, Money>>
  readonly unlocked: readonly Instrument[]
  /**
   * The era each instrument arrives in, straight from `ECONOMY.UNLOCK_ERA`. Carried in
   * the payload so the client can label a locked action ("era 3") without keeping a
   * second copy of the table — a duplicated gating table was a Critical finding during
   * engine development and took a whole fix round to consolidate.
   */
  readonly unlockEra: Readonly<Record<Instrument, Era>>
  readonly prevailingRate: number
  readonly roundsRemaining: number
  readonly gameOver: boolean
  readonly winner: PlayerId | null
  readonly awaitingLiquidation: readonly PlayerId[]
  readonly settlementSteps: readonly string[]
  readonly futureValuations: Readonly<Record<ContractId, FutureValuation>>
  readonly poolRatings: Readonly<Record<ContractId, readonly TrancheRating[]>>
  readonly contracts: readonly ContractView[]
}

export interface Sync {
  readonly type: 'sync'
  readonly gameId: string
  readonly label: string
  readonly role: Role
  /** Log length. A client can tell it missed nothing by watching this advance. */
  readonly length: number
  readonly state: GameState
  readonly derived: Derived
  readonly assist: Readonly<Record<PlayerId, PlayerAssist>>
}

function futureValuations(state: GameState): Readonly<Record<ContractId, FutureValuation>> {
  const out: Record<ContractId, FutureValuation> = {}
  for (const future of state.futures) {
    const valuation = valueRentFuture(state, future.id)
    if (valuation !== null) out[future.id] = valuation
  }
  return out
}

function poolRatings(state: GameState): Readonly<Record<ContractId, readonly TrancheRating[]>> {
  const out: Record<ContractId, readonly TrancheRating[]> = {}
  for (const pool of state.pools) {
    if (!pool.terminated) out[pool.id] = ratePool(state, pool)
  }
  return out
}

/** Every live contract, flattened into one list the table view can render as a ticker. */
function contracts(state: GameState): readonly ContractView[] {
  const out: ContractView[] = []
  for (const f of state.futures) {
    out.push({
      id: f.id, kind: 'rent-future', counterparties: [f.holder],
      summary: `${f.deed}, rounds ${f.startRound}-${f.endRound}`,
      mark: markRentFuture(state, f.id),
    })
  }
  for (const o of state.options) {
    out.push({
      id: o.id, kind: 'deed-option', counterparties: [o.writer, o.holder],
      summary: `${o.deed} at $${o.strike}, expires round ${o.expiry}`,
      mark: markDeedOption(state, o.id),
    })
  }
  for (const l of state.loans) {
    if (l.status !== 'active') continue
    out.push({
      id: l.id, kind: 'peer-loan', counterparties: [l.lender, l.borrower],
      summary: `$${l.outstanding} at ${(l.ratePerRound * 100).toFixed(1)}%/round, `
        + `matures round ${l.maturesAtRound}`,
      mark: markLoanNote(state, l),
    })
  }
  for (const p of state.pools) {
    if (p.terminated) continue
    out.push({
      id: p.id, kind: 'pool', counterparties: [p.originator, ...p.tranches.map((t) => t.holder)],
      summary: `${p.assets.length} assets, ${p.tranches.length} tranches`,
      mark: p.tranches.reduce((total, t) => total + markTranche(state, p, t.kind), 0),
    })
  }
  for (const s of state.swaps) {
    if (s.status !== 'active') continue
    out.push({
      id: s.id, kind: 'swap', counterparties: [s.buyer, s.seller],
      summary: `$${s.notional} notional on ${s.reference.kind}, `
        + `$${s.premiumPerRound}/round`,
      mark: s.notional,
    })
  }
  return out
}

export function derive(state: GameState): Derived {
  return {
    standings: standings(state),
    netWorths: netWorths(state),
    unlocked: unlockedInstruments(state),
    unlockEra: UNLOCK_ERA,
    prevailingRate: prevailingRate(state),
    roundsRemaining: roundsRemaining(state),
    gameOver: isGameOver(state),
    winner: winner(state),
    awaitingLiquidation: playersAwaitingLiquidation(state),
    settlementSteps: SETTLEMENT_STEPS,
    futureValuations: futureValuations(state),
    poolRatings: poolRatings(state),
    contracts: contracts(state),
  }
}

export function syncFor(
  gameId: string, label: string, role: Role, length: number, state: GameState,
): Sync {
  return {
    type: 'sync',
    gameId,
    label,
    role,
    length,
    state,
    derived: derive(state),
    assist: allAssist(state),
  }
}

/** The event log, for the admin console's history strip and the agent's read surface. */
export interface LogView {
  readonly length: number
  readonly events: readonly GameEvent[]
}
