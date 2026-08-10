import { expect, test, type Locator, type Page } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

function row(page: Page, name: string | RegExp, within?: Locator): Locator {
  return (within ?? page)
    .locator('li')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
}

function forumRow(page: Page): Locator {
  return row(page, 'General Discussion', page.getByLabel('Main'))
}

test('a thread somebody else posts in is unread until the member marks it read', async ({
  browser,
}) => {
  const posterContext = await browser.newContext()
  const readerContext = await browser.newContext()
  const posterPage = await posterContext.newPage()
  const readerPage = await readerContext.newPage()

  try {
    await signUp(posterPage, 'writes')
    await signUp(readerPage, 'reads')

    await readerPage.goto('/')
    await readerPage.getByRole('button', { name: 'Mark all forums read' }).click()
    await expect(forumRow(readerPage)).not.toContainText('(new posts)')

    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Unread until read ${Date.now().toString(36)}`
    await posterPage.getByLabel('Subject').fill(title)
    await posterPage.getByLabel('Message').fill('Nobody has seen this yet.')
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = posterPage.url()

    await readerPage.goto('/')
    await expect(forumRow(readerPage)).toContainText('(new posts)')

    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toContainText('(new posts)')

    await readerPage.goto(threadUrl)
    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toContainText('(new posts)')

    await readerPage.goto(threadUrl)
    await readerPage.getByRole('button', { name: 'Mark read' }).click()
    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toBeVisible()
    await expect(row(readerPage, title)).not.toContainText('(new posts)')
  } finally {
    await posterContext.close()
    await readerContext.close()
  }
})

test('each Mark read control completes its redirect, and the page arrives changed', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const locations: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/read/')) {
      expect(response.status(), response.url()).toBe(303)
      locations.push(response.headers()['location'] ?? '')
    }
  })

  try {
    await signUp(page, 'marks')

    await page.goto('/200-general')
    await expect(page.locator('li', { hasText: '(new posts)' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Mark read' }).click()
    await expect(page).toHaveURL('/200-general')
    await expect(page.locator('li', { hasText: '(new posts)' })).toHaveCount(0)

    await page.goto('/')
    await expect(forumRow(page)).not.toContainText('(new posts)')
    await page.getByRole('button', { name: 'Mark all forums read' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByLabel('Main').locator('li', { hasText: '(new posts)' })).toHaveCount(0)

    await page.goto('/thread/4-welcome-to-the-forum')
    await page.getByRole('button', { name: 'Mark read' }).click()
    await expect(page).toHaveURL('/thread/4-version-0-1-is-live')

    expect(locations.length).toBeGreaterThanOrEqual(3)
    for (const location of locations) {
      expect(location, 'Location must be relative').toMatch(/^\/(?!\/)/)
    }
  } finally {
    await context.close()
  }
})

test('read markers are not offered to a guest, and the routes refuse one', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Mark all forums read' })).toHaveCount(0)

  await page.goto('/200-general')
  await expect(page.getByRole('button', { name: 'Mark read' })).toHaveCount(0)

  for (const url of ['/api/read/all', '/api/read/forum/200', '/api/read/thread/4']) {
    const response = await request.post(url, { maxRedirects: 0 })
    expect(response.status(), url).toBe(303)
    expect(new URL(response.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname).toBe('/')
  }
})

test('marking a forum that is not there is a redirect, not an error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await signUp(page, 'marksbad')

    for (const url of ['/api/read/forum/999999', '/api/read/forum/abc', '/api/read/thread/999999']) {
      const response = await page.request.post(url, { maxRedirects: 0 })
      expect(response.status(), url).toBe(303)
      expect(
        new URL(response.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname,
        url,
      ).toBe('/')
    }

    const category = await page.request.post('/api/read/forum/10', { maxRedirects: 0 })
    expect(category.status()).toBe(303)
    expect(new URL(category.headers()['location'] ?? '', 'http://127.0.0.1:3001').pathname).toBe('/')
  } finally {
    await context.close()
  }
})
