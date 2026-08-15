import { expect, test, type Locator, type Page } from '@playwright/test'

import { STAFF, STAFF_PASSWORD } from './support/config'
import { PASSWORD, enterAdminPanel, signIn, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const OFF_TOPIC = '/201-off-topic'

const mint = (label: string): string => `${label}${Date.now().toString(36)}`

async function fieldValues(page: Page, name: string): Promise<string[]> {
  return page
    .locator(`input[name="${name}"]`)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

function composer(page: Page, verb: string): Locator {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: verb, exact: true }) })
}

async function selectStartingWith(select: Locator, prefix: string): Promise<void> {
  const value = await select
    .locator('option')
    .filter({ hasText: new RegExp(`^${prefix}`) })
    .first()
    .getAttribute('value')

  expect(value, `no option beginning "${prefix}"`).not.toBeNull()
  await select.selectOption(value ?? '')
}

async function removeRow(page: Page, field: string, value: string): Promise<void> {
  const row = page
    .locator('div')
    .filter({ has: page.locator(`input[name="${field}"][value="${value}"]`) })
    .filter({ has: page.getByRole('button', { name: 'Remove', exact: true }) })
    .last()

  if ((await row.count()) === 0) return
  await row.getByRole('button', { name: 'Remove', exact: true }).click()
}

test('every section in the rail opens, and marks itself as where you are', async ({
  page,
}) => {
  await enterAdminPanel(page)

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

    await expect(
      page.locator('[aria-current="page"]').filter({ hasText: marked }),
      `${href} lights ${marked} in the rail`,
    ).not.toHaveCount(0)
  }

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

test('saving one settings group leaves the settings it is not showing alone', async ({
  page,
}) => {
  await enterAdminPanel(page)

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

  await page.goto('/admin/settings?q=flood')
  await expect(page.getByText(/matches for .flood., across every group/)).toBeVisible()
  await expect(page.getByText('posting.flood_seconds')).toBeVisible()
  await expect(page.getByText('search.flood_seconds')).toBeVisible()
})

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
  await page.getByLabel('Open for posting').uncheck()
  await page.getByRole('button', { name: 'Save forum' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Open for posting')).not.toBeChecked()

  await page.goto(OFF_TOPIC)
  await expect(page.getByText(description)).toBeVisible()

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

    const guests = page.locator('form').filter({ hasText: 'Save Guests' })
    await guests.locator('select[name="canView"]').selectOption('deny')
    await guests.getByRole('button', { name: 'Save Guests' }).click()

    const saved = page.locator('form').filter({ hasText: 'Save Guests' })
    await expect(saved.locator('select[name="canView"]')).toHaveValue('deny')
    await expect(saved.getByText('set here: denied')).toBeVisible()

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
  await expect(listed).toContainText('Open and close threads')
  await expect(listed).toContainText('Stick threads')

  const missing = composer(page, 'Save appointment')
  await missing.getByLabel('Member').fill('nobody_by_that_name')
  await missing.getByRole('button', { name: 'Save appointment' }).click()
  await expect(page.getByText(/No member called/)).toBeVisible()

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

test('a group is created by copying another, and deleted by rehoming its members', async ({
  page,
}) => {
  await enterAdminPanel(page)

  const key = mint('probe_')
  const title = `Probe ${key}`

  await page.goto('/admin/groups')

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
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.locator('input[name="canPostThreads"]')).toBeChecked()
    await expect(
      page.locator('input[name="canAccessAdminCp"]'),
      'a copy of Registered must not be able to open this panel',
    ).not.toBeChecked()

    await page.getByLabel('Description').fill('Made by the browser suite.')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    await page.goto('/admin/groups')
    await expect(page.locator('li').filter({ hasText: title })).toContainText(
      'Made by the browser suite.',
    )

    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await page.locator('input[name="canPostPolls"]').uncheck()
    await page.getByRole('button', { name: 'Save permissions' }).click()
    await page.reload()
    await expect(page.locator('input[name="canPostPolls"]')).not.toBeChecked()
  } finally {
    await page.goto('/admin/groups')
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await selectStartingWith(page.locator('select[name="moveMembersTo"]'), 'Registered')
    await page.getByRole('button', { name: 'Delete this group' }).click()
  }

  await page.goto('/admin/groups')
  await expect(page.locator('li').filter({ hasText: title })).toHaveCount(0)
})

test('a system group offers no delete, because the board resolves it by key', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/groups')
  await page.getByRole('link', { name: 'Edit Registered' }).click()

  await expect(page.getByText(/part of how the board works/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete this group' })).toHaveCount(0)
})

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
    await expect(page.locator('select[name="fromGroupId"]')).toContainText(`${title} (0)`)

    await selectStartingWith(page.locator('select[name="fromGroupId"]'), title)
    await selectStartingWith(page.locator('select[name="toGroupId"]'), 'Registered')
    await page.getByRole('button', { name: 'Start moving' }).click()
    await expect(page.getByText('Finished. 0 members moved.')).toBeVisible()

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

    await page.getByRole('checkbox', { name: 'Super Moderators' }).check()
    await page.getByRole('button', { name: 'Save groups' }).click()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Super Moderators' })).toBeChecked()

    await memberPage.goto('/modcp')
    await expect(memberPage.getByRole('heading', { name: /Moderator/ })).toBeVisible()

    await page.getByRole('checkbox', { name: 'Super Moderators' }).uncheck()
    await page.getByRole('button', { name: 'Save groups' }).click()

    const ban = composer(page, 'Ban this member')
    await ban.getByLabel('Length in days').fill('3')
    await ban.getByLabel('Staff note').fill('Never shown to them.')
    await ban.getByLabel('Reason shown to them').fill('Posting nonsense in every thread.')
    await ban.getByRole('button', { name: 'Ban this member' }).click()

    await expect(page.getByText(/^Banned until/)).toBeVisible()
    await expect(page.getByText('Staff note: Never shown to them.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lift this ban' })).toBeVisible()
    await expect(page.getByText('This member is banned.')).toBeVisible()

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

    await expect(page.getByRole('heading', { name: `Keep ${kept}` })).toBeVisible()
    await expect(
      page.getByText(new RegExp(`would move from ${gone} to ${kept}`)),
    ).toBeVisible()

    await page.getByRole('button', { name: new RegExp(`^Merge into ${kept}`) }).click()
    await expect(page.getByText(/Merged\. Everything now belongs to/)).toBeVisible()

    await page.goto(threadUrl)
    await expect(page.getByRole('link', { name: kept, exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: gone, exact: true })).toHaveCount(0)

    await page.goto('/admin/users?deleted=1')
    await page.getByLabel('Username contains').fill(gone)
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.locator('li').filter({ hasText: gone })).toContainText('deleted')
  } finally {
    await goneContext.close()
    await keptContext.close()
  }
})

test('pruning is a dry run until it is confirmed, and mass mail queues', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/users/prune')

  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByText(/Required\. Without it a prune matches everybody\./)).toBeVisible()

  await page.getByLabel('Registered before').fill('2020-01-01')
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByText(/has posted, is staff, moderates a forum, or is banned/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Close/ }),
    'nothing matched, so there is nothing to confirm',
  ).toHaveCount(0)

  await page.goto('/admin/users/mail')
  await page.getByLabel('Subject').fill(`Board notice ${mint('')}`)
  await page.getByLabel('Message').fill('Queued by the browser suite.')
  await page.getByRole('button', { name: 'Queue this message' }).click()

  await expect(page.getByText(/Queued for all \d+ members?\./)).toBeVisible()

  await page.goto('/admin/log?action=user.mass_mail_started')
  await expect(
    page.locator('li').filter({ hasText: 'user.mass_mail_started' }).first(),
  ).toContainText(STAFF.admin.username)
})

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

    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: 'New thread' }).click()
    await expect(
      memberPage
        .getByRole('combobox', { name: /Prefix/ })
        .locator('option')
        .filter({ hasText: label }),
    ).toHaveCount(1)

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

test('the attachments screen totals what has been uploaded and filters honestly', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/content/attachments')

  expect(await page.locator('dt').allInnerTexts()).toEqual([
    'Files',
    'Stored',
    'Awaiting processing',
    'Failed',
  ])

  await page.getByLabel('Filename contains').fill(mint('nothing-called-this'))
  await page.getByRole('button', { name: 'Filter' }).click()
  await expect(page.getByText('Nothing matches.')).toBeVisible()
})

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

    const applicantContext = await browser.newContext({ javaScriptEnabled: false })
    const applicant = await applicantContext.newPage()

    try {
      const username = `e2e_asked_${Date.now().toString(36)}`
      await applicant.goto('/register')
      await expect(applicant.getByText(question)).toBeVisible()

      await applicant.getByLabel('Username').fill(username)
      await applicant.getByLabel('Email').fill(`${username}@example.test`)
      await applicant.getByLabel('Password').fill(PASSWORD)
      await applicant.getByLabel(/I have read and accept/).check()
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

test('a theme turned off leaves the switcher, and a token override reaches the board', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/themes')
  await expect(page.getByRole('button', { name: 'Turn Default off' })).toHaveCount(0)

  const switchable = (
    await page
      .getByRole('button', { name: /^Turn .+ off$/ })
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''))
  )
    .map((label) => /^Turn (.+) off$/.exec(label.trim())?.[1] ?? null)
    .filter((name): name is string => name !== null)

  expect(switchable.length).toBeGreaterThan(0)
  expect(switchable).toContain('Midnight')

  for (const name of switchable) {
    await page.goto('/admin/themes')
    await page.getByRole('button', { name: `Turn ${name} off` }).click()
    await expect(page.getByRole('button', { name: `Turn ${name} on` })).toBeVisible()
  }

  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveCount(0)

  for (const name of switchable) {
    await page.goto('/admin/themes')
    await page.getByRole('button', { name: `Turn ${name} on` }).click()
    await expect(page.getByRole('button', { name: `Turn ${name} off` })).toBeVisible()
  }

  await page.goto('/')
  await expect(
    page.getByRole('combobox', { name: 'Theme' }).locator('option').filter({ hasText: 'Midnight' }),
  ).toHaveCount(1)

  try {
    await page.goto('/admin/themes/default')
    await page.locator('input[name="token.light.primary"]').fill('oklch(0.5 0.2 30)')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved. The board is rendering these values now.')).toBeVisible()

    await page.goto('/admin/themes')
    await expect(page.locator('li').filter({ hasText: 'default ·' })).toContainText(
      '1 colour changed',
    )

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

test('the plugins screen names what is installed and how installing works', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await page.goto('/admin/plugins')

  await expect(page.locator('a[href="/admin/plugins/dues"]').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Installing a plugin' })).toBeVisible()
  await expect(page.getByText(/community\.config\.ts/).first()).toBeVisible()
})

test('the system screen reports the scheduler, the volumes and its own sweeps', async ({
  page,
  request,
}) => {
  await enterAdminPanel(page)

  await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
  await page.goto('/admin/system')

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

  await page.getByRole('button', { name: /Prune \d+ expired sessions?/ }).click()
  await expect(page.getByText(/\d+ session rows removed\./)).toBeVisible()

  await page.getByRole('button', { name: 'Prune expired tokens' }).click()
  await expect(page.getByText(/\d+ token rows removed\./)).toBeVisible()

  await page.getByRole('button', { name: 'Run one recount batch' }).click()
  await expect(page.getByText(/counters? corrected in this batch/)).toBeVisible()

  await page.getByRole('button', { name: 'Clear the forum tree' }).click()
  await expect(page.getByText('Cleared forum-tree.')).toBeVisible()

  await page.getByLabel('Job id').fill('00000000-0000-4000-8000-000000000000')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(
    page.getByText(/No dead-lettered job/),
    'a retry that requeued nothing must say so rather than claim success',
  ).toBeVisible()
  await expect(page.getByText('Back on the queue.')).toHaveCount(0)
})

test('the overview counts the board it is looking at', async ({ page, request }) => {
  await enterAdminPanel(page)

  await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
  await page.goto('/admin')

  const totals = page.locator('section[aria-labelledby="totals-heading"]')
  await expect(totals).not.toContainText('Not counted yet')

  await expect(totals).toContainText(/[1-9]\d*\s*Threads/)
  await expect(totals).toContainText(/[1-9]\d*\s*Posts/)

  await expect(totals).toContainText(/Newest member:|No members yet/)
  await expect(totals).toContainText('Counted')
})

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
    await expect(entry).toContainText('from 127.0.0.0/24')

    await expect(page.locator('li').filter({ hasText: 'admin.signed_in' })).toHaveCount(0)
  } finally {
    await page.goto('/admin/groups')
    await page.getByRole('link', { name: `Edit ${title}` }).click()
    await selectStartingWith(page.locator('select[name="moveMembersTo"]'), 'Registered')
    await page.getByRole('button', { name: 'Delete this group' }).click()
  }
})

test('a super moderator with every moderation right still cannot open the panel', async ({
  page,
}) => {
  await signIn(page, STAFF.moderator.username, STAFF_PASSWORD)

  await page.goto('/modcp')
  await expect(page.getByRole('heading', { name: /Moderator/ })).toBeVisible()

  for (const url of ['/admin', '/admin/settings', '/admin/users', '/admin/system']) {
    expect((await page.goto(url))?.status(), `moderator ${url}`).toBe(404)
  }
})
