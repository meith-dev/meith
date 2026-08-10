import { expect, test, type Browser, type Page } from '@playwright/test'

import { signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

async function scene(
  browser: Browser,
  label: string,
  body = 'Something a moderator will want to look at.',
): Promise<{
  readonly memberPage: Page
  readonly modPage: Page
  readonly title: string
  readonly threadUrl: string
  readonly member: string
  readonly close: () => Promise<void>
}> {
  const memberContext = await browser.newContext()
  const modContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  const modPage = await modContext.newPage()

  const member = await signUp(memberPage, label)
  await signInAsModerator(modPage)

  await memberPage.goto('/200-general')
  await memberPage.getByRole('link', { name: 'New thread' }).click()
  const title = `${label} ${Date.now()}`
  await memberPage.getByLabel('Subject').fill(title)
  await memberPage.getByLabel('Message').fill(body)
  await memberPage.getByRole('button', { name: 'Post thread' }).click()
  await expect(memberPage).toHaveURL(/\/thread\/\d+-/)

  return {
    memberPage,
    modPage,
    title,
    threadUrl: memberPage.url(),
    member,
    close: async () => {
      await memberContext.close()
      await modContext.close()
    },
  }
}

test('a member reports a post, and a moderator takes it and resolves it', async ({ browser }) => {
  const { memberPage, modPage, title, threadUrl, close } = await scene(browser, 'flagged')

  try {
    const reporterContext = await browser.newContext()
    const reporterPage = await reporterContext.newPage()
    const reporter = await signUp(reporterPage, 'flagger')

    await reporterPage.goto(threadUrl)
    await reporterPage.getByRole('link', { name: 'Report', exact: true }).first().click()
    await expect(reporterPage).toHaveURL(/\/report\?kind=post&id=\d+$/)

    await reporterPage.getByLabel('What is wrong with it?').fill('This looks like spam.')
    await reporterPage.getByRole('button', { name: 'Send report' }).click()
    await expect(reporterPage).toHaveURL(/\?reported=1$/)

    await modPage.goto('/moderation/reports')
    const report = modPage.locator('li', { hasText: title })
    await expect(report).toBeVisible()
    await expect(report).toContainText(`reported by ${reporter}`)
    await expect(report).toContainText('This looks like spam.')

    await expect(report).toContainText('Unassigned')
    await report.getByRole('button', { name: 'Take this' }).click()
    const taken = modPage.locator('li', { hasText: title })
    await expect(taken).not.toContainText('Unassigned')

    await taken.getByLabel(/Note for moderators/).fill('Deleted and warned.')
    await taken.getByRole('button', { name: 'Resolve' }).click()

    await expect(modPage.locator('li', { hasText: title })).toHaveCount(0)

    await memberPage.goto(threadUrl)
    await expect(memberPage.getByText('Deleted and warned.')).toHaveCount(0)

    await reporterContext.close()
  } finally {
    await close()
  }
})

test('inline moderation submits the posts a moderator ticked, with scripting off', async ({
  browser,
}) => {
  const { memberPage, modPage, threadUrl, close } = await scene(browser, 'inline')

  try {
    for (const words of ['The second post, which stays.', 'The third post, which stays too.']) {
      await memberPage.goto(`${threadUrl}/reply`)
      await memberPage.getByLabel('Message').fill(words)
      await memberPage.getByRole('button', { name: 'Post reply' }).click()
      await expect(memberPage).toHaveURL(/#post-\d+$/)
    }

    await modPage.goto(threadUrl)

    const boxes = modPage.locator('input[name="item"][form="inline-moderation"]')
    await expect(boxes).toHaveCount(3)
    await expect(modPage.locator('form#inline-moderation')).toHaveCount(1)
    await expect(modPage.locator('form#inline-moderation input[name="item"]')).toHaveCount(0)

    await boxes.first().check()
    await modPage
      .locator('form#inline-moderation')
      .getByRole('button', { name: 'Delete', exact: true })
      .click()

    await memberPage.goto(threadUrl)
    await expect(memberPage.getByText('Something a moderator will want to look at.')).toHaveCount(0)
    await expect(memberPage.getByText('The second post, which stays.')).toBeVisible()
    await expect(memberPage.getByText('The third post, which stays too.')).toBeVisible()
  } finally {
    await close()
  }
})

test('the thread tools lock a thread, and a locked thread refuses a reply', async ({ browser }) => {
  const { memberPage, modPage, threadUrl, close } = await scene(browser, 'locked')

  try {
    await modPage.goto(threadUrl)
    await modPage.getByRole('button', { name: 'Lock', exact: true }).click()
    await expect(modPage.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible()

    await memberPage.goto(threadUrl)
    await expect(memberPage.getByRole('button', { name: 'Post reply' })).toHaveCount(0)

    await memberPage.goto(`${threadUrl}/reply`)
    await expect(memberPage.getByText('This thread is locked.')).toBeVisible()
    await expect(memberPage.getByRole('button', { name: 'Post reply' })).toHaveCount(0)
  } finally {
    await close()
  }
})

test('a pinned thread sorts above an unpinned one, and moving it changes forum', async ({
  browser,
}) => {
  const { modPage, title, threadUrl, close } = await scene(browser, 'pinned')

  try {
    await modPage.goto(threadUrl)
    await modPage.getByRole('button', { name: 'Pin', exact: true }).click()
    await expect(modPage.getByRole('button', { name: 'Unpin', exact: true })).toBeVisible()

    await modPage.goto('/200-general')
    await expect(modPage.getByText('Pinned').first()).toBeVisible()
    const first = modPage.locator('main a[href^="/thread/"]').first()
    await expect(first).toHaveText(title)

    await modPage.goto(threadUrl)
    await modPage.getByLabel('Move to').selectOption({ label: 'Off Topic' })
    await modPage.getByRole('button', { name: 'Move', exact: true }).click()

    await modPage.goto('/201-off-topic')
    await expect(modPage.getByRole('link', { name: title })).toBeVisible()
    await modPage.goto('/200-general')
    await expect(modPage.getByRole('link', { name: title })).toHaveCount(0)
  } finally {
    await close()
  }
})

test('inline thread moderation locks a thread from the forum listing', async ({ browser }) => {
  const { memberPage, modPage, title, close } = await scene(browser, 'listinline')

  try {
    await modPage.goto('/200-general')

    const row = modPage.locator('input[name="item"][form="inline-moderation"]')
    await expect(row.first()).toBeAttached()

    await modPage.getByRole('checkbox', { name: `Select “${title}” for moderation` }).check()
    await modPage
      .locator('form#inline-moderation')
      .getByRole('button', { name: 'Lock', exact: true })
      .click()

    await memberPage.goto('/200-general')
    await memberPage.getByRole('link', { name: title }).click()
    await expect(memberPage.getByRole('button', { name: 'Post reply' })).toHaveCount(0)
  } finally {
    await close()
  }
})

test('a moderator warns a member, and the points are on the record', async ({ browser }) => {
  const { modPage, threadUrl, member, close } = await scene(browser, 'wayward')

  try {
    await modPage.goto(threadUrl)
    const warn = modPage.getByRole('link', { name: 'Warn', exact: true }).first()
    await expect(warn).toHaveAttribute('href', /\/moderation\/warn\?user=\d+&post=\d+$/)
    await warn.click()

    await expect(modPage.getByRole('heading', { name: `Warnings for ${member}` })).toBeVisible()
    await expect(modPage.getByText('Never warned')).toBeVisible()

    const reason = modPage.getByRole('combobox', { name: 'Reason' })
    const spamming = reason.locator('option', { hasText: 'Spamming' })
    await reason.selectOption((await spamming.getAttribute('value')) ?? '')

    await modPage.getByLabel('What this is for').fill('Posting the same link in three threads.')
    await modPage.getByRole('button', { name: 'Issue warning' }).click()

    await expect(modPage.getByText('Warning issued.')).toBeVisible()
    await expect(modPage.getByText(/^2 points\./)).toBeVisible()
    await expect(modPage.getByText('Spamming — 2 points', { exact: true })).toBeVisible()
    await expect(modPage.getByText('Never warned')).toHaveCount(0)
    await expect(modPage.getByText('Posting the same link in three threads.')).toBeVisible()
  } finally {
    await close()
  }
})

test('the moderator log records what was done, and by whom', async ({ browser }) => {
  const { modPage, threadUrl, close } = await scene(browser, 'logged')

  try {
    const threadId = /\/thread\/(\d+)/.exec(threadUrl)?.[1]
    expect(threadId).toBeDefined()

    await modPage.goto(threadUrl)
    await modPage.getByRole('button', { name: 'Lock', exact: true }).click()
    await expect(modPage.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible()

    await modPage.goto('/modcp/log')
    const entry = modPage.locator('li', { hasText: 'Locked a thread' }).first()
    await expect(entry).toBeVisible()
    await expect(entry).toContainText('e2e_moderator')
    await expect(entry.locator('dd')).toContainText([threadId!, 'true'])
  } finally {
    await close()
  }
})

test('the staff screens refuse whoever is not staff', async ({ browser }) => {
  const memberContext = await browser.newContext()
  const modContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  const modPage = await modContext.newPage()

  try {
    await signUp(memberPage, 'nonstaff')

    for (const url of ['/modcp', '/moderation', '/moderation/reports', '/admin']) {
      const response = await memberPage.goto(url)
      expect(response?.status(), url).toBe(404)
    }

    await signInAsModerator(modPage)
    for (const url of ['/modcp', '/moderation', '/moderation/reports']) {
      const response = await modPage.goto(url)
      expect(response?.status(), url).toBe(200)
    }
    expect((await modPage.goto('/admin'))?.status()).toBe(404)
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})
