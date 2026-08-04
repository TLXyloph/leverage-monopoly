import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import type { GameState } from '../../core/state.js'
import { decideCredit, reduceCredit } from '../credit/index.js'
import { stJames, testState } from './fixture.js'
import { decideDeedOptions, deedOptionId, lapseDeedOptions } from './decide-options.js'
import { reduceDeedOptions } from './reduce-options.js'
import {
  assertDeedTransferable, deedOptionRefund, isDeedLocked, markDeedOption, outstandingOption,
} from './selectors.js'

function write(over: Record<string, unknown> = {}) {
  return {
    type: 'WriteDeedOption' as const,
    player: 'P1' as const,
    deed: 'st-james-place',
    holder: 'P2' as const,
    premium: 60,
    strike: 250,
    expiry: 20,
    ...over,
  }
}

/** Throws loudly rather than silently propagating a Rejection into event-shaped
 * assertions, mirroring `credit/fixture.ts`'s identically-named helper. */
function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`expected events, got rejection ${result.code}`)
  return result
}

describe('writing a deed option', () => {
  it('emits a written event for a valid option', () => {
    const result = decideDeedOptions(testState({ round: 14 }), write())
    expect(result).toEqual([{
      type: 'DeedOptionWritten',
      id: deedOptionId('st-james-place', 'P1', 20),
      deed: 'st-james-place',
      writer: 'P1',
      holder: 'P2',
      premium: 60,
      strike: 250,
      expiry: 20,
    }])
  })

  it('rejects outside an Open phase', () => {
    expect(decideDeedOptions(testState({ round: 14, phase: 'movement' }), write()))
      .toMatchObject({ rejected: true, code: 'WRONG_PHASE' })
  })

  it('rejects writing when deed options have not unlocked this era', () => {
    const state = testState({ round: 14, unlockMode: 'progressive', era: 2 })
    expect(decideDeedOptions(state, write()))
      .toMatchObject({ rejected: true, code: 'INSTRUMENT_LOCKED_THIS_ERA' })
    const unlocked = testState({ round: 14, unlockMode: 'progressive', era: 3 })
    expect(isRejection(decideDeedOptions(unlocked, write()))).toBe(false)
  })

  it('is written by the deed owner only', () => {
    expect(decideDeedOptions(testState({ round: 14 }), write({ player: 'P3' })))
      .toMatchObject({ rejected: true, code: 'NOT_OWNER' })
  })

  it('allows one outstanding option per deed', () => {
    const state = testState({
      round: 14,
      options: [{
        id: 'do:st-james-place:P1:18',
        deed: 'st-james-place',
        writer: 'P1',
        holder: 'P4',
        premium: 40,
        strike: 200,
        expiry: 18,
      }],
    })
    expect(decideDeedOptions(state, write()))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('requires an expiry within the remaining game', () => {
    const state = testState({ round: 14 })
    expect(decideDeedOptions(state, write({ expiry: 13 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(decideDeedOptions(state, write({ expiry: ECONOMY.TOTAL_ROUNDS + 1 })))
      .toMatchObject({ rejected: true, code: 'INVALID_WINDOW' })
    expect(isRejection(decideDeedOptions(state, write({ expiry: ECONOMY.TOTAL_ROUNDS }))))
      .toBe(false)
  })

  it('rejects a holder who cannot pay the premium', () => {
    expect(decideDeedOptions(testState({ round: 14, cash: { P2: 10 } }), write()))
      .toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('rejects negative premium or strike, and writing to yourself', () => {
    const state = testState({ round: 14 })
    expect(decideDeedOptions(state, write({ premium: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideDeedOptions(state, write({ strike: -1 })))
      .toMatchObject({ rejected: true, code: 'NEGATIVE_AMOUNT' })
    expect(decideDeedOptions(state, write({ holder: 'P1' })))
      .toMatchObject({ rejected: true, code: 'SELF_DEALING' })
  })

  it('rejects an unknown deed', () => {
    expect(decideDeedOptions(testState({ round: 14 }), write({ deed: 'boardwalk' })))
      .toMatchObject({ rejected: true, code: 'DEED_UNAVAILABLE' })
  })
})

const OPTION = {
  id: 'do:st-james-place:P1:20',
  deed: 'st-james-place',
  writer: 'P1' as const,
  holder: 'P2' as const,
  premium: 60,
  strike: 250,
  expiry: 20,
}

function optioned(round: number, over: Record<string, unknown> = {}): GameState {
  return testState({ round, options: [OPTION], ...over })
}

describe('exercising a deed option', () => {
  it('transfers the deed and pays the strike to the writer', () => {
    const before = optioned(18, { cash: { P1: 400, P2: 400 } })
    const events = decideDeedOptions(before, {
      type: 'ExerciseDeedOption', player: 'P2', contract: OPTION.id,
    })
    expect(events).toEqual([
      { type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250 },
    ])
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250,
    })
    expect(after.deeds['st-james-place']?.owner).toBe('P2')
    expect(after.players.P1.cleanCash).toBe(650)
    expect(after.players.P2.cleanCash).toBe(150)
    expect(after.options).toEqual([])
  })

  it('can be exercised on the expiry round itself but not after', () => {
    const cmd = { type: 'ExerciseDeedOption' as const, player: 'P2' as const, contract: OPTION.id }
    expect(isRejection(decideDeedOptions(optioned(20), cmd))).toBe(false)
    expect(decideDeedOptions(optioned(21), cmd))
      .toMatchObject({ rejected: true, code: 'CONTRACT_NOT_FOUND' })
  })

  it('can only be exercised by the current holder', () => {
    expect(decideDeedOptions(optioned(18), {
      type: 'ExerciseDeedOption', player: 'P3', contract: OPTION.id,
    })).toMatchObject({ rejected: true, code: 'NOT_ASSET_OWNER' })
  })

  it('rejects a holder who cannot pay the strike', () => {
    expect(decideDeedOptions(optioned(18, { cash: { P2: 100 } }), {
      type: 'ExerciseDeedOption', player: 'P2', contract: OPTION.id,
    })).toMatchObject({ rejected: true, code: 'INSUFFICIENT_CLEAN_CASH' })
  })

  it('carries houses and any rent future across with the deed', () => {
    const before = testState({
      round: 18,
      options: [OPTION],
      deeds: { 'st-james-place': { ...stJames('P1'), houses: 3 } },
      futures: [{
        id: 'rf:st-james-place:19-22',
        deed: 'st-james-place',
        holder: 'P4',
        startRound: 19,
        endRound: 22,
      }],
    })
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionExercised', id: OPTION.id, strikePaid: 250,
    })
    expect(after.deeds['st-james-place']?.houses).toBe(3)
    expect(after.futures[0]?.holder).toBe('P4')
  })
})

describe('reselling a deed option', () => {
  it('moves the holder and the price', () => {
    const before = optioned(18, { cash: { P2: 400, P3: 400 } })
    expect(decideDeedOptions(before, {
      type: 'SellDeedOption', player: 'P2', contract: OPTION.id, to: 'P3', price: 90,
    })).toEqual([
      { type: 'DeedOptionSold', id: OPTION.id, from: 'P2', to: 'P3', price: 90 },
    ])
    const after = reduceDeedOptions(before, {
      type: 'DeedOptionSold', id: OPTION.id, from: 'P2', to: 'P3', price: 90,
    })
    expect(after.options[0]?.holder).toBe('P3')
    expect(after.options[0]?.writer).toBe('P1')
    expect(after.players.P2.cleanCash).toBe(490)
    expect(after.players.P3.cleanCash).toBe(310)
  })

  it('cannot be resold by anyone but the holder', () => {
    expect(decideDeedOptions(optioned(18), {
      type: 'SellDeedOption', player: 'P1', contract: OPTION.id, to: 'P3', price: 90,
    })).toMatchObject({ rejected: true, code: 'NOT_ASSET_OWNER' })
  })
})

describe('the underlying deed is locked while an option is outstanding', () => {
  it('refuses sale, trade and mortgage', () => {
    const state = optioned(18)
    expect(isDeedLocked(state, 'st-james-place')).toBe(true)
    expect(assertDeedTransferable(state, 'st-james-place'))
      .toMatchObject({ rejected: true, code: 'DEED_ENCUMBERED' })
  })

  it('releases the lock once the option lapses', () => {
    const state = optioned(20)
    const after = reduceDeedOptions(state, { type: 'DeedOptionExpired', id: OPTION.id })
    expect(isDeedLocked(after, 'st-james-place')).toBe(false)
    expect(assertDeedTransferable(after, 'st-james-place')).toBeNull()
  })
})

describe('settlement step 11 and scoring', () => {
  it('lapses options reaching expiry and nothing earlier', () => {
    expect(lapseDeedOptions(optioned(20))).toEqual([
      { type: 'DeedOptionExpired', id: OPTION.id },
    ])
    expect(lapseDeedOptions(optioned(19))).toEqual([])
  })

  it('marks at max(0, deed face value - strike)', () => {
    // St. James face $180 against a $250 strike: out of the money.
    expect(markDeedOption(optioned(18), OPTION.id)).toBe(0)
    const cheap = testState({
      round: 18,
      options: [{ ...OPTION, id: 'do:st-james-place:P1:22', strike: 100, expiry: 22 }],
    })
    expect(markDeedOption(cheap, 'do:st-james-place:P1:22')).toBe(80)
    expect(markDeedOption(cheap, 'do:nonexistent:P1:22')).toBe(0)
  })
})

describe('deedOptionRefund — the port credit/decide.ts injects for liquidation', () => {
  it('is the outstanding option premium, or 0 if there is none', () => {
    expect(deedOptionRefund(optioned(18), 'st-james-place')).toBe(60)
    expect(deedOptionRefund(testState({ round: 18 }), 'st-james-place')).toBe(0)
  })
})

/**
 * Spec 19.12, the anti-exploit this task exists to prove. If the writer-lock blocked
 * liquidation, a distressed player could write a $1 option on every deed and become
 * judgment-proof. If the option instead survived into the auction, a player could write
 * a $1-strike option to a confederate, get liquidated, collect the bank's 80% floor, and
 * have the confederate exercise for a dollar. Extinguishing the option and refunding the
 * premium into the SAME player's shortfall removes the value of both manoeuvres.
 */
describe('liquidation extinguishes an outstanding option (spec 19.12)', () => {
  // P1 owns only st-james-place (face $180, borrowing base floor(180*0.75)=$135) and has
  // drawn $200 against it — an uncured margin call flagged 2 rounds ago, so Settlement
  // step 8/9's `playersAwaitingLiquidation` includes P1 at round 7 (5 + 2).
  function encumbered(): GameState {
    const base = testState({
      round: 7,
      deeds: { 'st-james-place': stJames('P1') },
      options: [{ ...OPTION, strike: 1 }],
    })
    return {
      ...base,
      players: {
        ...base.players,
        P1: { ...base.players.P1, drawnCredit: 200, marginCallFlaggedAt: 5, cleanCash: 0 },
        P2: { ...base.players.P2, cleanCash: 1000 },
      },
    }
  }

  it('does NOT block liquidation: the lock is not consulted by SettleLiquidationLot', () => {
    const state = encumbered()
    expect(isDeedLocked(state, 'st-james-place')).toBe(true)
    const events = eventsOf(decideCredit(state, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'st-james-place', bids: [],
    }, { rentFutureMakeWhole: () => 0, deedOptionRefund }))
    expect(events.some((e) => e.type === 'DeedLiquidated')).toBe(true)
  })

  it('refunds the premium to the holder, adds it to the shortfall, and releases the lock', () => {
    const state = encumbered()
    const events = eventsOf(decideCredit(state, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'st-james-place', bids: [],
    }, { rentFutureMakeWhole: () => 0, deedOptionRefund }))
    expect(events[0]).toEqual({
      type: 'EncumbranceExtinguished',
      player: 'P1',
      deed: 'st-james-place',
      contract: OPTION.id,
      kind: 'deed-option',
      holder: 'P2',
      amount: 60,
    })

    let after = state
    for (const event of events) after = reduceDeedOptions(reduceCredit(after, event), event)

    expect(after.options).toEqual([])
    expect(isDeedLocked(after, 'st-james-place')).toBe(false)
    expect(outstandingOption(after, 'st-james-place')).toBeNull()
    expect(after.deeds['st-james-place']?.owner).toBe('bank')
    expect(after.players.P2.cleanCash).toBe(1060)
  })
})

describe('money conservation', () => {
  function totalMoney(state: GameState): number {
    return (
      Object.values(state.players)
        .reduce((t, p) => t + p.cleanCash - p.drawnCredit - p.distressedDebt, 0) + state.treasury
    )
  }

  it('premium, resale and exercise are pure player-to-player transfers, no Treasury leg', () => {
    const before = testState({ round: 14, cash: { P1: 500, P2: 500, P3: 500 } })
    const total = totalMoney(before)

    const id = deedOptionId('st-james-place', 'P1', 20)
    const written = reduceDeedOptions(before, {
      type: 'DeedOptionWritten',
      id, deed: 'st-james-place', writer: 'P1', holder: 'P2', premium: 60, strike: 250, expiry: 20,
    })
    expect(totalMoney(written)).toBe(total)

    const resold = reduceDeedOptions(written, {
      type: 'DeedOptionSold', id, from: 'P2', to: 'P3', price: 90,
    })
    expect(totalMoney(resold)).toBe(total)

    const exercised = reduceDeedOptions(resold, {
      type: 'DeedOptionExercised', id, strikePaid: 250,
    })
    expect(totalMoney(exercised)).toBe(total)
  })

  it('conserves money when a holder cannot afford the strike: the command is rejected before any transfer', () => {
    const state = optioned(18, { cash: { P2: 100 } })
    const total = totalMoney(state)
    const result = decideDeedOptions(state, {
      type: 'ExerciseDeedOption', player: 'P2', contract: OPTION.id,
    })
    expect(isRejection(result)).toBe(true)
    // Nothing was ever reduced, so the state itself, and its money total, are untouched.
    expect(totalMoney(state)).toBe(total)
  })

  it('conserves money through the full liquidation anti-exploit path', () => {
    const base = testState({
      round: 7,
      deeds: { 'st-james-place': stJames('P1') },
      options: [{ ...OPTION, strike: 1 }],
    })
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        P1: { ...base.players.P1, drawnCredit: 200, marginCallFlaggedAt: 5, cleanCash: 0 },
        P2: { ...base.players.P2, cleanCash: 1000 },
      },
    }
    const total = totalMoney(state)
    const events = eventsOf(decideCredit(state, {
      type: 'SettleLiquidationLot', player: 'P1', deed: 'st-james-place', bids: [],
    }, { rentFutureMakeWhole: () => 0, deedOptionRefund }))
    let after = state
    for (const event of events) after = reduceDeedOptions(reduceCredit(after, event), event)
    expect(totalMoney(after)).toBe(total)
  })
})
