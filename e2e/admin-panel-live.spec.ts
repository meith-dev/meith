/**
 * The control panel **with JavaScript on** — the only spec on this board that
 * runs that way, and it exists because of what the others cannot see.
 *
 * Every other spec here disables scripting, deliberately: the board's claim is
 * that a native `<form>` does the work and the islands are optional, so a suite
 * that tested the enhanced path would prove the opposite of what is claimed.
 *
 * The cost of that discipline is a real blind spot, and this file is it. With
 * scripting off a form post is a full navigation, so the page the operator lands
 * on is freshly rendered **whatever the action did about caching**. With
 * scripting on — which is how an administrator actually uses the panel — the
 * action returns into a page that keeps the RSC payload it was rendered with,
 * and a list that its own action just changed goes stale unless the action says
 * `revalidatePath`.
 *
 * That is not hypothetical. The 7 August 2026 audit found it on `/admin/forums`
 * and `/admin/groups` and fixed both; the same defect was still on the content
 * screens and on API tokens, and nothing could have caught it, because the only
 * browser coverage the panel has runs in the one mode where the bug is
 * invisible. Issuing a token showed the secret above a table that did not
 * contain it, and revoking one left the row reading **live** — the last thing an
 * operator containing a leak should be shown.
 *
 * ## And it was still on five more screens
 *
 * Everything below the token test is the rest of that sweep. The member screen,
 * the forum's moderators, the theme list, the maintenance counts and the
 * settings alerts were all reading a payload their own action had just made
 * wrong — so banning somebody returned "Banned. Their sessions have been
 * revoked." above a section still offering **Ban this member**, switching a
 * theme off left its row still offering **Turn off**, and indexing the backlog
 * printed "every post on the board is searchable" directly under a line that
 * still said how many were not.
 *
 * Each of those has the same shape and the same consequence: the operator has no
 * reason to believe the first press worked, so they press again. Each test below
 * therefore asserts on the *screen*, never on the notice — a notice is what the
 * action said, and the bug is what the page shows beside it.
 *
 * ## Reading these assertions
 *
 * A list row is often an **edit form**, so what it holds is an `<input value>`
 * rather than text. `innerText` does not see an input's value; measuring these
 * screens with it reports every list as empty and every fix as a failure. The
 * helpers below read values where values are what there is.
 */
import { expect, test, type Page } from '@playwright/test'

import { STAFF } from './support/config'
import { enterAdminPanel, signUp } from './support/session'

/** The patterns the word-filter list currently holds, from its edit forms. */
async function filterPatterns(page: Page): Promise<string[]> {
  return page
    .locator('input[name="pattern"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

test('a word filter added in the panel is in the list without a reload', async ({ page }) => {
  await enterAdminPanel(page)

  const word = `frobnicate${Date.now().toString(36)}`
  await page.goto('/admin/content')

  /*
   * Scoped by the hint only the new-filter form carries: every existing filter
   * renders an edit form with the same field names.
   */
  const composer = page.locator('form').filter({ hasText: 'Blank removes the word' })
  await composer.getByLabel('Match').fill(word)
  await composer.getByLabel('Show instead').fill('tinker')
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  /* The action reports success… */
  await expect(page.getByText('Added.')).toBeVisible()

  /* …and the list is the thing that has to agree with it. */
  await expect.poll(() => filterPatterns(page), { timeout: 15_000 }).toContain(word)
})

/**
 * The token table, which is the one that mattered most.
 *
 * Both halves in one test because they are one journey and the second is only
 * meaningful after the first: a token appears when it is issued, and its state
 * changes when it is revoked, on a screen nobody reloaded.
 */
test('a token issued and then revoked is listed and then marked, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const name = `e2e live ${Date.now().toString(36)}`
  await page.goto('/admin/api-tokens')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('checkbox', { name: 'forums:read', exact: true }).check()
  await page.getByRole('button', { name: 'Issue token' }).click()

  /* The secret, and the row it belongs to, on the same screen. */
  await expect(page.getByText('Copy this now')).toBeVisible()
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText('live')

  await row.getByRole('button', { name: /Revoke/ }).click()

  /*
   * The state word, not the button: "Revoke" is on the row either way, and a
   * row that still says "live" after a revoke is precisely the failure — an
   * operator is reading this table to confirm that a leaked token is dead.
   */
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('revoked', {
    timeout: 15_000,
  })
})

/**
 * An announcement, which is the third screen with the same shape.
 *
 * Included rather than trusted-by-analogy: the three screens are three action
 * modules, and "the fix was applied to all of them" is the kind of claim that is
 * true when it is written and false a release later.
 */
test('an announcement added in the panel is in the list without a reload', async ({ page }) => {
  await enterAdminPanel(page)

  const title = `Live notice ${Date.now().toString(36)}`
  await page.goto('/admin/content/announcements')

  const composer = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
  await composer.getByLabel('Title').fill(title)
  await composer.getByLabel('Message').fill('Written with the scripts running.')
  await composer.getByRole('button', { name: 'Add', exact: true }).click()

  /* Its edit form is the list entry, so the title is a value rather than text. */
  const titles = () =>
    page
      .locator('input[name="title"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))

  await expect.poll(titles, { timeout: 15_000 }).toContain(title)

  /*
   * Taken down again. A board-wide announcement renders above the listings on
   * the index and on every forum page, so leaving one behind changes what every
   * later spec in the run sees — and the suite shares one database.
   */
  const row = page.locator(`input[name="title"][value="${title}"]`)
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
  await expect.poll(titles, { timeout: 15_000 }).not.toContain(title)
})

/**
 * The member screen, which is the one where pressing twice does damage.
 *
 * A ban revokes their sessions, moves their group and locks them out. If the
 * screen still offers **Ban this member** afterwards — which it did — the
 * operator's reasonable conclusion is that nothing happened, and the second
 * press is refused with *"That user is already banned"* on a member who is, in
 * fact, banned. The confirmation an operator needs is the section becoming the
 * ban, not a sentence above a form.
 */
test('a member banned in the panel is shown as banned, without a reload', async ({
  page,
  browser,
}) => {
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  try {
    const username = await signUp(memberPage, 'live_ban')

    await enterAdminPanel(page)
    await page.goto('/admin/users')
    await page.getByLabel('Username contains').fill(username)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('link', { name: `Edit ${username}` }).click()

    await page.getByLabel('Length in days').fill('3')
    await page.getByLabel('Staff note').fill('Banned by the browser suite.')
    await page.getByRole('button', { name: 'Ban this member' }).click()

    /* The ban itself, on a screen nobody reloaded. */
    await expect(page.getByText(/^Banned until/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Staff note: Banned by the browser suite.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lift this ban' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ban this member' })).toHaveCount(0)

    /* And lifting it puts the form back, on the same unreloaded screen. */
    await page.getByRole('button', { name: 'Lift this ban' }).click()
    await expect(page.getByRole('button', { name: 'Ban this member' })).toBeVisible({
      timeout: 15_000,
    })

    /* A rename reaches the heading, which is the same payload going stale. */
    await page.getByLabel('Username').fill(`${username}x`)
    await page.getByRole('button', { name: 'Save account' }).click()
    await expect(page.getByRole('heading', { name: `${username}x`, level: 1 })).toBeVisible({
      timeout: 15_000,
    })
  } finally {
    await memberContext.close()
  }
})

/**
 * The forum's moderators, which is a list its own two buttons rewrite.
 *
 * Removing an appointment and being left looking at the person you just removed
 * is the worst reading of this bug: revoking moderation is something somebody
 * does *because* of what that person did, and the screen said it had not
 * happened.
 */
test('a moderator appointed and then removed is listed and unlisted, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/forums')
  await page.getByRole('link', { name: 'Options for Off Topic' }).click()

  const appoint = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save appointment' }) })
  await appoint.getByLabel('Member').fill(STAFF.moderator.username)
  await appoint.getByRole('checkbox', { name: 'Stick threads' }).check()
  await appoint.getByRole('button', { name: 'Save appointment' }).click()

  const listed = page.locator('li').filter({ hasText: STAFF.moderator.username })
  await expect(listed).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Nobody moderates this forum.')).toHaveCount(0)

  await listed.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Nobody moderates this forum.')).toBeVisible({ timeout: 15_000 })
})

/**
 * The theme list, whose buttons *are* its state.
 *
 * A row that still offers **Turn off** after being turned off is the control an
 * administrator reaches for when a theme is breaking the board, telling them it
 * did not work.
 */
test('a theme turned off is marked off, without a reload', async ({ page }) => {
  await enterAdminPanel(page)
  await page.goto('/admin/themes')

  try {
    await page.getByRole('button', { name: 'Turn Midnight off' }).click()
    await expect(page.getByRole('button', { name: 'Turn Midnight on' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('li').filter({ hasText: 'midnight ·' })).toContainText('Off')
  } finally {
    /* Back on: the appearance control on every page offers it. */
    await page.goto('/admin/themes')
    if ((await page.getByRole('button', { name: 'Turn Midnight on' }).count()) > 0) {
      await page.getByRole('button', { name: 'Turn Midnight on' }).click()
    }
  }

  await expect(page.getByRole('button', { name: 'Turn Midnight off' })).toBeVisible({
    timeout: 15_000,
  })
})

/**
 * The maintenance screen, which is almost entirely counts — and each button's
 * own label carries one of them.
 *
 * This is the assertion `admin-no-js.spec.ts` used to make and structurally
 * could not: with scripting off the browser reloads, so the number was always
 * right there. Here the notice and the line it contradicts are on screen
 * together, which is what an administrator actually sees.
 */
test('the search-index count agrees with the button that changed it, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/system')

  /*
   * `p:not([role=status])` — pressing the button leaves a status notice that
   * also says "N indexed", and the whole point here is to read the *line* rather
   * than the notice.
   */
  const line = page.locator('p:not([role="status"])').filter({ hasText: /\d+ indexed/ })
  const pending = Number(/(\d+) not yet searchable/.exec(await line.innerText())?.[1] ?? '0')

  /*
   * The seeded board is imported rather than posted — a bulk insert leaves F72's
   * index unwritten — so there is a backlog here, and this spec is the first to
   * press the button. Asserted rather than assumed: a vacuous version of this
   * test would pass for ever.
   */
  expect(pending, 'the seeded board has posts that are not yet searchable').toBeGreaterThan(0)

  await page.getByRole('button', { name: `Index the next batch of ${pending}` }).click()
  await expect(page.getByText(/Every post on the board is searchable\./)).toBeVisible()

  /* The line, and the button's own label, on a screen nobody reloaded. */
  await expect(line).not.toContainText('not yet searchable', { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Nothing to index' })).toBeVisible()
})

/**
 * The settings screen, whose two alerts are the reason to open it.
 *
 * "This board does not know its own address" must go the moment an address is
 * saved — it is a `role="alert"` about password-reset links arriving with no
 * link in them, and one that stays up after being fixed teaches an operator to
 * ignore the next one.
 */
test('saving the board address takes the warning off the settings screen, without a reload', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/settings?group=board')

  const alert = page.getByText('This board does not know its own address')
  await expect(alert, 'the e2e board runs with no APP_URL, so the alert is up').toBeVisible()

  await page.getByLabel('Board address').fill('http://127.0.0.1:3001')
  await page.getByRole('button', { name: 'Save settings' }).click()

  await expect(alert).toHaveCount(0, { timeout: 15_000 })

  /* Put it back, so the specs that read this screen see the board they expect. */
  await page.getByLabel('Board address').fill('')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(alert).toBeVisible({ timeout: 15_000 })
})
