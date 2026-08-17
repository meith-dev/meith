import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test('multi-quote says what is selected, clears it, and fills the reply', async ({ page }) => {
  await signUp(page, 'multiquoter')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `Multi-quote ${Date.now().toString(36)}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('The first post, worth quoting.')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await page.goto(`${threadUrl}/reply`)
  await page.getByLabel('Message').fill('The second post, also worth quoting.')
  await page.getByRole('button', { name: 'Post reply' }).click()
  await expect(page).toHaveURL(/#post-\d+$/)

  const announced = page.locator('p.sr-only[role="status"]')
  const buttons = page.getByRole('button', { name: 'Multi-quote' })
  await expect(buttons).toHaveCount(2)

  await buttons.nth(0).click()
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('1 post selected to quote')).toBeVisible()

  await buttons.nth(1).click()
  await expect(page.getByText('2 posts selected to quote')).toBeVisible()
  await expect(announced).toHaveText('Added to multi-quote — 2 posts selected.')

  await buttons.nth(0).click()
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(announced).toHaveText('Removed from multi-quote — 1 post selected.')

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByText('selected to quote')).toHaveCount(0)
  await expect(announced).toHaveText('Multi-quote cleared — nothing selected.')
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'false')

  await buttons.nth(0).click()
  await buttons.nth(1).click()
  await page.getByRole('button', { name: 'Add to reply' }).click()

  await expect(announced).toHaveText('2 quotes added to your reply.')
  await expect(page.getByText('selected to quote')).toHaveCount(0)
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false')

  const message = page.getByLabel('Message')
  await expect(message).toHaveValue(/The first post, worth quoting\./)
  await expect(message).toHaveValue(/The second post, also worth quoting\./)
})

test('a selection made on a thread page is carried to the reply page', async ({ page }) => {
  await signUp(page, 'multicarrier')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `Multi-quote carried ${Date.now().toString(36)}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('A post to carry across a navigation.')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await page.getByRole('button', { name: 'Multi-quote' }).first().click()
  await expect(page.getByText('1 post selected to quote')).toBeVisible()

  await page.goto(`${threadUrl}/reply`)

  const message = page.getByLabel('Message')
  await expect(message).toHaveValue(/A post to carry across a navigation\./)
  await expect(page.getByText('selected to quote')).toHaveCount(0)
})
