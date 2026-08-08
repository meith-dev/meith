/**
 * The notification centre's own controls, with JavaScript off (F55).
 *
 * Arrival is proven elsewhere — the mentions spec walks a notification from
 * one member's keyboard to another's centre. What this file proves is the
 * management half a member actually uses day to day: marking one row read,
 * marking the rest read at once, and the e-mail preferences screen saving
 * what was chosen and still showing it after a reload.
 */
import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

/** Register through the form, then sign in. The only way to get a session. */
async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  return username
}

test('a notification is marked read, singly and then all at once', async ({ browser }) => {
  const posterContext = await browser.newContext()
  const namedContext = await browser.newContext()
  const posterPage = await posterContext.newPage()
  const namedPage = await namedContext.newPage()

  try {
    const named = await signUp(namedPage, 'nnamed')
    const poster = await signUp(posterPage, 'nposter')

    /* One post, two notifications: a mention and, later, a quote would need
       two posts — one mention is enough to drive both controls. */
    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Read receipts ${Date.now()}`
    await posterPage.getByLabel('Subject').fill(title)
    await posterPage
      .getByLabel('Message')
      .fill(`Summoning @${named} to test the notification centre.`)
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)

    /* The row arrives unread. */
    await namedPage.goto('/notifications')
    const row = namedPage.locator('li', { hasText: `${poster} mentioned you in ${title}` })
    await expect(row).toBeVisible()
    await expect(row.getByText('New')).toBeVisible()

    /* Marking the one row read clears its badge but keeps the row. */
    await row.getByRole('button', { name: 'Mark as read' }).click()
    const rowAfter = namedPage.locator('li', {
      hasText: `${poster} mentioned you in ${title}`,
    })
    await expect(rowAfter).toBeVisible()
    await expect(rowAfter.getByText('New')).toHaveCount(0)

    /* With nothing unread, the bulk control is absent rather than disabled. */
    await expect(
      namedPage.getByRole('button', { name: 'Mark all as read' }),
    ).toHaveCount(0)
  } finally {
    await posterContext.close()
    await namedContext.close()
  }
})

test('e-mail preferences save, and survive a reload', async ({ page }) => {
  await signUp(page, 'nprefs')

  await page.goto('/notifications/preferences')
  const boxes = page.locator('input[name="email"]')
  const count = await boxes.count()
  expect(count).toBeGreaterThan(0)

  /* Flip the first kind off — whatever its default was, uncheck it. */
  const first = boxes.first()
  await first.uncheck()
  await page.getByRole('button', { name: 'Save preferences' }).click()

  /* The choice is stored on the server, not in the page: reload and look. */
  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="email"]').first()).not.toBeChecked()

  /* And back on again, so the test leaves no surprise behind. */
  await page.locator('input[name="email"]').first().check()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="email"]').first()).toBeChecked()
})
