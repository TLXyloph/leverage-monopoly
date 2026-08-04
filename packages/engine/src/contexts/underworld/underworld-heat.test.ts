import { describe, it, expect } from 'vitest'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import type { PlayerId } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'
import { decideUnderworld } from './decide.js'
import { reduceUnderworld } from './reduce.js'
import { settleAudits } from './audit.js'
import { launderHaircutBps, launderProceeds } from './selectors.js'
import {
  cleanMoneyTotal, makeDeed, makeState, withDeed, withPlayer,
} from './underworld.fixture.js'

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceUnderworld, state)
}

function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`unexpected rejection: ${result.code}`)
  return result
}

describe('laundering haircut curve (spec section 10)', () => {
  it('charges the 25% base haircut at or below the free Heat threshold', () => {
    for (const heat of [0, 1, 2, 3]) {
      expect(launderHaircutBps(heat)).toBe(2500)
    }
  })

  it('worsens by 5 percentage points per Heat point above 3', () => {
    expect(launderHaircutBps(4)).toBe(3000)
    expect(launderHaircutBps(5)).toBe(3500)
    expect(launderHaircutBps(7)).toBe(4500)
  })

  it('caps the haircut at 60%', () => {
    expect(launderHaircutBps(10)).toBe(6000)
    expect(launderHaircutBps(11)).toBe(6000)
    expect(launderHaircutBps(40)).toBe(6000)
  })

  it('computes proceeds in integer dollars, rounded DOWN', () => {
    // 333 x 0.75 = 249.75 -> 249. Floating point would give 249.75000000000003.
    expect(launderProceeds(333, 3)).toBe(249)
    // 333 x 0.70 = 233.1 -> 233.
    expect(launderProceeds(333, 4)).toBe(233)
    expect(launderProceeds(1, 10)).toBe(0)
    expect(launderProceeds(0, 0)).toBe(0)
  })

  it('never loses a cent to IEEE 754 drift at any Heat level', () => {
    for (let heat = 0; heat <= 20; heat += 1) {
      const bps = launderHaircutBps(heat)
      expect(Number.isInteger(bps)).toBe(true)
      expect(Number.isInteger(launderProceeds(1000, heat))).toBe(true)
    }
  })
})

describe('laundering (spec section 10, 19.9)', () => {
  it('converts dirty to clean at the pre-transaction Heat, then charges +1 Heat', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 3 })
    const events = eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 400,
    }))

    // Spec 19.9: at Heat 3 the haircut is 25%, NOT 30%.
    expect(events).toEqual([
      { type: 'CashLaundered', player: 'P1', dirtyIn: 400, cleanOut: 300, haircut: 0.25 },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'laundering' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.cleanCash).toBe(1300)
    expect(after.players.P1.heat).toBe(4)
    expect(after.players.P1.launderedThisPhase).toBe(true)
    expect(after.players.P1.dirtyActionThisRound).toBe(true)
  })

  it('draws laundering proceeds from the Treasury so clean money is conserved', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 0 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 400,
    })))
    expect(after.treasury).toBe(6000 - 300)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('launders a partial balance', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400, heat: 0 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })))
    expect(after.players.P1.dirtyCash).toBe(300)
    expect(after.players.P1.cleanCash).toBe(1075)
  })

  it('allows at most one laundering transaction per Open phase', () => {
    const before = withPlayer(makeState(), 'P1', { dirtyCash: 400 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })))
    const second = decideUnderworld(after, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(second) && second.code).toBe('ALREADY_LAUNDERED_THIS_PHASE')
  })

  it('clears the once-per-phase lock when the next Open phase begins', () => {
    const locked = withPlayer(makeState(), 'P1', {
      dirtyCash: 400, launderedThisPhase: true,
    })
    const reopened = reduceUnderworld(locked, { type: 'PhaseAdvanced', phase: 'open' })
    expect(reopened.players.P1.launderedThisPhase).toBe(false)
    expect(isRejection(decideUnderworld(reopened, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    }))).toBe(false)
  })

  it('does not clear the lock when a non-Open phase begins', () => {
    const locked = withPlayer(makeState(), 'P1', { launderedThisPhase: true })
    const moved = reduceUnderworld(locked, { type: 'PhaseAdvanced', phase: 'movement' })
    expect(moved.players.P1.launderedThisPhase).toBe(true)
  })

  it('rejects laundering more dirty cash than the player holds', () => {
    const state = withPlayer(makeState(), 'P1', { dirtyCash: 50 })
    const result = decideUnderworld(state, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('rejects a non-positive or fractional amount', () => {
    const state = withPlayer(makeState(), 'P1', { dirtyCash: 400 })
    const zero = decideUnderworld(state, { type: 'LaunderCash', player: 'P1', amount: 0 })
    expect(isRejection(zero) && zero.code).toBe('INVALID_AMOUNT')
    const negative = decideUnderworld(state, { type: 'LaunderCash', player: 'P1', amount: -5 })
    expect(isRejection(negative) && negative.code).toBe('INVALID_AMOUNT')
  })

  it('rejects laundering outside the Open phase and before Era II', () => {
    const settling = withPlayer(makeState({ phase: 'settlement' }), 'P1', { dirtyCash: 400 })
    const wrongPhase = decideUnderworld(settling, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(wrongPhase) && wrongPhase.code).toBe('WRONG_PHASE')

    const eraOne = withPlayer(makeState({ round: 4, era: 1 }), 'P1', { dirtyCash: 400 })
    const locked = decideUnderworld(eraOne, {
      type: 'LaunderCash', player: 'P1', amount: 100,
    })
    expect(isRejection(locked) && locked.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })
})

describe('Heat decay (spec 19.13)', () => {
  it('decays 1 in a round with no deliberate dirty action', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5, dirtyActionThisRound: false,
    })
    const events = eventsOf(settleAudits(before, {}))
    expect(events).toEqual([
      { type: 'HeatChanged', player: 'P1', delta: -1,
        reason: 'no deliberate dirty action this round' },
    ])
    expect(apply(before, events).players.P1.heat).toBe(4)
  })

  it('does NOT decay in a round the player launched a venture', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5, dirtyActionThisRound: true,
    })
    expect(settleAudits(before, {})).toEqual([])
  })

  it('does NOT let an already-running venture payout block decay', () => {
    // The keystone of 19.13: a 6-round Numbers Racket must not make cooling
    // down impossible. Its payout is DirtyCashEarned, which never sets the flag.
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5,
      ventures: [{ kind: 'numbers', roundsRemaining: 4 }],
      dirtyActionThisRound: false,
    })
    const paid = apply(before, [
      { type: 'DirtyCashEarned', player: 'P1', amount: 60, source: 'numbers' },
      { type: 'VentureTicked', player: 'P1', venture: 'numbers', roundsRemaining: 3 },
    ])
    expect(paid.players.P1.dirtyActionThisRound).toBe(false)
    expect(apply(paid, eventsOf(settleAudits(paid, {}))).players.P1.heat).toBe(4)
  })

  it('does not decay Heat below zero', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', { heat: 0 })
    expect(settleAudits(before, {})).toEqual([])
  })

  it('clears the dirty-action flag when the round advances', () => {
    const acted = withPlayer(makeState(), 'P1', {
      dirtyActionThisRound: true, briberyUsedThisRound: true,
      insiderRevealedThisRound: true, rerollForced: true, cardCancelled: true,
    })
    const next = reduceUnderworld(acted, { type: 'RoundAdvanced', round: 10 })
    expect(next.players.P1).toMatchObject({
      dirtyActionThisRound: false, briberyUsedThisRound: false,
      insiderRevealedThisRound: false, rerollForced: false, cardCancelled: false,
    })
  })

  it('lets an era card reduce Heat without setting the dirty-action flag', () => {
    // Era II: "Vice squad reshuffle. All players reduce Heat by 2."
    const before = withPlayer(makeState(), 'P1', { heat: 5 })
    const after = reduceUnderworld(before, {
      type: 'HeatChanged', player: 'P1', delta: -2, reason: 'vice squad reshuffle',
    })
    expect(after.players.P1.heat).toBe(3)
    expect(after.players.P1.dirtyActionThisRound).toBe(false)
  })

  it('cools a six-round Numbers Racket from Heat 2 to Heat 0 before audits begin', () => {
    let state = withPlayer(makeState({ phase: 'settlement', round: 7 }), 'P1', {
      heat: 2, ventures: [{ kind: 'numbers', roundsRemaining: 6 }],
    })
    for (let round = 7; round <= 12; round += 1) {
      state = apply(state, eventsOf(settleAudits(state, {})))
      state = reduceUnderworld(state, { type: 'RoundAdvanced', round: round + 1 })
    }
    expect(state.players.P1.heat).toBe(0)
  })
})

describe('audit checks (spec section 10, 19.1)', () => {
  const auditRound = { phase: 'settlement' as const, round: ECONOMY.AUDIT_FIRST_ROUND }

  it('does not check before round 13', () => {
    const before = withPlayer(
      makeState({ phase: 'settlement', round: 12 }), 'P1', { heat: 9, dirtyCash: 500 })
    const events = eventsOf(settleAudits(before, { P1: [1, 1] }))
    expect(events.some((e) => e.type === 'AuditChecked')).toBe(false)
  })

  it('audits when the roll is at or below Heat, seizing all dirty cash', () => {
    const before = withPlayer(makeState(auditRound), 'P1', {
      heat: 7, dirtyCash: 640, cleanCash: 1000,
    })
    const events = eventsOf(settleAudits(before, { P1: [3, 4] }))

    expect(events).toEqual([
      { type: 'AuditChecked', player: 'P1', dice: [3, 4], heat: 7, audited: true },
      { type: 'AuditResolved', player: 'P1', seized: 640, fine: 700,
        paidFromCash: 700, capitalised: 0 },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.cleanCash).toBe(300)
    expect(after.players.P1.heat).toBe(0)
    expect(after.treasury).toBe(6700)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('does not audit when the roll exceeds Heat, and decays instead', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 5, dirtyCash: 640 })
    const events = eventsOf(settleAudits(before, { P1: [4, 4] }))
    expect(events).toEqual([
      { type: 'AuditChecked', player: 'P1', dice: [4, 4], heat: 5, audited: false },
      { type: 'HeatChanged', player: 'P1', delta: -1,
        reason: 'no deliberate dirty action this round' },
    ])
    expect(apply(before, events).players.P1.dirtyCash).toBe(640)
  })

  it('skips the roll entirely for a player 2d6 cannot reach', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 1 })
    const events = eventsOf(settleAudits(before, {}))
    expect(events.some((e) => e.type === 'AuditChecked')).toBe(false)
    expect(apply(before, events).players.P1.heat).toBe(0)
  })

  it('rejects a Settlement missing a roll for a player who needs one', () => {
    const before = withPlayer(makeState(auditRound), 'P1', { heat: 4 })
    const result = settleAudits(before, {})
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })

  it('checks every player in turn order', () => {
    let state = withPlayer(makeState(auditRound), 'P1', { heat: 2, dirtyCash: 100 })
    state = withPlayer(state, 'P3', { heat: 12, dirtyCash: 900 })
    const events = eventsOf(settleAudits(state, { P1: [1, 2], P3: [6, 5] }))
    expect(events.map((e) => `${e.type}:${'player' in e ? e.player : ''}`)).toEqual([
      'AuditChecked:P1', 'HeatChanged:P1', 'AuditChecked:P3', 'AuditResolved:P3',
    ])
  })

  it('seizes dirty cash without adding it to the Treasury', () => {
    const before = withPlayer(makeState(auditRound), 'P1', {
      heat: 3, dirtyCash: 500, cleanCash: 1000,
    })
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 1] })))
    // Fine $300 to the Treasury; the $500 dirty is destroyed, never banked.
    expect(after.treasury).toBe(6300)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })
})

/**
 * Mirrors the credit context's borrowingBase selector (Task 9): 75% of
 * unmortgaged deed face value + 50% of building cost. Computed locally because
 * spec section 14 forbids `underworld` from importing `credit`.
 */
function borrowingBase(state: GameState, id: PlayerId): number {
  return Object.values(state.deeds).reduce((base, deed) => {
    if (deed === undefined || deed.owner !== id || deed.mortgaged) return base
    return base
      + Math.floor(deed.faceValue * ECONOMY.DEED_ADVANCE_RATE)
      + Math.floor(deed.houses * deed.houseCost * ECONOMY.BUILDING_ADVANCE_RATE)
  }, 0)
}

describe('an audit fine triggers a margin call in the same Settlement (spec 19.1)', () => {
  /**
   * P1 owns one $400 deed, so their borrowing base is $300. They are drawn
   * $250 — comfortably inside the base — and hold $100 clean against Heat 9.
   * The $900 fine takes the $100 and capitalises the remaining $800 into the
   * drawn balance, exactly as unpayable interest does. Step 10 then sees
   * $1,050 drawn against a $300 base.
   */
  function tableOnTheEdge(): GameState {
    const state = withDeed(
      makeState({ phase: 'settlement', round: 13 }),
      makeDeed('boardwalk', 'P1', { faceValue: 400, houseCost: 200, houses: 0 }),
    )
    return withPlayer(state, 'P1', {
      heat: 9, dirtyCash: 300, cleanCash: 100, drawnCredit: 250,
    })
  }

  it('leaves the player inside their borrowing base before the audit', () => {
    const before = tableOnTheEdge()
    expect(borrowingBase(before, 'P1')).toBe(300)
    expect(before.players.P1.drawnCredit).toBeLessThanOrEqual(borrowingBase(before, 'P1'))
  })

  it('capitalises the unpayable part of the fine into the drawn balance', () => {
    const before = tableOnTheEdge()
    const events = eventsOf(settleAudits(before, { P1: [1, 3] }))

    expect(events[1]).toEqual({
      type: 'AuditResolved', player: 'P1',
      seized: 300, fine: 900, paidFromCash: 100, capitalised: 800,
    })

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(1050)
    expect(after.players.P1.dirtyCash).toBe(0)
    expect(after.players.P1.heat).toBe(0)
  })

  it('leaves the player OVER their borrowing base, which step 10 must flag', () => {
    const before = tableOnTheEdge()
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 3] })))

    const base = borrowingBase(after, 'P1')
    expect(base).toBe(300)
    expect(after.players.P1.drawnCredit).toBeGreaterThan(base)
    expect(after.players.P1.drawnCredit - base).toBe(750)
    expect(after.players.P1.marginCallFlaggedAt).toBeNull() // step 10 flags, not step 9
  })

  it('conserves clean money across the whole interaction', () => {
    const before = tableOnTheEdge()
    const after = apply(before, eventsOf(settleAudits(before, { P1: [1, 3] })))
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })
})
