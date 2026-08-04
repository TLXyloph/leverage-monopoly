import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'
import type { DeedState, GameState, Pool, Swap } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { findPool } from './selectors.js'

function addCash(state: GameState, player: PlayerId, delta: Money): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [player]: { ...state.players[player], cleanCash: state.players[player].cleanCash + delta },
    },
  }
}

/** Clean cash never goes negative; a shortfall is emitted as a separate
 * DistressedDebtIncurred event and reconciled by `credit`'s own reducer. */
function subCash(state: GameState, player: PlayerId, amount: Money): GameState {
  const cash = state.players[player].cleanCash
  return addCash(state, player, -Math.min(cash, amount))
}

function withPool(state: GameState, id: string, patch: (p: Pool) => Pool): GameState {
  return { ...state, pools: state.pools.map((p) => (p.id === id ? patch(p) : p)) }
}

function withSwap(state: GameState, id: ContractId, patch: Partial<Swap>): GameState {
  return { ...state, swaps: state.swaps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
}

/**
 * A pure player-to-player transfer for a CDS leg: the payer's clean cash floors at
 * zero via `subCash`, but the recipient is always credited the FULL amount — any gap
 * is closed by a separately-emitted `ObligationCapitalised` event, reduced by `credit`
 * (Task 17's `swaps.ts` emits that pairing). Mirrors `board/reduce.ts`'s identically
 * shaped `transfer`, which `securitization` cannot import directly: the dependency
 * arrow runs securitization -> credit/markets, never -> board.
 */
function transfer(state: GameState, from: PlayerId, to: PlayerId, amount: Money): GameState {
  return addCash(subCash(state, from, amount), to, amount)
}

export function reduceSecuritization(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PoolCreated': {
      const pool: Pool = {
        id: event.id,
        originator: event.originator,
        assets: event.assets,
        tranches: event.tranches,
        terminated: false,
      }
      return { ...state, pools: [...state.pools, pool] }
    }

    case 'TrancheSold': {
      const next = withPool(state, event.poolId, (p) => ({
        ...p,
        tranches: p.tranches.map((t) => (t.kind === event.tranche ? { ...t, holder: event.to } : t)),
      }))
      return addCash(subCash(next, event.to, event.price), event.from, event.price)
    }

    case 'WaterfallPaid': {
      const pool = findPool(state, event.poolId)
      const withPaid = withPool(state, event.poolId, (p) => ({
        ...p,
        tranches: p.tranches.map((t) => {
          const d = event.distributions.find((x) => x.tranche === t.kind)
          return d === undefined ? t : { ...t, paid: t.paid + d.amount }
        }),
      }))
      if (pool === undefined) return withPaid
      // The originator holds the pool's assets in their own name, so the cash they
      // collected this round already sits in their clean cash by the time Settlement
      // step 6 runs (`PeerLoanRepaid`/`PeerLoanInterestPaid` are ordinary player-to-
      // player transfers, credited at step 5). The waterfall pays it straight back out
      // — there is no pool cash balance in `GameState`.
      let next = subCash(withPaid, pool.originator, event.collected)
      for (const d of event.distributions) {
        const holder = pool.tranches.find((t) => t.kind === d.tranche)?.holder
        if (holder !== undefined) next = addCash(next, holder, d.amount)
      }
      return next
    }

    case 'PoolCollateralLiquidated': {
      const deeds: Record<DeedId, DeedState> = { ...state.deeds }
      for (const id of event.deeds) {
        const d = deeds[id]
        if (d !== undefined) deeds[id] = { ...d, owner: 'bank' }
      }
      // Spec 19.4: this is a BANK PURCHASE of the collateral, not a player-to-player
      // transfer, so it debits the Treasury — following the precedent set by
      // `DeedLiquidated`'s bank-buyer branch in `contexts/credit/reduce.ts`. Without
      // this leg the proceeds credited to the originator below would be manufactured
      // money: the conservation identity is
      // sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury.
      const withDeedsAndTreasury: GameState = {
        ...state,
        deeds,
        treasury: state.treasury - event.proceeds,
      }
      const pool = findPool(state, event.poolId)
      return pool === undefined
        ? withDeedsAndTreasury
        : addCash(withDeedsAndTreasury, pool.originator, event.proceeds)
    }

    case 'PoolTerminated':
      return withPool(state, event.poolId, (p) => ({ ...p, terminated: true }))

    case 'SwapWritten': {
      const swap: Swap = {
        id: event.id, buyer: event.buyer, seller: event.seller, reference: event.reference,
        notional: event.notional, premiumPerRound: event.premiumPerRound, status: 'active',
      }
      return { ...state, swaps: [...state.swaps, swap] }
    }

    /** Settlement step 7, spec 19.1. Buyer to seller, in full. */
    case 'SwapPremiumPaid': {
      const s = state.swaps.find((x) => x.id === event.id)
      return s === undefined ? state : transfer(state, s.buyer, s.seller, event.amount)
    }

    /** A credit event. Seller to buyer, in full, and the swap is spent. */
    case 'SwapTriggered': {
      const s = state.swaps.find((x) => x.id === event.id)
      if (s === undefined) return state
      return withSwap(transfer(state, s.seller, s.buyer, event.payout), s.id, { status: 'triggered' })
    }

    /** The referenced tranche was paid in full by termination; no money moves. */
    case 'SwapExpired':
      return withSwap(state, event.id, { status: 'expired' })

    default:
      return state
  }
}
