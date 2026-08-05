import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_IDS, type GameState, type PlayerId } from '@leverage/engine'
import { startHarness, type Harness } from './harness.js'
import { readState, readSync, runDraft, advanceTo } from './driver.js'
import type { Sync } from '../src/views.js'

/**
 * Broadcast, reconnect and genuine concurrency. Four players act SIMULTANEOUSLY during
 * the Open phase — that is the mechanism keeping a game this complex inside 2.5 hours —
 * so "commands are neither lost nor reordered" has to be a tested property, not an
 * assumption about how fast a laptop is.
 */

interface Socket {
  readonly messages: Sync[]
  waitFor(predicate: (sync: Sync) => boolean, label: string): Promise<Sync>
  close(): void
}

function connect(h: Harness, token: string): Promise<Socket> {
  const url = `${h.baseUrl.replace('http', 'ws')}/ws/${h.gameId}?token=${encodeURIComponent(token)}`
  const socket = new WebSocket(url)
  const messages: Sync[] = []
  const waiters: { predicate: (sync: Sync) => boolean; resolve: (sync: Sync) => void }[] = []

  socket.addEventListener('message', (event) => {
    const sync = JSON.parse(String(event.data)) as Sync
    messages.push(sync)
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(sync)) continue
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(sync)
    }
  })

  /**
   * Resolves on the FIRST SYNC, not on `open`. An unauthorized socket still completes
   * its upgrade — the handler runs after the handshake — and is then closed with 4401,
   * so waiting on `open` would call an authentication failure a success.
   */
  return new Promise((resolve, reject) => {
    socket.addEventListener('error', () => { reject(new Error('websocket failed to open')) })
    socket.addEventListener('close', (event) => {
      reject(new Error(`socket closed before any sync (code ${(event as CloseEvent).code})`))
    })
    socket.addEventListener('message', () => {
      resolve({
        messages,
        waitFor: (predicate, label) => new Promise<Sync>((ok, fail) => {
          const found = messages.find(predicate)
          if (found !== undefined) { ok(found); return }
          const timer = setTimeout(
            () => { fail(new Error(`timed out waiting for ${label}`)) }, 4000,
          )
          waiters.push({ predicate, resolve: (sync) => { clearTimeout(timer); ok(sync) } })
        }),
        close: () => { socket.close() },
      })
    })
  })
}

describe('websocket broadcast', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('refuses a socket with no token', async () => {
    await expect(connect(h, 'not-a-token')).rejects.toThrow()
  })

  it('sends a full sync the moment a client connects', async () => {
    const socket = await connect(h, h.tokens.players.P1)
    const first = await socket.waitFor(() => true, 'the opening sync')
    expect(first.type).toBe('sync')
    expect(first.state.phase).toBe('setup')
    expect(first.role).toEqual({ kind: 'player', player: 'P1' })
    expect(Object.keys(first.assist).sort()).toEqual([...PLAYER_IDS].sort())
    socket.close()
  })

  it('pushes every state change to all five clients', async () => {
    const clients = await Promise.all([
      connect(h, h.tokens.admin),
      connect(h, h.tokens.table),
      ...PLAYER_IDS.map((p) => connect(h, h.tokens.players[p])),
    ])
    try {
      await h.must({ type: 'advance-phase' })
      for (const client of clients) {
        const sync = await client.waitFor((s) => s.state.phase === 'draft', 'the draft phase')
        expect(sync.state.draft).not.toBeNull()
      }
    } finally {
      for (const client of clients) client.close()
    }
  })

  /**
   * The property the whole persistence design exists for. A player closes their tab
   * mid-game — half-filled form and all — and the state they come back to is the
   * server's, not a stale mirror or an empty one.
   */
  it('a client that disconnects mid-game rebuilds exact state on reconnect', async () => {
    const first = await connect(h, h.tokens.players.P2)
    await first.waitFor(() => true, 'the opening sync')
    first.close()

    await runDraft(h)
    await advanceTo(h, 'open')

    const second = await connect(h, h.tokens.players.P2)
    const rebuilt = await second.waitFor(() => true, 'the reconnect sync')
    const authoritative = await readSync(h)
    expect(rebuilt.state).toEqual(authoritative.state)
    expect(rebuilt.length).toBe(authoritative.length)
    second.close()
  })
})

describe('simultaneous play', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('accepts four players drawing credit at the same instant, losing nothing', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    const amounts: Record<PlayerId, number> = { P1: 100, P2: 200, P3: 300, P4: 400 }
    const results = await Promise.all(PLAYER_IDS.map((player) =>
      h.command({ type: 'DrawCredit', player, amount: amounts[player] }, h.tokens.players[player])))

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    const state = await readState(h)
    for (const player of PLAYER_IDS) {
      expect(state.players[player].drawnCredit).toBe(amounts[player])
    }
  })

  /**
   * Order is not asserted — four genuinely concurrent commands have no defined order —
   * but the LOG must contain each exactly once, in a single consistent sequence with no
   * gaps. Anything else means an append interleaved with another and lost a write.
   */
  it('writes every concurrent command to the log exactly once, with no gaps', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')
    const before = (await readSync(h)).length

    await Promise.all(PLAYER_IDS.map((player) =>
      h.command({ type: 'DrawCredit', player, amount: 50 }, h.tokens.players[player])))

    const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
    const log = body as { length: number; events: { type: string; player?: PlayerId }[] }
    const drawn = log.events.slice(before).filter((e) => e.type === 'CreditDrawn')
    expect(drawn).toHaveLength(4)
    expect(new Set(drawn.map((e) => e.player))).toEqual(new Set(PLAYER_IDS))
    expect(log.length).toBe(before + 4)
  })

  it('a rejected command changes nothing at all', async () => {
    await runDraft(h)
    const before = await readState(h)
    const lengthBefore = (await readSync(h)).length

    const { status } = await h.command(
      { type: 'DrawCredit', player: 'P1', amount: 99_999 }, h.tokens.players.P1,
    )
    expect(status).toBe(409)

    const after: GameState = await readState(h)
    expect(after).toEqual(before)
    expect((await readSync(h)).length).toBe(lengthBefore)
  })
})
