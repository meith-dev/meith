import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  return username
}

test('a member writes a message, and the recipient reads it and replies', async ({ browser }) => {
  const senderContext = await browser.newContext()
  const recipientContext = await browser.newContext()
  const senderPage = await senderContext.newPage()
  const recipientPage = await recipientContext.newPage()

  try {
    const sender = await signUp(senderPage, 'pmsend')
    const recipient = await signUp(recipientPage, 'pmread')

    const subject = `Meet the new board ${Date.now()}`
    await senderPage.goto('/messages/compose')
    await senderPage.locator('input[name="to"]').fill(recipient)
    await senderPage.getByLabel('Subject').fill(subject)
    await senderPage.getByLabel('Message').fill('First message on this board — did it arrive?')
    await senderPage.getByRole('button', { name: 'Send message' }).click()

    await expect(senderPage).toHaveURL(/\/messages\?folder=sent&sent=1$/)
    await expect(senderPage.getByText(subject)).toBeVisible()

    await recipientPage.goto('/messages')
    const row = recipientPage.locator('li', { hasText: subject })
    await expect(row).toBeVisible()
    await expect(row.getByText('New')).toBeVisible()
    await row.getByRole('link', { name: subject }).click()
    await expect(recipientPage.getByText('did it arrive?')).toBeVisible()

    await recipientPage.getByRole('link', { name: 'Reply', exact: true }).click()
    await expect(recipientPage).toHaveURL(/\/messages\/compose\?reply=\d+$/)
    await expect(recipientPage.locator('input[name="to"]')).toHaveValue(sender)
    await expect(recipientPage.getByLabel('Subject')).toHaveValue(`Re: ${subject}`)

    await recipientPage.getByLabel('Message').fill('It arrived. Replying to prove the round trip.')
    await recipientPage.getByRole('button', { name: 'Send message' }).click()
    await expect(recipientPage).toHaveURL(/\/messages\?folder=sent&sent=1$/)

    await senderPage.goto('/messages')
    const replyRow = senderPage.locator('li', { hasText: `Re: ${subject}` })
    await expect(replyRow).toBeVisible()
    await expect(replyRow.getByText('New')).toBeVisible()
  } finally {
    await senderContext.close()
    await recipientContext.close()
  }
})
