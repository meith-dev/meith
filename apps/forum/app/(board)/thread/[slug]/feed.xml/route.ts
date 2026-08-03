import { channel, postEntry } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { FEED_LIMIT, feedRepository, publicScope } from '@/server/syndication'

/**
 * F76 — one thread's feed.
 *
 * The only feed whose entries are **posts**, because here the unit of interest
 * genuinely is the post: somebody subscribed to a thread wants each reply, not
 * one entry that changes under them.
 *
 * The thread's own visibility is checked inside the query rather than here. A
 * feed URL is a bare id, and answering it because the *posts* are visible would
 * publish a thread that is not — so `recentPosts` filters on both, and an empty
 * result is a 404 either way.
 */
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
  /*
   * No visible posts is a 404, not an empty feed. It is also the answer for a
   * thread in a private forum and for a thread that never existed — the same
   * answer, so this route cannot be used to enumerate either.
   */
  if (posts.length === 0) return noFeed()

  const first = posts[0]!

  return feedResponse(
    channel({
      title: first.threadTitle,
      description: `Replies to ${first.threadTitle}`,
      path: `/thread/${first.threadId}-${first.threadSlug}`,
      selfPath: `/thread/${first.threadId}-${first.threadSlug}/feed.xml`,
      entries: posts.map(postEntry),
      now: new Date(),
    }),
    'rss',
  )
}
