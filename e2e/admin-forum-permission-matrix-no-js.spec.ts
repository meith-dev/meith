import { expect, test } from '@playwright/test'

import { saveMatrix, setMatrixCell } from './support/permission-matrix'
import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('one save changes two cells across two groups, and the board reflects both', async ({
  browser,
}) => {
  const adminContext = await browser.newContext({ javaScriptEnabled: false })
  const guestContext = await browser.newContext({ javaScriptEnabled: false })
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const adminPage = await adminContext.newPage()
  const guestPage = await guestContext.newPage()
  const memberPage = await memberContext.newPage()

  try {
    await enterAdminPanel(adminPage)

    const title = `Matrix Test ${Date.now().toString(36)}`
    const slug = `e2e-matrix-${Date.now().toString(36)}`

    await adminPage.goto('/admin/forums')
    await adminPage.getByLabel('Kind').selectOption('forum')
    const inside = adminPage.getByLabel('Inside')
    await inside.selectOption(
      (await inside.locator('option', { hasText: 'Main' }).first().getAttribute('value')) ?? '',
    )
    await adminPage.getByLabel('Title').fill(title)
    await adminPage.getByLabel('Slug').fill(slug)
    await adminPage.getByRole('button', { name: 'Create' }).click()
    await expect(adminPage.getByText(`forum · /${slug}`)).toBeVisible()

    await adminPage.getByRole('link', { name: `Permissions for ${title}` }).click()
    await expect(adminPage.getByRole('heading', { name: `Permissions: ${title}` })).toBeVisible()

    await setMatrixCell(adminPage, 'Viewing', 'See the forum exists.', 'Guests', 'Deny')
    await setMatrixCell(adminPage, 'Posting', 'Start new threads.', 'Registered', 'Deny')
    await saveMatrix(adminPage)

    await signUp(memberPage, 'matrix')
    await memberPage.goto('/')
    await expect(memberPage.getByRole('link', { name: title })).toBeVisible()

    await guestPage.goto('/')
    await expect(guestPage.getByRole('link', { name: title })).toHaveCount(0)

    await memberPage.getByRole('link', { name: title }).click()
    await expect(memberPage.getByRole('heading', { name: title })).toBeVisible()
    await expect(memberPage.getByRole('link', { name: 'New thread' })).toHaveCount(0)
  } finally {
    await adminContext.close()
    await guestContext.close()
    await memberContext.close()
  }
})
