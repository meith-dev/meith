import { expect, test } from '@playwright/test'

import { samplePng } from './support/png'
import { signUp } from './support/session'

test('the formatting toolbar sits below the subject, joined to the message box', async ({
  page,
}) => {
  test.setTimeout(60_000)

  await signUp(page, 'toolbarplacement')

  await page.goto('/200-general/new')

  const subject = page.getByLabel('Subject')
  const toolbar = page.getByRole('group', { name: 'Formatting' })
  const message = page.getByLabel('Message')

  await expect(toolbar).toBeVisible()

  const subjectBox = await subject.boundingBox()
  const toolbarBox = await toolbar.boundingBox()
  const messageBox = await message.boundingBox()
  if (subjectBox === null || toolbarBox === null || messageBox === null) {
    throw new Error('composer fields have no layout box')
  }

  expect(
    toolbarBox.y,
    'toolbar is below the subject field, not at the top of the card',
  ).toBeGreaterThan(subjectBox.y + subjectBox.height)

  const gap = messageBox.y - (toolbarBox.y + toolbarBox.height)
  expect(
    gap,
    'toolbar is joined to the message box, with no field between them',
  ).toBeLessThanOrEqual(2)
})

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

test('the quick reply carries the same toolbar, joined to its message box', async ({ page }) => {
  test.setTimeout(60_000)

  await signUp(page, 'qrtb')

  await page.goto('/200-general/new')
  await page.getByLabel('Subject').fill(`Quick reply host ${Date.now()}`)
  await page.getByLabel('Message').fill('A thread to reply under.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/, { timeout: 15_000 })

  await page.getByText('Write a reply', { exact: true }).click()

  const toolbar = page.getByRole('group', { name: 'Formatting' })
  const message = page.getByLabel('Message')
  await expect(toolbar).toBeVisible()

  const toolbarBox = await toolbar.boundingBox()
  const messageBox = await message.boundingBox()
  if (toolbarBox === null || messageBox === null) {
    throw new Error('quick reply fields have no layout box')
  }

  expect(toolbarBox.y, 'toolbar sits above the message box').toBeLessThan(messageBox.y)
  const gap = messageBox.y - (toolbarBox.y + toolbarBox.height)
  expect(gap, 'toolbar is joined to the message box').toBeLessThanOrEqual(2)
})
