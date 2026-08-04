import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money } from '../../core/types.js'
import { reduceCredit } from '../credit/index.js'
import { decideSecuritization } from './decide.js'
import {
  deed, eventsOf, gameState, loan, pool, rejectionOf, swap, totalMoney, tranches,
  withDeeds, withLoans, withPlayers, withPools, withSwaps,
} from './fixture.js'
import { reduceSecuritization } from './reduce.js'
import {
  loanCreditEvents, referenceFace, requiredCollateral, settleSwapPremiums, trancheCreditEvents,
} from './swaps.js'
import { terminateAllPools } from './waterfall.js'

/** Folds a batch through both reducers that can own a swap-related event:
 * `securitization` owns the swap-lifecycle events, `credit` owns `ObligationCapitalised`.
 * Each reducer is a no-op on events it does not own (Task 2's contract), so composing
 * them here mirrors how `core/reduce.ts` will eventually wire every context together. */
function applyAll(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce((s, e) => reduceCredit(reduceSecuritization(s, e), e), state)
}

function baseState(): GameState {
  return withLoans(gameState(), [loan('l-1', { lender: 'P1', borrower: 'P2', principal: 500 })])
}

/** A seller ('P4') whose single unmortgaged synthetic deed advances `borrowingBase`
 * exactly `floorPercent(face, DEED_ADVANCE_RATE)`. */
function sellerWithDeedFace(face: Money): GameState {
  return withDeeds(baseState(), [deed('seller-deed', face, { owner: 'P4' })])
}

const AMPLE_BASE = () => sellerWithDeedFace(2000) // borrowingBase 1500 -- far more than any test needs

function write(
  state: GameState,
  over: Partial<{ notional: Money; premiumPerRound: Money }> = {},
) {
  return decideSecuritization(state, {
    type: 'WriteSwap', swapId: 'cds-1', buyer: 'P3', seller: 'P4',
    reference: { kind: 'peer-loan', id: 'l-1' },
    notional: over.notional ?? 400, premiumPerRound: over.premiumPerRound ?? 40,
  })
}

describe('referenceFace', () => {
  it('reports the reference obligation face for a loan note and for a tranche', () => {
    const state = withPools(baseState(), [pool('pool-1', { tranches: tranches(600, 500, 810) })])
    expect(referenceFace(state, { kind: 'peer-loan', id: 'l-1' })).toBe(500)
    expect(referenceFace(state, { kind: 'tranche', poolId: 'pool-1', tranche: 'senior' })).toBe(600)
    expect(referenceFace(state, { kind: 'tranche', poolId: 'pool-1', tranche: 'equity' })).toBe(810)
    expect(referenceFace(state, { kind: 'peer-loan', id: 'l-9' })).toBeNull()
    expect(referenceFace(state, { kind: 'tranche', poolId: 'pool-9', tranche: 'senior' })).toBeNull()
  })

  it('reports null once the note has settled or the pool has terminated', () => {
    const state = withPools(
      withLoans(gameState(), [loan('l-1', { status: 'repaid' })]),
      [pool('pool-1', { terminated: true, tranches: tranches(600, 500, 810) })],
    )
    expect(referenceFace(state, { kind: 'peer-loan', id: 'l-1' })).toBeNull()
    expect(referenceFace(state, { kind: 'tranche', poolId: 'pool-1', tranche: 'senior' })).toBeNull()
  })
})

describe('WriteSwap origination', () => {
  it('allows naked protection on debt the buyer does not own', () => {
    // P3 is neither lender nor borrower on l-1. Spec section 8: naked CDS is legal.
    const result = write(AMPLE_BASE())
    expect(isRejection(result)).toBe(false)
    expect(result).toEqual([{
      type: 'SwapWritten', id: 'cds-1', buyer: 'P3', seller: 'P4',
      reference: { kind: 'peer-loan', id: 'l-1' }, notional: 400, premiumPerRound: 40,
    }])
  })

  it('caps the notional at the reference obligation\'s face', () => {
    const state = AMPLE_BASE()
    expect(isRejection(write(state, { notional: 500 }))).toBe(false) // exactly the $500 face
    expect(rejectionOf(write(state, { notional: 501 })).code).toBe('SWAP_NOTIONAL_EXCEEDS_FACE')
  })

  it('rejects a non-positive or fractional notional', () => {
    const state = AMPLE_BASE()
    expect(rejectionOf(write(state, { notional: 0 })).code).toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(write(state, { notional: -5 })).code).toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(write(state, { notional: 100.5 })).code).toBe('NEGATIVE_AMOUNT')
  })

  it('rejects a negative or fractional premium', () => {
    const state = AMPLE_BASE()
    expect(rejectionOf(write(state, { premiumPerRound: -1 })).code).toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(write(state, { premiumPerRound: 10.5 })).code).toBe('NEGATIVE_AMOUNT')
    // Zero is a legal, if pointless, premium.
    expect(isRejection(write(state, { premiumPerRound: 0 }))).toBe(false)
  })

  it('requires the seller to post CDS_COLLATERAL_RATE of notional against their base', () => {
    expect(ECONOMY.CDS_COLLATERAL_RATE).toBe(0.3)
    expect(requiredCollateral(400)).toBe(120)
    // face 159 -> borrowingBase floorPercent(159, 0.75) = 119, one short of 120.
    expect(rejectionOf(write(sellerWithDeedFace(159))).code).toBe('INSUFFICIENT_BORROWING_BASE')
    // face 160 -> borrowingBase exactly 120.
    expect(isRejection(write(sellerWithDeedFace(160)))).toBe(false)
  })

  it('rejects a swap before Era III', () => {
    const ample = AMPLE_BASE()
    const state = { ...ample, config: { ...ample.config, unlockMode: 'progressive' as const }, era: 2 as const }
    expect(rejectionOf(write(state)).code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('allows a swap in Era III under progressive unlock', () => {
    const ample = AMPLE_BASE()
    const state = { ...ample, config: { ...ample.config, unlockMode: 'progressive' as const }, era: 3 as const }
    expect(isRejection(write(state))).toBe(false)
  })

  it('rejects outside an Open phase', () => {
    expect(rejectionOf(write({ ...AMPLE_BASE(), phase: 'movement' })).code).toBe('WRONG_PHASE')
  })

  it('rejects buying protection from yourself', () => {
    const result = decideSecuritization(AMPLE_BASE(), {
      type: 'WriteSwap', swapId: 'cds-1', buyer: 'P4', seller: 'P4',
      reference: { kind: 'peer-loan', id: 'l-1' }, notional: 100, premiumPerRound: 10,
    })
    expect(rejectionOf(result).code).toBe('SELF_DEALING')
  })

  it('rejects a duplicate swap id', () => {
    const state = withSwaps(AMPLE_BASE(), [swap('cds-1')])
    expect(rejectionOf(write(state)).code).toBe('DUPLICATE_CONTRACT_ID')
  })

  it('rejects referencing a note or tranche that does not exist or has settled', () => {
    const result = decideSecuritization(AMPLE_BASE(), {
      type: 'WriteSwap', swapId: 'cds-1', buyer: 'P3', seller: 'P4',
      reference: { kind: 'peer-loan', id: 'l-9' }, notional: 100, premiumPerRound: 10,
    })
    expect(rejectionOf(result).code).toBe('CONTRACT_NOT_FOUND')
  })
})

describe('reducer: swap lifecycle', () => {
  it('appends a newly written swap', () => {
    const next = reduceSecuritization(gameState(), {
      type: 'SwapWritten', id: 'cds-1', buyer: 'P3', seller: 'P4',
      reference: { kind: 'peer-loan', id: 'l-1' }, notional: 400, premiumPerRound: 40,
    })
    expect(next.swaps).toEqual([{
      id: 'cds-1', buyer: 'P3', seller: 'P4', reference: { kind: 'peer-loan', id: 'l-1' },
      notional: 400, premiumPerRound: 40, status: 'active',
    }])
  })

  it('marks a swap expired without moving any money', () => {
    const state = withSwaps(gameState(), [swap('cds-1')])
    const next = reduceSecuritization(state, { type: 'SwapExpired', id: 'cds-1' })
    expect(next.swaps[0]?.status).toBe('expired')
    expect(totalMoney(next)).toBe(totalMoney(state))
  })

  it('ignores events belonging to other contexts', () => {
    const state = gameState()
    expect(reduceSecuritization(state, { type: 'SalaryPaid', player: 'P1', amount: 350 })).toBe(state)
  })
})

describe('CDS settlement', () => {
  it('transfers the premium from buyer to seller each Settlement', () => {
    const state = withPlayers(withSwaps(gameState(), [swap('cds-1', { premiumPerRound: 40 })]), {
      P3: { cleanCash: 1000 }, P4: { cleanCash: 1000 },
    })
    const events = settleSwapPremiums(state)
    expect(events).toEqual([{ type: 'SwapPremiumPaid', id: 'cds-1', amount: 40 }])
    const after = applyAll(state, events)
    expect(after.players.P3.cleanCash).toBe(960)
    expect(after.players.P4.cleanCash).toBe(1040)
    expect(totalMoney(after)).toBe(totalMoney(state))
  })

  it('capitalises an unaffordable premium into the buyer\'s drawn credit, never distressed debt', () => {
    const state = withPlayers(withSwaps(gameState(), [swap('cds-1', { premiumPerRound: 40 })]), {
      P3: { cleanCash: 10 }, P4: { cleanCash: 1000 },
    })
    const events = settleSwapPremiums(state)
    expect(events).toEqual([
      { type: 'SwapPremiumPaid', id: 'cds-1', amount: 40 },
      { type: 'ObligationCapitalised', player: 'P3', amount: 30, obligation: 'cds-premium' },
    ])
    const after = applyAll(state, events)
    expect(after.players.P3.cleanCash).toBe(0)
    expect(after.players.P3.drawnCredit).toBe(30)
    expect(after.players.P3.distressedDebt).toBe(0)
    expect(after.players.P4.cleanCash).toBe(1040) // paid the full $40, whatever its source
    expect(totalMoney(after)).toBe(totalMoney(state))
  })

  it('pays nothing on an inactive swap or one with no premium', () => {
    const state = withSwaps(gameState(), [
      swap('cds-1', { status: 'triggered' }),
      swap('cds-2', { status: 'expired' }),
      swap('cds-3', { premiumPerRound: 0 }),
    ])
    expect(settleSwapPremiums(state)).toEqual([])
  })

  it('triggers a loan-note CDS on borrower default, paying the full notional', () => {
    const state = withPlayers(
      withSwaps(withLoans(gameState(), [loan('l-1')]), [swap('cds-1', { notional: 400 })]),
      { P3: { cleanCash: 1000 }, P4: { cleanCash: 1000 } },
    )
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ]
    const events = loanCreditEvents(state, roundEvents)
    expect(events).toEqual([{ type: 'SwapTriggered', id: 'cds-1', payout: 400 }])
    const after = applyAll(state, events)
    expect(after.players.P3.cleanCash).toBe(1400) // the naked buyer, made whole
    expect(after.players.P4.cleanCash).toBe(600) // the seller, who pays regardless
    expect(after.swaps[0]?.status).toBe('triggered')
    expect(totalMoney(after)).toBe(totalMoney(state))
  })

  it('does not trigger a loan-note CDS while the borrower is current', () => {
    const state = withSwaps(withLoans(gameState(), [loan('l-1')]), [swap('cds-1')])
    expect(loanCreditEvents(state, [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 50 },
    ])).toEqual([])
  })

  it('triggers a tranche CDS only when that tranche is short at pool termination', () => {
    const state = withSwaps(withPools(gameState(), [pool('pool-1', { tranches: tranches(600, 500, 810) })]), [
      swap('cds-senior', { notional: 600, reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'senior' } }),
      swap('cds-mezz', { notional: 500, reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' } }),
    ])
    expect(trancheCreditEvents(state, 'pool-1', [{ tranche: 'mezzanine', shortfall: 300 }])).toEqual([
      { type: 'SwapExpired', id: 'cds-senior' },
      { type: 'SwapTriggered', id: 'cds-mezz', payout: 500 },
    ])
  })

  it(
    'settles tranche CDS on the forced termination at the end of round 24, capitalising an '
      + 'uncoverable payout into the seller\'s drawn credit',
    () => {
      // terminateAllPools is what session calls in the extra round-24 step of spec 19.1;
      // its termination events feed straight into trancheCreditEvents.
      const state = withPlayers(
        withSwaps(withPools(gameState({ round: ECONOMY.TOTAL_ROUNDS }), [
          pool('pool-1', { tranches: tranches(600, 500, 810) }),
        ]), [
          swap('cds-eq', { notional: 810, reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'equity' } }),
        ]),
        { P4: { cleanCash: 300 } },
      )
      const events = terminateAllPools(state)
      expect(events).toEqual([
        {
          type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [
            { tranche: 'senior', shortfall: 600 },
            { tranche: 'mezzanine', shortfall: 500 },
            { tranche: 'equity', shortfall: 810 },
          ],
        },
        { type: 'SwapTriggered', id: 'cds-eq', payout: 810 },
        // The seller cannot cover $810 out of $300 clean cash: the balance capitalises
        // into their drawn credit via the obligation waterfall (spec 19.8) -- NOT
        // distressed debt, which is reserved for an uncured margin call that has
        // already exhausted forced liquidation (spec 19.7).
        { type: 'ObligationCapitalised', player: 'P4', amount: 510, obligation: 'cds-payout' },
      ])
      const after = applyAll(state, events)
      expect(after.players.P4.cleanCash).toBe(0)
      expect(after.players.P4.drawnCredit).toBe(510)
      expect(after.players.P4.distressedDebt).toBe(0)
      expect(totalMoney(after)).toBe(totalMoney(state))
    },
  )
})

/**
 * Spec section 20's conserved identity: sum(cleanCash) - sum(drawnCredit) -
 * sum(distressedDebt) + treasury. Premiums and payouts are pure player-to-player
 * transfers -- neither needs a Treasury leg -- so the identity must hold whether or
 * not the payer's clean cash covers the obligation in full.
 */
describe('money conservation (Global Constraint)', () => {
  it('holds when a swap is written -- no cash moves at origination', () => {
    const before = AMPLE_BASE()
    const after = eventsOf(write(before)).reduce(reduceSecuritization, before)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('holds across a premium payment the buyer can afford in full', () => {
    const before = withSwaps(gameState(), [swap('cds-1', { premiumPerRound: 40 })])
    const after = applyAll(before, settleSwapPremiums(before))
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('holds when the writer cannot cover a triggered payout, which capitalises into drawn credit', () => {
    const before = withPlayers(
      withSwaps(withLoans(gameState(), [loan('l-1')]), [swap('cds-1', { notional: 400, seller: 'P4' })]),
      { P4: { cleanCash: 50 } },
    )
    const events = loanCreditEvents(before, [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ])
    expect(events).toContainEqual({
      type: 'ObligationCapitalised', player: 'P4', amount: 350, obligation: 'cds-payout',
    })
    const after = applyAll(before, events)
    expect(after.players.P4.distressedDebt).toBe(0)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })
})
