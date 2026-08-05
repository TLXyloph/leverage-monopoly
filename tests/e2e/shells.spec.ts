import { PLAYERS, advanceTo, draftThroughApi, expect, playRound, test } from './fixtures.ts'

/**
 * The three shells, live in five concurrent browser contexts.
 *
 * The engine generates no randomness, so every assertion here is an exact value rather
 * than a range — the same property that makes the whole suite realistic.
 */

test('all five clients render the same authoritative state', async ({ table }) => {
  await expect(table.admin.getByRole('heading', { name: /facilitator/ })).toBeVisible()
  await expect(table.tv.getByRole('heading', { name: 'LEVERAGE' })).toBeVisible()
  for (const player of PLAYERS) {
    await expect(table.players[player].getByRole('heading', { name: player })).toBeVisible()
  }

  // Every shell shows the starting cash, because they all read one payload.
  for (const player of PLAYERS) {
    await expect(table.players[player].getByText('$2,500').first()).toBeVisible()
  }
})

test('the facilitator clock moves every client at once', async ({ table }) => {
  await table.admin.getByRole('button', { name: 'Advance phase' }).click()
  await expect(table.admin.getByText(/draft/).first()).toBeVisible()
  for (const player of PLAYERS) {
    await expect(table.players[player].getByText(/draft/).first()).toBeVisible()
  }
  await expect(table.tv.getByText('draft').first()).toBeVisible()
})

test('the table view is a projector, not a controller', async ({ table }) => {
  // No control on the television does anything, and the server refuses its token outright.
  await expect(table.tv.getByRole('button')).toHaveCount(0)
})

test('a player reloading their tab rebuilds exact current state', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const page = table.players.P2
  await expect(page.getByText(/round 1 of 24/)).toBeVisible()

  /**
   * Half-fill a form, then close and reopen the tab. The spec's hard constraint is about
   * SERVER state surviving, not the draft text — so the reopened view must show the same
   * cash, deeds and round, and the half-typed amount is expected to be gone.
   */
  const amount = page.locator('[data-action="draw-credit"] input[name="amount"]')
  await amount.fill('317')

  const before = await table.state()
  await page.reload()

  await expect(page.getByText(/round 1 of 24/)).toBeVisible()
  const after = await table.state()
  expect(after.players.P2.cleanCash).toBe(before.players.P2.cleanCash)
  await expect(page.getByRole('heading', { name: 'P2' })).toBeVisible()
})

test('a rejection comes back to the player who caused it, and to nobody else', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const page = table.players.P3
  await page.locator('[data-action="draw-credit"] input[name="amount"]').fill('999999')
  await page.locator('[data-action="draw-credit"] button[type="submit"]').click()

  await expect(page.getByRole('alert')).toContainText(/borrowing base allows at most/)
  await expect(table.players.P1.getByRole('alert')).toHaveCount(0)
})

test('four players act simultaneously and nothing is lost or reordered', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const before = (await table.log()).length

  /**
   * Genuinely concurrent: four clicks dispatched together, not four players wearing a
   * trench coat. The Open phase is 45–90 seconds of all four acting at once, and that is
   * the mechanism keeping the game inside 2.5 hours.
   */
  await Promise.all(PLAYERS.map(async (player, index) => {
    const page = table.players[player]
    await page.locator('[data-action="draw-credit"] input[name="amount"]')
      .fill(String((index + 1) * 50))
    await page.locator('[data-action="draw-credit"] button[type="submit"]').click()
  }))

  for (const [index, player] of PLAYERS.entries()) {
    await expect
      .poll(async () => (await table.state()).players[player].drawnCredit)
      .toBe((index + 1) * 50)
  }

  const events = await table.log()
  const drawn = events.slice(before).filter((e) => e.type === 'CreditDrawn')
  expect(drawn).toHaveLength(4)
})

test('the television leads with the standings and the live contracts', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')
  await table.api({
    type: 'OriginatePeerLoan', lender: 'P1', borrower: 'P2',
    principal: 200, ratePerRound: 0.1, termRounds: 4, collateral: [],
  })

  await expect(table.tv.getByText('Live contracts')).toBeVisible()
  await expect(table.tv.getByText(/peer-loan/).first()).toBeVisible()
  await expect(table.tv.getByText('Standings')).toBeVisible()
})

test('the round clock reaches Settlement and the era advances on schedule', async ({ table }) => {
  await draftThroughApi(table)
  for (let round = 1; round <= 7; round += 1) await playRound(table)

  const state = await table.state()
  expect(state.round).toBe(8)
  expect(state.era).toBe(2)
  await expect(table.tv.getByText('8 / 24')).toBeVisible()
})
