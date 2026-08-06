import { channel, threadEntry } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { getSettings } from '@/server/settings'
import { FEED_LIMIT, feedRepository, publicScope } from '@/server/syndication'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const repo = feedRepository()
  if (repo === null) return noFeed()

  const scope = await publicScope()
  const threads = await repo.recentThreads(FEED_LIMIT, scope)
  const settings = await getSettings()

  return feedResponse(
    channel({
      title: settings.get('board.name'),
      description: settings.get('board.description'),
      path: '/',
      selfPath: '/feed.xml',
      entries: threads.map(threadEntry),
      now: new Date(),
    }),
    'rss',
  )
}
