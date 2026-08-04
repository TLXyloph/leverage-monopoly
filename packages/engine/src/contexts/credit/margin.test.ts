import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { CreditPorts } from './decide.js'
import { decideCredit } from './decide.js'
import { applyAll, deed, eventsOf, gameState, rejectionOf, withDeeds, withPlayers } from './fixture.js'
import {
  borrowingBase, liquidationPrice, liquidationQueue, marginShortfall, playersAwaitingLiquidation,
} from './selectors.js'
import {
  exhaustLiquidation, flagMarginCalls, settleCarryingCost, settleCreditInterest, settleDistressedDebt,
} from './settlement.js'

/**
 * sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury. Mirrors
 * `credit.test.ts`'s identically-named helper exactly, so both files read the identity
 * the same way. Every event in this file — including `DistressedDebtAccrued` — leaves
 * this figure invariant; see the "money conservation" describe block at the bottom.
 */
function totalMoney(state: GameState): number {
  return (
    Object.values(state.players)
      .reduce((t, p) => t + p.cleanCash - p.drawnCredit - p.distressedDebt, 0) + state.treasury
  )
}

const SEVEN_DEEDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) =>
  deed(id, 200, { owner: 'P1' }),
)

describe('margin flagging, Settlement step 10 (spec section 5)', () => {
  it('flags a position whose drawn balance exceeds the borrowing base', () => {
    const s = withPlayers(withDeeds(gameState({ round: 4 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200 }, // base is 1050
    })
    expect(flagMarginCalls(s)).toEqual([
      { type: 'MarginCallFlagged', player: 'P1', shortfall: 150 },
    ])
    expect(applyAll(s, flagMarginCalls(s)).players.P1.marginCallFlaggedAt).toBe(4)
  })

  it('does not flag a position drawn exactly to the base', () => {
    const s = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), { P1: { drawnCredit: 1050 } })
    expect(flagMarginCalls(s)).toEqual([])
  })

  it('leaves an already-flagged position flagged, emitting nothing', () => {
    const s = withPlayers(withDeeds(gameState({ round: 5 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200, marginCallFlaggedAt: 4 },
    })
    expect(flagMarginCalls(s)).toEqual([])
    expect(s.players.P1.marginCallFlaggedAt).toBe(4) // the clock does not restart
  })

  it('clears the flag when the position is back inside the base', () => {
    const s = withPlayers(withDeeds(gameState({ round: 5 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 900, marginCallFlaggedAt: 4 },
    })
    expect(flagMarginCalls(s)).toEqual([{ type: 'MarginCallCured', player: 'P1' }])
    expect(applyAll(s, flagMarginCalls(s)).players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('flags on the capitalisation produced at step 4 of the same Settlement', () => {
    // Base 1050, drawn 1010, cash 60. Step 3 (carrying cost, 7 * 8 = 56) is paid in full
    // from cash, leaving 4. Step 4 interest is floorPercent(1010, 0.05) = 50; cash covers
    // only 4 of it, so only the true shortfall (46) capitalises per spec 19.8's "clean
    // cash, to the extent available" waterfall (Task 9) — never the full 50. Drawn
    // balance: 1010 + 46 = 1056; shortfall against the 1050 base is 6.
    const start = withPlayers(withDeeds(gameState({ round: 3 }), SEVEN_DEEDS), {
      P1: { cleanCash: 60, drawnCredit: 1010 },
    })
    const afterStep3 = applyAll(start, settleCarryingCost(start))
    const afterStep4 = applyAll(afterStep3, settleCreditInterest(afterStep3))
    const afterStep8 = applyAll(afterStep4, settleDistressedDebt(afterStep4))
    expect(flagMarginCalls(afterStep8)).toEqual([
      { type: 'MarginCallFlagged', player: 'P1', shortfall: 6 },
    ])
  })

  it('does not flag on a step-9 audit fine, which is distressed debt, not drawn credit', () => {
    // Spec 19.8: an unpayable audit fine becomes distressed debt. Distressed debt sits
    // outside both the drawn balance and the borrowing base, so it cannot breach.
    const s = withPlayers(withDeeds(gameState({ round: 3 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1000, distressedDebt: 900, cleanCash: 0 },
    })
    expect(flagMarginCalls(s)).toEqual([])
  })

  it('marks a position for liquidation only after its cure window has passed', () => {
    const flagged = withPlayers(withDeeds(gameState({ round: 4 }), SEVEN_DEEDS), {
      P1: { drawnCredit: 1200, marginCallFlaggedAt: 4 },
    })
    expect(playersAwaitingLiquidation(flagged)).toEqual([])                      // Settlement of round 4
    expect(playersAwaitingLiquidation({ ...flagged, round: 5 })).toEqual([])     // cure window
    expect(playersAwaitingLiquidation({ ...flagged, round: 6 })).toEqual(['P1']) // auction
  })
})

describe('forced liquidation at the start of the Open phase (spec 19.8)', () => {
  // P1 flagged at round 5, so the auction runs in the Open phase of round 7.
  // P1 owns boardwalk 400 and park-place 350: base = 750 * 0.75 = 562, drawn 800.
  const table = withPlayers(
    withDeeds(gameState({ round: 7 }), [
      deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
      deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      deed('baltic', 60, { owner: 'P1', mortgaged: true }),
    ]),
    {
      P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
      P2: { cleanCash: 1000 },
      P3: { cleanCash: 1000 },
      P4: { cleanCash: 100 },
    },
  )

  it('queues unmortgaged deeds only, in descending face value order', () => {
    expect(liquidationQueue(table, 'P1')).toEqual(['boardwalk', 'park-place'])
  })

  it('prices the floor at LIQUIDATION_FLOOR of face', () => {
    expect(liquidationPrice(deed('boardwalk', 400))).toBe(320) // 400 * 0.80
    expect(liquidationPrice(deed('park-place', 350))).toBe(280) // 350 * 0.80
  })

  it('sells to the highest eligible bid', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 340 }, { player: 'P3', amount: 330 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'P2', price: 340 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('P2')
    expect(after.players.P2.cleanCash).toBe(660)
    expect(after.players.P1.drawnCredit).toBe(460)
  })

  it('ignores bids below the 80% floor and hands the deed to the bank at exactly 80%', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 319 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'bank', price: 320 },
    ])
    const after = applyAll(table, events)
    expect(after.deeds.boardwalk?.owner).toBe('bank')
    expect(after.players.P2.cleanCash).toBe(1000)
    expect(after.players.P1.drawnCredit).toBe(480)
  })

  it('CONVERGES: every forced sale strictly narrows the shortfall', () => {
    // This is the property LIQUIDATION_FLOOR > DEED_ADVANCE_RATE exists to protect.
    // At a floor at or below the 75% advance rate each of these deltas would be
    // zero or positive, and the loop would never cure short of the whole portfolio.
    let s = table
    const shortfalls = [marginShortfall(s, 'P1')]
    for (const lot of ['boardwalk', 'park-place']) {
      s = applyAll(s, eventsOf(decideCredit(s, {
        type: 'SettleLiquidationLot', player: 'P1', deed: lot, bids: [], // bank at the floor
      })))
      shortfalls.push(marginShortfall(s, 'P1'))
    }
    expect(shortfalls).toEqual([238, 218, 200])
    // 400 * (0.80 - 0.75) = 20, then 350 * (0.80 - 0.75) = 17 (350 * 0.05 floors to 17)
    for (let i = 1; i < shortfalls.length; i += 1) {
      expect(shortfalls[i]).toBeLessThan(shortfalls[i - 1] ?? 0)
    }
  })

  it('breaks tied top bids by turn order', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P3', amount: 340 }, { player: 'P2', amount: 340 }],
    }))
    expect(events[0]).toMatchObject({ buyer: 'P2', price: 340 })
  })

  it('stops the auction the moment the position is cured', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 800 }],
    }))
    expect(events).toEqual([
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'P2', price: 800 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
    const after = applyAll(table, events)
    expect(after.players.P1.drawnCredit).toBe(0)
    expect(after.players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('returns proceeds beyond the drawn balance as clean cash', () => {
    const events = eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 900 }],
    }))
    expect(applyAll(table, events).players.P1.cleanCash).toBe(100)
  })

  it('enforces the descending-face lot order', () => {
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'park-place', bids: [],
    })).code).toBe('WRONG_LIQUIDATION_LOT')
  })

  it('refuses to auction a player with no marked position', () => {
    const clear = withPlayers(table, { P1: { marginCallFlaggedAt: null } })
    expect(rejectionOf(decideCredit(clear, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    })).code).toBe('NO_PENDING_LIQUIDATION')
  })

  it('refuses a bid larger than the bidder holds, and a bid from the debtor', () => {
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P4', amount: 500 }],
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
    expect(rejectionOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P1', amount: 500 }],
    })).code).toBe('NOT_OWNER')
  })
})

describe('developed deeds are stripped before auction (spec section 5)', () => {
  // P1 holds the full orange group, two houses on each. Face 200 + 180 + 180 = 560,
  // base = 420 + (6 * 100) * 0.5 = 420 + 300 = 720. Drawn 900, shortfall 180.
  const developed = withPlayers(
    withDeeds(gameState({ round: 7 }), [
      deed('new-york', 200, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
      deed('st-james', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
      deed('tennessee', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
    ]),
    { P1: { drawnCredit: 900, marginCallFlaggedAt: 5, cleanCash: 0 } },
  )

  it('strips the whole colour group first, then auctions the bare deed', () => {
    expect(borrowingBase(developed, 'P1')).toBe(720)
    const events = eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    }))
    expect(events).toEqual([
      { type: 'BuildingsStripped', player: 'P1',
        deeds: ['new-york', 'st-james', 'tennessee'], proceeds: 300 },
      { type: 'DeedLiquidated', player: 'P1', deed: 'new-york', buyer: 'bank', price: 160 },
    ])
    const after = applyAll(developed, events)
    expect(after.deeds['st-james']?.houses).toBe(0)
    expect(after.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY + 6)
    expect(after.deeds['new-york']?.owner).toBe('bank')
  })

  it('is exactly shortfall-neutral, because the two building constants are equal', () => {
    expect(ECONOMY.BUILDING_SELLBACK_RATE).toBe(ECONOMY.BUILDING_ADVANCE_RATE)
    const strip = eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    }))[0]
    const afterStrip = applyAll(developed, strip === undefined ? [] : [strip])
    // base falls by 300, drawn falls by 300, so the shortfall does not move at all.
    expect(marginShortfall(developed, 'P1')).toBe(180)
    expect(borrowingBase(afterStrip, 'P1')).toBe(420)
    expect(afterStrip.players.P1.drawnCredit).toBe(600)
    expect(marginShortfall(afterStrip, 'P1')).toBe(180)
  })

  it('still converges once the bare deed is auctioned', () => {
    const after = applyAll(developed, eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    })))
    expect(marginShortfall(after, 'P1')).toBe(170) // 180 - 200 * (0.80 - 0.75)
  })
})

/** Stands in for the markets context until Task 15 lands. Spec 19.12. */
const PORTS: CreditPorts = {
  rentFutureMakeWhole: () => 90,
  deedOptionRefund: () => 25,
}

describe('liquidation extinguishes encumbrances (spec 19.12)', () => {
  const encumbered = withPlayers(
    {
      ...withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      ]),
      futures: [{ id: 'fut-1', deed: 'boardwalk', holder: 'P3', startRound: 6, endRound: 12 }],
      options: [{ id: 'opt-1', deed: 'boardwalk', writer: 'P1', holder: 'P2', premium: 25, strike: 1, expiry: 20 }],
    },
    {
      P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
      P2: { cleanCash: 1000 }, P3: { cleanCash: 1000 },
    },
  )

  it('is NOT blocked by an outstanding deed option on the lot', () => {
    // The anti-exploit property. A distressed player writing a $1 option on every deed
    // must not become judgment-proof. If anyone reintroduces a transferability guard,
    // this fails loudly.
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    expect(events.some((e) => e.type === 'DeedLiquidated')).toBe(true)
  })

  it('makes the future holder whole, refunds the option premium, then auctions clean', () => {
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    expect(events).toEqual([
      { type: 'EncumbranceExtinguished', player: 'P1', deed: 'boardwalk', contract: 'fut-1',
        kind: 'rent-future', holder: 'P3', amount: 90 },
      { type: 'EncumbranceExtinguished', player: 'P1', deed: 'boardwalk', contract: 'opt-1',
        kind: 'deed-option', holder: 'P2', amount: 25 },
      { type: 'DeedLiquidated', player: 'P1', deed: 'boardwalk', buyer: 'bank', price: 320 },
    ])
  })

  it('adds both amounts to the shortfall, so encumbrances make the position worse', () => {
    expect(marginShortfall(encumbered, 'P1')).toBe(238)
    const events = eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))
    const extinguished = applyAll(encumbered, events.slice(0, 2))
    expect(extinguished.players.P3.cleanCash).toBe(1090)
    expect(extinguished.players.P2.cleanCash).toBe(1025)
    expect(extinguished.players.P1.drawnCredit).toBe(915) // 800 + 90 + 25
    expect(marginShortfall(extinguished, 'P1')).toBe(353) // strictly worse than 238

    const after = applyAll(encumbered, events)
    expect(marginShortfall(after, 'P1')).toBe(333) // the sale itself still narrows by 20
  })

  it('emits nothing extra for an unencumbered deed', () => {
    const clean = { ...encumbered, futures: [], options: [] }
    expect(eventsOf(decideCredit(clean, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS))).toHaveLength(1)
  })
})

describe('the second stop condition: no unmortgaged deeds left (spec section 5)', () => {
  it('writes the residual shortfall down to distressed debt', () => {
    const start = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      ]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 } },
    )
    let s = start
    for (const lot of ['boardwalk', 'park-place']) {
      s = applyAll(s, eventsOf(decideCredit(s, {
        type: 'SettleLiquidationLot', player: 'P1', deed: lot, bids: [],
      })))
    }
    expect(s.players.P1.drawnCredit).toBe(200)
    expect(liquidationQueue(s, 'P1')).toEqual([])

    const wind = exhaustLiquidation(s, 'P1')
    expect(wind).toEqual([
      { type: 'CreditWrittenDown', player: 'P1', amount: 200 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
    const done = applyAll(s, wind)
    expect(done.players.P1.drawnCredit).toBe(0)
    expect(done.players.P1.distressedDebt).toBe(200)
    expect(done.players.P1.marginCallFlaggedAt).toBe(null)
  })

  it('treats a portfolio of only mortgaged deeds as exhausted', () => {
    const mortgagedOnly = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', mortgaged: true }),
      ]),
      { P1: { drawnCredit: 300, marginCallFlaggedAt: 5 } },
    )
    expect(liquidationQueue(mortgagedOnly, 'P1')).toEqual([])
    expect(exhaustLiquidation(mortgagedOnly, 'P1')).toEqual([
      { type: 'CreditWrittenDown', player: 'P1', amount: 300 },
      { type: 'MarginCallCured', player: 'P1' },
    ])
  })

  it('does nothing while unmortgaged deeds remain, or when the position is cured', () => {
    const remaining = withPlayers(
      withDeeds(gameState({ round: 7 }), [deed('boardwalk', 400, { owner: 'P1' })]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5 } },
    )
    expect(exhaustLiquidation(remaining, 'P1')).toEqual([])
    expect(exhaustLiquidation(gameState(), 'P1')).toEqual([])
  })
})

describe('distressed debt (spec 5, 19.7 and 19.8)', () => {
  it('compounds at DISTRESSED_DEBT_RATE per round, floored each round', () => {
    let s = withPlayers(gameState(), { P1: { distressedDebt: 100 } })
    const trace: number[] = []
    for (let round = 0; round < 3; round += 1) {
      s = applyAll(s, settleDistressedDebt(s))
      trace.push(s.players.P1.distressedDebt)
    }
    // 100 + 15 = 115; 115 + floor(17.25) = 132; 132 + floor(19.8) = 151
    expect(trace).toEqual([115, 132, 151])
    expect(ECONOMY.DISTRESSED_DEBT_RATE).toBe(0.15)
  })

  it('is never swept from spare clean cash at Settlement, even though the Treasury still accrues it', () => {
    const rich = withPlayers(gameState(), { P1: { cleanCash: 5000, distressedDebt: 200 } })
    const after = applyAll(rich, settleDistressedDebt(rich))
    expect(after.players.P1.cleanCash).toBe(5000) // spare cash is never touched
    expect(after.players.P1.distressedDebt).toBe(230)
    expect(after.treasury).toBe(30) // accrued interest is Treasury income, symmetric with InterestAccrued
  })

  it('emits nothing for a player carrying none', () => {
    expect(settleDistressedDebt(gameState())).toEqual([])
  })

  it('is repayable in whole or in part during any Open phase', () => {
    const s = withPlayers(gameState(), { P1: { cleanCash: 500, distressedDebt: 230 } })
    const events = eventsOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 200,
    }))
    expect(events).toEqual([{ type: 'DistressedDebtRepaid', player: 'P1', amount: 200 }])
    const after = applyAll(s, events)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.distressedDebt).toBe(30)
  })

  it('refuses to repay more than is owed, or more than is held', () => {
    const s = withPlayers(gameState(), { P1: { cleanCash: 50, distressedDebt: 230 } })
    expect(rejectionOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 231,
    })).code).toBe('INVALID_AMOUNT')
    expect(rejectionOf(decideCredit(s, {
      type: 'RepayDistressedDebt', player: 'P1', amount: 200,
    })).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('never triggers an auction: only uncured margin calls do (spec 19.8)', () => {
    // Rent, audit fines, taxes and carrying cost all land here. None is liquidatable.
    const s = withPlayers(
      withDeeds(gameState({ round: 12 }), SEVEN_DEEDS),
      { P1: { cleanCash: 0, drawnCredit: 0, distressedDebt: 4000 } },
    )
    expect(flagMarginCalls(s)).toEqual([])
    expect(playersAwaitingLiquidation(s)).toEqual([])
  })
})

describe('money conservation across liquidation (spec section 20)', () => {
  // sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury must be
  // invariant across every transfer. Bank purchases — the stripped buildings and any
  // lot nobody bids on — need a Treasury counterparty or `applyAgainstDebt` manufactures
  // money out of nothing. Player purchases need no Treasury movement: the buyer's cash
  // and the debtor's falling drawn balance already net to zero.

  it('conserves money when the bank buys a bare, unencumbered lot', () => {
    const table = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        deed('park-place', 350, { owner: 'P1', group: 'dark-blue' }),
      ]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 } },
    )
    const baseline = totalMoney(table)
    const after = applyAll(table, eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    })))
    expect(after.treasury).toBe(-320) // the bank paid the 80% floor out of its own pocket
    expect(totalMoney(after)).toBe(baseline)
  })

  it('conserves money when a player outbids the floor: no Treasury movement at all', () => {
    const table = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
      ]),
      {
        P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
        P2: { cleanCash: 1000 },
      },
    )
    const baseline = totalMoney(table)
    const after = applyAll(table, eventsOf(decideCredit(table, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk',
      bids: [{ player: 'P2', amount: 340 }],
    })))
    expect(after.treasury).toBe(0)
    expect(totalMoney(after)).toBe(baseline)
  })

  it('conserves money when developed buildings strip back to the bank', () => {
    const developed = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('new-york', 200, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
        deed('st-james', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
        deed('tennessee', 180, { owner: 'P1', group: 'orange', houseCost: 100, houses: 2 }),
      ]),
      { P1: { drawnCredit: 900, marginCallFlaggedAt: 5, cleanCash: 0 } },
    )
    const baseline = totalMoney(developed)
    const events = eventsOf(decideCredit(developed, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'new-york', bids: [],
    }))
    const afterStrip = applyAll(developed, events.slice(0, 1))
    expect(afterStrip.treasury).toBe(-300) // the bank paid 50% of building cost back
    expect(totalMoney(afterStrip)).toBe(baseline)

    const afterAll = applyAll(developed, events)
    expect(afterAll.treasury).toBe(-300 - 160) // strip proceeds, then the bare-deed floor
    expect(totalMoney(afterAll)).toBe(baseline)
  })

  it('conserves money when encumbrances are extinguished: a pure player-to-player transfer', () => {
    const encumbered = withPlayers(
      {
        ...withDeeds(gameState({ round: 7 }), [
          deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
        ]),
        futures: [{ id: 'fut-1', deed: 'boardwalk', holder: 'P3', startRound: 6, endRound: 12 }],
        options: [
          { id: 'opt-1', deed: 'boardwalk', writer: 'P1', holder: 'P2', premium: 25, strike: 1, expiry: 20 },
        ],
      },
      {
        P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 },
        P2: { cleanCash: 1000 }, P3: { cleanCash: 1000 },
      },
    )
    const baseline = totalMoney(encumbered)
    const after = applyAll(encumbered, eventsOf(decideCredit(encumbered, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    }, PORTS)))
    expect(totalMoney(after)).toBe(baseline)
  })

  it('conserves money through the write-down: relabelling drawn credit as distressed debt', () => {
    const start = withPlayers(
      withDeeds(gameState({ round: 7 }), [
        deed('boardwalk', 400, { owner: 'P1', group: 'dark-blue' }),
      ]),
      { P1: { drawnCredit: 800, marginCallFlaggedAt: 5, cleanCash: 0 } },
    )
    const afterAuction = applyAll(start, eventsOf(decideCredit(start, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'boardwalk', bids: [],
    })))
    const baseline = totalMoney(afterAuction)
    const wound = applyAll(afterAuction, exhaustLiquidation(afterAuction, 'P1'))
    expect(wound.players.P1.distressedDebt).toBe(480) // 800 - 320
    expect(totalMoney(wound)).toBe(baseline)
  })

  it('conserves money through distressed-debt compounding: accrued interest is Treasury income', () => {
    // Symmetric with InterestAccrued (Task 9): the bank recognises accrued interest as
    // income the moment it accrues, not only once cash physically changes hands. The
    // 15% rate and its deduction from net worth at scoring are what make distressed debt
    // a penalty — the identity itself carries no carve-out.
    const s = withPlayers(gameState(), { P1: { distressedDebt: 100 } })
    const baseline = totalMoney(s)
    const after = applyAll(s, settleDistressedDebt(s))
    expect(after.treasury).toBe(15)
    expect(after.players.P1.distressedDebt).toBe(115)
    expect(totalMoney(after)).toBe(baseline)
  })
})
