import { expect, type Page, test } from '@playwright/test'

import { enterAdminPanel, PASSWORD } from './support/session'

/**
 * The board is reached as `localhost` here and nowhere else in the suite: a
 * passkey is scoped to a domain, and Chrome refuses an IP address as one.
 */
const BOARD = 'http://localhost:3001'

const SETTINGS = '/admin/settings?group=federation'

async function setPasskeys(page: Page, on: boolean): Promise<void> {
  await page.goto(SETTINGS)

  const toggle = page.locator('[name="federation.passkeys_enabled"]')
  if (on) await toggle.check()
  else await toggle.uncheck()

  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText(/Saved|Nothing was different/)).toBeVisible()
}

async function virtualAuthenticator(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('WebAuthn.enable')
  await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

async function signUpOnLocalhost(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now().toString(36)}`

  await page.goto(`${BOARD}/register`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I have read and accept/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(`${BOARD}/`)

  return username
}

test('a member adds a passkey and signs in with it afterwards', async ({ browser }) => {
  test.setTimeout(120_000)

  const admin = await browser.newContext()
  const adminPage = await admin.newPage()

  const member = await browser.newContext()
  const memberPage = await member.newPage()

  try {
    await enterAdminPanel(adminPage)
    await setPasskeys(adminPage, true)

    const username = await signUpOnLocalhost(memberPage, 'passkey')
    await virtualAuthenticator(memberPage)

    await memberPage.goto(`${BOARD}/usercp/security`)
    await expect(memberPage.getByRole('heading', { name: 'Passkeys' })).toBeVisible()
    await expect(memberPage.getByText('You have no passkeys yet.')).toBeVisible()

    await memberPage.getByLabel('What to call it').fill('Work laptop')
    await memberPage.getByRole('button', { name: 'Add a passkey' }).click()

    await expect(memberPage).toHaveURL(/\/usercp\/security\?passkey=added$/)
    await expect(memberPage.getByText('Work laptop')).toBeVisible()

    await member.clearCookies()

    await memberPage.goto(`${BOARD}/login`)
    await memberPage.getByRole('button', { name: 'Sign in with a passkey' }).click()

    await expect(memberPage).toHaveURL(`${BOARD}/`)
    await expect(memberPage.getByRole('button', { name: 'Your account' })).toContainText(username)

    await memberPage.goto(`${BOARD}/usercp/security`)
    await expect(memberPage.getByText('Work laptop')).toBeVisible()
    await expect(memberPage.getByText(/last used/)).toBeVisible()

    await memberPage.getByRole('button', { name: 'Remove' }).click()
    await expect(memberPage).toHaveURL(/\/usercp\/security\?passkey=removed$/)
    await expect(memberPage.getByText('You have no passkeys yet.')).toBeVisible()

    await member.clearCookies()
    await memberPage.goto(`${BOARD}/login`)
    await memberPage.getByLabel('Username or email').fill(username)
    await memberPage.getByLabel('Password').fill(PASSWORD)
    await memberPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(memberPage).toHaveURL(`${BOARD}/`)
    await expect(memberPage.getByRole('button', { name: 'Your account' })).toContainText(username)
  } finally {
    await member.close()
    await setPasskeys(adminPage, false)
    await admin.close()
  }
})

test('the passkey button is not offered while the board has them switched off', async ({
  page,
}) => {
  await page.goto(`${BOARD}/login`)
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toHaveCount(0)
})
