import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

const BACKUP_KEY = 'meith:composer:new-thread:200'

test('posting a thread clears the browser copy, so the next one starts empty', async ({ page }) => {
  test.setTimeout(60_000)

  await signUp(page, 'drafter')

  await page.goto('/200-general/new')

  const title = `A thread that autosaved ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('This one was autosaved before it was posted.')

  await expect(page.getByText('Saved just now.')).toBeVisible()
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY))
    .not.toBeNull()

  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY)).toBeNull()

  await page.goto('/200-general/new')

  await expect(page.getByLabel('Subject')).toHaveValue('')
  await expect(
    page.getByText('A newer unsent version was recovered from this browser.'),
  ).toHaveCount(0)
})
