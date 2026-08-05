#!/usr/bin/env node
/**
 * `npm run facilitate` — the facilitator's terminal companion.
 *
 * Answers one question, continuously: **what needs doing right now?**
 *
 * The `/admin` console is where you ACT. This is where you look when you have lost the
 * thread — it names the blocker holding up the round, the players who need a physical
 * die roll before Settlement will run, and anyone about to be liquidated. All of it is
 * read straight from the server, which is the only thing in the building that knows.
 *
 * Read-only by construction: it holds an admin token but issues nothing but GETs.
 *
 * Usage:
 *   npm run facilitate                 attach to the game `npm run game` opened
 *   npm run facilitate -- --once       print one snapshot and exit
 *   npm run facilitate -- --game <id> --token <admin token> [--api http://host:port]
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DIM = '[2m'
const BOLD = '[1m'
const GREEN = '[32m'
const RED = '[31m'
const YELLOW = '[33m'
const OFF = '[0m'

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function session() {
  const gameId = arg('game')
  const token = arg('token')
  if (gameId !== undefined && token !== undefined) {
    return { gameId, token, api: arg('api') ?? 'http://127.0.0.1:5177', roomCode: '' }
  }
  try {
    const saved = JSON.parse(readFileSync(resolve(root, '.leverage-session.json'), 'utf8'))
    return { gameId: saved.gameId, token: saved.tokens.admin, api: saved.api, roomCode: saved.roomCode }
  } catch {
    process.stderr.write(
      'No game to attach to. Start one with `npm run game`, or pass --game and --token.\n',
    )
    process.exit(1)
  }
}

const { gameId, token, api, roomCode } = session()

async function readSync() {
  const response = await fetch(`${api}/api/game/${gameId}/state`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`the server answered ${response.status}`)
  return response.json()
}

const money = (amount) => `$${Math.abs(amount).toLocaleString('en-US')}`
const signed = (amount) => (amount < 0 ? `${RED}-${money(amount)}${OFF}` : money(amount))

/**
 * The blockers — the things that stop the round advancing, in the order they bite.
 * Everything here is phrased as an instruction, because at the table nobody wants a
 * status field, they want to know what to press.
 */
function todo(sync) {
  const { state, derived, assist } = sync
  const out = []

  if (state.phase === 'setup') {
    const unshuffled = [1, 2, 3, 4].filter((era) => state.decks[era].order.length === 0)
    if (unshuffled.length > 0) out.push(`Shuffle era ${unshuffled.join(', ')} on the console`)
    out.push('Advance phase to open the draft')
  }

  if (state.phase === 'draft' && state.draft !== null) {
    const submitted = state.draft.submissions.map((s) => s.player)
    const waiting = state.config.turnOrder.filter((p) => !submitted.includes(p))
    out.push(
      waiting.length === 0
        ? `${GREEN}All four submitted — click Resolve draft round${OFF}`
        : `Waiting on ${BOLD}${waiting.join(', ')}${OFF} to submit (draft round ${state.draft.round} of 7)`,
    )
  }

  if (state.phase === 'market') out.push('Nothing to do — advance to the Open phase')

  if (state.phase === 'open') {
    out.push('Open phase: all four act at once on their phones. Call thirty seconds.')
    for (const player of derived.awaitingLiquidation) {
      const queue = assist[player]?.credit.liquidationQueue ?? []
      out.push(
        `${RED}Liquidate ${player}${OFF} — ${queue.length === 0
          ? 'nothing left to auction, the balance writes down on entering this phase'
          : `next lot ${BOLD}${queue[0]}${OFF}, ${queue.length} to go`}`,
      )
    }
  }

  if (state.phase === 'movement') {
    out.push('Each player rolls in turn order; type the dice in')
    const CARD_SQUARES = [2, 7, 17, 22, 33, 36]
    for (const player of state.config.turnOrder) {
      if (CARD_SQUARES.includes(state.players[player].position)) {
        out.push(`${YELLOW}${player} is resting on a card square — draw a card${OFF}`)
      }
    }
  }

  if (state.phase === 'settlement') {
    const needRolls = state.config.turnOrder.filter(
      (p) => state.round >= 13 && state.players[p].heat >= 2,
    )
    if (needRolls.length > 0) {
      out.push(
        `${RED}Type a physical 2d6 audit roll for ${BOLD}${needRolls.join(', ')}${OFF}${RED} `
        + `BEFORE running Settlement${OFF}`,
      )
    }
    out.push('Run Settlement')
  }

  if (state.phase === 'scoring' || state.phase === 'complete') {
    const winner = derived.winner ?? derived.standings[0]?.player
    out.push(`${GREEN}The game is over. ${winner} wins.${OFF}`)
  }

  return out
}

/** Announcements that are easy to forget and change how people play. */
function announcements(state) {
  if (state.phase !== 'market') return []
  if (state.round === 7) {
    return ['Era II. Everyone gets $300 — say clearly that it is a LOAN, not a gift.']
  }
  if (state.round === 13) {
    return ['Era III. AUDITS BEGIN. Anyone holding dirty cash has stopped being safe.']
  }
  if (state.round === 19) {
    return ['Era IV. Nothing new unlocks; the rate is 12%. It is a survival phase.']
  }
  return []
}

function render(sync) {
  const { state, derived, assist } = sync
  const rule = '─'.repeat(72)
  const lines = []

  lines.push(`${GREEN}${rule}${OFF}`)
  lines.push(
    `${BOLD}  LEVERAGE${OFF}${roomCode === '' ? '' : `  room ${BOLD}${roomCode}${OFF}`}`
    + `   round ${BOLD}${state.round}${OFF}/24   era ${BOLD}${state.era}${OFF}`
    + `   ${BOLD}${state.phase}${OFF}`
    + `   ${DIM}rate ${(derived.prevailingRate * 100).toFixed(0)}%`
    + `   treasury ${money(state.treasury)}${OFF}`,
  )
  lines.push(`${GREEN}${rule}${OFF}`)

  for (const note of announcements(state)) {
    lines.push(`  ${YELLOW}${BOLD}ANNOUNCE${OFF}  ${note}`)
  }

  lines.push('')
  lines.push(`  ${BOLD}DO NOW${OFF}`)
  for (const item of todo(sync)) lines.push(`    • ${item}`)

  lines.push('')
  lines.push(
    `  ${DIM}${'player'.padEnd(8)}${'clean'.padStart(10)}${'dirty'.padStart(9)}`
    + `${'drawn'.padStart(10)}${'heat'.padStart(6)}${'net worth'.padStart(12)}${OFF}`,
  )
  for (const standing of derived.standings) {
    const p = state.players[standing.player]
    const flag = p.marginCallFlaggedAt !== null ? `${RED} MARGIN CALL${OFF}` : ''
    const debt = p.distressedDebt > 0 ? `${RED} distressed ${money(p.distressedDebt)}${OFF}` : ''
    lines.push(
      `  ${BOLD}${standing.player.padEnd(8)}${OFF}`
      + `${money(p.cleanCash).padStart(10)}`
      + `${money(p.dirtyCash).padStart(9)}`
      + `${money(p.drawnCredit).padStart(10)}`
      + `${String(p.heat).padStart(6)}`
      + `${signed(standing.netWorth).padStart(standing.netWorth < 0 ? 21 : 12)}`
      + `${flag}${debt}`,
    )
  }

  const risks = state.config.turnOrder.flatMap((player) =>
    (assist[player]?.warnings ?? [])
      .filter((w) => w.severity === 'risk')
      .map((w) => `${player}: ${w.message}`))
  if (risks.length > 0) {
    lines.push('')
    lines.push(`  ${BOLD}${RED}AT RISK${OFF}`)
    for (const risk of risks.slice(0, 8)) lines.push(`    • ${risk}`)
  }

  if (derived.contracts.length > 0) {
    lines.push('')
    lines.push(`  ${BOLD}LIVE CONTRACTS${OFF}  ${DIM}${derived.contracts.length} outstanding${OFF}`)
    for (const contract of derived.contracts.slice(0, 6)) {
      lines.push(
        `    ${DIM}${contract.kind.padEnd(13)}${OFF}${contract.summary}`
        + `  ${DIM}${contract.counterparties.join(' · ')}  mark ${money(contract.mark)}${OFF}`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}

const once = process.argv.includes('--once')

async function tick() {
  try {
    const sync = await readSync()
    const frame = render(sync)
    if (!once) process.stdout.write('[2J[H')
    process.stdout.write(`${frame}\n`)
    if (!once) process.stdout.write(`${DIM}  refreshing every 3s — ctrl-c to stop${OFF}\n`)
  } catch (error) {
    process.stdout.write(`${RED}  cannot reach the game: ${String(error.message)}${OFF}\n`)
  }
}

await tick()
if (!once) setInterval(() => { void tick() }, 3000)
