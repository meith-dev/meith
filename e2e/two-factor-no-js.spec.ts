import { expect, type Page, test } from '@playwright/test'

import { stepAt, totpCode } from '@meith/accounts'

import { PASSWORD, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

/** The key the setup screen prints, read back off the page. */
async function enrol(page: Page): Promise<string> {
  await page.goto('/usercp/security')
  await page.getByRole('button', { name: 'Set up an authenticator app' }).click()

  await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible()

  const secret = (await page.locator('code').first().innerText()).trim()
  expect(secret).toMatch(/^[A-Z2-7]+$/)

  await page.getByLabel('Code from your app').fill(await code(secret))
  await page.getByRole('button', { name: 'Turn on' }).click()

  await expect(
    page.getByRole('heading', { name: 'Your account now asks for a code' }),
  ).toBeVisible()

  return secret
}

/**
 * A code the board has not seen. Enrolment spends the step it confirmed with,
 * and a sign-in moments later falls in the same thirty seconds — so signing in
 * asks for the next step, which the board accepts inside its skew window and
 * which its replay check has no record of.
 */
async function code(secret: string, offset = 0): Promise<string> {
  return totpCode(secret, stepAt(new Date()) + offset)
}

async function recoveryCodes(page: Page): Promise<readonly string[]> {
  const items = await page.locator('li').allInnerTexts()
  return items.filter((text) => /^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){4}-[A-Z2-7]$/.test(text.trim()))
}

test('a member turns on a code, and is asked for it next time they sign in', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'totp')
    const secret = await enrol(page)

    await context.clearCookies()

    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page).toHaveURL(/\/login\/verify$/)
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible()

    await page.getByLabel(/Code from your authenticator app/).fill('000000')
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page.getByText(/not right/)).toBeVisible()

    await page.getByLabel(/Code from your authenticator app/).fill(await code(secret, 1))
    await page.getByRole('button', { name: 'Finish signing in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('the password alone gets nowhere, and the half-step can be abandoned', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'halfway')
    await enrol(page)
    await context.clearCookies()

    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/login\/verify$/)

    await page.goto('/usercp')
    await expect(page).toHaveURL(/\/login\?next=/)

    await page.goto('/login/verify')
    await page.getByRole('button', { name: /Cancel and sign in as somebody else/ }).click()

    await expect(page).toHaveURL('/login')
    await page.goto('/login/verify')
    await expect(page).toHaveURL('/login')
  } finally {
    await context.close()
  }
})

test('a recovery code signs a member in once and is then spent', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'recovery')
    await enrol(page)

    const codes = await recoveryCodes(page)
    expect(codes).toHaveLength(10)

    const spent = codes[0]!
    await context.clearCookies()

    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await page.getByLabel(/Code from your authenticator app/).fill(spent)
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/usercp/security')
    await expect(page.getByText(/You have 9 recovery codes left/)).toBeVisible()

    await context.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await page.getByLabel(/Code from your authenticator app/).fill(spent)
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page.getByText(/not right/)).toBeVisible()
  } finally {
    await context.close()
  }
})

test('turning it off asks for the password, and puts the account back', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'offagain')
    await enrol(page)

    await page.goto('/usercp/security')
    await page.getByLabel('Your password').last().fill('not-my-password')
    await page.getByRole('button', { name: 'Turn off two-factor authentication' }).click()
    await expect(page.getByText(/not your current password/)).toBeVisible()

    await page.getByLabel('Your password').last().fill(PASSWORD)
    await page.getByRole('button', { name: 'Turn off two-factor authentication' }).click()

    await expect(page.getByText(/Two-factor authentication is off/)).toBeVisible()

    await context.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page).toHaveURL('/')
  } finally {
    await context.close()
  }
})

test('a member sees where they are signed in and can sign one out', async ({ browser }) => {
  const first = await browser.newContext()
  const firstPage = await first.newPage()

  const second = await browser.newContext()
  const secondPage = await second.newPage()

  try {
    const member = await signUp(firstPage, 'sessions')

    await secondPage.goto('/login')
    await secondPage.getByLabel('Username or email').fill(member)
    await secondPage.getByLabel('Password').fill(PASSWORD)
    await secondPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(secondPage).toHaveURL('/')

    await firstPage.goto('/usercp/security')
    await expect(firstPage.getByRole('heading', { name: 'Where you are signed in' })).toBeVisible()
    await expect(firstPage.getByText('— this device')).toBeVisible()

    await firstPage.getByRole('button', { name: 'Sign out', exact: true }).first().click()
    await expect(firstPage.getByText('That session has been signed out.')).toBeVisible()

    await secondPage.goto('/usercp')
    await expect(secondPage).toHaveURL(/\/login\?next=/)

    await firstPage.goto('/usercp/security')
    await expect(firstPage.getByRole('heading', { name: 'Where you are signed in' })).toBeVisible()
  } finally {
    await second.close()
    await first.close()
  }
})

test('the security log records what happened to the account', async ({ page }) => {
  await signUp(page, 'activity')

  await page.goto('/usercp/security')
  await expect(page.getByRole('heading', { name: 'Recent security activity' })).toBeVisible()
  await expect(page.getByText('Signed in').first()).toBeVisible()

  await enrol(page)

  await page.goto('/usercp/security')
  await expect(page.getByText('Two-factor authentication turned on')).toBeVisible()
})
