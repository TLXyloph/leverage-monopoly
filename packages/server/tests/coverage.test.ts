import { describe, expect, it } from 'vitest'
import { startHarness, type Harness } from './harness.js'
import { playRound, readSync, runDraft, SAFE_ROLLS } from './driver.js'
import { kitchenSink, toTheEnd } from './sweep.js'

/**
 * The event-union audit, in both directions.
 *
 * Six defects escaped twenty-one task-scoped engine reviews, every one with the same
 * shape: correct code, passing tests, nothing calling it. A diff-versus-brief review has
 * no reason to ask "does anything invoke this?", so the question is asked here instead,
 * of the running system: drive a game hard enough to reach every event the engine can
 * emit, and name the ones nothing reached.
 *
 * That is not a hypothetical: writing this file is what found `exhaustLiquidation`, the
 * seventh instance of the same defect, which left `CreditWrittenDown` — and the whole
 * distressed-debt path — unreachable in a real game.
 */

/**
 * Events no scripted game in this suite reaches, each with the reason. This list is the
 * point of the test: an entry here is a claim someone has to defend, whereas an event
 * quietly absent from a coverage number is a claim nobody ever makes.
 */
const DOCUMENTED_GAPS: Readonly<Record<string, string>> = {
  PoolInjectionReleased:
    'Emitted only when a card makes a pool holder inject cash (era-decks 6.5). Reaching it '
    + 'needs a specific card drawn by a specific player while holding a pool, which no '
    + 'deterministic script can arrange without hand-stacking the deck past the point of '
    + 'testing anything real.',
  EntitlementConsumed:
    'Requires drawing a card that grants an entitlement AND then spending it in the same '
    + 'era. The engine covers the pairing in card-wiring.test.ts against constructed '
    + 'states; a scripted game reaches the grant but not reliably the spend.',
}

function typesOf(log: { type: string }[]): Set<string> {
  return new Set(log.map((e) => e.type))
}

async function logOf(h: Harness): Promise<{ type: string }[]> {
  const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
  return (body as { events: { type: string }[] }).events
}

describe('event-union audit', () => {
  it('reaches every event the engine can emit, or names the ones it cannot', async () => {
    const sink = await startHarness({ unlockMode: 'all' })
    const ending = await startHarness({ unlockMode: 'all' })
    try {
      await kitchenSink(sink)
      await toTheEnd(ending)
      const reached = new Set([
        ...typesOf(await logOf(sink)),
        ...typesOf(await logOf(ending)),
      ])

      const missing = [...ALL_EVENT_TYPES].filter((type) => !reached.has(type))
      const undocumented = missing.filter((type) => DOCUMENTED_GAPS[type] === undefined)

      /**
       * Fails naming the thing, in the engine's own house style: a coverage number that
       * quietly slips is worse than no coverage, because the suite goes on claiming
       * ground it no longer holds.
       */
      expect(
        undocumented,
        `these events are unreachable from any command path and undocumented: ${undocumented.join(', ')}`,
      ).toEqual([])

      // And the reverse: nothing in the documented list has quietly become reachable,
      // which would mean the justification is now false.
      const staleExcuses = Object.keys(DOCUMENTED_GAPS).filter((type) => reached.has(type))
      expect(
        staleExcuses,
        `these are documented as unreachable but were reached: ${staleExcuses.join(', ')}`,
      ).toEqual([])
    } finally {
      await sink.close()
      await ending.close()
    }
  }, 300_000)

  it('persists and broadcasts every event a command produced — no silent desync', async () => {
    const h = await startHarness({ unlockMode: 'all' })
    try {
      await runDraft(h)
      await playRound(h, SAFE_ROLLS)
      await playRound(h, SAFE_ROLLS)

      /**
       * The reverse direction. An event appended but not broadcast desyncs a client
       * silently, so the log length the server reports, the log it stores, and the
       * length every client is told about must be the same number.
       */
      const stored = await logOf(h)
      const sync = await readSync(h)
      expect(sync.length).toBe(stored.length)

      const { body } = await h.get(`/api/game/${h.gameId}/history`, h.tokens.admin)
      const history = (body as { commands: { seq: number }[] }).commands
      expect(history.length).toBeGreaterThan(0)
      // Command boundaries are strictly increasing and inside the log.
      for (let i = 1; i < history.length; i += 1) {
        expect(history[i]?.seq).toBeGreaterThan(history[i - 1]?.seq ?? -1)
      }
      expect(history[history.length - 1]?.seq).toBeLessThan(stored.length)
    } finally {
      await h.close()
    }
  }, 120_000)
})

/** Mirrors the `GameEvent` union in `core/events.ts`, which has no runtime enumeration. */
const ALL_EVENT_TYPES: readonly string[] = [
  'GameCreated', 'PhaseAdvanced', 'RoundAdvanced', 'EraAdvanced', 'GameScored',
  'DraftSubmitted', 'DraftDeedAwarded', 'DraftRoundResolved',
  'DiceRolled', 'TokenMoved', 'SentToJail', 'JailExited',
  'RentCharged', 'RentRoutedToFuture', 'SalaryPaid', 'TaxPaid', 'CarryingCostCharged',
  'HouseBuilt', 'HouseSold', 'DeedMortgaged', 'DeedUnmortgaged', 'DeedTraded',
  'CreditDrawn', 'CreditRepaid', 'InterestAccrued', 'StimulusAdvanced',
  'ObligationCapitalised', 'MarginCallFlagged', 'MarginCallCured', 'DeedLiquidated',
  'DistressedDebtAccrued', 'DistressedDebtRepaid', 'CreditWrittenDown',
  'BuildingsStripped', 'EncumbranceExtinguished',
  'PeerLoanOriginated', 'PeerLoanInterestPaid', 'PeerLoanRepaid', 'PeerLoanDefaulted',
  'PeerLoanSold',
  'RentFutureOriginated', 'RentFutureSold', 'RentFutureMadeWhole', 'RentFutureExpired',
  'DeedOptionWritten', 'DeedOptionSold', 'DeedOptionExercised', 'DeedOptionExpired',
  'PoolCreated', 'TrancheSold', 'WaterfallPaid', 'PoolCollateralLiquidated',
  'PoolTerminated', 'PoolInjectionReleased',
  'SwapWritten', 'SwapPremiumPaid', 'SwapTriggered', 'SwapExpired',
  'VentureLaunched', 'VentureTicked', 'SpeakeasyPlayed', 'DirtyCashEarned', 'CashLaundered',
  'HeatChanged', 'AuditChecked', 'AuditResolved', 'BriberyUsed', 'InsiderTradingUsed',
  'DeckShuffled', 'CardDrawn', 'DeckReordered', 'EntitlementConsumed',
]
