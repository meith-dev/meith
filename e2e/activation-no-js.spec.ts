import { expect, type Page, test } from '@playwright/test'

import { STAFF_PASSWORD } from './support/config'
import { enterAdminPanel, PASSWORD } from './support/session'

test.use({ javaScriptEnabled: false })

type Method = 'none' | 'email'

async function setActivation(admin: Page, method: Method): Promise<void> {
  await admin.goto('/admin/settings?group=registration')
  await admin.locator('select[name="registration.method"]').selectOption(method)
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.locator('select[name="registration.method"]')).toHaveValue(method)
}

async function register(page: Page, username: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('a board that asks for the address to be proven will not let the account in', async ({
  browser,
}) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()

  const visitorContext = await browser.newContext({ javaScriptEnabled: false })
  const visitor = await visitorContext.newPage()

  try {
    await enterAdminPanel(admin)
    await setActivation(admin, 'email')

    const username = `e2e_confirm_${Date.now().toString(36)}`
    const email = `${username}@example.test`
    await register(visitor, username)

    await expect(visitor).toHaveURL(`/verify/resend?email=${encodeURIComponent(email)}&sent=1`)
    await expect(visitor.getByRole('heading', { name: 'Confirm your account' })).toBeVisible()
    await expect(visitor.getByText(email)).toBeVisible()
    await expect(visitor.getByText(/until then you will not be able to sign in/)).toBeVisible()

    await visitor.goto('/login')
    await visitor.getByLabel('Username or email').fill(username)
    await visitor.getByLabel('Password').fill(PASSWORD)
    await visitor.getByRole('button', { name: 'Sign in' }).click()
    await expect(visitor).not.toHaveURL('/')
    await expect(visitor.getByRole('link', { name: 'Profile' })).toHaveCount(0)

    await visitor.goto('/verify/resend')
    await visitor.getByLabel('Email').fill('nobody-at-all@example.test')
    await visitor.getByRole('button', { name: 'Send another link' }).click()
    const notice = await visitor.locator('main').innerText()

    await visitor.goto('/verify/resend')
    await visitor.getByLabel('Email').fill(email)
    await visitor.getByRole('button', { name: 'Send another link' }).click()
    expect(
      await visitor.locator('main').innerText(),
      'an address nobody has and a real one must read identically',
    ).toBe(notice)

    await visitor.goto('/verify?token=not-a-real-token')
    await expect(visitor).toHaveURL('/login?verify=failed')
    await expect(
      visitor.getByText('That confirmation link is no longer valid. Ask for a new one below.'),
    ).toBeVisible()
    await visitor.getByRole('link', { name: 'Need a new confirmation link?' }).click()
    await expect(visitor).toHaveURL('/verify/resend')

    await visitor.goto('/verify')
    await expect(visitor).toHaveURL('/login?verify=failed')
  } finally {
    await setActivation(admin, 'none')
    await staff.close()
  }

  const username = `e2e_after_${Date.now().toString(36)}`
  await register(visitor, username)
  await expect(visitor).toHaveURL(/\/login\?registered=1$/)
  await visitorContext.close()

  const staffCheck = await browser.newContext({ javaScriptEnabled: false })
  const page = await staffCheck.newPage()
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('admin')
  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await staffCheck.close()
})
