import { describe, expect, it, vi } from 'vitest'

const asked: string[] = []

vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: 'postgres',
    actorSource: {
      buildGuest: async () => ({ userId: null, tag: 'guest' }),
      buildForUser: async () => ({ userId: 42, tag: 'member' }),
    },
    authorizer: {
      threadAudience: async (actor: { tag: string; userId: number | null }) => {
        asked.push(actor.tag)
        return {
          forumIds: actor.tag === 'guest' ? [1] : [1, 2],
          ownThreadsOnlyForumIds: actor.tag === 'guest' ? [1] : [2],
          viewerUserId: actor.userId,
        }
      },
    },
  }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: 42, tag: 'member' }) }))
vi.mock('./settings', () => ({
  getSettings: async () => ({
    get: (key: string) => (key === 'board.url' ? '' : false),
  }),
}))
vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresFeedRepository: class {} }))

const { absolute, absoluteTo, origin, publicScope } = await import('./syndication')

describe('publicScope', () => {
  it('asks the authorizer about the guest, never the request’s actor', async () => {
    asked.length = 0
    const scope = await publicScope()

    expect(asked).toEqual(['guest'])
    expect(scope.forumIds).toEqual([1])
  })

  it('carries the guest’s own-threads restriction into the feed scope', async () => {
    const scope = await publicScope()

    expect(scope.ownThreadsOnlyForumIds).toEqual([1])
    expect(scope.viewerUserId).toBeNull()
  })

  it('uses the public content states', async () => {
    const scope = await publicScope()
    expect(scope.content.states).toEqual(['visible'])
  })
})

describe('origin', () => {
  it('has no trailing slash, so a path is appended cleanly', async () => {
    const site = await origin()
    expect(site.endsWith('/')).toBe(false)
    expect(await absolute('/feed.xml')).toBe(`${site}/feed.xml`)
  })

  it('is absolute, because a feed is read where the host is unknown', async () => {
    expect(await absolute('/thread/1-a')).toMatch(/^https?:\/\//)
  })

  it('joins an already-resolved origin without resolving it again', () => {
    expect(absoluteTo('https://board.test', '/thread/1-a')).toBe('https://board.test/thread/1-a')
  })
})
