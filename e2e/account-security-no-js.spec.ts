import { type Browser, expect, test } from '@playwright/test'

import { E2E_BASE_URL } from './support/config'
import { inbox, linkIn, waitForMail } from './support/mailbox'
import { enterAdminPanel, PASSWORD, signIn, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const NEW_PASSWORD = 'a-second-long-enough-password'

test('a member changes their password and signs in with the new one', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'newpw')

    await page.goto('/usercp/security')
    await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible()

    await page.getByLabel('Current password').first().fill('not-my-password')
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('New password again').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('That is not your current password.')).toBeVisible()

    await context.clearCookies()
    await signIn(page, member, PASSWORD)

    await page.goto('/usercp/security')
    await page.getByLabel('Current password').first().fill(PASSWORD)
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('New password again').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()

    await context.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL('/')

    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('an e-mail change needs the password, and nothing moves until it is confirmed', async ({
  page,
}) => {
  const member = await signUp(page, 'newmail')
  const current = `${member}@example.test`

  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()

  await page.getByLabel('Current password').last().fill('not-my-password')
  await page.getByLabel('New e-mail address').fill(`${member}-moved@example.test`)
  await page.getByRole('button', { name: 'Send confirmation' }).click()
  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()

  await page.getByLabel('Current password').last().fill(PASSWORD)
  await page.getByLabel('New e-mail address').fill(`${member}-moved@example.test`)
  await page.getByRole('button', { name: 'Send confirmation' }).click()

  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()
})

test('a spent e-mail confirmation link says so on the screen that can retry it', async ({
  page,
}) => {
  await signUp(page, 'stalelink')

  await page.goto('/usercp/email/confirm?token=not-a-real-token')
  await expect(page).toHaveURL(/\/usercp\/security\?failed=1$/)
  await expect(page.getByText(/no longer valid/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send confirmation' })).toBeVisible()
})

async function setBoardAddress(browser: Browser, address: string): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  try {
    await enterAdminPanel(page)
    await page.goto('/admin/settings?group=board')
    await page.getByLabel('Board address').fill(address)
    await page.getByRole('button', { name: 'Save settings' }).click()
  } finally {
    await context.close()
  }
}

test('a member resets a forgotten password and signs in with the new one', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await setBoardAddress(browser, E2E_BASE_URL)

  try {
    const member = await signUp(page, 'forgot')
    await context.clearCookies()

    await page.goto('/reset')
    await page.getByLabel('Email').fill('nobody-at-all@example.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const notice = 'If an account exists for that email, a password reset link has been sent.'
    await expect(page.getByText(notice)).toBeVisible()
    expect(await inbox('nobody-at-all@example.test')).toHaveLength(0)

    await page.goto('/reset')
    await page.getByLabel('Email').fill(`${member}@example.test`)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText(notice)).toBeVisible()

    const mail = await waitForMail(`${member}@example.test`, /password/i)
    const href = linkIn(mail, '/reset/confirm')
    expect(href).toMatch(/\/reset\/confirm\?token=.+/)

    await page.goto(href)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel(/again|Confirm/i).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: /Set|Change|Save|Reset/ }).click()

    await context.clearCookies()
    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()

    await context.clearCookies()
    await page.goto(href)
    await page.getByLabel('New password', { exact: true }).fill('a-third-long-enough-password')
    await page.getByLabel(/again|Confirm/i).fill('a-third-long-enough-password')
    await page.getByRole('button', { name: /Set|Change|Save|Reset/ }).click()
    await expect(page.getByText(/invalid|expired|no longer/i).first()).toBeVisible()

    await context.clearCookies()
    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await context.close()
    await setBoardAddress(browser, '')
  }
})

test('a reset link with no token offers a new one', async ({ page }) => {
  await page.goto('/reset/confirm')
  await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible()
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page).toHaveURL('/reset')
})

test('a member’s timezone is saved and used to render times', async ({ page }) => {
  await signUp(page, 'clock')

  await page.goto('/usercp/options')
  await page.getByLabel('Timezone').selectOption('Pacific/Kiritimati')
  await page.getByRole('button', { name: /Save/ }).click()

  await page.goto('/usercp/options')
  await expect(page.getByLabel('Timezone')).toHaveValue('Pacific/Kiritimati')

  await page.goto('/')
  await expect(page.getByText(/Times are shown in Pacific\/Kiritimati/)).toBeVisible()
})
