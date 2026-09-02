import { expect, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a member without the attach-files permission is not shown the add-file field on edit', async ({
  browser,
}) => {
  test.setTimeout(60_000)

  const adminContext = await browser.newContext({ javaScriptEnabled: false })
  const admin = await adminContext.newPage()
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()

  async function setAttachPermission(value: 'Deny' | 'Inherit'): Promise<void> {
    await admin.goto('/admin/forums/200/permissions')
    const details = admin.locator('details', {
      has: admin.locator('summary', { hasText: 'Registered' }),
    })
    const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open)
    if (!isOpen) await details.locator('summary').click()

    const cell = details.locator('fieldset', {
      has: admin.locator('legend', { hasText: 'Attach files to a post.' }),
    })
    await cell.getByText(value, { exact: true }).click()
    await admin.getByRole('button', { name: 'Save Registered' }).click()
  }

  try {
    await enterAdminPanel(admin)
    await setAttachPermission('Deny')

    await signUp(member, 'noattach')
    await member.goto('/200-general/new')

    await expect(member.locator('label[for="attachments"]')).toHaveCount(0)

    const title = `No attachments allowed ${Date.now()}`
    await member.getByLabel('Subject').fill(title)
    await member.getByLabel('Message').fill('Just text, nothing attached.')
    await member.getByRole('button', { name: 'Post thread' }).click()
    await expect(member).toHaveURL(/\/thread\/\d+-/)

    const edit = await member.locator('a[href*="/edit?post="]').first().getAttribute('href')
    expect(edit).toMatch(/\/edit\?post=\d+$/)

    await member.goto(edit!)
    await expect(member.getByLabel('Message')).toBeVisible()
    await expect(member.locator('label[for="attachments"]')).toHaveCount(0)
  } finally {
    await setAttachPermission('Inherit')
    await adminContext.close()
    await memberContext.close()
  }
})
