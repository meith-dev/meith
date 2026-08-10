import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { FEED_LIMIT, feedRepository, origin, publicScope } from '@/server/syndication'

export const dynamic = 'force-dynamic'

function threadId(value: string): number | null {
  const match = /^(\d+)(?:-|$)/.exec(value)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const repo = feedRepository()
  if (repo === null) return noFeed()

  const { slug } = await params
  const id = threadId(slug)
  if (id === null) return noFeed()

  const posts = await repo.recentPosts(id, FEED_LIMIT, await publicScope())
  if (posts.length === 0) return noFeed()

  const first = posts[0]!

  const feed = feedFor(await origin())

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
  )
}
