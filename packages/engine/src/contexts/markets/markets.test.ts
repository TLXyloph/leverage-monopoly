import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import type { GameState } from '../../core/state.js'
import { PLAYER_IDS } from '../../core/types.js'
import { activeFutureOn, landingProbability, rentRecipient } from '../board/index.js'
import { boardwalk, stJames, testState } from './fixture.js'
import {
  expectedHitsPerRound, markRentFuture, poissonQuantile, roundsRemaining,
  valueRentFuture, valueWindow,
} from './valuation.js'
import {
  decideMarkets, expireRentFutures, makeWholeOnMortgage, rentFutureId,
} from './decide.js'
import type { OriginateRentFuture } from './decide.js'
import {
  isEncumbered, mortgageImpact, rentEvents, rentFutureMakeWhole, rentPayment,
  routingFutureFor,
} from './selectors.js'
import { reduceMarkets } from './reduce.js'

describe('rent future valuation kernel', () => {
  it('converts a per-roll probability to expected hits per round (spec 19.2)', () => {
    // 0.02 per roll x 3 obligors x 1.19 doubles correction = 0.0714
    expect(expectedHitsPerRound(0.02)).toBeCloseTo(0.0714, 10)
    expect(ECONOMY.RENT_OBLIGORS).toBe(3)
    expect(ECONOMY.DOUBLES_ROLL_MULTIPLIER).toBe(1.19)
  })

  it('returns zero expected hits for a square that cannot be rested on', () => {
    expect(expectedHitsPerRound(0)).toBe(0)
  })

  it('counts the current round as still live and clamps a lapsed window to zero', () => {
    expect(roundsRemaining(3, 5, 12)).toBe(8)
    expect(roundsRemaining(7, 5, 12)).toBe(6)
    expect(roundsRemaining(12, 5, 12)).toBe(1)
    expect(roundsRemaining(13, 5, 12)).toBe(0)
    expect(roundsRemaining(20, 5, 12)).toBe(0)
  })

  it('computes exact Poisson quantiles for the outcome band', () => {
    expect(poissonQuantile(0, 0.1)).toBe(0)
    expect(poissonQuantile(0, 0.9)).toBe(0)

    // lambda = 2: cdf 0.13534, 0.40601, 0.67668, 0.85713, 0.94735
    expect(poissonQuantile(2, ECONOMY.VALUATION_PERCENTILE_LOW)).toBe(0)
    expect(poissonQuantile(2, ECONOMY.VALUATION_PERCENTILE_HIGH)).toBe(4)

    // lambda = 5: cdf reaches 0.12465 at k=2 and 0.93191 at k=8
    expect(poissonQuantile(5, ECONOMY.VALUATION_PERCENTILE_LOW)).toBe(2)
    expect(poissonQuantile(5, ECONOMY.VALUATION_PERCENTILE_HIGH)).toBe(8)
  })
})

describe('rent future valuation, end to end', () => {
  it('prices a full 8-round window on an undeveloped St. James Place', () => {
    const state = testState({ round: 4 })

    // Golden fixture, spec section 20. Task 7 correction: landingProbability takes no
    // GameState argument. If Task 7 drifts, this is the tripwire.
    expect(landingProbability(16)).toBeCloseTo(0.027146, 6)

    const v = valueWindow(state, 'st-james-place', 5, 12)
    expect(v.roundsRemaining).toBe(8)
    // Computed from the FULL-PRECISION golden probability (0.0271456161...), not the
    // brief's own worked example, which rounded landingProbability to six decimals
    // before multiplying and so drifts by ~1.4e-6 — enough to fail at 8-decimal
    // precision even though it floors to the same whole-dollar expectedValue below.
    expect(v.expectedHitsPerRound).toBeCloseTo(0.09690984949182835, 8)
    expect(v.expectedHits).toBeCloseTo(0.7752787959346268, 8)
    expect(v.rentAtCurrentDevelopment).toBe(14)
    // floor(0.7752787959346268 x 14) = floor(10.8539...) = 10
    expect(v.expectedValue).toBe(10)
    // Poisson(0.77528): cdf(0) = 0.4606 >= 0.10, cdf(2) = 0.9561 >= 0.90
    expect(v.p10).toBe(0)
    expect(v.p90).toBe(28)
  })

  it('values a mortgaged deed at zero, since it collects no rent', () => {
    const state = testState({
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
      round: 4,
    })
    const v = valueWindow(state, 'st-james-place', 5, 12)
    expect(v.expectedValue).toBe(0)
    expect(v.p90).toBe(0)
    expect(v.rentAtCurrentDevelopment).toBe(0)
  })

  it('shrinks the value as the window burns down', () => {
    const early = valueWindow(testState({ round: 5 }), 'st-james-place', 5, 12)
    const late = valueWindow(testState({ round: 11 }), 'st-james-place', 5, 12)
    const done = valueWindow(testState({ round: 13 }), 'st-james-place', 5, 12)
    expect(early.expectedValue).toBeGreaterThan(late.expectedValue)
    expect(done.expectedValue).toBe(0)
    expect(done.roundsRemaining).toBe(0)
  })

  it('marks an outstanding contract at its remaining expected value', () => {
    const state = testState({
      round: 6,
      futures: [{
        id: 'rf:st-james-place:5-12',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 5,
        endRound: 12,
      }],
    })
    const v = valueRentFuture(state, 'rf:st-james-place:5-12')
    expect(v?.roundsRemaining).toBe(7)
    expect(markRentFuture(state, 'rf:st-james-place:5-12')).toBe(v?.expectedValue)
    expect(markRentFuture(state, 'rf:nonexistent:1-2')).toBe(0)
  })
})

function originate(over: Partial<OriginateRentFuture> = {}) {
  return {
    type: 'OriginateRentFuture' as const,
    player: 'P1' as const,
    deed: 'st-james-place',
    holder: 'P2' as const,
    startRound: 9,
    endRound: 16,
    price: 120,
    ...over,
  }
}

describe('rent future origination', () => {
  it('emits an origination event for a valid contract', () => {
    const result = decideMarkets(testState({ round: 8 }), originate())
    expect(isRejection(result)).toBe(false)
    expect(result).toEqual([{
      type: 'RentFutureOriginated',
      id: rentFutureId('st-james-place', 9, 16),
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
      price: 120,
    }])
  })

  it('rejects origination outside an Open phase', () => {
    const r = decideMarkets(testState({ round: 8, phase: 'settlement' }), originate())
    expect(r).toMatchObject({ rejected: true, code: 'WRONG_PHASE' })
  })

  it('rejects origination when rent futures have not unlocked this era', () => {
    const state = testState({ round: 8, unlockMode: 'progressive', era: 1 })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'INSTRUMENT_LOCKED_THIS_ERA' })
    const unlocked = testState({ round: 8, unlockMode: 'progressive', era: 2 })
    expect(isRejection(decideMarkets(unlocked, originate()))).toBe(false)
  })

  it('rejects a player who does not own the deed', () => {
    const r = decideMarkets(testState({ round: 8 }), originate({ player: 'P3' }))
    expect(r).toMatchObject({ rejected: true, code: 'NOT_OWNER' })
  })

  it('rejects origination on a mortgaged property', () => {
    const state = testState({
      round: 8,
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
    })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_MORTGAGED' })
  })

  it('allows at most one active contract per property', () => {
    const state = testState({
      round: 8,
      futures: [{
        id: 'rf:st-james-place:9-10',
        deed: 'st-james-place',
        holder: 'P4',
        startRound: 9,
        endRound: 10,
      }],
    })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('requires the window to begin after the round of origination', () => {
    const state = testState({ round: 8 })
    expect(decideMarkets(state, originate({ startRound: 8, endRound: 12 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideMarkets(state, originate({ startRound: 9, endRound: 12 }))))
      .toBe(false)
  })

  it('caps the window at MAX_FUTURE_WINDOW rounds', () => {
    const state = testState({ round: 8 })
    const maxEnd = 9 + ECONOMY.MAX_FUTURE_WINDOW - 1
    expect(isRejection(decideMarkets(state, originate({ startRound: 9, endRound: maxEnd }))))
      .toBe(false)
    expect(decideMarkets(state, originate({ startRound: 9, endRound: maxEnd + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
  })

  it('requires the window to end by the final round', () => {
    const state = testState({ round: 20 })
    expect(decideMarkets(state, originate({ startRound: 21, endRound: ECONOMY.TOTAL_ROUNDS + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideMarkets(
      state, originate({ startRound: 21, endRound: ECONOMY.TOTAL_ROUNDS }),
    ))).toBe(false)
  })

  it('rejects an inverted window', () => {
    expect(decideMarkets(testState({ round: 8 }), originate({ startRound: 14, endRound: 12 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
  })

  it('rejects a buyer who cannot pay the negotiated price', () => {
    const state = testState({ round: 8, cash: { P2: 100 } })
    expect(decideMarkets(state, originate({ price: 120 })))
      .toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('rejects a negative price and rejects selling a future to yourself', () => {
    const state = testState({ round: 8 })
    expect(decideMarkets(state, originate({ price: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideMarkets(state, originate({ holder: 'P1' })))
      .toMatchObject({ rejected: true, code: 'SELF_DEALING' })
  })

  it('rejects an unknown deed', () => {
    const state = testState({ round: 8, deeds: { boardwalk: boardwalk('P1') } })
    expect(decideMarkets(state, originate()))
      .toMatchObject({ rejected: true, code: 'DEED_UNAVAILABLE' })
  })
})

describe('rent future reducer', () => {
  it('records the contract and moves the price from holder to owner', () => {
    const before = testState({ round: 8, cash: { P1: 500, P2: 500 } })
    const after = reduceMarkets(before, {
      type: 'RentFutureOriginated',
      id: 'rf:st-james-place:9-16',
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
      price: 120,
    })
    expect(after.futures).toEqual([{
      id: 'rf:st-james-place:9-16',
      deed: 'st-james-place',
      holder: 'P2',
      startRound: 9,
      endRound: 16,
    }])
    expect(after.players.P1.cleanCash).toBe(620)
    expect(after.players.P2.cleanCash).toBe(380)
  })

  it('transfers the holder and the price on resale', () => {
    const before = testState({
      round: 10,
      cash: { P2: 500, P3: 500 },
      futures: [{
        id: 'rf:st-james-place:9-16',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 9,
        endRound: 16,
      }],
    })
    const after = reduceMarkets(before, {
      type: 'RentFutureSold', id: 'rf:st-james-place:9-16', from: 'P2', to: 'P3', price: 75,
    })
    expect(after.futures[0]?.holder).toBe('P3')
    expect(after.players.P2.cleanCash).toBe(575)
    expect(after.players.P3.cleanCash).toBe(425)
  })

  it('removes the contract on expiry and leaves cash untouched', () => {
    const before = testState({
      round: 16,
      futures: [{
        id: 'rf:st-james-place:9-16',
        deed: 'st-james-place',
        holder: 'P2',
        startRound: 9,
        endRound: 16,
      }],
    })
    const after = reduceMarkets(before, {
      type: 'RentFutureExpired', id: 'rf:st-james-place:9-16',
    })
    expect(after.futures).toEqual([])
    expect(after.players.P2.cleanCash).toBe(before.players.P2.cleanCash)
  })

  it('treats RentRoutedToFuture as an attribution marker that moves no money', () => {
    const before = testState({ round: 10 })
    const after = reduceMarkets(before, {
      type: 'RentRoutedToFuture',
      contract: 'rf:st-james-place:9-16',
      holder: 'P2',
      amount: 200,
    })
    expect(after).toBe(before)
  })

  it('ignores events belonging to other contexts', () => {
    const before = testState({ round: 10 })
    expect(reduceMarkets(before, { type: 'SalaryPaid', player: 'P1', amount: 350 }))
      .toBe(before)
  })
})

const CONTRACT = {
  id: 'rf:st-james-place:9-16',
  deed: 'st-james-place',
  holder: 'P2' as const,
  startRound: 9,
  endRound: 16,
}

function routed(round: number) {
  return testState({ round, futures: [CONTRACT] })
}

describe('rent routing during an active window', () => {
  it('routes rent to the holder when a third party lands', () => {
    const state = routed(10)
    expect(rentRecipient(state, 'st-james-place')).toBe('P2')
    expect(rentEvents(state, 'st-james-place', 'P3', 14)).toEqual([
      { type: 'RentCharged', from: 'P3', to: 'P2', deed: 'st-james-place', amount: 14 },
      { type: 'RentRoutedToFuture', contract: CONTRACT.id, holder: 'P2', amount: 14 },
    ])
  })

  it('SPEC 19.2: the owner landing on their own deed owes nothing, so no payment occurs', () => {
    const state = routed(10)
    expect(rentPayment(state, 'st-james-place', 'P1', 14)).toBeNull()
    expect(rentEvents(state, 'st-james-place', 'P1', 14)).toEqual([])
  })

  it('SPEC 19.2: the futures holder landing on a deed they do not own pays nothing', () => {
    const state = routed(10)
    // P2 holds the future, P1 owns the deed. P2 would owe rent to itself.
    expect(rentPayment(state, 'st-james-place', 'P2', 14)).toBeNull()
    expect(rentEvents(state, 'st-james-place', 'P2', 14)).toEqual([])
  })

  it('pays the owner before the window opens and after it closes', () => {
    const early = routed(8)
    expect(routingFutureFor(early, 'st-james-place')).toBeNull()
    expect(activeFutureOn(early, 'st-james-place')).toBeNull()
    expect(isEncumbered(early, 'st-james-place')).toBe(true)
    expect(rentRecipient(early, 'st-james-place')).toBe('P1')
    expect(rentEvents(early, 'st-james-place', 'P3', 14)).toEqual([
      { type: 'RentCharged', from: 'P3', to: 'P1', deed: 'st-james-place', amount: 14 },
    ])

    const late = routed(17)
    expect(rentRecipient(late, 'st-james-place')).toBe('P1')
  })

  it('still routes on the final round of the window, which Settlement ends afterwards', () => {
    expect(rentRecipient(routed(16), 'st-james-place')).toBe('P2')
  })

  it('pays nobody on a mortgaged deed', () => {
    const state = testState({
      round: 10,
      futures: [CONTRACT],
      deeds: { 'st-james-place': { ...stJames('P1'), mortgaged: true } },
    })
    expect(rentEvents(state, 'st-james-place', 'P3', 14)).toEqual([])
  })
})

describe('encumbrance follows the deed', () => {
  it('survives a trade and keeps routing to the holder', () => {
    const before = testState({ round: 10, futures: [CONTRACT] })
    const traded: GameState = {
      ...before,
      deeds: { ...before.deeds, 'st-james-place': { ...stJames('P4') } },
    }
    // markets holds no owner reference, so the obligation transfers with the deed.
    expect(isEncumbered(traded, 'st-james-place')).toBe(true)
    expect(rentRecipient(traded, 'st-james-place')).toBe('P2')
    expect(rentEvents(traded, 'st-james-place', 'P4', 14)).toEqual([])
    expect(rentEvents(traded, 'st-james-place', 'P1', 14)).toEqual([
      { type: 'RentCharged', from: 'P1', to: 'P2', deed: 'st-james-place', amount: 14 },
      { type: 'RentRoutedToFuture', contract: CONTRACT.id, holder: 'P2', amount: 14 },
    ])
  })
})

describe('mortgaging an encumbered property', () => {
  it('pays make-whole at remaining expected value and terminates the contract', () => {
    const state = testState({ round: 10, cash: { P1: 500 }, futures: [CONTRACT] })
    const expected = markRentFuture(state, CONTRACT.id)
    expect(expected).toBeGreaterThan(0)
    expect(rentFutureMakeWhole(state, 'st-james-place')).toBe(expected)
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureMadeWhole', id: CONTRACT.id, amount: expected },
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('turns an unaffordable make-whole into distressed debt', () => {
    // CORRECTION beyond the brief: the shortfall is computed against the owner's
    // ACTUAL pre-mortgage clean cash (here $0), not cash-plus-mortgage-proceeds. The
    // brief's own formula (amount - proceeds) double-counts the proceeds once here
    // and again when DeedMortgaged eventually credits them, manufacturing money equal
    // to the mortgage proceeds on every shortfall. See the money-conservation block
    // below, which fails under the brief's original formula and passes under this one.
    const developed = { ...stJames('P1'), houses: 5 }
    const state = testState({
      round: 10,
      cash: { P1: 0 },
      deeds: { 'st-james-place': developed },
      futures: [CONTRACT],
    })
    const amount = markRentFuture(state, CONTRACT.id)
    const shortfall = amount - 0
    expect(shortfall).toBeGreaterThan(0)
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureMadeWhole', id: CONTRACT.id, amount },
      { type: 'DistressedDebtIncurred', player: 'P1', amount: shortfall },
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('emits nothing but termination when the owner has bought their own future back', () => {
    const state = testState({
      round: 10, futures: [{ ...CONTRACT, holder: 'P1' }],
    })
    expect(makeWholeOnMortgage(state, 'st-james-place')).toEqual([
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
  })

  it('emits nothing for an unencumbered deed', () => {
    expect(makeWholeOnMortgage(testState({ round: 10 }), 'st-james-place')).toEqual([])
  })

  it('reports the full mortgage impact for the assist panel', () => {
    const state = testState({ round: 10, futures: [CONTRACT] })
    const impact = mortgageImpact(state, 'st-james-place')
    expect(impact.proceeds).toBe(90)
    expect(impact.makeWhole).toBe(markRentFuture(state, CONTRACT.id))
    expect(impact.drawn).toBe(0)
    expect(impact.marginCalled).toBe(false)
  })

  it('reports zero make-whole and zero impact when there is no future or no owner', () => {
    const owned = testState({ round: 10 })
    expect(rentFutureMakeWhole(owned, 'st-james-place')).toBe(0)

    const unowned = testState({ deeds: { 'st-james-place': stJames(null) }, round: 10 })
    expect(mortgageImpact(unowned, 'st-james-place')).toEqual({
      proceeds: 0, makeWhole: 0, baseAfter: 0, drawn: 0, marginCalled: false,
    })
  })
})

describe('settlement step 1', () => {
  it('expires every future reaching its end round and nothing else', () => {
    const state = testState({
      round: 16,
      futures: [
        CONTRACT,
        { id: 'rf:boardwalk:9-20', deed: 'boardwalk', holder: 'P3', startRound: 9, endRound: 20 },
      ],
    })
    expect(expireRentFutures(state)).toEqual([
      { type: 'RentFutureExpired', id: CONTRACT.id },
    ])
    expect(expireRentFutures(testState({ round: 15, futures: [CONTRACT] }))).toEqual([])
  })
})

/** `sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury`, per Global
 * Constraint. A future is a player-to-player transfer, so every event this task emits
 * must leave this figure unchanged. */
function totalMoney(state: GameState): number {
  return PLAYER_IDS.reduce(
    (total, id) => {
      const p = state.players[id]
      return total + p.cleanCash - p.drawnCredit - p.distressedDebt
    },
    state.treasury,
  )
}

function applyAll(state: GameState, events: ReturnType<typeof rentEvents>): GameState {
  return events.reduce(reduceMarkets, state)
}

describe('money conservation (Global Constraint: no Treasury leg for markets)', () => {
  it('conserves money through origination', () => {
    const before = testState({ round: 8, cash: { P1: 500, P2: 500 } })
    const events = applyAll(before, [{
      type: 'RentFutureOriginated', id: 'rf:st-james-place:9-16', deed: 'st-james-place',
      holder: 'P2', startRound: 9, endRound: 16, price: 120,
    }])
    expect(totalMoney(events)).toBe(totalMoney(before))
    expect(events.treasury).toBe(before.treasury)
  })

  it('conserves money through resale', () => {
    const before = testState({
      round: 10, cash: { P2: 500, P3: 500 },
      futures: [{ ...CONTRACT }],
    })
    const after = applyAll(before, [{
      type: 'RentFutureSold', id: CONTRACT.id, from: 'P2', to: 'P3', price: 75,
    }])
    expect(totalMoney(after)).toBe(totalMoney(before))
    expect(after.treasury).toBe(before.treasury)
  })

  it('conserves money through an affordable make-whole', () => {
    const before = testState({ round: 10, cash: { P1: 500 }, futures: [CONTRACT] })
    const events = makeWholeOnMortgage(before, 'st-james-place')
    const after = applyAll(before, events)
    expect(totalMoney(after)).toBe(totalMoney(before))
    expect(after.treasury).toBe(before.treasury)
  })

  it('conserves money through an UNAFFORDABLE make-whole (the case the brief\'s '
    + 'formula broke)', () => {
    const developed = { ...stJames('P1'), houses: 5 }
    const before = testState({
      round: 10, cash: { P1: 0 }, deeds: { 'st-james-place': developed }, futures: [CONTRACT],
    })
    const events = makeWholeOnMortgage(before, 'st-james-place')
    const after = applyAll(before, events)
    expect(totalMoney(after)).toBe(totalMoney(before))
    expect(after.treasury).toBe(before.treasury)
  })
})
