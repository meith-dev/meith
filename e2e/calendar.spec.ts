import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('RSVP changes and clears one occurrence without JavaScript', async ({ page }) => {
  await signUp(page, 'calendar')
  await page.goto('/plugins/calendar?event=1&occurrence=2026-09-07')
  await expect(
    page.getByRole('heading', { name: 'E2E recurring training', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(page.getByText('Your response: Yes', { exact: true })).toBeVisible()
  await expect(page.getByText('Yes: 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Maybe', exact: true }).click()
  await expect(page.getByText('Yes: 0', { exact: true })).toBeVisible()
  await expect(page.getByText('Maybe: 1', { exact: true })).toBeVisible()
  await page.goto('/plugins/calendar?event=1&occurrence=2026-09-14')
  await expect(page.getByText('Your response: No response', { exact: true })).toBeVisible()
  await page.goto('/plugins/calendar?event=1&occurrence=2026-09-07')
  await page.getByRole('button', { name: 'Clear response', exact: true }).click()
  await expect(page.getByText('Maybe: 0', { exact: true })).toBeVisible()
  await expect(page.getByText('Your response: No response', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Responses', exact: true })).toHaveCount(0)
})
