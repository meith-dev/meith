import { expect, type Page, test } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

function matrixSection(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) })
}

async function setMatrixCell(
  page: Page,
  heading: string,
  rowText: string,
  groupTitle: string,
  option: 'Inherit' | 'Grant' | 'Deny',
): Promise<void> {
  const table = matrixSection(page, heading).locator('table')
  const headers = await table.locator('thead th').allInnerTexts()
  const columnIndex = headers.indexOf(groupTitle)
  expect(columnIndex, `no "${groupTitle}" column under "${heading}"`).toBeGreaterThan(0)

  const row = table.locator('tbody tr').filter({ hasText: rowText })
  const cell = row.locator('td').nth(columnIndex - 1)
  await cell.getByText(option, { exact: true }).click()
}

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
    await adminPage.getByRole('button', { name: 'Save permissions' }).click()
    await expect(adminPage.getByText('Saved.')).toBeVisible()

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
