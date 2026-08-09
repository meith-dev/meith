/**
 * Moderation, in a browser, with JavaScript off.
 *
 * **This is the standing gap `plan-status.md` has named since the e2e database
 * landed**, and it was not one gap but a class of them. Nothing in the browser
 * suite could sign in as staff: a registration always lands in the Registered
 * group, and the seeded `admin` carried a hash nothing could match — so the
 * moderation queue, the report list, the thread tools, warnings and the
 * moderator log had *no browser-level proof at all*, while ten features were
 * built on top of them. `e2e/support/database.ts` now seeds a super moderator
 * with a real password, and this is what walks through the door.
 *
 * Everything here runs as a **super moderator rather than an administrator**,
 * on purpose. An administrator bypasses forum permissions entirely (R4.2), so a
 * moderation spec driven as `admin` proves the bypass works and says nothing
 * about the path nearly every board actually runs on.
 *
 * And everything here runs with scripting disabled, which is not a flourish:
 * the inline-moderation checkboxes sit *outside* the form they submit to and
 * are wired to it by the HTML `form` attribute. That is precisely the claim
 * that only a browser can check — a unit test can assert the attribute is
 * emitted and cannot tell you whether a browser posts the boxes with it.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

import { signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/**
 * A member, a thread of their own, and the moderator looking at it.
 *
 * Fresh content every time rather than the seeded threads, and that is
 * load-bearing: this file locks, pins, moves and deletes things, and the suite
 * shares one database with the twelve specs that read the seeded board. A spec
 * that pinned thread 4 would fail the reading spec three files later, for a
 * reason nothing in that file could explain.
 */
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
    /*
     * Reported by somebody who is not the author. A report is a member telling
     * staff about *another* member's post, and the queue it lands in belongs to
     * neither of them — three parties, which is why this needs a browser at all.
     */
    const reporterContext = await browser.newContext()
    const reporterPage = await reporterContext.newPage()
    const reporter = await signUp(reporterPage, 'flagger')

    await reporterPage.goto(threadUrl)
    await reporterPage.getByRole('link', { name: 'Report', exact: true }).first().click()
    await expect(reporterPage).toHaveURL(/\/report\?kind=post&id=\d+$/)

    await reporterPage.getByLabel('What is wrong with it?').fill('This looks like spam.')
    await reporterPage.getByRole('button', { name: 'Send report' }).click()
    /* Back to the thread, said out loud, rather than a dead end on a form. */
    await expect(reporterPage).toHaveURL(/\?reported=1$/)

    /* The report is in the moderator's list, with the reporter and the reason. */
    await modPage.goto('/moderation/reports')
    const report = modPage.locator('li', { hasText: title })
    await expect(report).toBeVisible()
    await expect(report).toContainText(`reported by ${reporter}`)
    await expect(report).toContainText('This looks like spam.')

    /*
     * Unassigned until somebody says otherwise. Taking it is what stops two
     * moderators doing the same work, so "who has it" is part of the row rather
     * than something to infer.
     */
    await expect(report).toContainText('Unassigned')
    await report.getByRole('button', { name: 'Take this' }).click()
    const taken = modPage.locator('li', { hasText: title })
    await expect(taken).not.toContainText('Unassigned')

    /*
     * Resolving it with a note takes it off the open list.
     *
     * Asserted as "this report is gone", never as "the list is empty": the
     * suite shares one database, so a report another spec opened would make an
     * emptiness assertion fail here for a reason that has nothing to do with
     * resolving.
     */
    await taken.getByLabel(/Note for moderators/).fill('Deleted and warned.')
    await taken.getByRole('button', { name: 'Resolve' }).click()

    await expect(modPage.locator('li', { hasText: title })).toHaveCount(0)

    /*
     * The note is exactly what the screen says it is: for moderators. The
     * reporter is not shown it, and neither is the author — asserted on the
     * thread, because that is the page both of them read.
     */
    await memberPage.goto(threadUrl)
    await expect(memberPage.getByText('Deleted and warned.')).toHaveCount(0)

    await reporterContext.close()
  } finally {
    await close()
  }
})

/**
 * The `form` attribute, which is the whole no-JavaScript story for this control.
 *
 * Each post carries a checkbox in its own header and the bar that acts on them
 * is at the foot of the page, outside any form the checkbox sits in. They are
 * joined by `form="inline-moderation"` on the input — an HTML feature with no
 * script behind it, and the only reason a moderator can tick three posts and
 * press one button without JavaScript.
 *
 * The attribute is asserted **and then used**, because the two say different
 * things: the first is that the markup is right, the second is that a browser
 * agrees.
 */
test('inline moderation submits the posts a moderator ticked, with scripting off', async ({
  browser,
}) => {
  const { memberPage, modPage, threadUrl, close } = await scene(browser, 'inline')

  try {
    /* Two more posts, so ticking one and leaving the others is meaningful. */
    for (const words of ['The second post, which stays.', 'The third post, which stays too.']) {
      await memberPage.goto(`${threadUrl}/reply`)
      await memberPage.getByLabel('Message').fill(words)
      await memberPage.getByRole('button', { name: 'Post reply' }).click()
      await expect(memberPage).toHaveURL(/#post-\d+$/)
    }

    await modPage.goto(threadUrl)

    const boxes = modPage.locator('input[name="item"][form="inline-moderation"]')
    await expect(boxes).toHaveCount(3)
    /* The bar it posts to really is a different element in the tree. */
    await expect(modPage.locator('form#inline-moderation')).toHaveCount(1)
    await expect(modPage.locator('form#inline-moderation input[name="item"]')).toHaveCount(0)

    /* Tick the first post only. */
    await boxes.first().check()
    await modPage
      .locator('form#inline-moderation')
      .getByRole('button', { name: 'Delete', exact: true })
      .click()

    /*
     * The first post's words are **absent from the page** a member is served,
     * not merely styled away — a soft delete withholds the body server-side.
     * The other two are untouched, which is the half that says the checkbox
     * carried a selection rather than the bar acting on everything.
     */
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
    /* The control is a toggle, so the way back is the proof it landed. */
    await expect(modPage.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible()

    /*
     * The member is told, and — this is the part a missing check would pass
     * without — the reply route itself refuses. A composer hidden from the
     * thread page is a suggestion; an address anybody can type is the test.
     */
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

    /*
     * Pinning is a *sort*, not a badge, so the assertion is about position: the
     * newly pinned thread is the first row of the listing even though the
     * seeded pinned thread and every other thread in this forum is older or
     * newer by turns.
     */
    await modPage.goto('/200-general')
    await expect(modPage.getByText('Pinned').first()).toBeVisible()
    const first = modPage.locator('main a[href^="/thread/"]').first()
    await expect(first).toHaveText(title)

    /* Move it to the child forum, and it is listed there instead. */
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

/**
 * The same control on a listing, where the selection is threads rather than
 * posts.
 *
 * Worth its own test rather than trusting the thread page's: it is a second
 * rendering of the same idea, on a page whose rows are produced by a different
 * view model, and "the checkboxes work in one place" has never implied the
 * other.
 */
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

    /* The member finds their own thread closed to replies. */
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
    /* Warn is a link on the post's action row, carrying both ids. */
    const warn = modPage.getByRole('link', { name: 'Warn', exact: true }).first()
    await expect(warn).toHaveAttribute('href', /\/moderation\/warn\?user=\d+&post=\d+$/)
    await warn.click()

    await expect(modPage.getByRole('heading', { name: `Warnings for ${member}` })).toBeVisible()
    /* Nothing yet — the state the next assertion has to move away from. */
    await expect(modPage.getByText('Never warned')).toBeVisible()

    /*
     * By the option's own value rather than by its full label. The label is
     * assembled on the page — "Spamming — 2 points, expires after 90 days" —
     * and `selectOption` matches a label exactly, so pinning the whole sentence
     * would break the day somebody rewords the points suffix. What is being
     * chosen is the seeded warning type, and its id is what says so.
     */
    /*
     * By role, because "Reason" alone is ambiguous on this form: the Title
     * field's own hint reads "Used only when no reason above is chosen", so a
     * label lookup matches the text box too. The role is what says which
     * control is meant.
     */
    const reason = modPage.getByRole('combobox', { name: 'Reason' })
    const spamming = reason.locator('option', { hasText: 'Spamming' })
    await reason.selectOption((await spamming.getAttribute('value')) ?? '')

    await modPage.getByLabel('What this is for').fill('Posting the same link in three threads.')
    await modPage.getByRole('button', { name: 'Issue warning' }).click()

    /*
     * The points, not merely the row: a warning whose points do not count is a
     * note, and the thresholds every board configures are counted off this
     * total.
     */
    await expect(modPage.getByText('Warning issued.')).toBeVisible()
    /* The running total, which is what a threshold is counted against… */
    await expect(modPage.getByText(/^2 points\./)).toBeVisible()
    /* …and the entry it came from, on the record with its reason. */
    await expect(modPage.getByText('Spamming — 2 points', { exact: true })).toBeVisible()
    await expect(modPage.getByText('Never warned')).toHaveCount(0)
    await expect(modPage.getByText('Posting the same link in three threads.')).toBeVisible()
  } finally {
    await close()
  }
})

/**
 * The log is the point of all of it.
 *
 * A moderation action nobody can review afterwards is indistinguishable from a
 * moderator acting alone, which is the thing a log exists to prevent. This is
 * the one assertion in the file that spans the others: whatever the tests above
 * did, the log has it.
 */
test('the moderator log records what was done, and by whom', async ({ browser }) => {
  const { modPage, threadUrl, close } = await scene(browser, 'logged')

  try {
    /*
     * The log identifies the thread by **id**, not by title — a title can be
     * edited afterwards and the record must still name the same thread — so
     * this reads the id out of the address rather than matching on words.
     */
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

/**
 * The moderator's screens are shut to a member, and the panel is shut to the
 * moderator.
 *
 * Both directions in one test because they are the same claim seen twice: the
 * board's staff surfaces are not merely unlinked, they are unreachable — and
 * the ACP answers a moderator with a **404** rather than a refusal, because the
 * whole value of hiding it is that its existence is not confirmed.
 */
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

    /* A moderator has every moderation screen and none of the panel. */
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
