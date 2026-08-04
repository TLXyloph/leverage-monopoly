import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../markets/index.js', () => ({
  markRentFuture: vi.fn(), markDeedOption: vi.fn(),
}))
vi.mock('../securitization/index.js', () => ({
  distribute: vi.fn(), expectedPoolCashflow: vi.fn(), borrowerLeverage: vi.fn(),
}))

import { markRentFuture, markDeedOption } from '../markets/index.js'
import { distribute, expectedPoolCashflow, borrowerLeverage } from '../securitization/index.js'
import {
  buildingCostBasis, deedValue, markDeedOptionsHeld, markLoanNote, markLoanNotesHeld,
  markRentFuturesHeld, markSwapsHeld, markTranche, markTranchesHeld,
} from './marks.js'
import {
  deed, future, loan, option, pool, scoringState, swap, tranche,
} from './session.fixture.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(markRentFuture).mockReturnValue(0)
  vi.mocked(markDeedOption).mockReturnValue(0)
  vi.mocked(borrowerLeverage).mockReturnValue(0)
  vi.mocked(expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(distribute).mockReturnValue([])
})

describe('deedValue', () => {
  it('marks an unmortgaged deed at face', () => {
    expect(deedValue(deed('d-1', { faceValue: 200 }))).toBe(200)
  })

  it('marks a mortgaged deed net of the cost to redeem it', () => {
    // Mortgaging pays 50% of face in cash. If the deed still marked at face, a player
    // could mortgage all seven holdings on the last Open phase and gain 50% of their
    // face value for free. Netting the 55% redemption cost makes it cost 5% instead.
    expect(deedValue(deed('d-1', { faceValue: 200, mortgaged: true }))).toBe(90)
  })

  it('never marks a mortgaged deed below zero', () => {
    expect(deedValue(deed('d-1', { faceValue: 1, mortgaged: true }))).toBe(0)
  })
})

describe('buildingCostBasis', () => {
  // NOTE: `config/board.ts`'s `deed()` builder already applies HOUSE_COST_MULTIPLIER
  // (90%) when it constructs `DEED_LIST` — `DeedState.houseCost` is the price actually
  // PAID per house, not the printed list price (see `board`'s own `buildingCost`,
  // which returns `deed.houseCost` unmodified with the comment "do not re-apply it").
  // So this fixture's `houseCost` already stands in for the discounted figure, and
  // `buildingCostBasis` must NOT apply the multiplier a second time — doing so would
  // silently undervalue every player's real buildings by 10% at scoring.
  it('values buildings at the price actually paid (already 90% of list)', () => {
    expect(buildingCostBasis(deed('d-1', { houseCost: 45, houses: 3 }))).toBe(135)
  })

  it('counts a hotel as five buildings', () => {
    expect(buildingCostBasis(deed('d-1', { houseCost: 45, houses: 5 }))).toBe(225)
  })

  it('is worth zero on an undeveloped deed', () => {
    expect(buildingCostBasis(deed('d-1', { houseCost: 45, houses: 0 }))).toBe(0)
  })
})

describe('markLoanNote', () => {
  it('marks a note against an unlevered borrower at par', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(0)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(500)
  })

  it('marks a note against a 4x borrower at 40% of principal', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(4)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(200)
  })

  it('caps the haircut at 4x, so a 9x borrower marks the same as a 4x one', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(9)
    expect(markLoanNote(s, loan({ outstanding: 500 }))).toBe(200)
  })

  it('marks a repaid or defaulted note at zero', () => {
    const s = scoringState()
    expect(markLoanNote(s, loan({ status: 'repaid' }))).toBe(0)
    expect(markLoanNote(s, loan({ status: 'defaulted' }))).toBe(0)
  })

  it('marks on outstanding, not principal — a paid-down note marks lower than par', () => {
    const s = scoringState()
    vi.mocked(borrowerLeverage).mockReturnValue(0)
    expect(markLoanNote(s, loan({ principal: 500, outstanding: 100 }))).toBe(100)
  })

  it('sums only the notes the player lent against', () => {
    const s = scoringState({
      loans: [
        loan({ id: 'l-1', lender: 'P1', outstanding: 500 }),
        loan({ id: 'l-2', lender: 'P2', outstanding: 300 }),
      ],
    })
    vi.mocked(borrowerLeverage).mockReturnValue(0)
    expect(markLoanNotesHeld(s, 'P1')).toBe(500)
    expect(markLoanNotesHeld(s, 'P2')).toBe(300)
  })
})

describe('markTranche', () => {
  it('runs the pool\'s own waterfall over the cashflow it has not yet collected', () => {
    const s = scoringState()
    const p = pool({
      tranches: [
        tranche('senior', { face: 600, paid: 600, holder: 'P1' }),
        tranche('mezzanine', { face: 400, paid: 100, holder: 'P2' }),
        tranche('equity', { face: 0, paid: 0, holder: 'P3' }),
      ],
    })
    vi.mocked(expectedPoolCashflow).mockReturnValue(1000)
    vi.mocked(distribute).mockReturnValue([
      { tranche: 'senior', amount: 0 },
      { tranche: 'mezzanine', amount: 300 },
      { tranche: 'equity', amount: 0 },
    ])
    expect(markTranche(s, p, 'mezzanine')).toBe(300)
    // 1000 expected, 700 already paid out, so 300 remains to run the waterfall.
    expect(vi.mocked(distribute)).toHaveBeenCalledWith(p, 300)
  })

  it('marks every tranche of a terminated pool at zero', () => {
    const s = scoringState()
    const p = pool({ terminated: true })
    expect(markTranche(s, p, 'senior')).toBe(0)
    expect(vi.mocked(distribute)).not.toHaveBeenCalled()
  })

  it('sums the tranches a player holds across every live pool', () => {
    const s = scoringState({
      pools: [
        pool({ id: 'pool-1', tranches: [tranche('senior', { holder: 'P1' })] }),
        pool({ id: 'pool-2', tranches: [tranche('senior', { holder: 'P1' })] }),
      ],
    })
    vi.mocked(expectedPoolCashflow).mockReturnValue(1000)
    vi.mocked(distribute).mockReturnValue([{ tranche: 'senior', amount: 250 }])
    expect(markTranchesHeld(s, 'P1')).toBe(500)
  })
})

describe('markRentFuturesHeld and markDeedOptionsHeld', () => {
  it('delegates rent futures to the markets valuation', () => {
    const s = scoringState({ futures: [future({ id: 'f-1', holder: 'P1' })] })
    vi.mocked(markRentFuture).mockReturnValue(140)
    expect(markRentFuturesHeld(s, 'P1')).toBe(140)
    expect(markRentFuturesHeld(s, 'P2')).toBe(0)
  })

  it('delegates deed options to the markets mark, which is max(0, face - strike)', () => {
    const s = scoringState({ options: [option({ id: 'o-1', holder: 'P1' })] })
    vi.mocked(markDeedOption).mockReturnValue(80)
    expect(markDeedOptionsHeld(s, 'P1')).toBe(80)
  })

  it('gives the option writer nothing, positive or negative', () => {
    const s = scoringState({ options: [option({ writer: 'P2', holder: 'P1' })] })
    vi.mocked(markDeedOption).mockReturnValue(80)
    expect(markDeedOptionsHeld(s, 'P2')).toBe(0)
  })
})

describe('markSwapsHeld', () => {
  it('marks both sides of an untriggered swap at zero', () => {
    const s = scoringState({ swaps: [swap({ buyer: 'P3', seller: 'P4', status: 'active' })] })
    expect(markSwapsHeld(s, 'P3')).toBe(0)
    expect(markSwapsHeld(s, 'P4')).toBe(0)
  })

  it('marks a triggered swap at zero too, because the payout already moved in cash', () => {
    const s = scoringState({ swaps: [swap({ status: 'triggered' })] })
    expect(markSwapsHeld(s, 'P3')).toBe(0)
    expect(markSwapsHeld(s, 'P4')).toBe(0)
  })
})
