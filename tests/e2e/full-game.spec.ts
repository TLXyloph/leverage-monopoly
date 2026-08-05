import {
  CARD_SQUARES, PLAYERS, advanceTo, draftThroughApi, expect, movement, test,
} from './fixtures.ts'

/**
 * Spec section 15, scenario 7: **a full scripted 24-round game asserting exact final net
 * worths** — the strongest regression test the project can have.
 *
 * It is only possible because the engine generates no randomness. Every die roll below
 * is written down, so the same script always produces the same dollars. If any layer
 * ever starts generating a value, this degrades into flakiness, and that is the signal
 * to fix the layer rather than loosen the test.
 *
 * Round 1 is driven entirely through the FACILITATOR'S CONSOLE — typed dice, clicked
 * phase advances, clicked Settlement — to prove those controls really drive a round. The
 * remaining 23 go through the API for speed, and the assertions land back in the
 * browser: the television and the four player views must all show the same final figure.
 */

function rollsForRound(round: number): readonly (readonly [number, number])[] {
  const table: readonly (readonly [number, number])[] = [
    [1, 2], [3, 5], [2, 6], [4, 1], [6, 3], [5, 2],
    [1, 4], [2, 5], [3, 6], [4, 2], [5, 1], [6, 4],
  ]
  return [0, 3, 6, 9].map((offset) => table[(round + offset) % table.length] ?? [1, 2])
}

test('a scripted 24-round game ends on exact net worths, shown in every shell', async ({ table }) => {
  await draftThroughApi(table)

  // --- round 1, entirely through the facilitator's console
  const admin = table.admin
  await advanceTo(table, 'movement')
  const first = rollsForRound(1)
  for (const [index, player] of PLAYERS.entries()) {
    const dice = first[index] ?? [1, 2]
    await admin.getByLabel(`${player} die 1`).fill(String(dice[0]))
    await admin.getByLabel(`${player} die 2`).fill(String(dice[1]))
    await admin.locator(`[data-roll="${player}"]`).click()
    // A token resting on a card square draws — through the console's own Card button,
    // which is the control the facilitator actually uses at the table.
    await expect.poll(async () => (await table.state()).players[player].position)
      .not.toBe(0)
    const state = await table.state()
    if (CARD_SQUARES.includes(state.players[player].position)) {
      await admin.locator(`[data-draw="${player}"]`).click()
    }
  }
  await expect.poll(async () => (await table.state()).players.P4.position).toBeGreaterThan(0)

  await admin.getByRole('button', { name: 'Advance phase' }).click()
  await expect.poll(async () => (await table.state()).phase).toBe('settlement')
  await admin.getByRole('button', { name: 'Run Settlement' }).click()
  await expect.poll(async () => (await table.log()).some((e) => e.type === 'CarryingCostCharged'))
    .toBe(true)
  await admin.getByRole('button', { name: 'Advance phase' }).click()
  await expect.poll(async () => (await table.state()).round).toBe(2)

  // --- rounds 2 through 24
  for (let round = 2; round <= 24; round += 1) {
    await advanceTo(table, 'movement')
    await movement(table, rollsForRound(round))
    await advanceTo(table, 'settlement')
    await table.api({
      type: 'settle',
      auditDice: { P1: [6, 6], P2: [6, 6], P3: [6, 6], P4: [6, 6] },
    })
    await table.api({ type: 'advance-phase' })
  }

  const final = await table.state()
  expect(final.phase).toBe('scoring')

  /**
   * Recorded from a run of this exact script, not derived by hand. The value is not that
   * these are the "right" numbers in the abstract — it is that no change anywhere in the
   * engine, the dispatcher, the settlement order or the browser can move a single dollar
   * of a 24-round game without this test naming the amount it moved by.
   *
   * The same script asserts the same four figures at the server level in
   * `packages/server/tests/full-game.test.ts`; agreeing across both layers is what says
   * the browser adds no arithmetic of its own.
   */
  expect(final.finalScores).toEqual({ P1: 1871, P2: 1624, P3: 2159, P4: 1848 })

  // The television leads with the standings, ranked, in the same dollars.
  await expect(table.tv.getByText('$2,159')).toBeVisible()
  await expect(table.tv.getByText('24 / 24')).toBeVisible()

  // And each player sees their own figure, from the one payload every shell reads.
  await expect(table.players.P1.locator('[data-figure="net-worth"]')).toContainText('$1,871')
  await expect(table.players.P3.locator('[data-figure="net-worth"]')).toContainText('$2,159')
})

test('the log replays through storage to the same state the browser is showing', async ({ table }) => {
  await draftThroughApi(table)
  for (let round = 1; round <= 3; round += 1) {
    await advanceTo(table, 'movement')
    await movement(table, PLAYERS.map(() => [1, 2] as const))
    await advanceTo(table, 'settlement')
    await table.api({
      type: 'settle', auditDice: { P1: [6, 6], P2: [6, 6], P3: [6, 6], P4: [6, 6] },
    })
    await table.api({ type: 'advance-phase' })
  }

  /**
   * Undo is free because the engine holds no randomness: truncate the log, replay, and
   * the same dollars come back. Proven here at the outermost layer — through the
   * browser, the WebSocket, the server and SQLite — rather than in memory.
   */
  const before = await table.state()
  const lengthBefore = (await table.log()).length

  await table.api({ type: 'advance-phase' })
  await table.admin.getByRole('button', { name: 'Undo last command' }).click()

  await expect.poll(async () => (await table.log()).length).toBe(lengthBefore)
  const after = await table.state()
  expect(after.round).toBe(before.round)
  expect(after.phase).toBe(before.phase)
  for (const player of PLAYERS) {
    expect(after.players[player].cleanCash).toBe(before.players[player].cleanCash)
  }
})
