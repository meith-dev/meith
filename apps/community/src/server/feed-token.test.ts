import { describe, expect, it, vi } from 'vitest'

import { FEED_TOKEN_PREFIX, issueToken } from '@meith/api'

const state = vi.hoisted(() => ({
  record: null as { id: number; userId: number; lookup: string; secretHash: string } | null,
  banned: false,
  missingActor: false,
}))

vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: 'postgres',
    actorSource: {
      buildGuest: async () => ({ userId: null, state: 'active' }),
      buildForUser: async (id: number) =>
        state.missingActor ? null : { userId: id, state: state.banned ? 'banned' : 'active' },
    },
    authorizer: {
      threadAudience: async (actor: { userId: number | null; state: string }) =>
        actor.state === 'banned'
          ? { forumIds: [], ownThreadsOnlyForumIds: [], viewerUserId: actor.userId }
          : { forumIds: [1, 2], ownThreadsOnlyForumIds: [2], viewerUserId: actor.userId },
    },
  }),
}))

vi.mock('./syndication', () => ({
  publicScope: async () => ({
    forumIds: [1],
    ownThreadsOnlyForumIds: [],
    viewerUserId: null,
    content: { states: ['visible'], seesUnapproved: false, seesDeleted: false },
  }),
}))

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresFeedTokenRepository: class {
    async findByLookup(lookup: string) {
      return state.record !== null && state.record.lookup === lookup ? state.record : null
    }
    async touch() {}
  },
}))

const { feedScopeForRequest, memberFeedScope, resolveFeedToken } = await import('./feed-token')

function request(query = ''): Request {
  return new Request(`https://board.test/feed.xml${query}`)
}

function grant(userId: number): string {
  const issued = issueToken(FEED_TOKEN_PREFIX)
  state.record = { id: 1, userId, lookup: issued.lookup, secretHash: issued.secretHash }
  return issued.token
}

describe('feedScopeForRequest', () => {
  it('serves the guest scope, uncached-flag off, when no token is presented', async () => {
    state.record = null
    const { scope, tokened } = await feedScopeForRequest(request())
    expect(tokened).toBe(false)
    expect(scope.forumIds).toEqual([1])
    expect(scope.viewerUserId).toBeNull()
  })

  it('widens to the member’s own audience for a valid token', async () => {
    state.banned = false
    state.missingActor = false
    const token = grant(42)
    const { scope, tokened } = await feedScopeForRequest(request(`?token=${token}`))
    expect(tokened).toBe(true)
    expect(scope.forumIds).toEqual([1, 2])
    expect(scope.viewerUserId).toBe(42)
    expect(scope.content.states).toEqual(['visible'])
  })

  it('falls back to the guest scope for a bogus token, but still marks the request tokened', async () => {
    state.record = null
    const { scope, tokened } = await feedScopeForRequest(
      request(`?token=${FEED_TOKEN_PREFIX}_deadbeef_${'z'.repeat(40)}`),
    )
    expect(tokened).toBe(true)
    expect(scope.forumIds).toEqual([1])
    expect(scope.viewerUserId).toBeNull()
  })

  it('yields an empty audience for a banned member’s valid token', async () => {
    state.banned = true
    state.missingActor = false
    const token = grant(42)
    const { scope, tokened } = await feedScopeForRequest(request(`?token=${token}`))
    expect(tokened).toBe(true)
    expect(scope.forumIds).toEqual([])
  })

  it('falls back to the guest scope when the member no longer exists', async () => {
    state.banned = false
    state.missingActor = true
    const token = grant(42)
    const { scope, tokened } = await feedScopeForRequest(request(`?token=${token}`))
    expect(tokened).toBe(true)
    expect(scope.forumIds).toEqual([1])
  })
})

describe('resolveFeedToken', () => {
  it('returns the member for a valid token and null for a bogus one', async () => {
    const token = grant(99)
    expect(await resolveFeedToken(token)).toBe(99)

    state.record = null
    expect(await resolveFeedToken(`${FEED_TOKEN_PREFIX}_deadbeef_${'z'.repeat(40)}`)).toBeNull()
  })
})

describe('memberFeedScope', () => {
  it('restricts content to the public states, never widening past a page view', async () => {
    state.banned = false
    state.missingActor = false
    const scope = await memberFeedScope(7)
    expect(scope?.content.states).toEqual(['visible'])
    expect(scope?.content.seesDeleted).toBe(false)
  })
})
