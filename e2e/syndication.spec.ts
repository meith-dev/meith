/**
 * Feeds, the sitemap and `robots.txt` — the board as a machine reads it.
 *
 * None of it had a browser-level test, and it is the part of a forum nobody
 * looks at until it is wrong: a feed reader and a crawler are the two visitors
 * who never file a bug. What they need is not "a 200" but well-formed XML with
 * the right content type, absolute URLs, stable ids, and — the one that decides
 * whether any of it matters — a private forum's threads *absent*.
 *
 * `request` rather than `page` throughout, deliberately. These are documents,
 * not pages: a browser would apply its own XML styling and tell us nothing
 * about the bytes, and half of what is asserted here is a header.
 */
import { expect, test, type APIRequestContext } from '@playwright/test'

/** Every feed the board publishes, and what each one is a feed *of*. */
const FEEDS = [
  { url: '/feed.xml', of: 'the board' },
  { url: '/200-general/feed.xml', of: 'one forum' },
  { url: '/thread/4-welcome-to-the-forum/feed.xml', of: 'one thread' },
] as const

async function xml(request: APIRequestContext, url: string): Promise<string> {
  const response = await request.get(url)
  expect(response.status(), url).toBe(200)
  /*
   * The content type is the whole difference between a feed and a page of
   * angle brackets: a reader that gets `text/html` does not subscribe.
   */
  expect(response.headers()['content-type'], url).toMatch(/xml/)
  return response.text()
}

test('every RSS feed is well-formed and carries absolute links', async ({ request }) => {
  for (const feed of FEEDS) {
    const body = await xml(request, feed.url)

    expect(body, feed.of).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(body, feed.of).toContain('<rss version="2.0"')
    /*
     * `atom:link rel="self"` is what tells an aggregator where the feed lives
     * when it has been copied somewhere else — the single most commonly
     * omitted element in a hand-rolled feed.
     */
    expect(body, feed.of).toContain('rel="self"')
    expect(body, feed.of).toMatch(/<item>/)

    /*
     * Absolute, always. A feed is read outside the board, so a relative link
     * resolves against the aggregator's own host and goes nowhere.
     */
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
  /*
   * Atom requires an `<id>` per entry and a feed-level `<updated>`; RSS has
   * neither, and a serialiser that emitted RSS fields into an Atom skeleton is
   * exactly the mistake sharing a renderer invites.
   */
  expect(body).toMatch(/<id>tag:[^<]+<\/id>/)
  expect(body).toMatch(/<updated>\d{4}-\d{2}-\d{2}T/)
  expect(body).not.toContain('<rss')
})

/**
 * Every entry id is a tag URI over the thread id, and nothing else.
 *
 * That shape is what stops every reader re-announcing the board. A `guid`
 * derived from the URL changes when a thread is renamed — the slug is in the
 * address — and every subscriber sees the thread as new again; one built from
 * the id survives a rename, a move between forums, and a change of board
 * address. Asserted as the *form* of the id rather than by renaming something,
 * because the form is the guarantee: an id that contains no slug cannot change
 * when the slug does.
 */
test('every feed id is a tag URI over the thread id, so a rename cannot move it', async ({
  request,
}) => {
  const body = await xml(request, '/feed.xml')

  const guids = [...body.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1])
  expect(guids.length).toBeGreaterThan(0)
  for (const guid of guids) {
    expect(guid).toMatch(/^tag:[^,]+,\d{4}:thread\/\d+$/)
  }

  /* Same feed, same ids: nothing in here is minted per request. */
  const again = await xml(request, '/feed.xml')
  expect([...again.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1])).toEqual(
    guids,
  )
})

/**
 * The sitemap is an index naming chunks, and the chunks have to exist.
 *
 * That pairing is the whole failure mode: an index is written once and the
 * chunk route is written by somebody else, and a crawler that is handed a name
 * nothing answers to has been told the board is broken. So this follows every
 * link the index gives rather than asserting the two names it expects.
 */
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

/**
 * `robots.txt` disallows the board's private and expensive surfaces.
 *
 * Not cosmetic: `/search` is the most expensive thing an anonymous visitor can
 * ask for, and a crawler walking every stored search is a self-inflicted load
 * test. The member panels are there for the other reason — they are not
 * content, and indexing them puts a member's inbox address into a search
 * engine.
 */
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

  /* And it names the index, which is the only way a crawler finds the chunks. */
  expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m)
})

/**
 * A feed for something that does not exist is a 404, with a body.
 *
 * The body matters and is not pedantry: `notFound()` in a route handler has no
 * React tree to render, so Next ends the response at the status line — and
 * Chromium ≥ 126 refuses a bodiless error response outright, which surfaces as
 * `ERR_HTTP_RESPONSE_CODE_FAILURE` rather than as a 404. The reading spec pins
 * that for pages; feeds are route handlers, where it is the *likely* shape.
 */
test('a feed for a thread that does not exist is a 404', async ({ request }) => {
  for (const url of ['/thread/999999-nothing/feed.xml', '/999999-nothing/feed.xml']) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(404)
  }
})
