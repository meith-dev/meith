/**
 * F75 — what a session records about where somebody is.
 *
 * `parseLocation` is the only part of the presence writer that decides
 * anything, and what it decides is what goes into a table an online list reads.
 * Two claims:
 *
 *  - **the query string never lands in the row.** A stored search's token, a
 *    moderation filter and a page number all live there, and none of them are
 *    things to keep beside somebody's name;
 *  - **an unrecognised path is still a path**, not a refusal — "somewhere on
 *    the board" is what the list shows for a member reading their own settings,
 *    and it is true.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresPresenceRepository: class {} }))

const { parseLocation } = await import('./presence')

describe('parseLocation', () => {
  it('reads the community id out of a community path', () => {
    expect(parseLocation('/community/12-news')).toEqual({
      path: '/community/12-news',
      communityId: 12,
      threadId: null,
    })
  })

  it('reads the thread id out of a thread path', () => {
    expect(parseLocation('/thread/34-hello')).toEqual({
      path: '/thread/34-hello',
      communityId: null,
      threadId: 34,
    })
  })

  it('drops the query string', () => {
    /*
     * The claim that matters most. Kills the mutant that stores the path as
     * given: `/search/abc123?rank=…` beside somebody's name in a table the
     * online list reads is a search token in front of everybody.
     */
    expect(parseLocation('/search/abc123?rank=0.4')?.path).toBe('/search/abc123')
    expect(parseLocation('/thread/34-hello?post=9')).toEqual({
      path: '/thread/34-hello',
      communityId: null,
      threadId: 34,
    })
  })

  it('keeps an unrecognised path with no ids', () => {
    expect(parseLocation('/usercp/options')).toEqual({
      path: '/usercp/options',
      communityId: null,
      threadId: null,
    })
  })

  it('refuses to invent an id from a path that only looks like one', () => {
    /*
     * The route wants `<id>-<slug>`, so `/community/12` is a 404 — and recording
     * somebody as reading a community whose page they were never shown is a claim
     * the board cannot support. Kills the mutant that drops the trailing hyphen.
     */
    expect(parseLocation('/community/12')?.communityId).toBeNull()
    expect(parseLocation('/thread/34')?.threadId).toBeNull()
    expect(parseLocation('/communities/12-news')?.communityId).toBeNull()
    expect(parseLocation('/community/abc-news')?.communityId).toBeNull()
  })

  it('matches only at the start of the path', () => {
    /*
     * Kills the mutant that drops the anchor. An admin screen *about* a community
     * is not somebody reading it, and the online list saying otherwise would
     * put a moderator in a community they are administering rather than viewing.
     */
    expect(parseLocation('/admin/communities/12-news')?.communityId).toBeNull()
    expect(parseLocation('/redirect/thread/34-hello')?.threadId).toBeNull()
  })

  it('answers null when there is no path at all', () => {
    /* No header means the proxy did not run — nothing to record, not a blank. */
    expect(parseLocation(null)).toBeNull()
    expect(parseLocation('')).toBeNull()
  })
})
