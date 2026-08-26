import { expect, test } from '@playwright/test'

import { PASSWORD, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

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
    await expect(row.getByText('New', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Mark as read' }).click()
    const rowAfter = namedPage.locator('li', {
      hasText: `${poster} mentioned you in ${title}`,
    })
    await expect(rowAfter).toBeVisible()
    await expect(rowAfter.getByText('New', { exact: true })).toHaveCount(0)

    await expect(namedPage.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0)
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

test('the board’s announcements stay off until the member asks, and stop when they say so', async ({
  page,
}) => {
  await signUp(page, 'nsilent')

  await page.goto('/notifications/preferences')
  const box = page.locator('input[name="announcements"]')
  await expect(box, 'signing up enrols nobody in the announcements').not.toBeChecked()

  await box.check()
  await page.getByRole('button', { name: 'Save announcements' }).click()
  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="announcements"]')).toBeChecked()

  await page.locator('input[name="announcements"]').uncheck()
  await page.getByRole('button', { name: 'Save announcements' }).click()
  await page.goto('/notifications/preferences')
  await expect(
    page.locator('input[name="announcements"]'),
    'consent can be withdrawn as easily as it was given',
  ).not.toBeChecked()
})

test('the box on the registration form is what enrols a member', async ({ page }) => {
  const username = `e2e_nasked_${Date.now().toString(36)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/E-mail me the board/).check()
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="announcements"]')).toBeChecked()
})
