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
      forumIdsWhere: async (actor: { tag: string }) => {
        asked.push(actor.tag)
        return actor.tag === 'guest' ? [1] : [1, 2]
      },
    },
  }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: 42, tag: 'member' }) }))
vi.mock('./settings', () => ({ getSettings: async () => ({ get: () => false }) }))
vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresFeedRepository: class {} }))

const { absolute, origin, publicScope } = await import('./syndication')

describe('publicScope', () => {
  it('asks the authorizer about the guest, never the request’s actor', async () => {
    asked.length = 0
    const scope = await publicScope()

    expect(asked).toEqual(['guest'])
    expect(scope.forumIds).toEqual([1])
  })

  it('uses the public content states', async () => {
    const scope = await publicScope()
    expect(scope.content.states).toEqual(['visible'])
  })
})

describe('origin', () => {
  it('has no trailing slash, so a path is appended cleanly', () => {
    expect(origin().endsWith('/')).toBe(false)
    expect(absolute('/feed.xml')).toBe(`${origin()}/feed.xml`)
  })

  it('is absolute, because a feed is read where the host is unknown', () => {
    expect(absolute('/thread/1-a')).toMatch(/^https?:\/\//)
  })
})
