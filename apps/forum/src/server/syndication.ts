import 'server-only'

/**
 * F76 — the public surfaces, and the one rule that governs all of them.
 *
 * ## Every syndicated surface is rendered as a guest
 *
 * Not "as whoever asked". Feeds, sitemaps and social metadata are fetched by
 * things that **cache one response per URL and hand it to everybody**:
 * aggregators, crawlers, link unfurlers, corporate proxies, the CDN in front of
 * this board. A feed built for a signed-in member and cached under a shared URL
 * is a private forum served to whoever asks next, and nothing in the request
 * makes that visible — the leak happens in somebody else's cache.
 *
 * So the scope here comes from `actorSource.buildGuest()`, deliberately, even
 * when a member's cookie is on the request. The cost is stated plainly on the
 * screens that link to a feed: a feed shows what a signed-out visitor would
 * see. That is a smaller loss than the alternative, and it is the only version
 * that is safe to cache — which is what makes a feed a feed.
 *
 * ## Everything else follows the model
 *
 * The guest scope is built the same way every other read builds one: forum ids
 * from `Authorizer.forumIdsWhere`, states from `contentScope`. There is no
 * second definition of "public" anywhere in this file, which is the point —
 * F47's guard has never had a feed to fire on until now, and this is the shape
 * that keeps it quiet for the right reason.
 */
import { PUBLIC_CONTENT, env } from '@forum/core'
import { PostgresFeedRepository, getDb, type FeedScope } from '@forum/db'

import { getContainer } from './container'
import { getSettings } from './settings'

/** Entries in a feed. Bounded: a feed is a window, not an archive. */
export const FEED_LIMIT = 30

/**
 * URLs per sitemap chunk.
 *
 * The specification's limit is 50,000 and 50 MB uncompressed. This is well
 * under both, because the ceiling that actually binds is the serverless
 * response: building 50,000 URLs in one invocation is a memory profile nobody
 * has measured on the target data volume, and a crawler does not care how many
 * chunks there are.
 */
export const SITEMAP_CHUNK = 5_000

export function feedRepository(): PostgresFeedRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresFeedRepository(getDb()) : null
}

/**
 * The board's absolute origin, for the absolute URLs feeds and sitemaps need.
 *
 * A feed entry's link is read in an application that has no idea what host
 * served the document, so a relative URL there is not a shortcut, it is a
 * broken link. `APP_URL` is optional in the environment schema, and the
 * fallback is a localhost origin rather than an empty string: a feed with
 * obviously-local URLs in a development build is diagnosable, and one with
 * `href=""` is not.
 */
export function origin(): string {
  return (env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export function absolute(path: string): string {
  return `${origin()}${path}`
}

/**
 * What a signed-out visitor may read.
 *
 * Built from the guest principal rather than from the request's actor. See the
 * header: this is the decision the whole feature rests on, so it is one
 * function and every emitter calls it.
 */
export async function publicScope(): Promise<FeedScope> {
  const { authorizer, actorSource } = getContainer()
  const guest = await actorSource.buildGuest()

  return {
    forumIds: await authorizer.forumIdsWhere(guest, 'thread.view'),
    /*
     * `PUBLIC_CONTENT` rather than a scope derived from the guest, because they
     * are the same thing and the constant says so. A guest sees visible content
     * and nothing else; deriving it would invite a future argument about
     * whether some guest somewhere might see more.
     */
    content: PUBLIC_CONTENT,
  }
}

/**
 * Is this board indexable at all?
 *
 * An offline board (F08's `board.offline`) is not a temporary error to a
 * crawler — it is a page, and one it will happily index in place of the real
 * one. `robots.txt` refuses everything while the board is offline, which is the
 * one lever that stops a maintenance window becoming the board's search
 * results for the next month.
 */
export async function isIndexable(): Promise<boolean> {
  try {
    return (await getSettings()).get('board.offline') !== true
  } catch {
    /*
     * A settings read that failed says nothing about whether the board is
     * offline. Answering "indexable" is the honest default: the board is
     * serving pages, and refusing every crawler because one read failed is a
     * self-inflicted deindexing.
     */
    return true
  }
}
