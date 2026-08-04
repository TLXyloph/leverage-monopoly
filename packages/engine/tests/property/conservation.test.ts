import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reduce } from '../../src/core/reduce.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'
import { conservedTotal, expectedDelta } from './ledger.js'

describe('money is conserved', () => {
  it('holds across every generated history, end to end', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const opening = conservedTotal(trace.before[0] ?? trace.final)
        expect(conservedTotal(trace.final)).toBe(opening + expectedDelta(trace.events))
      }),
      { numRuns: 200 },
    )
  })

  it('holds batch by batch, so a failure names the decider that broke it', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
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
      { numRuns: 200 },
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
