import type { DeedOption, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { transfer } from '../board/index.js'

export function reduceDeedOptions(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'DeedOptionWritten': {
      const option: DeedOption = {
        id: event.id,
        deed: event.deed,
        writer: event.writer,
        holder: event.holder,
        premium: event.premium,
        strike: event.strike,
        expiry: event.expiry,
      }
      const withOption: GameState = { ...state, options: [...state.options, option] }
      // The holder buys the option from the writer. `transfer` (board, Task 5) is the
      // same "credit the payee in full, floor the payer at zero" primitive `reduce.ts`
      // uses for RentFutureOriginated; decide-options.ts's INSUFFICIENT_CLEAN_CASH check
      // already guarantees the holder can afford it, so the floor never actually engages.
      return transfer(withOption, event.holder, event.writer, event.premium)
    }

    case 'DeedOptionSold': {
      const moved: GameState = {
        ...state,
        options: state.options.map(
          (o) => (o.id === event.id ? { ...o, holder: event.to } : o),
        ),
      }
      return transfer(moved, event.to, event.from, event.price)
    }

    case 'DeedOptionExercised': {
      const o = state.options.find((x) => x.id === event.id)
      if (o === undefined) return state
      const deed = state.deeds[o.deed]
      if (deed === undefined) return state
      /*
       * The deed transfers whole: houses, mortgage status and any rent future
       * encumbrance go with it, because the future references the deed and not
       * its owner (the same mechanism that makes encumbrance survive a trade).
       */
      const transferred: GameState = {
        ...state,
        deeds: { ...state.deeds, [o.deed]: { ...deed, owner: o.holder } },
        options: state.options.filter((x) => x.id !== event.id),
      }
      return transfer(transferred, o.holder, o.writer, event.strikePaid)
    }

    case 'DeedOptionExpired':
      return { ...state, options: state.options.filter((o) => o.id !== event.id) }

    /**
     * Spec 19.12, the anti-exploit. Forced liquidation extinguishes an outstanding
     * option before the deed reaches auction — `credit/decide.ts`'s `extinguishmentEvents`
     * emits this, `credit/reduce.ts` moves the premium refund and adds it to the
     * liquidated player's drawn balance, and THIS is the other half: removing the
     * contract record itself, so `isDeedLocked` releases and a second option cannot
     * collide with a stale entry. A no-op for `kind: 'rent-future'`, which is Task 14's
     * reducer's concern, not this one's.
     */
    case 'EncumbranceExtinguished':
      return event.kind === 'deed-option'
        ? { ...state, options: state.options.filter((o) => o.id !== event.contract) }
        : state

    default:
      return state
  }
}
