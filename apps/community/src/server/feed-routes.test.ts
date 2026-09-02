import { describe, expect, it, vi } from 'vitest'

const VALID = 'forum_feed_valid'

const guestScope = {
  forumIds: [1],
  ownThreadsOnlyForumIds: [],
  viewerUserId: null,
  content: { states: ['visible'], seesUnapproved: false, seesDeleted: false },
}

const memberScope = {
  forumIds: [1, 2],
  ownThreadsOnlyForumIds: [],
  viewerUserId: 42,
  content: { states: ['visible'], seesUnapproved: false, seesDeleted: false },
}

function thread(forumId: number, title: string) {
  return {
    threadId: forumId * 10,
    title,
    slug: title.toLowerCase(),
    forumId,
    forumTitle: title,
    authorUsername: 'ann',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastPostAt: new Date('2026-01-02T00:00:00Z'),
    replyCount: 0,
    excerptSource: `${title} body`,
  }
}

const THREADS = [thread(1, 'Public'), thread(2, 'Secret')]

vi.mock('./board-offline', () => ({ boardOffline: async () => null }))
vi.mock('./content-admin', () => ({ activeWordFilter: async () => undefined }))
vi.mock('./plugin-view', () => ({ filterView: async (_hook: string, items: unknown[]) => items }))
vi.mock('./settings', () => ({
  getSettings: async () => ({
    get: (key: string) =>
      key === 'board.name' ? 'Board' : key === 'board.description' ? 'Desc' : '',
  }),
}))
vi.mock('./syndication', () => ({
  FEED_LIMIT: 30,
  origin: async () => 'https://board.test',
  absoluteTo: (base: string, path: string) => `${base}${path}`,
  feedRepository: () => ({
    recentThreads: async (_limit: number, scope: { forumIds: number[] }) =>
      THREADS.filter((t) => scope.forumIds.includes(t.forumId)),
  }),
}))
vi.mock('./feed-token', () => ({
  feedScopeForRequest: async (request: Request) => {
    const token = new URL(request.url).searchParams.get('token')
    if (token === null || token === '') return { scope: guestScope, tokened: false }
    if (token === VALID) return { scope: memberScope, tokened: true }
    return { scope: guestScope, tokened: true }
  },
}))

const { boardFeed } = await import('./feed-routes')

function get(query = ''): Request {
  return new Request(`https://board.test/feed.xml${query}`)
}

describe('boardFeed caching', () => {
  it('leaves a tokenless feed publicly cacheable', async () => {
    const response = await boardFeed('rss', '/feed.xml', get())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=300, stale-while-revalidate=3600',
    )
  })

  it('marks a tokened feed private and uncacheable', async () => {
    const response = await boardFeed('rss', '/feed.xml', get(`?token=${VALID}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('boardFeed visibility', () => {
  it('shows a member their private forum through a valid token', async () => {
    const body = await (await boardFeed('rss', '/feed.xml', get(`?token=${VALID}`))).text()
    expect(body).toContain('Public')
    expect(body).toContain('Secret')
  })

  it('keeps a private forum out of the guest feed', async () => {
    const body = await (await boardFeed('rss', '/feed.xml', get())).text()
    expect(body).toContain('Public')
    expect(body).not.toContain('Secret')
  })
})

describe('boardFeed leaks no token-validity oracle', () => {
  it('answers a bogus token exactly like a revoked one: guest body, private headers, 200', async () => {
    const bogus = await boardFeed('rss', '/feed.xml', get('?token=forum_feed_wrong'))
    const revoked = await boardFeed('rss', '/feed.xml', get('?token=forum_feed_gone'))

    expect(bogus.status).toBe(200)
    expect(revoked.status).toBe(200)
    expect(bogus.headers.get('cache-control')).toBe('private, no-store')
    expect(revoked.headers.get('cache-control')).toBe('private, no-store')

    const bogusBody = await bogus.text()
    const revokedBody = await revoked.text()
    expect(bogusBody).toBe(revokedBody)
    expect(bogusBody).not.toContain('Secret')
  })

  it('gives a bogus token the same body a signed-out reader gets', async () => {
    const bogusBody = await (
      await boardFeed('rss', '/feed.xml', get('?token=forum_feed_wrong'))
    ).text()
    const guestBody = await (await boardFeed('rss', '/feed.xml', get())).text()
    expect(bogusBody).toBe(guestBody)
  })

  it('answers a valid and a bogus token with the same status and cache headers', async () => {
    const valid = await boardFeed('rss', '/feed.xml', get(`?token=${VALID}`))
    const bogus = await boardFeed('rss', '/feed.xml', get('?token=forum_feed_wrong'))

    expect(valid.status).toBe(bogus.status)
    expect(valid.headers.get('cache-control')).toBe(bogus.headers.get('cache-control'))
    expect(valid.headers.get('content-type')).toBe(bogus.headers.get('content-type'))
  })
})
