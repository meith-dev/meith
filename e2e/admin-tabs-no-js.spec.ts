/**
 * Every remaining section of the control panel, in a browser, with JavaScript
 * off.
 *
 * ## Why a second admin spec rather than more of the first
 *
 * `admin-no-js.spec.ts` opens the panel's front door and walks the four screens
 * that reach the *board*: a setting in the header, a forum in the index, an
 * announcement above the listings, a word filter inside somebody's post. That is
 * the seam it was written for, and it is deliberately not a tour.
 *
 * The rail has twelve sections. Seven of them — groups, members, prefixes and
 * smilies, the registration challenge, themes, plugins, the maintenance screen —
 * had no browser coverage at all, which on this board means no coverage of the
 * *wiring*: an action module can be complete and unit-tested and still be
 * attached to nothing, and only a browser notices. This file is those sections.
 *
 * ## What each test is allowed to leave behind: nothing
 *
 * The suite shares one database and one board. A prefix left in the composer, a
 * theme left switched off, a registration question left switched on — each of
 * those changes what a *later, unrelated* spec sees, and the failure it causes
 * looks like a bug in whatever ran next. So every test here puts back what it
 * changed, and the ones that change something board-wide do it in a `finally`,
 * because a test that fails half way through must not also poison the run.
 *
 * ## Scripting off, like the rest of the suite
 *
 * The board's claim is that a native `<form>` does the work; the panel is where
 * that is least likely to be true and most annoying if it is not, because an
 * administrator fixing a broken board is exactly the person whose scripts may
 * not be running. `admin-panel-live.spec.ts` is the deliberate counterpart —
 * the same panel with scripting on, where a stale list is visible and here it
 * cannot be.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import { STAFF, STAFF_PASSWORD } from './support/config'
import { PASSWORD, enterAdminPanel, signIn, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/** The seeded forum this file experiments on: empty, and nothing else reads it. */
const OFF_TOPIC = '/201-off-topic'

/** A short, unique suffix, so two runs against one database do not collide. */
const mint = (label: string): string => `${label}${Date.now().toString(36)}`

/**
 * The values a repeated field currently holds.
 *
 * A list row in this panel is usually an **edit form**, so what it holds is an
 * `<input value>` rather than text — `innerText` does not see an input's value,
 * and measuring these screens with it reports every list as empty and every
 * write as a failure.
 */
async function fieldValues(page: Page, name: string): Promise<string[]> {
  return page
    .locator(`input[name="${name}"]`)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

/**
 * The form that *adds* a row, as opposed to the ones editing rows already there.
 *
 * Every screen in this panel puts a composer under a list whose rows carry the
 * same field names, so an unscoped `getByLabel('Title')` is ambiguous the moment
 * the screen has one row on it — which, on a suite that shares a database, is
 * the second time a test runs. The verb on the button is what tells them apart.
 */
function composer(page: Page, verb: string): Locator {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: verb, exact: true }) })
}

/**
 * Choose the option whose label *starts* with `prefix`, by its value.
 *
 * Group menus label themselves `Registered (5)` — the count is the whole point,
 * since deleting a group and moving its members are both "how many people does
 * this affect?" questions — so the label is not a constant a spec can name.
 * `selectOption` matches a label exactly or not at all, so this reads the value
 * off the option instead. The same trick `admin-no-js.spec.ts` uses for the
 * figure-space indentation in the forum tree.
 */
async function selectStartingWith(select: Locator, prefix: string): Promise<void> {
  const value = await select
    .locator('option')
    .filter({ hasText: new RegExp(`^${prefix}`) })
    .first()
    .getAttribute('value')

  expect(value, `no option beginning "${prefix}"`).not.toBeNull()
  await select.selectOption(value ?? '')
}

/**
 * Take out the list row whose `field` holds `value`.
 *
 * Remove is its **own form**, beside the edit one rather than inside it — a
 * destructive submit sharing a form with a Save would post the whole edit with
 * it — so the row is the enclosing element rather than either form.
 *
 * Found by the innermost `<div>` holding both, and *not* by the hidden id the
 * two forms share: the Content screen lists smilies and directives from
 * different tables on one page, so `id=1` names two unrelated rows and matches
 * both of their Remove buttons.
 *
 * The value is matched as an **attribute**, which is what tells a stored row
 * from a composer somebody has typed into: React writes `value` on the element
 * for a `defaultValue`, and typing changes only the property.
 */
async function removeRow(page: Page, field: string, value: string): Promise<void> {
  const row = page
    .locator('div')
    .filter({ has: page.locator(`input[name="${field}"][value="${value}"]`) })
    .filter({ has: page.getByRole('button', { name: 'Remove', exact: true }) })
    .last()

  if ((await row.count()) === 0) return
  await row.getByRole('button', { name: 'Remove', exact: true }).click()
}

/* ------------------------------------------------------------------ *
 * The rail
 * ------------------------------------------------------------------ */

/**
 * Every section opens, and the panel says which one you are in.
 *
 * The cheapest test in the file and the one most likely to fail first: a screen
 * that throws on render answers 500, and a panel where one section of twelve is
 * broken looks entirely fine from every other section. `aria-current` is
 * asserted with it because the rail is the only thing telling an operator where
 * they are — the ACP has no breadcrumb — and a rail that highlights nothing is
 * how somebody edits the wrong screen.
 */
test('every section in the rail opens, and marks itself as where you are', async ({
  page,
}) => {
  await enterAdminPanel(page)

  /*
   * `marked` is what the rail lights, which is not always the section's own
   * name: the tree marks the **deepest** entry containing the address, and
   * `/admin/settings` redirects to the settings group it is about to show — so
   * what is lit there is that group, `Board`, under a "Board settings" link that
   * stays a link. That is the rule `deepestNavHref` implements, and asserting
   * the section name instead would be asserting it away.
   */
  const sections = [
    ['Overview', '/admin', 'Overview'],
    ['Board', '/admin/settings', 'Board settings'],
    ['Forums', '/admin/forums', 'Forums'],
    ['Groups', '/admin/groups', 'Groups'],
    ['Users', '/admin/users', 'Members'],
    ['Content', '/admin/content', 'Content'],
    ['Anti-spam', '/admin/antispam', 'Anti-spam'],
    ['Themes', '/admin/themes', 'Themes'],
    ['Plugins', '/admin/plugins', 'Plugins'],
    ['API tokens', '/admin/api-tokens', 'API tokens'],
    ['System', '/admin/system', 'System health'],
    ['Admin log', '/admin/log', 'Admin log'],
  ] as const

  for (const [marked, href, heading] of sections) {
    const response = await page.goto(href)
    expect(response?.status(), `${href} answered`).toBe(200)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()

    /*
     * Asserted by *count*, not by visibility. The shell renders the rail twice —
     * a `<details>` for a phone and a sticky list above `lg` — with CSS hiding
     * one, so exactly one of the two matches is invisible at any width, and a
     * `toBeVisible` on the first match would really be a test of the viewport.
     *
     * By its text rather than its href: `/admin/settings` redirects to the group
     * it is about to show, so the rail's entry for it carries a query string
     * this list would otherwise have to know about.
     */
    await expect(
      page.locator('[aria-current="page"]').filter({ hasText: marked }),
      `${href} lights ${marked} in the rail`,
    ).not.toHaveCount(0)
  }

  /* And the sub-pages, which are reachable only from their own section. */
  for (const [href, heading] of [
    ['/admin/groups/promotions', 'Promotions'],
    ['/admin/groups/memberships', 'Mass membership change'],
    ['/admin/users/mail', 'Mass mail'],
    ['/admin/users/prune', 'Prune members'],
    ['/admin/content/announcements', 'Announcements'],
    ['/admin/content/attachments', 'Attachments'],
  ] as const) {
    const response = await page.goto(href)
    expect(response?.status(), `${href} answered`).toBe(200)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})

/* ------------------------------------------------------------------ *
 * Board settings
 * ------------------------------------------------------------------ */

/**
 * Saving one group must not touch another, and this is the test of the field
 * that makes that true.
 *
 * The screen shows one group at a time, and a checkbox that is not on the page
 * submits nothing — which is indistinguishable from a checkbox somebody cleared.
 * Without the hidden `keys` field, saving the Board group would therefore turn
 * off **every boolean setting on the board**, silently, including ones the
 * operator has never seen. `settings-form.tsx` calls that field load-bearing;
 * this is the browser proving it, which no unit test of the action can do
 * because the bug would be in what the *form* submits.
 */
test('saving one settings group leaves the settings it is not showing alone', async ({
  page,
}) => {
  await enterAdminPanel(page)

  /* A boolean in a group the Board screen does not show. */
  await page.goto('/admin/settings?group=antispam')
  await expect(page.getByLabel('Hidden-field trap')).toBeChecked()

  await page.goto('/admin/settings?group=board')
  await page.getByLabel('Board description').fill(`Checked by the browser suite ${mint('')}`)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText(/Saved, and the caches/)).toBeVisible()

  await page.goto('/admin/settings?group=antispam')
  await expect(
    page.getByLabel('Hidden-field trap'),
    'a save from another group must not clear a checkbox it never showed',
  ).toBeChecked()

  /* The search reaches every group, which is the other half of this screen. */
  await page.goto('/admin/settings?q=flood')
  await expect(page.getByText(/matches for .flood., across every group/)).toBeVisible()
  await expect(page.getByText('posting.flood_seconds')).toBeVisible()
  await expect(page.getByText('search.flood_seconds')).toBeVisible()
})

/* ------------------------------------------------------------------ *
 * Forums
 * ------------------------------------------------------------------ */

/**
 * A forum's options and its permission matrix, read from the board.
 *
 * Off Topic rather than one of the busy forums: it is empty, nothing else in the
 * suite reads it, and denying Guests the right to *see* a forum other specs walk
 * through would be this file breaking them.
 *
 * The permission half restores in a `finally` — a denial left behind is
 * invisible to an administrator and changes what every signed-out visitor sees.
 */
test('a forum’s options and its permissions decide what the board does', async ({
  page,
  browser,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/forums')
  await page.getByRole('link', { name: 'Options for Off Topic' }).click()
  await expect(page.getByRole('heading', { name: 'Off Topic', level: 1 })).toBeVisible()

  const description = `Renamed by the browser suite ${mint('')}`
  await page.getByLabel('Description').fill(description)
  /* Closed for posting: a flag whose consequence is a refusal, not a hidden link. */
  await page.getByLabel('Open for posting').uncheck()
  await page.getByRole('button', { name: 'Save forum' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  /* The panel keeps what it was given rather than reverting on reload. */
  await page.reload()
  await expect(page.getByLabel('Open for posting')).not.toBeChecked()

  await page.goto(OFF_TOPIC)
  await expect(page.getByText(description)).toBeVisible()

  /*
   * And the board obeys it. The refusal is on the *write*, not on the link:
   * `isOpen` is a property of the forum rather than a permission, so it applies
   * to an administrator too — there is no bypass for "this forum is closed".
   */
  await page.getByRole('link', { name: 'New thread' }).click()
  await expect(page.getByText('Cannot post. This forum is closed to new threads.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Post thread' }),
    'a closed forum offers no composer, not even to an administrator',
  ).toHaveCount(0)

  await page.goto('/admin/forums')
  await page.getByRole('link', { name: 'Options for Off Topic' }).click()
  await page.getByLabel('Open for posting').check()
  await page.getByRole('button', { name: 'Save forum' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  const guestContext = await browser.newContext({ javaScriptEnabled: false })
  const guestPage = await guestContext.newPage()

  try {
    await guestPage.goto(OFF_TOPIC)
    await expect(
      guestPage.getByRole('heading', { name: 'Off Topic' }),
      'a guest can see it before anything is denied',
    ).toBeVisible()

    await page.goto('/admin/forums')
    await page.getByRole('link', { name: 'Permissions for Off Topic' }).click()
    await expect(
      page.getByRole('heading', { name: 'Permissions: Off Topic', level: 1 }),
    ).toBeVisible()

    /*
     * One form per group row, which is the safety property F65 designed for: a
     * save rewrites exactly the row an operator was reading and cannot touch a
     * row they scrolled past.
     */
    const guests = page.locator('form').filter({ hasText: 'Save Guests' })
    await guests.locator('select[name="canView"]').selectOption('deny')
    await guests.getByRole('button', { name: 'Save Guests' }).click()

    /* Stored, and the cell says where its answer comes from. */
    const saved = page.locator('form').filter({ hasText: 'Save Guests' })
    await expect(saved.locator('select[name="canView"]')).toHaveValue('deny')
    await expect(saved.getByText('set here: denied')).toBeVisible()

    /*
     * A forum a guest may not see is not "forbidden", it is **absent** — 404,
     * and gone from the index. Anything else tells a stranger the forum exists.
     */
    expect((await guestPage.goto(OFF_TOPIC))?.status()).toBe(404)
    await guestPage.goto('/')
    await expect(guestPage.getByRole('link', { name: 'Off Topic' })).toHaveCount(0)
  } finally {
    await page.goto('/admin/forums')
    await page.getByRole('link', { name: 'Permissions for Off Topic' }).click()
    const guests = page.locator('form').filter({ hasText: 'Save Guests' })
    await guests.locator('select[name="canView"]').selectOption('inherit')
    await guests.getByRole('button', { name: 'Save Guests' }).click()
    await guestContext.close()
  }

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Off Topic' })).toBeVisible()
})

/**
 * `forum_moderators` had a reader since F48 and no writer at all until F65, so
 * "moderator of this forum" could only be configured with SQL. This is that
 * writer, in a browser: appoint, read back what they may do, and take it away.
 */
test('a moderator appointed in the panel is listed with what they may do', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/forums')
  await page.getByRole('link', { name: 'Options for Off Topic' }).click()
  await expect(page.getByText('Nobody moderates this forum.')).toBeVisible()

  const appoint = composer(page, 'Save appointment')
  await appoint.getByLabel('Member').fill(STAFF.moderator.username)
  await appoint.getByRole('checkbox', { name: 'Stick threads' }).check()
  await appoint.getByRole('checkbox', { name: 'Open and close threads' }).check()
  await appoint.getByRole('button', { name: 'Save appointment' }).click()

  const listed = page.locator('li').filter({ hasText: STAFF.moderator.username })
  await expect(listed).toBeVisible()
  /* The rights in words: a row carrying only a name would be half a screen. */
  await expect(listed).toContainText('Open and close threads')
  await expect(listed).toContainText('Stick threads')

  /* A member who does not exist is named in the refusal rather than swallowed. */
  const missing = composer(page, 'Save appointment')
  await missing.getByLabel('Member').fill('nobody_by_that_name')
  await missing.getByRole('button', { name: 'Save appointment' }).click()
  await expect(page.getByText(/No member called/)).toBeVisible()

  /* Naming a member *and* a group is refused: the table would resolve as two. */
  const both = composer(page, 'Save appointment')
  await both.getByLabel('Member').fill(STAFF.moderator.username)
  await selectStartingWith(both.locator('select[name="groupId"]'), 'Super Moderators')
  await both.getByRole('button', { name: 'Save appointment' }).click()
  await expect(page.getByText('Name a member or choose a group, not both.')).toBeVisible()

  await page
    .locator('li')
    .filter({ hasText: STAFF.moderator.username })
    .getByRole('button', { name: 'Remove' })
    .click()
  await expect(page.getByText('Nobody moderates this forum.')).toBeVisible()
})

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

/**
 * A group is created by **copying** another, and that is not a convenience.
 *
 * The registry's defaults deny everything, so a group created from them is one
 * whose members cannot see the board — which an operator would report as "the
 * new group is broken". The screen refuses to create one without a source, and
 * the copied permissions are what this test reads back.
 */
test('a group is created by copying another, and deleted by rehoming its members', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const key = mint('probe_')
  const title = `Probe ${key}`

  await page.goto('/admin/groups')

  /* Without a source it is refused, in words that name the reason. */
  const create = composer(page, 'Create group')
  await create.getByLabel('Title').fill(title)
  await create.getByLabel('Key').fill(key)
  await create.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByText(/Choose a group to copy permissions from/)).toBeVisible()

  const retry = composer(page, 'Create group')
  await retry.getByLabel('Title').fill(title)
  await retry.getByLabel('Key').fill(key)
  await selectStartingWith(retry.locator('select[name="copyFromGroupId"]'), 'Registered')
  await retry.getByRole('button', { name: 'Create group' }).click()

  const row = page.locator('li').filter({ hasText: title })
  await expect(row).toBeVisible()
  await expect(row).toContainText('0 members')

  try {
    /* What it was copied from, read off its own screen. */
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.locator('input[name="canPostThreads"]')).toBeChecked()
    await expect(
      page.locator('input[name="canAccessAdminCp"]'),
      'a copy of Registered must not be able to open this panel',
    ).not.toBeChecked()

    /* Its identity is editable, and the change is on the group list. */
    await page.getByLabel('Description').fill('Made by the browser suite.')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    await page.goto('/admin/groups')
    await expect(page.locator('li').filter({ hasText: title })).toContainText(
      'Made by the browser suite.',
    )

    /* And a permission of its own, which is what a group is. */
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await page.locator('input[name="canPostPolls"]').uncheck()
    await page.getByRole('button', { name: 'Save permissions' }).click()
    await page.reload()
    await expect(page.locator('input[name="canPostPolls"]')).not.toBeChecked()
  } finally {
    /*
     * Deleted, with somewhere for its members to go. Required rather than
     * optional: every member has a primary group, so there is nowhere to leave
     * them — this group has none, and the field is still the contract.
     */
    await page.goto('/admin/groups')
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await selectStartingWith(page.locator('select[name="moveMembersTo"]'), 'Registered')
    await page.getByRole('button', { name: 'Delete this group' }).click()
  }

  await page.goto('/admin/groups')
  await expect(page.locator('li').filter({ hasText: title })).toHaveCount(0)
})

/**
 * A system group cannot be deleted, and the screen says why rather than offering
 * a button that refuses.
 */
test('a system group offers no delete, because the board resolves it by key', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/groups')
  await page.getByRole('link', { name: 'Edit Registered' }).click()

  await expect(page.getByText(/part of how the board works/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete this group' })).toHaveCount(0)
})

/**
 * The two bulk screens under Groups.
 *
 * Both are chunked with the cursor in a hidden field, which is what makes a long
 * run resumable **without JavaScript** — the action hands back where it stopped
 * and the next press carries it. Driven here against an empty group, because a
 * mass move over the board's real membership is a privilege change every later
 * spec would inherit.
 */
test('the bulk group screens run a batch and report what they did', async ({ page }) => {
  await enterAdminPanel(page)

  const key = mint('bulk_')
  const title = `Bulk ${key}`
  await page.goto('/admin/groups')
  const create = composer(page, 'Create group')
  await create.getByLabel('Title').fill(title)
  await create.getByLabel('Key').fill(key)
  await selectStartingWith(create.locator('select[name="copyFromGroupId"]'), 'Registered')
  await create.getByRole('button', { name: 'Create group' }).click()
  await expect(page.locator('li').filter({ hasText: title })).toBeVisible()

  try {
    await page.goto('/admin/groups/memberships')
    /* The count beside each group is the "how many people does this affect". */
    await expect(page.locator('select[name="fromGroupId"]')).toContainText(`${title} (0)`)

    await selectStartingWith(page.locator('select[name="fromGroupId"]'), title)
    await selectStartingWith(page.locator('select[name="toGroupId"]'), 'Registered')
    await page.getByRole('button', { name: 'Start moving' }).click()
    await expect(page.getByText('Finished. 0 members moved.')).toBeVisible()

    /*
     * The promotion screen is a dry run and says so. It is unconditional —
     * opening the page evaluates the rules — and it writes nothing, which is the
     * property worth pinning: a preview that could write is one nobody can trust.
     */
    await page.goto('/admin/groups/promotions')
    await expect(page.getByText(/\d+ members? examined\./)).toBeVisible()
    await expect(page.getByText(/A promotion never lifts a ban/)).toBeVisible()
  } finally {
    await page.goto('/admin/groups')
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await selectStartingWith(page.locator('select[name="moveMembersTo"]'), 'Registered')
    await page.getByRole('button', { name: 'Delete this group' }).click()
  }
})

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

/**
 * The member screen, and the one operation on it the board has to obey.
 *
 * A ban is not a state change — F23 captures the group the member held so an
 * expiring ban can restore it — so the proof is not the column but the member:
 * they are refused at the login form, they are told the *public* reason and
 * never the staff note, and lifting it lets them back in.
 */
test('a member edited in the panel is changed on the board, and a ban locks them out', async ({
  page,
  browser,
}) => {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const memberPage = await memberContext.newPage()

  try {
    const username = await signUp(memberPage, 'banned')

    await enterAdminPanel(page)
    await page.goto('/admin/users')
    await page.getByLabel('Username contains').fill(username)
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.locator('li').filter({ hasText: username })).toContainText(
      'Registered · 0 posts',
    )

    await page.getByRole('link', { name: `Edit ${username}` }).click()
    await expect(page.getByRole('heading', { name: username, level: 1 })).toBeVisible()

    /* An additional group grants exactly as a primary one does (R4.2). */
    await page.getByRole('checkbox', { name: 'Super Moderators' }).check()
    await page.getByRole('button', { name: 'Save groups' }).click()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Super Moderators' })).toBeChecked()

    /* Which the board obeys: the member can now open the moderator's panel. */
    await memberPage.goto('/modcp')
    await expect(memberPage.getByRole('heading', { name: /Moderator/ })).toBeVisible()

    await page.getByRole('checkbox', { name: 'Super Moderators' }).uncheck()
    await page.getByRole('button', { name: 'Save groups' }).click()

    const ban = composer(page, 'Ban this member')
    await ban.getByLabel('Length in days').fill('3')
    await ban.getByLabel('Staff note').fill('Never shown to them.')
    await ban.getByLabel('Reason shown to them').fill('Posting nonsense in every thread.')
    await ban.getByRole('button', { name: 'Ban this member' }).click()

    /* The section becomes the ban, rather than the form that makes one. */
    await expect(page.getByText(/^Banned until/)).toBeVisible()
    await expect(page.getByText('Staff note: Never shown to them.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lift this ban' })).toBeVisible()
    /*
     * And the state section stops offering to change the column: a member whose
     * column says banned with no ban row behind it cannot be un-banned
     * correctly, so the screen refuses to make one.
     */
    await expect(page.getByText('This member is banned.')).toBeVisible()

    /*
     * Their sessions are revoked immediately, so this browser is signed out
     * whatever page it was on.
     */
    await memberPage.goto('/login')
    await memberPage.getByLabel('Username or email').fill(username)
    await memberPage.getByLabel('Password').fill(PASSWORD)
    await memberPage.getByRole('button', { name: 'Sign in' }).click()

    await expect(memberPage.getByText('Posting nonsense in every thread.')).toBeVisible()
    await expect(
      memberPage.getByText('Never shown to them.'),
      'the staff note is staff-facing and must never reach the person it is about',
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Lift this ban' }).click()
    await expect(page.getByRole('button', { name: 'Ban this member' })).toBeVisible()

    await signIn(memberPage, username)
    await expect(memberPage.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await memberContext.close()
  }
})

/**
 * Merging is the panel's most destructive operation, so the screen previews it
 * in full and the run is chunked. Both accounts here are this test's own.
 */
test('a merge moves everything to the account that is kept and closes the other', async ({
  page,
  browser,
}) => {
  const goneContext = await browser.newContext({ javaScriptEnabled: false })
  const keptContext = await browser.newContext({ javaScriptEnabled: false })
  const gonePage = await goneContext.newPage()
  const keptPage = await keptContext.newPage()

  try {
    const gone = await signUp(gonePage, 'merged')
    const kept = await signUp(keptPage, 'keeper')

    const subject = `Written before the merge ${mint('')}`
    await gonePage.goto('/200-general')
    await gonePage.getByRole('link', { name: 'New thread' }).click()
    await gonePage.getByLabel('Subject').fill(subject)
    await gonePage.getByLabel('Message').fill('This post changes hands.')
    await gonePage.getByRole('button', { name: 'Post thread' }).click()
    await expect(gonePage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = gonePage.url()

    await enterAdminPanel(page)
    await page.goto('/admin/users')
    await page.getByLabel('Username contains').fill(gone)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('link', { name: `Edit ${gone}` }).click()
    await page.getByRole('link', { name: new RegExp(`^Merge ${gone} into`) }).click()

    await page.getByLabel('Keep which account?').fill(kept)
    await page.getByRole('button', { name: 'Find' }).click()

    /* The preview names the direction and the volume, before anything moves. */
    await expect(page.getByRole('heading', { name: `Keep ${kept}` })).toBeVisible()
    await expect(
      page.getByText(new RegExp(`would move from ${gone} to ${kept}`)),
    ).toBeVisible()

    await page.getByRole('button', { name: new RegExp(`^Merge into ${kept}`) }).click()
    await expect(page.getByText(/Merged\. Everything now belongs to/)).toBeVisible()

    /* The post is the other member's, name and all. */
    await page.goto(threadUrl)
    await expect(page.getByRole('link', { name: kept, exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: gone, exact: true })).toHaveCount(0)

    /* And the account that lost is closed rather than deleted. */
    await page.goto('/admin/users?deleted=1')
    await page.getByLabel('Username contains').fill(gone)
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.locator('li').filter({ hasText: gone })).toContainText('deleted')
  } finally {
    await goneContext.close()
    await keptContext.close()
  }
})

/**
 * Pruning and mass mail: the two screens that act on *everybody*, and the two
 * whose refusals matter more than their filters.
 */
test('pruning is a dry run until it is confirmed, and mass mail queues', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/users/prune')

  /* Without a date it matches everybody, so the screen refuses to guess. */
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByText(/Required\. Without it a prune matches everybody\./)).toBeVisible()

  await page.getByLabel('Registered before').fill('2020-01-01')
  await page.getByRole('button', { name: 'Show me' }).click()
  /*
   * Nothing seeded is younger than 2020, so this is the *exclusions* answering
   * rather than the date: anybody who has posted, any staff, any forum
   * moderator and anybody banned is skipped whatever the filter says.
   */
  await expect(page.getByText(/has posted, is staff, moderates a forum, or is banned/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Close/ }),
    'nothing matched, so there is nothing to confirm',
  ).toHaveCount(0)

  await page.goto('/admin/users/mail')
  await page.getByLabel('Subject').fill(`Board notice ${mint('')}`)
  await page.getByLabel('Message').fill('Queued by the browser suite.')
  await page.getByRole('button', { name: 'Queue this message' }).click()

  /*
   * *Queued*, never sent from the form. The driver is touched only inside the
   * tick, because a provider hanging for ten seconds must not be a ten-second
   * button press.
   */
  await expect(page.getByText(/Queued for all \d+ members?\./)).toBeVisible()

  await page.goto('/admin/log?action=user.mass_mail_started')
  await expect(
    page.locator('li').filter({ hasText: 'user.mass_mail_started' }).first(),
  ).toContainText(STAFF.admin.username)
})

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

/**
 * The three vocabularies on the Content screen, each read back from a *post*.
 *
 * A prefix is offered by the composer; a smiley and a directive change what an
 * existing post renders to — so none of these is asserted on the panel alone.
 * The smiley in particular is applied on the render path, like a word filter, so
 * a post written before it was configured has to change.
 */
test('a prefix, a smiley and a directive added in the panel reach the board', async ({
  page,
  browser,
}) => {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const memberPage = await memberContext.newPage()

  const label = `Prefix${mint('')}`
  const code = `:${mint('sm')}:`
  const directive = mint('mark')

  await enterAdminPanel(page)

  try {
    await signUp(memberPage, 'vocab')

    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: 'New thread' }).click()
    await memberPage.getByLabel('Subject').fill(`Vocabulary ${mint('')}`)
    await memberPage
      .getByLabel('Message')
      .fill(`Written first: ${code} and :${directive}[a hidden ending].`)
    await memberPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(memberPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = memberPage.url()

    /* As typed, because neither vocabulary exists yet. */
    await expect(memberPage.getByText(code)).toBeVisible()

    await page.goto('/admin/content')

    const prefix = composer(page, 'Add prefix')
    await prefix.getByLabel('Label').fill(label)
    await prefix.getByRole('button', { name: 'Add prefix' }).click()
    await expect(page.locator('li').filter({ hasText: label })).toBeVisible()

    const smiley = page
      .locator('form')
      .filter({ has: page.locator('input[name="code"]') })
      .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
    await smiley.getByLabel('Code', { exact: true }).fill(code)
    await smiley.getByLabel('Image').fill('/smilies/probe.png')
    await smiley.getByLabel('Alt text').fill('a probe')
    await smiley.getByRole('button', { name: 'Add', exact: true }).click()
    expect(await fieldValues(page, 'code')).toContain(code)

    const custom = page
      .locator('form')
      .filter({ has: page.locator('input[name="name"]') })
      .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
    await custom.getByLabel('Name').fill(directive)
    await custom.getByRole('button', { name: 'Add', exact: true }).click()
    expect(await fieldValues(page, 'name')).toContain(directive)

    /* The composer offers the prefix, which is the whole of what a prefix is. */
    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: 'New thread' }).click()
    await expect(
      memberPage
        .getByRole('combobox', { name: /Prefix/ })
        .locator('option')
        .filter({ hasText: label }),
    ).toHaveCount(1)

    /*
     * And the post written *before* either existed renders both.
     *
     * Polled rather than asserted once: the compiled vocabulary is invalidated
     * with the `max` profile, which is stale-while-revalidate by design — the
     * first read after a write is allowed to be the old one while the refresh
     * happens behind it. A single hard assertion here would be asserting that
     * the board does *not* do the thing it deliberately does.
     */
    await expect(async () => {
      await memberPage.goto(threadUrl)
      await expect(memberPage.getByRole('img', { name: 'a probe' })).toBeVisible({
        timeout: 2_000,
      })
      await expect(memberPage.locator(`span.md-directive-${directive}`)).toHaveText('a hidden ending', {
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] })
  } finally {
    /*
     * Taken back out, and this is required rather than tidy: a smiley rewrites
     * every post on the board that happens to contain its code, and a prefix is
     * offered in every composer the suite opens afterwards.
     */
    await page.goto('/admin/content')
    const listed = page.locator('li').filter({ hasText: label })
    if ((await listed.count()) > 0) {
      await listed.getByRole('button', { name: 'Remove' }).click()
    }

    await removeRow(page, 'code', code)
    await removeRow(page, 'name', directive)

    await memberContext.close()
  }

  await expect(page.locator(`input[name="code"][value="${code}"]`)).toHaveCount(0)
  await expect(page.locator(`input[name="name"][value="${directive}"]`)).toHaveCount(0)
  await expect(page.locator('li').filter({ hasText: label })).toHaveCount(0)
})

/**
 * The attachments screen is a listing rather than a vocabulary, and its value is
 * the four totals at the top: what members have uploaded, what it is costing in
 * storage, and what has failed to process.
 */
test('the attachments screen totals what has been uploaded and filters honestly', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/content/attachments')

  /*
   * The `<dt>`s, not the words: "Awaiting processing" and "Failed" are also the
   * labels of two options in the status filter below, so an unscoped text match
   * finds the menu and calls it the summary.
   */
  expect(await page.locator('dt').allInnerTexts()).toEqual([
    'Files',
    'Stored',
    'Awaiting processing',
    'Failed',
  ])

  /* An empty result from a filled-in filter is a real answer, and says so. */
  await page.getByLabel('Filename contains').fill(mint('nothing-called-this'))
  await page.getByRole('button', { name: 'Filter' }).click()
  await expect(page.getByText('Nothing matches.')).toBeVisible()
})

/* ------------------------------------------------------------------ *
 * Anti-spam
 * ------------------------------------------------------------------ */

/**
 * The registration challenge, switched on and answered.
 *
 * The screen's own loud claim is asserted first: a challenge switched on with
 * nothing to ask **fails open**, deliberately, because refusing every applicant
 * because the list is empty would be worse. Then a question is added, and the
 * registration form has to ask it.
 *
 * Everything is put back in a `finally`, and it has to be: a board left asking a
 * question is a board where every later spec's `signUp` fails, for a reason that
 * looks nothing like this file. The last thing this test does is register
 * somebody, so "registration works again" is proved rather than assumed.
 */
test('a registration question is asked once the challenge is switched on', async ({
  page,
  browser,
}) => {
  await enterAdminPanel(page)

  const answer = mint('otter')
  const question = `What did the browser suite say (${answer})?`

  try {
    await page.goto('/admin/settings?group=antispam')
    await page.getByLabel('Registration challenge').selectOption({ label: 'Ask a question' })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText(/Saved, and the caches/)).toBeVisible()

    await page.goto('/admin/antispam')
    await expect(
      page.getByText('The challenge is switched on and there is nothing to ask.'),
    ).toBeVisible()

    const add = composer(page, 'Add')
    await add.getByLabel('Question').fill(question)
    await add.getByLabel('Accepted answers').fill(answer)
    await add.getByRole('button', { name: 'Add', exact: true }).click()
    expect(await fieldValues(page, 'question')).toContain(question)
    await expect(
      page.getByText('The challenge is switched on and there is nothing to ask.'),
    ).toHaveCount(0)

    /* The applicant is asked it, and a wrong answer is refused. */
    const applicantContext = await browser.newContext({ javaScriptEnabled: false })
    const applicant = await applicantContext.newPage()

    try {
      const username = `e2e_asked_${Date.now().toString(36)}`
      await applicant.goto('/register')
      await expect(applicant.getByText(question)).toBeVisible()

      await applicant.getByLabel('Username').fill(username)
      await applicant.getByLabel('Email').fill(`${username}@example.test`)
      await applicant.getByLabel('Password').fill(PASSWORD)
      await applicant.getByLabel(question).fill('not the answer')
      await applicant.getByRole('button', { name: 'Create account' }).click()
      await expect(applicant).not.toHaveURL(/registered=1/)

      await applicant.getByLabel('Username').fill(username)
      await applicant.getByLabel('Email').fill(`${username}@example.test`)
      await applicant.getByLabel('Password').fill(PASSWORD)
      await applicant.getByLabel(question).fill(answer)
      await applicant.getByRole('button', { name: 'Create account' }).click()
      await expect(applicant).toHaveURL(/\/login\?registered=1$/)
    } finally {
      await applicantContext.close()
    }
  } finally {
    await page.goto('/admin/settings?group=antispam')
    await page.getByLabel('Registration challenge').selectOption({ label: 'No challenge' })
    await page.getByRole('button', { name: 'Save settings' }).click()

    await page.goto('/admin/antispam')
    await removeRow(page, 'question', question)
  }

  const after = await browser.newContext({ javaScriptEnabled: false })
  const afterPage = await after.newPage()
  try {
    await signUp(afterPage, 'unasked')
  } finally {
    await after.close()
  }
})

/* ------------------------------------------------------------------ *
 * Themes and plugins
 * ------------------------------------------------------------------ */

/**
 * Which themes members may choose, and what the board's own palette is.
 *
 * Midnight rather than the default for the switch: turning the *default* off is
 * refused (correctly), and making it the default would repaint the board for
 * every spec that runs after this one.
 */
test('a theme turned off leaves the switcher, and a token override reaches the board', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/themes')
  /* The build's own theme has no toggle at all, rather than one that refuses. */
  await expect(page.getByRole('button', { name: 'Turn Default off' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Turn Midnight off' }).click()
  await expect(page.getByRole('button', { name: 'Turn Midnight on' })).toBeVisible()

  /*
   * With one theme left there is no switcher at all — not a menu with a single
   * option, which is a control that cannot do anything.
   */
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveCount(0)

  await page.goto('/admin/themes')
  await page.getByRole('button', { name: 'Turn Midnight on' }).click()
  await expect(page.getByRole('button', { name: 'Turn Midnight off' })).toBeVisible()

  await page.goto('/')
  await expect(
    page.getByRole('combobox', { name: 'Theme' }).locator('option').filter({ hasText: 'Midnight' }),
  ).toHaveCount(1)

  /*
   * The editor, on the theme the board actually renders — a token override the
   * board does not paint would be an editor saving into a void. Reset in a
   * `finally`, because every later spec reads pages painted with it.
   */
  try {
    await page.goto('/admin/themes/default')
    await page.locator('input[name="token.light.primary"]').fill('oklch(0.5 0.2 30)')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved. The board is rendering these values now.')).toBeVisible()

    await page.goto('/admin/themes')
    await expect(page.locator('li').filter({ hasText: 'default ·' })).toContainText(
      '1 colour changed',
    )

    /*
     * `allTextContents`, not a `hasText` filter: a `<style>` element renders
     * nothing, so its `innerText` — which is what `hasText` matches on — is
     * always empty, and the filter finds no style block on any page ever.
     */
    await page.goto('/')
    const blocks = await page.locator('style').allTextContents()
    expect(
      blocks.filter((block) => block.includes('oklch(0.5 0.2 30)')),
      'the override has to be in the declaration block the board paints from',
    ).toHaveLength(1)
  } finally {
    await page.goto('/admin/themes/default')
    await page.getByRole('button', { name: /Reset to the theme/ }).click()
  }

  await page.goto('/admin/themes')
  await expect(page.locator('li').filter({ hasText: 'default ·' })).toContainText(
    'no changes — exactly as it ships',
  )
})

/**
 * The plugin screen with nothing installed, which is what this build ships.
 *
 * Asserted rather than skipped. A plugin is code — it has to be in the bundle
 * before it can run — so "none configured" is the honest state of this board,
 * and the screen's job is to say so *and* say what installing one takes. A panel
 * that rendered an empty list with no explanation would read as a broken
 * feature, which is exactly the impression F69 was written to avoid.
 *
 * The enable/disable and per-plugin settings paths are covered by
 * `plugin-admin-actions.test.ts`. They cannot be driven from a browser on a
 * board whose registry is empty, and filling that registry would mean shipping a
 * test double to every real board.
 */
test('the plugins screen names what is installed and how installing works', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/plugins')

  await expect(page.getByText('No plugins are configured on this board.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Installing a plugin' })).toBeVisible()
  await expect(page.getByText(/community\.config\.ts/).first()).toBeVisible()
})

/* ------------------------------------------------------------------ *
 * System, the overview, and the log
 * ------------------------------------------------------------------ */

/**
 * The maintenance screen, once the tick has run.
 *
 * The task list is the reason this screen exists — *is the tick running?* — and
 * it is empty until something registers the tasks, so this drives the board's
 * own scheduled endpoint first. That is the production path: the serverless
 * profile drives it with a cron, so it is not a test hook.
 */
test('the system screen reports the scheduler, the volumes and its own sweeps', async ({
  page,
  request,
}) => {
  await enterAdminPanel(page)

  await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
  await page.goto('/admin/system')

  /* Named tasks with their intervals, not a placeholder. */
  const tasks = page.locator('section').filter({ hasText: 'Scheduled tasks' }).last()
  await expect(tasks.locator('li').filter({ hasText: 'queue.drain' })).toContainText('every 60s')
  await expect(tasks.locator('li').filter({ hasText: 'search.reindex' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'The scheduler is not running' }),
    'every task has just run, so the alarm must be off',
  ).toHaveCount(0)

  await expect(page.getByText(/\d+ members/)).toBeVisible()
  await expect(page.getByText(/\d+ posts/)).toBeVisible()
  await expect(page.getByText(/\d+ jobs waiting/)).toBeVisible()

  /* Each sweep reports what it did rather than only that it succeeded. */
  await page.getByRole('button', { name: /Prune \d+ expired sessions?/ }).click()
  await expect(page.getByText(/\d+ session rows removed\./)).toBeVisible()

  await page.getByRole('button', { name: 'Prune expired tokens' }).click()
  await expect(page.getByText(/\d+ token rows removed\./)).toBeVisible()

  await page.getByRole('button', { name: 'Run one recount batch' }).click()
  await expect(page.getByText(/counters? corrected in this batch/)).toBeVisible()

  await page.getByLabel('What to clear').selectOption('permissions')
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText(/^Cleared /)).toBeVisible()

  /* And a job id nobody issued is refused rather than swallowed. */
  await page.getByLabel('Job id').fill('00000000-0000-4000-8000-000000000000')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText(/No such job\.|went wrong/)).toBeVisible()
})

/**
 * The Overview is the first screen an administrator sees, and its totals are a
 * rollup rather than a live count — so what it must never do is show three
 * confident zeroes for a board that has content.
 *
 * That is not hypothetical. Forum counters on this board are subtree-inclusive
 * and the totals are the sum of the *root* forums, so a root category claiming
 * zero makes the whole board claim zero — which is exactly what the seeded
 * board did, and what this screen reported. The tick runs first because "not
 * counted yet" is the honest state before it, and this screen says that in words
 * rather than in zeroes.
 */
test('the overview counts the board it is looking at', async ({ page, request }) => {
  await enterAdminPanel(page)

  await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
  await page.goto('/admin')

  const totals = page.locator('section[aria-labelledby="totals-heading"]')
  await expect(totals).not.toContainText('Not counted yet')

  /*
   * A non-zero figure beside each label, which is the whole assertion: the
   * seeded board has three threads and six posts, all of them under one root
   * category, and a rollup that missed the category reported both as 0.
   */
  await expect(totals).toContainText(/[1-9]\d*\s*Threads/)
  await expect(totals).toContainText(/[1-9]\d*\s*Posts/)

  await expect(totals).toContainText(/Newest member:|No members yet/)
  await expect(totals).toContainText('Counted')
})

/**
 * The log is the panel's accountability. `admin-no-js.spec.ts` proves it records
 * a sign-in and that the filter works; this proves it reaches the *other*
 * modules — a group write is a different action file from a sign-in, and "the
 * log knows about every screen" is the kind of claim that is true when it is
 * written and false a release later.
 */
test('the admin log records what the other sections did, and who did it', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const key = mint('logged_')
  const title = `Logged ${key}`
  await page.goto('/admin/groups')
  const create = composer(page, 'Create group')
  await create.getByLabel('Title').fill(title)
  await create.getByLabel('Key').fill(key)
  await selectStartingWith(create.locator('select[name="copyFromGroupId"]'), 'Registered')
  await create.getByRole('button', { name: 'Create group' }).click()
  await expect(page.locator('li').filter({ hasText: title })).toBeVisible()

  try {
    await page.goto('/admin/log?action=group.created')
    const entry = page.locator('li').filter({ hasText: 'group.created' }).first()
    await expect(entry).toContainText(STAFF.admin.username)
    /* The address is stored as a prefix, never in full — F09. */
    await expect(entry).toContainText('from 127.0.0.0/24')

    /* The filter is the address bar, so a log this size stays usable. */
    await expect(page.locator('li').filter({ hasText: 'admin.signed_in' })).toHaveCount(0)
  } finally {
    await page.goto('/admin/groups')
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await selectStartingWith(page.locator('select[name="moveMembersTo"]'), 'Registered')
    await page.getByRole('button', { name: 'Delete this group' }).click()
  }
})

/**
 * The seeded moderator holds every moderation right on the board and still
 * cannot open the panel, which is the whole of what `admincp.access` means.
 *
 * `admin-no-js.spec.ts` proves a plain member gets a 404 and a guest gets the
 * sign-in form. This is the case in between, and the one that would be quietly
 * wrong if somebody widened the gate to "staff": a super moderator is staff.
 */
test('a super moderator with every moderation right still cannot open the panel', async ({
  page,
}) => {
  await signIn(page, STAFF.moderator.username, STAFF_PASSWORD)

  /* They do have the moderator's panel — this is not a broken account. */
  await page.goto('/modcp')
  await expect(page.getByRole('heading', { name: /Moderator/ })).toBeVisible()

  for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/system']) {
    expect((await page.goto(url))?.status(), `moderator ${url}`).toBe(404)
  }
})
