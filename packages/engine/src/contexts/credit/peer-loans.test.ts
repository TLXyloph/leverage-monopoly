import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import type { GameState, PeerLoan } from '../../core/state.js'
import type { ContractId } from '../../core/types.js'
import { decideCredit } from './decide.js'
import type { PeerLoanCommand } from './decide-loans.js'
import { peerLoanId } from './decide-loans.js'
import {
  applyAll, deed, eventsOf, gameState, loan, pool,
  rejectionOf, withDeeds, withLoans, withPlayers,
} from './fixture.js'
import {
  borrowingBase, collateralLiquidationProceeds, creditHeadroom, findPeerLoan,
  fundPeerLoanInterest, pledgedDeeds, poolHoldingLoan,
} from './selectors.js'
import { settlePeerLoans } from './settlement.js'

/**
 * sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury. Mirrors the
 * identically-named helper in `credit.test.ts` and `margin.test.ts`. A peer loan is a
 * player-to-player transfer, so origination, interest, repayment and note sale all
 * conserve this with no Treasury leg, and a default's write-off destroys a claim
 * (the loan's own `outstanding` field, which lives outside this identity), not money.
 */
function totalMoney(state: GameState): number {
  return (
    Object.values(state.players)
      .reduce((t, p) => t + p.cleanCash - p.drawnCredit - p.distressedDebt, 0) + state.treasury
  )
}

const ERA_II = { era: 2 as const, round: 8, phase: 'open' as const }

const BORROWER_DEEDS = [
  deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
  deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
]

type Originate = Extract<PeerLoanCommand, { type: 'OriginatePeerLoan' }>

function originate(over: Partial<Omit<Originate, 'type'>> = {}): Originate {
  return {
    type: 'OriginatePeerLoan',
    lender: 'P2',
    borrower: 'P1',
    principal: 600,
    ratePerRound: 0.1,
    termRounds: 4,
    collateral: ['boardwalk'],
    ...over,
  }
}

/** Narrows away the `undefined` a lookup returns, in the style of `eventsOf`. */
function theLoan(state: GameState, id: ContractId = 'pl:P2:P1:8'): PeerLoan {
  const found = findPeerLoan(state, id)
  if (found === undefined) throw new Error(`expected a loan with id ${id}`)
  return found
}

describe('peer loan origination (spec section 7)', () => {
  const table = withDeeds(gameState(ERA_II), BORROWER_DEEDS)

  it('derives the contract id and moves the principal from lender to borrower', () => {
    expect(peerLoanId('P2', 'P1', 8)).toBe('pl:P2:P1:8')
    const events = eventsOf(decideCredit(table, originate()))
    expect(events).toEqual([{
      type: 'PeerLoanOriginated',
      id: 'pl:P2:P1:8',
      lender: 'P2',
      borrower: 'P1',
      principal: 600,
      ratePerRound: 0.1,
      maturesAtRound: 12,
      collateral: ['boardwalk'],
    }])
    const after = applyAll(table, events)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH - 600)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 600)
    expect(after.loans).toEqual([{
      id: 'pl:P2:P1:8',
      lender: 'P2',
      borrower: 'P1',
      principal: 600,
      outstanding: 600,
      ratePerRound: 0.1,
      maturesAtRound: 12,
      collateral: ['boardwalk'],
      status: 'active',
    }])
    expect(totalMoney(after)).toBe(totalMoney(table))
  })

  it('does not touch the borrower\'s credit line: the principal is another player\'s cash', () => {
    const after = applyAll(table, eventsOf(decideCredit(table, originate())))
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(borrowingBase(after, 'P1')).toBe(562)
    expect(after.treasury).toBe(0)
  })

  it('locks in Era I and opens in Era II, unless every instrument is unlocked', () => {
    const eraI = withDeeds(gameState({ era: 1, round: 3, phase: 'open' }), BORROWER_DEEDS)
    expect(rejectionOf(decideCredit(eraI, originate())).code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
    const sandbox = { ...eraI, config: { ...eraI.config, unlockMode: 'all' as const } }
    expect(eventsOf(decideCredit(sandbox, originate()))).toHaveLength(1)
  })

  it('refuses a loan to yourself, and a principal the lender does not hold', () => {
    expect(rejectionOf(decideCredit(table, originate({ borrower: 'P2' }))).code).toBe('SELF_DEALING')
    const poor = withPlayers(table, { P2: { cleanCash: 599 } })
    expect(rejectionOf(decideCredit(poor, originate())).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses a zero, negative or fractional principal', () => {
    for (const principal of [0, -100, 12.5]) {
      expect(rejectionOf(decideCredit(table, originate({ principal }))).code).toBe('INVALID_AMOUNT')
    }
  })

  it('requires a whole-percentage rate between 0 and 100 per round', () => {
    for (const ratePerRound of [-0.01, 0.125, 1.01]) {
      expect(rejectionOf(decideCredit(table, originate({ ratePerRound }))).code)
        .toBe('INVALID_LOAN_TERMS')
    }
    expect(eventsOf(decideCredit(table, originate({ ratePerRound: 0 })))).toHaveLength(1)
    expect(eventsOf(decideCredit(table, originate({ ratePerRound: 1 })))).toHaveLength(1)
  })

  it('requires a whole term of at least one round that matures inside the game', () => {
    for (const termRounds of [0, -2, 1.5]) {
      expect(rejectionOf(decideCredit(table, originate({ termRounds }))).code)
        .toBe('INVALID_LOAN_TERMS')
    }
    // Round 8 + 17 = 25, past the end of the game: a loan that can never fall due.
    expect(rejectionOf(decideCredit(table, originate({ termRounds: 17 }))).code)
      .toBe('INVALID_WINDOW')
    expect(eventsOf(decideCredit(table, originate({ termRounds: 16 })))).toHaveLength(1)
  })

  it('accepts a loan with no collateral at all', () => {
    const events = eventsOf(decideCredit(table, originate({ collateral: [] })))
    expect(events[0]).toMatchObject({ collateral: [] })
  })

  it('refuses collateral the borrower does not own, has mortgaged, or has pledged twice', () => {
    expect(rejectionOf(decideCredit(table, originate({ collateral: ['marvin-gardens'] }))).code)
      .toBe('NOT_OWNER')
    const mortgaged = withDeeds(table, [deed('baltic', 60, { owner: 'P1', mortgaged: true })])
    expect(rejectionOf(decideCredit(mortgaged, originate({ collateral: ['baltic'] }))).code)
      .toBe('DEED_MORTGAGED')
    expect(rejectionOf(decideCredit(table, originate({
      collateral: ['boardwalk', 'boardwalk'],
    }))).code).toBe('DEED_ENCUMBERED')
    const alreadyPledged = withLoans(table, [loan('pl:P3:P1:7', {
      lender: 'P3', collateral: ['boardwalk'],
    })])
    expect(rejectionOf(decideCredit(alreadyPledged, originate())).code).toBe('DEED_ENCUMBERED')
  })

  it('refuses a second loan between the same pair in the same round', () => {
    const existing = withLoans(table, [loan('pl:P2:P1:8')])
    expect(rejectionOf(decideCredit(existing, originate())).code).toBe('DUPLICATE_CONTRACT_ID')
  })

  it('refuses origination outside the Open phase', () => {
    const settling = { ...table, phase: 'settlement' as const }
    expect(rejectionOf(decideCredit(settling, originate())).code).toBe('WRONG_PHASE')
  })
})

describe('repaying a peer loan', () => {
  const lent = withLoans(withDeeds(gameState(ERA_II), BORROWER_DEEDS), [
    loan('pl:P2:P1:8', { collateral: ['boardwalk'] }),
  ])

  it('pays the lender and reduces the outstanding balance', () => {
    const events = eventsOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 250,
    }))
    expect(events).toEqual([{ type: 'PeerLoanRepaid', id: 'pl:P2:P1:8', amount: 250 }])
    const after = applyAll(lent, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 250)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 250)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.outstanding).toBe(350)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('active')
    expect(totalMoney(after)).toBe(totalMoney(lent))
  })

  it('closes the loan and frees the collateral when the last dollar is repaid', () => {
    const after = applyAll(lent, eventsOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('repaid')
    expect(after.deeds.boardwalk?.owner).toBe('P1')
    expect(pledgedDeeds(after)).toEqual([])
  })

  it('refuses repayment from anyone but the borrower, or of more than is owed', () => {
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P3', id: 'pl:P2:P1:8', amount: 100,
    })).code).toBe('NOT_OWNER')
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 601,
    })).code).toBe('INVALID_AMOUNT')
    const broke = withPlayers(lent, { P1: { cleanCash: 40 } })
    expect(rejectionOf(decideCredit(broke, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 100,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
    expect(rejectionOf(decideCredit(lent, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P9:P1:2', amount: 100,
    })).code).toBe('CONTRACT_NOT_FOUND')
  })
})

describe('the note is a transferable asset (spec section 7)', () => {
  const lent = withLoans(withDeeds(gameState(ERA_II), BORROWER_DEEDS), [
    loan('pl:P2:P1:8', { collateral: ['boardwalk'] }),
  ])

  it('sells outright: cash to the seller, the note to the buyer', () => {
    const events = eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    }))
    expect(events).toEqual([
      { type: 'PeerLoanSold', id: 'pl:P2:P1:8', from: 'P2', to: 'P3', price: 500 },
    ])
    const after = applyAll(lent, events)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 500)
    expect(after.players.P3.cleanCash).toBe(ECONOMY.STARTING_CASH - 500)
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.lender).toBe('P3')
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.borrower).toBe('P1')
    expect(totalMoney(after)).toBe(totalMoney(lent))
  })

  it('sends every later payment to the new holder', () => {
    const sold = applyAll(lent, eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    })))
    const repaid = applyAll(sold, eventsOf(decideCredit(sold, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(repaid.players.P3.cleanCash).toBe(ECONOMY.STARTING_CASH - 500 + 600)
    expect(repaid.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 500)
  })

  it('allows a price of zero, and refuses a fractional or negative one', () => {
    expect(eventsOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 0,
    }))).toHaveLength(1)
    for (const price of [-1, 12.5]) {
      expect(rejectionOf(decideCredit(lent, {
        type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price,
      })).code).toBe('NEGATIVE_AMOUNT')
    }
  })

  it('refuses a seller who does not hold the note, and a sale to the borrower', () => {
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P3', id: 'pl:P2:P1:8', to: 'P4', price: 100,
    })).code).toBe('NOT_ASSET_OWNER')
    // Selling the note to the borrower would leave them owing themselves. Repay instead.
    expect(rejectionOf(decideCredit(lent, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P1', price: 100,
    })).code).toBe('SELF_DEALING')
    const buyerBroke = withPlayers(lent, { P3: { cleanCash: 99 } })
    expect(rejectionOf(decideCredit(buyerBroke, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 100,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('refuses to sell a note out of a live pool, and allows it once the pool terminates', () => {
    // `credit` must never transfer an asset `securitization` has already tranched and
    // sold: the tranche holders bought that cashflow.
    const pooled = {
      ...lent,
      pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
    }
    expect(rejectionOf(decideCredit(pooled, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    })).code).toBe('ASSET_ALREADY_POOLED')

    const dead = {
      ...pooled,
      pools: [pool('pool-1', {
        assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }], terminated: true,
      })],
    }
    expect(eventsOf(decideCredit(dead, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 500,
    }))).toHaveLength(1)
  })

  it('still lets the borrower REPAY a pooled note, because that is cash, not a transfer', () => {
    // Spec 19.4's whole point: cash flows through a waterfall, assets do not.
    const pooled = {
      ...lent,
      pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
    }
    expect(eventsOf(decideCredit(pooled, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    }))).toEqual([{ type: 'PeerLoanRepaid', id: 'pl:P2:P1:8', amount: 600 }])
  })
})

describe('Settlement step 5: peer loan interest (spec 19.1, 19.8)', () => {
  // Base = (400 + 350) * 0.75 = 562. Loan of 600 at 10% = 60 due each round.
  const settling = withLoans(
    withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
    [loan('pl:P2:P1:8', { collateral: ['boardwalk'] })],
  )

  it('pays from clean cash when the borrower can afford the coupon', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 100 } })
    const events = settlePeerLoans(flush)
    expect(events).toEqual([{ type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 }])
    const after = applyAll(flush, events)
    expect(after.players.P1.cleanCash).toBe(40)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.treasury).toBe(0) // peer interest is player-to-player, not Treasury income
    expect(totalMoney(after)).toBe(totalMoney(flush))
  })

  it('capitalises the shortfall into the drawn balance, and the lender is still paid in full', () => {
    const short = withPlayers(settling, { P1: { cleanCash: 20 } })
    const events = settlePeerLoans(short)
    expect(events).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 40, obligation: 'peer-loan-interest' },
    ])
    const after = applyAll(short, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(40)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
    expect(after.players.P1.distressedDebt).toBe(0) // never distressed debt, spec 19.8
    expect(totalMoney(after)).toBe(totalMoney(short))
  })

  it('capitalises the whole coupon when the borrower has no clean cash at all', () => {
    const dry = withPlayers(settling, { P1: { cleanCash: 0 } })
    const events = settlePeerLoans(dry)
    expect(events).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'peer-loan-interest' },
    ])
    expect(totalMoney(applyAll(dry, events))).toBe(totalMoney(dry))
  })

  it('floors each loan\'s interest independently, never on a sum', () => {
    const odd = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { outstanding: 105, ratePerRound: 0.05 }),
        loan('pl:P3:P1:8', { lender: 'P3', outstanding: 105, ratePerRound: 0.05 }),
      ],
    )
    // floor(5.25) twice is 10; floor of 210 * 0.05 would be 10 as well, but the two
    // rules diverge the moment the rates differ, so the per-loan rule is asserted here.
    expect(settlePeerLoans(odd).filter((e) => e.type === 'PeerLoanInterestPaid')).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 5 },
      { type: 'PeerLoanInterestPaid', id: 'pl:P3:P1:8', amount: 5 },
    ])
  })

  it('services loans in origination order, each seeing what the last one left', () => {
    const two = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { outstanding: 400, ratePerRound: 0.1 }),
        loan('pl:P3:P1:8', { lender: 'P3', outstanding: 400, ratePerRound: 0.1 }),
      ],
    )
    const start = withPlayers(two, { P1: { cleanCash: 50 } })
    expect(settlePeerLoans(start)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 40 },
      { type: 'PeerLoanInterestPaid', id: 'pl:P3:P1:8', amount: 40 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 30, obligation: 'peer-loan-interest' },
    ])
    // The first coupon took 40 of the 50; only 10 was left for the second.
    const after = applyAll(start, settlePeerLoans(start))
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(30)
  })

  it('emits nothing for a repaid, defaulted or zero-rate loan', () => {
    const quiet = withLoans(
      withDeeds(gameState({ era: 2, round: 9, phase: 'settlement' }), BORROWER_DEEDS),
      [
        loan('pl:P2:P1:8', { status: 'repaid', outstanding: 0 }),
        loan('pl:P3:P1:8', { lender: 'P3', status: 'defaulted', outstanding: 0 }),
        loan('pl:P4:P1:8', { lender: 'P4', ratePerRound: 0 }),
      ],
    )
    expect(settlePeerLoans(quiet)).toEqual([])
    expect(settlePeerLoans(gameState())).toEqual([])
  })

  it('DEFAULTS when the coupon cannot be paid from cash AND capitalising would breach the base', () => {
    // This is the reading of "a missed interest payment" that survives spec 19.8.
    // Base 562. Drawn 502 leaves headroom 60, exactly the coupon: it capitalises.
    const exactly = withPlayers(settling, { P1: { cleanCash: 0, drawnCredit: 502 } })
    expect(fundPeerLoanInterest(exactly, theLoan(exactly))).toEqual({
      fromCash: 0, capitalised: 60, defaults: false,
    })
    expect(settlePeerLoans(exactly)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'peer-loan-interest' },
    ])
    // and lands the drawn balance exactly ON the base, which is not a breach.
    expect(creditHeadroom(applyAll(exactly, settlePeerLoans(exactly)), 'P1')).toBe(0)
    expect(totalMoney(applyAll(exactly, settlePeerLoans(exactly)))).toBe(totalMoney(exactly))

    // One dollar more drawn and the same coupon is a default instead.
    const short = withPlayers(settling, { P1: { cleanCash: 0, drawnCredit: 503 } })
    expect(fundPeerLoanInterest(short, theLoan(short))).toEqual({
      fromCash: 0, capitalised: 60, defaults: true,
    })
    expect(settlePeerLoans(short)).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
    ])
    expect(totalMoney(applyAll(short, settlePeerLoans(short)))).toBe(totalMoney(short))
  })

  it('pays nothing and capitalises nothing on the round it defaults', () => {
    const short = withPlayers(settling, { P1: { cleanCash: 30, drawnCredit: 550 } })
    const events = settlePeerLoans(short)
    expect(events.some((e) => e.type === 'PeerLoanInterestPaid')).toBe(false)
    expect(events.some((e) => e.type === 'ObligationCapitalised')).toBe(false)
    const after = applyAll(short, events)
    expect(after.players.P1.cleanCash).toBe(30) // the $30 it could have paid stays put
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH)
  })
})

describe('peer loan default (spec section 7 and 19.10)', () => {
  const settling = withLoans(
    withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
    [loan('pl:P2:P1:8', { collateral: ['boardwalk'], maturesAtRound: 12 })],
  )

  it('defaults on an outstanding balance at term expiry, after the final coupon', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    expect(settlePeerLoans(flush)).toEqual([
      { type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 60 },
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
    ])
  })

  it('does not default a loan repaid before the maturity Settlement', () => {
    const openPhase = { ...settling, phase: 'open' as const }
    const repaid = applyAll(openPhase, eventsOf(decideCredit(openPhase, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(settlePeerLoans({ ...repaid, phase: 'settlement' })).toEqual([])
    expect(findPeerLoan(repaid, 'pl:P2:P1:8')?.status).toBe('repaid')
  })

  it('transfers the collateral, writes the balance off, and impairs the borrower', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    const baseline = totalMoney(flush)
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(after.deeds.boardwalk?.owner).toBe('P2')
    expect(after.deeds['park-place']?.owner).toBe('P1')
    const closed = findPeerLoan(after, 'pl:P2:P1:8')
    expect(closed?.status).toBe('defaulted')
    expect(closed?.outstanding).toBe(0)
    expect(after.players.P1.creditImpaired).toBe(true)
    // The write-off is a write-off: it becomes neither drawn credit nor distressed debt.
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.players.P1.distressedDebt).toBe(0)
    // A write-off destroys a claim, not money: the conservation identity is untouched.
    expect(totalMoney(after)).toBe(baseline)
  })

  it('halves the borrowing base permanently, from that moment on', () => {
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    expect(borrowingBase(flush, 'P1')).toBe(562)
    const after = applyAll(flush, settlePeerLoans(flush))
    // Boardwalk is gone AND the remainder is halved: floor(floor(350 * 0.75) / 2).
    expect(borrowingBase(after, 'P1')).toBe(131)
  })

  it('takes only collateral the borrower still owns', () => {
    // A Task 10 forced liquidation outranks a peer pledge, so the deed may already be gone.
    const gone = withPlayers(
      withDeeds(settling, [deed('boardwalk', 400, { owner: 'bank', group: 'dark-blue' })]),
      { P1: { cleanCash: 500 } },
    )
    const after = applyAll(gone, settlePeerLoans(gone))
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.status).toBe('defaulted')
  })

  it('sends the collateral to whoever holds the note, not to whoever wrote it', () => {
    const openPhase = { ...settling, phase: 'open' as const }
    const sold = applyAll(openPhase, eventsOf(decideCredit(openPhase, {
      type: 'SellPeerLoanNote', player: 'P2', id: 'pl:P2:P1:8', to: 'P3', price: 400,
    })))
    const due = withPlayers({ ...sold, phase: 'settlement' as const }, { P1: { cleanCash: 500 } })
    expect(settlePeerLoans(due)).toContainEqual({
      type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P3', writtenOff: 600,
    })
    expect(applyAll(due, settlePeerLoans(due)).deeds.boardwalk?.owner).toBe('P3')
  })

  it('SPEC 19.10: a second default does not halve the base again', () => {
    // Both loans are uncollateralised, so nothing but the halving can move the base.
    // Gross base = floor((400 + 350 + 60) * 0.75) = floor(607.5) = 607.
    const twice = withLoans(
      withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), [
        ...BORROWER_DEEDS,
        deed('baltic', 60, { owner: 'P1', group: 'brown' }),
      ]),
      [
        loan('pl:P2:P1:8', { collateral: [], maturesAtRound: 12, outstanding: 600 }),
        loan('pl:P3:P1:9', { lender: 'P3', collateral: [], maturesAtRound: 12, outstanding: 400 }),
      ],
    )
    const flush = withPlayers(twice, { P1: { cleanCash: 5000 } })
    expect(borrowingBase(flush, 'P1')).toBe(607)

    const events = settlePeerLoans(flush)
    expect(events.filter((e) => e.type === 'PeerLoanDefaulted')).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 600 },
      { type: 'PeerLoanDefaulted', id: 'pl:P3:P1:9', collateralTo: 'P3', writtenOff: 400 },
    ])

    const afterFirst = applyAll(flush, events.slice(0, 2))
    expect(afterFirst.players.P1.creditImpaired).toBe(true)
    expect(borrowingBase(afterFirst, 'P1')).toBe(303) // floor(607 / 2)

    const afterBoth = applyAll(flush, events)
    expect(borrowingBase(afterBoth, 'P1')).toBe(303) // NOT floor(303 / 2) === 151
    expect(afterBoth.players.P1.creditImpaired).toBe(true)
  })

  it('SPEC 19.10: a second default still takes collateral and still writes the balance off', () => {
    const impaired = withPlayers(
      withLoans(
        withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
        [loan('pl:P3:P1:9', {
          lender: 'P3', collateral: ['park-place'], maturesAtRound: 12, outstanding: 400,
        })],
      ),
      { P1: { cleanCash: 5000, creditImpaired: true } },
    )
    const after = applyAll(impaired, settlePeerLoans(impaired))
    expect(after.deeds['park-place']?.owner).toBe('P3')
    expect(findPeerLoan(after, 'pl:P3:P1:9')?.outstanding).toBe(0)
    expect(borrowingBase(after, 'P1')).toBe(150) // floor(floor(400 * 0.75) / 2), halved once
  })

  it('SPEC 19.1: step 4 capitalisation can push step 5 over the edge', () => {
    // Base 562, drawn 500, no cash, Era IV at 12%. Peer coupon is 40.
    // Before step 4 the headroom is 62 and the coupon capitalises comfortably.
    const eraIV = withLoans(
      withDeeds(gameState({ era: 4, round: 20, phase: 'settlement' }), BORROWER_DEEDS),
      [loan('pl:P2:P1:8', { outstanding: 400, ratePerRound: 0.1, maturesAtRound: 24 })],
    )
    const start = withPlayers(eraIV, { P1: { cleanCash: 0, drawnCredit: 500 } })
    expect(creditHeadroom(start, 'P1')).toBe(62)
    expect(settlePeerLoans(start)[0]).toEqual({
      type: 'PeerLoanInterestPaid', id: 'pl:P2:P1:8', amount: 40,
    })

    // Step 4 charges floorPercent(500, 0.12) = 60, which the player cannot pay, so it
    // capitalises and leaves 2 of headroom. Now the same coupon is a default.
    const afterStep4 = applyAll(start, [
      { type: 'InterestAccrued', player: 'P1', amount: 60, rate: 0.12 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 60, obligation: 'interest' },
    ])
    expect(creditHeadroom(afterStep4, 'P1')).toBe(2)
    expect(settlePeerLoans(afterStep4)).toEqual([
      { type: 'PeerLoanDefaulted', id: 'pl:P2:P1:8', collateralTo: 'P2', writtenOff: 400 },
    ])
  })
})

describe('a defaulted note inside a live pool (spec 19.4)', () => {
  const pooled = {
    ...withLoans(
      withDeeds(gameState({ era: 3, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
      [loan('pl:P2:P1:8', { collateral: ['boardwalk'], maturesAtRound: 12 })],
    ),
    pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
  }
  const flush = withPlayers(pooled, { P1: { cleanCash: 5000 } })

  it('still defaults, and still impairs and writes off, exactly as an unpooled note does', () => {
    const after = applyAll(flush, settlePeerLoans(flush))
    const closed = findPeerLoan(after, 'pl:P2:P1:8')
    expect(closed?.status).toBe('defaulted')
    expect(closed?.outstanding).toBe(0)
    expect(after.players.P1.creditImpaired).toBe(true)
  })

  it('does NOT move the collateral, because securitization sells it to the bank', () => {
    // Deeds cannot be distributed through a waterfall, only cash. If credit handed
    // boardwalk to P2 here, securitization's PoolCollateralLiquidated would then hand the
    // same deed to the bank and the pool would collect cash for a deed it never held.
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(after.deeds.boardwalk?.owner).toBe('P1')
    // The final coupon (spec section 7 point 7) is still cash, and pooling only ever
    // blocks a TRANSFER of the note or its collateral — it is paid exactly as an
    // unpooled loan's would be, matching the sibling default-at-maturity test above.
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 60)
  })

  it('leaves the collateral list intact for securitization to read at step 6', () => {
    // Step 5 defaults the loan; step 6 runs the waterfall. The list must survive between.
    const after = applyAll(flush, settlePeerLoans(flush))
    expect(findPeerLoan(after, 'pl:P2:P1:8')?.collateral).toEqual(['boardwalk'])
    expect(poolHoldingLoan(after, 'pl:P2:P1:8')).toBe('pool-1')
  })

  it('exposes the conversion price securitization needs, floored per deed', () => {
    expect(collateralLiquidationProceeds(flush, theLoan(flush))).toBe(320) // 400 * 0.80
    const two = withLoans(
      withDeeds(gameState({ era: 3, round: 12 }), [
        deed('st-james', 180, { owner: 'P1' }),
        deed('tennessee', 180, { owner: 'P1' }),
      ]),
      [loan('pl:P2:P1:8', { collateral: ['st-james', 'tennessee'] })],
    )
    // Floored per deed and then summed, which is the rule securitization applies too.
    expect(collateralLiquidationProceeds(two, theLoan(two))).toBe(288)
    expect(collateralLiquidationProceeds(two, loan('pl:X', { collateral: ['nonexistent'] }))).toBe(0)
  })

  it('DOES move the collateral once the pool has terminated', () => {
    const dead = {
      ...flush,
      pools: [pool('pool-1', {
        assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }], terminated: true,
      })],
    }
    expect(applyAll(dead, settlePeerLoans(dead)).deeds.boardwalk?.owner).toBe('P2')
  })
})

describe('money conservation across peer loans (spec section 20)', () => {
  // sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury must be invariant.
  // A peer loan is a player-to-player transfer end to end, so every event in this
  // context needs no Treasury leg at all, unlike credit-line interest and carrying cost.

  it('conserves money through a full origination / interest / repayment lifecycle', () => {
    const table = withDeeds(gameState(ERA_II), BORROWER_DEEDS)
    const baseline = totalMoney(table)

    const originated = applyAll(table, eventsOf(decideCredit(table, originate())))
    expect(totalMoney(originated)).toBe(baseline)

    const settling = { ...originated, round: 9, phase: 'settlement' as const }
    const afterInterest = applyAll(settling, settlePeerLoans(settling))
    expect(totalMoney(afterInterest)).toBe(baseline)

    const openAgain = { ...afterInterest, phase: 'open' as const }
    const repaid = applyAll(openAgain, eventsOf(decideCredit(openAgain, {
      type: 'RepayPeerLoan', player: 'P1', id: 'pl:P2:P1:8', amount: 600,
    })))
    expect(totalMoney(repaid)).toBe(baseline)
  })

  it('conserves money across a default, including one inside a live pool', () => {
    const settling = withLoans(
      withDeeds(gameState({ era: 2, round: 12, phase: 'settlement' }), BORROWER_DEEDS),
      [loan('pl:P2:P1:8', { collateral: ['boardwalk'], maturesAtRound: 12 })],
    )
    const flush = withPlayers(settling, { P1: { cleanCash: 500 } })
    const baseline = totalMoney(flush)
    expect(totalMoney(applyAll(flush, settlePeerLoans(flush)))).toBe(baseline)

    const pooled = {
      ...flush,
      pools: [pool('pool-1', { assets: [{ kind: 'peer-loan' as const, id: 'pl:P2:P1:8' }] })],
    }
    expect(totalMoney(applyAll(pooled, settlePeerLoans(pooled)))).toBe(totalMoney(pooled))
  })
})
