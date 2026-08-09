/**
 * The administrator's control panel, in a browser, with JavaScript off.
 *
 * The panel had **no browser coverage at all**, for a structural reason rather
 * than an oversight: a registration always lands in the Registered group, and
 * the seeded `admin` carried a hash nothing could match — so nothing in the
 * suite could open the door. `e2e/support/database.ts` now gives `admin` a real
 * password, and this is the first thing through it.
 *
 * What is asserted here is deliberately not "the screen renders". A settings
 * page that saves into a void renders perfectly. Every test below changes
 * something in the panel and then **reads the board** to see it: a setting in
 * the header, a forum in the index and the jump box, an announcement above the
 * listings, a word filter inside a post that was written before the filter
 * existed. The seam between the panel and the board is the thing only a browser
 * can walk.
 */
import { expect, test } from '@playwright/test'

import { STAFF, STAFF_PASSWORD } from './support/config'
import { enterAdminPanel, signInAsAdmin, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/**
 * The panel asks for the password again, on a browser that is already signed in.
 *
 * That is the ACP's whole front door and it is worth stating as its own test:
 * the board session and the control-panel session are separate, the second is
 * short-lived, and a stolen board cookie is therefore not a control panel. The
 * two denials also produce different sentences — "you have never opened this"
 * and "yours ran out" — and the panel used to print the second for both, which
 * told every new administrator that a session they had never had had expired.
 */
test('the panel is a second door, even for an administrator already signed in', async ({
  page,
}) => {
  await signInAsAdmin(page)

  /* Signed in to the board, and the panel still asks. */
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Control panel' })).toBeVisible()
  await expect(page.getByText('Confirm your password.')).toBeVisible()
  /* Never signed in here, so nothing has "expired". */
  await expect(page.getByText(/expired/i)).toHaveCount(0)

  /* A wrong password does not open it. */
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0)

  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  /* Leaving closes the panel and leaves the board session alone. */
  await page.getByRole('button', { name: 'Leave the control panel' }).click()
  await page.goto('/admin')
  await expect(page.getByText('Confirm your password.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
})

/**
 * A setting saved in the panel changes the board.
 *
 * `board.name` because it is the one setting a reader sees without looking for
 * it — it is the header, and it is the page title. A value equal to its default
 * is not stored, so this also exercises the write of an override rather than
 * the no-op of agreeing with the registry.
 */
test('a board setting saved in the panel reaches the header and the title', async ({ page }) => {
  await enterAdminPanel(page)

  const name = `Meith E2E ${Date.now().toString(36)}`
  await page.goto('/admin/settings?group=board')
  await page.getByLabel('Board name').fill(name)
  await page.getByRole('button', { name: 'Save settings' }).click()

  /* The panel keeps what it was given rather than reverting on reload. */
  await page.goto('/admin/settings?group=board')
  await expect(page.getByLabel('Board name')).toHaveValue(name)

  /*
   * The board, which is the assertion that matters — the settings table is
   * read through a cached global, so "saved" and "in force" are two different
   * facts and only this one is the feature.
   */
  await page.goto('/')
  await expect(page.getByRole('banner').getByText(name)).toBeVisible()
  await expect(page).toHaveTitle(new RegExp(name.replace(/ /g, '\\s')))

  /* Put it back, so the specs that read the header are not looking at ours. */
  await page.goto('/admin/settings?group=board')
  await page.getByLabel('Board name').fill('Meith')
  await page.getByRole('button', { name: 'Save settings' }).click()
})

/**
 * A forum created in the panel is a forum on the board.
 *
 * Three surfaces, because a forum that exists in one and not the others is the
 * failure this catches: the index it renders on, the jump box it has to appear
 * in, and its own page — which is the one that used to 404 on a freshly
 * installed board, because the cached tree had never been told (D117).
 */
test('a forum created in the panel appears on the index, in the jump box, and opens', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const title = `Test Forum ${Date.now().toString(36)}`
  const slug = `e2e-forum-${Date.now().toString(36)}`

  await page.goto('/admin/forums')
  await page.getByLabel('Kind').selectOption('forum')
  /*
   * By the option's own value. The labels in this box carry figure-space
   * indentation so the tree is legible inside a `<select>`, which makes an
   * exact-label match a test of the padding — and `selectOption` matches a
   * label exactly or not at all.
   */
  const inside = page.getByLabel('Inside')
  await inside.selectOption(
    (await inside.locator('option', { hasText: 'Main' }).first().getAttribute('value')) ?? '',
  )
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Slug').fill(slug)
  await page.getByLabel('Description').fill('Created by the browser suite.')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText(`forum · /${slug}`)).toBeVisible()

  await page.goto('/')
  const listed = page.getByRole('link', { name: title })
  await expect(listed).toBeVisible()

  /* The jump box lists it, by value — the labels carry figure-space padding. */
  const jump = page.getByRole('combobox', { name: 'Jump to forum' })
  const option = jump.locator('option', { hasText: title })
  await expect(option).toHaveCount(1)

  /* And it opens, rather than 404ing behind a tree nobody invalidated. */
  await listed.click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('Created by the browser suite.')).toBeVisible()
})

/**
 * An announcement is not a pinned thread, and this is where the difference
 * shows: it renders above the listings, on a page nobody posted it to.
 */
test('an announcement written in the panel renders above the forums', async ({ page }) => {
  await enterAdminPanel(page)

  const title = `Scheduled downtime ${Date.now().toString(36)}`
  await page.goto('/admin/content/announcements')

  /*
   * Scoped to the composer, by the one control only it has. Every announcement
   * already on the board renders its own edit form with the same field names
   * and the same hints — they differ in the verb on the button, Add against
   * Save — so an unscoped `Title` is ambiguous the moment this screen has one
   * row on it, which on a suite that shares a database is the second time this
   * test runs.
   */
  const composer = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
  await composer.getByLabel('Title').fill(title)
  await composer.getByLabel('Message').fill('The board will be **down** on Sunday.')
  await composer.getByLabel('Where').selectOption({ label: 'The whole board' })
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('None. The board shows no announcements.')).toHaveCount(0)

  /*
   * On the index, rendered as Markdown by the same renderer a post goes
   * through — which is the claim the panel's own help text makes, and the
   * reason the assertion is on the `<strong>` rather than on the word.
   *
   * An `<article>`, not a landmark: an announcement is deliberately styled as a
   * small piece the board wrote rather than as an alert bar, so that people do
   * not learn to dismiss it the way they dismiss a flash notice.
   */
  await page.goto('/')
  const announcement = page.locator('article', { hasText: title }).first()
  await expect(announcement).toBeVisible()
  await expect(announcement.locator('strong')).toHaveText('down')

  /*
   * The byline carries the author's group colour, like every other name on the
   * board. Announcements were the one call site that did not, which is the
   * *partial* failure F73's colour was specified against — the same person
   * green in a thread and grey above it reads as a rendering bug.
   */
  await expect(announcement.getByRole('link', { name: 'admin', exact: true })).toHaveClass(
    /\bgname-3\b/,
  )

  /* And a guest sees it: a board-wide notice is not a members-only one. */
  const guest = await page.context().browser()!.newContext({ javaScriptEnabled: false })
  const guestPage = await guest.newPage()
  await guestPage.goto('/')
  await expect(guestPage.getByText(title)).toBeVisible()
  await guest.close()

  /*
   * Taken down again, and this is not tidiness — it is required.
   *
   * A board-wide announcement renders above the listings on the index *and on
   * every forum page*, for every spec that runs after this one. Leaving one
   * behind puts an extra `admin` byline at the top of `/100-announcements`,
   * which is where `group-identity-no-js.spec.ts` reaches for "the first link
   * called admin" — so a spec about group colours starts failing because a spec
   * about the control panel wrote a notice. The suite shares one database; what
   * a spec adds to every page, it takes back.
   */
  await page.goto('/admin/content/announcements')
  /*
   * Found by its own title *as a value*, not as text: a listed announcement is
   * an edit form, so its title lives in an `<input value>` — which no text
   * locator can see.
   */
  const row = page.locator(`input[name="title"][value="${title}"]`)
  await expect(row).toHaveCount(1)

  /*
   * Remove is its **own form**, beside the edit one rather than inside it —
   * a destructive submit that shares a form with a Save posts the whole edit
   * with it — so the two are joined only by the announcement's id.
   */
  const announcementId = await page
    .locator('form')
    .filter({ has: row })
    .locator('input[name="id"]')
    .inputValue()

  await page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${announcementId}"]`) })
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await expect(page.locator(`input[name="title"][value="${title}"]`)).toHaveCount(0)

  await page.goto('/')
  await expect(page.getByText(title)).toHaveCount(0)
})

/**
 * A word filter is applied **when a post is shown**, never to what is stored.
 *
 * So the post this test filters is one that was written before the filter
 * existed — which is the property the panel promises in as many words, and the
 * only one worth a browser: a filter applied at write time would pass a unit
 * test and leave every old post unfiltered.
 */
test('a word filter added in the panel rewrites a post written before it', async ({
  browser,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const memberPage = await memberContext.newPage()

  try {
    await signUp(memberPage, 'filtered')

    const word = `frobnicate${Date.now().toString(36)}`
    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: 'New thread' }).click()
    await memberPage.getByLabel('Subject').fill(`Filter me ${Date.now().toString(36)}`)
    await memberPage.getByLabel('Message').fill(`Nobody should ${word} in here.`)
    await memberPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(memberPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = memberPage.url()

    /* As written. */
    await expect(memberPage.getByText(`Nobody should ${word} in here.`)).toBeVisible()

    await enterAdminPanel(adminPage)
    await adminPage.goto('/admin/content')
    /*
     * Scoped to the composer, twice over. This screen holds three vocabularies
     * — filters, prefixes and smilies — each adding with a button called Add,
     * and every filter already on the board renders its own edit form with the
     * same field names. "Blank removes the word" is the hint only the new-filter
     * form carries.
     */
    const composer = adminPage.locator('form').filter({ hasText: 'Blank removes the word' })
    await composer.getByLabel('Match').fill(word)
    await composer.getByLabel('Show instead').fill('tinker')
    await composer.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(adminPage.getByText('No filters. Posts show as written.')).toHaveCount(0)

    /*
     * The post that already existed now reads differently.
     *
     * **This assertion found a real bug**, and it is the reason the test reads
     * the board rather than the panel. The filter set is read through Next's
     * data cache under `CacheTags.wordFilters()`, and the board's own
     * invalidation goes through the configured cache driver — which, on a
     * `CACHE_DRIVER=memory` board, swept its own map and nothing else. The row
     * was written, the panel confirmed it, and every post on the board went on
     * rendering the old word *indefinitely*, because nothing would ever expire
     * the entry. See `buildCache` in `packages/drivers/src/resolve.ts`.
     *
     * Polled rather than asserted once: `revalidateTag` is called with the
     * `max` profile, which is stale-while-revalidate by design — the first read
     * after an invalidation is allowed to be the old one while the refresh
     * happens behind it. A single hard assertion here would be asserting that
     * the board does *not* do the thing it deliberately does.
     */
    await expect(async () => {
      await memberPage.goto(threadUrl)
      await expect(memberPage.getByText('Nobody should tinker in here.')).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] })

    await expect(memberPage.getByText(word)).toHaveCount(0)
  } finally {
    await adminContext.close()
    await memberContext.close()
  }
})

/**
 * The log is the panel's accountability, and it is the one screen that has to
 * know about every other one.
 *
 * Asserted on an action this test performs itself rather than on whatever the
 * tests above left behind, because the suite shares a database and "there are
 * rows in the log" is not the claim.
 */
test('the admin log records the panel action that caused it', async ({ page }) => {
  await enterAdminPanel(page)

  /* Signing in is itself an administrative act, and the first one logged. */
  await page.goto('/admin/log')
  const entry = page.locator('li', { hasText: 'admin.signed_in' }).first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText(STAFF.admin.username)
  /* The address is stored as a prefix, never in full — F09. */
  await expect(entry).toContainText('from 127.0.0.0/24')

  /* The filter is the address bar, so a log this size stays usable. */
  await page.goto('/admin/log?action=admin.signed_in')
  await expect(page.locator('li', { hasText: 'admin.signed_in' }).first()).toBeVisible()
})

/**
 * The system screen is the operator's, and its two buttons do real work.
 *
 * The search backfill is the one worth driving from here: it is the path an
 * imported board takes, it is bounded to a batch by design, and the number
 * beside it is the only place on the board that says how much is not yet
 * searchable.
 */
test('the system screen indexes a batch of posts, and the count moves', async ({ page }) => {
  await enterAdminPanel(page)

  /*
   * The pending half of the line is only rendered while there *is* one — a
   * fully indexed board reads "N indexed." and nothing else — so the two
   * numbers are read separately rather than out of one sentence that changes
   * shape at zero.
   */
  /*
   * `p:not([role=status])`, because pressing the button leaves a status notice
   * on the page that also counts — "6 indexed. Every post on the board…" beside
   * the line's own "9 indexed." An unscoped text match finds both, and reads
   * whichever it happens to resolve first.
   */
  const line = async (): Promise<string> =>
    page.locator('p:not([role="status"])').filter({ hasText: /\d+ indexed/ }).innerText()
  const indexed = async (): Promise<number> => Number(/(\d+) indexed/.exec(await line())?.[1])
  const pending = async (): Promise<number> =>
    Number(/(\d+) not yet searchable/.exec(await line())?.[1] ?? 0)

  await page.goto('/admin/system')
  const indexedBefore = await indexed()

  if ((await pending()) > 0) {
    await page.getByRole('button', { name: /Index the next batch/ }).click()
    expect(await indexed()).toBeGreaterThan(indexedBefore)
  }

  /* The volumes panel is the board as the operator sees it, not a placeholder. */
  await expect(page.getByText(/\d+ members/)).toBeVisible()
  await expect(page.getByText(/\d+ posts/)).toBeVisible()
})

/**
 * Two different refusals, and the difference is the design.
 *
 * `proxy.ts` states the rule in as many words: **a signed-out visitor is sent
 * to sign in; a signed-in visitor without the permission gets a 404.** They are
 * different questions. Somebody with no cookie probably has an account and
 * needs the form; somebody already signed in who still cannot reach the panel
 * should not be told there is one.
 *
 * That rule had no browser coverage, and it is exactly the sort of thing that
 * decays into "both get a login page" — which would hand the panel's existence
 * to anybody who typed the address — or into "both get a 404", which would
 * strand an administrator on a machine where their session had lapsed.
 */
test('the panel sends a guest to sign in and answers a member with a 404', async ({ browser }) => {
  const guestContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  const memberPage = await memberContext.newPage()

  try {
    for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/log']) {
      await guestPage.goto(url)
      /* The form, and it remembers where they were going. */
      await expect(guestPage, `guest ${url}`).toHaveURL(
        `/login?next=${encodeURIComponent(url)}`,
      )
      await expect(guestPage.getByRole('button', { name: 'Sign in' })).toBeVisible()
    }

    await signUp(memberPage, 'nopanel')
    for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/log']) {
      expect((await memberPage.goto(url))?.status(), `member ${url}`).toBe(404)
    }
  } finally {
    await guestContext.close()
    await memberContext.close()
  }
})
