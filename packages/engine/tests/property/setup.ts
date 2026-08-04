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
fc.configureGlobal({
  numRuns: process.env['CI'] === 'true' ? 500 : 100,
  verbose: 1,
  interruptAfterTimeLimit: 120_000,
  markInterruptAsFailure: false,
})
