import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { GameState, Swap } from '../../core/state.js'
import { decideCredit } from './decide.js'
import { deed, gameState, applyAll, eventsOf, rejectionOf, withDeeds, withPlayers } from './fixture.js'
import { reduceCredit } from './reduce.js'
import {
  borrowingBase, carryingCostFor, creditHeadroom, creditInterestDue,
  drawnCredit, prevailingRate, swapCollateralPosted,
} from './selectors.js'
import { STIMULUS_ROUND, advanceEraIIStimulus, settleCarryingCost, settleCreditInterest } from './settlement.js'

function swap(id: string, patch: Partial<Swap> = {}): Swap {
  return {
    id,
    buyer: 'P2',
    seller: 'P1',
    reference: { kind: 'peer-loan', id: 'placeholder-loan' },
    notional: 500,
    premiumPerRound: 10,
    status: 'active',
    ...patch,
  }
}

/**
 * sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury. Every credit-line
 * transaction must leave this constant: it either moves cash between a player and the
 * Treasury, or it moves it between clean cash and drawn credit within one player.
 */
function totalMoney(state: GameState): number {
  return (
    Object.values(state.players)
      .reduce((t, p) => t + p.cleanCash - p.drawnCredit - p.distressedDebt, 0) + state.treasury
  )
}

describe('borrowing base (spec section 5)', () => {
  it('advances DEED_ADVANCE_RATE against unmortgaged deed face value', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('park-place', 350, { owner: 'P1' }),
    ])
    // (400 + 350) * 0.75 = 562.5, floored to 562
    expect(borrowingBase(s, 'P1')).toBe(562)
    expect(borrowingBase(s, 'P1')).toBe(floorPercent(750, ECONOMY.DEED_ADVANCE_RATE))
  })

  it('excludes mortgaged deeds entirely', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('park-place', 350, { owner: 'P1', mortgaged: true }),
    ])
    expect(borrowingBase(s, 'P1')).toBe(300) // 400 * 0.75
  })

  it('advances BUILDING_ADVANCE_RATE against building cost', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1', houses: 3, houseCost: 200 }),
    ])
    // deeds 400 * 0.75 = 300, buildings (3 * 200) * 0.5 = 300
    expect(borrowingBase(s, 'P1')).toBe(600)
  })

  it('counts only deeds the player actually owns', () => {
    const s = withDeeds(gameState(), [
      deed('boardwalk', 400, { owner: 'P1' }),
      deed('marvin-gardens', 280, { owner: 'P2' }),
      deed('baltic', 60, { owner: null }),
    ])
    expect(borrowingBase(s, 'P1')).toBe(300)
    expect(borrowingBase(s, 'P2')).toBe(210)
  })

  it('halves the base permanently once the player is credit-impaired', () => {
    const clean = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])
    const impaired = withPlayers(clean, { P1: { creditImpaired: true } })
    expect(borrowingBase(clean, 'P1')).toBe(300)
    expect(borrowingBase(impaired, 'P1')).toBe(150)
  })

  it('rounds the impairment halving down', () => {
    const clean = withDeeds(gameState(), [deed('park-place', 350, { owner: 'P1' })])
    const impaired = withPlayers(clean, { P1: { creditImpaired: true } })
    expect(borrowingBase(clean, 'P1')).toBe(262)    // 350 * 0.75 = 262.5 -> 262
    expect(borrowingBase(impaired, 'P1')).toBe(131) // floor(262 / 2)
  })

  it('reports headroom net of the drawn balance, and lets it go negative', () => {
    const base = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])
    expect(creditHeadroom(withPlayers(base, { P1: { drawnCredit: 120 } }), 'P1')).toBe(180)
    expect(creditHeadroom(withPlayers(base, { P1: { drawnCredit: 400 } }), 'P1')).toBe(-100)
  })
})

describe('CDS collateral nets out of the borrowing base (spec section 8)', () => {
  const table = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])

  it('posts CDS_COLLATERAL_RATE of notional per active swap the player sold', () => {
    expect(ECONOMY.CDS_COLLATERAL_RATE).toBe(0.3)
    const one = { ...table, swaps: [swap('cds-1', { notional: 500 })] }
    expect(swapCollateralPosted(one, 'P1')).toBe(150) // floorPercent(500, 0.3)
    const two = { ...table, swaps: [swap('cds-1'), swap('cds-2', { notional: 250 })] }
    expect(swapCollateralPosted(two, 'P1')).toBe(225) // 150 + 75
  })

  it('counts only swaps this player SOLD, and only while active', () => {
    const mixed = {
      ...table,
      swaps: [
        swap('cds-1', { seller: 'P1', notional: 500 }),
        swap('cds-2', { seller: 'P2', notional: 500 }),
        swap('cds-3', { seller: 'P1', notional: 500, status: 'triggered' as const }),
        swap('cds-4', { seller: 'P1', notional: 500, status: 'expired' as const }),
      ],
    }
    expect(swapCollateralPosted(mixed, 'P1')).toBe(150)
    expect(swapCollateralPosted(mixed, 'P2')).toBe(150)
    expect(swapCollateralPosted(mixed, 'P3')).toBe(0)
  })

  it('subtracts posted collateral from the borrowing base, straight through to headroom', () => {
    expect(borrowingBase(table, 'P1')).toBe(300)
    const written = { ...table, swaps: [swap('cds-1', { notional: 500 })] }
    expect(borrowingBase(written, 'P1')).toBe(150)
    expect(creditHeadroom(written, 'P1')).toBe(150)
  })

  it('floors the base at zero when posted collateral exceeds it, but headroom stays signed', () => {
    const overwritten = { ...table, swaps: [swap('cds-1', { notional: 1000 })] }
    expect(swapCollateralPosted(overwritten, 'P1')).toBe(300)
    expect(borrowingBase(overwritten, 'P1')).toBe(0)
    expect(creditHeadroom(withPlayers(overwritten, { P1: { drawnCredit: 40 } }), 'P1')).toBe(-40)
  })

  it('halves for impairment BEFORE netting collateral, not after', () => {
    // halve-then-net: 300 -> 150, then 150 - 150 = 0. net-then-halve would give 75.
    const impaired = withPlayers(
      { ...table, swaps: [swap('cds-1', { notional: 500 })] },
      { P1: { creditImpaired: true } },
    )
    expect(borrowingBase(impaired, 'P1')).toBe(0)
  })

  it('reports the drawn balance directly', () => {
    expect(drawnCredit(withPlayers(table, { P1: { drawnCredit: 275 } }), 'P1')).toBe(275)
    expect(drawnCredit(table, 'P2')).toBe(0)
  })
})

describe('carrying cost and the prevailing rate', () => {
  it('charges CARRYING_COST_PER_DEED per unmortgaged deed, and nothing for buildings', () => {
    const s = withDeeds(gameState(), [
      deed('a', 100, { owner: 'P1', houses: 4 }),
      deed('b', 120, { owner: 'P1' }),
      deed('c', 140, { owner: 'P1', mortgaged: true }),
      deed('d', 160, { owner: 'P2' }),
    ])
    expect(carryingCostFor(s, 'P1')).toBe(2 * ECONOMY.CARRYING_COST_PER_DEED)
    expect(carryingCostFor(s, 'P2')).toBe(ECONOMY.CARRYING_COST_PER_DEED)
  })

  it('reads the prevailing rate from the current era', () => {
    expect(prevailingRate(gameState({ era: 1 }))).toBe(ECONOMY.INTEREST_RATE_BY_ERA[1])
    expect(prevailingRate(gameState({ era: 4 }))).toBe(ECONOMY.INTEREST_RATE_BY_ERA[4])
  })

  it('floors credit interest to whole dollars', () => {
    const s = withPlayers(gameState({ era: 3 }), { P1: { drawnCredit: 507 } })
    expect(creditInterestDue(s, 'P1')).toBe(40) // 507 * 0.08 = 40.56 -> 40
  })
})

describe('drawing and repaying the credit line', () => {
  const table = withDeeds(gameState(), [deed('boardwalk', 400, { owner: 'P1' })])

  it('credits clean cash and raises the drawn balance', () => {
    const events = eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 250 }))
    expect(events).toEqual([{ type: 'CreditDrawn', player: 'P1', amount: 250 }])
    const after = applyAll(table, events)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 250)
    expect(after.players.P1.drawnCredit).toBe(250)
    expect(after.treasury).toBe(0) // principal is bank money, not Treasury money
    expect(totalMoney(after)).toBe(totalMoney(table))
  })

  it('refuses a draw beyond the borrowing base, and allows one exactly to it', () => {
    expect(rejectionOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 301 })).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
    const at = eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 300 }))
    expect(applyAll(table, at).players.P1.drawnCredit).toBe(300)
  })

  it('refuses a zero, negative or fractional draw', () => {
    for (const amount of [0, -50, 12.5]) {
      expect(rejectionOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount })).code)
        .toBe('INVALID_AMOUNT')
    }
  })

  it('refuses any credit action outside the Open phase', () => {
    const settling = { ...table, phase: 'settlement' as const }
    expect(rejectionOf(decideCredit(settling, { type: 'DrawCredit', player: 'P1', amount: 10 })).code)
      .toBe('WRONG_PHASE')
  })

  it('repays from clean cash and lowers the drawn balance', () => {
    const drawn = withPlayers(table, { P1: { cleanCash: 500, drawnCredit: 300 } })
    const events = eventsOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 200 }))
    expect(events).toEqual([{ type: 'CreditRepaid', player: 'P1', amount: 200 }])
    const after = applyAll(drawn, events)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.drawnCredit).toBe(100)
    expect(totalMoney(after)).toBe(totalMoney(drawn))
  })

  it('refuses to repay more than is drawn, or more clean cash than is held', () => {
    const drawn = withPlayers(table, { P1: { cleanCash: 50, drawnCredit: 300 } })
    expect(rejectionOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 301 })).code)
      .toBe('INVALID_AMOUNT')
    expect(rejectionOf(decideCredit(drawn, { type: 'RepayCredit', player: 'P1', amount: 200 })).code)
      .toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('lets a credit-impaired player draw only against the halved base', () => {
    const impaired = withPlayers(table, { P1: { creditImpaired: true } })
    expect(rejectionOf(decideCredit(impaired, { type: 'DrawCredit', player: 'P1', amount: 151 })).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')
    expect(eventsOf(decideCredit(impaired, { type: 'DrawCredit', player: 'P1', amount: 150 })))
      .toHaveLength(1)
  })

  it('conserves money identically across a full draw / carrying-cost / interest / repay sequence', () => {
    // One running identity across all four steps of the Open-to-Settlement path, so a
    // regression in any single reducer (draw, either Settlement step, or repay) shows
    // up here even if that step's own dedicated test happens to miss it.
    const baseline = totalMoney(table)

    const drawn = applyAll(
      table,
      eventsOf(decideCredit(table, { type: 'DrawCredit', player: 'P1', amount: 200 })),
    )
    expect(totalMoney(drawn)).toBe(baseline)

    const afterCarrying = applyAll(drawn, settleCarryingCost(drawn))
    expect(afterCarrying.treasury).toBe(8) // CARRYING_COST_PER_DEED, fully affordable
    expect(totalMoney(afterCarrying)).toBe(baseline)

    const afterInterest = applyAll(afterCarrying, settleCreditInterest(afterCarrying))
    expect(afterInterest.treasury).toBe(18) // 8 + floorPercent(200, 0.05), fully affordable
    expect(totalMoney(afterInterest)).toBe(baseline)

    const repaid = applyAll(
      afterInterest,
      eventsOf(decideCredit(afterInterest, { type: 'RepayCredit', player: 'P1', amount: 150 })),
    )
    expect(repaid.players.P1.drawnCredit).toBe(50) // 200 - 150
    expect(totalMoney(repaid)).toBe(baseline)
  })
})

describe('the capped/uncapped asymmetry (spec 19.8) — the only source of a margin call', () => {
  it('caps a VOLUNTARY draw at the borrowing base, but lets an AUTOMATIC obligation capitalise past it', () => {
    const atCap = withPlayers(
      withDeeds(gameState(), [deed('baltic', 100, { owner: 'P1' })]),
      { P1: { drawnCredit: 75, cleanCash: 0 } },
    )
    // borrowingBase = floorPercent(100, 0.75) = 75; headroom is exactly zero.
    expect(borrowingBase(atCap, 'P1')).toBe(75)
    expect(creditHeadroom(atCap, 'P1')).toBe(0)

    // A voluntary draw of even $1 is refused: draws are always capped at the base.
    expect(rejectionOf(decideCredit(atCap, { type: 'DrawCredit', player: 'P1', amount: 1 })).code)
      .toBe('INSUFFICIENT_BORROWING_BASE')

    // But Settlement's carrying cost ($8, unpayable from $0 clean cash) capitalises in
    // full, with NO borrowing-base check, and pushes the player straight past their base.
    const events = settleCarryingCost(atCap)
    expect(events).toContainEqual(
      { type: 'ObligationCapitalised', player: 'P1', amount: 8, obligation: 'carrying-cost' },
    )
    const after = applyAll(atCap, events)
    expect(after.players.P1.drawnCredit).toBe(83)
    expect(creditHeadroom(after, 'P1')).toBe(-8) // now in breach: exactly a margin call
    expect(totalMoney(after)).toBe(totalMoney(atCap))
  })
})

describe('Settlement steps 3 and 4, in spec 19.1 order', () => {
  // Base = (7 * 200) * 0.75 = 1050. Carrying cost = 7 * 8 = 56.
  // Interest at era 1 on 1010 drawn = floor(1010 * 0.05) = floor(50.5) = 50.
  const SEVEN_DEEDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) =>
    deed(id, 200, { owner: 'P1' }),
  )
  const start = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), {
    P1: { cleanCash: 60, drawnCredit: 1010 },
  })

  it('charges carrying cost at step 3, to the Treasury in full', () => {
    const step3 = settleCarryingCost(start)
    expect(step3).toEqual([{ type: 'CarryingCostCharged', player: 'P1', deeds: 7, amount: 56 }])
    const after = applyAll(start, step3)
    expect(after.players.P1.cleanCash).toBe(4)
    expect(after.treasury).toBe(56)
    expect(totalMoney(after)).toBe(totalMoney(start))
  })

  it('capitalises the interest SHORTFALL at step 4, having spent the cash at step 3', () => {
    const afterStep3 = applyAll(start, settleCarryingCost(start))
    const step4 = settleCreditInterest(afterStep3)
    // Interest of 50 accrues in full; only the $46 clean cash cannot cover capitalises.
    expect(step4).toEqual([
      { type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 46, obligation: 'interest' },
    ])
    const after = applyAll(afterStep3, step4)
    expect(after.players.P1.cleanCash).toBe(0)      // the $4 it had went to the Treasury
    expect(after.players.P1.drawnCredit).toBe(1056) // 1010 + 46 capitalised, not +50
    expect(after.treasury).toBe(106)                // 56 + 50: the Treasury sees the FULL accrual
    expect(totalMoney(after)).toBe(totalMoney(start))
  })

  it('pays interest to the Treasury in full when the player can afford it', () => {
    const rich = withPlayers(start, { P1: { cleanCash: 900 } })
    const afterStep3 = applyAll(rich, settleCarryingCost(rich))
    const step4 = settleCreditInterest(afterStep3)
    expect(step4).toEqual([{ type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05 }])
    const after = applyAll(afterStep3, step4)
    expect(after.players.P1.cleanCash).toBe(794) // 900 - 56 - 50
    expect(after.players.P1.drawnCredit).toBe(1010)
    expect(after.treasury).toBe(106)
    expect(totalMoney(after)).toBe(totalMoney(rich))
  })

  it('capitalises only the true shortfall, never the whole obligation, once any cash pays part of it', () => {
    // 105 - 56 (step 3) = 49 left; interest of 50 is one dollar short, not fifty.
    const nearly = withPlayers(start, { P1: { cleanCash: 105 } })
    const afterStep3 = applyAll(nearly, settleCarryingCost(nearly))
    expect(settleCreditInterest(afterStep3)).toEqual([
      { type: 'InterestAccrued', player: 'P1', amount: 50, rate: 0.05 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 1, obligation: 'interest' },
    ])
  })

  it('capitalises an unpayable carrying cost into drawn credit — NOT distressed debt (spec 19.8)', () => {
    const broke = withPlayers(withDeeds(gameState(), SEVEN_DEEDS), { P1: { cleanCash: 20 } })
    const events = settleCarryingCost(broke)
    expect(events).toEqual([
      { type: 'CarryingCostCharged', player: 'P1', deeds: 7, amount: 56 },
      { type: 'ObligationCapitalised', player: 'P1', amount: 36, obligation: 'carrying-cost' },
    ])
    const after = applyAll(broke, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(36)
    expect(after.players.P1.distressedDebt).toBe(0) // distressed debt is Task 10's terminal state only
    expect(after.treasury).toBe(56)
    expect(totalMoney(after)).toBe(totalMoney(broke))
  })

  it('emits nothing for a player who owns no unmortgaged deeds', () => {
    expect(settleCarryingCost(gameState())).toEqual([])
    expect(settleCreditInterest(gameState())).toEqual([])
  })
})

describe('Era II stimulus (spec section 4)', () => {
  it('fires once, at the Market phase of round 7', () => {
    expect(STIMULUS_ROUND).toBe(7)
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market' })
    expect(advanceEraIIStimulus(market)).toEqual([
      { type: 'StimulusAdvanced', player: 'P1', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P2', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P3', amount: ECONOMY.ERA_II_STIMULUS },
      { type: 'StimulusAdvanced', player: 'P4', amount: ECONOMY.ERA_II_STIMULUS },
    ])
  })

  it('fires in no other round and no other phase', () => {
    expect(advanceEraIIStimulus(gameState({ round: 6, era: 1, phase: 'market' }))).toEqual([])
    expect(advanceEraIIStimulus(gameState({ round: 8, era: 2, phase: 'market' }))).toEqual([])
    expect(advanceEraIIStimulus(gameState({ round: 7, era: 2, phase: 'open' }))).toEqual([])
  })

  it('is a loan: it lands on clean cash and on the drawn balance together, like any other draw', () => {
    // The stimulus is a COMPULSORY credit-line advance, not a fiscal transfer. It funds
    // identically to a voluntary CreditDrawn -- cash and debt both rise by the same
    // amount -- and so, exactly like CreditDrawn, leaves the Treasury untouched. The
    // Treasury's role is fiscal only: carrying cost, interest and taxes in; GO salary out.
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market', treasury: 5000 })
    const after = applyAll(market, advanceEraIIStimulus(market))
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + ECONOMY.ERA_II_STIMULUS)
    expect(after.players.P1.drawnCredit).toBe(ECONOMY.ERA_II_STIMULUS)
    expect(after.treasury).toBe(5000) // unchanged -- the same rule CreditDrawn already follows
    expect(totalMoney(after)).toBe(totalMoney(market))
  })

  it('preserves the conservation identity across all four players taking the stimulus at once', () => {
    // Pinned directly: this is the exact property that a Treasury debit here would
    // break, at exactly $1,200 (4 players x $300) if it regressed.
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market', treasury: 5000 })
    const after = applyAll(market, advanceEraIIStimulus(market))
    expect(totalMoney(after)).toBe(totalMoney(market))
    expect(totalMoney(after) - totalMoney(market)).toBe(0)
  })

  it('accrues at the Era II rate from that same round', () => {
    const market = gameState({ round: STIMULUS_ROUND, era: 2, phase: 'market' })
    const advanced = applyAll(market, advanceEraIIStimulus(market))
    const settling = { ...advanced, phase: 'settlement' as const }
    expect(settleCreditInterest(settling)[0]).toEqual({
      type: 'InterestAccrued', player: 'P1', amount: 18, rate: 0.06,
    }) // floor(300 * 0.06) = 18, and every player can easily afford it
  })
})

describe('reduceCredit stays total for events it does not own', () => {
  it('passes state through unchanged for an event from another context', () => {
    const state = gameState()
    expect(reduceCredit(state, { type: 'RoundAdvanced', round: 2 })).toBe(state)
  })
})
