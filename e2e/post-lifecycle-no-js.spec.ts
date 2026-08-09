/**
 * A post after it is written: deleted, put back, and who is allowed to do either.
 *
 * ## What had no coverage
 *
 * `deletePostAction` and `restorePostAction` are the two halves of F41 and
 * neither had ever been driven from a browser. The inline bar's Delete was
 * covered; the *author's own* Delete was not, and **restore was not covered at
 * all** — which matters more than it sounds, because a soft delete a moderator
 * cannot undo is a hard delete with a friendlier name.
 *
 * F53's signature and avatar locks were in the same position: two writers on
 * the member page, no spec, and their whole point is a consequence somewhere
 * else — the member's own control panel refusing to change a thing.
 *
 * ## And the reason the appointment test is here
 *
 * `resolvePostScope` is the one answer to "may this actor touch this post", and
 * the third test drives it through the screens that ask it. Both defects it
 * pins were found by walking these screens in a browser:
 *
 *  - a member appointed to **Edit posts** was offered an Edit link by the
 *    postbit and got a **404** when they followed it, because the thread page
 *    resolved the appointment and `resolvePostScope` did not;
 *  - a member appointed to **Split threads and nothing else** could delete
 *    other people's posts, because `post.softDelete` read the bare
 *    "is an appointee" flag rather than the right it is named after.
 *
 * They are one test because they are one question asked twice, and a fix for
 * either that reintroduced the other would still be wrong.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

import { enterAdminPanel, signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const GENERAL = '/200-general'
const OFF_TOPIC = '/201-off-topic'

async function threadWith(
  page: Page,
  forum: string,
  subject: string,
  bodies: readonly string[],
): Promise<string> {
  await page.goto(forum)
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('Message').fill(bodies[0]!)
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const url = page.url().split('#')[0]!
  for (const body of bodies.slice(1)) {
    await page.goto(`${url}/reply`)
    await page.getByLabel('Message').fill(body)
    await page.getByRole('button', { name: 'Post reply' }).click()
    await expect(page).toHaveURL(/#post-\d+$/)
  }
  return url
}

test('an author deletes their own post, and a moderator puts it back', async ({ browser }) => {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    await signUp(member, 'undo')
    await signInAsModerator(mod)

    const url = await threadWith(member, GENERAL, `Second thoughts ${Date.now()}`, [
      'The opening post, which stays.',
      'A reply I will regret.',
    ])

    /* The Edit screen is where both visibility controls live — see `EditPostPage`. */
    await member.goto(url)
    const edit = await member.locator('a[href*="/edit?post="]').last().getAttribute('href')
    expect(edit).toMatch(/\/edit\?post=\d+$/)

    await member.goto(edit!)
    await expect(
      member.getByText('Deleting hides this post from the thread. A moderator can put it back.'),
    ).toBeVisible()
    await member.getByRole('button', { name: 'Delete this post' }).click()

    /* Back to the thread, told what happened, with the post gone from it. */
    await expect(member).toHaveURL(/\?post=deleted$/)
    await expect(member.getByText('That post has been deleted.')).toBeVisible()
    await expect(member.getByText('A reply I will regret.')).toHaveCount(0)

    /*
     * The counters moved with it. This is the half a "hide it in the template"
     * implementation gets wrong and nothing notices for a month: the thread's
     * reply count and the author's post count are denormalised, and a soft
     * delete has to walk both down.
     */
    await member.goto(url)
    await expect(member.getByText('0 replies')).toBeVisible()
    await expect(member.getByText('1 post', { exact: true }).first()).toBeVisible()

    /*
     * The moderator can still see it, which is what makes restoring possible at
     * all — `content.viewDeleted` is deliberately broader than the right to
     * delete, because you cannot put back what you cannot find.
     */
    await mod.goto(edit!)
    await expect(
      mod.getByText(/This post is deleted\. Restoring puts it back in the thread/),
    ).toBeVisible()
    await mod.getByRole('button', { name: 'Restore this post' }).click()

    /* And it is a post again, for the member, with the counters back. */
    await member.goto(url)
    await expect(member.getByText('A reply I will regret.')).toBeVisible()
    await expect(member.getByText('1 reply')).toBeVisible()
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})

/**
 * Appoint one member to Off Topic with exactly the rights named, and take the
 * appointment away again.
 *
 * The teardown is not tidiness. `admin-tabs-no-js.spec.ts` opens the same screen
 * and asserts "Nobody moderates this forum." — an appointment left behind here
 * would fail a spec in another file, which is the worst kind of failure to
 * debug.
 */
async function withAppointment(
  browser: Browser,
  member: string,
  rights: readonly string[],
  body: () => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const admin = await context.newPage()

  try {
    await enterAdminPanel(admin)
    await admin.goto('/admin/forums')
    await admin.getByRole('link', { name: 'Options for Off Topic' }).click()

    const form = admin.locator('form').filter({ hasText: 'Save appointment' })
    await form.getByLabel('Member', { exact: true }).fill(member)
    for (const right of rights) {
      await form.getByRole('checkbox', { name: right, exact: true }).check()
    }
    await form.getByRole('button', { name: 'Save appointment' }).click()
    await expect(admin.locator('li').filter({ hasText: member })).toBeVisible()

    await body()
  } finally {
    await admin.goto('/admin/forums')
    await admin.getByRole('link', { name: 'Options for Off Topic' }).click()
    const row = admin.locator('li').filter({ hasText: member })
    if ((await row.count()) > 0) {
      await row.getByRole('button', { name: 'Remove' }).click()
      await expect(admin.locator('li').filter({ hasText: member })).toHaveCount(0)
    }
    await context.close()
  }
}

test('an appointment grants the rights it names, and only those', async ({ browser }) => {
  const authorContext = await browser.newContext({ javaScriptEnabled: false })
  const author = await authorContext.newPage()

  const splitterContext = await browser.newContext({ javaScriptEnabled: false })
  const splitter = await splitterContext.newPage()

  const editorContext = await browser.newContext({ javaScriptEnabled: false })
  const editor = await editorContext.newPage()

  try {
    await signUp(author, 'wrote')
    const splitterName = await signUp(splitter, 'onlysplit')
    const editorName = await signUp(editor, 'mayedit')

    const url = await threadWith(author, OFF_TOPIC, `Somebody else’s post ${Date.now()}`, [
      'Written by somebody who is not a moderator.',
      'And a reply, also theirs.',
    ])

    /*
     * Appointed to split threads and nothing else. This member could delete
     * other people's posts: the postbit offered them the inline Delete and the
     * action performed it, on the strength of an appointment to a completely
     * different job.
     */
    await withAppointment(browser, splitterName, ['Split threads'], async () => {
      await splitter.goto(url)

      await expect(
        splitter.locator('form#inline-moderation').getByRole('button', {
          name: 'Delete',
          exact: true,
        }),
        'an appointment to split threads must not offer to delete posts',
      ).toHaveCount(0)

      await expect(
        splitter.locator(`a[href*="/edit?post="]`),
        'nor to edit them',
      ).toHaveCount(0)

      /*
       * Not merely un-offered. The action re-authorises everything it is given,
       * so submitting the id by hand — the whole point of a permission check
       * living on the server — is refused too. `Split out` is the button this
       * member *does* hold, and the selection it carries is a post they do not
       * own, which is exactly the shape the delete would have had.
       */
      await splitter.getByLabel('Select post #2 for moderation').check()
      await splitter
        .locator('form#inline-moderation')
        .getByRole('textbox', { name: 'Title for the new thread' })
        .fill(`Proof the checkbox works ${Date.now()}`)
      await splitter.locator('form#inline-moderation').getByRole('button', { name: 'Split out' }).click()
      await expect(
        splitter.getByRole('heading', { name: /^Proof the checkbox works/ }),
        'the right they were given still works',
      ).toBeVisible()
    })

    /* The post survived the appointment that should never have reached it. */
    await author.goto(url)
    await expect(author.getByText('Written by somebody who is not a moderator.')).toBeVisible()

    /*
     * The other half. An appointment to Edit posts and Delete posts has to
     * *work*: the link was offered and the screen behind it was a 404, because
     * the page and the scope resolved the appointment differently.
     */
    await withAppointment(browser, editorName, ['Edit posts', 'Delete posts'], async () => {
      await editor.goto(url)
      const edit = await editor.locator('a[href*="/edit?post="]').first().getAttribute('href')
      expect(edit, 'the postbit offers the Edit it was appointed to').not.toBeNull()

      const response = await editor.goto(edit!)
      expect(response?.status(), 'and the screen behind it exists').toBe(200)

      await editor.getByLabel('Message').fill('Edited by the moderator who was appointed to.')
      await editor.getByRole('button', { name: 'Save changes' }).click()

      await editor.goto(url)
      await expect(
        editor.getByText('Edited by the moderator who was appointed to.'),
      ).toBeVisible()
    })

    /* Read back by the author, whose post it is. */
    await author.goto(url)
    await expect(author.getByText('Edited by the moderator who was appointed to.')).toBeVisible()
  } finally {
    await authorContext.close()
    await splitterContext.close()
    await editorContext.close()
  }
})

test('a moderator locks a member’s signature and avatar, and their panel says so', async ({
  browser,
}) => {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    const name = await signUp(member, 'locked')

    /* A signature to lock, so the consequence is visible rather than notional. */
    await member.goto('/usercp/signature')
    await member.getByLabel('Signature').fill('Buy my thing at example.test')
    await member.getByRole('button', { name: /Save/ }).click()

    await signInAsModerator(mod)
    await mod.goto(`/member/by-name/${name}`)
    await expect(mod.getByText('Signature: allowed')).toBeVisible()

    /*
     * The reason is required, and it is required because the member is shown
     * it. A lock with no explanation is a member writing to the staff to ask
     * what happened.
     */
    const signature = mod.locator('form').filter({ hasText: 'Lock their signature' })
    await signature.getByPlaceholder('Why (shown to the member)').fill('Advertising in it.')
    await signature.getByRole('button', { name: 'Lock their signature' }).click()

    await expect(mod).toHaveURL(/\?signature=locked$/)
    await expect(mod.getByText('Signature: locked')).toBeVisible()

    const avatar = mod.locator('form').filter({ hasText: 'Lock their avatar' })
    await avatar.getByPlaceholder('Why (shown to the member)').fill('Not suitable.')
    await avatar.getByRole('button', { name: 'Lock their avatar' }).click()
    await expect(mod.getByRole('button', { name: 'Unlock their avatar' })).toBeVisible()

    /*
     * The consequence, which is the feature. The member's own screens refuse —
     * with the reason they were given, so they know what to fix — rather than
     * accepting a change the board then declines to render.
     */
    await member.goto('/usercp/signature')
    await expect(member.getByText('Your signature is locked')).toBeVisible()
    await expect(member.getByText(/Reason given: Advertising in it\./)).toBeVisible()
    await expect(member.getByLabel('Signature')).toHaveCount(0)

    await member.goto('/usercp/avatar')
    await expect(member.getByText('Your avatar is locked')).toBeVisible()
    await expect(member.getByText(/Reason given: Not suitable\./)).toBeVisible()
    await expect(member.getByLabel('Choose an image')).toHaveCount(0)

    /* And a lock is reversible, which is what makes it a moderation act. */
    await mod.getByRole('button', { name: 'Unlock their signature' }).click()
    await expect(mod.getByText('Signature: allowed')).toBeVisible()

    await member.goto('/usercp/signature')
    await expect(member.getByLabel('Signature')).toBeVisible()
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})
