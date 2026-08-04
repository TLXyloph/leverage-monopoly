import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState, PlayerState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { applyAgainstDebt } from './selectors.js'

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

function withDeed(state: GameState, id: DeedId, patch: Partial<DeedState>): GameState {
  const deed = state.deeds[id]
  if (deed === undefined) return state
  return { ...state, deeds: { ...state.deeds, [id]: { ...deed, ...patch } } }
}

/** A pure player-to-player cash movement — no Treasury counterparty. Used for the
 * encumbrance make-whole/refund payments, which come out of the liquidated player's
 * own (rising) drawn balance rather than out of the bank. */
function addCash(state: GameState, id: PlayerId, delta: Money): GameState {
  return withPlayer(state, id, { cleanCash: state.players[id].cleanCash + delta })
}

/** The part of an obligation the payer's clean cash cannot cover. Mirrors `board`'s
 * identically-named selector so the same rule reads the same way in both contexts. */
function shortfall(cash: Money, amount: Money): Money {
  return Math.max(0, amount - cash)
}

/**
 * Step 1 of the obligation waterfall, spec section 19.8: the Treasury is paid the FULL
 * obligation and the payer's clean cash pays only as far as it goes. The gap, if any, is
 * closed by a separately-emitted ObligationCapitalised event (below), which is what keeps
 * the books balanced — the player effectively draws the shortfall from their credit line
 * and forwards it straight to the Treasury, so the Treasury sees the whole amount even
 * though no more than `cash` ever left clean cash.
 */
function payTreasury(state: GameState, id: PlayerId, amount: Money): GameState {
  const cash = state.players[id].cleanCash
  const paid = amount - shortfall(cash, amount)
  return {
    ...withPlayer(state, id, { cleanCash: cash - paid }),
    treasury: state.treasury + amount,
  }
}

export function reduceCredit(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'CreditDrawn': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
    }

    case 'CreditRepaid': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        drawnCredit: p.drawnCredit - event.amount,
      })
    }

    /**
     * Spec section 5: interest is paid to the Treasury. `InterestAccrued` carries no
     * `capitalised` flag (Task 2's contract) — any shortfall is closed by a separate
     * ObligationCapitalised event emitted alongside it, so this case only ever touches
     * cash and the Treasury, exactly like `CarryingCostCharged` below.
     */
    case 'InterestAccrued':
      return payTreasury(state, event.player, event.amount)

    /**
     * Spec section 4: the Era II stimulus is a loan, not a grant — it lands on clean
     * cash AND the drawn balance together, exactly like a voluntary CreditDrawn. The
     * Treasury is untouched: this is a compulsory credit-line advance, not a fiscal
     * transfer. Under this engine's model the credit line creates the money it lends
     * (that is why an ordinary draw never touches the Treasury either — see
     * `CreditDrawn`), and the Treasury's role stays purely fiscal: it collects
     * carrying cost, interest and taxes, and pays GO salary. Debiting the Treasury
     * here as well would double-count the $300 — once as new drawn credit, again as a
     * Treasury outflow — and silently break the conservation identity
     * `sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury` at every
     * round-7 stimulus.
     */
    case 'StimulusAdvanced': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash + event.amount,
        drawnCredit: p.drawnCredit + event.amount,
      })
    }

    /** Settlement step 3, spec section 4. Same shortfall handling as InterestAccrued. */
    case 'CarryingCostCharged':
      return payTreasury(state, event.player, event.amount)

    /**
     * Step 2 of the universal obligation waterfall, spec section 19.8.
     *
     * This raises the drawn balance with NO borrowing-base check, and that is
     * deliberate. Voluntary draws (Task 9) are capped at the base; automatic
     * obligations are not. The gap the two open up is the only thing in the game
     * that produces a margin call.
     */
    case 'ObligationCapitalised': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, { drawnCredit: p.drawnCredit + event.amount })
    }

    case 'MarginCallFlagged':
      return withPlayer(state, event.player, { marginCallFlaggedAt: state.round })

    case 'MarginCallCured':
      return withPlayer(state, event.player, { marginCallFlaggedAt: null })

    /**
     * Settlement step 8, spec 19.7. Compounding interest on distressed debt. Accrued
     * interest the player has not yet paid is still Treasury income — symmetric with
     * `InterestAccrued` above, which credits the Treasury the moment interest accrues
     * rather than waiting for cash to actually move. The Treasury credit is what keeps
     * `distressedDebt` a well-behaved negative-money term in the conservation identity:
     * `distressedDebt` rises by `event.amount` (subtracted in the identity, so it falls
     * by `event.amount` on its own), and crediting the Treasury the same amount restores
     * the balance exactly. No cash moves and no player is worse off in clean cash terms
     * here; the 15% rate and the scoring deduction are what make the debt a penalty, not
     * an omitted counterparty.
     */
    case 'DistressedDebtAccrued': {
      const p = state.players[event.player]
      const next = withPlayer(state, event.player, {
        distressedDebt: p.distressedDebt + event.amount,
      })
      return { ...next, treasury: next.treasury + event.amount }
    }

    case 'DistressedDebtRepaid': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        cleanCash: p.cleanCash - event.amount,
        distressedDebt: p.distressedDebt - event.amount,
      })
    }

    /** Spec section 5's second stop condition. Relabels a drawn-credit shortfall as
     * distressed debt; both terms are subtracted in the conservation identity, so
     * relabelling one liability as the other moves the total by exactly zero. */
    case 'CreditWrittenDown': {
      const p = state.players[event.player]
      return withPlayer(state, event.player, {
        drawnCredit: p.drawnCredit - event.amount,
        distressedDebt: p.distressedDebt + event.amount,
      })
    }

    /**
     * Spec section 5. The whole colour group is cleared to bare land at
     * BUILDING_SELLBACK_RATE of purchase cost — which satisfies the even-build rule
     * trivially — and the proceeds go against the debt before the lot is auctioned.
     * The buildings are bought back by the bank, so the Treasury is the counterparty:
     * without this debit, `applyAgainstDebt` would manufacture `event.proceeds` of new
     * money, breaking the conservation identity in spec section 20.
     */
    case 'BuildingsStripped': {
      let next: GameState = state
      let houses = 0
      let hotels = 0
      for (const id of event.deeds) {
        const d = next.deeds[id]
        if (d === undefined) continue
        houses += d.houses === 5 ? 0 : d.houses
        hotels += d.houses === 5 ? 1 : 0
        next = withDeed(next, id, { houses: 0 })
      }
      next = {
        ...next,
        housesRemaining: next.housesRemaining + houses,
        hotelsRemaining: next.hotelsRemaining + hotels,
        treasury: next.treasury - event.proceeds,
      }
      return applyAgainstDebt(next, event.player, event.proceeds)
    }

    /**
     * Spec 19.12. The holder is made whole in cash and the amount is ADDED to the
     * liquidated player's shortfall, so encumbrances make the position worse rather
     * than shielding it. Removing the contract from state.futures / state.options is
     * `markets`' reducer for this same event (Tasks 14 and 15). This is a pure
     * player-to-player transfer — the debtor's own rising drawn balance is the source,
     * not the Treasury — so it needs no Treasury counterparty to stay conserved.
     */
    case 'EncumbranceExtinguished': {
      const next = addCash(state, event.holder, event.amount)
      const debtor = next.players[event.player]
      return withPlayer(next, event.player, { drawnCredit: debtor.drawnCredit + event.amount })
    }

    /**
     * Spec section 5 / 19.8. A player buyer pays the liquidated player directly; a bank
     * buyer (nobody bid at or above the floor) pays out of the Treasury instead, exactly
     * like the bank buying back buildings above — both are bank purchases and both need
     * a Treasury counterparty to keep the conservation identity from manufacturing money.
     */
    case 'DeedLiquidated': {
      let next = withDeed(state, event.deed, { owner: event.buyer })
      next =
        event.buyer === 'bank'
          ? { ...next, treasury: next.treasury - event.price }
          : addCash(next, event.buyer, -event.price)
      return applyAgainstDebt(next, event.player, event.price)
    }

    default:
      return state
  }
}
