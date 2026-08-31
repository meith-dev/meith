import { expect, test } from '@playwright/test'

import { MEITH_VERSION } from '@meith/marketplace'

import { E2E_FAKE_MARKETPLACE_BASE_URL } from './support/config'
import { enterAdminPanel } from './support/session'

test.use({ javaScriptEnabled: false })

function oneMinorAhead(version: string): string {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return `${major}.${minor + 1}.0`
}

const AHEAD = oneMinorAhead(MEITH_VERSION)

async function pointFeedAt(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto('/admin/settings?group=board&advanced=1')
  await page.getByLabel('Catalog feed URL').fill(url)
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
}

async function checkForUpdates(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click()
}

test('a board that has never checked says so plainly on the plugins page', async ({ page }) => {
  await enterAdminPanel(page)

  await page.goto('/admin/plugins')
  await expect(page.getByText('Not checked for updates yet', { exact: false })).toBeVisible()
})

test('an available plugin update is flagged on the installed plugin, and non-installed listings never appear', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins')
  await checkForUpdates(page)
  await expect(page.getByText('Checked for updates.')).toBeVisible()

  const dues = page.locator('li').filter({ hasText: 'Dues' }).first()
  await expect(dues.getByText(`Update available: ${AHEAD}`)).toBeVisible()

  await expect(page.getByText('Future Thing')).toHaveCount(0)
  await expect(page.getByText('meith plugin:add')).toHaveCount(0)
})

test('an available theme update is flagged on the installed theme', async ({ page }) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/themes')
  await checkForUpdates(page)
  await expect(page.getByText('Checked for updates.')).toBeVisible()

  const defaultTheme = page.locator('li').filter({ hasText: 'Default' }).first()
  await expect(defaultTheme.getByText(`Update available: ${AHEAD}`)).toBeVisible()
})

test('an installed plugin update notifies administrators exactly once', async ({ page }) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins')
  await checkForUpdates(page)
  await expect(page.getByText('Checked for updates.')).toBeVisible()

  await page.goto('/notifications')
  const rows = page.locator('li').filter({ hasText: 'Dues has a new version' })
  await expect(rows).toHaveCount(1)

  await page.goto('/admin/plugins')
  await checkForUpdates(page)
  await expect(page.getByText('Checked for updates.')).toBeVisible()

  await page.goto('/notifications')
  await expect(page.locator('li').filter({ hasText: 'Dues has a new version' })).toHaveCount(1)
})

test('a later-unreachable catalog host keeps showing the last good check, plus a plain note', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins')
  await checkForUpdates(page)
  const dues = page.locator('li').filter({ hasText: 'Dues' }).first()
  await expect(dues.getByText(`Update available: ${AHEAD}`)).toBeVisible()

  await pointFeedAt(page, 'https://127.0.0.1:1/v1.json')
  await page.goto('/admin/plugins')
  await checkForUpdates(page)

  await expect(page.getByText(/could not be reached/)).toBeVisible()
  await expect(dues.getByText(`Update available: ${AHEAD}`)).toBeVisible()
})

test('an invalid feed is refused rather than trusted as a working catalog', async ({ page }) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/invalid.json`)

  await page.goto('/admin/plugins')
  await checkForUpdates(page)

  await expect(page.getByText(/could not be reached/)).toBeVisible()
})
