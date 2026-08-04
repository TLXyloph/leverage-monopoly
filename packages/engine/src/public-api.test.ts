import { describe, it, expect } from 'vitest'
import type { RentFuture } from './core/state.js'
import * as engine from './index.js'
import { NO_ENCUMBRANCES } from './contexts/credit/index.js'
import { baseState, withDeed } from './contexts/decks/decks.fixture.js'

/**
 * The package root omitted BOTH `contexts/markets/index.js` and `core/decide.js`, while
 * still exporting `decideCredit` — whose default `NO_ENCUMBRANCES` ports return 0 for
 * every make-whole and every option refund. An external caller (the server) therefore
 * could not reach `CREDIT_PORTS` at all, and liquidating an encumbered deed silently
 * paid the rent-future holder $0 instead of rejecting. That is precisely the failure
 * `core/decide.ts`'s own docstring warns about.
 *
 * This test pins the surface a server needs to drive a full game, so dropping any of it
 * is a test failure rather than a silent capability gap.
 */
describe('the public surface a server needs to drive a full game', () => {
  it('exports the composition root, not just the raw context deciders', () => {
    for (const name of [
      'decideBoardAction', 'decideCreditAction', 'decidePropertyAction', 'decideSessionAction',
      'BOARD_PORTS', 'CREDIT_PORTS', 'MARKET_PORTS',
    ]) {
      expect(engine, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('exports every context decider and reducer', () => {
    for (const name of [
      'decideBoard', 'decideProperty', 'decideCredit', 'decideMarkets', 'decideDeedOptions',
      'decideSecuritization', 'decideUnderworld', 'decideDeck', 'decideSession', 'decideDraft',
      'reduce', 'replay', 'reduceBoard', 'reduceCredit', 'reduceMarkets', 'reduceDecks',
      'reduceSecuritization', 'reduceUnderworld', 'reduceSession', 'initialState',
    ]) {
      expect(engine, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('exports the markets read surface the ports are built from', () => {
    for (const name of [
      'rentFutureMakeWhole', 'deedOptionRefund', 'makeWholeOnMortgage',
      'assertDeedTransferable', 'markRentFuture', 'markDeedOption', 'mortgageImpact',
      'valueRentFuture', 'futureFor', 'outstandingOption',
    ]) {
      expect(engine, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('exports the card-effect read surface and the settlement entry points', () => {
    for (const name of [
      'rentMultiplier', 'borrowingBaseOverride', 'briberyTerms', 'entitlementOfKind',
      'runSettlement', 'runFinalSettlement', 'SETTLEMENT_STEPS', 'scoreGame', 'standings',
      'floorPercent', 'isWholeDollars',
    ]) {
      expect(engine, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('resolves the two name collisions instead of dropping markets', () => {
    // board's is per-deed from the Markov chain; markets' converts a per-roll probability.
    expect(typeof engine.expectedHitsPerRound).toBe('function')
    expect(typeof engine.expectedFutureHitsPerRound).toBe('function')
    // session's counts rounds left in the GAME; markets' counts rounds left in a window.
    expect(typeof engine.roundsRemaining).toBe('function')
    expect(typeof engine.contractRoundsRemaining).toBe('function')
  })

  it('CREDIT_PORTS actually values an encumbrance, where the default returns $0', () => {
    const s = {
      ...withDeed(baseState(), 'st-james-place', { owner: 'P1' }),
      futures: [{
        id: 'rf-1', deed: 'st-james-place', holder: 'P2', startRound: 8, endRound: 14,
      }] as readonly RentFuture[],
    }
    // This is the silent failure in one line: same state, same deed, two answers.
    expect(NO_ENCUMBRANCES.rentFutureMakeWhole(s, 'st-james-place')).toBe(0)
    expect(engine.CREDIT_PORTS.rentFutureMakeWhole(s, 'st-james-place')).toBeGreaterThan(0)
  })

  it('BOARD_PORTS actually pays a venture, where no port at all paid nothing', () => {
    const s = withDeed(baseState(), 'st-james-place', { owner: 'P1' })
    const running = {
      ...s,
      players: {
        ...s.players,
        P1: { ...s.players.P1, ventures: [{ kind: 'escort' as const, roundsRemaining: 3 }] },
      },
    }
    expect(engine.BOARD_PORTS.ventureIncomeFromRent(running, {
      type: 'RentCharged', from: 'P2', to: 'P1', deed: 'st-james-place', amount: 100,
    })).toEqual([
      { type: 'DirtyCashEarned', player: 'P1', amount: 60, source: 'escort' },
    ])
  })
})
