import { canHoldThreads } from '@meith/forums'

import { getContainer } from '@/server/container'
import { activeWordFilter } from '@/server/content-admin'
import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed, offlineFeed } from '@/server/feed-routes'
import { FEED_LIMIT, feedRepository, origin, publicScope } from '@/server/syndication'
import { leadingId } from '@/view/slug-id'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const offline = await offlineFeed()
  if (offline !== null) return offline

  const repo = feedRepository()
  if (repo === null) return noFeed()

  const { slug } = await params
  const id = leadingId(slug)
  if (id === null) return noFeed()

  const scope = await publicScope()
  if (!scope.forumIds.includes(id)) return noFeed()

  const forum = await getContainer().forums.findById(id)
  if (!forum || !canHoldThreads(forum.type)) return noFeed()

  const threads = await repo.recentThreads(FEED_LIMIT, scope, id)

  const feed = feedFor(await origin(), await activeWordFilter())

  return feedResponse(
    feed.channel({
      title: forum.title,
      description: forum.description ?? '',
      path: `/${forum.id}-${forum.slug}`,
      selfPath: `/${forum.id}-${forum.slug}/feed.xml`,
      entries: threads.map(feed.threadEntry),
      now: new Date(),
    }),
    'rss',
    'forum',
  )
}
