import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

describe('the waterfall never overpays', () => {
  it('distributes at most what the pool collected, in every generated history', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        for (const event of runScript(script).events) {
          if (event.type !== 'WaterfallPaid') continue
          const paid = event.distributions.reduce((t, d) => t + d.amount, 0)
          expect(paid, `pool ${event.poolId} paid ${paid} of ${event.collected}`)
            .toBeLessThanOrEqual(event.collected)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('respects strict priority: mezzanine is paid only once senior is whole', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          for (const event of batch.events) {
            if (event.type !== 'WaterfallPaid') continue
            const pool = before.pools.find((p) => p.id === event.poolId)
            const senior = pool?.tranches.find((t) => t.kind === 'senior')
            const mezz = event.distributions.find((d) => d.tranche === 'mezzanine')
            if (pool === undefined || senior === undefined || mezz === undefined) continue
            const seniorPaid = event.distributions.find((d) => d.tranche === 'senior')?.amount ?? 0
            expect(senior.paid + seniorPaid).toBe(senior.face)
          }
        })
      }),
      { numRuns: 200 },
    )
  })

  it('never pays a tranche beyond its face', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const state = runScript(script).final
        for (const pool of state.pools) {
          for (const tranche of pool.tranches) {
            // Equity is exempt: spec 19.3 gives it a residual CLAIM, not a face, and
            // `distribute` pays it whatever is left. Asserting `paid <= face` on equity
            // would fail on exactly the histories where the pool performed well.
            if (tranche.kind === 'equity') continue
            expect(tranche.paid).toBeLessThanOrEqual(tranche.face)
          }
        }
      }),
      { numRuns: 150 },
    )
  })
})
