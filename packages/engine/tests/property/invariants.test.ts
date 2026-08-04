import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { PLAYER_IDS } from '../../src/core/types.js'
import { borrowingBase, creditHeadroom } from '../../src/contexts/credit/index.js'
import { reduce } from '../../src/core/reduce.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import type { GameState } from '../../src/core/state.js'

/** Every state the run passed through, including the final one. */
function statesOf(script: Parameters<typeof runScript>[0]): readonly GameState[] {
  const trace = runScript(script)
  return [...trace.before, trace.final]
}

describe('clean cash never goes negative', () => {
  it('holds at every state in every generated history', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            expect(state.players[id].cleanCash,
              `${id} went negative in round ${state.round}`).toBeGreaterThanOrEqual(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('turns every shortfall into drawn credit, never into a negative balance', () => {
    // The paired-event claim, checked at the moment it is made rather than across the
    // WHOLE batch: every `ObligationCapitalised` is immediately preceded, in the same
    // events array, by the charge that produced it (`CarryingCostCharged`, `TaxPaid`,
    // `RentCharged`, `InterestAccrued`, ...), and every one of those charging call
    // sites pays exactly `min(cash, amount)` before the shortfall is computed — so the
    // player's clean cash is exactly 0 in the state immediately BEFORE the
    // ObligationCapitalised event is applied.
    //
    // This folds `batch.events` one at a time rather than comparing the batch's start
    // and end states, because a Settlement batch bundles many players' many
    // obligations into one array (spec 19.1's eleven steps all land in a single
    // `settle` batch): a later, unrelated step crediting the SAME player elsewhere in
    // the same batch (say, peer-loan interest received as a lender) can leave the
    // batch's NET cash change nonzero even though the shortfall, at the instant it
    // occurred, was genuine.
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          let state = before
          for (const event of batch.events) {
            if (event.type === 'ObligationCapitalised' && event.amount > 0) {
              expect(state.players[event.player].cleanCash,
                `${event.player}'s cash was not fully drained before capitalising `
                + `$${event.amount} in batch "${batch.label}"`).toBe(0)
            }
            state = reduce(state, event)
          }
        })
      }),
      { numRuns: 150 },
    )
  })
})

describe('the capped / uncapped asymmetry', () => {
  it('never lets a VOLUNTARY draw exceed the borrowing base', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          for (const event of batch.events) {
            if (event.type !== 'CreditDrawn') continue
            expect(event.amount,
              `voluntary draw of ${event.amount} exceeded headroom`)
              .toBeLessThanOrEqual(creditHeadroom(before, event.player))
          }
        })
      }),
      { numRuns: 200 },
    )
  })

  it('lets an AUTOMATIC obligation exceed it, and that is the only way it happens', () => {
    // Spec 19.8: the obligation waterfall's capitalisation step is deliberately
    // uncapped, and it is the sole mechanism by which a drawn balance comes to exceed
    // a borrowing base — UNLESS the base itself fell (a deed traded away, a peer-loan
    // default halving the base, an encumbrance extinguished), an uncapped COMPULSORY
    // advance landed (the Era II stimulus: spec section 4 calls it "an interest-bearing
    // loan, not a grant," raising `drawnCredit` exactly like `ObligationCapitalised`
    // does, through its own event because it is scheduled rather than owed), or an
    // audit fine's shortfall capitalised (`AuditResolved.capitalised`, spec 19.1's own
    // note that this is "what lets this fine trigger a margin call at Settlement step
    // 10 of the SAME round" — the audit context bundles seize-fine-capitalise-decay
    // into one atomic event for the same reason a card bundles its whole effect into
    // `CardDrawn`, rather than emitting a separate paired `ObligationCapitalised`). So
    // every breach must be attributable to a batch containing ObligationCapitalised /
    // EncumbranceExtinguished / CreditWrittenDown / StimulusAdvanced / a positive
    // AuditResolved.capitalised, OR to a base that fell.
    //
    // `draw-card` batches are exempt entirely, for a reason distinct from all of the
    // above: Task 18's card interpreter computes a card's ENTIRE effect — including
    // patterns that raise `drawnCredit` exactly like the obligation waterfall's
    // capitalisation step (see `contexts/decks/interpret.ts`'s `shortfall`-into-
    // `drawnCredit` sites) — as one deterministic reduction of the single `CardDrawn`
    // event. That is a considered architectural choice (every other card effect is a
    // pure function of (card, state-at-draw) and needs no event of its own), not a gap,
    // but it means a card's fiscal consequences are invisible to an event-type scan:
    // there is no separate `ObligationCapitalised` to find, and the affected player
    // need not even be the drawer named on `CardDrawn` (a card can target any player
    // the deck's dynamic-target rules select). Task 18's own suite tests every card's
    // effect directly; this property does not re-litigate that here.
    fc.assert(
      fc.property(arbGameScript(20), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          if (batch.label === 'draw-card') return
          const before = trace.before[i]
          const after = trace.before[i + 1] ?? trace.final
          if (before === undefined) return
          for (const id of PLAYER_IDS) {
            const wasClear = before.players[id].drawnCredit <= borrowingBase(before, id)
            const nowOver = after.players[id].drawnCredit > borrowingBase(after, id)
            if (wasClear && nowOver) {
              const uncapped = batch.events.some((e) =>
                (e.type === 'ObligationCapitalised' || e.type === 'EncumbranceExtinguished'
                  || e.type === 'CreditWrittenDown' || e.type === 'StimulusAdvanced'
                  || (e.type === 'AuditResolved' && e.capitalised > 0))
                && 'player' in e && e.player === id)
              const baseFell = borrowingBase(after, id) < borrowingBase(before, id)
              expect(uncapped || baseFell,
                `${id} breached in batch "${batch.label}" with no capitalisation and no base fall`)
                .toBe(true)
            }
          }
        })
      }),
      { numRuns: 200 },
    )
  })
})

describe('borrowing base and margin calls', () => {
  it('never computes a negative borrowing base', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            expect(borrowingBase(state, id)).toBeGreaterThanOrEqual(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('never leaves a drawn balance above the base right after Settlement flags it, unflagged', () => {
    // Settlement step 10 flags every breach. The checkpoint is the state immediately
    // after the round's OWN `settle` batch — the instant that round's flagging has run
    // and before ANYTHING else (including the next round's own automatic events) has a
    // chance to move a balance again — which is the honest form of spec section 15's
    // "drawn balance never exceeds base outside a flagged margin call".
    //
    // It is deliberately NOT checked at every `market`/`open` state, and deliberately
    // NOT anchored to `market->open` either (an earlier version of this property tried
    // both and both shrunk to real counterexamples that were not bugs):
    //
    // - Every `market`/`open` state: Task 21 gave `board` voluntary actions this
    //   codebase's earlier tasks did not have. `TradeAssets`, `MortgageDeed` and
    //   `HouseSold` all shrink the ACTOR's own borrowing base immediately, and can
    //   legitimately open a fresh, correctly-unflagged breach mid-Open-phase —
    //   flagging only runs once per round, at the NEXT Settlement.
    // - Right after `market->open`: Task 20 also wired up the Era II stimulus (see
    //   `contexts/session/decide.ts`), which lands at the PRIOR `settlement->next`
    //   transition — i.e. BEFORE `market->open` — so by round 7 a player with little
    //   or no borrowing base can already be breached at that checkpoint, and round 7's
    //   own Settlement (which would flag it) has not run yet.
    //
    // Anchoring to the round's own `settle` batch sidesteps both: it is strictly after
    // that round's flagging step and strictly before the next round's stimulus, trade,
    // mortgage or any other event that could open a fresh breach.
    fc.assert(
      fc.property(arbGameScript(20), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          if (batch.label !== 'settle') return
          const state = trace.before[i + 1] ?? trace.final
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            if (p.drawnCredit > borrowingBase(state, id)) {
              expect(p.marginCallFlaggedAt,
                `${id} is over base right after Settlement in round ${state.round} `
                + 'without a flag').not.toBeNull()
            }
          }
        })
      }),
      { numRuns: 200 },
    )
  })
})

describe('heat and dirty cash', () => {
  it('never goes negative, and heat stays a whole number', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            expect(p.dirtyCash).toBeGreaterThanOrEqual(0)
            expect(p.heat).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(p.heat)).toBe(true)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every money field an integer number of dollars', () => {
    fc.assert(
      fc.property(arbGameScript(12), (script) => {
        for (const state of statesOf(script)) {
          for (const id of PLAYER_IDS) {
            const p = state.players[id]
            for (const v of [p.cleanCash, p.dirtyCash, p.drawnCredit, p.distressedDebt]) {
              expect(Number.isInteger(v)).toBe(true)
            }
          }
          expect(Number.isInteger(state.treasury)).toBe(true)
        }
      }),
      { numRuns: 150 },
    )
  })
})
