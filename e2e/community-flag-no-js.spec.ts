import { expect, type Page, test } from '@playwright/test'

import { enterAdminPanel, signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const GENERAL = '/200-general'

async function setFlagThreshold(admin: Page, value: string): Promise<void> {
  await admin.goto('/admin/settings?group=antispam')
  await admin.getByLabel('Community flag threshold').fill(value)
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.getByText('Saved,', { exact: false })).toBeVisible()
}

async function flag(page: Page, threadUrl: string): Promise<void> {
  await page.goto(threadUrl)
  await page.getByRole('link', { name: 'Report', exact: true }).first().click()
  await expect(page).toHaveURL(/\/report\?kind=post&id=\d+$/)
  await page.getByRole('radio', { name: 'Spam' }).check()
  await page.getByRole('button', { name: 'Send report' }).click()
  await page.waitForLoadState('load')
}

test('the community flag threshold holds a post once enough members report it', async ({
  browser,
}) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()
  const authorContext = await browser.newContext({ javaScriptEnabled: false })
  const author = await authorContext.newPage()
  const oneContext = await browser.newContext({ javaScriptEnabled: false })
  const one = await oneContext.newPage()
  const twoContext = await browser.newContext({ javaScriptEnabled: false })
  const two = await twoContext.newPage()
  const guestContext = await browser.newContext({ javaScriptEnabled: false })
  const guest = await guestContext.newPage()
  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()

  try {
    await enterAdminPanel(admin)
    await setFlagThreshold(admin, '2')

    await signUp(author, 'flagauthor')
    const title = `Community flag ${Date.now()}`
    await author.goto(GENERAL)
    await author.getByRole('link', { name: 'New thread' }).click()
    await author.getByLabel('Subject').fill(title)
    await author
      .getByLabel('Message')
      .fill('Buy cheap things at spam-dot-example, first come first served.')
    await author.getByRole('button', { name: 'Post thread' }).click()
    await expect(author).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = author.url().replace(/#.*$/, '')

    await guest.goto(GENERAL)
    await expect(guest.getByRole('link', { name: title })).toBeVisible()

    await signUp(one, 'flagone')
    await flag(one, threadUrl)

    await guest.goto(GENERAL)
    await expect(guest.getByRole('link', { name: title })).toBeVisible()

    await signUp(two, 'flagtwo')
    await flag(two, threadUrl)

    await guest.goto(GENERAL)
    await expect(guest.getByRole('link', { name: title })).toHaveCount(0)

    await signInAsModerator(mod)

    await mod.goto('/moderation')
    const row = mod.locator('li').filter({ has: mod.getByRole('link', { name: title }) })
    await expect(row).toHaveCount(1)

    await mod.goto('/modcp/log')
    await expect(mod.getByText('Held content after community reports').first()).toBeVisible()

    await mod.goto('/moderation')
    const held = mod.locator('li').filter({ has: mod.getByRole('link', { name: title }) })
    await held.getByRole('checkbox').check()
    await mod.getByRole('button', { name: 'Approve selected' }).click()
    await expect(mod).toHaveURL(/\/moderation\?did=approve&n=1$/)

    await guest.goto(GENERAL)
    await expect(guest.getByRole('link', { name: title })).toBeVisible()
  } finally {
    await setFlagThreshold(admin, '0')
    await staff.close()
    await authorContext.close()
    await oneContext.close()
    await twoContext.close()
    await guestContext.close()
    await modContext.close()
  }
})
