import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ACTION_KINDS, arbDistressGameScript, arbGameScript } from './arbitraries.js'
import type { GameScript } from './arbitraries.js'
import { runScript, type ArmStats } from './driver.js'
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
 *
 * `fc.oneof`, not `arbGameScript` alone: half the census is the plain generator, half is
 * `arbDistressGameScript` (see arbitraries.ts), which splices a scripted margin-call ->
 * default -> forced-liquidation chain into an otherwise ordinary script. Without that
 * mix, `CreditWrittenDown` — and everything downstream of it, `DistressedDebtAccrued`
 * and `DistressedDebtRepaid` — is reachable only on the order of once per several
 * hundred runs (see the task report's before/after acceptance numbers), which is not a
 * floor this test can assert without being flaky.
 */
function arbCensusScript(rounds: number): fc.Arbitrary<GameScript> {
  return fc.oneof(
    { weight: 1, arbitrary: arbGameScript(rounds) },
    { weight: 1, arbitrary: arbDistressGameScript(rounds) },
  )
}

function sumArmStats(a: ArmStats, b: ArmStats): ArmStats {
  return Object.fromEntries(
    ACTION_KINDS.map((kind) => [kind, {
      accepted: a[kind].accepted + b[kind].accepted,
      attempts: a[kind].attempts + b[kind].attempts,
    }]),
  ) as ArmStats
}

function zeroArmStats(): ArmStats {
  return Object.fromEntries(ACTION_KINDS.map((kind) => [kind, { accepted: 0, attempts: 0 }])) as ArmStats
}

function census(
  runs: number, rounds: number,
): { seen: Set<EventType>; accepted: number; armStats: ArmStats } {
  const seen = new Set<EventType>()
  let accepted = 0
  let armStats = zeroArmStats()
  fc.assert(
    fc.property(arbCensusScript(rounds), (script) => {
      const trace = runScript(script)
      accepted += trace.accepted
      armStats = sumArmStats(armStats, trace.armStats)
      for (const e of trace.events) seen.add(e.type)
      return true
    }),
    { numRuns: runs, seed: 20260803 },
  )
  return { seen, accepted, armStats }
}

/**
 * Per-arm acceptance floor. `0.5%` is deliberately low — this is not a quality bar on
 * already-healthy arms, it is a tripwire for a VACUOUS one: the defect this whole test
 * was added to catch (`repay-distressed` at 0.0-0.1% acceptance, see the task report)
 * is one-plus orders of magnitude below this floor, so anything that regresses an arm
 * back to "effectively unreachable" fails here loudly, by name, instead of the rest of
 * the suite quietly proving properties against near-zero samples for it.
 *
 * Two arms get a lower, explicit override rather than the default: `create-pool` needs
 * three of three OTHER arms' outputs held simultaneously by one actor (a compound event,
 * see arbitraries.ts), and `sell-tranche` is strictly downstream of `create-pool` firing
 * at all — it can never clear a floor `create-pool` itself doesn't clear by a healthy
 * margin. Measured across two seeds: `create-pool` 0.75-1.54%, `sell-tranche`
 * 0.32-1.12%. `0.5%` would make `sell-tranche` flaky (it fell below on the second seed
 * with no code change at all); `0.1%` does not, while still sitting an order of
 * magnitude above what a genuinely dead arm reads as.
 */
const DEFAULT_ARM_FLOOR = 0.005
const ARM_FLOOR_OVERRIDE: Partial<Record<(typeof ACTION_KINDS)[number], number>> = {
  'create-pool': 0.003,
  'sell-tranche': 0.001,
}

describe('generator coverage', () => {
  const { seen, accepted, armStats } = census(400, 24)

  it('reports per-arm acceptance and fails on any arm below its floor', () => {
    const rows = ACTION_KINDS.map((kind) => {
      const { accepted: a, attempts } = armStats[kind]
      const rate = attempts === 0 ? 0 : a / attempts
      const floor = ARM_FLOOR_OVERRIDE[kind] ?? DEFAULT_ARM_FLOOR
      return { kind, accepted: a, attempts, rate, floor }
    })
    // eslint-disable-next-line no-console -- deliberate: this IS the per-arm report.
    console.log(
      '\ngenerator arm acceptance:\n'
      + rows
        .map(({ kind, accepted: a, attempts, rate }) =>
          `  ${kind.padEnd(20)} ${String(a).padStart(5)} / ${String(attempts).padStart(6)}`
          + `  (${(rate * 100).toFixed(2)}%)`)
        .join('\n'),
    )
    const starved = rows.filter((r) => r.rate < r.floor)
    expect(
      starved,
      'arm(s) below their acceptance floor: '
      + starved
        .map((r) => `${r.kind} (${r.accepted}/${r.attempts}, ${(r.rate * 100).toFixed(2)}% < ${(r.floor * 100).toFixed(2)}%)`)
        .join(', '),
    ).toEqual([])
  })

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

  it('reaches the whole distressed-debt chain, not just its trigger', () => {
    // `CreditWrittenDown` above only proves the TRIGGER (a portfolio-exhausting forced
    // liquidation) is reachable. `DistressedDebtAccrued` (Settlement step 8's compounding
    // interest on the resulting balance, spec 19.7) and `DistressedDebtRepaid` (the
    // `RepayDistressedDebt` decider actually being exercised, `credit/decide.ts`) are
    // both downstream of it and were, before `arbDistressGameScript`, unasserted here —
    // which is exactly how the fix-round review found `repay-distressed` firing at
    // 0.0-0.1% acceptance (see the task report) with nothing catching it.
    for (const type of ['DistressedDebtAccrued', 'DistressedDebtRepaid'] as const) {
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
