import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.describe('a reader in Tokyo', () => {
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('sees the board in their own zone without asking for it', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Times are shown in Asia/Tokyo')).toBeVisible()

    const jar = await page.context().cookies()
    expect(jar.find((cookie) => cookie.name === 'meith_tz')?.value).toBe('Asia/Tokyo')
  })

  test('keeps the zone they chose for themselves', async ({ page }) => {
    await signUp(page, 'zoned')

    await page.goto('/usercp/options')
    await page.getByLabel('Timezone').selectOption('America/New_York')
    await page.getByRole('button', { name: 'Save options' }).click()

    await page.goto('/')
    await expect(page.getByText('Times are shown in America/New York')).toBeVisible()

    await page.goto('/usercp/options')
    await page.getByLabel('Timezone').selectOption('auto')
    await page.getByRole('button', { name: 'Save options' }).click()

    await page.goto('/')
    await expect(page.getByText('Times are shown in Asia/Tokyo')).toBeVisible()
  })
})

test.describe('a reader with no JavaScript', () => {
  test.use({ javaScriptEnabled: false, timezoneId: 'Asia/Tokyo' })

  test('is shown UTC, and is told which zone it is', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Times are shown in UTC')).toBeVisible()
  })
})
