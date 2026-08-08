/**
 * Mentions and quote notifications, in a browser, with JavaScript off.
 *
 * The unit tiers already hold the pieces apart: the parser proves `@name`
 * becomes a link, the producer proves the right ids are raised, the centre
 * proves rows render. What only a browser can prove is the seam *between
 * members* — that one member typing another's name becomes a link the reader
 * can follow and a row in the named member's centre — because that journey
 * crosses three sessions and every layer at once.
 *
 * Three members, deliberately: the poster quotes one and mentions another in a
 * single reply. One reply, because it pins the two kinds apart: the quoted
 * member gets `post.quoted`, the mentioned one `post.mentioned`, and neither
 * sees the other's row. (The posting flood interval is off in the e2e seed —
 * see `e2e/support/database.ts` — so the single reply is about precision, not
 * the rate limiter.)
 *
 * The registered usernames carry an underscore on purpose. `plainAuthorName`
 * used to strip `_` from quote attributions — cosmetic while an attribution
 * was only read by people, wrong the day `extractQuotedAuthors` began
 * resolving it to an account — and this spec is what caught it: the quoted
 * member's notification never arrived because the attribution named a member
 * who does not exist.
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

test('a reply that quotes one member and mentions another notifies both', async ({ browser }) => {
  /* Three sessions: cookies are per-context, so a context is a member. */
  const quotedContext = await browser.newContext()
  const mentionedContext = await browser.newContext()
  const posterContext = await browser.newContext()
  const quotedPage = await quotedContext.newPage()
  const mentionedPage = await mentionedContext.newPage()
  const posterPage = await posterContext.newPage()

  try {
    const mentioned = await signUp(mentionedPage, 'named')
    const quoted = await signUp(quotedPage, 'quoted')

    /* The quoted member posts something worth quoting. */
    await quotedPage.goto('/200-general')
    await quotedPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Mentions end to end ${Date.now()}`
    await quotedPage.getByLabel('Subject').fill(title)
    await quotedPage.getByLabel('Message').fill('A post worth quoting.')
    await quotedPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(quotedPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = quotedPage.url()

    /* The poster follows the no-JS quote link; the server prefills the form. */
    const poster = await signUp(posterPage, 'poster')
    await posterPage.goto(threadUrl)
    await posterPage.locator('a[href*="?quote="]').first().click()

    /*
     * The attribution names the member exactly — underscore included. This is
     * the line the notification is later resolved from, so "roughly their
     * name" is not good enough (see this file's header).
     */
    const prefilled = await posterPage.getByLabel('Message').inputValue()
    expect(prefilled).toContain(`> **${quoted} wrote:**`)

    await posterPage
      .getByLabel('Message')
      .fill(`${prefilled}\n\nAgreed — and @${mentioned} should see this too.`)
    await posterPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(posterPage).toHaveURL(/#post-\d+$/)

    /*
     * The mention rendered as a link the renderer constructed: the by-name
     * route, never a raw id, because the cached HTML must not need a database
     * to be replayed. Following it resolves the name at click time.
     */
    const mention = posterPage.locator('a.md-mention')
    await expect(mention).toHaveText(`@${mentioned}`)
    await expect(mention).toHaveAttribute('href', `/member/by-name/${mentioned}`)
    await mention.click()
    await expect(posterPage).toHaveURL(/\/member\/\d+$/)
    await expect(posterPage.locator('main')).toContainText(mentioned)

    /* The quoted member finds the quote in their centre, unread. */
    await quotedPage.goto('/notifications')
    const quotedRow = quotedPage.locator('li', {
      hasText: `${poster} quoted your post in ${title}`,
    })
    await expect(quotedRow).toBeVisible()
    await expect(quotedRow.getByText('New')).toBeVisible()

    /* The mentioned member finds the mention, and its link is the post. */
    await mentionedPage.goto('/notifications')
    const mentionedRow = mentionedPage.locator('li', {
      hasText: `${poster} mentioned you in ${title}`,
    })
    await expect(mentionedRow).toBeVisible()

    /* Neither member got the other's row: the kinds do not leak across. */
    await expect(quotedPage.locator('li', { hasText: 'mentioned you' })).toHaveCount(0)
    await expect(mentionedPage.locator('li', { hasText: 'quoted your post' })).toHaveCount(0)

    /* The View link is the post's permalink, and it lands on the post. */
    const viewHref = await mentionedRow
      .getByRole('link', { name: 'View', exact: true })
      .getAttribute('href')
    expect(viewHref).toMatch(/^\/thread\/\d+-.+#post-\d+$/)
    await mentionedPage.goto(viewHref!)
    await expect(
      mentionedPage.getByText(`@${mentioned} should see this too`),
    ).toBeVisible()
  } finally {
    await quotedContext.close()
    await mentionedContext.close()
    await posterContext.close()
  }
})
