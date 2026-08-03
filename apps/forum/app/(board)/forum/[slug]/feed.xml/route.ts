import { channel, threadEntry } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { getContainer } from '@/server/container'
import { FEED_LIMIT, feedRepository, publicScope } from '@/server/syndication'

/**
 * F76 — one forum's feed.
 *
 * The forum id is parsed the same way the forum page parses it, and the answer
 * for a forum a signed-out visitor may not read is **the same 404** as for a
 * forum that does not exist. Distinguishing them would turn this route into an
 * oracle for which ids are private, answered without a cookie, cheaply, in a
 * loop.
 */
export const dynamic = 'force-dynamic'

function forumId(value: string): number | null {
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
  const id = forumId(slug)
  if (id === null) return noFeed()

  const scope = await publicScope()
  /*
   * The scope check comes first and is the only one: `recentThreads` intersects
   * the requested forum with the scope, so a forum outside it returns nothing
   * and this returns 404 — without a second permission call that could answer
   * differently from the query.
   */
  if (!scope.forumIds.includes(id)) return noFeed()

  const forum = await getContainer().forums.findById(id)
  if (!forum || forum.type !== 'forum') return noFeed()

  const threads = await repo.recentThreads(FEED_LIMIT, scope, id)

  return feedResponse(
    channel({
      title: forum.title,
      description: forum.description ?? '',
      path: `/forum/${forum.id}-${forum.slug}`,
      selfPath: `/forum/${forum.id}-${forum.slug}/feed.xml`,
      entries: threads.map(threadEntry),
      now: new Date(),
    }),
    'rss',
  )
}
