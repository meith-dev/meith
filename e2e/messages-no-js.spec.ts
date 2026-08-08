/**
 * Private messages, in a browser, with JavaScript off (F60).
 *
 * The unit tiers prove the service refuses what it should and the folders
 * count what they hold. What only a browser can prove is the seam between two
 * members: that a message one of them types becomes a row in the other's
 * inbox, that reading it and replying happens through plain forms and GET
 * prefills, and that the whole exchange works with scripting off — which is
 * the board's standing claim for every write path.
 */
import { expect, test, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

/** Register through the form, then sign in. The only way to get a session. */
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
  /* Two sessions: cookies are per-context, so a context is a member. */
  const senderContext = await browser.newContext()
  const recipientContext = await browser.newContext()
  const senderPage = await senderContext.newPage()
  const recipientPage = await recipientContext.newPage()

  try {
    const sender = await signUp(senderPage, 'pmsend')
    const recipient = await signUp(recipientPage, 'pmread')

    /* The sender writes. The composer is an ordinary form. */
    const subject = `Meet the new board ${Date.now()}`
    await senderPage.goto('/messages/compose')
    await senderPage.locator('input[name="to"]').fill(recipient)
    await senderPage.getByLabel('Subject').fill(subject)
    await senderPage.getByLabel('Message').fill('First message on this board — did it arrive?')
    await senderPage.getByRole('button', { name: 'Send message' }).click()

    /* The send lands in the sent folder, named as sent. */
    await expect(senderPage).toHaveURL(/\/messages\?folder=sent&sent=1$/)
    await expect(senderPage.getByText(subject)).toBeVisible()

    /* The recipient finds it in their inbox, marked new, and opens it. */
    await recipientPage.goto('/messages')
    const row = recipientPage.locator('li', { hasText: subject })
    await expect(row).toBeVisible()
    await expect(row.getByText('New')).toBeVisible()
    await row.getByRole('link', { name: subject }).click()
    await expect(recipientPage.getByText('did it arrive?')).toBeVisible()

    /*
     * Reply is a GET link the server prefills — not a separate route and not
     * a client-side template — which is what makes it work with scripting off.
     */
    await recipientPage.getByRole('link', { name: 'Reply', exact: true }).click()
    await expect(recipientPage).toHaveURL(/\/messages\/compose\?reply=\d+$/)
    await expect(recipientPage.locator('input[name="to"]')).toHaveValue(sender)
    await expect(recipientPage.getByLabel('Subject')).toHaveValue(`Re: ${subject}`)

    await recipientPage.getByLabel('Message').fill('It arrived. Replying to prove the round trip.')
    await recipientPage.getByRole('button', { name: 'Send message' }).click()
    await expect(recipientPage).toHaveURL(/\/messages\?folder=sent&sent=1$/)

    /* The reply is a new-marked row back in the original sender's inbox. */
    await senderPage.goto('/messages')
    const replyRow = senderPage.locator('li', { hasText: `Re: ${subject}` })
    await expect(replyRow).toBeVisible()
    await expect(replyRow.getByText('New')).toBeVisible()
  } finally {
    await senderContext.close()
    await recipientContext.close()
  }
})
