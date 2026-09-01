import { type BrowserContext, expect, type Page, test } from '@playwright/test'

import { EN_CATALOG } from '@meith/i18n'

import { enterAdminPanel, PASSWORD, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const REFUSAL = EN_CATALOG['error.accounts.account-used-board-contact-administrator'] ?? ''

function unique(label: string): string {
  return `${label}_${Date.now().toString(36)}`
}

async function addFilter(
  page: Page,
  filter: { type: string; pattern: string; note: string },
): Promise<void> {
  await page.goto('/admin/users/ban-filters')
  await page.getByRole('combobox', { name: /^Matches on/ }).selectOption(filter.type)
  await page.getByRole('textbox', { name: /^Pattern/ }).fill(filter.pattern)
  await page.getByRole('textbox', { name: /^Note/ }).fill(filter.note)
  await page.getByRole('button', { name: 'Add filter' }).click()

  await expect(page.getByRole('button', { name: `Remove ${filter.pattern}` })).toBeVisible()
}

async function removeFilter(page: Page, pattern: string): Promise<void> {
  await page.goto('/admin/users/ban-filters')
  await page.getByRole('button', { name: `Remove ${pattern}` }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()

  await expect(page.getByRole('button', { name: `Remove ${pattern}` })).toHaveCount(0)
}

async function attemptRegistration(
  context: BrowserContext,
  page: Page,
  account: { username: string; email: string },
): Promise<void> {
  await context.clearCookies()
  await page.goto('/register')
  await page.getByLabel('Username').fill(account.username)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('an e-mail filter turns away the addresses it names, and only those', async ({ browser }) => {
  const staff = await browser.newContext()
  const admin = await staff.newPage()
  const outside = await browser.newContext()
  const visitor = await outside.newPage()

  try {
    await enterAdminPanel(admin)
    await addFilter(admin, {
      type: 'email',
      pattern: '*@blocked.example',
      note: 'added by the browser suite',
    })

    const turnedAway = unique('e2e_blocked')
    await attemptRegistration(outside, visitor, {
      username: turnedAway,
      email: `${turnedAway}@blocked.example`,
    })

    await expect(visitor.getByText(REFUSAL)).toBeVisible()
    await expect(visitor).toHaveURL(/\/register$/)

    await outside.clearCookies()
    await signUp(visitor, 'unfiltered')

    await removeFilter(admin, '*@blocked.example')

    await attemptRegistration(outside, visitor, {
      username: turnedAway,
      email: `${turnedAway}@blocked.example`,
    })

    await expect(visitor).toHaveURL(/\/login\?registered=1$/)
  } finally {
    await staff.close()
    await outside.close()
  }
})

test('a username filter turns away the names it matches, and only those', async ({ browser }) => {
  const staff = await browser.newContext()
  const admin = await staff.newPage()
  const outside = await browser.newContext()
  const visitor = await outside.newPage()

  try {
    await enterAdminPanel(admin)
    await addFilter(admin, {
      type: 'username',
      pattern: 'e2e_turnedaway*',
      note: 'added by the browser suite',
    })

    const turnedAway = unique('e2e_turnedaway')
    await attemptRegistration(outside, visitor, {
      username: turnedAway,
      email: `${turnedAway}@example.test`,
    })

    await expect(visitor.getByText(REFUSAL)).toBeVisible()
    await expect(visitor).toHaveURL(/\/register$/)

    await outside.clearCookies()
    await signUp(visitor, 'allowedname')

    await removeFilter(admin, 'e2e_turnedaway*')

    await attemptRegistration(outside, visitor, {
      username: turnedAway,
      email: `${turnedAway}@example.test`,
    })

    await expect(visitor).toHaveURL(/\/login\?registered=1$/)
  } finally {
    await staff.close()
    await outside.close()
  }
})

test('a filter matching the administrator adding it is refused', async ({ page }) => {
  await enterAdminPanel(page)

  await page.goto('/admin/users/ban-filters')
  await page.getByRole('combobox', { name: /^Matches on/ }).selectOption('username')
  await page.getByRole('textbox', { name: /^Pattern/ }).fill('adm*')
  await page.getByRole('button', { name: 'Add filter' }).click()

  await expect(page.getByText(/lock you out/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove adm*' })).toHaveCount(0)
})
