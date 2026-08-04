import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GameEvent } from '../../core/events.js'
import * as markets from '../markets/index.js'
import * as underworld from '../underworld/index.js'
import * as credit from '../credit/index.js'
import * as securitization from '../securitization/index.js'
import { isRejection, reject } from '../../core/errors.js'
import { SETTLEMENT_STEPS, runFinalSettlement, runSettlement } from './settlement.js'
import { player, scoringState } from './session.fixture.js'

/**
 * `runSettlement`/`runFinalSettlement` fold each step through the ROOT reducer
 * (`core/reduce.js`), which ALSO imports `reduceMarkets`/`reduceUnderworld`/
 * `reduceCredit`/`reducePeerLoans`/`reduceSecuritization` from these same four
 * modules. A `vi.mock(...)` factory replaces the whole module for every importer in
 * this file's graph — including `core/reduce.js` — and turns out to be fragile when
 * this suite runs alongside other files that import the same contexts' submodules
 * directly (e.g. `underworld.test.ts` importing `./ventures.js` unmocked): the
 * settlement-step overrides silently failed to apply. `vi.spyOn` on the real
 * namespace objects patches the live module in place instead of substituting a new
 * one, which both keeps every reducer these tests need intact and is robust to
 * whichever other test files happen to share this run.
 */
vi.mock('../markets/index.js', { spy: true })
vi.mock('../underworld/index.js', { spy: true })
vi.mock('../credit/index.js', { spy: true })
vi.mock('../securitization/index.js', { spy: true })

const NO_INPUT = { auditDice: {}, roundEvents: [] as readonly GameEvent[] }

const tag = (name: string): readonly GameEvent[] =>
  [{ type: 'HeatChanged', player: 'P1', delta: 0, reason: name }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(markets.markRentFuture).mockReturnValue(0)
  vi.mocked(markets.markDeedOption).mockReturnValue(0)
  vi.mocked(securitization.borrowerLeverage).mockReturnValue(0)
  vi.mocked(securitization.expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(securitization.distribute).mockReturnValue([])
  vi.mocked(markets.expireRentFutures).mockReturnValue(tag('1-futures-expire'))
  vi.mocked(underworld.settleVentures).mockReturnValue(tag('2-ventures'))
  vi.mocked(credit.settleCarryingCost).mockReturnValue(tag('3-carrying-cost'))
  vi.mocked(credit.settleCreditInterest).mockReturnValue(tag('4-credit-interest'))
  vi.mocked(credit.settlePeerLoans).mockReturnValue(tag('5-peer-loans'))
  vi.mocked(securitization.settleSecuritization).mockReturnValue(tag('6-waterfalls'))
  vi.mocked(securitization.settleSwapPremiums).mockReturnValue(tag('7-cds-premiums'))
  vi.mocked(credit.settleDistressedDebt).mockReturnValue(tag('8-distressed-debt'))
  vi.mocked(underworld.settleAudits).mockReturnValue(tag('9-audits'))
  vi.mocked(credit.flagMarginCalls).mockReturnValue(tag('10-margin-calls'))
  vi.mocked(markets.lapseDeedOptions).mockReturnValue(tag('11-options-lapse'))
  vi.mocked(securitization.terminateAllPools).mockReturnValue([])
})

const reasons = (events: readonly GameEvent[]): readonly string[] =>
  events.flatMap((e) => (e.type === 'HeatChanged' ? [e.reason] : []))

describe('runSettlement', () => {
  it('runs spec 19.1 steps 1 to 11 in exactly that order', () => {
    const out = runSettlement(scoringState({ round: 12 }), NO_INPUT)
    expect(isRejection(out)).toBe(false)
    expect(reasons(out as readonly GameEvent[])).toEqual([
      '1-futures-expire', '2-ventures', '3-carrying-cost', '4-credit-interest',
      '5-peer-loans', '6-waterfalls', '7-cds-premiums', '8-distressed-debt',
      '9-audits', '10-margin-calls', '11-options-lapse',
    ])
    expect(SETTLEMENT_STEPS).toHaveLength(11)
  })

  it('feeds each step the state left by every step before it', () => {
    // The audit fine at step 9 must be visible to margin flagging at step 10, which is
    // the single interaction spec 19.1 calls out by name.
    vi.mocked(underworld.settleAudits).mockReturnValue([
      { type: 'AuditResolved', player: 'P1', seized: 0, fine: 400,
        paidFromCash: 0, capitalised: 400 },
    ])
    vi.mocked(credit.flagMarginCalls).mockImplementation((s) =>
      s.players.P1.drawnCredit >= 400 ? tag('flagged') : tag('not-flagged'))

    const out = runSettlement(scoringState({ round: 20 }), NO_INPUT) as readonly GameEvent[]
    expect(reasons(out)).toContain('flagged')
  })

  it('passes the round\'s events to the waterfall step and the dice to the audit step', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'RentCharged', from: 'P2', to: 'P1', deed: 'd-1', amount: 40 },
    ]
    const auditDice = { P1: [2, 3] as const }
    runSettlement(scoringState({ round: 20 }), { auditDice, roundEvents })
    // The waterfall step is handed the round's events PLUS everything Settlement has
    // emitted so far this pass — the `PoolInjectionReleased` events released by the
    // step immediately before it are card-injected pool cash that step 6 must
    // distribute, and they do not exist in the caller's fixed `roundEvents` snapshot.
    expect(vi.mocked(securitization.settleSecuritization))
      .toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([...roundEvents]))
    const [, seen] = vi.mocked(securitization.settleSecuritization).mock.calls[0] ?? []
    expect((seen ?? []).slice(0, roundEvents.length)).toEqual(roundEvents)
    expect(vi.mocked(underworld.settleAudits))
      .toHaveBeenCalledWith(expect.anything(), auditDice)
  })

  it('aborts the whole Settlement on a rejection and emits nothing', () => {
    vi.mocked(underworld.settleAudits).mockReturnValue(reject('INVALID_DICE', 'That is not a die.'))
    const out = runSettlement(scoringState({ round: 20 }), NO_INPUT)
    expect(isRejection(out)).toBe(true)
    expect(vi.mocked(markets.lapseDeedOptions)).not.toHaveBeenCalled()
  })
})

describe('runFinalSettlement', () => {
  it('terminates pools, then triggers their CDS, then scores — in that order', () => {
    vi.mocked(securitization.terminateAllPools).mockReturnValue([
      { type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [{ tranche: 'mezzanine', shortfall: 400 }] },
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])

    const out = runFinalSettlement(scoringState({ round: 24 }), NO_INPUT) as readonly GameEvent[]
    const types = out.map((e) => e.type)
    expect(types.indexOf('PoolTerminated')).toBeGreaterThan(types.indexOf('HeatChanged'))
    expect(types.indexOf('SwapTriggered')).toBeGreaterThan(types.indexOf('PoolTerminated'))
    expect(types.indexOf('GameScored')).toBe(types.length - 1)
  })

  it('reflects a CDS triggered by termination in the final score', () => {
    // P4 wrote protection on the mezzanine tranche and has $1,000 clean. The pool
    // terminates $400 short, the swap triggers, P4 pays P3. If scoring ran before the
    // trigger, P4 would score 1000 and P3 would score 0. The swap here must exist in
    // `state.swaps` so the ROOT reducer's `reduceSecuritization` can find and pay it —
    // the step generator is mocked, but the reducer that applies its output is not.
    const base = scoringState({
      round: 24,
      players: {
        ...scoringState().players,
        P3: player('P3', { cleanCash: 0 }),
        P4: player('P4', { cleanCash: 1_000 }),
      },
      swaps: [{
        id: 's-1', buyer: 'P3', seller: 'P4',
        reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
        notional: 400, premiumPerRound: 0, status: 'active',
      }],
    })
    vi.mocked(securitization.terminateAllPools).mockReturnValue([
      { type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [{ tranche: 'mezzanine', shortfall: 400 }] },
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])

    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    expect(scored).toEqual({
      type: 'GameScored',
      netWorths: expect.objectContaining({ P3: 400, P4: 600 }),
    })
  })

  it('counts a triggered CDS exactly once, not once in cash and again as notional', () => {
    const base = scoringState({
      round: 24,
      players: { ...scoringState().players, P4: player('P4', { cleanCash: 1_000 }) },
      swaps: [{
        id: 's-1', buyer: 'P3', seller: 'P4',
        reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
        notional: 400, premiumPerRound: 0, status: 'active',
      }],
    })
    vi.mocked(securitization.terminateAllPools).mockReturnValue([
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
    ])
    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    // 600, not 200. The notional is not deducted a second time at scoring.
    expect(scored?.type === 'GameScored' && scored.netWorths.P4).toBe(600)
  })

  it('still scores when a writer cannot cover the payout from clean cash', () => {
    const base = scoringState({
      round: 24,
      players: { ...scoringState().players, P4: player('P4', { cleanCash: 100 }) },
      swaps: [{
        id: 's-1', buyer: 'P3', seller: 'P4',
        reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
        notional: 400, premiumPerRound: 0, status: 'active',
      }],
    })
    vi.mocked(securitization.terminateAllPools).mockReturnValue([
      { type: 'SwapTriggered', id: 's-1', payout: 400 },
      // The real `swaps.ts` emits this alongside `SwapTriggered` whenever the seller's
      // clean cash falls short (spec 19.8's obligation waterfall); `terminateAllPools`
      // is mocked here, so it is supplied explicitly, matching what the real function
      // would produce for a seller with only $100 clean cash against a $400 payout.
      { type: 'ObligationCapitalised', player: 'P4', amount: 300, obligation: 'cds-payout' },
    ])
    const out = runFinalSettlement(base, NO_INPUT) as readonly GameEvent[]
    const scored = out.find((e) => e.type === 'GameScored')
    // 100 clean spent, 300 capitalised into drawn credit: -300 either way.
    expect(scored?.type === 'GameScored' && scored.netWorths.P4).toBe(-300)
  })
})
