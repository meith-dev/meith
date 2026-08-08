/**
 * Following threads and communities, in a browser, with JavaScript off (F56).
 *
 * The unit tiers prove `subscribe` upserts and the notifier coalesces. What
 * only a browser can prove is the loop as a member lives it: the checkbox on
 * the composer, the Follow control at the foot of a thread, the management
 * screen listing what they chose, and — after the queue has run, because
 * instant mode is a task and not an inline write — the notification a reply
 * raises for the follower.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

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

/**
 * Run the board's tick until `check` passes. Same shape as the writing spec,
 * for the same reason: `queue.drain` has an interval, so "after one tick" is
 * over-specifying — the contract a member experiences is "once the queue has
 * run".
 */
async function drainUntil(
  request: APIRequestContext,
  page: Page,
  url: string,
  check: () => Promise<void>,
): Promise<void> {
  test.setTimeout(150_000)

  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto(url)
    await check()
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}

test('the composer’s subscribe box lands the thread on the subscriptions screen', async ({
  page,
}) => {
  await signUp(page, 'subw')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Followed from birth ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Subscribed at the moment of posting.')
  await page.getByLabel('Notify me of replies').check()
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  /* The management screen lists it. */
  await page.goto('/subscriptions')
  const row = page.locator('li', { hasText: title })
  await expect(row).toBeVisible()

  /* Stopping from the row empties the screen back to its blank state. */
  await row.getByRole('button', { name: 'Stop following' }).click()
  await expect(page.getByText('You are not following anything yet.')).toBeVisible()
})

test('a follower is notified of a reply once the queue has run', async ({ browser, request }) => {
  const authorContext = await browser.newContext()
  const followerContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const followerPage = await followerContext.newPage()

  try {
    await signUp(authorPage, 'suba')
    await signUp(followerPage, 'subf')

    /* The author opens a thread, not following it themselves. */
    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Worth following ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Follow this and see.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    /* The follower presses Follow at the foot of the thread. */
    await followerPage.goto(threadUrl)
    await followerPage.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(
      followerPage.getByRole('button', { name: 'Stop following' }),
    ).toBeVisible()

    /* Following a community works the same way, from its own page. */
    await followerPage.goto('/200-general')
    await followerPage.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(
      followerPage.getByRole('button', { name: 'Stop following' }),
    ).toBeVisible()

    await followerPage.goto('/subscriptions')
    await expect(followerPage.locator('li', { hasText: title })).toBeVisible()

    /* The author replies. */
    await authorPage.goto(`${threadUrl}/reply`)
    await authorPage.getByLabel('Message').fill('Here is the reply you followed for.')
    await authorPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(authorPage).toHaveURL(/#post-\d+$/)

    /*
     * Instant mode is the `subscriptions.instant` task, so the notification
     * exists once the queue has run — which the production tick drives.
     */
    await drainUntil(request, followerPage, '/notifications', async () => {
      await expect(
        followerPage.locator('li', { hasText: `New reply in ${title}` }),
      ).toBeVisible()
    })
  } finally {
    await authorContext.close()
    await followerContext.close()
  }
})
