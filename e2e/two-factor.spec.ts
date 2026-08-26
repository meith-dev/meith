import { expect, type Page, test } from '@playwright/test'

import { stepAt, totpCode } from '@meith/accounts'

import { enterAdminPanel, PASSWORD, signUp } from './support/session'

async function code(secret: string, offset = 0): Promise<string> {
  return totpCode(secret, stepAt(new Date()) + offset)
}

async function enrol(page: Page): Promise<string> {
  await page.goto('/usercp/security')
  await page.getByRole('button', { name: 'Set up an authenticator app' }).click()

  await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible()

  const secret = (await page.locator('code').first().innerText()).trim()

  await page.getByLabel('Code from your app').fill(await code(secret))
  await page.getByRole('button', { name: 'Turn on' }).click()

  await expect(
    page.getByRole('heading', { name: 'Your account now asks for a code' }),
  ).toBeVisible()

  return secret
}

function watchForErrors(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 500) {
      problems.push(`${response.status()} from ${new URL(response.url()).pathname}`)
    }
  })
  return problems
}

test('the whole second-factor lifecycle survives being hydrated', async ({ page }) => {
  const problems = watchForErrors(page)

  const member = await signUp(page, 'hydrated')
  const secret = await enrol(page)

  await page.goto('/usercp/security')
  await expect(page.getByRole('heading', { name: 'Where you are signed in' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent security activity' })).toBeVisible()

  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(member)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page).toHaveURL(/\/login\/verify$/)
  await page.getByLabel(/Code from your authenticator app/).fill(await code(secret, 1))
  await page.getByRole('button', { name: 'Finish signing in' }).click()

  await expect(page).toHaveURL('/')
  expect(problems).toEqual([])
})

test('a refused set-up says so on the page instead of failing the request', async ({ browser }) => {
  const staff = await browser.newContext()
  const staffPage = await staff.newPage()

  const context = await browser.newContext()
  const page = await context.newPage()
  const problems = watchForErrors(page)

  try {
    await signUp(page, 'refused')

    await enterAdminPanel(staffPage)
    await staffPage.goto('/admin/settings?group=security')
    const toggle = staffPage.getByLabel(/Offer two-factor authentication/i)
    await toggle.uncheck()
    await staffPage.getByRole('button', { name: /Save/i }).first().click()
    await expect(staffPage.getByText(/Saved|saved/).first()).toBeVisible()

    await page.goto('/usercp/security')
    await expect(page.getByRole('button', { name: 'Set up an authenticator app' })).toHaveCount(0)

    expect(problems).toEqual([])
  } finally {
    await staffPage.goto('/admin/settings?group=security').catch(() => undefined)
    await staff.close()
    await context.close()
  }
})

test('the sessions list marks this device and refuses to sign it out', async ({ page }) => {
  const problems = watchForErrors(page)

  await signUp(page, 'thisdevice')
  await page.goto('/usercp/security')

  await expect(page.getByText('— this device')).toBeVisible()

  const rows = page.locator('li', { hasText: '— this device' })
  await expect(rows.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)

  expect(problems).toEqual([])
})
