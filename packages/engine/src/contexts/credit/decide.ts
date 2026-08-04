import { isWholeDollars } from '../../core/money.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { decidePeerLoan, type PeerLoanCommand } from './decide-loans.js'
import { reduceCredit } from './reduce.js'
import {
  creditHeadroom, groupBuildingStrip, isUnderMarginCall,
  liquidationPrice, liquidationQueue, playersAwaitingLiquidation,
} from './selectors.js'

/**
 * Functions owned by the `markets` context that liquidation (Task 10) needs (spec
 * 19.12). They are injected rather than imported because spec section 14 makes
 * `markets` depend on `credit`, so a direct import here would invert the context
 * dependency graph and cycle. The root decider, which may import both contexts,
 * supplies the real implementations. Declared now so `decideCredit`'s signature does
 * not change once liquidation lands.
 */
export interface CreditPorts {
  /** Remaining expected value of any rent future on this deed, or 0 if there is none. */
  readonly rentFutureMakeWhole: (state: GameState, deed: DeedId) => Money
  /** Premium to refund on any deed option on this deed, or 0 if there is none. */
  readonly deedOptionRefund: (state: GameState, deed: DeedId) => Money
}

/** Safe default for states that carry no futures or options. */
export const NO_ENCUMBRANCES: CreditPorts = {
  rentFutureMakeWhole: () => 0,
  deedOptionRefund: () => 0,
}

export type CreditCommand =
  | { readonly type: 'DrawCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'RepayCredit'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'SettleLiquidationLot'
      readonly player: PlayerId
      readonly deed: DeedId
      readonly bids: readonly { readonly player: PlayerId; readonly amount: Money }[] }
  | { readonly type: 'RepayDistressedDebt'; readonly player: PlayerId; readonly amount: Money }
  | PeerLoanCommand

/**
 * Spec 19.12. Liquidation extinguishes every encumbrance on the lot: the rent future
 * holder is made whole, the deed option holder gets their premium back, and both
 * amounts are added to the debtor's shortfall. The deed then reaches auction clean.
 *
 * There is deliberately NO transferability guard here. If an option lock blocked
 * liquidation, a distressed player could write a $1 option on all seven deeds and
 * become judgment-proof. If encumbrances instead followed the deed into the auction, a
 * player could write a $1-strike option to a confederate, be liquidated, collect the
 * bank's 80% floor and have the confederate exercise for a dollar. Extinguishing kills
 * both manoeuvres, which is why the rule exists.
 */
function extinguishmentEvents(
  state: GameState,
  player: PlayerId,
  deedId: DeedId,
  ports: CreditPorts,
): readonly GameEvent[] {
  const out: GameEvent[] = []
  const future = state.futures.find((f) => f.deed === deedId)
  if (future !== undefined) {
    out.push({
      type: 'EncumbranceExtinguished',
      player, deed: deedId, contract: future.id, kind: 'rent-future',
      holder: future.holder, amount: ports.rentFutureMakeWhole(state, deedId),
    })
  }
  const option = state.options.find((o) => o.deed === deedId)
  if (option !== undefined) {
    out.push({
      type: 'EncumbranceExtinguished',
      player, deed: deedId, contract: option.id, kind: 'deed-option',
      holder: option.holder, amount: ports.deedOptionRefund(state, deedId),
    })
  }
  return out
}

export function decideCredit(
  state: GameState,
  command: CreditCommand,
  ports: CreditPorts = NO_ENCUMBRANCES,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Financial actions are only available during the Open phase.')
  }

  switch (command.type) {
    case 'DrawCredit': {
      if (!isWholeDollars(command.amount) || command.amount <= 0) {
        return reject('INVALID_AMOUNT', 'Draw at least $1, in whole dollars.')
      }
      // Spec 19.8: voluntary draws are always capped at the borrowing base. This is
      // the asymmetric half of the waterfall — automatic obligations (settlement.ts)
      // capitalise past this same headroom without regard to it.
      const headroom = creditHeadroom(state, command.player)
      if (command.amount > headroom) {
        return reject(
          'INSUFFICIENT_BORROWING_BASE',
          `Your borrowing base allows at most $${Math.max(0, headroom)} more.`,
        )
      }
      return [{ type: 'CreditDrawn', player: command.player, amount: command.amount }]
    }

    case 'RepayCredit': {
      const p = state.players[command.player]
      if (!isWholeDollars(command.amount) || command.amount <= 0) {
        return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
      }
      if (command.amount > p.drawnCredit) {
        return reject('INVALID_AMOUNT', `You owe only $${p.drawnCredit} on your credit line.`)
      }
      if (command.amount > p.cleanCash) {
        return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${p.cleanCash} in clean cash.`)
      }
      return [{ type: 'CreditRepaid', player: command.player, amount: command.amount }]
    }

    case 'SettleLiquidationLot': {
      if (!playersAwaitingLiquidation(state).includes(command.player)) {
        return reject('NO_PENDING_LIQUIDATION', 'That player has no uncured margin call to resolve.')
      }
      const queue = liquidationQueue(state, command.player)
      if (queue[0] !== command.deed) {
        return reject(
          'WRONG_LIQUIDATION_LOT',
          `Lots are auctioned in descending face value. The next lot is ${String(queue[0])}.`,
        )
      }
      const lot = state.deeds[command.deed]
      if (lot === undefined) return reject('DEED_UNAVAILABLE', 'That deed is not on the board.')

      for (const bid of command.bids) {
        if (bid.player === command.player) {
          return reject('NOT_OWNER', 'The liquidating player may not bid on their own deeds.')
        }
        if (!isWholeDollars(bid.amount)) {
          return reject('INVALID_AMOUNT', 'Bids must be whole dollars.')
        }
        if (bid.amount > state.players[bid.player].cleanCash) {
          return reject(
            'INSUFFICIENT_CLEAN_CASH',
            `${bid.player} bid $${bid.amount} but holds $${state.players[bid.player].cleanCash}.`,
          )
        }
      }

      const events: GameEvent[] = []
      let working = state

      // 1. strip buildings across the colour group, proceeds against the debt
      const strip = groupBuildingStrip(working, command.player, lot.group)
      if (strip.proceeds > 0) {
        const stripped: GameEvent = {
          type: 'BuildingsStripped',
          player: command.player, deeds: strip.deeds, proceeds: strip.proceeds,
        }
        events.push(stripped)
        working = reduceCredit(working, stripped)
      }

      // 2. extinguish encumbrances, both amounts added to the shortfall (spec 19.12)
      for (const extinguished of extinguishmentEvents(working, command.player, command.deed, ports)) {
        events.push(extinguished)
        working = reduceCredit(working, extinguished)
      }

      // 3. auction the now-clean deed at or above the floor
      const floorPrice = liquidationPrice(lot)
      const ranked = command.bids
        .filter((b) => b.amount >= floorPrice)
        .slice()
        // Two equal bids from the SAME player compare 0 on both keys — a duplicate the
        // command shape permits and nothing rejects — so the index into `command.bids`
        // breaks the final tie. Without it the winner depends on V8's sort being stable,
        // which is an implementation detail, not a guarantee this engine may rely on.
        .map((bid, index) => ({ bid, index }))
        .sort(
          (a, b) =>
            b.bid.amount - a.bid.amount ||
            state.config.turnOrder.indexOf(a.bid.player)
              - state.config.turnOrder.indexOf(b.bid.player) ||
            a.index - b.index,
        )
        .map((x) => x.bid)
      const winner = ranked[0]
      const sale: GameEvent = {
        type: 'DeedLiquidated',
        player: command.player,
        deed: command.deed,
        buyer: winner === undefined ? 'bank' : winner.player,
        price: winner === undefined ? floorPrice : winner.amount,
      }
      events.push(sale)
      working = reduceCredit(working, sale)

      // 4. stop the auction if the proceeds cured the position
      if (!isUnderMarginCall(working, command.player)) {
        events.push({ type: 'MarginCallCured', player: command.player })
      }
      return events
    }

    case 'RepayDistressedDebt': {
      const p = state.players[command.player]
      if (!isWholeDollars(command.amount) || command.amount === 0) {
        return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
      }
      if (command.amount > p.distressedDebt) {
        return reject('INVALID_AMOUNT', `Your distressed debt is $${p.distressedDebt}.`)
      }
      if (command.amount > p.cleanCash) {
        return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${p.cleanCash} in clean cash.`)
      }
      return [{ type: 'DistressedDebtRepaid', player: command.player, amount: command.amount }]
    }

    case 'OriginatePeerLoan':
    case 'RepayPeerLoan':
    case 'SellPeerLoanNote':
      return decidePeerLoan(state, command)
  }
}
