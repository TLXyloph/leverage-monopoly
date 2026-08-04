import { describe, it, expect } from 'vitest'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { Rejection } from '../../core/errors.js'
import { isRejection } from '../../core/errors.js'
import { decideUnderworld } from './decide.js'
import { reduceUnderworld } from './reduce.js'
import { settleAudits } from './audit.js'
import { auditProbability, insiderRevealedCard } from './selectors.js'
import {
  cleanMoneyTotal, makeDeed, makeState, withDeed, withPlayer,
} from './underworld.fixture.js'

/**
 * Task 13, part 2: bribery, insider trading, the audit-probability assist
 * model, the `RunAuditChecks` command, and cross-cutting invariants. Split
 * from `underworld-heat.test.ts` for the same reason that file exists rather
 * than growing `underworld.test.ts` past 500 lines.
 */
function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceUnderworld, state)
}

function eventsOf(result: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(result)) throw new Error(`unexpected rejection: ${result.code}`)
  return result
}

describe('bribery (spec section 10)', () => {
  function briber(over: Partial<GameState> = {}): GameState {
    return withPlayer(makeState(over), 'P1', { dirtyCash: 500 })
  }

  it('costs $200 in DIRTY cash and +1 Heat, and never touches clean cash', () => {
    const before = briber()
    const events = eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P3' },
    }))

    expect(events).toEqual([
      { type: 'BriberyUsed', player: 'P1', cost: 200,
        effect: { kind: 'force-reroll', target: 'P3' } },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'bribery' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.dirtyCash).toBe(300)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.players.P1.heat).toBe(1)
    expect(after.players.P1.briberyUsedThisRound).toBe(true)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('rejects bribery paid from clean cash however rich the briber is', () => {
    const state = withPlayer(makeState(), 'P1', { cleanCash: 9999, dirtyCash: 0 })
    const result = decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })
    expect(isRejection(result) && result.code).toBe('INSUFFICIENT_DIRTY_CASH')
  })

  it('forces a re-roll by flagging the TARGET, who may be another player', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P3' },
    })))
    expect(after.players.P3.rerollForced).toBe(true)
    expect(after.players.P1.rerollForced).toBe(false)
  })

  it('cancels an era card by flagging the briber', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })))
    expect(after.players.P1.cardCancelled).toBe(true)
  })

  it('delays a margin call by exactly one round', () => {
    const before = withPlayer(briber(), 'P1', { marginCallFlaggedAt: 9 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'delay-margin-call' },
    })))
    expect(after.players.P1.marginCallFlaggedAt).toBe(10)
  })

  it('rejects delaying a margin call the player does not have', () => {
    const result = decideUnderworld(briber(), {
      type: 'Bribe', player: 'P1', effect: { kind: 'delay-margin-call' },
    })
    expect(isRejection(result) && result.code).toBe('INVALID_BRIBERY_TARGET')
  })

  it('allows one bribe per round only', () => {
    const before = briber()
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })))
    const second = decideUnderworld(after, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })
    expect(isRejection(second) && second.code).toBe('BRIBERY_ALREADY_USED')

    const nextRound = reduceUnderworld(after, { type: 'RoundAdvanced', round: 8 })
    expect(isRejection(decideUnderworld(nextRound, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    }))).toBe(false)
  })

  it('is available during Movement so a die roll can actually be re-rolled', () => {
    const state = briber({ phase: 'movement' })
    expect(isRejection(decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P2' },
    }))).toBe(false)
  })

  it('is unavailable during Settlement, so it can never race an audit', () => {
    const state = briber({ phase: 'settlement' })
    const result = decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'force-reroll', target: 'P2' },
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('rejects bribery before Era II', () => {
    const state = withPlayer(makeState({ round: 3, era: 1 }), 'P1', { dirtyCash: 500 })
    const result = decideUnderworld(state, {
      type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })
})

describe('insider trading (spec section 10)', () => {
  const eraThree = { round: 13, era: 3 as const }

  it('costs $100 in clean cash, +1 Heat, and reveals the deck top to the buyer', () => {
    const before = makeState(eraThree)
    const events = eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    }))

    expect(events).toEqual([
      { type: 'InsiderTradingUsed', player: 'P1', cost: 100, fundedFrom: 'clean' },
      { type: 'HeatChanged', player: 'P1', delta: 1, reason: 'insider trading' },
    ])

    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(900)
    expect(after.players.P1.heat).toBe(1)
    expect(after.treasury).toBe(6100)
    expect(insiderRevealedCard(after, 'P1')).toBe(4)
    expect(insiderRevealedCard(after, 'P2')).toBeNull()
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('accepts dirty cash, which is then destroyed rather than banked', () => {
    const before = withPlayer(makeState(eraThree), 'P1', { dirtyCash: 250 })
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'dirty',
    })))
    expect(after.players.P1.dirtyCash).toBe(150)
    expect(after.players.P1.cleanCash).toBe(1000)
    expect(after.treasury).toBe(6000)
    expect(cleanMoneyTotal(after)).toBe(cleanMoneyTotal(before))
  })

  it('is locked until Era III', () => {
    const result = decideUnderworld(makeState({ round: 8, era: 2 }), {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('rejects insider trading outside the Open phase', () => {
    const result = decideUnderworld({ ...makeState(eraThree), phase: 'movement' }, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('stops revealing the card once the round advances', () => {
    const before = makeState(eraThree)
    const after = apply(before, eventsOf(decideUnderworld(before, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })))
    const next = reduceUnderworld(after, { type: 'RoundAdvanced', round: 14 })
    expect(insiderRevealedCard(next, 'P1')).toBeNull()
  })
})

describe('audit probability (assist panel, spec section 14)', () => {
  it('reproduces the published table in spec section 10', () => {
    expect(Math.round(auditProbability(3) * 1000) / 10).toBe(8.3)
    expect(Math.round(auditProbability(5) * 1000) / 10).toBe(27.8)
    expect(Math.round(auditProbability(7) * 1000) / 10).toBe(58.3)
    expect(Math.round(auditProbability(9) * 1000) / 10).toBe(83.3)
  })

  it('is zero below Heat 2 and certain at Heat 12', () => {
    expect(auditProbability(0)).toBe(0)
    expect(auditProbability(1)).toBe(0)
    expect(auditProbability(12)).toBe(1)
  })
})

describe('RunAuditChecks command wiring', () => {
  it('delegates to settleAudits during Settlement', () => {
    const before = withPlayer(makeState({ phase: 'settlement', round: 9 }), 'P1', {
      heat: 5, dirtyActionThisRound: false,
    })
    const result = decideUnderworld(before, { type: 'RunAuditChecks', dice: {} })
    expect(eventsOf(result)).toEqual(eventsOf(settleAudits(before, {})))
  })

  it('rejects RunAuditChecks outside Settlement', () => {
    const result = decideUnderworld(makeState({ phase: 'open' }), {
      type: 'RunAuditChecks', dice: {},
    })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })
})

describe('underworld invariants', () => {
  it('only ever increases dirty cash through DirtyCashEarned', () => {
    const before = withPlayer(makeState({ round: 13, era: 3 }), 'P1', {
      dirtyCash: 500, heat: 4, cleanCash: 2000,
    })
    const nonEarning: readonly GameEvent[] = [
      { type: 'VentureLaunched', player: 'P1', venture: 'numbers',
        cost: 150, rounds: 6, fundedFrom: 'dirty' },
      { type: 'SpeakeasyPlayed', player: 'P1', dice: [2, 2], payout: 100,
        fundedFrom: 'dirty' },
      { type: 'CashLaundered', player: 'P1', dirtyIn: 50, cleanOut: 35, haircut: 0.3 },
      { type: 'BriberyUsed', player: 'P1', cost: 200, effect: { kind: 'cancel-card' } },
      { type: 'InsiderTradingUsed', player: 'P1', cost: 100, fundedFrom: 'dirty' },
    ]
    for (const event of nonEarning) {
      expect(reduceUnderworld(before, event).players.P1.dirtyCash)
        .toBeLessThanOrEqual(before.players.P1.dirtyCash)
    }
  })

  it('conserves clean money across a full Era III round', () => {
    const before = withDeed(
      withPlayer(makeState({ round: 13, era: 3, phase: 'open' }), 'P1',
        { dirtyCash: 900, cleanCash: 1200, heat: 4 }),
      makeDeed('boardwalk', 'P1', { faceValue: 400 }),
    )

    let state = apply(before, eventsOf(decideUnderworld(before, {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'dirty',
    })))
    state = apply(state, eventsOf(decideUnderworld(state, {
      type: 'LaunderCash', player: 'P1', amount: 200,
    })))
    state = apply(state, eventsOf(decideUnderworld(state, {
      type: 'InsiderTrade', player: 'P1', fundedFrom: 'clean',
    })))
    state = { ...state, phase: 'settlement' }
    state = apply(state, eventsOf(settleAudits(state, { P1: [1, 1] })))

    expect(cleanMoneyTotal(state)).toBe(cleanMoneyTotal(before))
    expect(state.players.P1.dirtyCash).toBe(0)
    expect(state.players.P1.heat).toBe(0)
  })
})
