import fc from 'fast-check'

/**
 * Property runs are the slowest thing in the suite, so the budget is explicit rather
 * than per-file. CI (or any run with CI=true) raises it; a local run keeps it low enough
 * to stay fast without disarming anything — the per-file `numRuns` written into each
 * `fc.assert` call below still governs whenever it is more specific than this default.
 *
 * `verbose` prints the shrunken counterexample, and because the engine has no
 * Math.random and no Date, that counterexample is a complete reproduction: paste the
 * printed seed and path into `fc.assert`'s options and the same history replays exactly.
 */

/** Arbitrary but FIXED. Change it only deliberately, and expect new histories if you do. */
const DEFAULT_SEED = 1_337_042

/**
 * THE SEED IS PINNED AND LOGGED, and that is not a nicety.
 *
 * `conservation.test.ts` failed once in fifteen full-suite runs and could not be
 * reproduced in eight thousand targeted ones. The reason it could not be reproduced is
 * that nothing pinned a seed: fast-check defaulted to a time-derived one, so the failing
 * history existed for exactly as long as that process did, and the one piece of evidence
 * that would have identified the bug was discarded by the harness. A property suite
 * whose failures cannot be replayed is not a property suite, it is a flake detector.
 *
 * So: one fixed seed by default, meaning every developer and every CI run explores the
 * IDENTICAL histories, and a failure anyone sees is a failure everyone can reproduce.
 * Override with `FC_SEED=<integer>` to explore elsewhere — a nightly job that sweeps
 * random seeds is a good idea and this is the hook for it. Either way the seed in force
 * is printed once per run, before any test executes, so it is in the log of the run that
 * failed rather than lost with the process.
 */
const raw = process.env['FC_SEED']
const seed = raw === undefined ? DEFAULT_SEED : Number.parseInt(raw, 10)

if (!Number.isInteger(seed)) {
  throw new Error(`FC_SEED must be an integer; got ${String(raw)}`)
}

// eslint-disable-next-line no-console -- the entire point: the seed must reach the log.
console.log(`[fast-check] seed=${seed} (reproduce or explore with FC_SEED=<integer>)`)

fc.configureGlobal({
  seed,
  numRuns: process.env['CI'] === 'true' ? 500 : 100,
  verbose: 1,
  interruptAfterTimeLimit: 120_000,
  markInterruptAsFailure: false,
})
