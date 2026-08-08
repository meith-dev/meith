/**
 * F76's central decision: **a syndicated surface is rendered as a guest.**
 *
 * Not as whoever asked. Feeds, sitemaps and social cards are fetched by things
 * that cache one response per URL and hand it to everybody — aggregators,
 * crawlers, link unfurlers, the CDN in front of the board — so a feed built for
 * a signed-in member and cached under a shared URL is a private community served to
 * whoever asks next. The leak happens in somebody else's cache, where nothing
 * about the request that caused it is visible.
 *
 * That makes this the one claim in the feature that a repository test cannot
 * reach: the queries are correct for whatever scope they are handed, and the
 * whole question is *which scope they are handed*.
 */
import { describe, expect, it, vi } from 'vitest'

const asked: string[] = []

/**
 * A container whose guest and member actors are distinguishable, and whose
 * authorizer records which one it was asked about.
 */
vi.mock('./container', () => ({
  getContainer: () => ({
    dataSource: 'postgres',
    actorSource: {
      buildGuest: async () => ({ userId: null, tag: 'guest' }),
      buildForUser: async () => ({ userId: 42, tag: 'member' }),
    },
    authorizer: {
      communityIdsWhere: async (actor: { tag: string }) => {
        asked.push(actor.tag)
        return actor.tag === 'guest' ? [1] : [1, 2]
      },
    },
  }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: 42, tag: 'member' }) }))
/*
 * `board.search_indexable` is the boolean this file reads; `board.url` joined it
 * when the board's address stopped being `APP_URL` alone. A blanket `() => false`
 * answered both, which was fine while every consumer wanted a boolean and became
 * a `value.trim is not a function` the moment one wanted a string.
 */
vi.mock('./settings', () => ({
  getSettings: async () => ({
    get: (key: string) => (key === 'board.url' ? '' : false),
  }),
}))
vi.mock('@meith/db', () => ({ getDb: () => ({}), PostgresFeedRepository: class {} }))

const { absolute, absoluteTo, origin, publicScope } = await import('./syndication')

describe('publicScope', () => {
  it('asks the authorizer about the guest, never the request’s actor', async () => {
    /*
     * The claim, and the only place it can be checked. The mocked container
     * offers both principals and the member sees a second community; a scope built
     * from the request's actor would carry it. Kills the mutant that calls
     * `getActor()` — which is what "just personalise the feed" looks like in a
     * diff, and which reads as an improvement.
     */
    asked.length = 0
    const scope = await publicScope()

    expect(asked).toEqual(['guest'])
    expect(scope.communityIds).toEqual([1])
  })

  it('uses the public content states', async () => {
    /*
     * Visible only. A feed carrying unapproved or deleted content would publish
     * a moderation queue, and the states are a constant here rather than a
     * derivation so there is nothing to get wrong per call site.
     */
    const scope = await publicScope()
    expect(scope.content.states).toEqual(['visible'])
  })
})

describe('origin', () => {
  it('has no trailing slash, so a path is appended cleanly', async () => {
    /*
     * `https://board.test//feed.xml` is a second URL for the same document,
     * published in the feed's own self-link — which is the one place a
     * duplicate is guaranteed to be followed.
     *
     * `async` since the board's address became a setting as well as `APP_URL`:
     * resolving it can mean a database read, so every caller awaits.
     */
    const site = await origin()
    expect(site.endsWith('/')).toBe(false)
    expect(await absolute('/feed.xml')).toBe(`${site}/feed.xml`)
  })

  it('is absolute, because a feed is read where the host is unknown', async () => {
    /*
     * A relative link in a feed entry is not a shortcut, it is a broken link:
     * the reader has no idea what host served the document.
     */
    expect(await absolute('/thread/1-a')).toMatch(/^https?:\/\//)
  })

  it('joins an already-resolved origin without resolving it again', () => {
    /*
     * The escape hatch for the sitemap, which builds hundreds of these. A route
     * that awaited each one separately would ask the same question per row.
     */
    expect(absoluteTo('https://board.test', '/thread/1-a')).toBe(
      'https://board.test/thread/1-a',
    )
  })
})
