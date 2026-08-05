import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { PlayerId } from '@leverage/engine'
import { createApp } from '../src/app.js'
import type { WireCommand } from '../src/commands/schema.js'

/**
 * A real Fastify server on an ephemeral port, backed by a real SQLite FILE on disk.
 *
 * Deliberately not mocks and deliberately not `:memory:`. The engine already has 715
 * unit and property tests; what needs proving in this package is persistence,
 * concurrency and broadcast, and none of those three survive being mocked — a
 * `:memory:` database in particular cannot show that a reopened game rebuilds from
 * storage, which is the property the whole design exists for.
 */

export interface Tokens {
  readonly admin: string
  readonly table: string
  readonly players: Record<PlayerId, string>
}

export interface Harness {
  readonly baseUrl: string
  readonly gameId: string
  readonly roomCode: string
  readonly tokens: Tokens
  readonly databaseFile: string
  get(path: string, token?: string): Promise<{ status: number; body: unknown }>
  post(path: string, body?: unknown, token?: string): Promise<{ status: number; body: unknown }>
  command(command: WireCommand, token?: string): Promise<{ status: number; body: unknown }>
  /** Fails loudly on rejection, so a broken script cannot pass as a passing test. */
  must(command: WireCommand, token?: string): Promise<unknown>
  /** Reads the live in-process state, bypassing HTTP. For persistence assertions only. */
  liveState(): unknown
  /** Restarts the process against the same database file, as a crash and relaunch would. */
  reopen(): Promise<Harness>
  /** Stops the server. The database file survives. */
  stop(): Promise<void>
  /** Stops the server and deletes the database. */
  close(): Promise<void>
}

interface CreateResponse {
  gameId: string
  roomCode: string
  tokens: Tokens
}

interface Existing {
  readonly gameId: string
  readonly roomCode: string
  readonly tokens: Tokens
}

async function boot(
  directory: string, databaseFile: string,
  existing: Existing | null, unlockMode: 'progressive' | 'all',
): Promise<Harness> {
  const app = createApp({ databaseFile, logger: false })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  async function request(
    method: 'GET' | 'POST', path: string, body?: unknown, token?: string,
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      /* markdown from /api/rules/:topic is returned as-is */
    }
    return { status: response.status, body: parsed }
  }

  let game: Existing
  if (existing === null) {
    const created = await request('POST', '/api/games', { label: 'test', unlockMode })
    const response = created.body as CreateResponse
    game = { gameId: response.gameId, roomCode: response.roomCode, tokens: response.tokens }
  } else {
    game = existing
  }

  const stop = async (): Promise<void> => { await app.close() }

  return {
    baseUrl,
    gameId: game.gameId,
    roomCode: game.roomCode,
    tokens: game.tokens,
    databaseFile,
    get: (path, token) => request('GET', path, undefined, token),
    post: (path, body, token) => request('POST', path, body, token),
    command: (command, token) =>
      request('POST', `/api/game/${game.gameId}/command`, command, token ?? game.tokens.admin),
    must: async (command, token) => {
      const result = await request(
        'POST', `/api/game/${game.gameId}/command`, command, token ?? game.tokens.admin,
      )
      if (result.status !== 200) {
        throw new Error(
          `${command.type} was refused (${result.status}): ${JSON.stringify(result.body)}`,
        )
      }
      return result.body
    },
    liveState: () => app.context.games.get(game.gameId)?.state,
    reopen: async () => {
      await stop()
      return boot(directory, databaseFile, game, unlockMode)
    },
    stop,
    close: async () => {
      await stop()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export async function startHarness(
  options: { unlockMode?: 'progressive' | 'all' } = {},
): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'leverage-server-'))
  return boot(directory, join(directory, 'game.db'), null, options.unlockMode ?? 'progressive')
}
