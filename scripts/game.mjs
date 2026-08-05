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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

const sessionFile = resolve(root, '.leverage-session.json')

/**
 * Resume the table this machine last opened, rather than starting a fresh one.
 *
 * Restarting is not an unusual event — you move to the host's Wi-Fi, the laptop sleeps,
 * a tunnel drops — and the printed URLs embed whatever IP the machine had at the time,
 * so a restart is exactly when you need them reprinted. Creating a new game every launch
 * meant a mid-game restart handed the table four QR codes for an empty board while the
 * real game sat in the database, reachable only by whoever still had the old links open.
 *
 * The tokens come from the session file because the server never stores them; they are
 * HMAC'd from a secret it persists, so the ones written last time remain valid for as
 * long as the game exists. `--new` forces a fresh table.
 */
async function resumable() {
  if (process.argv.includes('--new')) return null
  let saved
  try {
    saved = JSON.parse(readFileSync(sessionFile, 'utf8'))
  } catch {
    return null
  }
  const known = await fetch(`http://127.0.0.1:${port}/api/games`).then((r) => r.json())
  const match = known.games?.find((g) => g.id === saved.gameId)
  if (match === undefined) return null
  return {
    gameId: saved.gameId,
    roomCode: match.roomCode,
    tokens: saved.tokens,
    urls: {
      admin: `/admin?token=${saved.tokens.admin}`,
      table: `/table?token=${saved.tokens.table}`,
      players: Object.fromEntries(
        Object.entries(saved.tokens.players).map(([p, t]) => [p, `/p/${t}`]),
      ),
    },
    resumed: true,
  }
}

const existing = await resumable()
const game = existing ?? await fetch(`http://127.0.0.1:${port}/api/games`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ label: 'LEVERAGE', unlockMode: 'progressive' }),
}).then((r) => r.json())

const base = wantsTunnel ? (await openTunnel()) ?? `http://${lanAddress()}:${port}` : `http://${lanAddress()}:${port}`

/**
 * Recorded so `npm run facilitate` can attach without anyone copying a token by hand.
 * Gitignored: it holds the bearer tokens for every seat at the table.
 */
writeFileSync(
  sessionFile,
  `${JSON.stringify({
    gameId: game.gameId, roomCode: game.roomCode, tokens: game.tokens,
    api: `http://127.0.0.1:${port}`, base,
  }, null, 2)}\n`,
)

const rule = '─'.repeat(64)
process.stdout.write(`\n${GREEN}${rule}${OFF}\n`)
process.stdout.write(
  `${BOLD}  LEVERAGE${OFF}   room ${BOLD}${game.roomCode}${OFF}`
  + `${game.resumed === true ? `   ${DIM}resumed — same table, same links${OFF}` : ''}\n`,
)
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
process.stdout.write(`${DIM}  Database: ${resolve(root, 'leverage.db')} — ctrl-c to stop.${OFF}\n`)
process.stdout.write(`${DIM}  Restarting resumes this table. \`npm run game -- --new\` starts a fresh one.${OFF}\n\n`)
