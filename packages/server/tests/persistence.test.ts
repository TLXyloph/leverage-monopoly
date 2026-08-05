import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reduce, replay, type GameState } from '@leverage/engine'
import { SNAPSHOT_INTERVAL, Store } from '../src/db.js'
import { startHarness, type Harness } from './harness.js'
import { playRound, readState, readSync, runDraft, SAFE_ROLLS } from './driver.js'

/**
 * The four checks the server brief demands before this package can be called done, three
 * of which live here. All of them exist because the engine proves replay identity for
 * IN-MEMORY logs and this package owns the round trip through storage.
 */
describe('persistence', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('replay(events read back from SQLite) deep-equals the live state', async () => {
    await runDraft(h)
    await playRound(h, SAFE_ROLLS)
    await playRound(h, SAFE_ROLLS)

    const live = h.liveState() as GameState
    const store = new Store(h.databaseFile)
    try {
      const fromDisk = store.readEvents(h.gameId)
      expect(fromDisk.length).toBeGreaterThan(SNAPSHOT_INTERVAL)
      expect(replay(fromDisk)).toEqual(live)
    } finally {
      store.close()
    }
  })

  it('a restarted process rebuilds the identical state from the log', async () => {
    await runDraft(h)
    await playRound(h, SAFE_ROLLS)
    const before = h.liveState() as GameState

    h = await h.reopen()
    expect(h.liveState()).toEqual(before)
  })

  it('loading through a snapshot agrees with a full replay of the same log', async () => {
    await runDraft(h)
    await playRound(h, SAFE_ROLLS)

    const store = new Store(h.databaseFile)
    try {
      const events = store.readEvents(h.gameId)
      expect(events.length).toBeGreaterThan(SNAPSHOT_INTERVAL)
      /**
       * A snapshot must exist for this test to mean anything: without one, the
       * "through a snapshot" path and the "full replay" path are the same code and the
       * assertion would pass while proving nothing.
       */
      const snapshot = store.latestSnapshot(h.gameId, events.length)
      if (snapshot === null) throw new Error('no snapshot was written; this test proves nothing')
      expect(snapshot.seq).toBeGreaterThan(0)

      const throughSnapshot = events
        .slice(snapshot.seq)
        .reduce<GameState>(reduce, snapshot.state as GameState)
      expect(throughSnapshot).toEqual(replay(events))
      expect(throughSnapshot).toEqual(h.liveState())
    } finally {
      store.close()
    }
  })

  /**
   * `deleteGame` sweeps four tables by hand because there is no foreign key tying the
   * log to the row that names it — the log is append-only and deliberately knows nothing
   * about the game record. Missing one table would strand events no game lists, which
   * `readEvents` would happily replay into a game that no longer exists.
   */
  it('deleting a game leaves nothing of it behind, and touches no other game', async () => {
    await runDraft(h)
    await playRound(h, SAFE_ROLLS)

    const other = await startHarness()
    try {
      await runDraft(other)
      const store = new Store(h.databaseFile)
      try {
        expect(store.readEvents(h.gameId).length).toBeGreaterThan(0)
        expect(store.readCommands(h.gameId).length).toBeGreaterThan(0)
        expect(store.latestSnapshot(h.gameId, 10_000)).not.toBeNull()

        store.deleteGame(h.gameId)

        expect(store.findGame(h.gameId)).toBeNull()
        expect(store.readEvents(h.gameId)).toEqual([])
        expect(store.readCommands(h.gameId)).toEqual([])
        expect(store.latestSnapshot(h.gameId, 10_000)).toBeNull()
        expect(store.listGames().some((g) => g.id === h.gameId)).toBe(false)
      } finally {
        store.close()
      }

      // The other table is untouched and still replays to the state it was in.
      const survivor = new Store(other.databaseFile)
      try {
        expect(survivor.readEvents(other.gameId).length).toBeGreaterThan(0)
      } finally {
        survivor.close()
      }
    } finally {
      await other.close()
    }
  })

  it('player tokens survive a restart, so the QR code on the table keeps working', async () => {
    const token = h.tokens.players.P1
    h = await h.reopen()
    const { status } = await h.get(`/api/game/${h.gameId}/state`, token)
    expect(status).toBe(200)
  })

  it('undo survives a restart — the truncated tail does not come back', async () => {
    await runDraft(h)
    const before = await readState(h)
    const lengthBefore = (await readSync(h)).length

    await h.must({ type: 'advance-phase' })
    await h.post(`/api/game/${h.gameId}/undo`, {}, h.tokens.admin)

    h = await h.reopen()
    expect(await readState(h)).toEqual(before)
    expect((await readSync(h)).length).toBe(lengthBefore)
  })
})
