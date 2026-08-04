import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../markets/index.js', () => ({
  markRentFuture: vi.fn(), markDeedOption: vi.fn(),
}))
vi.mock('../securitization/index.js', () => ({
  distribute: vi.fn(), expectedPoolCashflow: vi.fn(), borrowerLeverage: vi.fn(),
}))

import { markDeedOption, markRentFuture } from '../markets/index.js'
import { borrowerLeverage, distribute, expectedPoolCashflow } from '../securitization/index.js'
import {
  isGameOver, netWorth, netWorthBreakdown, netWorths, scoreGame, standings,
  targetReachedBy, winner, winProgress,
} from './scoring.js'
import { CONFIG, deed, future, loan, player, scoringState } from './session.fixture.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(markRentFuture).mockReturnValue(0)
  vi.mocked(markDeedOption).mockReturnValue(0)
  vi.mocked(borrowerLeverage).mockReturnValue(0)
  vi.mocked(expectedPoolCashflow).mockReturnValue(0)
  vi.mocked(distribute).mockReturnValue([])
})

describe('netWorth', () => {
  it('adds clean cash, deed face, building cost and marks; subtracts every liability', () => {
    const s = scoringState({
      players: {
        ...scoringState().players,
        P1: player('P1', {
          cleanCash: 400, dirtyCash: 9_999, drawnCredit: 300, distressedDebt: 120,
        }),
      },
      deeds: {
        // houseCost is already the price paid (90% of list) — see marks.test.ts's note.
        'd-1': deed('d-1', { owner: 'P1', faceValue: 200, houseCost: 90, houses: 2 }),
        'd-2': deed('d-2', { owner: 'P1', faceValue: 160, mortgaged: true }),
        'd-3': deed('d-3', { owner: 'P2', faceValue: 500 }),
      },
      futures: [future({ id: 'f-1', holder: 'P1' })],
      loans: [
        loan({ id: 'l-1', lender: 'P3', borrower: 'P1', outstanding: 250 }),
        loan({ id: 'l-2', lender: 'P1', borrower: 'P4', outstanding: 100 }),
      ],
    })
    vi.mocked(markRentFuture).mockReturnValue(75)

    const b = netWorthBreakdown(s, 'P1')
    expect(b.cleanCash).toBe(400)
    expect(b.deedValue).toBe(200 + 72)        // 160 - ceil(160 x 0.55) = 160 - 88
    expect(b.buildingCost).toBe(180)          // 2 x 90 (already the price paid)
    expect(b.instruments).toBe(75 + 100)      // rent future mark + note lent at par
    expect(b.drawnCredit).toBe(300)
    expect(b.peerLoansOwed).toBe(250)
    expect(b.distressedDebt).toBe(120)
    expect(b.dirtyCash).toBe(0)               // dirty cash x 0
    expect(b.total).toBe(400 + 272 + 180 + 175 - 300 - 250 - 120)
    expect(netWorth(s, 'P1')).toBe(b.total)
  })

  it('counts dirty cash as exactly zero however large it is', () => {
    const base = scoringState()
    const rich = scoringState({
      players: { ...base.players, P1: player('P1', { dirtyCash: 50_000 }) },
    })
    expect(netWorth(rich, 'P1')).toBe(netWorth(base, 'P1'))
  })

  it('goes negative for a player carrying distressed debt and nothing else', () => {
    const s = scoringState({
      players: { ...scoringState().players, P1: player('P1', { distressedDebt: 900 }) },
    })
    expect(netWorth(s, 'P1')).toBe(-900)
  })

  it('excludes deeds the bank took at liquidation from every player', () => {
    const s = scoringState({ deeds: { 'd-1': deed('d-1', { owner: 'bank', faceValue: 400 }) } })
    expect(netWorths(s)).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 })
  })

  it('nets to the same total when a peer loan is scored from both sides', () => {
    // The lender's note marks at par against an unlevered borrower, and the borrower
    // owes exactly the outstanding, so a peer loan is table-neutral at scoring.
    const s = scoringState({ loans: [loan({ lender: 'P1', borrower: 'P2', outstanding: 400 })] })
    expect(netWorth(s, 'P1') + netWorth(s, 'P2')).toBe(0)
  })
})

describe('standings', () => {
  it('ranks by net worth descending and breaks ties by turn order', () => {
    const s = scoringState({
      players: {
        P1: player('P1', { cleanCash: 100 }),
        P2: player('P2', { cleanCash: 300 }),
        P3: player('P3', { cleanCash: 100 }),
        P4: player('P4', { cleanCash: 50 }),
      },
    })
    expect(standings(s)).toEqual([
      { player: 'P2', netWorth: 300, rank: 1 },
      { player: 'P1', netWorth: 100, rank: 2 },
      { player: 'P3', netWorth: 100, rank: 2 },
      { player: 'P4', netWorth: 50, rank: 4 },
    ])
  })
})

describe('scoreGame', () => {
  it('emits one GameScored carrying every player\'s net worth', () => {
    const s = scoringState({
      players: { ...scoringState().players, P2: player('P2', { cleanCash: 700 }) },
    })
    expect(scoreGame(s)).toEqual({
      type: 'GameScored', netWorths: { P1: 0, P2: 700, P3: 0, P4: 0 },
    })
  })
})

const withTarget = (target: number): typeof CONFIG => ({
  ...CONFIG, winCondition: { kind: 'net-worth-target' as const, target },
})

describe('win conditions', () => {
  it('reports no target and never-achieved progress under fixed-rounds', () => {
    const s = scoringState({
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 9_000 }) },
    })
    expect(winProgress(s, 'P1')).toEqual({
      kind: 'fixed-rounds', netWorth: 9_000, target: null, remaining: null, achieved: false,
    })
  })

  it('tracks the shortfall to a configured target', () => {
    const s = scoringState({
      config: withTarget(5_000),
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 3_200 }) },
    })
    expect(winProgress(s, 'P1')).toEqual({
      kind: 'net-worth-target', netWorth: 3_200, target: 5_000, remaining: 1_800, achieved: false,
    })
  })

  it('clamps remaining at zero once the target is met', () => {
    const s = scoringState({
      config: withTarget(5_000),
      players: { ...scoringState().players, P1: player('P1', { cleanCash: 6_000 }) },
    })
    expect(winProgress(s, 'P1').remaining).toBe(0)
    expect(winProgress(s, 'P1').achieved).toBe(true)
    expect(targetReachedBy(s)).toEqual(['P1'])
  })

  it('ends a fixed-rounds game only after round 24 has been settled', () => {
    expect(isGameOver(scoringState({ round: 23, phase: 'settlement' }))).toBe(false)
    expect(isGameOver(scoringState({ round: 24, phase: 'settlement' }))).toBe(false)
    expect(isGameOver(scoringState({ round: 24, phase: 'scoring' }))).toBe(true)
    expect(isGameOver(scoringState({ round: 24, phase: 'complete' }))).toBe(true)
  })

  it('ends a target game the moment any player is at or above the target', () => {
    const s = scoringState({
      config: withTarget(1_000), round: 5, phase: 'open',
      players: { ...scoringState().players, P3: player('P3', { cleanCash: 1_000 }) },
    })
    expect(isGameOver(s)).toBe(true)
    expect(winner(s)).toBe('P3')
  })

  it('awards a tied target race to the earlier player in turn order', () => {
    const s = scoringState({
      config: { ...withTarget(1_000), turnOrder: ['P4', 'P3', 'P2', 'P1'] },
      round: 5, phase: 'open',
      players: {
        ...scoringState().players,
        P1: player('P1', { cleanCash: 1_200 }),
        P3: player('P3', { cleanCash: 1_200 }),
      },
    })
    expect(winner(s)).toBe('P3')
  })

  it('has no winner while a fixed-rounds game is still running', () => {
    expect(winner(scoringState({ round: 12, phase: 'open' }))).toBeNull()
  })
})
