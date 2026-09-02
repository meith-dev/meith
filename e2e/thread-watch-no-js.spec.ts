import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('the header watch toggle follows and unfollows a thread with JavaScript off', async ({
  page,
}) => {
  await signUp(page, 'watch')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Watched from the header ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Not subscribed from the composer this time.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await expect(page.getByRole('button', { name: 'Watch', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Watch', exact: true }).click()
  await expect(page).toHaveURL(threadUrl)
  await expect(page.getByRole('button', { name: 'Watching' })).toBeVisible()

  await page.goto('/subscriptions')
  await expect(page.locator('li', { hasText: title })).toBeVisible()

  await page.goto(threadUrl)
  await page.getByRole('button', { name: 'Watching' }).click()
  await expect(page).toHaveURL(threadUrl)
  await expect(page.getByRole('button', { name: 'Watch', exact: true })).toBeVisible()

  await page.goto('/subscriptions')
  await expect(page.getByText('You are not following anything yet.')).toBeVisible()
})
