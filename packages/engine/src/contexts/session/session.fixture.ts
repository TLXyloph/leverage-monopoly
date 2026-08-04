import type {
  DeedOption, DeedState, GameConfig, GameState, PeerLoan, PlayerState,
  Pool, RentFuture, Swap, Tranche,
} from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'

/**
 * Shared builder for Task 19's three suites (`marks.test.ts`, `scoring.test.ts`,
 * `settlement.test.ts`). Follows the in-context `*.fixture.ts` convention already used
 * by every other context (`credit/fixture.ts`, `markets/fixture.ts`,
 * `securitization/fixture.ts`, `underworld/underworld.fixture.ts`,
 * `board/property.fixture.ts`) rather than a top-level `tests/fixtures/` directory,
 * which does not exist anywhere in this repo.
 */
export const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'all',
  winCondition: { kind: 'fixed-rounds' },
}

export function player(id: PlayerId, patch: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    cleanCash: 0,
    dirtyCash: 0,
    heat: 0,
    position: 0,
    inJail: false,
    consecutiveDoubles: 0,
    drawnCredit: 0,
    distressedDebt: 0,
    creditImpaired: false,
    ventures: [],
    marginCallFlaggedAt: null,
    launderedThisPhase: false,
    briberyUsedThisRound: false,
    dirtyActionThisRound: false,
    insiderRevealedThisRound: false,
    rerollForced: false,
    cardCancelled: false,
    ...patch,
  }
}

export function deed(id: DeedId, patch: Partial<DeedState> = {}): DeedState {
  return {
    id,
    square: 1,
    group: 'orange',
    faceValue: 200,
    houseCost: 100,
    rentTable: [16, 80, 220, 600, 800, 1000],
    owner: null,
    mortgaged: false,
    houses: 0,
    ...patch,
  }
}

const EMPTY_DECK = { order: [], drawn: 0 }

const zeroByPlayer = (): Record<PlayerId, number> =>
  Object.fromEntries(PLAYER_IDS.map((p) => [p, 0])) as Record<PlayerId, number>

const EMPTY_CARD_EFFECTS = {
  modifiers: [],
  entitlements: [],
  poolInjections: {},
  scheduledPoolTerminations: [],
  counters: {
    rentReceivedThisGame: zeroByPlayer(),
    rentReceivedThisEra: zeroByPlayer(),
    dirtyActionsThisGame: zeroByPlayer(),
    launderCountThisGame: zeroByPlayer(),
  },
  seq: 0,
}

export function scoringState(patch: Partial<GameState> = {}): GameState {
  const players = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, player(id)]),
  ) as Record<PlayerId, PlayerState>
  return {
    config: CONFIG,
    phase: 'settlement',
    round: 24,
    era: 4,
    activePlayer: null,
    players,
    deeds: {},
    treasury: 0,
    housesRemaining: ECONOMY.HOUSE_SUPPLY,
    hotelsRemaining: ECONOMY.HOTEL_SUPPLY,
    draft: null,
    futures: [],
    options: [],
    loans: [],
    pools: [],
    swaps: [],
    decks: { 1: EMPTY_DECK, 2: EMPTY_DECK, 3: EMPTY_DECK, 4: EMPTY_DECK },
    cardEffects: EMPTY_CARD_EFFECTS,
    finalScores: null,
    ...patch,
  }
}

export function loan(patch: Partial<PeerLoan> = {}): PeerLoan {
  return {
    id: 'l-1', lender: 'P1', borrower: 'P2', principal: 500, outstanding: 500,
    ratePerRound: 0.1, maturesAtRound: 24, collateral: [], status: 'active', ...patch,
  }
}

export function future(patch: Partial<RentFuture> = {}): RentFuture {
  return { id: 'f-1', deed: 'd-1', holder: 'P1', startRound: 1, endRound: 24, ...patch }
}

export function option(patch: Partial<DeedOption> = {}): DeedOption {
  return {
    id: 'o-1', deed: 'd-1', writer: 'P2', holder: 'P1',
    premium: 0, strike: 120, expiry: 24, ...patch,
  }
}

export function tranche(kind: Tranche['kind'], patch: Partial<Tranche> = {}): Tranche {
  const face: Money = kind === 'senior' ? 600 : kind === 'mezzanine' ? 400 : 0
  return { kind, face, paid: 0, holder: 'P1', ...patch }
}

export function pool(patch: Partial<Pool> = {}): Pool {
  return {
    id: 'pool-1', originator: 'P1', assets: [],
    tranches: [tranche('senior'), tranche('mezzanine'), tranche('equity')],
    terminated: false, ...patch,
  }
}

export function swap(patch: Partial<Swap> = {}): Swap {
  return {
    id: 's-1', buyer: 'P3', seller: 'P4',
    reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
    notional: 400, premiumPerRound: 20, status: 'active', ...patch,
  }
}
