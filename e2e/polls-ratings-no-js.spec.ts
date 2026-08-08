/**
 * Polls and thread ratings, in a browser, with JavaScript off.
 *
 * Both are native forms on the thread page — radio buttons with a Vote
 * submit, five star-shaped submit buttons — and both claims are browser
 * claims: that the composer's poll fields become a poll another member can
 * vote in, and that a pressed star becomes a public average. The unit tiers
 * already hold the counting; this is the seam between members.
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

test('a thread opens with a poll, and another member votes in it', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const voterContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const voterPage = await voterContext.newPage()

  try {
    await signUp(authorPage, 'pauthor')
    await signUp(voterPage, 'pvoter')

    /* The poll rides on the composer — fields inside "Add a poll". */
    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Ship it? ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Vote below.')
    /* A native `<details>`: the summary opens it with scripting off. */
    await authorPage.getByText('Add a poll').click()
    await authorPage.getByLabel('Question').fill('Ship it?')
    await authorPage.getByLabel('Option 1').fill('Yes')
    await authorPage.getByLabel('Option 2').fill('No')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    /* The poll renders as a section, options counting from zero. */
    const authorPoll = authorPage.getByRole('region', { name: 'Poll' })
    await expect(authorPoll.getByText('Ship it?')).toBeVisible()
    await expect(authorPoll.getByText('Yes (0)')).toBeVisible()

    /* Another member votes: a radio and a plain submit. */
    await voterPage.goto(threadUrl)
    const poll = voterPage.getByRole('region', { name: 'Poll' })
    await poll.getByLabel('Yes (0)').check()
    await poll.getByRole('button', { name: 'Vote' }).click()

    /* The count moved, and this member's Vote button is gone: one vote each. */
    const pollAfter = voterPage.getByRole('region', { name: 'Poll' })
    await expect(pollAfter.getByText('Yes (1)')).toBeVisible()
    await expect(pollAfter.getByRole('button', { name: 'Vote' })).toHaveCount(0)
    await expect(pollAfter.getByText('1 vote')).toBeVisible()
  } finally {
    await authorContext.close()
    await voterContext.close()
  }
})

test('a member rates a thread, and the average is public', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const raterContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const raterPage = await raterContext.newPage()

  try {
    await signUp(authorPage, 'rauthor')
    await signUp(raterPage, 'rrater')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Rate this ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Five stars only, please.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    /* A fresh thread starts unrated. */
    const rating = raterPage.getByRole('region', { name: 'Thread rating' })
    await raterPage.goto(threadUrl)
    await expect(rating.getByText('No ratings yet.')).toBeVisible()

    /* Each star is a real submit with a full sentence for a name. */
    await rating.getByRole('button', { name: 'Rate 4 out of 5' }).click()

    /* The rater sees their own choice reflected… */
    const after = raterPage.getByRole('region', { name: 'Thread rating' })
    await expect(after.getByText('You rated this 4')).toBeVisible()
    await expect(after.getByText('4.0')).toBeVisible()

    /* …and the average is public: the author's page shows the same number. */
    await authorPage.goto(threadUrl)
    await expect(
      authorPage.getByRole('region', { name: 'Thread rating' }).getByText('4.0'),
    ).toBeVisible()
  } finally {
    await authorContext.close()
    await raterContext.close()
  }
})
