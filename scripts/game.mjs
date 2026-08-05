#!/usr/bin/env node
/**
 * `npm run game` — game night.
 *
 * Starts the server, opens a table, and prints the four player URLs with a QR code each,
 * plus the facilitator and television links.
 *
 * The default reach is the LOCAL NETWORK, not a tunnel. Four people at one physical
 * Monopoly board are on the same Wi-Fi by definition, and a LAN address needs no account,
 * no token and no third party between the table and its own money. The spec named ngrok
 * on the understanding that it needed no account; that has not been true since 2023, so
 * a tunnel is opt-in here (`--tunnel`, with `NGROK_AUTHTOKEN` set) rather than the
 * default path.
 *
 * SQLite lives on this machine, so a reload, a reconnect and a restart are all
 * non-events: the log is the database.
 */
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import qrcode from 'qrcode-terminal'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT ?? 5177)
const wantsTunnel = process.argv.includes('--tunnel')

const GREEN = '[32m'
const DIM = '[2m'
const BOLD = '[1m'
const OFF = '[0m'

function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return '127.0.0.1'
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const serverEntry = resolve(root, 'packages/server/dist/main.js')
if (!existsSync(serverEntry)) fail('Run `npm run build` first — the server is not compiled.')
if (!existsSync(resolve(root, 'packages/web/dist/index.html'))) {
  fail('Run `npm run build` first — the web bundle is not built.')
}

const server = spawn(process.execPath, [serverEntry], {
  cwd: root,
  env: { ...process.env, PORT: String(port), LEVERAGE_QUIET: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
})

const stop = () => {
  server.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  fail('The server did not come up.')
}

async function openTunnel() {
  if (process.env.NGROK_AUTHTOKEN === undefined) {
    process.stderr.write(
      'A tunnel needs NGROK_AUTHTOKEN in the environment. Falling back to the local network.\n',
    )
    return null
  }
  const tunnel = spawn('ngrok', ['http', String(port), '--log', 'stdout', '--log-format', 'json'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  process.on('exit', () => { tunnel.kill('SIGTERM') })
  return new Promise((done) => {
    const timer = setTimeout(() => { done(null) }, 15_000)
    tunnel.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) {
        const match = /"url":"(https:\/\/[^"]+)"/.exec(line)
        if (match !== null) {
          clearTimeout(timer)
          done(match[1])
        }
      }
    })
  })
}

await waitForServer()

const response = await fetch(`http://127.0.0.1:${port}/api/games`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ label: 'LEVERAGE', unlockMode: 'progressive' }),
})
const game = await response.json()

const base = wantsTunnel ? (await openTunnel()) ?? `http://${lanAddress()}:${port}` : `http://${lanAddress()}:${port}`

const rule = '─'.repeat(64)
process.stdout.write(`\n${GREEN}${rule}${OFF}\n`)
process.stdout.write(`${BOLD}  LEVERAGE${OFF}   room ${BOLD}${game.roomCode}${OFF}\n`)
process.stdout.write(`${GREEN}${rule}${OFF}\n\n`)
process.stdout.write(`  ${BOLD}Facilitator${OFF}  ${base}${game.urls.admin}\n`)
process.stdout.write(`  ${BOLD}Television${OFF}   ${base}${game.urls.table}\n\n`)
process.stdout.write(`${DIM}  Scan one code per player. Every link survives a reload and a restart.${OFF}\n\n`)

for (const [player, path] of Object.entries(game.urls.players)) {
  const url = `${base}${path}`
  process.stdout.write(`  ${BOLD}${player}${OFF}  ${DIM}${url}${OFF}\n`)
  await new Promise((done) => {
    qrcode.generate(url, { small: true }, (art) => {
      process.stdout.write(`${art.split('\n').map((line) => `    ${line}`).join('\n')}\n`)
      done()
    })
  })
}

process.stdout.write(`${GREEN}${rule}${OFF}\n`)
process.stdout.write(`${DIM}  Database: ${resolve(root, 'leverage.db')} — ctrl-c to stop.${OFF}\n\n`)
