import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type {
  DeedOption, DeedState, GameConfig, GameState, PeerLoan, PlayerState, Pool, RentFuture, Swap,
  Tranche,
} from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { initialState } from '../session/index.js'

/**
 * Test-support builders, deliberately not re-exported from `index.ts`. Mirrors
 * `contexts/credit/fixture.ts` and `contexts/markets/fixture.ts`: building on
 * `initialState` (Task 4) rather than hand-rolling `PlayerState`/`GameState` here is
 * what keeps this fixture from drifting out of sync as those shapes grow, and it means
 * every dollar figure in a test traces back to the real 28-deed board (Task 3).
 *
 * `unlockMode: 'all'` bypasses era gating for every test except the ones that
 * deliberately override it to prove `decideSecuritization` still enforces the gate.
 */
const CONFIG: GameConfig = {
  turnOrder: PLAYER_IDS,
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

export function gameState(patch: Partial<GameState> = {}): GameState {
  return { ...initialState(CONFIG), phase: 'open', round: 13, era: 3, ...patch }
}

export function withDeeds(state: GameState, deeds: readonly DeedState[]): GameState {
  const map: Record<DeedId, DeedState> = { ...state.deeds }
  for (const d of deeds) map[d.id] = d
  return { ...state, deeds: map }
}

export function withPlayers(
  state: GameState,
  patches: Partial<Record<PlayerId, Partial<PlayerState>>>,
): GameState {
  const players: Record<PlayerId, PlayerState> = { ...state.players }
  for (const id of PLAYER_IDS) {
    const patch = patches[id]
    if (patch !== undefined) players[id] = { ...players[id], ...patch }
  }
  return { ...state, players }
}

export function withLoans(state: GameState, loans: readonly PeerLoan[]): GameState {
  return { ...state, loans: [...state.loans, ...loans] }
}

export function withFutures(state: GameState, futures: readonly RentFuture[]): GameState {
  return { ...state, futures: [...state.futures, ...futures] }
}

export function withOptions(state: GameState, options: readonly DeedOption[]): GameState {
  return { ...state, options: [...state.options, ...options] }
}

export function withPools(state: GameState, pools: readonly Pool[]): GameState {
  return { ...state, pools: [...state.pools, ...pools] }
}

export function withSwaps(state: GameState, swaps: readonly Swap[]): GameState {
  return { ...state, swaps: [...state.swaps, ...swaps] }
}

export function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`expected events, got rejection ${result.code}`)
  return result
}

export function rejectionOf(result: readonly GameEvent[] | Rejection): Rejection {
  if (!isRejection(result)) throw new Error('expected a rejection, got events')
  return result
}

/**
 * A synthetic deed, deliberately not one of the real 28 from `config/board.ts`, so a
 * test can pin an exact round-number face value (St. James Place and Tennessee Avenue
 * both cost $180 on the real board, which is convenient for the spec 19.4 collateral
 * fixtures below, so those two use the real ids via `realDeed` instead).
 */
export function deed(id: DeedId, faceValue: Money, patch: Partial<DeedState> = {}): DeedState {
  return {
    id,
    square: 1,
    group: 'brown',
    faceValue,
    houseCost: 50,
    rentTable: [2, 10, 30, 90, 160, 250],
    owner: null,
    mortgaged: false,
    houses: 0,
    ...patch,
  }
}

const BASE = initialState(CONFIG)

/** The real board's deed record (Task 3), so LIQUIDATION_FLOOR fixtures exercise real
 * face values ($180 St. James/Tennessee, $400 Boardwalk) rather than synthetic ones. */
export function realDeed(id: DeedId, owner: PlayerId | 'bank' | null): DeedState {
  const d = BASE.deeds[id]
  if (d === undefined) throw new Error(`${id} is missing from the real board.`)
  return { ...d, owner }
}

/** A synthetic peer loan (Task 11), deliberately not derived via `peerLoanId`. */
export function loan(id: ContractId, patch: Partial<PeerLoan> = {}): PeerLoan {
  return {
    id,
    lender: 'P1',
    borrower: 'P2',
    principal: 500,
    outstanding: 500,
    ratePerRound: 0.1,
    maturesAtRound: 15,
    collateral: [],
    status: 'active',
    ...patch,
  }
}

/** A synthetic rent future (Tasks 14-15). */
export function future(id: ContractId, patch: Partial<RentFuture> = {}): RentFuture {
  return {
    id,
    deed: 'brown-1',
    holder: 'P1',
    startRound: 10,
    endRound: 15,
    ...patch,
  }
}

/** A synthetic deed option (Task 15). */
export function option(id: ContractId, patch: Partial<DeedOption> = {}): DeedOption {
  return {
    id,
    deed: 'brown-1',
    writer: 'P2',
    holder: 'P1',
    premium: 50,
    strike: 100,
    expiry: 18,
    ...patch,
  }
}

export function tranches(
  senior: Money, mezzanine: Money, equity: Money, holder: PlayerId = 'P1',
): readonly Tranche[] {
  return [
    { kind: 'senior', face: senior, paid: 0, holder },
    { kind: 'mezzanine', face: mezzanine, paid: 0, holder },
    { kind: 'equity', face: equity, paid: 0, holder },
  ]
}

/** A synthetic pool (Task 16), deliberately not derived via `decideSecuritization`. */
export function pool(id: ContractId, patch: Partial<Pool> = {}): Pool {
  return {
    id,
    originator: 'P1',
    assets: [
      { kind: 'peer-loan', id: 'l-1' },
      { kind: 'peer-loan', id: 'l-2' },
      { kind: 'peer-loan', id: 'l-3' },
    ],
    tranches: tranches(600, 500, 810),
    terminated: false,
    ...patch,
  }
}

/** A synthetic CDS (Task 17), deliberately not derived via `decideSecuritization`. */
export function swap(id: ContractId, patch: Partial<Swap> = {}): Swap {
  return {
    id,
    buyer: 'P3',
    seller: 'P4',
    reference: { kind: 'peer-loan', id: 'l-1' },
    notional: 400,
    premiumPerRound: 40,
    status: 'active',
    ...patch,
  }
}

/**
 * The conserved identity (spec section 20): sum(cleanCash) - sum(drawnCredit) -
 * sum(distressedDebt) + treasury. Mirrors the identically-named helper in
 * `credit`'s and `underworld`'s test suites.
 */
export function totalMoney(state: GameState): Money {
  return PLAYER_IDS.reduce(
    (sum, id) => {
      const p = state.players[id]
      return sum + p.cleanCash - p.drawnCredit - p.distressedDebt
    },
    state.treasury,
  )
}
