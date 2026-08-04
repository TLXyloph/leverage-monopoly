import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reduce } from '../../src/core/reduce.js'
import { arbDistressGameScript, arbGameScript } from './arbitraries.js'
import type { GameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import { conservedTotal, expectedDelta } from './ledger.js'

/**
 * Mixed with `arbDistressGameScript`, not `arbGameScript` alone: this property is the
 * one that has to catch a reducer regression in `DistressedDebtRepaid` (see the break/
 * revert counterexample in the task report), and that event fires on the order of once
 * per several hundred runs under the plain generator — not a reliable trigger for a bug
 * that only manifests on that one event type. See `coverage.test.ts` for the same mix
 * and a longer explanation.
 */
function arbConservationScript(rounds: number): fc.Arbitrary<GameScript> {
  return fc.oneof(
    { weight: 1, arbitrary: arbGameScript(rounds) },
    { weight: 1, arbitrary: arbDistressGameScript(rounds) },
  )
}

describe('money is conserved', () => {
  it('holds across every generated history, end to end', () => {
    fc.assert(
      fc.property(arbConservationScript(14), (script) => {
        const trace = runScript(script)
        const opening = conservedTotal(trace.before[0] ?? trace.final)
        expect(conservedTotal(trace.final)).toBe(opening + expectedDelta(trace.events))
      }),
      // 400, not 200. The generator became `fc.oneof(general, distress)` without the
      // budget moving, which halved the pure-general sample this property had been
      // sized against — and this is the property that failed once and could not be
      // reproduced. Doubling restores the original general-history coverage while
      // keeping the distress mix that `DistressedDebtRepaid` needs.
      { numRuns: 400 },
    )
  })

  it('holds batch by batch, so a failure names the decider that broke it', () => {
    fc.assert(
      fc.property(arbConservationScript(14), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          const after = batch.events.reduce(reduce, before)
          expect(
            conservedTotal(after),
            `batch "${batch.label}" moved the pool: ${batch.events.map((e) => e.type).join(', ')}`,
          ).toBe(conservedTotal(before) + expectedDelta(batch.events))
        })
      }),
      // 400, not 200. The generator became `fc.oneof(general, distress)` without the
      // budget moving, which halved the pure-general sample this property had been
      // sized against — and this is the property that failed once and could not be
      // reproduced. Doubling restores the original general-history coverage while
      // keeping the distress mix that `DistressedDebtRepaid` needs.
      { numRuns: 400 },
    )
  })

  it('never counts dirty cash as money', () => {
    // Ventures mint dirty cash from nothing. If it were in the pool, the total minted
    // this history would show up as a matching rise in the conserved total — so this
    // asserts the omission is load bearing rather than an oversight.
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const minted = trace.events
          .filter((e) => e.type === 'DirtyCashEarned')
          .reduce((t, e) => t + (e.type === 'DirtyCashEarned' ? e.amount : 0), 0)
        const opening = conservedTotal(trace.before[0] ?? trace.final)
        if (minted > 0) expect(conservedTotal(trace.final)).not.toBe(opening + minted)
      }),
      { numRuns: 100 },
    )
  })
})
