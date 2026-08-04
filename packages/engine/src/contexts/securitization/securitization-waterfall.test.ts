import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { GameEvent } from '../../core/events.js'
import { gameState, loan, pool, realDeed, tranches, withLoans, withPlayers } from './fixture.js'
import {
  collateralLiquidationEvents, collectedThisRound, distribute, settleSecuritization,
  terminateAllPools, terminationEvents,
} from './waterfall.js'

describe('waterfall priority', () => {
  const fresh = pool('pool-1', { tranches: tranches(600, 500, 810) })

  it('pays senior first and stops there when cash runs out', () => {
    expect(distribute(fresh, 400)).toEqual([{ tranche: 'senior', amount: 400 }])
  })

  it('fills senior to face then spills into mezzanine', () => {
    expect(distribute(fresh, 900)).toEqual([
      { tranche: 'senior', amount: 600 },
      { tranche: 'mezzanine', amount: 300 },
    ])
  })

  it('gives the whole residual to equity once senior and mezzanine are satisfied', () => {
    expect(distribute(fresh, 2000)).toEqual([
      { tranche: 'senior', amount: 600 },
      { tranche: 'mezzanine', amount: 500 },
      { tranche: 'equity', amount: 900 },
    ])
  })

  it('skips a retired tranche and pays only the unpaid remainder of the next', () => {
    const partial = pool('pool-1', {
      tranches: [
        { kind: 'senior', face: 600, paid: 600, holder: 'P2' },
        { kind: 'mezzanine', face: 500, paid: 450, holder: 'P3' },
        { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
      ],
    })
    expect(distribute(partial, 200)).toEqual([
      { tranche: 'mezzanine', amount: 50 },
      { tranche: 'equity', amount: 150 },
    ])
  })

  it('distributes nothing when nothing was collected', () => {
    expect(distribute(fresh, 0)).toEqual([])
    expect(distribute(fresh, -50)).toEqual([])
  })
})

/**
 * The single most important invariant in this task: the waterfall must never
 * distribute more than it collected. Because equity is an uncapped residual, the bound
 * is actually an equality whenever a pool carries all three tranches, but the property
 * is stated as `<=` so it still holds for a pool missing a tranche (e.g. no equity
 * tranche exists to soak up a residual — see the third property below).
 */
describe('waterfall bound', () => {
  const money = fc.integer({ min: 0, max: 20_000 })

  it('never distributes more than the pool collected, for any pool and any collection', () => {
    fc.assert(
      fc.property(
        money, money, money, money, money, money,
        (seniorFace, seniorPaid, mezzFace, mezzPaid, equityFace, collected) => {
          const p = pool('pool-1', {
            tranches: [
              { kind: 'senior', face: seniorFace, paid: seniorPaid, holder: 'P2' },
              { kind: 'mezzanine', face: mezzFace, paid: mezzPaid, holder: 'P3' },
              { kind: 'equity', face: equityFace, paid: 0, holder: 'P1' },
            ],
          })
          const total = distribute(p, collected).reduce((s, d) => s + d.amount, 0)
          return total <= collected
        },
      ),
      { numRuns: 500 },
    )
  })

  it('distributes exactly what was collected whenever a pool carries an equity tranche, because equity is uncapped', () => {
    const p = pool('pool-1', { tranches: tranches(600, 500, 810) })
    for (const collected of [1, 599, 600, 601, 1100, 1101, 5000]) {
      const total = distribute(p, collected).reduce((s, d) => s + d.amount, 0)
      expect(total).toBe(collected)
    }
  })

  it('proves the property has teeth: an off-by-one distribute() overshoots and the bound catches it', () => {
    // Same body as `distribute`, but `Math.min(owed, remaining) + 1` — the exact defect
    // Step 16 of the plan calls out. Confirms the property test is non-vacuous.
    function overshootingDistribute(p: ReturnType<typeof pool>, collected: number) {
      let remaining = Math.max(0, Math.floor(collected))
      const out: { tranche: string; amount: number }[] = []
      for (const kind of ['senior', 'mezzanine'] as const) {
        if (remaining <= 0) break
        const t = p.tranches.find((x) => x.kind === kind)
        if (t === undefined) continue
        const owed = Math.max(0, t.face - t.paid)
        const paid = Math.min(owed, remaining) + 1
        if (paid > 0) {
          out.push({ tranche: kind, amount: paid })
          remaining -= paid
        }
      }
      return out
    }
    const p = pool('pool-1', { tranches: tranches(600, 500, 810) })
    const total = overshootingDistribute(p, 400).reduce((s, d) => s + d.amount, 0)
    expect(total).toBeGreaterThan(400)
  })
})

describe('pool collection', () => {
  const withRentFuture = pool('pool-1', {
    assets: [
      { kind: 'peer-loan', id: 'l-1' },
      { kind: 'peer-loan', id: 'l-2' },
      { kind: 'rent-future', id: 'f-1' },
    ],
  })

  it('collects interest, repayments and routed rent from its own assets only', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 50 },
      { type: 'PeerLoanInterestPaid', id: 'l-9', amount: 999 },
      { type: 'PeerLoanRepaid', id: 'l-2', amount: 500 },
      { type: 'RentRoutedToFuture', contract: 'f-1', holder: 'P1', amount: 120 },
      { type: 'RentRoutedToFuture', contract: 'f-9', holder: 'P4', amount: 999 },
    ]
    expect(collectedThisRound(withRentFuture, roundEvents)).toBe(670)
  })

  it('counts liquidated collateral proceeds tagged to this pool only', () => {
    const roundEvents: readonly GameEvent[] = [
      { type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1', deeds: ['a'], proceeds: 140 },
      { type: 'PoolCollateralLiquidated', poolId: 'pool-2', loanId: 'l-7', deeds: ['b'], proceeds: 999 },
    ]
    expect(collectedThisRound(withRentFuture, roundEvents)).toBe(140)
  })

  it('collects nothing when the round produced no relevant events', () => {
    expect(collectedThisRound(withRentFuture, [])).toBe(0)
  })
})

/** Spec 19.4, and the exact `ECONOMY.LIQUIDATION_FLOOR = 0.8` (not the stale 0.7 an
 * earlier draft of this task assumed) applied per deed, then summed. St. James Place
 * and Tennessee Avenue are both real $180 deeds; Boardwalk is $400. */
describe('collateral conversion, spec 19.4', () => {
  it('converts a defaulted pooled loan\'s collateral to cash at the liquidation floor', () => {
    expect(ECONOMY.LIQUIDATION_FLOOR).toBe(0.8)
    expect(floorPercent(180, ECONOMY.LIQUIDATION_FLOOR)).toBe(144)
    expect(floorPercent(400, ECONOMY.LIQUIDATION_FLOOR)).toBe(320)

    const state = withLoans(
      {
        ...gameState(),
        deeds: {
          'st-james-place': realDeed('st-james-place', 'P2'),
          'tennessee-avenue': realDeed('tennessee-avenue', 'P2'),
          boardwalk: realDeed('boardwalk', 'P2'),
        },
      },
      [
        loan('l-1', { collateral: ['st-james-place', 'tennessee-avenue'] }),
        loan('l-2', { collateral: ['boardwalk'] }),
      ],
    )
    const withPool = { ...state, pools: [pool('pool-1')] }
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 300 },
    ]
    expect(collateralLiquidationEvents(withPool, roundEvents)).toEqual([{
      type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1',
      deeds: ['st-james-place', 'tennessee-avenue'],
      proceeds: 288, // floorPercent(180, 0.8) = 144, per deed, then summed
    }])
  })

  it('emits nothing for a defaulted loan that is not inside any pool', () => {
    const state = withLoans(
      { ...gameState(), deeds: { boardwalk: realDeed('boardwalk', 'P2') } },
      [loan('l-8', { collateral: ['boardwalk'] })],
    )
    const withPool = { ...state, pools: [pool('pool-1')] } // pool-1's assets are l-1/l-2/l-3, not l-8
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-8', collateralTo: 'P1', writtenOff: 500 },
    ]
    expect(collateralLiquidationEvents(withPool, roundEvents)).toEqual([])
  })

  it('emits nothing for a pooled loan with no collateral pledged', () => {
    const state = withLoans(gameState(), [loan('l-1', { collateral: [] })])
    const withPool = { ...state, pools: [pool('pool-1')] }
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ]
    expect(collateralLiquidationEvents(withPool, roundEvents)).toEqual([])
  })

  it('ignores a pool that has already terminated', () => {
    const state = withLoans(
      { ...gameState(), deeds: { boardwalk: realDeed('boardwalk', 'P2') } },
      [loan('l-1', { collateral: ['boardwalk'] })],
    )
    const withPool = { ...state, pools: [pool('pool-1', { terminated: true })] }
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ]
    expect(collateralLiquidationEvents(withPool, roundEvents)).toEqual([])
  })
})

describe('termination', () => {
  const partlyPaid = pool('pool-1', {
    tranches: [
      { kind: 'senior', face: 600, paid: 600, holder: 'P2' },
      { kind: 'mezzanine', face: 500, paid: 200, holder: 'P3' },
      { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
    ],
  })

  it('terminates a pool once every underlying asset has matured or defaulted', () => {
    const state = withLoans(gameState(), [
      loan('l-1', { status: 'repaid' }),
      loan('l-2', { status: 'defaulted' }),
      loan('l-3', { status: 'repaid' }),
    ])
    const withPool = { ...state, pools: [partlyPaid] }
    expect(settleSecuritization(withPool, [])).toEqual([{
      type: 'PoolTerminated', poolId: 'pool-1',
      shortfalls: [
        { tranche: 'mezzanine', shortfall: 300 },
        { tranche: 'equity', shortfall: 810 },
      ],
    }])
  })

  it('leaves a pool alive while any asset is still running', () => {
    const state = withLoans(gameState(), [
      loan('l-1', { status: 'repaid' }),
      loan('l-2', { status: 'active' }),
      loan('l-3', { status: 'repaid' }),
    ])
    const withPool = { ...state, pools: [partlyPaid] }
    expect(settleSecuritization(withPool, [])).toEqual([])
  })

  it('terminates every live pool at the end of round 24 regardless of its assets', () => {
    const state = withLoans(gameState({ round: ECONOMY.TOTAL_ROUNDS }), [
      loan('l-1', { status: 'active' }), loan('l-2', { status: 'active' }), loan('l-3', { status: 'active' }),
    ])
    const withPool = { ...state, pools: [partlyPaid] }
    expect(terminateAllPools(withPool)).toEqual([{
      type: 'PoolTerminated', poolId: 'pool-1',
      shortfalls: [
        { tranche: 'mezzanine', shortfall: 300 },
        { tranche: 'equity', shortfall: 810 },
      ],
    }])
  })

  it('ignores an already-terminated pool', () => {
    const withPool = { ...gameState(), pools: [{ ...partlyPaid, terminated: true }] }
    expect(terminateAllPools(withPool)).toEqual([])
    expect(settleSecuritization(withPool, [])).toEqual([])
  })

  it('records no shortfall for a pool paid off in full', () => {
    const paidOff = pool('pool-1', {
      tranches: [
        { kind: 'senior', face: 600, paid: 600, holder: 'P2' },
        { kind: 'mezzanine', face: 500, paid: 500, holder: 'P3' },
        { kind: 'equity', face: 810, paid: 900, holder: 'P1' }, // uncapped: paid past face
      ],
    })
    expect(terminationEvents(paidOff)).toEqual([{ type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [] }])
  })
})

describe('settleSecuritization: the full Settlement step 6 pass', () => {
  it('converts collateral, runs the waterfall against the post-collateral cash, and terminates in one pass', () => {
    const base = withLoans(
      { ...gameState(), deeds: { boardwalk: realDeed('boardwalk', 'P2') } },
      [
        loan('l-1', { status: 'defaulted', collateral: ['boardwalk'] }),
        loan('l-2', { status: 'repaid' }),
        loan('l-3', { status: 'repaid' }),
      ],
    )
    const withPool = withPlayers(
      { ...base, pools: [pool('pool-1', {
        tranches: [
          { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
          { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
          { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
        ],
      })] },
      { P1: { cleanCash: 1000 } }, // stands in for step 5's already-credited $550 repayment
    )
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
      { type: 'PeerLoanRepaid', id: 'l-2', amount: 550 },
    ]
    // floorPercent(400, 0.8) = 320. collected = 320 (collateral) + 550 (l-2) = 870.
    // senior 600 to face, mezzanine 500 owed but only 270 remains -> 270, equity 0.
    expect(settleSecuritization(withPool, roundEvents)).toEqual([
      {
        type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1',
        deeds: ['boardwalk'], proceeds: 320,
      },
      {
        type: 'WaterfallPaid', poolId: 'pool-1', collected: 870,
        distributions: [
          { tranche: 'senior', amount: 600 },
          { tranche: 'mezzanine', amount: 270 },
        ],
      },
      {
        // Judged AFTER this round's own distribution: senior, paid in full by this very
        // waterfall, is not recorded as short.
        type: 'PoolTerminated', poolId: 'pool-1',
        shortfalls: [
          { tranche: 'mezzanine', shortfall: 230 },
          { tranche: 'equity', shortfall: 810 },
        ],
      },
    ])
  })

  it('checks the distressed-debt fallback against post-collateral cash, not the stale pre-collateral figure', () => {
    // If the fallback checked the ORIGINAL state (before collateral is credited), the
    // originator here would look short by 320 that they, in fact, already have.
    const base = withLoans(
      { ...gameState(), deeds: { boardwalk: realDeed('boardwalk', 'P2') } },
      [
        loan('l-1', { status: 'defaulted', collateral: ['boardwalk'] }),
        loan('l-2', { status: 'active' }),
        loan('l-3', { status: 'active' }),
      ],
    )
    const withPool = withPlayers(
      { ...base, pools: [pool('pool-1', { tranches: tranches(300, 0, 20) })] },
      { P1: { cleanCash: 0 } },
    )
    const roundEvents: readonly GameEvent[] = [
      { type: 'PeerLoanDefaulted', id: 'l-1', collateralTo: 'P1', writtenOff: 500 },
    ]
    const events = settleSecuritization(withPool, roundEvents)
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'DistressedDebtIncurred' }))
    expect(events[0]).toMatchObject({ type: 'PoolCollateralLiquidated', proceeds: 320 })
    expect(events[1]).toMatchObject({ type: 'WaterfallPaid', collected: 320 })
  })

  it('books the originator\'s shortfall as distressed debt rather than negative cash', () => {
    const state = withPlayers(
      withLoans(gameState({ round: 13 }), [
        loan('l-1', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
        loan('l-2', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
        loan('l-3', { outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15 }),
      ]),
      { P1: { cleanCash: 100 } },
    )
    const withPool = { ...state, pools: [pool('pool-1', { tranches: tranches(600, 500, 810) })] }
    const events = settleSecuritization(withPool, [
      { type: 'PeerLoanInterestPaid', id: 'l-1', amount: 500 },
    ])
    expect(events).toContainEqual({ type: 'DistressedDebtIncurred', player: 'P1', amount: 400 })
  })
})
