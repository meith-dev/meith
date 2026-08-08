import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { getSettings } from '@/server/settings'
import { FEED_LIMIT, feedRepository, origin, publicScope } from '@/server/syndication'

/**
 * F76 — the board's RSS feed.
 *
 * Threads rather than posts: an entry per thread, keyed on the thread and
 * summarised from its opening post, so a busy conversation is one line in a
 * reader rather than forty. F74 made the same choice for the same reason.
 *
 * Rendered **as a guest, always** — see `syndication.ts`. This response is
 * cached at the edge and by every aggregator that fetches it, and a
 * viewer-specific body behind a shared URL is a private community handed to
 * whoever asks next.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const repo = feedRepository()
  if (repo === null) return noFeed()

  const scope = await publicScope()
  const threads = await repo.recentThreads(FEED_LIMIT, scope)
  const settings = await getSettings()

  const feed = feedFor(await origin())

  return feedResponse(
    feed.channel({
      title: settings.get('board.name'),
      description: settings.get('board.description'),
      path: '/',
      selfPath: '/feed.xml',
      entries: threads.map(feed.threadEntry),
      now: new Date(),
    }),
    'rss',
  )
}
