import {
  decideBoardAction, decideCreditAction, decideDeck, decideDraft, decideMarkets,
  decidePropertyAction, decideSecuritization, decideSessionAction, decideUnderworld,
  type GameEvent, type GameState, type PlayerId, type Rejection,
} from '@leverage/engine'
import type { WireCommand } from './schema.js'

/**
 * The single command intake. Every path here goes through a `decide*Action` composition
 * root where one exists (`board`, `property`, `credit`, `session`) rather than the raw
 * context decider: the raw `decideCredit`/`decideProperty` default their `ports`
 * parameter to `NO_ENCUMBRANCES`, which silently returns $0 for a rent-future make-whole
 * and a deed-option refund. A server calling those directly would force-liquidate an
 * encumbered deed, pay the futures holder nothing, and raise no error. This was a
 * Critical finding in the engine's final review and it is the one trap this package can
 * still fall into, because the engine's lint rules do not reach here.
 *
 * `markets`, `securitization`, `underworld`, `decks` and `draft` take no ports, so their
 * context deciders ARE their composition roots.
 */

/**
 * Spec 19.1 step 6 needs "every event since this round's Market phase began". Derived
 * from the log rather than accepted from the client: a client that supplied its own
 * `roundEvents` could change what a pool waterfall distributes.
 *
 * Round 1 has no preceding `RoundAdvanced`, so the anchor is the Market phase itself,
 * which every round enters exactly once.
 */
export function roundEventsSince(log: readonly GameEvent[]): readonly GameEvent[] {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const event = log[i]
    if (event !== undefined && event.type === 'PhaseAdvanced' && event.phase === 'market') {
      return log.slice(i + 1)
    }
  }
  return log
}

/**
 * Contract ids are derived, never generated — the engine holds no randomness, so an
 * identity has to be a pure function of state. The count of existing pools (or swaps) is
 * monotonic within a game, so a derived id is unique for all time even after a
 * termination frees the underlying assets.
 */
export function derivePoolId(state: GameState, player: PlayerId): string {
  return `pool:${player}:${state.pools.length}`
}

export function deriveSwapId(state: GameState, buyer: PlayerId, seller: PlayerId): string {
  return `cds:${buyer}:${seller}:${state.swaps.length}`
}

/**
 * Who may submit a command from a player view. An empty list means facilitator-only:
 * the round clock, Settlement, the shuffle and the liquidation auction are the
 * facilitator's, and nothing a player can reach should be able to advance the game past
 * the other three.
 *
 * The admin can submit anything on anyone's behalf — spec section 14 puts the override
 * ON TOP of player self-service, not instead of it, because routing all four players
 * through one keyboard serializes the Open phase and blows the time budget.
 */
export function principals(command: WireCommand): readonly PlayerId[] {
  switch (command.type) {
    // `SettleLiquidationLot` sits with the clock and the shuffle because it is an
    // auction with bids from every player, which the facilitator runs exactly as they
    // run a standard Monopoly auction.
    case 'advance-phase':
    case 'settle':
    case 'resolve-draft-round':
    case 'RunAuditChecks':
    case 'ShuffleDeck':
    case 'SettleLiquidationLot':
      return []
    // Both sides of a two-party agreement may enter the agreed terms. Consent is not
    // implied by submission: `TradeAssets` carries its own `confirmedBy`, which the
    // engine checks.
    case 'TradeAssets':
      return [command.from, command.to]
    case 'OriginatePeerLoan':
      return [command.lender, command.borrower]
    case 'WriteSwap':
      return [command.buyer, command.seller]
    default:
      return [command.player]
  }
}

export function isPermitted(command: WireCommand, actor: PlayerId): boolean {
  return principals(command).includes(actor)
}

/* eslint-disable complexity -- a flat switch over the command union is the point: every
 * variant is visible in one place, and TypeScript's exhaustiveness check is what proves
 * no command silently falls through to a default that does nothing. */
export function dispatch(
  state: GameState,
  log: readonly GameEvent[],
  command: WireCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'advance-phase':
      return decideSessionAction(state, { type: 'advance-phase' })
    case 'settle':
      return decideSessionAction(state, {
        type: 'settle',
        input: { auditDice: command.auditDice, roundEvents: roundEventsSince(log) },
      })

    case 'submit-draft':
      return decideDraft(state, {
        type: 'submit-draft',
        player: command.player,
        ranked: command.ranked,
        maxBid: command.maxBid,
      })
    case 'resolve-draft-round':
      return decideDraft(state, { type: 'resolve-draft-round' })

    case 'roll-dice':
      return decideBoardAction(state, {
        type: 'roll-dice', player: command.player, dice: command.dice,
      })

    case 'BuildHouse':
    case 'SellHouse':
    case 'MortgageDeed':
    case 'UnmortgageDeed':
      return decidePropertyAction(state, {
        type: command.type, player: command.player, deed: command.deed,
      })
    case 'TradeAssets':
      return decidePropertyAction(state, command)

    case 'DrawCredit':
    case 'RepayCredit':
    case 'RepayDistressedDebt':
      return decideCreditAction(state, {
        type: command.type, player: command.player, amount: command.amount,
      })
    case 'SettleLiquidationLot':
    case 'OriginatePeerLoan':
    case 'RepayPeerLoan':
    case 'SellPeerLoanNote':
      return decideCreditAction(state, command)

    case 'OriginateRentFuture':
    case 'SellRentFuture':
    case 'WriteDeedOption':
    case 'SellDeedOption':
    case 'ExerciseDeedOption':
      return decideMarkets(state, command)

    case 'CreatePool':
      return decideSecuritization(state, {
        type: 'CreatePool',
        player: command.player,
        poolId: command.poolId ?? derivePoolId(state, command.player),
        assets: command.assets,
        seniorFace: command.seniorFace,
        mezzanineFace: command.mezzanineFace,
      })
    case 'SellTranche':
      return decideSecuritization(state, command)
    case 'WriteSwap':
      return decideSecuritization(state, {
        type: 'WriteSwap',
        swapId: command.swapId ?? deriveSwapId(state, command.buyer, command.seller),
        buyer: command.buyer,
        seller: command.seller,
        reference: command.reference,
        notional: command.notional,
        premiumPerRound: command.premiumPerRound,
      })

    case 'LaunchVenture':
    case 'PlaySpeakeasy':
    case 'LaunderCash':
    case 'Bribe':
    case 'InsiderTrade':
      return decideUnderworld(state, command)
    case 'RunAuditChecks':
      return decideUnderworld(state, { type: 'RunAuditChecks', dice: command.dice })

    case 'ShuffleDeck':
    case 'DrawCard':
    case 'ReorderDeck':
      return decideDeck(state, command)
  }
}
