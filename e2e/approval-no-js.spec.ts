/**
 * Held content, and the panel a moderator deals with it from.
 *
 * **This is the feature the browser suite had never once exercised.** F48's
 * approval queue is a whole write path — a forum flag, a post that exists and
 * is not visible, a bulk decision, and two different outcomes for the author —
 * and until this file the only thing any spec did with `/moderation` was assert
 * that a member who is not staff gets a 404 from it. Nothing put an item *in*
 * the queue, so nothing proved the flag holds anything back, that a guest
 * cannot read what is held, or that approving publishes it.
 *
 * F54's ModCP is here for the same reason and it is the same screen from the
 * other side: `/modcp`, `/modcp/forums` and `/modcp/ip` had no coverage at all.
 * They are in this file rather than their own because the overview's whole job
 * is to count what the queue holds, and a count is only worth asserting against
 * a queue somebody has just put something into.
 *
 * Scripting off, like every write on this board.
 */
import { expect, test, type Page } from '@playwright/test'

import { STAFF } from './support/config'
import { enterAdminPanel, signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/** Off Topic. The forum the admin specs already borrow and put back. */
const OFF_TOPIC = '/201-off-topic'

/**
 * Turn one of the two hold-for-approval flags on or off, in the panel.
 *
 * Through the form rather than through SQL because the flag being *reachable*
 * is half of what is under test: an operator holds a forum for approval by
 * ticking a box, and a box that saves nothing is exactly the class of bug this
 * board has found in itself before (see F18's `registration.method`).
 */
async function setHold(
  admin: Page,
  which: 'Hold new threads for approval' | 'Hold new replies for approval',
  on: boolean,
): Promise<void> {
  await admin.goto('/admin/forums')
  await admin.getByRole('link', { name: 'Options for Off Topic' }).click()
  const box = admin.getByLabel(which)
  if (on) await box.check()
  else await box.uncheck()
  await admin.getByRole('button', { name: 'Save forum' }).click()
  await expect(admin.getByText('Saved.')).toBeVisible()
}

/**
 * The queue row for one title, whatever else is waiting.
 *
 * By title rather than by index: the queue is board-wide for a super moderator,
 * so a leftover from another spec would make `.first()` a different item and
 * this file would approve somebody else's post.
 */
function queueRowFor(page: Page, title: string) {
  return page.locator('li').filter({ has: page.getByRole('link', { name: title }) })
}

test('a thread held for approval is invisible until a moderator approves it', async ({
  browser,
}) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  const guestContext = await browser.newContext({ javaScriptEnabled: false })
  const guest = await guestContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    await enterAdminPanel(admin)
    await setHold(admin, 'Hold new threads for approval', true)

    const author = await signUp(member, 'held')

    const title = `Waiting for a moderator ${Date.now()}`
    await member.goto(OFF_TOPIC)
    await member.getByRole('link', { name: 'New thread' }).click()
    await member.getByLabel('Subject').fill(title)
    await member.getByLabel('Message').fill('Held until somebody says otherwise.')
    await member.getByRole('button', { name: 'Post thread' }).click()

    /*
     * The author is told, and is told the truth. A board that said "posted" and
     * then showed them nothing is the commonest way this feature is got wrong,
     * and the one that makes people post the same thing three times.
     */
    await expect(member).toHaveURL(/\/201-off-topic\?posted=moderated$/)
    await expect(
      member.getByText('Your thread was posted and is waiting for a moderator to approve it.'),
    ).toBeVisible()

    /*
     * And it is genuinely held — not merely unlinked. The author does not see it
     * either: the visibility decision is F47's and it is made server-side for
     * everybody, which is the property that stops a held thread being readable
     * by anyone who guesses its address.
     */
    await member.goto(OFF_TOPIC)
    await expect(member.getByRole('link', { name: title })).toHaveCount(0)

    await guest.goto(OFF_TOPIC)
    await expect(guest.getByRole('link', { name: title })).toHaveCount(0)

    /* The moderator, who is a different session and a different door. */
    await signInAsModerator(mod)

    /*
     * The overview counts it before the queue is opened. Both numbers come from
     * `modCpCounts`, so this is also the assertion that the rail and the screen
     * cannot disagree — a moderator who reads "1 waiting" and finds an empty
     * queue stops trusting the panel.
     */
    await mod.goto('/modcp')
    const waiting = mod.locator('section').filter({ hasText: 'Waiting for you' })
    await expect(waiting.getByText(/held for approval/)).toBeVisible()
    await expect(waiting.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/moderation',
    )

    await mod.goto('/moderation')
    const row = queueRowFor(mod, title)
    await expect(row).toHaveCount(1)
    /*
     * The excerpt is the decision. A held thread has no page a moderator can
     * open — that is `buildQueueView`'s stated reason for linking the *forum* —
     * so if the body were not on this screen the decision would be blind.
     */
    await expect(row.getByText('Held until somebody says otherwise.')).toBeVisible()

    await row.getByRole('checkbox').check()
    await mod.getByRole('button', { name: 'Approve selected' }).click()

    await expect(mod).toHaveURL(/\/moderation\?did=approve&n=1$/)
    await expect(mod.getByText('Approved 1 item.')).toBeVisible()
    await expect(queueRowFor(mod, title)).toHaveCount(0)

    /*
     * Published, to everybody — including the guest, who is the reader the
     * whole flag exists to protect. Reloading a page they had already loaded is
     * deliberate: it kills a cache that would serve the pre-approval listing.
     */
    await guest.goto(OFF_TOPIC)
    await expect(guest.getByRole('link', { name: title })).toBeVisible()

    await guest.getByRole('link', { name: title }).click()
    await expect(guest.getByRole('heading', { name: title })).toBeVisible()
    await expect(guest.getByText('Held until somebody says otherwise.')).toBeVisible()
    await expect(guest.getByText(author, { exact: false }).first()).toBeVisible()
  } finally {
    /*
     * The flag first, and outside everything else. Left on, every spec that
     * posts into Off Topic after this one has its thread swallowed by a queue
     * it does not know about.
     */
    await setHold(admin, 'Hold new threads for approval', false)
    await staff.close()
    await memberContext.close()
    await guestContext.close()
    await modContext.close()
  }
})

test('a rejected reply never reaches the thread', async ({ browser }) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  const guestContext = await browser.newContext({ javaScriptEnabled: false })
  const guest = await guestContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    await enterAdminPanel(admin)
    await setHold(admin, 'Hold new replies for approval', true)

    /*
     * A thread to reply *to*. This flag holds replies only, so the opening post
     * lands normally and the thread is a visible place for the held reply to be
     * missing from.
     */
    await signUp(member, 'rejected')

    const title = `Somewhere to reply ${Date.now()}`
    await member.goto(OFF_TOPIC)
    await member.getByRole('link', { name: 'New thread' }).click()
    await member.getByLabel('Subject').fill(title)
    await member.getByLabel('Message').fill('The opening post is not held.')
    await member.getByRole('button', { name: 'Post thread' }).click()
    await expect(member).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = member.url().split('#')[0]

    const body = `A reply nobody will let through ${Date.now()}`
    await member.goto(`${threadUrl}/reply`)
    await member.getByLabel('Message').fill(body)
    await member.getByRole('button', { name: 'Post reply' }).click()

    /* Not `#post-…`: there is no permalink, because there is no visible post. */
    await expect(member.getByText(body)).toHaveCount(0)

    await signInAsModerator(mod)

    await mod.goto('/moderation')
    const row = mod.locator('li').filter({ hasText: body })
    await expect(row).toHaveCount(1)
    /*
     * "Reply", not "New thread": the queue says which of the two a moderator is
     * about to decide on, and getting that backwards would have them rejecting
     * a whole thread believing it was one message.
     */
    await expect(row.getByText('Reply', { exact: true })).toBeVisible()

    await row.getByRole('checkbox').check()
    await mod.getByRole('button', { name: 'Reject selected' }).click()

    await expect(mod).toHaveURL(/\/moderation\?did=reject&n=1$/)
    await expect(mod.getByText('Rejected 1 item.')).toBeVisible()

    /*
     * Rejected is decided, not "held forever": the queue stops offering it,
     * which is what keeps two moderators from arguing over the same row.
     */
    await expect(mod.locator('li').filter({ hasText: body })).toHaveCount(0)

    /*
     * And it never reaches the thread. The author is the reader to check —
     * rejection moves the post to `deleted`, and a moderator holding
     * `content.viewDeleted` is *supposed* to still see it, so asserting against
     * their page would have passed no matter what the flag did.
     *
     * The words are absent from what the author is served rather than hidden in
     * their markup: the visibility decision is made server-side, which is the
     * only version of it that a reader cannot undo with a stylesheet.
     */
    await member.goto(threadUrl)
    await expect(member.getByText(body)).toHaveCount(0)
    await expect(member.getByText('The opening post is not held.')).toBeVisible()

    await guest.goto(threadUrl)
    await expect(guest.getByText(body)).toHaveCount(0)
  } finally {
    await setHold(admin, 'Hold new replies for approval', false)
    await staff.close()
    await memberContext.close()
    await guestContext.close()
    await modContext.close()
  }
})

/**
 * The three ModCP screens, none of which had ever been opened by a spec.
 *
 * Driven as the *moderator* rather than as `admin`, for `database.ts`'s stated
 * reason: an administrator bypasses forum permissions entirely, so a panel that
 * renders for them proves the bypass works and says nothing about the path
 * nearly every board actually runs on.
 */
test('the moderator panel says what is waiting and what this moderator may do', async ({
  page,
}) => {
  await signInAsModerator(page)

  await page.goto('/modcp')
  await expect(page.getByRole('heading', { name: 'Moderator control panel' })).toBeVisible()
  /* Every section in the rail is a real screen, resolved from `modCpSections`. */
  for (const name of ['Approval queue', 'Reports', 'My forums', 'Moderator log']) {
    await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible()
  }

  /*
   * F50's whole reason for existing: before this screen a moderator found out
   * what they had been appointed to by pressing a button and being refused.
   * The seeded moderator is a *super* moderator, so they hold every right in
   * every forum — which makes the assertion "the rights are named", not "these
   * particular rights", and the per-appointment case is in `post-lifecycle`.
   */
  await page.goto('/modcp/forums')
  await expect(page.getByRole('heading', { name: 'My forums' })).toBeVisible()
  const offTopic = page.locator('li').filter({ hasText: 'Off Topic' })
  await expect(offTopic.getByText('Approve content')).toBeVisible()
  await expect(offTopic.getByText('Lock and unlock')).toBeVisible()

  /*
   * The address lookup, which is gated separately from the panel — seeing the
   * queue and asking who else posts from an address are different powers.
   */
  await page.goto('/modcp/ip')
  await expect(page.getByRole('heading', { name: 'Address lookup' })).toBeVisible()
  await page.getByLabel('Member id').fill(String(STAFF.admin.id))
  await page.getByRole('button', { name: 'Look up' }).click()

  await expect(page).toHaveURL(new RegExp(`/modcp/ip\\?user=${STAFF.admin.id}$`))
  await expect(page.getByText(`Accounts sharing a range with`)).toBeVisible()
  /*
   * The board truncates every address before storing it (F09), so the honest
   * answer for a seeded account is "no range on record" — and the screen says
   * that rather than rendering a confident empty table.
   */
  await expect(page.getByText('Ranges on record:')).toBeVisible()

  /* A member id nobody has is a sentence, not a crash. */
  await page.goto('/modcp/ip?user=99999')
  await expect(page.getByText('No such member.')).toBeVisible()

  /*
   * And the lookup is written to the log whether or not it found anything — a
   * log that recorded only the productive ones could not answer "who has been
   * going through the membership".
   */
  await page.goto('/modcp/log')
  await expect(page.getByText('Looked up an address').first()).toBeVisible()
})
