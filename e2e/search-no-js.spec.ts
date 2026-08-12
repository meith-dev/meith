import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

async function indexed(request: APIRequestContext, page: Page): Promise<void> {
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto('/search?q=version')
    await expect(page.getByRole('link', { name: 'Version 0.1 is live' })).toBeVisible()
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000, 5_000] })
}

test('a guest reaches their own results page', async ({ page }) => {
  await page.goto('/search')
  await page.getByLabel('Search for').fill('zzunlikelyzz')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
  await expect(page.getByText('Nothing matched')).toBeVisible()
})

test('the board indexes itself, and a title-only word finds its thread', async ({
  page,
  request,
}) => {
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('version')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('link', { name: 'Version 0.1 is live' })).toBeVisible()
})

test('a member pages through their own results and searches within them', async ({
  page,
  request,
}) => {
  await signUp(page, 'searcher')
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('desk')
  await page.getByRole('button', { name: 'Search' }).click()

  const results = page.url()
  const hit = page.getByRole('link', { name: 'Show us your desk setup' })
  await expect(hit.first()).toBeVisible()
  await expect(hit).toHaveCount(2)

  await page.goto(results)
  await expect(hit.first()).toBeVisible()

  await page.getByLabel('Search within these results').fill('desk notebook')
  await page.getByRole('button', { name: 'Search within' }).click()
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
})
