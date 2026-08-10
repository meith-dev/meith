import { describe, expect, it, vi } from 'vitest'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresPresenceRepository: class {} }))

const { parseLocation } = await import('./presence')

describe('parseLocation', () => {
  it('reads the forum id out of a forum path', () => {
    expect(parseLocation('/12-news')).toEqual({
      path: '/12-news',
      forumId: 12,
      threadId: null,
    })
    expect(parseLocation('/12')?.forumId).toBe(12)
    expect(parseLocation('/12-news/new')?.forumId).toBe(12)
  })

  it('reads the thread id out of a thread path', () => {
    expect(parseLocation('/thread/34-hello')).toEqual({
      path: '/thread/34-hello',
      forumId: null,
      threadId: 34,
    })
  })

  it('drops the query string', () => {
    expect(parseLocation('/search/abc123?rank=0.4')?.path).toBe('/search/abc123')
    expect(parseLocation('/thread/34-hello?post=9')).toEqual({
      path: '/thread/34-hello',
      forumId: null,
      threadId: 34,
    })
  })

  it('keeps an unrecognised path with no ids', () => {
    expect(parseLocation('/usercp/options')).toEqual({
      path: '/usercp/options',
      forumId: null,
      threadId: null,
    })
  })

  it('refuses to invent an id from a path that only looks like one', () => {
    expect(parseLocation('/thread/34')?.threadId).toBeNull()
    expect(parseLocation('/12news')?.forumId).toBeNull()
    expect(parseLocation('/abc-news')?.forumId).toBeNull()
  })

  it('matches only at the start of the path', () => {
    expect(parseLocation('/admin/forums/12-news')?.forumId).toBeNull()
    expect(parseLocation('/redirect/thread/34-hello')?.threadId).toBeNull()
  })

  it('answers null when there is no path at all', () => {
    expect(parseLocation(null)).toBeNull()
    expect(parseLocation('')).toBeNull()
  })
})
