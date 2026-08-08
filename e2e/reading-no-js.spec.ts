import { expect, test } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('the fixture board, registration, and login work without JavaScript', async ({ page }, testInfo) => {
  const username = `e2e_member_${testInfo.workerIndex}_${Date.now()}`
  const password = 'long-enough-password'

  await page.goto('/')
  /*
   * Scoped to the category block, because the index now says this thread's name
   * three times: the community row's last post, and both panels in the activity
   * rail. The one this test is about is the listing's — an unscoped locator
   * here stopped being unambiguous the day the rail landed.
   */
  await page.getByLabel('Community').getByRole('link', { name: 'Version 0.1 is live' }).click()
  await expect(page).toHaveURL(/\/thread\/4(?:#|$)/)

  /*
   * F36 in the browser, and specifically through the *live* render path: the
   * fixture board stores no rendered HTML, so what is on screen here was
   * produced by `@meith/markdown` while the page was being rendered. Asserting
   * the tags rather than the words is the point — a renderer that emitted its
   * input verbatim would still show the sentence.
   */
  await expect(page.locator('#post-10 strong')).toHaveText('new community')
  const rules = page.locator('#post-10 a[href="/100-announcements"]')
  await expect(rules).toHaveText('Announcements')
  await expect(rules).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await expect(page.getByText('Account created. You can sign in now.')).toBeVisible()

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
})

test('a quoted reply renders as a quote block, not as its own markup', async ({ page }) => {
  await page.goto('/thread/21-show-us-your-desk-setup')

  const quote = page.locator('#post-132 blockquote.md-quote')
  await expect(quote).toContainText('admin wrote:')
  await expect(quote).toContainText('Show us the place where you make things.')
  /* The marker itself never reaches the page — that is the whole assertion. */
  await expect(page.locator('#post-132')).not.toContainText('> **admin')
})

/**
 * F27's jump box, without JavaScript and from the keyboard.
 *
 * The acceptance names both, and they are the same requirement seen twice. The
 * implementation everybody writes first — a `<select>` with an `onChange` that
 * sets `location.href` — fails both at once: it does nothing here, and it
 * teleports a keyboard user to the first community in the list as they arrow towards
 * the one they wanted, because `change` fires on every keystroke.
 *
 * So this test does the thing that only works if the box is a real form:
 * selects an option and presses a button.
 */
test('the community jump box works without JavaScript', async ({ page }) => {
  await page.goto('/')

  const jump = page.getByRole('combobox', { name: 'Jump to community' })
  await expect(jump).toBeVisible()

  /*
   * A category is a heading, not a destination. `disabled` is the native way to
   * say so, and it is what stops a jump to a page that does not exist.
   *
   * Asserted by *count*, not by visibility: an `<option>` inside a closed
   * `<select>` is never visible to Playwright, so `toBeVisible()` fails here on
   * correct markup. The first draft used it and did exactly that.
   */
  await expect(jump.locator('option[disabled]')).not.toHaveCount(0)

  /*
   * By value, not by label. The labels carry figure-space indentation so the
   * tree is legible inside a `<select>`, which means an exact-label match needs
   * the padding and a regex is not accepted here at all. The value is what the
   * form actually submits.
   */
  await expect(jump.locator('option[value="100"]')).toHaveText(/Announcements/)
  await jump.selectOption('100')
  await page.getByRole('button', { name: 'Go' }).click()

  await expect(page).toHaveURL(/\/100-announcements/)
})

test('the jump box is reachable and operable from the keyboard', async ({ page }) => {
  await page.goto('/')

  const jump = page.getByRole('combobox', { name: 'Jump to community' })
  await jump.focus()
  await expect(jump).toBeFocused()

  /*
   * Tab from the select must land on the submit control — that adjacency is the
   * whole keyboard story. If the button were somewhere else in the tab order, a
   * keyboard user would choose a community and then have to go looking for the way
   * to commit to it.
   */
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Go' })).toBeFocused()
})

/**
 * The jump page re-checks the permission, so a typed id is not an oracle.
 *
 * The box only lists what the viewer may see, which makes it tempting to trust
 * the submitted id. But the id arrives in a query string that anybody can type,
 * and a page that redirected on it would answer "does community 42 exist, and what
 * is it called" for every id on the board.
 *
 * **The body is asserted, not just the status.** This was a route handler until
 * it was found to answer 404 with *nothing* — no bytes and no `Content-Type`,
 * because `notFound()` in a route handler has no React tree to render and Next
 * ends the response at the status line. The status alone could not see it: the
 * number was always right. What a browser does with a bodiless error response is
 * its own business, and Chromium ≥ 126 refuses the navigation outright, so the
 * symptom was `ERR_HTTP_RESPONSE_CODE_FAILURE` — `page.goto` threw here rather
 * than returning a response to assert on.
 *
 * The heading is deliberately *not* asserted, and the reason is worth writing
 * down: on Next 16 a `notFound()` thrown from a page ships the not-found tree as
 * an RSC payload without server-rendering it, so every page-level 404 on this
 * board — `/member/…`, `/thread/…`, all ninety of them — is blank with
 * JavaScript off. That is a real gap against R5 and it is not this route's:
 * asserting a heading here would fail for a reason that has nothing to do with
 * the jump box, and would pass again the day the framework changes underneath.
 */
test('jumping to a community id that does not exist is a 404, not a redirect', async ({ page }) => {
  const response = await page.goto('/jump?community=99999')
  expect(response?.status()).toBe(404)
  expect(response?.headers()['content-type']).toContain('text/html')
  expect(await response?.text()).not.toBe('')
})

/**
 * The legacy MyBB URLs 404 the same way, and for the same reason.
 *
 * `board.legacy_redirects` is off on a board that was never imported into, and
 * an off feature must answer exactly as any unknown path would — otherwise
 * `/showthread.php` is a fingerprint of software this board is not running.
 * They shared the route-handler bug, so they share the regression test.
 */
test('a legacy MyBB URL 404s with a page, not an empty response', async ({ page }) => {
  for (const url of ['/showthread.php?tid=1', '/forumdisplay.php?fid=1', '/member.php?uid=1']) {
    const response = await page.goto(url)
    expect(response?.status(), url).toBe(404)
    expect(response?.headers()['content-type'], url).toContain('text/html')
    expect(await response?.text(), url).not.toBe('')
  }
})

test('jumping with no selection goes to the index rather than erroring', async ({ page }) => {
  await page.goto('/jump')
  await expect(page).toHaveURL(/\/$/)
})

/**
 * The index rail and the index footer, with scripting off.
 *
 * The two live panels are the board's only self-updating surface, and the rule
 * they were built against is the one this whole file exists for: an island
 * enhances, it never enables. So with JavaScript off the panels are still here
 * with real rows in them — what disappears is the control that pauses updates,
 * because a paused/resume button in a page that cannot run its handler is a lie
 * in the interface rather than a graceful degradation.
 *
 * The board's totals and its online list are the page's footer, and they are
 * *not* in the rail — a fact worth asserting rather than assuming, because
 * moving one back would be invisible in every other test.
 */
test('the index rail renders, and only its pause control needs JavaScript', async ({ page }) => {
  await page.goto('/')

  const rail = page.getByRole('complementary', { name: 'Board activity' })
  await expect(rail).toBeVisible()

  /* Both live panels, with rows the seeded board actually has. */
  await expect(rail.getByRole('heading', { name: 'Latest threads' })).toBeVisible()
  await expect(rail.getByRole('heading', { name: 'Latest posts' })).toBeVisible()
  await expect(rail.locator('section', { hasText: 'Latest threads' }).locator('li')).not.toHaveCount(
    0,
  )

  /*
   * The two summaries are on the page and outside the rail. Their headings are
   * `sr-only` — a visible title above one line of text is a label longer than
   * the thing it labels — so this asks for them by accessible name, which is
   * the only name they have. The apostrophe is a typographic one.
   */
  await expect(page.getByRole('region', { name: 'Board statistics' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'Who’s online' })).toBeAttached()
  await expect(rail.getByRole('region', { name: 'Board statistics' })).toHaveCount(0)
  await expect(rail.getByRole('region', { name: 'Who’s online' })).toHaveCount(0)

  /*
   * The island's own markup is absent rather than inert. Asserting the count is
   * zero rather than "not visible" is deliberate: a hidden button is still a
   * tab stop.
   */
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)

  /* A latest-posts row links to the post, not to the top of its thread. */
  const post = rail.locator('section', { hasText: 'Latest posts' }).locator('li a').first()
  await expect(post).toHaveAttribute('href', /\/thread\/\d+-[^?]+\?post=\d+#post-\d+$/)
})
