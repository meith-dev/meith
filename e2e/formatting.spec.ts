import { expect, test } from '@playwright/test'

import { samplePng } from './support/png'
import { signUp } from './support/session'

test('typing @ opens mention suggestions, and picking one inserts the name', async ({
  page,
  browser,
}) => {
  // e2e runs against `next dev`, and this is the only test that exercises the
  // mention-search server action: its first invocation always pays a dev-server
  // JIT compile, which can push well past the default 5s/30s budgets.
  test.setTimeout(60_000)

  const targetContext = await browser.newContext()
  const targetPage = await targetContext.newPage()
  const targetUsername = await signUp(targetPage, 'mentionable')
  await targetContext.close()

  await signUp(page, 'mentioner')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  await expect(page.getByRole('group', { name: 'Formatting' })).toBeVisible()

  const message = page.getByLabel('Message')
  await message.fill(`hi @${targetUsername.slice(0, 6)}`)

  const suggestion = page.getByRole('option', { name: `@${targetUsername}` })
  await expect(suggestion).toBeVisible({ timeout: 30_000 })
  await suggestion.click()

  await expect(message).toHaveValue(`hi @${targetUsername} `)
})

test('the "Insert attachment" toolbar button uploads and places [attachment=id]', async ({
  page,
}) => {
  await signUp(page, 'inlineattacher')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `An inline picture ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Look at this:')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Insert attachment' }).click()
  const chooser = await fileChooserPromise
  await chooser.setFiles({ name: 'inline.png', mimeType: 'image/png', buffer: samplePng() })

  const message = page.getByLabel('Message')
  await expect(message).toHaveValue(/Look at this:\[attachment=\d+\]/)

  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)
  await expect(page.locator('article .md-attachment')).toBeVisible()
})
