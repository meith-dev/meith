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

test('the service worker is served from the root, and caches nothing', async ({ request }) => {
  const response = await request.get('/sw.js')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/javascript/)

  const source = await response.text()
  expect(source).toContain("addEventListener('push'")
  expect(source).toContain("addEventListener('notificationclick'")
  expect(source).not.toContain("addEventListener('fetch'")
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
