import { expect, test } from '@playwright/test'

import { saveMatrix, setMatrixCell } from './support/permission-matrix'
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
    await setMatrixCell(admin, 'Attachments', 'Attach files to a post.', 'Registered', value)
    await saveMatrix(admin)
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
