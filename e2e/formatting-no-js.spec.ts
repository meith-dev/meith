import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a spoiler reveals with no JavaScript, because it is a native <details>', async ({ page }) => {
  await signUp(page, 'spoilerposter')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `A spoiler ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill(':::spoiler\nthe ending nobody expected\n:::')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const spoiler = page.locator('article details.md-spoiler')
  await expect(spoiler).toBeVisible()
  await expect(spoiler.locator('summary')).toHaveText('Spoiler')
  await expect(spoiler).not.toHaveJSProperty('open', true)

  await spoiler.locator('summary').click()
  await expect(spoiler).toHaveJSProperty('open', true)
  await expect(spoiler).toContainText('the ending nobody expected')
})

test('a fenced code block is highlighted server-side, with no client script', async ({ page }) => {
  await signUp(page, 'codeposter')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `Some code ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('```ts\nconst answer = 42\n```')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const code = page.locator('article pre.md-code code')
  await expect(code).toBeVisible()
  await expect(code.locator('span[style*="--shiki-light"]').first()).toBeVisible()
})
