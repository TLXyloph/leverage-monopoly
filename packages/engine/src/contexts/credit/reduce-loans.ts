import type { GameEvent } from '../../core/events.js'
import type { GameState, PeerLoan } from '../../core/state.js'
import { addCash, withDeed, withLoan, withPlayer } from './reduce.js'
import { poolHoldingLoan } from './selectors.js'

/**
 * Spec section 7. Peer-loan events only; every other event returns the state untouched,
 * so the root reducer composes this beside `reduceCredit` the way `markets` composes its
 * own split reducer beside its options reducer for the same reason.
 */
export function reducePeerLoans(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PeerLoanOriginated': {
      const loan: PeerLoan = {
        id: event.id,
        lender: event.lender,
        borrower: event.borrower,
        principal: event.principal,
        outstanding: event.principal,
        ratePerRound: event.ratePerRound,
        maturesAtRound: event.maturesAtRound,
        collateral: event.collateral,
        status: 'active',
      }
      const funded = addCash(
        addCash(state, event.lender, -event.principal),
        event.borrower,
        event.principal,
      )
      return { ...funded, loans: [...funded.loans, loan] }
    }

    /**
     * The lender is paid the full coupon. Whatever the borrower could not cover from
     * clean cash is bank money, and arrives as its own ObligationCapitalised raising the
     * drawn balance — spec 19.8's two-step waterfall, with the lender never short.
     */
    case 'PeerLoanInterestPaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const fromCash = Math.min(state.players[loan.borrower].cleanCash, event.amount)
      return addCash(addCash(state, loan.borrower, -fromCash), loan.lender, event.amount)
    }

    case 'PeerLoanRepaid': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      const moved = addCash(
        addCash(state, loan.borrower, -event.amount),
        loan.lender,
        event.amount,
      )
      const outstanding = loan.outstanding - event.amount
      return withLoan(moved, loan.id, {
        outstanding,
        status: outstanding === 0 ? 'repaid' : 'active',
      })
    }

    /** The note is the asset; selling it moves the right to be repaid, not the debt. */
    case 'PeerLoanSold': {
      const paid = addCash(addCash(state, event.to, -event.price), event.from, event.price)
      return withLoan(paid, event.id, { lender: event.to })
    }

    /**
     * Spec section 7. Collateral still owned by the borrower transfers to the note
     * holder, and the remaining balance is written off — a write-off destroys a claim,
     * not money, so neither the drawn balance nor distressed debt moves here and the
     * conservation identity in spec section 20 holds across a default unchanged.
     * Deeds that left the borrower's hands in the meantime — a forced liquidation under
     * Task 10 outranks a peer pledge — are simply not there to take.
     */
    case 'PeerLoanDefaulted': {
      const loan = state.loans.find((l) => l.id === event.id)
      if (loan === undefined) return state
      let next = state

      /**
       * Spec 19.4. A note inside a LIVE pool keeps its collateral where it is:
       * `securitization` sells those same deeds to the bank at LIQUIDATION_FLOOR and
       * puts the cash into that round's waterfall via PoolCollateralLiquidated, because
       * deeds cannot be distributed through a waterfall and cash can. The collateral
       * list is deliberately NOT cleared either way: this runs at Settlement step 5 and
       * `securitization` reads `loan.collateral` at step 6, one step later.
       */
      if (poolHoldingLoan(state, loan.id) === null) {
        for (const deedId of loan.collateral) {
          if (next.deeds[deedId]?.owner !== loan.borrower) continue
          next = withDeed(next, deedId, { owner: event.collateralTo })
        }
      }

      /**
       * Spec section 7 point 3, and 19.10. The penalty is a single permanent halving.
       * Writing a boolean rather than scaling a number is what makes a second default
       * carry the collateral loss and the write-off without compounding the penalty —
       * two halvings against a 75% advance rate would land the player at 18.75%, which
       * spec 19.10 rejects by name as a different and much crueller game.
       */
      next = withPlayer(next, loan.borrower, { creditImpaired: true })

      return withLoan(next, loan.id, { outstanding: 0, status: 'defaulted' })
    }

    default:
      return state
  }
}
