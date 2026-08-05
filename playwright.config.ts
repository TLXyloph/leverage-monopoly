import { rmSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/** A run starts from an empty database, so yesterday's games cannot colour today's. */
rmSync(`${process.cwd()}/.e2e`, { recursive: true, force: true })

/**
 * Five concurrent browser contexts — one facilitator and four players — against a real
 * server with a real SQLite file. Not mocks.
 *
 * The suite runs `fullyParallel: false` at the file level on purpose: each spec drives a
 * whole game through a shared server, and two specs racing the same round clock would
 * make the failures meaningless. Concurrency is exercised WITHIN a spec, where four
 * players act simultaneously and the assertions are about not losing or reordering their
 * commands.
 *
 * `PLAYWRIGHT_CHANNEL=chrome` drives the Google Chrome already installed on the machine
 * instead of downloading Playwright's own build — useful on a laptop that has no room
 * for another 180 MB of browser. CI leaves it unset and uses the bundled Chromium.
 */
const port = Number(process.env['E2E_PORT'] ?? 5199)
const channel = process.env['PLAYWRIGHT_CHANNEL']

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] !== undefined ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    /**
     * Traces are opt-in (`PLAYWRIGHT_TRACE=1`), not retained by default. A five-context
     * suite writes hundreds of megabytes of trace per failing run, which is a real cost
     * on a working laptop and buys nothing on a run that passes.
     */
    ...(process.env['PLAYWRIGHT_TRACE'] === '1' ? { trace: 'retain-on-failure' as const } : {}),
    ...(channel === undefined || channel === '' ? {} : { channel }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /**
     * The built bundle, served by Fastify — the same path a game night takes. Testing
     * against Vite's dev server would prove the source compiles, not that the thing the
     * table actually loads works.
     */
    command: 'node packages/server/dist/main.js',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      LEVERAGE_QUIET: '1',
      LEVERAGE_DB: `${process.cwd()}/.e2e/leverage-e2e.db`,
    },
  },
})
