import { describe, expect, it, vi } from 'vitest'

import { compileWordFilter } from '@meith/markdown'

const WORD_FILTER = compileWordFilter([
  { pattern: 'bikeshed', replacement: 'roof', wholeWord: false },
])

const TITLE = 'The bikeshed question'
const FILTERED = 'The roof question'
const NOW = new Date('2026-05-05T12:00:00Z')

vi.mock('./content-admin', () => ({
  activeWordFilter: async () => WORD_FILTER,
}))

const subscriptionRows = [
  {
    target: 'thread' as const,
    targetId: 3,
    title: TITLE,
    href: '/thread/3-the-bikeshed-question',
    mode: 'instant' as const,
    createdAt: NOW,
    pending: 0,
  },
  {
    target: 'forum' as const,
    targetId: 2,
    title: 'The bikeshed forum',
    href: '/2-general',
    mode: 'instant' as const,
    createdAt: NOW,
    pending: 0,
  },
]

vi.mock('./container', () => ({
  getContainer: () => ({
    authorizer: { visibleForumIds: async () => [2] },
    subscriptions: {},
  }),
}))

vi.mock('@meith/subscriptions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@meith/subscriptions')>()),
  SubscriptionService: class {
    async list() {
      return subscriptionRows
    }
  },
}))

const searchHits = [
  {
    postId: 4,
    threadId: 3,
    forumId: 2,
    threadTitle: TITLE,
    threadSlug: 'the-bikeshed-question',
    authorUserId: 7,
    authorUsername: 'marlow',
    postedAt: NOW,
    excerpt: 'a bikeshed of a post',
  },
]

vi.mock('./search', () => ({
  requireSearchEnabled: async () => undefined,
  searchMinWordLength: async () => 3,
  searchScopeFor: async () => ({}),
  requireSearch: () => ({
    search: async () => ({ hits: searchHits, nextCursor: null }),
  }),
}))

const { feedFor } = await import('./feed-builder')
const { SEARCH_HANDLERS } = await import('./api/search')
const { SUBSCRIPTION_HANDLERS } = await import('./api/subscriptions')

function handler(routes: readonly (readonly [string, string, unknown])[], path: string) {
  const found = routes.find(([, route]) => route === path)
  if (found === undefined) throw new Error(`no handler for ${path}`)
  return found[2] as (input: {
    actor: unknown
    url: URL
  }) => Promise<{ status: number; body: { data: readonly Record<string, unknown>[] } }>
}

describe('a thread title is rewritten in what the board serves as well as what it renders', () => {
  it('in an Atom or RSS entry built from a thread', () => {
    const entry = feedFor('https://board.example', WORD_FILTER).threadEntry({
      threadId: 3,
      title: TITLE,
      slug: 'the-bikeshed-question',
      forumId: 2,
      forumTitle: 'General',
      authorUsername: 'marlow',
      createdAt: NOW,
      lastPostAt: NOW,
      replyCount: 1,
      excerptSource: 'nothing to see',
    })

    expect(entry.title).toBe(FILTERED)
  })

  it('in an Atom or RSS entry built from a post', () => {
    const entry = feedFor('https://board.example', WORD_FILTER).postEntry({
      postId: 4,
      threadId: 3,
      threadTitle: TITLE,
      threadSlug: 'the-bikeshed-question',
      authorUsername: 'marlow',
      createdAt: NOW,
      messageSource: 'nothing to see',
    })

    expect(entry.title).toBe(FILTERED)
  })

  it('and is left alone in a feed when the board holds no filter', () => {
    const entry = feedFor('https://board.example', undefined).postEntry({
      postId: 4,
      threadId: 3,
      threadTitle: TITLE,
      threadSlug: 'the-bikeshed-question',
      authorUsername: 'marlow',
      createdAt: NOW,
      messageSource: 'nothing to see',
    })

    expect(entry.title).toBe(TITLE)
  })

  it('in a search result the REST API returns', async () => {
    const result = await handler(
      SEARCH_HANDLERS,
      '/search',
    )({
      actor: { userId: 7 },
      url: new URL('https://board.example/api/v1/search?q=question'),
    })

    expect(result.body.data[0]).toMatchObject({
      threadTitle: FILTERED,
      excerpt: 'a roof of a post',
    })
  })

  it('in the subscriptions the REST API returns, leaving forum names alone', async () => {
    const result = await handler(
      SUBSCRIPTION_HANDLERS,
      '/subscriptions',
    )({
      actor: { userId: 7 },
      url: new URL('https://board.example/api/v1/subscriptions'),
    })

    expect(result.body.data.map((row) => row.title)).toEqual([FILTERED, 'The bikeshed forum'])
  })
})
