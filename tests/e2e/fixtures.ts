import { test as base, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

/**
 * Five concurrent browser contexts — one facilitator and four players — against one real
 * server and one real SQLite file.
 *
 * Separate CONTEXTS, not separate pages: four players at a table are four devices, and a
 * shared context would share storage and service workers in a way no real table does.
 * Concurrency is the point of the Open phase, so the tests have to be able to fire four
 * genuinely simultaneous actions.
 */

export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4'
export const PLAYERS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4']

export interface Tokens {
  readonly admin: string
  readonly table: string
  readonly players: Record<PlayerId, string>
}

export interface Table {
  readonly gameId: string
  readonly roomCode: string
  readonly tokens: Tokens
  readonly admin: Page
  readonly tv: Page
  readonly players: Record<PlayerId, Page>
  /** Issues commands as the facilitator, for setup a test is not asserting about. */
  api(command: unknown): Promise<void>
  state(): Promise<GameStateLike>
  log(): Promise<{ type: string }[]>
}

export interface GameStateLike {
  round: number
  era: number
  phase: string
  treasury: number
  players: Record<PlayerId, {
    cleanCash: number; dirtyCash: number; heat: number; position: number
    drawnCredit: number; distressedDebt: number; marginCallFlaggedAt: number | null
  }>
  deeds: Record<string, {
    id: string; owner: string | null; faceValue: number; square: number
    group: string; mortgaged: boolean; houses: number
  }>
  futures: { id: string; deed: string; holder: PlayerId; startRound: number; endRound: number }[]
  options: { id: string; deed: string; holder: PlayerId; writer: PlayerId; strike: number }[]
  loans: { id: string; lender: PlayerId; borrower: PlayerId; status: string }[]
  pools: { id: string; terminated: boolean }[]
  swaps: { id: string; status: string }[]
  finalScores: Record<PlayerId, number> | null
}

interface CreateResponse {
  gameId: string
  roomCode: string
  tokens: Tokens
}

async function openTable(
  request: APIRequestContext,
  makeContext: () => Promise<BrowserContext>,
  unlockMode: 'progressive' | 'all',
): Promise<{ table: Table; contexts: BrowserContext[] }> {
  const created = await request.post('/api/games', {
    data: { label: 'e2e', unlockMode },
  })
  const game = (await created.json()) as CreateResponse

  const contexts: BrowserContext[] = []
  const newPage = async (path: string): Promise<Page> => {
    const context = await makeContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(path)
    return page
  }

  const admin = await newPage(`/admin?token=${encodeURIComponent(game.tokens.admin)}`)
  const tv = await newPage(`/table?token=${encodeURIComponent(game.tokens.table)}`)
  const players = {} as Record<PlayerId, Page>
  for (const player of PLAYERS) {
    players[player] = await newPage(`/p/${encodeURIComponent(game.tokens.players[player])}`)
  }

  const headers = { authorization: `Bearer ${game.tokens.admin}` }

  const table: Table = {
    gameId: game.gameId,
    roomCode: game.roomCode,
    tokens: game.tokens,
    admin,
    tv,
    players,
    api: async (command) => {
      const response = await request.post(`/api/game/${game.gameId}/command`, {
        headers, data: command,
      })
      if (!response.ok()) {
        throw new Error(
          `setup command refused (${response.status()}): ${await response.text()}`,
        )
      }
    },
    state: async () => {
      const response = await request.get(`/api/game/${game.gameId}/state`, { headers })
      return ((await response.json()) as { state: GameStateLike }).state
    },
    log: async () => {
      const response = await request.get(`/api/game/${game.gameId}/log`, { headers })
      return ((await response.json()) as { events: { type: string }[] }).events
    },
  }

  return { table, contexts }
}

export const test = base.extend<{
  table: Table
  allInstruments: Table
}>({
  table: async ({ browser, request }, use) => {
    const { table, contexts } = await openTable(request, () => browser.newContext(), 'progressive')
    await use(table)
    for (const context of contexts) await context.close()
  },

  /** The same five contexts, on a table where every instrument is available from round 1. */
  allInstruments: async ({ browser, request }, use) => {
    const { table, contexts } = await openTable(request, () => browser.newContext(), 'all')
    await use(table)
    for (const context of contexts) await context.close()
  },
})

export { expect } from '@playwright/test'

/**
 * Runs the seven-round draft through the API. Used as SETUP by specs that are asserting
 * about something later in the game; `draft.spec.ts` drives the same thing through the
 * UI and is where the draft itself is actually tested.
 */
export async function draftThroughApi(table: Table): Promise<void> {
  /**
   * Idempotent about where the game already is, so a spec that has walked the UI into
   * the draft itself can hand the rest of the seven rounds to this without tripping over
   * a second shuffle or a second phase advance.
   */
  let current = await table.state()
  if (current.phase === 'setup') {
    for (const era of [1, 2, 3, 4] as const) {
      await table.api({ type: 'ShuffleDeck', era, order: Array.from({ length: 20 }, (_, i) => i) })
    }
    await table.api({ type: 'advance-phase' })
    current = await table.state()
  }
  if (current.phase !== 'draft') return
  for (let round = 0; round < 7; round += 1) {
    const state = await table.state()
    if (state.phase !== 'draft') break
    const available = Object.values(state.deeds)
      .filter((d) => d.owner === null)
      .sort((a, b) => a.faceValue - b.faceValue || a.square - b.square)
      .map((d) => d.id)
    for (const [index, player] of PLAYERS.entries()) {
      const ranked = [0, 1, 2].map((offset) => available[(index + offset) % available.length] ?? '')
      await table.api({
        type: 'submit-draft', player, ranked,
        maxBid: state.deeds[ranked[0] ?? '']?.faceValue ?? 0,
      })
    }
    await table.api({ type: 'resolve-draft-round' })
  }
  await table.api({ type: 'advance-phase' })
}

/** Advances the facilitator's clock until the named phase is current. */
export async function advanceTo(table: Table, phase: string): Promise<void> {
  for (let guard = 0; guard < 6; guard += 1) {
    if ((await table.state()).phase === phase) return
    await table.api({ type: 'advance-phase' })
  }
  throw new Error(`could not reach the ${phase} phase`)
}

export const NEVER_AUDITED = { P1: [6, 6], P2: [6, 6], P3: [6, 6], P4: [6, 6] }

/** Spec section 20: era decks contain no movement cards, so these are resting squares. */
export const CARD_SQUARES: readonly number[] = [2, 7, 17, 22, 33, 36]

/**
 * One movement phase: every player rolls in turn order, and a token resting on a card
 * square draws from the current era's deck.
 *
 * Drawing is not optional detail. The scripted game in `full-game.spec.ts` asserts the
 * same four final net worths as the server-level script, and the two only agree if they
 * are the SAME GAME — a script that skips the deck plays a different economy and proves
 * nothing about the layer it claims to be comparing against.
 */
export async function movement(
  table: Table, rolls: readonly (readonly [number, number])[],
): Promise<void> {
  for (const [index, player] of PLAYERS.entries()) {
    await table.api({ type: 'roll-dice', player, dice: rolls[index] ?? [1, 2] })
    const state = await table.state()
    if (!CARD_SQUARES.includes(state.players[player].position)) continue
    await table.api({ type: 'DrawCard', era: state.era, player })
  }
}

/** One whole round: movement for all four, then Settlement, then the clock forward. */
export async function playRound(
  table: Table, dice: readonly [number, number] = [1, 2],
  auditDice: Record<string, number[]> = NEVER_AUDITED,
): Promise<void> {
  await advanceTo(table, 'movement')
  await movement(table, PLAYERS.map(() => dice))
  await advanceTo(table, 'settlement')
  await table.api({ type: 'settle', auditDice })
  await table.api({ type: 'advance-phase' })
}
