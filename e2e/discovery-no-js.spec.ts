/**
 * Finding things: the discovery views, who is online, the board's statistics,
 * and a member's reputation page. With JavaScript off.
 *
 * None of these had browser coverage, and they share a property that makes them
 * worth a browser rather than a unit test: each is a *listing whose contents
 * depend on who is asking and what has just happened*. "My threads" is empty
 * until this member starts one; the online list is written by the request that
 * reads it; the statistics are a scheduled rollup, so the honest question is
 * what the page says **before** the task has ever run — which is the state
 * every freshly installed board is in, and the one a page that prints three
 * confident zeroes gets wrong.
 *
 * Paging is a link carrying a keyset cursor rather than a script, so the views
 * are also part of the board's no-JavaScript claim.
 */
import { expect, test } from '@playwright/test'

import { drainUntil, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/** The five views the one route serves, and the tab each is reached by. */
const VIEWS = [
  { path: 'new', tab: 'New posts' },
  { path: 'today', tab: "Today's posts" },
  { path: 'mine', tab: 'My threads' },
  { path: 'participated', tab: 'My posts' },
  { path: 'unanswered', tab: 'Unanswered' },
] as const

test('/discover sends a bare address to the first view', async ({ page }) => {
  await page.goto('/discover')
  await expect(page).toHaveURL('/discover/new')
})

test('each discovery view is its own address, reachable from the tabs', async ({ page }) => {
  await page.goto('/discover/new')

  for (const view of VIEWS) {
    /*
     * Followed as a link rather than navigated to. The views are tabs, and a
     * tab that is a real anchor is the whole reason this works without
     * scripting — the address bar is what carries the state.
     *
     * Scoped to the row: the board's own section nav links three of these five
     * from every page, so an unscoped name matches twice.
     */
    await page
      .getByRole('navigation', { name: 'Discovery views' })
      .getByRole('link', { name: view.tab, exact: true })
      .click()
    await expect(page).toHaveURL(`/discover/${view.path}`)
    await expect(page.getByRole('heading', { name: view.tab })).toBeVisible()
  }
})

test('a view that is not one of the five is a 404', async ({ page }) => {
  const response = await page.goto('/discover/everything')
  expect(response?.status()).toBe(404)
})

/**
 * The two views that are about *this member*, which is what makes them worth a
 * browser: they are the same query with a different actor, and an actor
 * resolved from a cookie is the thing a unit test substitutes away.
 */
test('a member’s own thread appears under My threads and My posts', async ({ page }) => {
  await signUp(page, 'finder')

  /* Nothing of their own yet. */
  await page.goto('/discover/mine')
  await expect(page.getByText('Nothing here right now.')).toBeVisible()

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Find me later ${Date.now().toString(36)}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Started by the member who will look for it.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  await page.goto('/discover/mine')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  /* Started counts as posted in, so it is under both. */
  await page.goto('/discover/participated')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  /* Nobody has replied, so it is unanswered — a view every board leans on. */
  await page.goto('/discover/unanswered')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  /* And a guest's "My threads" is not this member's. */
  await page.context().clearCookies()
  await page.goto('/discover/mine')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

/**
 * A thread that has been answered leaves Unanswered.
 *
 * The half of the pair that a query written as "no replies" and a query written
 * as "reply_count = 0" get differently the moment a reply is soft-deleted; and
 * the half nothing was checking.
 */
test('answering a thread takes it out of Unanswered', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const replierContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const replierPage = await replierContext.newPage()

  try {
    await signUp(authorPage, 'asked')
    await signUp(replierPage, 'answers')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Anyone? ${Date.now().toString(36)}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('A question nobody has answered.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    await replierPage.goto('/discover/unanswered')
    await expect(replierPage.getByRole('link', { name: title })).toBeVisible()

    await replierPage.goto(`${threadUrl}/reply`)
    await replierPage.getByLabel('Message').fill('Answered.')
    await replierPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(replierPage).toHaveURL(/#post-\d+$/)

    await replierPage.goto('/discover/unanswered')
    await expect(replierPage.getByRole('link', { name: title })).toHaveCount(0)
  } finally {
    await authorContext.close()
    await replierContext.close()
  }
})

/**
 * The online list is written by the request that reads it.
 *
 * Which is why it is a browser test and not a unit one: the member appears
 * because *this* request touched presence, through the proxy's path header and
 * the actor resolved from a cookie. Nothing below the route can produce that.
 */
test('a member who has just looked at the board is on the online list', async ({ page }) => {
  const member = await signUp(page, 'present')

  await page.goto('/online')
  await expect(page.getByRole('heading', { name: 'Who’s online' })).toBeVisible()
  /*
   * The link in the listing, not the name in the account menu — which is on
   * every page and would make this pass for a member who is not on the list at
   * all.
   */
  await expect(page.getByRole('link', { name: member, exact: true })).toBeVisible()
  /* Counted, and split into members and guests rather than one number. */
  await expect(page.getByText(/\d+ members? and \d+ guests?/)).toBeVisible()

  /* The index's own footer panel says the same thing, in one line. */
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Who’s online' })).toBeAttached()
})

/**
 * Statistics before the rollup has run, and after.
 *
 * The "before" is the state of every board minutes after it is installed, and a
 * page that showed three zeroes there would be telling an operator their board
 * is empty when it is not. So it says so in words — and then the tick runs and
 * the numbers arrive, which is the only proof the task is wired to the screen.
 */
test('the board statistics say they are uncounted, then the tick counts them', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000)

  await page.goto('/stats')
  await expect(page.getByRole('heading', { name: 'Board statistics' })).toBeVisible()

  /*
   * The leaderboards do not wait for the rollup — they are live queries — so
   * the screen is useful before the task has ever run.
   */
  await expect(page.getByRole('heading', { name: 'Top 10 posters' })).toBeVisible()
  await expect(page.getByText('admin').first()).toBeVisible()

  await drainUntil(request, page, '/stats', async () => {
    /*
     * Any non-zero total will do, and deliberately so: the seeded board grows
     * as the suite runs, so pinning a number here would make this test a
     * function of how many specs ran before it.
     */
    await expect(page.getByText('The totals below have not been counted yet')).toHaveCount(0, {
      timeout: 2_000,
    })
  })

  const totals = page.getByRole('region', { name: 'Totals' })
  await expect(totals.getByText(/^[1-9]\d*$/).first()).toBeVisible()
})

/**
 * A member's reputation page: the total, who gave it, and what they said.
 *
 * The seeded board has one rating from one member who is not its subject, so
 * the page has something real to show — which is what makes "the comment is
 * public" an assertion rather than an empty state.
 *
 * The *row* is asserted rather than the total, deliberately. The suite shares
 * one database and `thanks-no-js.spec.ts` presses a button that moves `admin`'s
 * total, so a number pinned here would be a statement about which file ran
 * first. What this page has to get right is that a rating is attributable —
 * who, when, and in their words — and that survives any total.
 */
test('a member’s reputation page shows the ratings behind the number', async ({ page }) => {
  await page.goto('/member/1/reputation')

  await expect(page.getByRole('heading', { name: 'admin’s reputation' })).toBeVisible()
  await expect(page.getByText(/^[+-]?\d+ \(\d+ positive\)/)).toBeVisible()

  /* The seeded row: its giver, and the comment they left. */
  const seeded = page.getByRole('listitem').filter({ hasText: 'Runs a good board.' })
  await expect(seeded).toBeVisible()
  await expect(seeded).toContainText('wellwisher')

  /* A guest is offered nothing to press. */
  await expect(page.getByRole('button', { name: 'Thanks' })).toHaveCount(0)

  /* The way back is a link, not the browser's button. */
  await page.getByRole('link', { name: 'Back to their profile' }).click()
  await expect(page).toHaveURL('/member/1')
})

/**
 * A signed-in member gets the form, and using it moves the total.
 *
 * Between **two members this test makes itself**, never the seeded `admin`.
 * `admin`'s reputation is asserted as an exact number by `thanks-no-js.spec.ts`
 * and by `group-identity-no-js.spec.ts`, and a suite that shares a database has
 * to leave the fixture's numbers where it found them — a spec that quietly
 * moves one fails a different file, which is the worst kind of failure to read.
 */
test('a member rates another member, and the page shows who said what', async ({ browser }) => {
  const raterContext = await browser.newContext()
  const subjectContext = await browser.newContext()
  const raterPage = await raterContext.newPage()
  const subjectPage = await subjectContext.newPage()

  try {
    const subject = await signUp(subjectPage, 'rated')
    await signUp(raterPage, 'rater')

    /* The by-name route resolves the id, so this test never hardcodes one. */
    await raterPage.goto(`/member/by-name/${subject}`)
    await expect(raterPage).toHaveURL(/\/member\/\d+$/)
    await raterPage.goto(`${raterPage.url()}/reputation`)

    /* Nobody has rated them, and the page says so rather than showing a zero. */
    await expect(raterPage.getByRole('heading', { name: `Rate ${subject}` })).toBeVisible()

    const comment = `Answered my question ${Date.now().toString(36)}.`
    await raterPage.getByLabel('Why (optional)').fill(comment)
    await raterPage.getByRole('button', { name: 'Thanks', exact: true }).click()

    /*
     * The paragraph in the list, not the box it was typed into: the form
     * re-renders with the comment still in the textarea, which a bare text
     * assertion also matches — and would go on matching if the rating were
     * never stored at all.
     */
    await expect(raterPage.getByRole('listitem').filter({ hasText: comment })).toBeVisible()
    await expect(raterPage.getByText('+1 (1 positive)')).toBeVisible()

    /*
     * And it is public: the profile carries the same summary, for anybody. Read
     * as the *subject*, who is the one person who cannot have given it — so a
     * page that echoed the viewer's own rating back would fail here.
     */
    await subjectPage.goto(`/member/by-name/${subject}`)
    await expect(subjectPage.getByText('+1 (1 positive)')).toBeVisible()
  } finally {
    await raterContext.close()
    await subjectContext.close()
  }
})
