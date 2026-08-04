import { describe, it, expect } from 'vitest'
import { isRejection } from '../../core/errors.js'
import { reduce } from '../../core/reduce.js'
import { PLAYER_IDS } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { runFinalSettlement, runSettlement } from './settlement.js'
import { deed, loan, player, pool, scoringState, swap, tranche } from './session.fixture.js'

/**
 * Task 20's conserved quantity, restated locally: `sum(cleanCash) - sum(drawnCredit)
 * - sum(distressedDebt) + treasury`. This file runs the REAL Settlement step
 * generators (nothing here is mocked, unlike `settlement.test.ts`, which mocks the
 * step generators to pin their ORDER) against states carrying an unmortgaged deed,
 * drawn credit, a peer loan and — for the round-24 case — a pool whose tranche falls
 * short and triggers a referencing CDS, so every money-moving step in the fold gets
 * to run for real at least once and the whole fold is checked end to end, not
 * step by step.
 */
function conserved(state: GameState): Money {
  const held = PLAYER_IDS.reduce((total, id) => {
    const p = state.players[id]
    return total + p.cleanCash - p.drawnCredit - p.distressedDebt
  }, 0)
  return held + state.treasury
}

const NO_INPUT = { auditDice: {}, roundEvents: [] as const }

const withPlayers = (
  patch: Partial<Record<PlayerId, ReturnType<typeof player>>>,
): Record<PlayerId, ReturnType<typeof player>> =>
  Object.fromEntries(
    PLAYER_IDS.map((id) => [id, patch[id] ?? player(id, { cleanCash: 1_000 })]),
  ) as Record<PlayerId, ReturnType<typeof player>>

describe('money conservation across a full Settlement fold', () => {
  it('holds across an ordinary round with carrying cost, interest and a peer loan', () => {
    const before = scoringState({
      phase: 'settlement',
      round: 14,
      era: 3,
      players: withPlayers({
        P1: player('P1', { cleanCash: 1_000, drawnCredit: 500 }),
      }),
      deeds: {
        'd-1': deed('d-1', { owner: 'P1', faceValue: 200, mortgaged: false }),
        'd-2': deed('d-2', { owner: 'P1', faceValue: 200, mortgaged: false }),
      },
      loans: [loan({
        id: 'l-1', lender: 'P3', borrower: 'P1', principal: 300, outstanding: 300,
        ratePerRound: 0.1, maturesAtRound: 24,
      })],
    })

    const result = runSettlement(before, NO_INPUT)
    expect(isRejection(result)).toBe(false)
    if (isRejection(result)) return
    // Non-vacuous: carrying cost, credit interest and peer-loan interest all fire.
    expect(result.map((e) => e.type)).toEqual(expect.arrayContaining([
      'CarryingCostCharged', 'InterestAccrued', 'PeerLoanInterestPaid',
    ]))

    const after = result.reduce(reduce, before)
    expect(conserved(after)).toBe(conserved(before))
  })

  it('holds through round-24 pool termination and a CDS the termination triggers', () => {
    const before = scoringState({
      phase: 'settlement',
      round: 24,
      era: 4,
      players: withPlayers({
        P4: player('P4', { cleanCash: 1_000 }),
      }),
      pools: [pool({
        id: 'pool-1', originator: 'P1', assets: [],
        tranches: [
          tranche('senior', { face: 0, paid: 0, holder: 'P2' }),
          tranche('mezzanine', { face: 400, paid: 0, holder: 'P3' }),
          tranche('equity', { face: 0, paid: 0, holder: 'P1' }),
        ],
        terminated: false,
      })],
      swaps: [swap({
        id: 's-1', buyer: 'P3', seller: 'P4',
        reference: { kind: 'tranche', poolId: 'pool-1', tranche: 'mezzanine' },
        notional: 400, premiumPerRound: 0, status: 'active',
      })],
    })

    const result = runFinalSettlement(before, NO_INPUT)
    expect(isRejection(result)).toBe(false)
    if (isRejection(result)) return
    expect(result.map((e) => e.type)).toEqual(expect.arrayContaining([
      'PoolTerminated', 'SwapTriggered', 'GameScored',
    ]))

    const after = result.reduce(reduce, before)
    expect(conserved(after)).toBe(conserved(before))
  })
})
