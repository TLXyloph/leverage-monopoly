import { advanceTo, draftThroughApi, expect, playRound, test } from './fixtures.ts'

/**
 * **Does every era-gated instrument actually become usable in its era?**
 *
 * The E2E brief names this specifically, because the Era II stimulus was implemented,
 * unit-tested, reviewed, approved — and never fired, for nine tasks. It was found only
 * when a generator drove complete games. A locked button that never unlocks is the same
 * defect wearing a different costume, so the test plays to the era and looks.
 */

test('Era I offers exactly the four instruments it should, and says when the rest arrive', async ({ table }) => {
  await draftThroughApi(table)
  await advanceTo(table, 'open')
  const page = table.players.P1

  for (const id of ['draw-credit', 'build-house', 'mortgage', 'trade']) {
    await expect(page.locator(`[data-action="${id}"]`)).toBeVisible()
  }
  // Era II and III instruments are absent as controls...
  for (const id of ['lend', 'launch-venture', 'launder', 'create-pool', 'write-swap']) {
    await expect(page.locator(`[data-action="${id}"]`)).toHaveCount(0)
  }
  // ...but visible as a locked list, with the era they arrive in, so a player can plan.
  await expect(page.locator('[data-locked-action="lend"]')).toContainText('era 2')
  await expect(page.locator('[data-locked-action="create-pool"]')).toContainText('era 3')
})

test('Era II lands the stimulus and unlocks the underworld and peer credit', async ({ table }) => {
  await draftThroughApi(table)
  for (let round = 1; round <= 6; round += 1) await playRound(table)

  const entering = await table.state()
  expect(entering.round).toBe(7)
  expect(entering.era).toBe(2)

  /**
   * Spec section 4: the stimulus advances at the START of round 7, as an interest-bearing
   * loan rather than a grant. Asserted from the LOG of a driven game, not from a unit
   * test, because a unit test proves the function works and not that anything calls it.
   */
  const stimulus = (await table.log()).filter((e) => e.type === 'StimulusAdvanced')
  expect(stimulus).toHaveLength(4)

  await advanceTo(table, 'open')
  const page = table.players.P1
  for (const id of ['lend', 'originate-future', 'launch-venture', 'launder', 'bribe']) {
    await expect(page.locator(`[data-action="${id}"]`)).toBeVisible()
  }
  await expect(page.locator('[data-locked-action="create-pool"]')).toContainText('era 3')
})

test('Era III unlocks securitization, options and insider trading, and starts audits', async ({ table }) => {
  await draftThroughApi(table)
  for (let round = 1; round <= 12; round += 1) await playRound(table)

  const entering = await table.state()
  expect(entering.round).toBe(13)
  expect(entering.era).toBe(3)

  await advanceTo(table, 'open')
  const page = table.players.P1
  for (const id of ['create-pool', 'sell-tranche', 'write-swap', 'write-option', 'insider-trade']) {
    await expect(page.locator(`[data-action="${id}"]`)).toBeVisible()
  }
  // Nothing is left locked once Era III opens — Era IV adds no new instrument.
  await expect(page.locator('[data-locked-action]')).toHaveCount(0)

  /**
   * Audits begin in round 13. The facilitator's roll panel is the control that makes
   * them happen, and it only appears for players actually carrying Heat — so buy some.
   */
  await table.api({ type: 'LaunchVenture', player: 'P2', venture: 'numbers', fundedFrom: 'clean' })
  await expect(table.admin.getByText('Audit rolls')).toBeVisible()
  await expect(table.admin.getByLabel('P2 audit die 1')).toBeVisible()
})

test('an audit seizes the dirty cash it was rolled against', async ({ allInstruments }) => {
  const table = allInstruments
  await draftThroughApi(table)
  await advanceTo(table, 'open')
  await table.api({ type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean' })

  while ((await table.state()).round < 13) await playRound(table)

  await advanceTo(table, 'open')
  await table.api({ type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'clean' })
  const loaded = await table.state()
  expect(loaded.players.P1.dirtyCash).toBeGreaterThan(0)

  // A 2d6 total at or below Heat is an audit; [1,1] cannot miss.
  await advanceTo(table, 'settlement')
  await table.api({
    type: 'settle',
    auditDice: { P1: [1, 1], P2: [6, 6], P3: [6, 6], P4: [6, 6] },
  })

  const audited = await table.state()
  expect(audited.players.P1.dirtyCash).toBe(0)
  expect(audited.players.P1.heat).toBe(0)

  const log = await table.log()
  expect(log.some((e) => e.type === 'AuditResolved')).toBe(true)
  // And the player's own view says so, because every client reads the one payload.
  await expect(table.players.P1.locator('[data-figure="dirty-cash"]')).toContainText('$0')
})
