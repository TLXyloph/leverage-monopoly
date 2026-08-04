import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import type { EventType } from '../../src/core/events.js'

/**
 * The generator produces scripted COMMANDS, not events, and keeps only what the real
 * deciders accept. That is a deliberate sampling-bias tradeoff (see arbitraries.ts and
 * the task report): the sampled distribution is the distribution of LEGAL histories,
 * which under-samples anything reachable only through a narrow window. This test is the
 * mitigation. Every property elsewhere in this suite is a lower bound on
 * interestingness: if a refactor starts rejecting every swap, or every liquidation lot,
 * these floors fail loudly instead of the other six files passing vacuously against
 * near-empty histories.
 */
function census(runs: number, rounds: number): { seen: Set<EventType>; accepted: number } {
  const seen = new Set<EventType>()
  let accepted = 0
  fc.assert(
    fc.property(arbGameScript(rounds), (script) => {
      const trace = runScript(script)
      accepted += trace.accepted
      for (const e of trace.events) seen.add(e.type)
      return true
    }),
    { numRuns: runs, seed: 20260803 },
  )
  return { seen, accepted }
}

describe('generator coverage', () => {
  const { seen, accepted } = census(400, 24)

  it('accepts a substantial majority of what it generates', () => {
    expect(accepted).toBeGreaterThan(2_000)
  })

  it('reaches every core money event', () => {
    for (const type of [
      'DraftDeedAwarded', 'DiceRolled', 'TokenMoved', 'SalaryPaid', 'RentCharged',
      'CarryingCostCharged', 'InterestAccrued', 'CreditDrawn', 'ObligationCapitalised',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the credit crisis path', () => {
    // `CreditWrittenDown`, not `DistressedDebtIncurred`: this codebase's real terminal
    // event for an uncured margin call whose forced liquidation exhausts the portfolio
    // (spec 19.8) is `CreditWrittenDown` (see `exhaustLiquidation`,
    // contexts/credit/settlement.ts). `DistressedDebtIncurred` is declared in the event
    // union but — after Task 20's fixes — has no legitimate emitter anywhere in the
    // engine; asserting coverage of it would assert coverage of dead code.
    for (const type of ['MarginCallFlagged', 'DeedLiquidated', 'CreditWrittenDown'] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the underworld', () => {
    for (const type of [
      'VentureLaunched', 'DirtyCashEarned', 'CashLaundered', 'HeatChanged', 'AuditChecked',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches the instruments', () => {
    for (const type of [
      'RentFutureOriginated', 'DeedOptionWritten', 'PeerLoanOriginated',
      'PoolCreated', 'WaterfallPaid', 'SwapWritten',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches development: building, mortgaging and trading', () => {
    // Task 21 gave `board` deciders and reducers for these five event types; without
    // this generator arm set (`build-house`, `sell-house`, `mortgage-deed`,
    // `unmortgage-deed`, `trade-deeds`) no property in this suite would constrain the
    // even-build rule, the 32-house/12-hotel supply, or mortgage economics.
    for (const type of [
      'HouseBuilt', 'HouseSold', 'DeedMortgaged', 'DeedUnmortgaged', 'DeedTraded',
    ] as const) {
      expect(seen.has(type), `never generated ${type}`).toBe(true)
    }
  })

  it('reaches a card draw', () => {
    expect(seen.has('CardDrawn')).toBe(true)
  })
})
