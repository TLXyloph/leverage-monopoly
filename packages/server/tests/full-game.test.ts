import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ECONOMY, PLAYER_IDS, type PlayerId } from '@leverage/engine'
import { startHarness, type Harness } from './harness.js'
import { playRound, readState, readSync, runDraft, type Dice, type Rolls } from './driver.js'

/**
 * The strongest regression test the project can have: a full scripted 24-round game,
 * asserting the exact final net worths.
 *
 * It is only possible because the engine generates no randomness — every die roll and
 * shuffle order below is written down, so the same script always produces the same
 * dollars. If any layer ever starts generating a random value, this test degrades into
 * flakiness and that is the signal to stop and fix the layer, not the test.
 */

/**
 * Varied but fixed. Doubles are avoided so nobody accumulates the third consecutive
 * double and is sent to jail on an unrelated round — the jail path has its own test.
 */
function rollsForRound(round: number): Rolls {
  const table: readonly Dice[] = [
    [1, 2], [3, 5], [2, 6], [4, 1], [6, 3], [5, 2],
    [1, 4], [2, 5], [3, 6], [4, 2], [5, 1], [6, 4],
  ]
  const pick = (offset: number): Dice => table[(round + offset) % table.length] ?? [1, 2]
  return { P1: pick(0), P2: pick(3), P3: pick(6), P4: pick(9) }
}

describe('a full scripted 24-round game', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness() })
  afterEach(async () => { await h.close() })

  it('runs to completion and scores exactly', async () => {
    await runDraft(h)
    for (let round = 1; round <= ECONOMY.TOTAL_ROUNDS; round += 1) {
      const state = await readState(h)
      expect(state.round).toBe(round)
      await playRound(h, rollsForRound(round))
    }

    const final = await readState(h)
    expect(final.phase).toBe('scoring')
    expect(final.finalScores).not.toBeNull()

    /**
     * Recorded from a run of this exact script, not derived by hand. The value is not
     * that these are the "right" numbers in the abstract — it is that no change anywhere
     * in the engine, the dispatcher or the settlement order can move a single dollar of
     * a 24-round game without this test naming the amount it moved by.
     */
    const scores = final.finalScores as Record<PlayerId, number>
    expect(scores).toEqual({ P1: 1871, P2: 1624, P3: 2159, P4: 1848 })

    const sync = await readSync(h)
    expect(sync.derived.standings).toHaveLength(4)
    expect(sync.derived.standings[0]?.rank).toBe(1)
    expect(sync.derived.gameOver).toBe(true)
  }, 120_000)

  it('advances the era every six rounds and the Era II stimulus exactly once', async () => {
    await runDraft(h)
    const erasSeen: number[] = []
    for (let round = 1; round <= 13; round += 1) {
      erasSeen.push((await readState(h)).era)
      await playRound(h, rollsForRound(round))
    }
    expect(erasSeen.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1])
    expect(erasSeen.slice(6, 12)).toEqual([2, 2, 2, 2, 2, 2])
    expect(erasSeen[12]).toBe(3)

    const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
    const log = body as { events: { type: string }[] }
    const stimulus = log.events.filter((e) => e.type === 'StimulusAdvanced')
    /**
     * The Era II stimulus was implemented, unit-tested, reviewed, approved — and never
     * called, for nine tasks. It is asserted here from a driven game rather than from a
     * unit test for exactly that reason: a unit test proves the function works, not that
     * anything invokes it.
     */
    expect(stimulus).toHaveLength(PLAYER_IDS.length)
    expect(log.events.filter((e) => e.type === 'EraAdvanced')).toHaveLength(2)
  }, 120_000)
})
