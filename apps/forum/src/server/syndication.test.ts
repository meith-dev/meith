/**
 * F76's central decision: **a syndicated surface is rendered as a guest.**
 *
 * Not as whoever asked. Feeds, sitemaps and social cards are fetched by things
 * that cache one response per URL and hand it to everybody — aggregators,
 * crawlers, link unfurlers, the CDN in front of the board — so a feed built for
 * a signed-in member and cached under a shared URL is a private forum served to
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
      forumIdsWhere: async (actor: { tag: string }) => {
        asked.push(actor.tag)
        return actor.tag === 'guest' ? [1] : [1, 2]
      },
    },
  }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: 42, tag: 'member' }) }))
vi.mock('./settings', () => ({ getSettings: async () => ({ get: () => false }) }))
vi.mock('@forum/db', () => ({ getDb: () => ({}), PostgresFeedRepository: class {} }))

const { absolute, origin, publicScope } = await import('./syndication')

describe('publicScope', () => {
  it('asks the authorizer about the guest, never the request’s actor', async () => {
    /*
     * The claim, and the only place it can be checked. The mocked container
     * offers both principals and the member sees a second forum; a scope built
     * from the request's actor would carry it. Kills the mutant that calls
     * `getActor()` — which is what "just personalise the feed" looks like in a
     * diff, and which reads as an improvement.
     */
    asked.length = 0
    const scope = await publicScope()

    expect(asked).toEqual(['guest'])
    expect(scope.forumIds).toEqual([1])
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
  it('has no trailing slash, so a path is appended cleanly', () => {
    /*
     * `https://board.test//feed.xml` is a second URL for the same document,
     * published in the feed's own self-link — which is the one place a
     * duplicate is guaranteed to be followed.
     */
    expect(origin().endsWith('/')).toBe(false)
    expect(absolute('/feed.xml')).toBe(`${origin()}/feed.xml`)
  })

  it('is absolute, because a feed is read where the host is unknown', () => {
    /*
     * A relative link in a feed entry is not a shortcut, it is a broken link:
     * the reader has no idea what host served the document.
     */
    expect(absolute('/thread/1-a')).toMatch(/^https?:\/\//)
  })
})
