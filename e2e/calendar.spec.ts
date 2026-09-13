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

test('calendar pages advance and return without JavaScript', async ({ page }) => {
  await page.goto('/plugins/calendar')
  const occurrences = page.locator('a[href*="?event=1&occurrence="]')
  const firstPage = await occurrences.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  )
  expect(firstPage).toHaveLength(50)
  await page.getByRole('link', { name: 'Next page', exact: true }).click()
  const secondPage = await occurrences.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  )
  expect(secondPage).toHaveLength(50)
  expect(secondPage.some((href) => firstPage.includes(href))).toBe(false)
  await page.getByRole('link', { name: 'Previous page', exact: true }).click()
  await expect(occurrences).toHaveCount(50)
  expect(
    await occurrences.evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual(firstPage)
  await expect(page.getByRole('link', { name: 'Previous page', exact: true })).toHaveCount(0)
})
