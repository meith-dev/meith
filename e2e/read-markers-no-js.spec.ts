import { expect, type Locator, type Page, test } from '@playwright/test'

import { signedHeaders, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const BOARD = 'http://127.0.0.1:3001'

const SAME_ORIGIN = { origin: BOARD }

function row(page: Page, name: string | RegExp, within?: Locator): Locator {
  return (within ?? page)
    .locator('li')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
}

function forumRow(page: Page): Locator {
  return row(page, 'General Discussion', page.getByLabel('Main'))
}

test('a thread somebody else posts in is unread until the member reads it', async ({ browser }) => {
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
    await expect(row(readerPage, title)).toBeVisible()
    await expect(row(readerPage, title)).not.toContainText('(new posts)')
  } finally {
    await posterContext.close()
    await readerContext.close()
  }
})

test('an unread row’s link jumps straight to the reply the member has not seen', async ({
  browser,
}) => {
  const posterContext = await browser.newContext()
  const readerContext = await browser.newContext()
  const posterPage = await posterContext.newPage()
  const readerPage = await readerContext.newPage()

  try {
    await signUp(posterPage, 'gotoposter')
    await signUp(readerPage, 'gotoreader')

    await posterPage.goto('/200-general')
    await posterPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Jump to unread ${Date.now().toString(36)}`
    await posterPage.getByLabel('Subject').fill(title)
    await posterPage.getByLabel('Message').fill('First post, already read.')
    await posterPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(posterPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = posterPage.url().split('#')[0]!

    await readerPage.goto(threadUrl)
    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).not.toContainText('(new posts)')

    const reply = 'A reply the reader has not seen yet.'
    await posterPage.goto(`${threadUrl}/reply`)
    await posterPage.getByLabel('Message').fill(reply)
    await posterPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(posterPage).toHaveURL(/#post-\d+$/)
    const postAnchor = new URL(posterPage.url()).hash

    await readerPage.goto('/200-general')
    await expect(row(readerPage, title)).toContainText('(new posts)')

    const link = row(readerPage, title).getByRole('link', { name: title, exact: true })
    await expect(link).toHaveAttribute('href', `${new URL(threadUrl).pathname}?goto=unread`)
    await link.click()

    await expect(readerPage).toHaveURL(new RegExp(`\\${postAnchor}$`))
    await expect(readerPage.getByText(reply)).toBeVisible()

    await readerPage.goto('/200-general')
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
      locations.push(response.headers().location ?? '')
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
    const response = await request.post(url, { maxRedirects: 0, headers: SAME_ORIGIN })
    expect(response.status(), url).toBe(303)
    expect(new URL(response.headers().location ?? '', BOARD).pathname).toBe('/')
  }
})

test('a mark-read POST from anywhere but the board is refused', async ({ request }) => {
  for (const url of ['/api/read/all', '/api/read/forum/200', '/api/read/thread/4']) {
    const elsewhere = await request.post(url, {
      maxRedirects: 0,
      headers: { origin: 'https://elsewhere.example' },
    })
    expect(elsewhere.status(), url).toBe(403)

    const nameless = await request.post(url, { maxRedirects: 0 })
    expect(nameless.status(), url).toBe(403)
  }
})

test('marking a forum that is not there is a redirect, not an error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await signUp(page, 'marksbad')

    for (const url of [
      '/api/read/forum/999999',
      '/api/read/forum/abc',
      '/api/read/thread/999999',
    ]) {
      const response = await page.request.post(url, {
        maxRedirects: 0,
        headers: await signedHeaders(page, SAME_ORIGIN),
      })
      expect(response.status(), url).toBe(303)
      expect(new URL(response.headers().location ?? '', BOARD).pathname, url).toBe('/')
    }

    const category = await page.request.post('/api/read/forum/10', {
      maxRedirects: 0,
      headers: await signedHeaders(page, SAME_ORIGIN),
    })
    expect(category.status()).toBe(303)
    expect(
      new URL(category.headers().location ?? '', BOARD).pathname,
      'a category can hold threads now, so marking it read lands on its page',
    ).toBe('/10-main')
  } finally {
    await context.close()
  }
})
