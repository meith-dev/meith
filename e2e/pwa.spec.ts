import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test('the board is installable: a linked manifest, an icon, and a scope', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')

  const response = await request.get(href!)
  expect(response.status()).toBe(200)

  const manifest = (await response.json()) as {
    name: string
    short_name: string
    start_url: string
    scope: string
    display: string
    theme_color: string
    icons: { src: string; sizes: string; type: string }[]
  }

  expect(manifest.name.length).toBeGreaterThan(0)
  expect(manifest.short_name.length).toBeGreaterThan(0)
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.display).toBe('standalone')
  expect(manifest.theme_color).toMatch(/^#|^oklch/)
  expect(manifest.icons.length).toBeGreaterThan(0)

  for (const icon of manifest.icons) {
    const asset = await request.get(icon.src)
    expect(asset.status(), icon.src).toBe(200)
  }
})

test('the service worker is served from the root, and intercepts navigations only', async ({
  request,
}) => {
  const response = await request.get('/sw.js')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/javascript/)

  const source = await response.text()
  expect(source).toContain("addEventListener('push'")
  expect(source).toContain("addEventListener('notificationclick'")
  expect(source).toContain("addEventListener('fetch'")
  expect(source).toContain("request.mode !== 'navigate'")
})

test('the offline fallback is a static page with no data dependencies', async ({ request }) => {
  const response = await request.get('/offline')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/text\/html/)

  const body = await response.text()
  expect(body).toMatch(/you.?re offline/i)
  expect(body).toContain('href="/"')
})

test('an installed board falls back to the offline page when the network fails, and recovers', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await page.context().setOffline(true)
  try {
    await page.reload()
    await expect(page.getByText(/you.?re offline/i)).toBeVisible()
    const retry = page.getByRole('link', { name: /retry/i })
    await expect(retry).toBeVisible()

    await page.context().setOffline(false)
    await retry.click()
  } finally {
    await page.context().setOffline(false)
  }

  await expect(page).toHaveURL('/')
  await expect(page.getByText(/you.?re offline/i)).not.toBeVisible()
})

test('the policy lets the board register its own worker and manifest', async ({ page }) => {
  const response = await page.goto('/')
  const policy = response?.headers()['content-security-policy'] ?? ''

  expect(policy).toContain("worker-src 'self'")
  expect(policy).toContain("manifest-src 'self'")
})

test('a board that is not offering push offers no subscribe button', async ({ page }) => {
  await signUp(page, 'pwa')

  await page.goto('/notifications/preferences')
  await expect(page.locator('input[name="email"]').first()).toBeVisible()
  await expect(page.locator('input[name="push"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /push/i })).toHaveCount(0)
})
