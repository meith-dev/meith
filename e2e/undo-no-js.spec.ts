/**
 * The four writers that take something back, none of which had ever been pressed.
 *
 * A board is judged on its undo as much as on its do, and this is the corner of
 * the suite where every "do" was covered and the matching "undo" was not:
 *
 *  - `messageBulkAction` — the inbox's whole action bar. Sending and reading a
 *    message was covered; trashing one, restoring it, marking it unread again
 *    and emptying the trash were not, and they are the four things a member
 *    does to a folder every day.
 *  - `removeAvatarAction` — uploading was covered from the first day the suite
 *    could write. Taking the picture down was not.
 *  - `revokeWarningAction` — F53's warning was covered as far as "the points are
 *    on the record". A warning issued in error and un-issuable is a moderator
 *    tool nobody dares use.
 *  - `withdrawRatingAction` — the same shape on F62's reputation: rating a
 *    member was covered, changing your mind was not.
 *
 * All four are also `form`-attribute or hidden-field writes with scripting off,
 * which is the property that makes them worth a browser rather than a unit test.
 */
import { expect, test, type Page } from '@playwright/test'

import { samplePng } from './support/png'
import { signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/*
 * Headroom, not an estimate.
 *
 * Playwright's default is 30 seconds and these tests sit just under it, which
 * is the worst place to be: they passed alone and failed in a full run, twice,
 * on a navigation that was merely slow. The work is real rather than wasteful —
 * every `signUp` is a registration *and* a sign-in, so two Argon2id hashes, the
 * panel asks for the password a second time on purpose, and the board runs on
 * `DATABASE_POOL_MAX=1` (see `e2e/support/database.ts`), so none of it overlaps.
 *
 * A spec that fails one run in three teaches people to re-run it, after which a
 * real failure gets re-run too — the same reasoning `playwright.config.ts`
 * records for the installer's project.
 */
test.describe.configure({ timeout: 120_000 })

/** Send one message from `from` to `to`, and return its subject. */
async function sendMessage(from: Page, to: string, subject: string): Promise<string> {
  await from.goto('/messages/compose')
  /* By name: "To" also matches the shell's forum-jump box on this page. */
  await from.locator('input[name="to"]').fill(to)
  await from.getByLabel('Subject').fill(subject)
  await from.getByLabel('Message').fill(`The body of ${subject}.`)
  await from.getByRole('button', { name: 'Send message' }).click()
  return subject
}

test('a member trashes a message, restores it, and empties the folder', async ({ browser }) => {
  const senderContext = await browser.newContext({ javaScriptEnabled: false })
  const sender = await senderContext.newPage()
  const readerContext = await browser.newContext({ javaScriptEnabled: false })
  const reader = await readerContext.newPage()

  try {
    await signUp(sender, 'writes')
    const recipient = await signUp(reader, 'reads')

    const kept = await sendMessage(sender, recipient, `One to keep ${Date.now()}`)
    const binned = await sendMessage(sender, recipient, `One to bin ${Date.now()}`)

    await reader.goto('/messages')
    await expect(reader.getByRole('link', { name: kept })).toBeVisible()
    await expect(reader.getByRole('link', { name: binned })).toBeVisible()

    /*
     * Marking read is a bulk command rather than a side effect of opening the
     * message, so it is the one place "read" and "unread" are a member's choice.
     * Both directions, because an inbox you cannot mark unread again is one
     * where losing your place is permanent.
     */
    await reader.getByLabel(`Select “${kept}”`).check()
    await reader.getByRole('button', { name: 'Mark read' }).click()
    await expect(reader.getByRole('link', { name: kept })).toBeVisible()

    await reader.getByLabel(`Select “${kept}”`).check()
    await reader.getByRole('button', { name: 'Mark unread' }).click()

    /* Trashing moves it out of the inbox and into a folder it can come back from. */
    await reader.getByLabel(`Select “${binned}”`).check()
    await reader.getByRole('button', { name: 'Move to trash' }).click()
    await expect(reader.getByRole('link', { name: binned })).toHaveCount(0)
    await expect(reader.getByRole('link', { name: kept })).toBeVisible()

    await reader.goto('/messages?folder=trash')
    await expect(reader.getByRole('link', { name: binned })).toBeVisible()

    await reader.getByLabel(`Select “${binned}”`).check()
    await reader.getByRole('button', { name: 'Restore to inbox' }).click()

    await reader.goto('/messages')
    await expect(reader.getByRole('link', { name: binned })).toBeVisible()

    /*
     * And emptying the trash is the one command that acts on the folder rather
     * than on a selection — a member clearing it out has ticked nothing, which
     * is why it is a separate button and worth its own assertion.
     */
    await reader.getByLabel(`Select “${binned}”`).check()
    await reader.getByRole('button', { name: 'Move to trash' }).click()
    await reader.goto('/messages?folder=trash')
    await reader.getByRole('button', { name: 'Empty trash' }).click()
    await expect(reader.getByRole('link', { name: binned })).toHaveCount(0)

    /* Permanent, and it took nothing else with it. */
    await reader.goto('/messages')
    await expect(reader.getByRole('link', { name: kept })).toBeVisible()
    await expect(reader.getByRole('link', { name: binned })).toHaveCount(0)
  } finally {
    await senderContext.close()
    await readerContext.close()
  }
})

test('a member takes their avatar down again', async ({ page, request }) => {
  await signUp(page, 'noface')

  /*
   * Uploading first, through the queue, because "remove" only means anything
   * once there is something to remove — and the removal has to survive the
   * re-encode having already run, which is the state a real member is in.
   */
  await page.goto('/usercp/avatar')
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: samplePng(120, 120),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  const shown = page.locator('img[alt="Your avatar"]')
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto('/usercp/avatar')
    await expect(shown).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000, 10_000] })

  const src = await shown.getAttribute('src')
  expect(src).toMatch(/^\/avatar\/\d+\?v=\d+$/)

  await page.getByRole('button', { name: 'Remove my avatar' }).click()

  /* The card goes back to saying there is none, and the picture is not served. */
  await expect(page.getByText('You have not set one.')).toBeVisible()
  await expect(shown).toHaveCount(0)
  expect(
    (await request.get(src!)).status(),
    'the versioned URL must stop answering once the avatar is gone',
  ).toBe(404)
})

test('a moderator revokes a warning, and the points come off', async ({ browser }) => {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    const name = await signUp(member, 'warned')

    /* Something to be warned about. */
    await member.goto('/200-general')
    await member.getByRole('link', { name: 'New thread' }).click()
    await member.getByLabel('Subject').fill(`Warnable ${Date.now()}`)
    await member.getByLabel('Message').fill('Something a moderator will act on.')
    await member.getByRole('button', { name: 'Post thread' }).click()
    await expect(member).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = member.url().split('#')[0]

    await signInAsModerator(mod)
    await mod.goto(threadUrl)
    await mod.getByRole('link', { name: 'Warn', exact: true }).first().click()
    await expect(mod).toHaveURL(/\/moderation\/warn\?user=\d+&post=\d+$/)
    await expect(mod.getByRole('heading', { name: `Warnings for ${name}` })).toBeVisible()

    /*
     * The reason is a `<select>` of the board's warning types and "Reason"
     * alone also matches the free-text title box — see `moderation-no-js` for
     * the same trap. The role is what says which control is meant.
     */
    const reason = mod.getByRole('combobox', { name: 'Reason' })
    const spamming = reason.locator('option', { hasText: 'Spamming' })
    await reason.selectOption((await spamming.getAttribute('value')) ?? '')
    await mod.getByLabel('What this is for').fill('Issued, and about to be taken back.')
    await mod.getByRole('button', { name: 'Issue warning' }).click()

    await expect(mod.getByText('Warning issued.')).toBeVisible()
    await expect(mod.getByText(/^2 points\./)).toBeVisible()

    /*
     * Revoking, with a reason of its own. The warning is **not deleted** — the
     * row stays and says who withdrew it and why, because a warning that can be
     * quietly removed is one a member cannot appeal and a moderator cannot be
     * held to.
     */
    const record = mod.locator('li').filter({ hasText: 'Issued, and about to be taken back.' })
    await record.getByPlaceholder('Why it is being withdrawn').fill('Wrong member.')
    await record.getByRole('button', { name: 'Revoke' }).click()

    const revoked = mod.locator('li').filter({ hasText: 'Issued, and about to be taken back.' })
    await expect(revoked).toContainText('Revoked by')
    await expect(revoked).toContainText('Wrong member.')
    /* And it offers no second Revoke, because there is nothing left to revoke. */
    await expect(revoked.getByRole('button', { name: 'Revoke' })).toHaveCount(0)

    /*
     * The points came off the running total, which is what every threshold on
     * the board is counted against — a revoke that left the total alone would
     * still ban the member at the next warning.
     */
    await expect(mod.getByText(/^0 points\./)).toBeVisible()
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})

test('a member withdraws a rating they gave', async ({ browser }) => {
  const raterContext = await browser.newContext({ javaScriptEnabled: false })
  const rater = await raterContext.newPage()
  const subjectContext = await browser.newContext({ javaScriptEnabled: false })
  const subject = await subjectContext.newPage()

  try {
    const rated = await signUp(subject, 'unrated')
    await signUp(rater, 'ratesback')

    await rater.goto(`/member/by-name/${rated}`)
    await expect(rater).toHaveURL(/\/member\/\d+$/)
    const reputationUrl = `${rater.url()}/reputation`
    await rater.goto(reputationUrl)

    const comment = `Withdrawn in a moment ${Date.now().toString(36)}.`
    await rater.getByLabel('Why (optional)').fill(comment)
    await rater.getByRole('button', { name: 'Thanks', exact: true }).click()

    const given = rater.getByRole('listitem').filter({ hasText: comment })
    await expect(given).toBeVisible()
    await expect(rater.getByText('+1 (1 positive)')).toBeVisible()

    await given.getByRole('button', { name: 'Withdraw' }).click()

    /*
     * Gone from the list **and out of the total**. A withdrawal that only
     * removed the row would leave the number it contributed standing, which is
     * the figure everybody actually reads.
     */
    await expect(rater.getByRole('listitem').filter({ hasText: comment })).toHaveCount(0)
    await expect(rater.getByText('+1 (1 positive)')).toHaveCount(0)

    /*
     * And for the member it was given to, who is the one person who could not
     * have given or withdrawn it — a page echoing the viewer's own state back
     * would pass every assertion above and fail here.
     */
    await subject.goto(`/member/by-name/${rated}`)
    await expect(subject.getByText(comment)).toHaveCount(0)
    await expect(subject.getByText('+1 (1 positive)')).toHaveCount(0)
  } finally {
    await raterContext.close()
    await subjectContext.close()
  }
})
