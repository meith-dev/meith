import { expect, test, type Page } from '@playwright/test'

import { STAFF } from './support/config'
import { enterAdminPanel, signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const OFF_TOPIC = '/201-off-topic'

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

    await expect(member).toHaveURL(/\/201-off-topic\?posted=moderated$/)
    await expect(
      member.getByText('Your thread was posted and is waiting for a moderator to approve it.'),
    ).toBeVisible()

    await member.goto(OFF_TOPIC)
    await expect(member.getByRole('link', { name: title })).toHaveCount(0)

    await guest.goto(OFF_TOPIC)
    await expect(guest.getByRole('link', { name: title })).toHaveCount(0)

    await signInAsModerator(mod)

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
    await expect(row.getByText('Held until somebody says otherwise.')).toBeVisible()

    await row.getByRole('checkbox').check()
    await mod.getByRole('button', { name: 'Approve selected' }).click()

    await expect(mod).toHaveURL(/\/moderation\?did=approve&n=1$/)
    await expect(mod.getByText('Approved 1 item.')).toBeVisible()
    await expect(queueRowFor(mod, title)).toHaveCount(0)

    await guest.goto(OFF_TOPIC)
    await expect(guest.getByRole('link', { name: title })).toBeVisible()

    await guest.getByRole('link', { name: title }).click()
    await expect(guest.getByRole('heading', { name: title })).toBeVisible()
    await expect(guest.getByText('Held until somebody says otherwise.')).toBeVisible()
    await expect(guest.getByText(author, { exact: false }).first()).toBeVisible()
  } finally {
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

    await signUp(member, 'rejected')

    const title = `Somewhere to reply ${Date.now()}`
    await member.goto(OFF_TOPIC)
    await member.getByRole('link', { name: 'New thread' }).click()
    await member.getByLabel('Subject').fill(title)
    await member.getByLabel('Message').fill('The opening post is not held.')
    await member.getByRole('button', { name: 'Post thread' }).click()
    await expect(member).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = member.url().replace(/#.*$/, '')

    const body = `A reply nobody will let through ${Date.now()}`
    await member.goto(`${threadUrl}/reply`)
    await member.getByLabel('Message').fill(body)
    await member.getByRole('button', { name: 'Post reply' }).click()

    await expect(member.getByText(body)).toHaveCount(0)

    await signInAsModerator(mod)

    await mod.goto('/moderation')
    const row = mod.locator('li').filter({ hasText: body })
    await expect(row).toHaveCount(1)
    await expect(row.getByText('Reply', { exact: true })).toBeVisible()

    await row.getByRole('checkbox').check()
    await mod.getByRole('button', { name: 'Reject selected' }).click()

    await expect(mod).toHaveURL(/\/moderation\?did=reject&n=1$/)
    await expect(mod.getByText('Rejected 1 item.')).toBeVisible()

    await expect(mod.locator('li').filter({ hasText: body })).toHaveCount(0)

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

test('the moderator panel says what is waiting and what this moderator may do', async ({
  page,
}) => {
  await signInAsModerator(page)

  await page.goto('/modcp')
  await expect(page.getByRole('heading', { name: 'Moderator control panel' })).toBeVisible()
  for (const name of ['Approval queue', 'Reports', 'My forums', 'Moderator log']) {
    await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible()
  }

  await page.goto('/modcp/forums')
  await expect(page.getByRole('heading', { name: 'My forums' })).toBeVisible()
  const offTopic = page.locator('li').filter({ hasText: 'Off Topic' })
  await expect(offTopic.getByText('Approve content')).toBeVisible()
  await expect(offTopic.getByText('Lock and unlock')).toBeVisible()

  await page.goto('/modcp/ip')
  await expect(page.getByRole('heading', { name: 'Address lookup' })).toBeVisible()
  await page.getByLabel('Member id').fill(String(STAFF.admin.id))
  await page.getByRole('button', { name: 'Look up' }).click()

  await expect(page).toHaveURL(new RegExp(`/modcp/ip\\?user=${STAFF.admin.id}$`))
  await expect(page.getByText(`Accounts sharing a range with`)).toBeVisible()
  await expect(page.getByText('Ranges on record:')).toBeVisible()

  await page.goto('/modcp/ip?user=99999')
  await expect(page.getByText('No such member.')).toBeVisible()

  await page.goto('/modcp/log')
  await expect(page.getByText('Looked up an address').first()).toBeVisible()
})
