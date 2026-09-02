import { expect, type Page, test } from '@playwright/test'

import { signUp } from './support/session'

const THREAD = '/thread/4-welcome-to-the-forum'

function thanks(page: Page) {
  return page
    .locator('article')
    .first()
    .getByRole('button', { name: /Thanks|Thanked/ })
}

test('thanks toggles in place, without navigating away from the thread', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await signUp(page, 'jsthanks')
  await page.goto(THREAD)
  const before = page.url()

  const button = thanks(page)
  await expect(button).toHaveText(/Thanks/)
  await expect(button).toHaveAttribute('aria-pressed', 'false')

  await button.click()

  await expect(thanks(page)).toHaveText(/Thanked/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(thanks(page)).toContainText('1')
  expect(page.url()).toBe(before)

  await thanks(page).click()
  await expect(thanks(page)).toHaveText(/Thanks/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'false')
  expect(page.url()).toBe(before)

  expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([])
  await page.waitForLoadState('load')
})

test('a poll vote swaps in the results without navigating', async ({ page }) => {
  await signUp(page, 'jspoll')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `JS poll ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Vote below, with JavaScript on.')
  await page.getByText('Add a poll').click()
  await page.getByLabel('Question').fill('Ship it?')
  await page.getByLabel('Option 1').fill('Yes')
  await page.getByLabel('Option 2').fill('No')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  const poll = page.getByRole('region', { name: 'Poll' })
  await expect(poll.getByText('Yes (0)')).toBeVisible()

  await poll.getByLabel('Yes (0)').check()
  await poll.getByRole('button', { name: 'Vote' }).click()

  await expect(poll.getByText('Yes (1)')).toBeVisible()
  await expect(poll.getByRole('button', { name: 'Vote' })).toHaveCount(0)
  await expect(poll.getByText('1 vote')).toBeVisible()
  expect(page.url()).toBe(threadUrl)

  await page.waitForLoadState('load')
})

test('following a thread flips the button in place', async ({ page }) => {
  await signUp(page, 'jsfollow')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `JS follow ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Follow this thread with JavaScript on.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop following' })).toBeVisible()
  expect(page.url()).toBe(threadUrl)

  await page.getByRole('button', { name: 'Stop following' }).click()
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  expect(page.url()).toBe(threadUrl)

  await page.waitForLoadState('load')
})

test('the scheme toggle applies immediately and survives a reload', async ({ page }) => {
  await page.goto('/')

  const strip = page.getByRole('region', { name: 'Appearance' })
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)

  await strip.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  await expect
    .poll(
      async () => (await page.context().cookies()).find((c) => c.name === 'meith_scheme')?.value,
    )
    .toBe('dark')
  await page.waitForLoadState('networkidle')

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  await strip.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)
  await page.waitForLoadState('networkidle')

  await page.waitForLoadState('load')
})
