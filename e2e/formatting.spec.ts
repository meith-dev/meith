import { expect, test } from '@playwright/test'

import { samplePng } from './support/png'
import { signUp } from './support/session'

test('typing @ opens mention suggestions, and picking one inserts the name', async ({
  page,
  browser,
}) => {
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
  await message.fill('hi ')
  const queryPrefix = targetUsername.slice(0, 6)
  const lastQueryChar = queryPrefix.slice(-1)
  await message.pressSequentially(`@${queryPrefix}`)

  const suggestion = page.getByRole('option', { name: `@${targetUsername}` })
  await expect(async () => {
    if (await suggestion.isVisible()) return
    await message.press('Backspace')
    await message.pressSequentially(lastQueryChar)
    await expect(suggestion).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })
  await suggestion.click()

  await expect(message).toHaveValue(`hi @${targetUsername} `)
})

test('the "Insert attachment" toolbar button uploads and places [attachment=id]', async ({
  page,
}) => {
  test.setTimeout(60_000)

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
  await expect(message).toHaveValue(/Look at this:\[attachment=\d+\]/, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/, { timeout: 15_000 })
  await expect(page.locator('article .md-attachment')).toBeVisible()
})
