import { advanceTo, draftThroughApi, expect, playRound, test } from './fixtures.ts'

/**
 * **Does every warning the assist panel can produce actually fire in a real scenario?**
 *
 * The web brief's second completion check. A warning that renders in no reachable state
 * is the UI form of a function nobody calls, so each one below is driven out of a real
 * game rather than a constructed prop.
 *
 * The panel shows the math and never the move. Nothing here asserts that it ranked,
 * scored or recommended anything, because it must not.
 */

test('venture payoffs are shown at their laundered value, never their dirty value', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const numbers = table.players.P1.locator('[data-venture="numbers"]')
  await expect(numbers).toBeVisible()

  /**
   * The single highest-value number in the interface. The Numbers Racket costs $150 and
   * pays $360 DIRTY over six rounds, which at the base 25% haircut is $270 laundered —
   * so the honest figure is $270, not $360. Simulation put the gap between correct and
   * naive underworld play at about $1,290, and it exists almost entirely because players
   * read the dirty number.
   */
  await expect(numbers).toContainText('$270')
  await expect(numbers).toContainText('$360 dirty')
  await expect(numbers).toContainText('+$120')

  await expect(table.players.P1.getByText(/Ventures are paid for in clean cash/)).toBeVisible()
})

test('a rent-driven venture is priced off the player\'s own board traffic', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  // Escort Service pays a share of rent CHARGED on the player's own deeds, so a player
  // who has just given every deed away earns nothing from it.
  const state = await table.state()
  const owned = Object.values(state.deeds).filter((d) => d.owner === 'P3').map((d) => d.id)
  await table.api({
    type: 'TradeAssets', from: 'P3', to: 'P4',
    deedsFrom: owned, deedsTo: [], cashFrom: 0, cashTo: 1, confirmedBy: ['P3', 'P4'],
  })

  const escort = table.players.P3.locator('[data-venture="escort"]')
  await expect(escort).toContainText('$0 dirty')
  await expect(escort).toContainText('−$150')
})

test('the margin-call warnings fire before and after the call', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const page = table.players.P1
  const state = await table.state()
  const base = Object.values(state.deeds)
    .filter((d) => d.owner === 'P1' && !d.mortgaged)
    .reduce((total, d) => total + Math.floor(d.faceValue * 0.75), 0)

  // Drawn to the limit but not over it: the warning is about what mortgaging WOULD do.
  await table.api({ type: 'DrawCredit', player: 'P1', amount: base })
  await expect(page.locator('[data-warning^="mortgage-triggers-margin-call"]').first())
    .toContainText(/triggers a margin call/)

  // Then over it, and the warning changes to the call itself.
  const biggest = Object.values(state.deeds)
    .filter((d) => d.owner === 'P1')
    .sort((a, b) => b.faceValue - a.faceValue)[0]
  await table.api({ type: 'MortgageDeed', player: 'P1', deed: biggest?.id ?? '' })
  await expect(page.locator('[data-warning="margin-call-open"]'))
    .toContainText(/over your borrowing base/)
})

test('the audit warning quotes a real probability once audits are live', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')
  await table.api({ type: 'LaunchVenture', player: 'P2', venture: 'chop-shop', fundedFrom: 'clean' })

  // Heat 3 before round 13: no audit warning, because audits cannot fire yet.
  await expect(table.players.P2.locator('[data-warning="audit-probability"]')).toHaveCount(0)

  while ((await table.state()).round < 13) await playRound(table)
  await advanceTo(table, 'open')
  await table.api({ type: 'LaunchVenture', player: 'P2', venture: 'numbers', fundedFrom: 'clean' })

  await expect(table.players.P2.locator('[data-warning="audit-probability"]'))
    .toContainText(/audit probability this round is \d+%/)
})

test('a rent future owes a make-whole, and the panel says so before it is mortgaged', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')

  const state = await table.state()
  const deed = Object.values(state.deeds)
    .find((d) => d.owner === 'P4' && d.group !== 'utility' && !d.mortgaged)
  await table.api({
    type: 'OriginateRentFuture', player: 'P4', deed: deed?.id ?? '', holder: 'P1',
    startRound: state.round + 1, endRound: state.round + 4, price: 100,
  })

  await expect(table.players.P4.locator('[data-warning^="mortgage-owes-make-whole"]').first())
    .toContainText(/make them whole/)
})

test('the credit gauge and the net-worth breakdown agree with the server', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'open')
  await table.api({ type: 'DrawCredit', player: 'P1', amount: 300 })

  const page = table.players.P1
  await expect(page.getByRole('meter', { name: /drawn against borrowing base/ })).toBeVisible()
  await expect(page.getByText('Drawn', { exact: true }).locator('..')).toContainText('$300')

  const state = await table.state()
  // Drawn credit is a deduction, so the breakdown shows it negative.
  await expect(page.getByText('Drawn credit', { exact: true }).locator('..'))
    .toContainText('−$300')
  expect(state.players.P1.drawnCredit).toBe(300)
})
