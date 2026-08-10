import { expect, test, type APIRequestContext } from '@playwright/test'

const FEEDS = [
  { url: '/feed.xml', of: 'the board' },
  { url: '/200-general/feed.xml', of: 'one forum' },
  { url: '/thread/4-welcome-to-the-forum/feed.xml', of: 'one thread' },
] as const

async function xml(request: APIRequestContext, url: string): Promise<string> {
  const response = await request.get(url)
  expect(response.status(), url).toBe(200)
  expect(response.headers()['content-type'], url).toMatch(/xml/)
  return response.text()
}

test('every RSS feed is well-formed and carries absolute links', async ({ request }) => {
  for (const feed of FEEDS) {
    const body = await xml(request, feed.url)

    expect(body, feed.of).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(body, feed.of).toContain('<rss version="2.0"')
    expect(body, feed.of).toContain('rel="self"')
    expect(body, feed.of).toMatch(/<item>/)

    for (const link of body.match(/<link>([^<]*)<\/link>/g) ?? []) {
      expect(link, `${feed.of}: ${link}`).toMatch(/<link>https?:\/\//)
    }
  }
})

test('the Atom feed is a feed, not the RSS one under another name', async ({ request }) => {
  const body = await xml(request, '/atom.xml')

  expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
  expect(body).toContain('<entry>')
  expect(body).toContain('rel="self"')
  expect(body).toMatch(/<id>tag:[^<]+<\/id>/)
  expect(body).toMatch(/<updated>\d{4}-\d{2}-\d{2}T/)
  expect(body).not.toContain('<rss')
})

test('every feed id is a tag URI over the thread id, so a rename cannot move it', async ({
  request,
}) => {
  const body = await xml(request, '/feed.xml')

  const guids = [...body.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1])
  expect(guids.length).toBeGreaterThan(0)
  for (const guid of guids) {
    expect(guid).toMatch(/^tag:[^,]+,\d{4}:thread\/\d+$/)
  }

  const again = await xml(request, '/feed.xml')
  expect([...again.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1])).toEqual(
    guids,
  )
})

test('the sitemap index names chunks that answer', async ({ request }) => {
  const index = await xml(request, '/sitemap.xml')
  expect(index).toContain('<sitemapindex')

  const chunks = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '')
  expect(chunks.length).toBeGreaterThan(0)

  for (const chunk of chunks) {
    const path = new URL(chunk).pathname
    const body = await xml(request, path)
    expect(body, path).toContain('<urlset')
    expect(body, path).toMatch(/<loc>https?:\/\//)
  }
})

test('robots.txt withholds the panels and points at the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/plain')

  const body = await response.text()
  for (const path of [
    '/search',
    '/discover',
    '/usercp',
    '/messages',
    '/notifications',
    '/modcp',
    '/moderation',
    '/admin',
    '/api',
  ]) {
    expect(body, path).toContain(`Disallow: ${path}`)
  }

  expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m)
})

test('a feed for a thread that does not exist is a 404', async ({ request }) => {
  for (const url of ['/thread/999999-nothing/feed.xml', '/999999-nothing/feed.xml']) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(404)
  }
})
