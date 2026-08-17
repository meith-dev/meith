import { expect, test, type Page } from '@playwright/test'

import { enterAdminPanel } from './support/session'

test.use({ javaScriptEnabled: false })

const ANALYTICS_SETTINGS = '/admin/settings?group=analytics'

function watchForOffSiteRequests(page: Page, baseURL: string): string[] {
  const board = new URL(baseURL).origin
  const offSite: string[] = []

  page.on('request', (request) => {
    if (new URL(request.url()).origin !== board) offSite.push(request.url())
  })

  return offSite
}

async function setCounting(page: Page, on: boolean): Promise<void> {
  await page.goto(ANALYTICS_SETTINGS)
  const box = page.getByLabel('Count page views')
  if (on) await box.check()
  else await box.uncheck()
  await page.getByRole('button', { name: 'Save settings' }).click()
}

test('a board reading page after page asks nothing of anybody else', async ({
  page,
  baseURL,
}) => {
  const offSite = watchForOffSiteRequests(page, baseURL!)

  for (const path of ['/', '/search', '/online', '/stats', '/login']) {
    await page.goto(path)
  }

  expect(offSite).toEqual([])
})

test('counting is off until it is switched on, and then it counts', async ({
  page,
  baseURL,
}) => {
  await enterAdminPanel(page)

  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible()
  await expect(page.getByText('Counting is off.')).toBeVisible()

  await setCounting(page, true)
  await page.goto(ANALYTICS_SETTINGS)
  await expect(page.getByLabel('Count page views')).toBeChecked()

  const offSite = watchForOffSiteRequests(page, baseURL!)

  await page.goto('/')
  await page.goto('/')

  await page.goto('/admin/analytics')
  await expect(page.getByText('Counting is off.')).toHaveCount(0)
  await expect(page.getByText('Nothing counted in this range')).toHaveCount(0)
  await expect(page.getByText('The board index')).toBeVisible()

  expect(offSite).toEqual([])

  await setCounting(page, false)
  await page.goto('/admin/analytics')
  await expect(page.getByText('Counting is off.')).toBeVisible()
})

test('the Google Analytics connector is off, and says so', async ({ page }) => {
  await enterAdminPanel(page)

  await page.goto(ANALYTICS_SETTINGS)
  await expect(page.getByLabel('Send page views to Google Analytics')).not.toBeChecked()
  await expect(page.getByLabel('Measurement ID')).toHaveValue('')

  await page.goto('/admin/analytics')
  await expect(page.getByText('The Google Analytics connector is off')).toBeVisible()
})
