import { activeWordFilter } from '@/server/content-admin'
import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed, offlineFeed } from '@/server/feed-routes'
import { feedScopeForRequest } from '@/server/feed-token'
import { FEED_LIMIT, feedRepository, origin } from '@/server/syndication'
import { leadingId } from '@/view/slug-id'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const offline = await offlineFeed()
  if (offline !== null) return offline

  const repo = feedRepository()
  if (repo === null) return noFeed()

  const { slug } = await params
  const id = leadingId(slug)
  if (id === null) return noFeed()

  const { scope, tokened } = await feedScopeForRequest(request)
  const posts = await repo.recentPosts(id, FEED_LIMIT, scope)
  if (posts.length === 0) return noFeed()

  const first = posts[0]!

  const feed = feedFor(await origin(), await activeWordFilter())

  return feedResponse(
    feed.channel({
      title: first.threadTitle,
      description: `Replies to ${first.threadTitle}`,
      path: `/thread/${first.threadId}-${first.threadSlug}`,
      selfPath: `/thread/${first.threadId}-${first.threadSlug}/feed.xml`,
      entries: posts.map(feed.postEntry),
      now: new Date(),
    }),
    'rss',
    'thread',
    { private: tokened },
  )
}
