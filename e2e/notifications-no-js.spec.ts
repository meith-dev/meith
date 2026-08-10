import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

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

    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Read receipts ${Date.now()}`
    await posterPage.getByLabel('Subject').fill(title)
    await posterPage
      .getByLabel('Message')
      .fill(`Summoning @${named} to test the notification centre.`)
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)

    await namedPage.goto('/notifications')
    const row = namedPage.locator('li', { hasText: `${poster} mentioned you in ${title}` })
    await expect(row).toBeVisible()
    await expect(row.getByText('New')).toBeVisible()

    await row.getByRole('button', { name: 'Mark as read' }).click()
    const rowAfter = namedPage.locator('li', {
      hasText: `${poster} mentioned you in ${title}`,
    })
    await expect(rowAfter).toBeVisible()
    await expect(rowAfter.getByText('New')).toHaveCount(0)

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

  const first = boxes.first()
  await first.uncheck()
  await page.getByRole('button', { name: 'Save preferences' }).click()

  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="email"]').first()).not.toBeChecked()

  await page.locator('input[name="email"]').first().check()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="email"]').first()).toBeChecked()
})
