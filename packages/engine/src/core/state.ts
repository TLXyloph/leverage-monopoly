import type {
  ColorGroup, ContractId, DeedId, Era, Money,
  PlayerId, Phase, RoundNumber, SquareIndex,
} from './types.js'
import type { CardEffectsState } from '../contexts/decks/index.js'

export interface GameConfig {
  readonly turnOrder: readonly PlayerId[]
  readonly unlockMode: 'progressive' | 'all'
  readonly winCondition:
    | { readonly kind: 'fixed-rounds' }
    | { readonly kind: 'net-worth-target'; readonly target: Money }
}

export interface ActiveVenture {
  readonly kind: 'escort' | 'numbers' | 'chop-shop'
  readonly roundsRemaining: number
}

export interface PlayerState {
  readonly id: PlayerId
  readonly cleanCash: Money
  readonly dirtyCash: Money
  readonly heat: number
  readonly position: SquareIndex
  readonly inJail: boolean
  /** 0-2. A third consecutive double sends the player to Jail. Cannot be derived — the reducer has no log access. */
  readonly consecutiveDoubles: number
  readonly drawnCredit: Money
  readonly distressedDebt: Money
  /** Set permanently after defaulting on a peer loan. Halves borrowing base. */
  readonly creditImpaired: boolean
  readonly ventures: readonly ActiveVenture[]
  /** Round in which a margin call was flagged, or null if the player is clear. */
  readonly marginCallFlaggedAt: RoundNumber | null
  readonly launderedThisPhase: boolean
  readonly briberyUsedThisRound: boolean
  /**
   * True once the player takes a DELIBERATE dirty action this round. Set by the
   * reducer on any HeatChanged with a positive delta, which is exactly the set of
   * deliberate actions — so per spec 19.13 an automatic venture payout cannot
   * block Heat decay by construction.
   */
  readonly dirtyActionThisRound: boolean
  readonly insiderRevealedThisRound: boolean
  /** Set by a force-reroll bribe, consumed by the board context. */
  readonly rerollForced: boolean
  /** Set by a cancel-card bribe, consumed by the decks context. */
  readonly cardCancelled: boolean
}

export interface DeedState {
  readonly id: DeedId
  readonly square: SquareIndex
  readonly group: ColorGroup
  readonly faceValue: Money
  readonly houseCost: Money
  /** [unimproved, 1 house, 2, 3, 4, hotel]. Railroads and utilities use their own rules. */
  readonly rentTable: readonly Money[]
  readonly owner: PlayerId | 'bank' | null
  readonly mortgaged: boolean
  /** 0-4 houses, 5 represents a hotel. */
  readonly houses: number
}

export interface RentFuture {
  readonly id: ContractId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly startRound: RoundNumber
  readonly endRound: RoundNumber
}

export interface DeedOption {
  readonly id: ContractId
  readonly deed: DeedId
  readonly writer: PlayerId
  readonly holder: PlayerId
  /** Paid at origination. Refunded to the holder if the deed is force-liquidated. */
  readonly premium: Money
  readonly strike: Money
  readonly expiry: RoundNumber
}

export interface PeerLoan {
  readonly id: ContractId
  readonly lender: PlayerId
  readonly borrower: PlayerId
  readonly principal: Money
  readonly outstanding: Money
  readonly ratePerRound: number
  readonly maturesAtRound: RoundNumber
  readonly collateral: readonly DeedId[]
  readonly status: 'active' | 'repaid' | 'defaulted'
}

export type PoolAssetRef =
  | { readonly kind: 'peer-loan'; readonly id: ContractId }
  | { readonly kind: 'rent-future'; readonly id: ContractId }
  | { readonly kind: 'deed-option'; readonly id: ContractId }

export interface Tranche {
  readonly kind: 'senior' | 'mezzanine' | 'equity'
  readonly face: Money
  readonly paid: Money
  readonly holder: PlayerId
}

export interface Pool {
  readonly id: ContractId
  readonly originator: PlayerId
  readonly assets: readonly PoolAssetRef[]
  readonly tranches: readonly Tranche[]
  readonly terminated: boolean
}

export type SwapReference =
  | { readonly kind: 'peer-loan'; readonly id: ContractId }
  | { readonly kind: 'tranche'; readonly poolId: ContractId; readonly tranche: Tranche['kind'] }

export interface Swap {
  readonly id: ContractId
  readonly buyer: PlayerId
  readonly seller: PlayerId
  readonly reference: SwapReference
  readonly notional: Money
  readonly premiumPerRound: Money
  readonly status: 'active' | 'triggered' | 'expired'
}

export interface DraftSubmission {
  readonly player: PlayerId
  readonly ranked: readonly [DeedId, DeedId, DeedId]
  readonly maxBid: Money
}

export interface DraftState {
  readonly round: number
  readonly submissions: readonly DraftSubmission[]
  readonly complete: boolean
}

export interface DeckState {
  /** Shuffle order recorded as an event, so replay is exact. */
  readonly order: readonly number[]
  readonly drawn: number
}

export interface GameState {
  readonly config: GameConfig
  readonly phase: Phase
  readonly round: RoundNumber
  readonly era: Era
  readonly activePlayer: PlayerId | null
  readonly players: Readonly<Record<PlayerId, PlayerState>>
  readonly deeds: Readonly<Record<DeedId, DeedState>>
  readonly treasury: Money
  readonly housesRemaining: number
  readonly hotelsRemaining: number
  readonly draft: DraftState | null
  readonly futures: readonly RentFuture[]
  readonly options: readonly DeedOption[]
  readonly loans: readonly PeerLoan[]
  readonly pools: readonly Pool[]
  readonly swaps: readonly Swap[]
  readonly decks: Readonly<Record<Era, DeckState>>
  readonly cardEffects: CardEffectsState
}
