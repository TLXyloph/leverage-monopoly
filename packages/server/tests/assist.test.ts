import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ECONOMY, borrowingBase, launderProceeds,
  type GameState, type PlayerId, type PlayerState,
} from '@leverage/engine'
import { playerAssist, type Warning } from '../src/assist.js'
import { startHarness, type Harness } from './harness.js'
import { advanceTo, readState, runDraft } from './driver.js'

/**
 * "Every warning the assist panel can produce actually fires in a real scenario" — the
 * web brief's second completion check, and the UI form of the defect that escaped the
 * engine's reviews six times. A warning that can never render is the same bug as a
 * function nobody calls, in a different costume.
 *
 * States are patched from a REAL drafted game rather than invented from whole cloth, so
 * a warning cannot pass on a state the engine could never actually produce.
 */

const ALL_WARNING_IDS: readonly string[] = [
  'margin-call-open',
  'mortgage-triggers-margin-call',
  'mortgage-owes-make-whole',
  'audit-probability',
  'launder-haircut-at-cap',
  'venture-loses-money',
  'settlement-exceeds-cash',
  'distressed-debt-accruing',
  'peer-loan-maturing',
  'peer-loan-interest-exceeds-cash',
  'rent-future-expiring',
  'deed-option-expiring',
  'cds-premium-exceeds-cash',
  'no-earning-deeds',
]

function idsOf(warnings: readonly Warning[]): string[] {
  return warnings.map((w) => w.id.split(':')[0] ?? w.id)
}

function withPlayer(
  state: GameState, player: PlayerId, patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: { ...state.players, [player]: { ...state.players[player], ...patch } },
  }
}

function deedsOf(state: GameState, player: PlayerId): string[] {
  return Object.values(state.deeds).filter((d) => d.owner === player).map((d) => d.id)
}

describe('the assist panel', () => {
  let h: Harness
  let drafted: GameState

  beforeAll(async () => {
    h = await startHarness({ unlockMode: 'all' })
    await runDraft(h)
    await advanceTo(h, 'open')
    drafted = await readState(h)
  }, 60_000)

  afterAll(async () => { await h.close() })

  it('shows venture payoffs at their LAUNDERED value, never their dirty value', () => {
    const assist = playerAssist(drafted, 'P1')
    const numbers = assist.ventures.find((v) => v.kind === 'numbers')
    if (numbers === undefined) throw new Error('the numbers racket vanished from the table')

    const gross = ECONOMY.VENTURES.numbers.perRound * ECONOMY.VENTURES.numbers.rounds
    expect(numbers.expectedDirty).toBe(gross)

    /**
     * The single highest-value number the panel produces. Ventures cost CLEAN cash and
     * pay DIRTY cash, so a venture must return over 133% of its cost merely to break
     * even after the haircut — simulation put the gap between correct and naive
     * underworld play at about $1,290, the largest skill cliff in the economy. The
     * laundered figure is quoted at the Heat the player will carry AFTER the launch,
     * because the launch is what raises it.
     */
    const heatAfter = drafted.players.P1.heat + ECONOMY.VENTURES.numbers.heat
    expect(numbers.launderedValue).toBe(launderProceeds(gross, heatAfter))
    expect(numbers.launderedValue).toBeLessThan(numbers.expectedDirty)
    expect(numbers.netOfCost).toBe(numbers.launderedValue - numbers.cost)
  })

  it('prices a rent-driven venture off the player\'s own board traffic', () => {
    const landlord = playerAssist(drafted, 'P1').ventures.find((v) => v.kind === 'escort')
    const stripped = playerAssist(
      { ...drafted, deeds: Object.fromEntries(
        Object.entries(drafted.deeds).map(([id, d]) => [id, { ...d, owner: null }]),
      ) },
      'P1',
    ).ventures.find((v) => v.kind === 'escort')

    // Escort Service pays a share of rent CHARGED on the player's own deeds (spec 19.5),
    // so a player who owns nothing earns nothing from it — a trap the panel must expose.
    expect(landlord?.expectedDirty ?? 0).toBeGreaterThan(0)
    expect(stripped?.expectedDirty).toBe(0)
    expect(stripped?.netOfCost).toBe(-ECONOMY.VENTURES.escort.cost)
  })

  it('reads its era gating from the engine, not from a table of its own', () => {
    const eraOne = playerAssist({ ...drafted, era: 1, config: { ...drafted.config, unlockMode: 'progressive' } }, 'P1')
    expect(eraOne.unlocked).toContain('mortgage')
    expect(eraOne.unlocked).not.toContain('cdo')

    const eraThree = playerAssist({ ...drafted, era: 3, config: { ...drafted.config, unlockMode: 'progressive' } }, 'P1')
    expect(eraThree.unlocked).toContain('cdo')
    expect(eraThree.unlocked).toContain('deed-option')
  })

  it('fires every warning it is capable of producing', () => {
    const seen = new Set<string>()
    const record = (state: GameState, player: PlayerId = 'P1'): string[] => {
      const ids = idsOf(playerAssist(state, player).warnings)
      for (const id of ids) seen.add(id)
      return ids
    }

    const p1Deeds = deedsOf(drafted, 'P1')
    const biggest = [...p1Deeds].sort(
      (a, b) => (drafted.deeds[b]?.faceValue ?? 0) - (drafted.deeds[a]?.faceValue ?? 0),
    )[0] ?? ''

    // An open margin call, and distressed debt compounding behind it.
    expect(record(withPlayer(drafted, 'P1', {
      drawnCredit: 5_000, marginCallFlaggedAt: 1, distressedDebt: 400, cleanCash: 0,
    }))).toEqual(expect.arrayContaining([
      'margin-call-open', 'distressed-debt-accruing', 'settlement-exceeds-cash',
    ]))

    // Drawn exactly to the base: not yet breached, but mortgaging anything breaks it.
    const atTheLimit = withPlayer(drafted, 'P1', { drawnCredit: borrowingBase(drafted, 'P1') })
    expect(record(atTheLimit)).toContain('mortgage-triggers-margin-call')

    // A live rent future on a deed the owner might mortgage.
    const encumbered: GameState = {
      ...drafted,
      futures: [{
        id: 'rf:test', deed: biggest, holder: 'P2',
        startRound: drafted.round, endRound: drafted.round + 3,
      }],
    }
    expect(record(encumbered)).toContain('mortgage-owes-make-whole')

    /**
     * Audits are live from round 13, and Heat is what they roll against. Heat 12 is past
     * the point where the laundering haircut stops worsening: 25% base plus 5% for each
     * point above 3 reaches the 60% cap at Heat 10, so this also pins the cap warning.
     */
    expect(record(withPlayer(
      { ...drafted, round: ECONOMY.AUDIT_FIRST_ROUND }, 'P1', { heat: 12, dirtyCash: 900 },
    ))).toEqual(expect.arrayContaining(['audit-probability', 'launder-haircut-at-cap']))

    // A player with nothing earning charges no rent and runs no rent-driven venture.
    const landless: GameState = {
      ...drafted,
      round: 3,
      deeds: Object.fromEntries(
        Object.entries(drafted.deeds).map(([id, d]) => [id, { ...d, owner: null }]),
      ),
    }
    expect(record(landless)).toEqual(
      expect.arrayContaining(['no-earning-deeds', 'venture-loses-money']),
    )

    // A peer loan maturing next round, with interest the borrower cannot cover.
    const borrowed: GameState = {
      ...withPlayer(drafted, 'P1', { cleanCash: 1 }),
      loans: [{
        id: 'pl:test', lender: 'P2', borrower: 'P1', principal: 900, outstanding: 900,
        ratePerRound: 0.2, maturesAtRound: drafted.round + 1, collateral: [], status: 'active',
      }],
    }
    expect(record(borrowed)).toEqual(expect.arrayContaining([
      'peer-loan-maturing', 'peer-loan-interest-exceeds-cash',
    ]))

    // Contracts reaching their last round, and protection written against thin cash.
    const expiring: GameState = {
      ...withPlayer(drafted, 'P1', { cleanCash: 0 }),
      futures: [{
        id: 'rf:x', deed: biggest, holder: 'P1',
        startRound: drafted.round - 1, endRound: drafted.round,
      }],
      options: [{
        id: 'do:x', deed: biggest, writer: 'P2', holder: 'P1',
        premium: 10, strike: 120, expiry: drafted.round,
      }],
      swaps: [{
        id: 'cds:x', buyer: 'P2', seller: 'P1',
        reference: { kind: 'peer-loan', id: 'pl:none' },
        notional: 500, premiumPerRound: 20, status: 'active',
      }],
    }
    expect(record(expiring)).toEqual(expect.arrayContaining([
      'rent-future-expiring', 'deed-option-expiring', 'cds-premium-exceeds-cash',
    ]))

    const never = ALL_WARNING_IDS.filter((id) => !seen.has(id))
    expect(
      never,
      `these warnings can never render, which is the same defect as an uncalled function: ${never.join(', ')}`,
    ).toEqual([])
  })
})
