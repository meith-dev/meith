import { expect, test, type Page } from '@playwright/test'

import { enterAdminPanel, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const SETTINGS = '/admin/settings?group=federation'

const CLIENT_ID = 'e2e-client-id'

function field(page: Page, key: string) {
  return page.locator(`[name="federation.${key}"]`)
}

async function saveFederationSettings(page: Page, fill: () => Promise<void>): Promise<void> {
  await page.goto(SETTINGS)
  await fill()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText(/Saved|Nothing was different/)).toBeVisible()
}

async function turnGithubOn(page: Page): Promise<void> {
  await saveFederationSettings(page, async () => {
    await field(page, 'github_enabled').check()
    await field(page, 'github_client_id').fill(CLIENT_ID)
    await field(page, 'github_client_secret').fill('e2e-client-secret')
  })
}

async function turnGithubOff(page: Page): Promise<void> {
  await saveFederationSettings(page, async () => {
    await field(page, 'github_enabled').uncheck()
    await field(page, 'github_client_id').fill('')
    await field(page, 'github_client_secret__clear').check()
  })
}

test('a provider is off until an operator turns it on, and gone again after', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)

  await enterAdminPanel(page)

  try {
    await turnGithubOn(page)

    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()

    await page.goto('/register')
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  } finally {
    await turnGithubOff(page)
  }

  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
  await page.goto('/register')
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
})

test('credentials without the switch offer nothing', async ({ page }) => {
  await enterAdminPanel(page)

  try {
    await saveFederationSettings(page, async () => {
      await field(page, 'github_client_id').fill(CLIENT_ID)
      await field(page, 'github_client_secret').fill('e2e-client-secret')
    })

    await page.goto('/login')
    await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
  } finally {
    await page.goto(SETTINGS)
    await turnGithubOff(page)
  }
})

test('pressing the button sends the member to the provider with a state to check', async ({
  page,
  baseURL,
}) => {
  await enterAdminPanel(page)

  // Ask the route while the provider is off, so that whatever it caches about
  // the settings is a "no" — then turn the provider on and press the button.
  // A route handler reading a settings snapshot cached a minute ago answers
  // that the provider is switched off, on a page that has just drawn its
  // button.
  await page.request.post('/auth/sso/github', {
    form: {},
    headers: { origin: baseURL ?? '' },
  })

  await turnGithubOn(page)

  await page.route('https://github.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>The provider</h1></body></html>',
    }),
  )

  try {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Continue with GitHub' }).click()

    await expect(page).toHaveURL(/^https:\/\/github\.com\/login\/oauth\/authorize\?/, {
      timeout: 15_000,
    })

    const sent = new URL(page.url())
    expect(sent.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(sent.searchParams.get('state')).toBeTruthy()
    expect(sent.searchParams.get('redirect_uri')).toContain('/auth/sso/github/callback')

    await page.unroute('https://github.com/**')

    await page.goto('/auth/sso/github/callback?code=made-up&state=not-the-one-we-issued')
    await expect(page).toHaveURL(/\/login\?sso=expired$/)
    await expect(page.getByText(/had expired by the time it came back/)).toBeVisible()
  } finally {
    await page.unroute('https://github.com/**')
    await turnGithubOff(page)
  }
})

test('a member manages their own linked sign-ins', async ({ browser }) => {
  const admin = await browser.newContext()
  const adminPage = await admin.newPage()

  const member = await browser.newContext()
  const memberPage = await member.newPage()

  try {
    await enterAdminPanel(adminPage)
    await turnGithubOn(adminPage)

    await signUp(memberPage, 'sso')
    await memberPage.goto('/usercp/security')

    await expect(memberPage.getByRole('heading', { name: 'Linked sign-ins' })).toBeVisible()
    await expect(memberPage.getByText('Nothing is linked to your account yet.')).toBeVisible()
    await expect(memberPage.getByRole('button', { name: 'Link GitHub' })).toBeVisible()

    await turnGithubOff(adminPage)

    await memberPage.goto('/usercp/security')
    await expect(memberPage.getByRole('button', { name: 'Link GitHub' })).toHaveCount(0)
  } finally {
    await member.close()
    await admin.close()
  }
})
