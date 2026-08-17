import { expect, type Page, test } from '@playwright/test'

import { STAFF } from './support/config'
import { enterAdminPanel, signUp } from './support/session'

async function filterPatterns(page: Page): Promise<string[]> {
  return page
    .locator('input[name="pattern"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

test('a word filter added in the panel is in the list without a reload', async ({ page }) => {
  await enterAdminPanel(page)

  const word = `frobnicate${Date.now().toString(36)}`
  await page.goto('/admin/content')

  const composer = page.locator('form').filter({ hasText: 'Blank removes the word' })
  await composer.getByLabel('Match').fill(word)
  await composer.getByLabel('Show instead').fill('tinker')
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Added.')).toBeVisible()

  await expect.poll(() => filterPatterns(page), { timeout: 15_000 }).toContain(word)
})

test('a token issued and then revoked is listed and then marked, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const name = `e2e live ${Date.now().toString(36)}`
  await page.goto('/admin/api-tokens')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('checkbox', { name: 'forums:read', exact: true }).check()
  await page.getByRole('button', { name: 'Issue token' }).click()

  await expect(page.getByText('Copy this now')).toBeVisible()
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText('live')

  await row.getByRole('button', { name: /Revoke/ }).click()

  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('revoked', {
    timeout: 15_000,
  })
})

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

  const titles = () =>
    page
      .locator('input[name="title"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))

  await expect.poll(titles, { timeout: 15_000 }).toContain(title)

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

test('a member banned in the panel is shown as banned, without a reload', async ({
  page,
  browser,
}) => {
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  try {
    const username = await signUp(memberPage, 'live_ban')

    await enterAdminPanel(page)
    await page.goto('/admin/users')
    await page.getByLabel('Username contains').fill(username)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('link', { name: `Edit ${username}` }).click()

    await page.getByLabel('Length in days').fill('3')
    await page.getByLabel('Staff note').fill('Banned by the browser suite.')
    await page.getByRole('button', { name: 'Ban this member' }).click()

    await expect(page.getByText(/^Banned until/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Staff note: Banned by the browser suite.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lift this ban' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ban this member' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Lift this ban' }).click()
    await expect(page.getByRole('button', { name: 'Ban this member' })).toBeVisible({
      timeout: 15_000,
    })

    await page.getByLabel('Username').fill(`${username}x`)
    await page.getByRole('button', { name: 'Save account' }).click()
    await expect(page.getByRole('heading', { name: `${username}x`, level: 1 })).toBeVisible({
      timeout: 15_000,
    })
  } finally {
    await memberContext.close()
  }
})

test('a moderator appointed and then removed is listed and unlisted, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/forums')
  await page.getByRole('link', { name: 'Options for Off Topic' }).click()

  const appoint = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save appointment' }) })
  await appoint.getByLabel('Member').fill(STAFF.moderator.username)
  await appoint.getByRole('checkbox', { name: 'Stick threads' }).check()
  await appoint.getByRole('button', { name: 'Save appointment' }).click()

  const listed = page.locator('li').filter({ hasText: STAFF.moderator.username })
  await expect(listed).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Nobody moderates this forum.')).toHaveCount(0)

  await listed.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Nobody moderates this forum.')).toBeVisible({ timeout: 15_000 })
})

test('a theme turned off is marked off, without a reload', async ({ page }) => {
  await enterAdminPanel(page)
  await page.goto('/admin/themes')

  try {
    await page.getByRole('button', { name: 'Turn Midnight off' }).click()
    await expect(page.getByRole('button', { name: 'Turn Midnight on' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('li').filter({ hasText: 'midnight ·' })).toContainText('Off')
  } finally {
    await page.goto('/admin/themes')
    if ((await page.getByRole('button', { name: 'Turn Midnight on' }).count()) > 0) {
      await page.getByRole('button', { name: 'Turn Midnight on' }).click()
    }
  }

  await expect(page.getByRole('button', { name: 'Turn Midnight off' })).toBeVisible({
    timeout: 15_000,
  })
})

test('the search-index count agrees with the button that changed it, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/system')

  const line = page.locator('p:not([role="status"])').filter({ hasText: /\d+ indexed/ })
  const pending = Number(/(\d+) not yet searchable/.exec(await line.innerText())?.[1] ?? '0')

  expect(pending, 'the seeded board has posts that are not yet searchable').toBeGreaterThan(0)

  await page.getByRole('button', { name: `Index the next batch of ${pending}` }).click()
  await expect(page.getByText(/Every post on the board is searchable\./)).toBeVisible()

  await expect(line).not.toContainText('not yet searchable', { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Nothing to index' })).toBeVisible()
})

test('saving the board address takes the warning off the settings screen, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/settings?group=board')

  const alert = page.getByText('This board does not know its own address')
  await expect(alert, 'the e2e board runs with no APP_URL, so the alert is up').toBeVisible()

  await page.getByLabel('Board address').fill('http://127.0.0.1:3001')
  await page.getByRole('button', { name: 'Save settings' }).click()

  await expect(alert).toHaveCount(0, { timeout: 15_000 })

  await page.getByLabel('Board address').fill('')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(alert).toBeVisible({ timeout: 15_000 })
})
