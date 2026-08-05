import { PLAYERS, advanceTo, draftThroughApi, expect, playRound, test } from './fixtures.ts'

/**
 * The UI form of the event-union audit: **is every command reachable from a control, and
 * does every control do something?**
 *
 * Both directions matter and both have already caught real defects here. Writing the
 * first test in this file is what found that `submit-draft` had no UI at all — the game
 * could not be started from a browser — and that `ReorderDeck` had no control anywhere,
 * so E3-05 was a card that could be drawn and never applied. Same shape as the six that
 * escaped the engine's task reviews: correct code, passing tests, nothing calling it.
 */

/**
 * Every command the server accepts. Mirrored by hand from `wireCommandSchema`, because a
 * Zod union has no runtime enumeration — and mirrored deliberately, so that adding a
 * command without adding a way to reach it fails HERE rather than shipping.
 */
const EVERY_COMMAND: readonly string[] = [
  'advance-phase', 'settle', 'submit-draft', 'resolve-draft-round', 'roll-dice',
  'BuildHouse', 'SellHouse', 'MortgageDeed', 'UnmortgageDeed', 'TradeAssets',
  'DrawCredit', 'RepayCredit', 'SettleLiquidationLot', 'RepayDistressedDebt',
  'OriginatePeerLoan', 'RepayPeerLoan', 'SellPeerLoanNote',
  'OriginateRentFuture', 'SellRentFuture',
  'WriteDeedOption', 'SellDeedOption', 'ExerciseDeedOption',
  'CreatePool', 'SellTranche', 'WriteSwap',
  'LaunchVenture', 'PlaySpeakeasy', 'LaunderCash', 'Bribe', 'InsiderTrade',
  'RunAuditChecks', 'ShuffleDeck', 'DrawCard', 'ReorderDeck',
]

/**
 * `RunAuditChecks` is the one command with no control, on purpose: Settlement step 9
 * already rolls audits as part of `settle`, and a second button that runs them out of
 * band would let a facilitator audit a table twice in one round.
 */
const DELIBERATELY_UNREACHABLE = new Set(['RunAuditChecks'])

test('every command the server accepts is reachable from a control', async ({ allInstruments }) => {
  const table = allInstruments
  const admin = table.admin
  const player = table.players.P1

  const reachable = new Set<string>()

  // --- setup phase: the shuffle and the clock
  await expect(admin.getByRole('button', { name: /Shuffle era 1/ })).toBeVisible()
  reachable.add('ShuffleDeck')
  await expect(admin.getByRole('button', { name: 'Advance phase' })).toBeVisible()
  reachable.add('advance-phase')
  await expect(admin.getByRole('button', { name: 'Undo last command' })).toBeVisible()

  for (const era of [1, 2, 3, 4] as const) {
    await table.api({ type: 'ShuffleDeck', era, order: Array.from({ length: 20 }, (_, i) => i) })
  }

  // --- draft phase: the submission form, which is what makes the game startable at all
  await table.api({ type: 'advance-phase' })
  await expect(player.locator('[data-draft-form]')).toBeVisible()
  await expect(player.locator('[data-submit-draft]')).toBeEnabled()
  reachable.add('submit-draft')
  await expect(admin.getByRole('button', { name: 'Resolve draft round' })).toBeEnabled()
  reachable.add('resolve-draft-round')

  await draftThroughApi(table)

  // --- open phase: every instrument, since this table unlocks them all from round 1
  await advanceTo(table, 'open')
  for (const id of [
    'draw-credit', 'repay-credit', 'repay-distressed', 'build-house', 'sell-house',
    'mortgage', 'unmortgage', 'trade', 'lend', 'repay-loan', 'sell-note',
    'originate-future', 'sell-future', 'launch-venture', 'speakeasy', 'launder',
    'bribe', 'write-option', 'sell-option', 'exercise-option', 'create-pool',
    'sell-tranche', 'write-swap', 'insider-trade',
  ]) {
    await expect(player.locator(`[data-action="${id}"]`)).toBeVisible()
  }
  for (const type of [
    'DrawCredit', 'RepayCredit', 'RepayDistressedDebt', 'BuildHouse', 'SellHouse',
    'MortgageDeed', 'UnmortgageDeed', 'TradeAssets', 'OriginatePeerLoan', 'RepayPeerLoan',
    'SellPeerLoanNote', 'OriginateRentFuture', 'SellRentFuture', 'LaunchVenture',
    'PlaySpeakeasy', 'LaunderCash', 'Bribe', 'WriteDeedOption', 'SellDeedOption',
    'ExerciseDeedOption', 'CreatePool', 'SellTranche', 'WriteSwap', 'InsiderTrade',
  ]) reachable.add(type)

  // --- movement phase: dice and cards
  await advanceTo(table, 'movement')
  await expect(admin.locator('[data-roll="P1"]')).toBeEnabled()
  reachable.add('roll-dice')
  await expect(admin.locator('[data-draw="P1"]')).toBeEnabled()
  reachable.add('DrawCard')
  await expect(admin.locator('[data-reorder]')).toBeEnabled()
  reachable.add('ReorderDeck')

  // --- settlement
  await advanceTo(table, 'settlement')
  await expect(admin.getByRole('button', { name: 'Run Settlement' })).toBeEnabled()
  reachable.add('settle')

  // --- liquidation, which only renders when someone is actually awaiting one
  await table.api({ type: 'settle', auditDice: {} })
  await table.api({ type: 'advance-phase' })
  await advanceTo(table, 'open')
  const state = await table.state()
  const base = Object.values(state.deeds)
    .filter((d) => d.owner === 'P4' && !d.mortgaged)
    .reduce((total, d) => total + Math.floor(d.faceValue * 0.75), 0)
  await table.api({ type: 'DrawCredit', player: 'P4', amount: base })
  const biggest = Object.values(state.deeds)
    .filter((d) => d.owner === 'P4')
    .sort((a, b) => b.faceValue - a.faceValue)[0]
  await table.api({ type: 'MortgageDeed', player: 'P4', deed: biggest?.id ?? '' })
  await playRound(table)
  await playRound(table)
  await advanceTo(table, 'open')

  await expect(admin.locator('[data-liquidate="P4"]')).toBeVisible()
  reachable.add('SettleLiquidationLot')

  const missing = EVERY_COMMAND
    .filter((type) => !reachable.has(type) && !DELIBERATELY_UNREACHABLE.has(type))
  expect(
    missing,
    `these commands have no control anywhere, which is the same defect as an uncalled `
    + `function: ${missing.join(', ')}`,
  ).toEqual([])
})

test('every admin control actually changes the game, not just the screen', async ({ table }) => {
  const admin = table.admin

  const lengthOf = async (): Promise<number> => (await table.log()).length

  const beforeShuffle = await lengthOf()
  await admin.getByRole('button', { name: /Shuffle era 1/ }).click()
  await expect.poll(lengthOf).toBeGreaterThan(beforeShuffle)

  const beforePhase = await lengthOf()
  await admin.getByRole('button', { name: 'Advance phase' }).click()
  await expect.poll(lengthOf).toBeGreaterThan(beforePhase)
  expect((await table.state()).phase).toBe('draft')

  /**
   * Undo is the most-used facilitator control — they WILL mistype a die roll — so it is
   * tested as a control, not as an endpoint: the click has to put the game back.
   */
  await admin.getByRole('button', { name: 'Undo last command' }).click()
  await expect.poll(async () => (await table.state()).phase).toBe('setup')
})

test('the dice a facilitator types move the token they name', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'movement')

  const admin = table.admin
  await admin.getByLabel('P2 die 1').fill('3')
  await admin.getByLabel('P2 die 2').fill('4')
  await admin.locator('[data-roll="P2"]').click()

  await expect.poll(async () => (await table.state()).players.P2.position).toBe(7)
  // ...and the player's own view shows it, because every client reads one payload.
  await expect(table.players.P2.getByText(/movement/).first()).toBeVisible()
})

/**
 * An undo has to reach the SCREEN, not just the log.
 *
 * Every other undo assertion in this suite reads `table.state()` over HTTP, and all of
 * them passed while the browser sat frozen on the pre-undo state: the client dropped any
 * broadcast whose log was shorter than the last one it had seen, which is precisely the
 * shape of every undo. Asserting through the API is what let it hide, so this one
 * asserts through the four player views and the television.
 */
test('an undo reaches every screen, not just the log', async ({ table }) => {
  await draftThroughApi(table)
  const state = await table.state()
  expect(state.phase).toBe('market')

  await table.admin.getByRole('button', { name: 'Advance phase' }).click()
  for (const player of PLAYERS) {
    await expect(table.players[player].getByText(/round 1 of 24 · era 1 · open/)).toBeVisible()
  }
  await expect(table.tv.getByText('open')).toBeVisible()

  await table.admin.getByRole('button', { name: 'Undo last command' }).click()

  for (const player of PLAYERS) {
    await expect(table.players[player].getByText(/round 1 of 24 · era 1 · market/)).toBeVisible()
  }
  await expect(table.tv.getByText('market')).toBeVisible()
})

test('a mistyped roll is undone whole, not one event at a time', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'movement')

  const before = await table.state()
  await table.api({ type: 'roll-dice', player: 'P1', dice: [3, 4] })
  expect((await table.state()).players.P1.position).not.toBe(before.players.P1.position)

  await table.admin.getByRole('button', { name: 'Undo last command' }).click()
  await expect
    .poll(async () => (await table.state()).players.P1.position)
    .toBe(before.players.P1.position)
})

test('the draft is playable from four browsers, submitting simultaneously', async ({ table }) => {
  for (const era of [1, 2, 3, 4] as const) {
    await table.api({ type: 'ShuffleDeck', era, order: Array.from({ length: 20 }, (_, i) => i) })
  }
  await table.api({ type: 'advance-phase' })

  for (let round = 1; round <= 7; round += 1) {
    await Promise.all(PLAYERS.map(async (player, index) => {
      const page = table.players[player]
      await expect(page.locator('[data-draft-form]')).toBeVisible()
      /**
       * Each player takes a different first choice, so the round resolves without a
       * contest. Contested resolution is covered by the engine's own draft suite; what
       * this proves is that four browsers can submit at the same moment.
       */
      const options = await page.locator('[data-rank="1"] option').all()
      const values = await Promise.all(options.map((option) => option.getAttribute('value')))
      const pick = (offset: number): string => values[(index + offset) % values.length] ?? ''
      await page.locator('[data-rank="1"]').selectOption(pick(0))
      await page.locator('[data-rank="2"]').selectOption(pick(1))
      await page.locator('[data-rank="3"]').selectOption(pick(2))
      await page.locator('[data-submit-draft]').click()
    }))

    await expect.poll(async () => (await table.state()).draft?.submissions.length ?? 0).toBe(4)
    await table.admin.getByRole('button', { name: 'Resolve draft round' }).click()
    await expect.poll(async () => (await table.state()).draft?.round ?? 0).toBe(round + 1)
  }

  // 28 deeds allocated, exactly 7 each — the equality the flat $8 carrying cost rests on.
  const state = await table.state()
  const owned = Object.values(state.deeds).filter((d) => d.owner !== null)
  expect(owned).toHaveLength(28)
  for (const player of PLAYERS) {
    expect(Object.values(state.deeds).filter((d) => d.owner === player)).toHaveLength(7)
    expect(state.players[player].cleanCash).toBeGreaterThanOrEqual(0)
  }
})
