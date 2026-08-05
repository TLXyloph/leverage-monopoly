#!/usr/bin/env node
/**
 * `npm run tables` — the tables on this machine.
 *
 * A finished 24-round game is 652 events and about 41 KB of JSON, so nothing here is
 * deleted on your behalf: a thousand games would fit in 40 MB and the log is the only
 * complete record of what happened. What this gives you instead is explicit control —
 * see them, save one out, load one back, throw the rest away.
 *
 * A saved file is just the event log. That is enough to reconstruct the game exactly,
 * because the engine generates no randomness: every die roll, shuffle order and audit
 * roll is IN the log rather than derived from a seed nobody kept.
 *
 * Usage:
 *   npm run tables                       list every table
 *   npm run tables -- --save <room|id>   write saves/<room>-r<round>.json
 *   npm run tables -- --load <file>      open a saved log as a new table
 *   npm run tables -- --delete <room|id> remove one table
 *   npm run tables -- --prune            remove every table except the current one
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store, generateGameId, generateRoomCode, mintGameTokens } from '../packages/server/dist/index.js'
import { replay } from '../packages/engine/dist/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIM = '[2m'
const BOLD = '[1m'
const GREEN = '[32m'
const RED = '[31m'
const OFF = '[0m'

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function currentGameId() {
  try {
    return JSON.parse(readFileSync(resolve(root, '.leverage-session.json'), 'utf8')).gameId
  } catch {
    return null
  }
}

const store = new Store(process.env.LEVERAGE_DB ?? resolve(root, 'leverage.db'))
const active = currentGameId()

/** Resolves a room code or a game id, case-insensitively, to the row it names. */
function find(reference) {
  const wanted = reference.toLowerCase()
  const match = store.listGames().find(
    (g) => g.id.toLowerCase() === wanted || g.roomCode.toLowerCase() === wanted,
  )
  if (match === undefined) {
    process.stderr.write(`No table called ${reference}. Run \`npm run tables\` to see them.\n`)
    process.exit(1)
  }
  return match
}

/** Where a game got to, read by replaying it — the only source of truth there is. */
function progress(gameId) {
  const events = store.readEvents(gameId)
  try {
    const state = replay(events)
    return { events: events.length, round: state.round, phase: state.phase, state }
  } catch {
    return { events: events.length, round: 0, phase: 'unreadable', state: null }
  }
}

function list() {
  const games = store.listGames()
  if (games.length === 0) {
    process.stdout.write(`${DIM}  No tables yet. \`npm run game\` opens one.${OFF}\n`)
    return
  }
  process.stdout.write(`\n  ${DIM}${'room'.padEnd(7)}${'id'.padEnd(11)}${'events'.padStart(7)}`
    + `${'round'.padStart(7)}  ${'phase'.padEnd(11)}opened${OFF}\n`)
  for (const game of games) {
    const { events, round, phase } = progress(game.id)
    const here = game.id === active ? `${GREEN} ← current${OFF}` : ''
    process.stdout.write(
      `  ${BOLD}${game.roomCode.padEnd(7)}${OFF}${DIM}${game.id.padEnd(11)}${OFF}`
      + `${String(events).padStart(7)}${String(round).padStart(7)}  ${phase.padEnd(11)}`
      + `${DIM}${game.createdAt.slice(0, 16).replace('T', ' ')}${OFF}${here}\n`,
    )
  }
  process.stdout.write(
    `\n${DIM}  --save <room> to write one out, --delete <room> to remove it,`
    + ` --prune to keep only the current.${OFF}\n\n`,
  )
}

function save(reference) {
  const game = find(reference)
  const { events, round } = progress(game.id)
  const directory = resolve(root, 'saves')
  mkdirSync(directory, { recursive: true })
  const file = resolve(directory, `${game.roomCode}-r${round}.json`)
  writeFileSync(file, `${JSON.stringify({
    roomCode: game.roomCode, label: game.label, createdAt: game.createdAt,
    round, events: store.readEvents(game.id),
  }, null, 2)}\n`)
  const size = (JSON.stringify(store.readEvents(game.id)).length / 1024).toFixed(0)
  process.stdout.write(`  Saved ${BOLD}${game.roomCode}${OFF} at round ${round} `
    + `${DIM}(${events} events, ${size}KB)${OFF}\n  ${file}\n`)
}

function load(file) {
  const saved = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'))
  if (!Array.isArray(saved.events) || saved.events.length === 0) {
    process.stderr.write('That file holds no event log.\n')
    process.exit(1)
  }
  /**
   * A fresh identity, not the original one. The saved game may still be in the database,
   * and two rows with one id would make "which game is this?" unanswerable. The LOG is
   * what carries the game; the id is just a handle.
   */
  const id = generateGameId()
  const roomCode = generateRoomCode()
  store.createGame({ id, roomCode, createdAt: new Date().toISOString(), label: saved.label ?? 'LEVERAGE' })
  store.appendEvents(id, 0, saved.events)
  const { round, phase } = progress(id)

  const tokens = mintGameTokens(store.secret(), id)
  process.stdout.write(`  Loaded as room ${BOLD}${roomCode}${OFF}, round ${round}, ${phase}.\n`)
  process.stdout.write(`${DIM}  Start the server, then open:${OFF}\n`)
  process.stdout.write(`    facilitator  /admin?token=${tokens.admin}\n`)
  for (const [player, token] of Object.entries(tokens.players)) {
    process.stdout.write(`    ${player}           /p/${token}\n`)
  }
  process.stdout.write(
    `\n${DIM}  These links are for the loaded table. \`npm run game\` still resumes whichever`
    + ` table it opened last — delete .leverage-session.json to hand over.${OFF}\n`,
  )
}

/** Refuses the running game unless forced: the server caches it in memory and would
 * keep writing events for a row that no longer exists. */
function guardActive(game) {
  if (game.id !== active || process.argv.includes('--force')) return
  process.stderr.write(
    `${RED}${game.roomCode} is the table \`npm run game\` is serving.${OFF}\n`
    + '  Stop the server first, or pass --force if you are sure.\n',
  )
  process.exit(1)
}

function remove(reference) {
  const game = find(reference)
  guardActive(game)
  const { events } = progress(game.id)
  store.deleteGame(game.id)
  process.stdout.write(`  Deleted ${BOLD}${game.roomCode}${OFF} ${DIM}(${events} events)${OFF}\n`)
}

function prune() {
  const doomed = store.listGames().filter((g) => g.id !== active)
  if (doomed.length === 0) {
    process.stdout.write(`${DIM}  Nothing to prune.${OFF}\n`)
    return
  }
  for (const game of doomed) store.deleteGame(game.id)
  process.stdout.write(
    `  Deleted ${BOLD}${doomed.length}${OFF} table${doomed.length === 1 ? '' : 's'}`
    + `${active === null ? '' : `, kept the current one`}.\n`,
  )
}

const saveRef = arg('save')
const loadRef = arg('load')
const deleteRef = arg('delete')

if (saveRef !== undefined) save(saveRef)
else if (loadRef !== undefined) load(loadRef)
else if (deleteRef !== undefined) remove(deleteRef)
else if (process.argv.includes('--prune')) prune()
else list()

store.close()
