import { expect, test, type Page } from '@playwright/test'

import { samplePng } from './support/png'
import { signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

async function sendMessage(from: Page, to: string, subject: string): Promise<string> {
  await from.goto('/messages/compose')
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

    await reader.getByLabel(`Select “${kept}”`).check()
    await reader.getByRole('button', { name: 'Mark read' }).click()
    await expect(reader.getByRole('link', { name: kept })).toBeVisible()

    await reader.getByLabel(`Select “${kept}”`).check()
    await reader.getByRole('button', { name: 'Mark unread' }).click()

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

    await reader.getByLabel(`Select “${binned}”`).check()
    await reader.getByRole('button', { name: 'Move to trash' }).click()
    await reader.goto('/messages?folder=trash')
    await reader.getByRole('button', { name: 'Empty trash' }).click()
    await expect(reader.getByRole('link', { name: binned })).toHaveCount(0)

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

    const reason = mod.getByRole('combobox', { name: 'Reason' })
    const spamming = reason.locator('option', { hasText: 'Spamming' })
    await reason.selectOption((await spamming.getAttribute('value')) ?? '')
    await mod.getByLabel('What this is for').fill('Issued, and about to be taken back.')
    await mod.getByRole('button', { name: 'Issue warning' }).click()

    await expect(mod.getByText('Warning issued.')).toBeVisible()
    await expect(mod.getByText(/^2 points\./)).toBeVisible()

    const record = mod.locator('li').filter({ hasText: 'Issued, and about to be taken back.' })
    await record.getByPlaceholder('Why it is being withdrawn').fill('Wrong member.')
    await record.getByRole('button', { name: 'Revoke' }).click()

    const revoked = mod.locator('li').filter({ hasText: 'Issued, and about to be taken back.' })
    await expect(revoked).toContainText('Revoked by')
    await expect(revoked).toContainText('Wrong member.')
    await expect(revoked.getByRole('button', { name: 'Revoke' })).toHaveCount(0)

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

    await expect(rater.getByRole('listitem').filter({ hasText: comment })).toHaveCount(0)
    await expect(rater.getByText('+1 (1 positive)')).toHaveCount(0)

    await subject.goto(`/member/by-name/${rated}`)
    await expect(subject.getByText(comment)).toHaveCount(0)
    await expect(subject.getByText('+1 (1 positive)')).toHaveCount(0)
  } finally {
    await raterContext.close()
    await subjectContext.close()
  }
})
