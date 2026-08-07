import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { getSettings } from '@/server/settings'
import { FEED_LIMIT, feedRepository, origin, publicScope } from '@/server/syndication'

/**
 * F76 — the board's Atom feed.
 *
 * The same content as `/feed.xml` in the other format. Both are offered
 * because feed readers are split on which they prefer and neither is going
 * away; they share every line of their construction, so there is no second
 * feed to keep in step — only a second serialiser.
 *
 * Rendered **as a guest, always** — see `syndication.ts`. This response is
 * cached at the edge and by every aggregator that fetches it, and a
 * viewer-specific body behind a shared URL is a private forum handed to
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
      selfPath: '/atom.xml',
      entries: threads.map(feed.threadEntry),
      now: new Date(),
    }),
    'atom',
  )
}
