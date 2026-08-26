import { expect, test } from '@playwright/test'

import { PASSWORD, signedHeaders, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('logging out is a POST, and the session is gone afterwards', async ({ page }) => {
  await signUp(page, 'bye')
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()

  const logout = page.getByRole('button', { name: 'Log out' })
  await expect(logout).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log out' })).toHaveCount(0)

  await logout.click()
  await expect(page).toHaveURL('/login')

  await page.goto('/usercp')
  await expect(page).toHaveURL('/login?next=%2Fusercp')
})

test('the member control panel lists the screens it is the index of', async ({ page }) => {
  await signUp(page, 'panel')

  await page.goto('/usercp')
  await expect(page.getByRole('heading', { name: /control panel/i })).toBeVisible()

  for (const section of ['Profile', 'Avatar', 'Signature', 'Options']) {
    await expect(page.getByRole('link', { name: section, exact: true }).first()).toBeVisible()
  }

  await page.getByRole('link', { name: 'Signature', exact: true }).first().click()
  await expect(page).toHaveURL('/usercp/signature')
})

test('the redirect interstitial forwards without scripting, and only within the board', async ({
  page,
}) => {
  await page.goto('/redirect?to=/stats&message=Off+you+go')

  await expect(page.getByText('Off you go')).toBeVisible()
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute(
    'content',
    '2;url=/stats',
  )
  await expect(page.getByRole('link', { name: 'Continue now' })).toHaveAttribute('href', '/stats')

  await page.getByRole('link', { name: 'Continue now' }).click()
  await expect(page).toHaveURL('/stats')

  await page.goto('/redirect?to=https://evil.example/&message=nope')
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '2;url=/')
  await expect(page.getByRole('link', { name: 'Continue now' })).toHaveAttribute('href', '/')

  await page.goto('/redirect?to=//evil.example/')
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', '2;url=/')
})

test('the remember-me exchange sends a visitor on, and never off the board', async ({ page }) => {
  await page.goto('/auth/resume?next=/stats')
  await expect(page).toHaveURL('/stats')

  await page.goto('/auth/resume?next=https://evil.example/')
  await expect(page).toHaveURL('/')

  await page.goto('/auth/resume?next=//evil.example/')
  await expect(page).toHaveURL('/')

  await page.goto('/auth/resume')
  await expect(page).toHaveURL('/')
})

test('a remembered visitor is resumed by opening the board, and never by a subresource', async ({
  page,
}) => {
  const username = await signUp(page, 'remembered')

  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel('Keep me signed in').check()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  const context = page.context()
  await context.clearCookies({ name: /session/ })

  const forged = await page.request.get('/auth/resume?next=/usercp', {
    headers: await signedHeaders(page, {
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-dest': 'image',
    }),
    maxRedirects: 0,
  })
  expect(forged.status()).toBe(403)

  await page.goto('/usercp')
  await expect(page).toHaveURL('/usercp')
  await expect(page.getByRole('heading', { name: 'Your control panel' })).toBeVisible()
})

test('tabs restoring together all resume, and none of them signs the member out', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  try {
    const username = await signUp(page, 'racing')

    await page.goto('/login')
    await page.getByLabel('Username or email').fill(username)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByLabel('Keep me signed in').check()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL('/')

    const session = (await context.cookies()).find((c) => /session/.test(c.name))
    await context.clearCookies({ name: session!.name })

    const tabs = await Promise.all(Array.from({ length: 4 }, () => context.newPage()))
    const landed = await Promise.all(
      tabs.map(async (tab) => {
        await tab.goto('/auth/resume?next=/usercp')
        return new URL(tab.url()).pathname
      }),
    )

    expect(landed).toEqual(['/usercp', '/usercp', '/usercp', '/usercp'])

    await page.goto('/usercp')
    await expect(page).toHaveURL('/usercp')
  } finally {
    await context.close()
  }
})

test('an unsubscribe link that arrived broken explains itself', async ({ page }) => {
  for (const url of ['/unsubscribe', '/unsubscribe?token=truncated-by-a-mail-client']) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Unsubscribe' })).toBeVisible()
    await expect(page.getByText(/That link is not valid/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'your subscriptions' })).toHaveAttribute(
      'href',
      '/subscriptions',
    )
  }

  await page.goto('/unsubscribe?done=email')
  await expect(page.getByText(/subscription e-mails are off/)).toBeVisible()

  await page.goto('/unsubscribe?done=one')
  await expect(page.getByText(/you will not be notified about that any more/)).toBeVisible()

  await page.goto('/unsubscribe?done=announcements')
  await expect(page.getByText(/announcements are off/)).toBeVisible()
})

test('the health probe answers, uncached, without reading the board', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')

  const body = (await response.json()) as { ok: boolean; at: string }
  expect(body.ok).toBe(true)
  expect(Number.isNaN(Date.parse(body.at))).toBe(false)
})
