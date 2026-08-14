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

test('the advanced options narrow a search before it runs', async ({ page, request }) => {
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('desk')
  await page.getByText('Advanced options').click()
  await page.getByLabel('Show', { exact: true }).selectOption('threads')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('link', { name: 'Show us your desk setup' })).toHaveCount(1)
})

test('a search by somebody who is not a member says so rather than running', async ({ page }) => {
  await page.goto('/search?q=desk&author=nobodyatallhere')

  await expect(page.getByText('Nobody here is called').first()).toBeVisible()
  await expect(page).toHaveURL(/\/search\?/)
})

test('the results page sorts what it found without searching again', async ({ page, request }) => {
  await indexed(request, page)

  await page.goto('/search?q=desk&show=threads')
  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  const results = page.url()

  const hit = page.getByRole('link', { name: 'Show us your desk setup' })
  await expect(hit).toHaveAttribute('href', /post=121/)

  await page.getByLabel('Sort by', { exact: true }).selectOption('newest')
  await page.getByRole('button', { name: 'Apply filters' }).click()

  await expect(page).toHaveURL(new RegExp(`${results.split('/').pop()!}\\?sort=newest`))
  await expect(page.getByRole('link', { name: 'Show us your desk setup' })).toHaveAttribute(
    'href',
    /post=132/,
  )
})

test('a filter on the results page goes on with a select and off with a chip', async ({
  page,
  request,
}) => {
  await indexed(request, page)

  await page.goto('/search?q=us')
  await expect(page).toHaveURL(/\/search\/[\w-]+$/)

  const announcement = page.getByRole('link', { name: 'Version 0.1 is live' })
  const desk = page.getByRole('link', { name: 'Show us your desk setup' })

  await expect(announcement).toBeVisible()
  await expect(desk.first()).toBeVisible()

  await page.getByLabel('In', { exact: true }).selectOption({ label: 'Announcements (1)' })
  await page.getByRole('button', { name: 'Apply filters' }).click()

  await expect(announcement).toBeVisible()
  await expect(desk).toHaveCount(0)

  await page.getByRole('link', { name: /remove this filter/ }).click()

  await expect(desk.first()).toBeVisible()
})
