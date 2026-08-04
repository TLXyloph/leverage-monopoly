import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reduce, replay } from '../../src/core/reduce.js'
import { createGame } from '../../src/contexts/session/index.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

describe('replay identity', () => {
  it('deep-equals the incrementally accumulated state', () => {
    fc.assert(
      fc.property(arbGameScript(14), (script) => {
        const trace = runScript(script)
        const log = [...createGame(script.config), ...trace.events]
        expect(replay(log)).toEqual(trace.final)
      }),
      { numRuns: 200 },
    )
  })

  it('is prefix-stable: replaying any prefix equals independently folding that prefix', () => {
    // `cutLen` is always >= 1 so `cut[0]` is always GameCreated (log[0] always is), which
    // matters here: `reduce`'s GameCreated case (`reduceSession`) ignores whatever state
    // it is handed and returns `initialState(event.config)` outright, and no other
    // sub-reducer reads state on a GameCreated event either — so seeding the manual fold
    // with an unrelated, already-fully-played `trace.final` is safe (it is discarded by
    // the first event) while keeping the two computations independent: `replay` builds
    // its own seed via `initialState`, the manual fold below never calls `replay` at all.
    // A reducer that behaved differently on a fresh fold than on a resumed one — reading
    // `state.round` where it should read the event's own field, say — would diverge here
    // even though a whole-log comparison (the test above) could not catch it, since a
    // whole-log run only ever exercises the "resumed" path once, in one direction.
    fc.assert(
      fc.property(arbGameScript(8), fc.nat(), (script, k) => {
        const trace = runScript(script)
        const log = [...createGame(script.config), ...trace.events]
        const cutLen = (k % log.length) + 1
        const cut = log.slice(0, cutLen)
        const manual = cut.reduce(reduce, trace.final)
        expect(replay(cut)).toEqual(manual)
      }),
      { numRuns: 300 },
    )
  })

  it('is idempotent under re-replay of its own log', () => {
    fc.assert(
      fc.property(arbGameScript(8), (script) => {
        const log = [...createGame(script.config), ...runScript(script).events]
        expect(replay(log)).toEqual(replay([...log]))
      }),
      { numRuns: 100 },
    )
  })

  it('never mutates a state it was given', () => {
    fc.assert(
      fc.property(arbGameScript(8), (script) => {
        const trace = runScript(script)
        trace.batches.forEach((batch, i) => {
          const before = trace.before[i]
          if (before === undefined) return
          const snapshot = structuredClone(before)
          batch.events.reduce(reduce, before)
          expect(before).toEqual(snapshot)
        })
      }),
      { numRuns: 60 },
    )
  })
})
