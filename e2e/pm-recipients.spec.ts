import { expect, type Locator, type Page, test } from '@playwright/test'

import { signUp } from './support/session'

async function pickRecipient(page: Page, field: Locator, username: string): Promise<void> {
  const prefix = username.slice(0, -2)
  await field.pressSequentially(prefix)

  const option = page.getByRole('option', { name: username, exact: true })
  await expect(async () => {
    if (await option.isVisible()) return
    await field.press('Backspace')
    await field.pressSequentially(prefix.slice(-1))
    await expect(option).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  await option.click()
}

test('the To field suggests members and builds a comma-separated recipient list', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)

  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const firstPage = await firstContext.newPage()
  const secondPage = await secondContext.newPage()

  const first = await signUp(firstPage, 'pmone')
  const second = await signUp(secondPage, 'pmtwo')
  await secondContext.close()

  try {
    await signUp(page, 'pmsender')
    await page.goto('/messages/compose')

    const to = page.locator('input[name="to"]')
    await to.click()
    await pickRecipient(page, to, first)
    await expect(to).toHaveValue(`${first}, `)

    await pickRecipient(page, to, second)
    await expect(to).toHaveValue(`${first}, ${second}, `)

    const subject = `Autocompleted recipients ${Date.now()}`
    await page.getByLabel('Subject').fill(subject)
    await page.getByLabel('Message').fill('Sent to two people picked from the suggestions.')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/messages\?folder=sent&sent=1$/)

    await firstPage.goto('/messages')
    await expect(firstPage.locator('li', { hasText: subject })).toBeVisible()
  } finally {
    await firstContext.close()
  }
})

test.describe('with scripting off', () => {
  test.use({ javaScriptEnabled: false })

  test('a plain comma-separated To field still reaches every recipient', async ({ browser }) => {
    const firstContext = await browser.newContext()
    const secondContext = await browser.newContext()
    const senderContext = await browser.newContext()
    const firstPage = await firstContext.newPage()
    const secondPage = await secondContext.newPage()
    const senderPage = await senderContext.newPage()

    try {
      const first = await signUp(firstPage, 'njone')
      const second = await signUp(secondPage, 'njtwo')
      await signUp(senderPage, 'njsender')

      const subject = `No-JS recipients ${Date.now()}`
      await senderPage.goto('/messages/compose')
      await senderPage.locator('input[name="to"]').fill(`${first}, ${second}`)
      await senderPage.getByLabel('Subject').fill(subject)
      await senderPage.getByLabel('Message').fill('Typed the names in by hand, comma-separated.')
      await senderPage.getByRole('button', { name: 'Send message' }).click()
      await expect(senderPage).toHaveURL(/\/messages\?folder=sent&sent=1$/)

      await firstPage.goto('/messages')
      await expect(firstPage.locator('li', { hasText: subject })).toBeVisible()
      await secondPage.goto('/messages')
      await expect(secondPage.locator('li', { hasText: subject })).toBeVisible()
    } finally {
      await firstContext.close()
      await secondContext.close()
      await senderContext.close()
    }
  })
})
