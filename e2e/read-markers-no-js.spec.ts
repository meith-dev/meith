/**
 * What a member has already read, with JavaScript off.
 *
 * Unread state is the single most-used feature of a forum and it had no browser
 * coverage. It is also the one that cannot be tested anywhere else: the marker
 * is a function of *this member's* read pointer against a thread's last post,
 * so it needs two sessions, a real write, and a cookie — three things a unit
 * test replaces with arguments.
 *
 * The three controls are plain `<form method="post">` posting to a route that
 * answers **303** back to where it came from. That shape is the no-JavaScript
 * story and it is asserted rather than assumed: a POST answered with 200 leaves
 * the member on a page that re-submits when they reload it.
 *
 * "(new posts)" is deliberately screen-reader-only text in the theme — the
 * visual cue is the row's own styling — which makes it exactly the right thing
 * to assert on: it is the *information*, and information carried only by colour
 * is not carried at all.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/**
 * A listing row, by the thing it is a row *about*.
 *
 * The marker is a **sibling** of the title link rather than part of it — the
 * link says the forum's name, and "and it has new posts" is a separate fact
 * announced beside it. So the row is what has to be asserted on; a locator
 * built on the link's accessible name can never see the marker, which is a
 * mistake that reads as a broken feature.
 */
function row(page: Page, name: string | RegExp, within?: Locator): Locator {
  /*
   * The `has:` locator is always built from the page. Playwright resolves it
   * against each candidate row, so a pre-scoped one matches nothing at all —
   * which fails as "element not found" and reads like the row is missing.
   */
  return (within ?? page)
    .locator('li')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
}

/**
 * The seeded forum's row **in the index listing**.
 *
 * Scoped to the category block it lives in, because the index's activity rail
 * names the same forum on every one of its rows ("… in General Discussion") —
 * an unscoped row locator matches eleven things, and the ten that are not the
 * listing carry an unread state of their own.
 */
function forumRow(page: Page): Locator {
  return row(page, 'General Discussion', page.getByLabel('Main'))
}

test('a thread somebody else posts in is unread until the member marks it read', async ({
  browser,
}) => {
  const posterContext = await browser.newContext()
  const readerContext = await browser.newContext()
  const posterPage = await posterContext.newPage()
  const readerPage = await readerContext.newPage()

  try {
    await signUp(posterPage, 'writes')
    await signUp(readerPage, 'reads')

    /*
     * The reader clears the board first. Everything on a seeded board is unread
     * to a new account, so "this thread is unread" only means something once
     * the slate is clean.
     *
     * Asserted on the forum row rather than on the page: the index's activity
     * rail lists the latest threads with the same marker, and those are a
     * different claim about a different pointer.
     */
    await readerPage.goto('/')
    await readerPage.getByRole('button', { name: 'Mark all forums read' }).click()
    await expect(forumRow(readerPage)).not.toContainText('(new posts)')

    /* Now somebody posts. */
    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Unread until read ${Date.now().toString(36)}`
    await posterPage.getByLabel('Subject').fill(title)
    await posterPage.getByLabel('Message').fill('Nobody has seen this yet.')
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = posterPage.url()

    /* The forum is unread on the index, and the thread is unread in the forum. */
    await readerPage.goto('/')
    await expect(forumRow(readerPage)).toContainText('(new posts)')

    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toContainText('(new posts)')

    /*
     * The **control** clears it, not the reading.
     *
     * Worth stating plainly, because every reader of this file will assume the
     * other thing: most boards mark a thread read the moment it is opened. This
     * one does not — F32's deliverable is "read markers, cutoff and *mark
     * controls*" — so opening the thread leaves the marker exactly where it
     * was, and the member says when they are done with it.
     */
    await readerPage.goto(threadUrl)
    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toContainText('(new posts)')

    await readerPage.goto(threadUrl)
    await readerPage.getByRole('button', { name: 'Mark read' }).click()
    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toBeVisible()
    await expect(row(readerPage, title)).not.toContainText('(new posts)')
  } finally {
    await posterContext.close()
    await readerContext.close()
  }
})

/**
 * Every Mark-read control completes a navigation the browser is willing to make.
 *
 * **This is a regression test for a bug that made all three controls do
 * nothing.** They redirected with an absolute `Location` built from
 * `request.url` — which inside a route handler is not the address the member is
 * on, but the one Next's own server is listening on. The board's CSP says
 * `form-action 'self'`, and `form-action` governs where a form may end up
 * *through a redirect*, so Chromium refused to follow it:
 *
 *     Refused to send form data to '…/api/read/all' because it violates the
 *     following Content Security Policy directive: "form-action 'self'".
 *
 * The write had already happened, so the member pressed the button, the page
 * did not change, everything still looked unread — and pressing it again looked
 * equally broken. Nothing was logged; the server thought it had succeeded.
 *
 * The shape of the test matters as much as the fix. The obvious assertion —
 * `expect(page).toHaveURL('/')` after pressing a control that was already on
 * `/` — passes whether the navigation happened or was blocked, which is exactly
 * how a control that does nothing keeps a green suite. So each case here
 * asserts something that is only true once the browser has *arrived*: a fresh
 * response with a **relative** `Location`, and a page whose state has moved.
 */
test('each Mark read control completes its redirect, and the page arrives changed', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  /* Relative, always — the property that survives any proxy and any CSP. */
  const locations: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/read/')) {
      expect(response.status(), response.url()).toBe(303)
      locations.push(response.headers()['location'] ?? '')
    }
  })

  try {
    await signUp(page, 'marks')

    /*
     * A forum, from its own page: the member arrives back on it with the
     * listing's unread markers gone. Nothing else on the board clears them, so
     * this cannot pass on a blocked navigation.
     */
    await page.goto('/200-general')
    await expect(page.locator('li', { hasText: '(new posts)' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Mark read' }).click()
    await expect(page).toHaveURL('/200-general')
    await expect(page.locator('li', { hasText: '(new posts)' })).toHaveCount(0)

    /* The index: every forum at once, and the row is clear on arrival. */
    await page.goto('/')
    await expect(forumRow(page)).not.toContainText('(new posts)')
    await page.getByRole('button', { name: 'Mark all forums read' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByLabel('Main').locator('li', { hasText: '(new posts)' })).toHaveCount(0)

    /*
     * A thread: back to the thread — at its **canonical** address. The board
     * builds the target from the slug it holds rather than echoing the one that
     * was asked for, so a stale slug is corrected on the way back rather than
     * carried around for ever.
     */
    await page.goto('/thread/4-welcome-to-the-forum')
    await page.getByRole('button', { name: 'Mark read' }).click()
    await expect(page).toHaveURL('/thread/4-version-0-1-is-live')

    expect(locations.length).toBeGreaterThanOrEqual(3)
    for (const location of locations) {
      expect(location, 'Location must be relative').toMatch(/^\/(?!\/)/)
    }
  } finally {
    await context.close()
  }
})

/**
 * A guest is offered nothing to press, and the routes refuse them anyway.
 *
 * Read state belongs to an account, so there is nothing for the board to
 * remember about somebody who has none — and the control is *absent* rather
 * than present-and-refused, because a button that always fails is worse than no
 * button.
 */
test('read markers are not offered to a guest, and the routes refuse one', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Mark all forums read' })).toHaveCount(0)

  await page.goto('/200-general')
  await expect(page.getByRole('button', { name: 'Mark read' })).toHaveCount(0)

  /*
   * And by URL, which is how it gets missed: a guest posting to the route is
   * sent to the index rather than 500ing on a null user id.
   */
  for (const url of ['/api/read/all', '/api/read/forum/200', '/api/read/thread/4']) {
    const response = await request.post(url, { maxRedirects: 0 })
    expect(response.status(), url).toBe(303)
    expect(new URL(response.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname).toBe('/')
  }
})

/**
 * A forum id that does not exist, and one that is not a number.
 *
 * Both go to the index rather than erroring: the id arrives in a URL anybody
 * can type, and a route that distinguished "no such forum" from "a forum you
 * may not see" would answer "does forum 42 exist" for every id on the board.
 */
test('marking a forum that is not there is a redirect, not an error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await signUp(page, 'marksbad')

    for (const url of ['/api/read/forum/999999', '/api/read/forum/abc', '/api/read/thread/999999']) {
      const response = await page.request.post(url, { maxRedirects: 0 })
      expect(response.status(), url).toBe(303)
      expect(
        new URL(response.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname,
        url,
      ).toBe('/')
    }

    /*
     * A *category* is not a forum, and the route says so the same way. The
     * board's index groups forums under categories, which hold no threads —
     * marking one read is meaningless rather than forbidden.
     */
    const category = await page.request.post('/api/read/forum/10', { maxRedirects: 0 })
    expect(category.status()).toBe(303)
    expect(new URL(category.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname).toBe('/')
  } finally {
    await context.close()
  }
})
