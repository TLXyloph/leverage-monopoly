import type { GameState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { PlayerId } from '../../core/types.js'
import { transfer } from '../board/index.js'
import { reduceDeedOptions } from './reduce-options.js'

function deedOwner(state: GameState, deed: string): PlayerId | null {
  const d = state.deeds[deed]
  if (d === undefined || d.owner === null || d.owner === 'bank') return null
  return d.owner
}

export function reduceMarkets(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'RentFutureOriginated': {
      const contract: RentFuture = {
        id: event.id,
        deed: event.deed,
        holder: event.holder,
        startRound: event.startRound,
        endRound: event.endRound,
      }
      const owner = deedOwner(state, event.deed)
      const withContract: GameState = { ...state, futures: [...state.futures, contract] }
      // The holder buys the contract from the deed's owner. `transfer` (board, Task 5)
      // is the same "credit the payee in full, floor the payer at zero" primitive used
      // for RentCharged; decide.ts's INSUFFICIENT_CLEAN_CASH check already guarantees
      // the holder can afford it, so the floor never actually engages here.
      return owner === null
        ? withContract
        : transfer(withContract, event.holder, owner, event.price)
    }

    case 'RentFutureSold': {
      const moved: GameState = {
        ...state,
        futures: state.futures.map(
          (f) => (f.id === event.id ? { ...f, holder: event.to } : f),
        ),
      }
      return transfer(moved, event.to, event.from, event.price)
    }

    /**
     * Mortgage-triggered make-whole. `event.amount` is the contract's full remaining
     * expected value; the holder is credited all of it regardless of the owner's cash
     * on hand, and `transfer` (board) floors the owner's debit at their clean cash.
     *
     * What conserves money is that the shortfall `transfer` clamps away here is the
     * SAME number `decide.ts`'s `makeWholeOnMortgage` capitalised into the paired
     * `ObligationCapitalised { obligation: 'make-whole' }`. That agreement is not an
     * assumption this comment asks the reader to take on trust — it is arranged at the
     * source: `makeWholeOnMortgage` prices the gap against the state produced by
     * folding the batch's already-emitted events (`DeedMortgaged` and its proceeds)
     * through `reduceProperty`, which is exactly the cash this case sees. The earlier
     * version of this docstring asserted the agreement while the decider priced against
     * the PRE-mortgage snapshot; the two disagreed by the covered part of the shortfall
     * and the conserved total moved on every mortgage of an encumbered deed the owner
     * could not cover from pre-mortgage cash alone.
     *
     * The capitalised leg is reduced by `credit`'s `reduceCredit`, which runs before
     * this reducer in `core/reduce.ts`. No Treasury leg either way — both legs are
     * player-to-player.
     */
    case 'RentFutureMadeWhole': {
      const f = state.futures.find((x) => x.id === event.id)
      if (f === undefined) return state
      const owner = deedOwner(state, f.deed)
      if (owner === null) return state
      return transfer(state, owner, f.holder, event.amount)
    }

    /*
     * The `DistressedDebtIncurred` case stood here, "retained defensively though no
     * emitter remains". Both the event and this case are now gone: Task 20 found this
     * context's only emitter (`makeWholeOnMortgage`'s shortfall) routing through it
     * instead of through `ObligationCapitalised`, which broke money conservation
     * (`distressedDebt` rose with no Treasury leg and nothing falling to match). A
     * reducer kept alive for an event nothing emits is not a defence — it is a live
     * landing pad for the next caller to make the same mistake.
     */

    case 'RentFutureExpired':
      return { ...state, futures: state.futures.filter((f) => f.id !== event.id) }

    /* Attribution only. RentCharged, reduced by board, is what moved the money. */
    case 'RentRoutedToFuture':
      return state

    /**
     * Spec 19.12. `credit/reduce.ts`'s `EncumbranceExtinguished` case pays the holder
     * and adds the amount to the debtor's drawn balance, but it never touches
     * `state.futures`/`state.options` — that removal is markets' job, split by
     * instrument exactly like every other event here. Skipping this left the contract
     * alive after liquidation: `activeFutureOn`/`rentRecipient` kept routing rent to the
     * old holder on a deed the auction had already sold to someone else. `deed-option`
     * removal already lives in `reduce-options.ts` (Task 15) — delegated to rather than
     * duplicated here.
     */
    case 'EncumbranceExtinguished':
      return event.kind === 'rent-future'
        ? { ...state, futures: state.futures.filter((f) => f.id !== event.contract) }
        : reduceDeedOptions(state, event)

    default:
      return reduceDeedOptions(state, event)
  }
}
