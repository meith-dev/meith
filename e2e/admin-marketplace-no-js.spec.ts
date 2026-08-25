import { expect, test } from '@playwright/test'

import { MEITH_VERSION } from '@meith/marketplace'

import { E2E_FAKE_MARKETPLACE_BASE_URL } from './support/config'
import { enterAdminPanel } from './support/session'

test.use({ javaScriptEnabled: false })

async function pointFeedAt(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto('/admin/settings?group=marketplace')
  await page.getByLabel('Catalog feed URL').fill(url)
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
}

/**
 * Order matters in this file: the cached feed is one row shared by the whole
 * suite (see docs/development.md, "The suite shares one database"), so this
 * "nothing fetched yet" case has to run before anything else here refreshes it.
 */
test('a board that has never fetched says so plainly, with nothing to show yet', async ({
  page,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/plugins/browse')
  await expect(
    page.getByText('The catalog has not been fetched yet', { exact: false }),
  ).toBeVisible()
})

test('the Browse tab renders the seeded catalog with correct statuses, screenshots included', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins/browse')

  await expect(page.locator('[aria-current="page"]').filter({ hasText: 'Browse' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Installed', exact: true })).toHaveAttribute(
    'href',
    '/admin/plugins',
  )

  /**
   * The screenshot request fires as soon as the refreshed page's <img> tags
   * parse, so the listener has to be armed before the click that navigates
   * there — registering it after the page has already loaded would miss it.
   */
  const [screenshotResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/admin/api/marketplace/screenshot'),
    ),
    page.getByRole('button', { name: 'Refresh', exact: true }).click(),
  ])
  await expect(page.getByText('Catalog refreshed.')).toBeVisible()
  expect(screenshotResponse.status()).toBe(200)
  expect(screenshotResponse.headers()['content-type']).toBe('image/png')

  const dues = page.locator('li').filter({ hasText: 'Dues' }).first()
  await expect(dues.getByText('Update available')).toBeVisible()
  await expect(dues.getByText(`This board runs ${MEITH_VERSION}.`)).toBeVisible()
  await expect(dues.locator('img').first()).toBeVisible()

  const greeter = page.locator('li').filter({ hasText: 'Greeter' }).first()
  await expect(greeter.getByText('Not installed')).toBeVisible()
  await expect(greeter.getByText('community plugin:add @meith/plugin-greeter')).toBeVisible()
  await expect(greeter.getByRole('link', { name: 'More about the marketplace' })).toHaveAttribute(
    'href',
    'https://www.meith.dev/docs/marketplace',
  )
  /**
   * This dev server is not the stock image (BOARD_PLUGINS_MANIFEST is unset
   * here, the same as a graduated board), so the graduation signpost stays
   * absent — see apps/community/src/server/marketplace-admin.test.ts for the
   * case where it is set.
   */
  await expect(greeter.getByRole('link', { name: /moving to a custom board/i })).toHaveCount(0)

  const futureThing = page.locator('li').filter({ hasText: 'Future Thing' }).first()
  await expect(futureThing.getByText('Incompatible')).toBeVisible()
  await expect(futureThing.getByText(/this board runs major 0/)).toBeVisible()
  await expect(futureThing.getByText('community plugin:add')).toHaveCount(0)

  await page.goto('/admin/themes/browse')
  const defaultTheme = page.locator('li').filter({ hasText: 'Default' }).first()
  await expect(defaultTheme.getByText('Active', { exact: true })).toBeVisible()
})

test('an installed plugin update notifies administrators exactly once', async ({ page }) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins/browse')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Catalog refreshed.')).toBeVisible()

  await page.goto('/notifications')
  const rows = page.locator('li').filter({ hasText: 'Dues has a new version' })
  await expect(rows).toHaveCount(1)

  await page.goto('/admin/plugins/browse')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Catalog refreshed.')).toBeVisible()

  await page.goto('/notifications')
  await expect(page.locator('li').filter({ hasText: 'Dues has a new version' })).toHaveCount(1)
})

test('a later-unreachable catalog host keeps showing the last good fetch, plus a plain note', async ({
  page,
}) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/v1.json`)

  await page.goto('/admin/plugins/browse')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Catalog refreshed.')).toBeVisible()
  await expect(page.locator('li').filter({ hasText: 'Dues' })).toBeVisible()

  /**
   * Port 1 answers nothing; the fetch fails fast rather than hanging the
   * spec. https:// only because the setting itself requires it — nothing
   * here ever completes a real TLS handshake.
   */
  await pointFeedAt(page, 'https://127.0.0.1:1/v1.json')
  await page.goto('/admin/plugins/browse')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()

  await expect(page.getByText(/could not be loaded/)).toBeVisible()
  await expect(page.locator('li').filter({ hasText: 'Dues' })).toBeVisible()
})

test('an invalid feed is refused rather than shown as a working catalog', async ({ page }) => {
  await enterAdminPanel(page)
  await pointFeedAt(page, `${E2E_FAKE_MARKETPLACE_BASE_URL}/invalid.json`)

  await page.goto('/admin/plugins/browse')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()

  await expect(page.getByText(/could not be loaded/)).toBeVisible()
})
