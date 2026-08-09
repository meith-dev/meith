/**
 * The control panel **with JavaScript on** — the only spec on this board that
 * runs that way, and it exists because of what the others cannot see.
 *
 * Every other spec here disables scripting, deliberately: the board's claim is
 * that a native `<form>` does the work and the islands are optional, so a suite
 * that tested the enhanced path would prove the opposite of what is claimed.
 *
 * The cost of that discipline is a real blind spot, and this file is it. With
 * scripting off a form post is a full navigation, so the page the operator lands
 * on is freshly rendered **whatever the action did about caching**. With
 * scripting on — which is how an administrator actually uses the panel — the
 * action returns into a page that keeps the RSC payload it was rendered with,
 * and a list that its own action just changed goes stale unless the action says
 * `revalidatePath`.
 *
 * That is not hypothetical. The 7 August 2026 audit found it on `/admin/forums`
 * and `/admin/groups` and fixed both; the same defect was still on the content
 * screens and on API tokens, and nothing could have caught it, because the only
 * browser coverage the panel has runs in the one mode where the bug is
 * invisible. Issuing a token showed the secret above a table that did not
 * contain it, and revoking one left the row reading **live** — the last thing an
 * operator containing a leak should be shown.
 *
 * ## Reading these assertions
 *
 * A list row is often an **edit form**, so what it holds is an `<input value>`
 * rather than text. `innerText` does not see an input's value; measuring these
 * screens with it reports every list as empty and every fix as a failure. The
 * helpers below read values where values are what there is.
 */
import { expect, test, type Page } from '@playwright/test'

import { enterAdminPanel } from './support/session'

/** The patterns the word-filter list currently holds, from its edit forms. */
async function filterPatterns(page: Page): Promise<string[]> {
  return page
    .locator('input[name="pattern"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

test('a word filter added in the panel is in the list without a reload', async ({ page }) => {
  await enterAdminPanel(page)

  const word = `frobnicate${Date.now().toString(36)}`
  await page.goto('/admin/content')

  /*
   * Scoped by the hint only the new-filter form carries: every existing filter
   * renders an edit form with the same field names.
   */
  const composer = page.locator('form').filter({ hasText: 'Blank removes the word' })
  await composer.getByLabel('Match').fill(word)
  await composer.getByLabel('Show instead').fill('tinker')
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  /* The action reports success… */
  await expect(page.getByText('Added.')).toBeVisible()

  /* …and the list is the thing that has to agree with it. */
  await expect.poll(() => filterPatterns(page), { timeout: 15_000 }).toContain(word)
})

/**
 * The token table, which is the one that mattered most.
 *
 * Both halves in one test because they are one journey and the second is only
 * meaningful after the first: a token appears when it is issued, and its state
 * changes when it is revoked, on a screen nobody reloaded.
 */
test('a token issued and then revoked is listed and then marked, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const name = `e2e live ${Date.now().toString(36)}`
  await page.goto('/admin/api-tokens')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('checkbox', { name: 'forums:read', exact: true }).check()
  await page.getByRole('button', { name: 'Issue token' }).click()

  /* The secret, and the row it belongs to, on the same screen. */
  await expect(page.getByText('Copy this now')).toBeVisible()
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText('live')

  await row.getByRole('button', { name: /Revoke/ }).click()

  /*
   * The state word, not the button: "Revoke" is on the row either way, and a
   * row that still says "live" after a revoke is precisely the failure — an
   * operator is reading this table to confirm that a leaked token is dead.
   */
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('revoked', {
    timeout: 15_000,
  })
})

/**
 * An announcement, which is the third screen with the same shape.
 *
 * Included rather than trusted-by-analogy: the three screens are three action
 * modules, and "the fix was applied to all of them" is the kind of claim that is
 * true when it is written and false a release later.
 */
test('an announcement added in the panel is in the list without a reload', async ({ page }) => {
  await enterAdminPanel(page)

  const title = `Live notice ${Date.now().toString(36)}`
  await page.goto('/admin/content/announcements')

  const composer = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
  await composer.getByLabel('Title').fill(title)
  await composer.getByLabel('Message').fill('Written with the scripts running.')
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  /* Its edit form is the list entry, so the title is a value rather than text. */
  const titles = () =>
    page
      .locator('input[name="title"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))

  await expect.poll(titles, { timeout: 15_000 }).toContain(title)

  /*
   * Taken down again. A board-wide announcement renders above the listings on
   * the index and on every forum page, so leaving one behind changes what every
   * later spec in the run sees — and the suite shares one database.
   */
  const row = page.locator(`input[name="title"][value="${title}"]`)
  const announcementId = await page
    .locator('form')
    .filter({ has: row })
    .locator('input[name="id"]')
    .inputValue()

  await page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${announcementId}"]`) })
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await expect.poll(titles, { timeout: 15_000 }).not.toContain(title)
})
