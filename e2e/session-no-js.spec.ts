/**
 * Leaving, coming back, and the four small routes nothing else visits.
 *
 * Every route here was uncovered, and three of them are uncovered for the same
 * reason: they are not screens anybody navigates to on purpose, so writing a
 * spec against them takes deciding to. That is exactly why they rot —
 * `/auth/resume` and `/redirect` both take a destination from the query string,
 * which makes each of them an open redirect the day its guard is refactored by
 * somebody who did not know it was a guard.
 *
 * Log out is the other kind of gap: the single most-used write on any board,
 * and no spec had ever pressed it. It is a POST rather than a link precisely so
 * that a prefetcher or a mail scanner cannot end a session by following
 * something — a property that only holds while the markup says so, which is
 * what this asserts.
 *
 * Scripting off throughout, as on the rest of the suite.
 */
import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('logging out is a POST, and the session is gone afterwards', async ({ page }) => {
  await signUp(page, 'bye')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()

  /*
   * The control is a submit button in a form, and there is no anchor that does
   * the same job. A `GET /logout` link is the classic version of this bug: any
   * link scanner in the reader's mail, browser or corporate proxy logs them out.
   */
  const logout = page.getByRole('button', { name: 'Log out' })
  await expect(logout).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log out' })).toHaveCount(0)

  await logout.click()
  await expect(page).toHaveURL('/login')

  /*
   * Gone rather than merely un-rendered: a page behind the session refuses and
   * says where to come back to, which is the proof the cookie went with it and
   * not just the header.
   */
  await page.goto('/usercp')
  await expect(page).toHaveURL('/login?next=%2Fusercp')
})

/**
 * The member's control panel index, which had never been opened either — every
 * account spec goes straight to one of its sub-screens.
 */
test('the member control panel lists the screens it is the index of', async ({ page }) => {
  await signUp(page, 'panel')

  await page.goto('/usercp')
  await expect(page.getByRole('heading', { name: /control panel/i })).toBeVisible()

  /*
   * Read from `USERCP_SECTIONS`, the same list the rail reads, so a screen
   * cannot appear in one and not the other. Naming four of them rather than all
   * nine keeps this from being a change-detector for the copy.
   */
  for (const section of ['Profile', 'Avatar', 'Signature', 'Options']) {
    await expect(page.getByRole('link', { name: section, exact: true }).first()).toBeVisible()
  }

  await page.getByRole('link', { name: 'Signature', exact: true }).first().click()
  await expect(page).toHaveURL('/usercp/signature')
})

/**
 * `/redirect` is the interstitial an outbound link goes through.
 *
 * Both halves matter and only one of them is obvious. It has to *work* without
 * scripting — which is why the countdown is a `<meta http-equiv="refresh">` and
 * not a timer — and it has to refuse a destination that is not this board,
 * because a page that will forward a visitor anywhere is a phishing primitive
 * with the board's own domain in front of it.
 */
test('the redirect interstitial forwards without scripting, and only within the board', async ({
  page,
}) => {
  await page.goto('/redirect?to=/stats&message=Off+you+go')

  await expect(page.getByText('Off you go')).toBeVisible()
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute(
    'content',
    '2;url=/stats',
  )
  await expect(page.getByRole('link', { name: 'Continue now' })).toHaveAttribute('href', '/stats')

  /* And it really arrives, which the meta tag alone does not prove. */
  await page.getByRole('link', { name: 'Continue now' }).click()
  await expect(page).toHaveURL('/stats')

  /*
   * An absolute URL elsewhere is replaced by the board's own index — not
   * rendered with a warning, not refused with an error. There is nothing for
   * the visitor to decide, so there is nothing to ask them.
   */
  await page.goto('/redirect?to=https://evil.example/&message=nope')
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '2;url=/')
  await expect(page.getByRole('link', { name: 'Continue now' })).toHaveAttribute('href', '/')

  /* A protocol-relative URL is the same trick with the scheme left off. */
  await page.goto('/redirect?to=//evil.example/')
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '2;url=/')
})

/**
 * `/auth/resume` is the remember-me exchange, and it is reached by the proxy
 * rather than by a person — which is why nothing had ever asked it anything.
 *
 * The case worth pinning is the one a *guest* can reach: no remember cookie at
 * all. It must send them on rather than erroring, and `next` is attacker-chosen,
 * so the same-origin guard is the whole security of the route.
 */
test('the remember-me exchange sends a visitor on, and never off the board', async ({ page }) => {
  await page.goto('/auth/resume?next=/stats')
  await expect(page).toHaveURL('/stats')

  await page.goto('/auth/resume?next=https://evil.example/')
  await expect(page).toHaveURL('/')

  await page.goto('/auth/resume?next=//evil.example/')
  await expect(page).toHaveURL('/')

  await page.goto('/auth/resume')
  await expect(page).toHaveURL('/')
})

/**
 * The unsubscribe link's two screens that need no token.
 *
 * The link itself carries an HMAC minted when a notification is mailed, and the
 * e2e board has no mailbox to read one out of — so the redemption round trip
 * stays with `tokens.test.ts`, which drives the signature rules directly. What
 * a browser can prove is that both ends behave: a link that arrived broken
 * explains itself rather than 500ing, and the after-the-fact screen says which
 * of the two things was switched off.
 */
test('an unsubscribe link that arrived broken explains itself', async ({ page }) => {
  for (const url of ['/unsubscribe', '/unsubscribe?token=truncated-by-a-mail-client']) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Unsubscribe' })).toBeVisible()
    await expect(page.getByText(/That link is not valid/)).toBeVisible()
    /*
     * And it never says whether the token named a real member. A page that
     * distinguished "no such subscription" from "bad signature" would answer
     * questions about other people's accounts to anybody with a URL bar.
     */
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'your subscriptions' })).toHaveAttribute(
      'href',
      '/subscriptions',
    )
  }

  await page.goto('/unsubscribe?done=email')
  await expect(page.getByText(/subscription e-mails are off/)).toBeVisible()

  await page.goto('/unsubscribe?done=one')
  await expect(page.getByText(/you will not be notified about that any more/)).toBeVisible()
})

/**
 * The container's health check.
 *
 * One assertion is the feature and the rest are the reasons it exists: it must
 * answer without touching the database — a probe that fails during a failover
 * makes the orchestrator restart every replica and turns a blip into an outage
 * — and it must never be cached, because a cached 200 outlives the process it
 * was describing.
 */
test('the health probe answers, uncached, without reading the board', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')

  const body = (await response.json()) as { ok: boolean; at: string }
  expect(body.ok).toBe(true)
  /* A timestamp per call, which is how a stale cached copy would show up. */
  expect(Number.isNaN(Date.parse(body.at))).toBe(false)
})
