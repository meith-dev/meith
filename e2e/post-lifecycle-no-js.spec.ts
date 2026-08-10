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

    await member.goto(url)
    const edit = await member.locator('a[href*="/edit?post="]').last().getAttribute('href')
    expect(edit).toMatch(/\/edit\?post=\d+$/)

    await member.goto(edit!)
    await expect(
      member.getByText('Deleting hides this post from the thread. A moderator can put it back.'),
    ).toBeVisible()
    await member.getByRole('button', { name: 'Delete this post' }).click()

    await expect(member).toHaveURL(/\?removed=post$/)
    await expect(member.getByText('That post has been deleted.')).toBeVisible()
    await expect(member.getByText('A reply I will regret.')).toHaveCount(0)

    await member.goto(url)
    await expect(member.getByText('0 replies')).toBeVisible()
    await expect(member.getByText('1 post', { exact: true }).first()).toBeVisible()

    await mod.goto(edit!)
    await expect(
      mod.getByText(/This post is deleted\. Restoring puts it back in the thread/),
    ).toBeVisible()
    await mod.getByRole('button', { name: 'Restore this post' }).click()

    await member.goto(url)
    await expect(member.getByText('A reply I will regret.')).toBeVisible()
    await expect(member.getByText('1 reply')).toBeVisible()
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})

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

    await author.goto(url)
    await expect(author.getByText('Written by somebody who is not a moderator.')).toBeVisible()

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

    await member.goto('/usercp/signature')
    await member.getByLabel('Signature').fill('Buy my thing at example.test')
    await member.getByRole('button', { name: /Save/ }).click()

    await signInAsModerator(mod)
    await mod.goto(`/member/by-name/${name}`)
    await expect(mod.getByText('Signature: allowed')).toBeVisible()

    const signature = mod.locator('form').filter({ hasText: 'Lock their signature' })
    await signature.getByPlaceholder('Why (shown to the member)').fill('Advertising in it.')
    await signature.getByRole('button', { name: 'Lock their signature' }).click()

    await expect(mod).toHaveURL(/\?signature=locked$/)
    await expect(mod.getByText('Signature: locked')).toBeVisible()

    const avatar = mod.locator('form').filter({ hasText: 'Lock their avatar' })
    await avatar.getByPlaceholder('Why (shown to the member)').fill('Not suitable.')
    await avatar.getByRole('button', { name: 'Lock their avatar' }).click()
    await expect(mod.getByRole('button', { name: 'Unlock their avatar' })).toBeVisible()

    await member.goto('/usercp/signature')
    await expect(member.getByText('Your signature is locked')).toBeVisible()
    await expect(member.getByText(/Reason given: Advertising in it\./)).toBeVisible()
    await expect(member.getByLabel('Signature')).toHaveCount(0)

    await member.goto('/usercp/avatar')
    await expect(member.getByText('Your avatar is locked')).toBeVisible()
    await expect(member.getByText(/Reason given: Not suitable\./)).toBeVisible()
    await expect(member.getByLabel('Choose an image')).toHaveCount(0)

    await mod.getByRole('button', { name: 'Unlock their signature' }).click()
    await expect(mod.getByText('Signature: allowed')).toBeVisible()

    await member.goto('/usercp/signature')
    await expect(member.getByLabel('Signature')).toBeVisible()
  } finally {
    await memberContext.close()
    await modContext.close()
  }
})
