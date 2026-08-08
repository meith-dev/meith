/**
 * Buddies and ignored members, in a browser, with JavaScript off (F61).
 *
 * The unit tiers prove the relation store enforces its cap and the thread
 * view withholds an ignored author's body server-side. What only a browser
 * can prove is the journey: the button on a profile, the row on the contacts
 * screen, a thread where the ignored member's words are genuinely absent from
 * the page rather than hidden by a stylesheet — and the message composer
 * refusing an ignored member without saying why, which is the part of the
 * design that keeps an ignore list private.
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

test('a buddy added from a profile is listed with a message link, and removed again', async ({
  browser,
}) => {
  const memberContext = await browser.newContext()
  const buddyContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  const buddyPage = await buddyContext.newPage()

  try {
    const buddy = await signUp(buddyPage, 'buddy')
    await signUp(memberPage, 'member')

    /* The by-name route resolves the profile without knowing the id. */
    await memberPage.goto(`/member/by-name/${buddy}`)
    await expect(memberPage).toHaveURL(/\/member\/\d+$/)
    await memberPage.getByRole('button', { name: 'Add to buddy list' }).click()

    /* The button flips: the same member is on exactly one of the two lists. */
    await expect(
      memberPage.getByRole('button', { name: 'Remove from buddy list' }),
    ).toBeVisible()

    /* The contacts screen lists them, with a shortcut into the composer. */
    await memberPage.goto('/usercp/contacts')
    const line = memberPage.locator('li', { hasText: buddy })
    await expect(line).toBeVisible()
    await expect(line.getByRole('link', { name: 'Message' })).toHaveAttribute(
      'href',
      `/messages/compose?to=${buddy}`,
    )

    /* Removing empties the list again. */
    await line.getByRole('button', { name: 'Remove' }).click()
    await expect(memberPage.getByText('Nobody yet.')).toBeVisible()
  } finally {
    await memberContext.close()
    await buddyContext.close()
  }
})

test('an ignored member’s posts hide behind a link, and their messages are refused', async ({
  browser,
}) => {
  const readerContext = await browser.newContext()
  const ignoredContext = await browser.newContext()
  const readerPage = await readerContext.newPage()
  const ignoredPage = await ignoredContext.newPage()

  try {
    const ignored = await signUp(ignoredPage, 'ignored')
    const reader = await signUp(readerPage, 'reader')

    /* The soon-to-be-ignored member posts something. */
    await ignoredPage.goto('/200-general')
    await ignoredPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Ignore me end to end ${Date.now()}`
    await ignoredPage.getByLabel('Subject').fill(title)
    await ignoredPage.getByLabel('Message').fill('Words the reader chose not to see.')
    await ignoredPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(ignoredPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = ignoredPage.url()

    /* The reader ignores them from their profile. */
    await readerPage.goto(`/member/by-name/${ignored}`)
    await readerPage.getByRole('button', { name: 'Ignore this member' }).click()
    await expect(readerPage.getByRole('button', { name: 'Stop ignoring' })).toBeVisible()

    /*
     * The post's body is absent from the page — the app withheld it, so there
     * is nothing a stylesheet could reveal — and the placeholder names the
     * choice and offers the way back.
     */
    await readerPage.goto(threadUrl)
    await expect(readerPage.getByText(`You are ignoring`)).toBeVisible()
    await expect(readerPage.getByText('Words the reader chose not to see.')).toHaveCount(0)

    /* "Show it anyway" is a plain link, and it reveals this one post. */
    await readerPage.getByRole('link', { name: 'Show it anyway' }).click()
    await expect(readerPage.getByText('Words the reader chose not to see.')).toBeVisible()

    /*
     * The ignored member cannot message the reader — and the refusal is the
     * same one a closed group gets, naming no ignore list, because a send
     * path that says "they are ignoring you" is an oracle for a list that is
     * supposed to be private.
     */
    await ignoredPage.goto('/messages/compose')
    await ignoredPage.locator('input[name="to"]').fill(reader)
    await ignoredPage.getByLabel('Subject').fill('Hello?')
    await ignoredPage.getByLabel('Message').fill('You cannot ignore me.')
    await ignoredPage.getByRole('button', { name: 'Send message' }).click()
    await expect(
      ignoredPage.getByText(`${reader} cannot receive private messages.`),
    ).toBeVisible()

    /* And nothing arrived. */
    await readerPage.goto('/messages')
    await expect(readerPage.locator('li', { hasText: 'Hello?' })).toHaveCount(0)
  } finally {
    await readerContext.close()
    await ignoredContext.close()
  }
})
