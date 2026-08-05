import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.js'

/**
 * The game-night entry point. `npm run game` (scripts/game.mjs) starts this, opens an
 * ngrok tunnel and prints the four player URLs plus a QR code for the table.
 *
 * SQLite lives on the operator's machine, so a tunnel restart and a page reload are both
 * non-events: the log is the database, and every client rebuilds from it on reconnect.
 */

const here = dirname(fileURLToPath(import.meta.url))

const port = Number(process.env['PORT'] ?? 5177)
const host = process.env['HOST'] ?? '0.0.0.0'
const databaseFile = process.env['LEVERAGE_DB'] ?? resolve(process.cwd(), 'leverage.db')
const webRoot = process.env['LEVERAGE_WEB'] ?? resolve(here, '../../web/dist')

const app = createApp({ databaseFile, webRoot, logger: process.env['LEVERAGE_QUIET'] !== '1' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void app.close().then(() => process.exit(0)) })
}

app.listen({ port, host })
  .then(() => {
    process.stdout.write(`LEVERAGE server listening on http://localhost:${port}\n`)
    process.stdout.write(`  database ${databaseFile}\n`)
  })
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exit(1)
  })
