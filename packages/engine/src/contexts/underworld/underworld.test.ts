import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import { isRejection } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import { decideUnderworld } from './decide.js'
import { reduceUnderworld } from './reduce.js'
import { speakeasyPayout } from './selectors.js'
import {
  cleanMoneyTotal, makeDeed, makeState, withDeed, withPlayer,
} from './underworld.fixture.js'
import { settleVentures, ventureIncomeFromRent } from './ventures.js'

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceUnderworld, state)
}

function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`unexpected rejection: ${result.code}`)
  return result
}

/**
 * NOTE ON BRIEF VS ECONOMY: task-12-brief.md's own Step 5/7/17 snippets carry
 * $300/40%-share Escort Service numbers from before a rebalance. `ECONOMY.VENTURES`
 * in `config/economy.ts` is authoritative and current ($150/4 rounds/+2 Heat/60%
 * rent share) — every dollar figure below is taken from ECONOMY, not the brief.
 */
describe('venture configuration (spec section 10)', () => {
  it('holds every venture cost, duration, Heat charge and payout rate in ECONOMY', () => {
    expect(ECONOMY.VENTURES.escort).toEqual({ cost: 150, rounds: 4, heat: 2, rentShare: 0.6 })
    expect(ECONOMY.VENTURES.numbers).toEqual({ cost: 150, rounds: 6, heat: 2, perRound: 60 })
    expect(ECONOMY.VENTURES['chop-shop'])
      .toEqual({ cost: 250, rounds: 4, heat: 3, perLanding: 150 })
    expect(ECONOMY.SPEAKEASY_COST).toBe(250)
    expect(ECONOMY.SPEAKEASY_HEAT).toBe(2)
    expect(ECONOMY.UNLOCK_ERA.venture).toBe(2)
  })
})

describe('speakeasy payout table (spec section 10)', () => {
  it('pays the published amount for every 2d6 total', () => {
    const cases: ReadonlyArray<readonly [readonly [number, number], number]> = [
      [[1, 1], 0], // total 2
      [[1, 2], 100], [[2, 2], 100], [[2, 3], 100], // totals 3-5
      [[3, 3], 250], [[3, 4], 250], [[4, 4], 250], // totals 6-8
      [[4, 5], 500], [[5, 5], 500], [[5, 6], 500], // totals 9-11
      [[6, 6], 1200], // total 12
    ]
    for (const [dice, expected] of cases) {
      expect(speakeasyPayout(dice)).toBe(expected)
    }
  })

  it('has an expected payout of $294, marginally negative against the $250 cost', () => {
    let total = 0
    for (let a = 1; a <= 6; a += 1) {
      for (let b = 1; b <= 6; b += 1) total += speakeasyPayout([a, b])
    }
    expect(Math.round(total / 36)).toBe(294)
  })
})

describe('launching a venture', () => {
  it('charges clean cash to the Treasury, starts the timer and adds Heat', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'VentureLaunched', player: 'P1', venture: 'escort',
        cost: 150, rounds: 4, fundedFrom: 'clean' },
      { type: 'HeatChanged', player: 'P1', delta: 2, reason: 'launched escort' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(850)
    expect(after.players.P1.ventures).toEqual([{ kind: 'escort', roundsRemaining: 4 }])
    expect(after.players.P1.heat).toBe(2)
    expect(after.players.P1.dirtyActionThisRound).toBe(true)
    expect(after.treasury).toBe(6150)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('charges the Chop Shop +3 Heat rather than +2', () => {
    const events = eventsOf(decideUnderworld(makeState(), {
      type: 'LaunchVenture', player: 'P2', venture: 'chop-shop', fundedFrom: 'clean',
    }))
    expect(events[1]).toEqual({
      type: 'HeatChanged', player: 'P2', delta: 3, reason: 'launched chop-shop',
    })
  })

  it('destroys dirty cash when the venture is funded dirty, leaving the Treasury alone', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'dirty',
    })))
    expect(after.players.P1.dirtyCash).toBe(250)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('rejects a venture launched before Era II', () => {
    const state = makeState({ round: 3, era: 1 })
    const result = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('allows a venture before Era II when the admin set unlockMode to all', () => {
    const base = makeState({ round: 3, era: 1 })
    const state = { ...base, config: { ...base.config, unlockMode: 'all' as const } }
    expect(isRejection(decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    }))).toBe(false)
  })

  it('rejects relaunching a venture already running', () => {
    const state = withPlayer(makeState(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 2 }],
    })
    const result = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('VENTURE_ALREADY_ACTIVE')
  })

  it('allows two different ventures to run at once', () => {
    const state = withPlayer(makeState(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 2 }],
    })
    const after = apply(state, eventsOf(decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
    })))
    expect(after.players.P1.ventures).toEqual([
      { kind: 'escort', roundsRemaining: 2 },
      { kind: 'numbers', roundsRemaining: 6 },
    ])
  })

  it('rejects a launch the player cannot fund, naming the right pocket', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 100, dirtyCash: 100 })
    const clean = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(clean) && clean.code).toBe('INSUFFICIENT_CLEAN_CASH')
    const dirty = decideUnderworld(state, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'dirty',
    })
    expect(isRejection(dirty) && dirty.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('rejects a launch outside the Open phase', () => {
    const result = decideUnderworld(makeState({ phase: 'settlement' }), {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })
})

describe('venture income follows the deed, not the cashflow (spec 19.5)', () => {
  /**
   * P1 owns St James Place. `rent.to` names P2 — standing in for a live rent
   * future's holder, or any other reason the cash might route somewhere other
   * than the owner. `ventureIncomeFromRent` must never read `rent.to`.
   */
  function tableWithDeed(): GameState {
    return withDeed(makeState({ phase: 'movement' }), makeDeed('st-james-place', 'P1'))
  }

  const rent = {
    type: 'RentCharged', from: 'P3', to: 'P2', deed: 'st-james-place', amount: 250,
  } as const

  it('pays the Escort Service bonus to the OWNER even though someone else receives the rent', () => {
    const state = withPlayer(tableWithDeed(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'escort' },
    ])
  })

  it('pays a futures holder nothing from a deed they do not own', () => {
    // P2 is the one named in `rent.to` and runs the same venture — but does not
    // own the deed. Spec 19.5: venture income is keyed to ownership, never to
    // who the rent happened to be routed to.
    const state = withPlayer(tableWithDeed(), 'P2', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([])
  })

  it('pays the Chop Shop a flat $150 to the owner, independent of the rent charged', () => {
    const state = withPlayer(tableWithDeed(), 'P1', {
      ventures: [{ kind: 'chop-shop', roundsRemaining: 4 }],
    })
    const cheap = { ...rent, amount: 8 } as const
    expect(ventureIncomeFromRent(state, cheap)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })

  it('pays both ventures when the owner runs both', () => {
    const state = withPlayer(tableWithDeed(), 'P1', {
      ventures: [
        { kind: 'escort', roundsRemaining: 3 },
        { kind: 'chop-shop', roundsRemaining: 4 },
      ],
    })
    expect(ventureIncomeFromRent(state, rent)).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'escort' },
      { type: 'DirtyCashEarned', player: 'P1', amount: 150, source: 'chop-shop' },
    ])
  })

  it('rounds the Escort Service share DOWN to whole dollars', () => {
    const state = withPlayer(tableWithDeed(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    // 45 x 0.60 = 27.0 exactly; 47 x 0.60 = 28.2, floored to 28.
    expect(ventureIncomeFromRent(state, { ...rent, amount: 45 }))
      .toEqual([{ type: 'DirtyCashEarned', player: 'P1', amount: 27, source: 'escort' }])
    expect(ventureIncomeFromRent(state, { ...rent, amount: 47 }))
      .toEqual([{ type: 'DirtyCashEarned', player: 'P1', amount: 28, source: 'escort' }])
  })

  it('pays nothing on a deed the bank holds or nobody owns', () => {
    const unowned = withDeed(makeState({ phase: 'movement' }), makeDeed('st-james-place', null))
    expect(ventureIncomeFromRent(unowned, rent)).toEqual([])
    const bankOwned = withDeed(makeState({ phase: 'movement' }), makeDeed('st-james-place', 'bank'))
    expect(ventureIncomeFromRent(bankOwned, rent)).toEqual([])
  })

  it('pays nothing when Escort income would round to zero', () => {
    const state = withPlayer(tableWithDeed(), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 3 }],
    })
    // 1 x 0.60 = 0.6, floored to 0 -- no event, not a $0 event.
    expect(ventureIncomeFromRent(state, { ...rent, amount: 1 })).toEqual([])
  })

  it('pays nothing on a mortgaged deed (spec 19.9): a mortgaged deed charges no rent', () => {
    const mortgaged = withDeed(
      makeState({ phase: 'movement' }),
      makeDeed('st-james-place', 'P1', { mortgaged: true }),
    )
    const state = withPlayer(mortgaged, 'P1', {
      ventures: [
        { kind: 'escort', roundsRemaining: 3 },
        { kind: 'chop-shop', roundsRemaining: 4 },
      ],
    })
    // Real play never produces a RentCharged for a mortgaged deed (board's
    // rentDue returns 0), but the guard is defensive: even given one, no
    // venture income accrues.
    expect(ventureIncomeFromRent(state, rent)).toEqual([])
  })
})

describe('Settlement step 2: venture payouts and timers (spec 19.1)', () => {
  it('pays the Numbers Racket $60 flat and decrements every timer', () => {
    const before = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [
        { kind: 'numbers', roundsRemaining: 6 },
        { kind: 'escort', roundsRemaining: 2 },
      ],
    })
    const events = settleVentures(before)

    expect(events).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 60, source: 'numbers' },
      { type: 'VentureTicked', player: 'P1', venture: 'numbers', roundsRemaining: 5 },
      { type: 'VentureTicked', player: 'P1', venture: 'escort', roundsRemaining: 1 },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(60)
    expect(after.players.P1.ventures).toEqual([
      { kind: 'numbers', roundsRemaining: 5 },
      { kind: 'escort', roundsRemaining: 1 },
    ])
  })

  it('retires a venture on its final tick', () => {
    const before = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [{ kind: 'escort', roundsRemaining: 1 }],
    })
    const after = apply(before, settleVentures(before))
    expect(after.players.P1.ventures).toEqual([])
  })

  it('pays a 6-round Numbers Racket exactly six times', () => {
    let state = withPlayer(makeState({ phase: 'settlement' }), 'P1', {
      ventures: [{ kind: 'numbers', roundsRemaining: ECONOMY.VENTURES.numbers.rounds }],
    })
    for (let round = 0; round < 8; round += 1) state = apply(state, settleVentures(state))
    expect(state.players.P1.dirtyCash).toBe(6 * ECONOMY.VENTURES.numbers.perRound)
    expect(state.players.P1.ventures).toEqual([])
  })

  it('emits nothing for a player with no ventures', () => {
    expect(settleVentures(makeState({ phase: 'settlement' }))).toEqual([])
  })
})

describe('the Speakeasy (spec section 10)', () => {
  it('takes the roll from the command and never generates one', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'SpeakeasyPlayed', player: 'P1', dice: [6, 6], payout: 1200, fundedFrom: 'clean' },
      { type: 'DirtyCashEarned', player: 'P1', amount: 1200, source: 'speakeasy' },
      { type: 'HeatChanged', player: 'P1', delta: 2, reason: 'played the Speakeasy' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(750)
    expect(after.players.P1.dirtyCash).toBe(1200)
    expect(after.players.P1.heat).toBe(2)
    expect(after.players.P1.ventures).toEqual([])
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('takes the cost and the Heat even on a snake-eyes zero payout', () => {
    const before = makeState()
    const events = eventsOf(decideUnderworld(before, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [1, 1], fundedFrom: 'clean',
    }))
    expect(events.map((e) => e.type)).toEqual(['SpeakeasyPlayed', 'HeatChanged'])
    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(750)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.heat).toBe(2)
  })

  it('rejects a roll the physical dice cannot produce', () => {
    const result = decideUnderworld(makeState(), {
      type: 'PlaySpeakeasy', player: 'P1', dice: [0, 7], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })

  it('rejects a Speakeasy the player cannot fund', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 100 })
    const result = decideUnderworld(state, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [3, 4], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('rejects a Speakeasy played before Era II', () => {
    const result = decideUnderworld(makeState({ round: 3, era: 1 }), {
      type: 'PlaySpeakeasy', player: 'P1', dice: [3, 4], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('rejects a Speakeasy played outside the Open phase', () => {
    const result = decideUnderworld(makeState({ phase: 'movement' }), {
      type: 'PlaySpeakeasy', player: 'P1', dice: [3, 4], fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })
})

/**
 * The crux of Task 12: two currencies, one conserved identity. `cleanMoneyTotal`
 * is `sum(cleanCash) - sum(drawnCredit) - sum(distressedDebt) + treasury` — dirty
 * cash is outside it entirely. Every clean/dirty boundary crossing needs a named
 * counterparty: clean costs go to the Treasury, dirty costs are destroyed, and
 * dirty payouts are created from nothing (no counterparty, by design).
 */
describe('two-currency money conservation (spec section 20)', () => {
  it('is invariant across a venture launch funded from clean cash', () => {
    const before = makeState()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })))
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('is invariant across a venture launch funded from dirty cash', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 500 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'chop-shop', fundedFrom: 'dirty',
    })))
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
    // The $250 chop-shop cost is destroyed, not banked: 500 - 250 = 250.
    expect(after.players.P1.dirtyCash).toBe(250)
  })

  it('is invariant across a dirty-funded Speakeasy play, even though dirty cash rises', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 500 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'dirty',
    })))
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
    // 500 - 250 (cost, destroyed) + 1200 (payout, created from nothing) = 1450.
    expect(after.players.P1.dirtyCash).toBe(1450)
  })
})

describe('per-round flag reset', () => {
  it('clears dirtyActionThisRound on RoundAdvanced after a deliberate dirty action', () => {
    const before = makeState()
    const afterLaunch = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    })))
    expect(afterLaunch.players.P1.dirtyActionThisRound).toBe(true)
    const nextRound = reduceUnderworld(afterLaunch, { type: 'RoundAdvanced', round: 8 })
    expect(nextRound.players.P1.dirtyActionThisRound).toBe(false)
  })
})

describe('determinism', () => {
  it('never generates its own randomness', () => {
    const state = makeState()
    const cmd = {
      type: 'PlaySpeakeasy', player: 'P1', dice: [2, 3], fundedFrom: 'clean',
    } as const
    const first = decideUnderworld(state, cmd)
    const second = decideUnderworld(state, cmd)
    expect(first).toEqual(second)
    expect(eventsOf(first)[0]).toMatchObject({ dice: [2, 3], payout: 100 })
  })

  it('replays to an identical state', () => {
    const before = makeState()
    const events = [
      ...eventsOf(decideUnderworld(before, {
        type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
      })),
      ...eventsOf(decideUnderworld(before, {
        type: 'PlaySpeakeasy', player: 'P2', dice: [4, 5], fundedFrom: 'clean',
      })),
    ]
    expect(apply(before, events)).toEqual(apply(before, events))
  })
})
