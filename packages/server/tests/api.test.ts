import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_IDS } from '@leverage/engine'
import { startHarness, type Harness } from './harness.js'
import { readState, runDraft, shuffleAllDecks } from './driver.js'

describe('HTTP command surface', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('mints a room code, an admin token, a table token and four player tokens', () => {
    expect(h.roomCode).toMatch(/^[A-Z2-9]{4}$/)
    expect(Object.keys(h.tokens.players).sort()).toEqual([...PLAYER_IDS].sort())
    expect(new Set(Object.values(h.tokens.players)).size).toBe(4)
  })

  it('resolves a room code read aloud at the table', async () => {
    const { status, body } = await h.get(`/api/join/${h.roomCode}`)
    expect(status).toBe(200)
    expect((body as { gameId: string }).gameId).toBe(h.gameId)
  })

  it('refuses a command with no token', async () => {
    const { status } = await h.post(`/api/game/${h.gameId}/command`, { type: 'advance-phase' })
    expect(status).toBe(401)
  })

  it('refuses a token minted for a different game', async () => {
    const other = await startHarness()
    try {
      const { status } = await h.command({ type: 'advance-phase' }, other.tokens.admin)
      expect(status).toBe(401)
    } finally {
      await other.close()
    }
  })

  it('refuses a token whose signature has been tampered with', async () => {
    const forged = `${h.tokens.admin.slice(0, -2)}xx`
    const { status } = await h.command({ type: 'advance-phase' }, forged)
    expect(status).toBe(401)
  })

  it('rejects a malformed command at the boundary with 400, not 500', async () => {
    const { status, body } = await h.post(
      `/api/game/${h.gameId}/command`,
      { type: 'roll-dice', player: 'P1', dice: [9, 9] },
      h.tokens.admin,
    )
    expect(status).toBe(400)
    expect(body).toHaveProperty('issues')
  })

  it('returns the engine rejection verbatim, with a message written for the table', async () => {
    const { status, body } = await h.command({ type: 'roll-dice', player: 'P1', dice: [3, 4] })
    expect(status).toBe(409)
    expect(body).toMatchObject({ rejected: true, code: 'WRONG_PHASE' })
    expect((body as { message: string }).message).toMatch(/Movement phase/)
  })

  describe('who may submit what', () => {
    it('lets a player act in their own view', async () => {
      await shuffleAllDecks(h)
      await h.must({ type: 'advance-phase' })
      const state = await readState(h)
      const [a, b, c] = Object.values(state.deeds).map((d) => d.id)
      const { status } = await h.command(
        { type: 'submit-draft', player: 'P2', ranked: [a ?? '', b ?? '', c ?? ''], maxBid: 400 },
        h.tokens.players.P2,
      )
      expect(status).toBe(200)
    })

    it('refuses a player submitting on another player\'s behalf', async () => {
      await h.must({ type: 'advance-phase' })
      const state = await readState(h)
      const [a, b, c] = Object.values(state.deeds).map((d) => d.id)
      const { status, body } = await h.command(
        { type: 'submit-draft', player: 'P3', ranked: [a ?? '', b ?? '', c ?? ''], maxBid: 400 },
        h.tokens.players.P2,
      )
      expect(status).toBe(409)
      expect((body as { message: string }).message).toMatch(/P2 may not submit/)
    })

    it('refuses a player advancing the phase, which is the facilitator\'s clock', async () => {
      const { status } = await h.command({ type: 'advance-phase' }, h.tokens.players.P1)
      expect(status).toBe(409)
    })

    it('refuses the table view outright — it is a projector, not a controller', async () => {
      const { status } = await h.command({ type: 'advance-phase' }, h.tokens.table)
      expect(status).toBe(409)
    })
  })

  it('allocates all 28 deeds, exactly 7 per player, across seven draft rounds', async () => {
    await runDraft(h)
    const state = await readState(h)
    const owned = Object.values(state.deeds).filter((d) => d.owner !== null)
    expect(owned).toHaveLength(28)
    for (const player of PLAYER_IDS) {
      expect(Object.values(state.deeds).filter((d) => d.owner === player)).toHaveLength(7)
    }
    expect(state.phase).toBe('market')
    for (const player of PLAYER_IDS) {
      expect(state.players[player].cleanCash).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('undo', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('rewinds the last whole command, not the last event', async () => {
    await runDraft(h)
    await h.must({ type: 'advance-phase' })
    await h.must({ type: 'advance-phase' })
    const before = await readState(h)
    expect(before.phase).toBe('movement')

    const lengthBefore = (await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)).body as
      { length: number }
    await h.must({ type: 'roll-dice', player: 'P1', dice: [3, 4] })
    const afterRoll = await readState(h)
    expect(afterRoll.players.P1.position).not.toBe(before.players.P1.position)

    const { status } = await h.post(`/api/game/${h.gameId}/undo`, {}, h.tokens.admin)
    expect(status).toBe(200)

    const undone = await readState(h)
    expect(undone).toEqual(before)
    const lengthAfter = (await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)).body as
      { length: number }
    expect(lengthAfter.length).toBe(lengthBefore.length)
  })

  it('is facilitator-only', async () => {
    const { status } = await h.post(`/api/game/${h.gameId}/undo`, {}, h.tokens.players.P1)
    expect(status).toBe(401)
  })

  it('never truncates away GameCreated', async () => {
    await h.post(`/api/game/${h.gameId}/undo`, { toLength: 0 }, h.tokens.admin)
    const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
    expect((body as { length: number }).length).toBe(1)
    const state = await readState(h)
    expect(state.phase).toBe('setup')
  })
})
