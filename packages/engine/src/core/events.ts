import type {
  ContractId, DeedId, DiceRoll, Era, Money,
  PlayerId, Phase, RoundNumber, SquareIndex,
} from './types.js'
import type { GameConfig, PoolAssetRef, SwapReference, Tranche } from './state.js'

/**
 * Every obligation the universal waterfall in spec 19.8 can capitalise.
 * A closed union so the reducer can dispatch and the facilitator can read
 * why a drawn balance moved.
 */
export type ObligationKind =
  | 'rent' | 'tax' | 'jail-fee' | 'interest' | 'carrying-cost'
  | 'audit-fine' | 'cds-premium' | 'peer-loan-interest'
  /** A CDS payout the seller's clean cash could not fully cover (Task 17). Spec 19.8
   * lists CDS premiums among the obligation waterfall's obligations; the notional
   * payout on a triggered swap is a player-to-player obligation of the identical
   * shape (pay in full, capitalise any shortfall), so it gets its own kind rather
   * than overloading 'cds-premium' with a different event. */
  | 'cds-payout'
  /** Task 20. The shortfall on an automatic make-whole payment the payer's clean
   * cash could not fully cover: a rent-future holder made whole on a mortgage
   * (spec section 6), or a pool originator funding a waterfall distribution out of
   * their own cash (spec 19.8). Both were wrongly routed through the terminal
   * `DistressedDebtIncurred` event, which spec 19.7 reserves for an uncured margin
   * call whose forced liquidation has exhausted the portfolio — neither site is
   * that terminal state, so both capitalise instead, like every other obligation. */
  | 'make-whole'

/** Typed so the reducer never parses a display string. */
export type BriberyEffect =
  | { readonly kind: 'force-reroll'; readonly target: PlayerId }
  | { readonly kind: 'cancel-card' }
  | { readonly kind: 'delay-margin-call' }

export type GameEvent =
  // --- session ---
  | { type: 'GameCreated'; config: GameConfig }
  | { type: 'PhaseAdvanced'; phase: Phase }
  | { type: 'RoundAdvanced'; round: RoundNumber }
  | { type: 'EraAdvanced'; era: Era }
  | { type: 'GameScored'; netWorths: Readonly<Record<PlayerId, Money>> }

  // --- draft ---
  | { type: 'DraftSubmitted'; player: PlayerId; ranked: readonly DeedId[]; maxBid: Money }
  | { type: 'DraftDeedAwarded'; player: PlayerId; deed: DeedId; price: Money; contested: boolean }
  | { type: 'DraftRoundResolved'; round: RoundNumber }

  // --- movement ---
  | { type: 'DiceRolled'; player: PlayerId; dice: DiceRoll }
  | { type: 'TokenMoved'; player: PlayerId; from: SquareIndex; to: SquareIndex; passedGo: boolean }
  | { type: 'SentToJail'; player: PlayerId; reason: 'square' | 'triple-doubles' | 'card' }
  | { type: 'JailExited'; player: PlayerId; fee: Money }

  // --- money movement ---
  | { type: 'RentCharged'; from: PlayerId; to: PlayerId; deed: DeedId; amount: Money }
  | { type: 'RentRoutedToFuture'; contract: ContractId; holder: PlayerId; amount: Money }
  | { type: 'SalaryPaid'; player: PlayerId; amount: Money }
  | { type: 'TaxPaid'; player: PlayerId; amount: Money; kind: 'income' | 'luxury' }
  | { type: 'CarryingCostCharged'; player: PlayerId; deeds: number; amount: Money }

  // --- property ---
  | { type: 'HouseBuilt'; player: PlayerId; deed: DeedId; cost: Money }
  | { type: 'HouseSold'; player: PlayerId; deed: DeedId; proceeds: Money }
  | { type: 'DeedMortgaged'; player: PlayerId; deed: DeedId; proceeds: Money }
  | { type: 'DeedUnmortgaged'; player: PlayerId; deed: DeedId; cost: Money }
  | { type: 'DeedTraded'; from: PlayerId; to: PlayerId; deeds: readonly DeedId[]; cash: Money }

  // --- credit ---
  | { type: 'CreditDrawn'; player: PlayerId; amount: Money }
  | { type: 'CreditRepaid'; player: PlayerId; amount: Money }
  | { type: 'InterestAccrued'; player: PlayerId; amount: Money; rate: number }
  | { type: 'StimulusAdvanced'; player: PlayerId; amount: Money }
  | { type: 'ObligationCapitalised'; player: PlayerId; amount: Money
      obligation: ObligationKind }
  | { type: 'MarginCallFlagged'; player: PlayerId; shortfall: Money }
  | { type: 'MarginCallCured'; player: PlayerId }
  | { type: 'DeedLiquidated'; player: PlayerId; deed: DeedId; buyer: PlayerId | 'bank'; price: Money }
  | { type: 'DistressedDebtIncurred'; player: PlayerId; amount: Money }
  | { type: 'DistressedDebtAccrued'; player: PlayerId; amount: Money }
  | { type: 'DistressedDebtRepaid'; player: PlayerId; amount: Money }
  /** Drawn credit that liquidation could not clear, converted to distressed debt. */
  | { type: 'CreditWrittenDown'; player: PlayerId; amount: Money }
  /** Spec section 5. Colour group stripped to bare land before a lot is auctioned. */
  | { type: 'BuildingsStripped'; player: PlayerId; deeds: readonly DeedId[]; proceeds: Money }
  /** Spec 19.12. Liquidation cancels the contract and the debtor owes the holder. */
  | { type: 'EncumbranceExtinguished'; player: PlayerId; deed: DeedId; contract: ContractId
      kind: 'rent-future' | 'deed-option'; holder: PlayerId; amount: Money }

  // --- peer loans ---
  | { type: 'PeerLoanOriginated'; id: ContractId; lender: PlayerId; borrower: PlayerId
      principal: Money; ratePerRound: number; maturesAtRound: RoundNumber
      collateral: readonly DeedId[] }
  | { type: 'PeerLoanInterestPaid'; id: ContractId; amount: Money }
  | { type: 'PeerLoanRepaid'; id: ContractId; amount: Money }
  | { type: 'PeerLoanDefaulted'; id: ContractId; collateralTo: PlayerId; writtenOff: Money }
  | { type: 'PeerLoanSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }

  // --- markets ---
  | { type: 'RentFutureOriginated'; id: ContractId; deed: DeedId; holder: PlayerId
      startRound: RoundNumber; endRound: RoundNumber; price: Money }
  | { type: 'RentFutureSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
  | { type: 'RentFutureMadeWhole'; id: ContractId; amount: Money }
  | { type: 'RentFutureExpired'; id: ContractId }
  | { type: 'DeedOptionWritten'; id: ContractId; deed: DeedId; writer: PlayerId
      holder: PlayerId; premium: Money; strike: Money; expiry: RoundNumber }
  | { type: 'DeedOptionSold'; id: ContractId; from: PlayerId; to: PlayerId; price: Money }
  | { type: 'DeedOptionExercised'; id: ContractId; strikePaid: Money }
  | { type: 'DeedOptionExpired'; id: ContractId }

  // --- securitization ---
  | { type: 'PoolCreated'; id: ContractId; originator: PlayerId
      assets: readonly PoolAssetRef[]; tranches: readonly Tranche[] }
  | { type: 'TrancheSold'; poolId: ContractId; tranche: Tranche['kind']
      from: PlayerId; to: PlayerId; price: Money }
  | { type: 'WaterfallPaid'; poolId: ContractId; collected: Money
      distributions: readonly { tranche: Tranche['kind']; amount: Money }[] }
  | { type: 'PoolCollateralLiquidated'; poolId: ContractId; loanId: ContractId
      deeds: readonly DeedId[]; proceeds: Money }
  | { type: 'PoolTerminated'; poolId: ContractId
      shortfalls: readonly { tranche: Tranche['kind']; shortfall: Money }[] }
  | { type: 'SwapWritten'; id: ContractId; buyer: PlayerId; seller: PlayerId
      reference: SwapReference; notional: Money; premiumPerRound: Money }
  | { type: 'SwapPremiumPaid'; id: ContractId; amount: Money }
  | { type: 'SwapTriggered'; id: ContractId; payout: Money }
  | { type: 'SwapExpired'; id: ContractId }

  // --- underworld ---
  | { type: 'VentureLaunched'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      cost: Money; rounds: number; fundedFrom: 'clean' | 'dirty' }
  | { type: 'VentureTicked'; player: PlayerId; venture: 'escort' | 'numbers' | 'chop-shop'
      roundsRemaining: number }
  | { type: 'SpeakeasyPlayed'; player: PlayerId; dice: DiceRoll; payout: Money
      fundedFrom: 'clean' | 'dirty' }
  | { type: 'DirtyCashEarned'; player: PlayerId; amount: Money
      source: 'escort' | 'numbers' | 'chop-shop' | 'speakeasy' }
  | { type: 'CashLaundered'; player: PlayerId; dirtyIn: Money; cleanOut: Money; haircut: number }
  | { type: 'HeatChanged'; player: PlayerId; delta: number; reason: string }
  | { type: 'AuditChecked'; player: PlayerId; dice: DiceRoll; heat: number; audited: boolean }
  | { type: 'AuditResolved'; player: PlayerId; seized: Money; fine: Money
      paidFromCash: Money; capitalised: Money }
  | { type: 'BriberyUsed'; player: PlayerId; cost: Money; effect: BriberyEffect }
  | { type: 'InsiderTradingUsed'; player: PlayerId; cost: Money
      fundedFrom: 'clean' | 'dirty' }

  // --- decks ---
  | { type: 'DeckShuffled'; era: Era; order: readonly number[] }
  | { type: 'CardDrawn'; era: Era; index: number; player: PlayerId }
  /** E3-05's private reveal-and-reorder. A deliberate player choice, not randomness —
   * see STOCHASTIC_EVENTS below, which deliberately excludes it. */
  | { type: 'DeckReordered'; era: Era; order: readonly number[]; player: PlayerId }

export type EventType = GameEvent['type']

/** Every event carrying externally-sourced randomness. Used by the determinism test. */
export const STOCHASTIC_EVENTS: readonly EventType[] = [
  'DiceRolled', 'AuditChecked', 'SpeakeasyPlayed', 'DeckShuffled',
] as const
