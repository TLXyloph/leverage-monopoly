import { advanceTo, expect, test } from './fixtures.ts'

/**
 * Switching who the facilitator is acting as has to actually switch the panels.
 *
 * Reported from a real game night: open P1, open the console, shuffle, open P2, submit
 * P2's draft from their phone, then try to switch the console to P2 — and nothing
 * appears to happen.
 */

test('switching the acting player switches every panel with it', async ({ table }) => {
  for (const era of [1, 2, 3, 4] as const) {
    await table.api({ type: 'ShuffleDeck', era, order: Array.from({ length: 20 }, (_, i) => i) })
  }
  await table.api({ type: 'advance-phase' })

  const admin = table.admin
  const selector = admin.getByLabel('acting player')
  await expect(admin.locator('[data-draft-form]')).toBeVisible()

  // P2 submits from their own phone, exactly as at the table.
  const p2 = table.players.P2
  await expect(p2.locator('[data-draft-form]')).toBeVisible()
  await p2.locator('[data-submit-draft]').click()
  await expect(p2.getByText(/Submitted\. Waiting for the rest/)).toBeVisible()

  // The console is still on P1, who has not submitted, so it still shows a form.
  await expect(selector).toHaveValue('P1')
  await expect(admin.locator('[data-draft-form]')).toBeVisible()

  // Switching to P2 must show P2's state — submitted — not P1's form.
  await selector.selectOption('P2')
  await expect(selector).toHaveValue('P2')
  await expect(admin.getByText(/Submitted\. Waiting for the rest/)).toBeVisible()
  await expect(admin.locator('[data-draft-form]')).toHaveCount(0)

  // And back again.
  await selector.selectOption('P1')
  await expect(admin.locator('[data-draft-form]')).toBeVisible()
})

/**
 * Form state is per-player and must not follow the selector. A half-typed amount left
 * against P1 reappearing under P3's name is how a facilitator draws credit on the wrong
 * player's line — silently, because the number looks like something they typed.
 */
test('a half-filled form does not follow the facilitator to another player', async ({ table }) => {
  await table.api({ type: 'advance-phase' })
  const admin = table.admin
  const selector = admin.getByLabel('acting player')

  // Pick a distinctive deed for P1 in the draft form.
  const options = await admin.locator('[data-rank="1"] option').all()
  const values = await Promise.all(options.map((o) => o.getAttribute('value')))
  const chosen = values[3] ?? ''
  await admin.locator('[data-rank="1"]').selectOption(chosen)
  await admin.locator('[data-max-bid]').fill('777')

  await selector.selectOption('P3')
  await expect(admin.locator('[data-max-bid]')).toHaveValue('')
  await expect(admin.locator('[data-rank="1"]')).not.toHaveValue(chosen)
})
