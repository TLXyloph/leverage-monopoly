import type { GameState, PlayerState, RentFuture } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { PlayerId } from '../../core/types.js'
import { transfer } from '../board/index.js'
import { reduceDeedOptions } from './reduce-options.js'

function withPlayer(
  state: GameState,
  id: PlayerId,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id], ...patch } },
  }
}

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
     * Mortgage-triggered make-whole. The holder is made whole in full regardless of
     * the owner's cash on hand; `decide.ts`'s `makeWholeOnMortgage` computes `amount`
     * as exactly what the owner can pay plus a paired `ObligationCapitalised {
     * obligation: 'make-whole' }` for the shortfall, so the two events together
     * conserve money with no Treasury leg. The capitalised leg is reduced by
     * `credit`'s `reduceCredit`, which runs before this reducer in `core/reduce.ts`.
     */
    case 'RentFutureMadeWhole': {
      const f = state.futures.find((x) => x.id === event.id)
      if (f === undefined) return state
      const owner = deedOwner(state, f.deed)
      if (owner === null) return state
      return transfer(state, owner, f.holder, event.amount)
    }

    /**
     * Retained defensively though no emitter remains: Task 20 found this context's
     * only emitter (`makeWholeOnMortgage`'s shortfall) routing a shortfall here
     * instead of through `ObligationCapitalised`, which broke money conservation —
     * `distressedDebt` rose with no Treasury leg and no matching drop elsewhere.
     * Spec 19.7 reserves this event for the terminal state after forced liquidation
     * exhausts a portfolio; nothing in `markets` reaches that state.
     */
    case 'DistressedDebtIncurred': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        distressedDebt: p.distressedDebt + event.amount,
      })
    }

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
