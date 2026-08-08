import { feedFor } from '@/server/feed-builder'
import { feedResponse, noFeed } from '@/server/feed-routes'
import { getContainer } from '@/server/container'
import { FEED_LIMIT, feedRepository, origin, publicScope } from '@/server/syndication'

/**
 * F76 — one community's feed.
 *
 * The community id is parsed the same way the community page parses it, and the answer
 * for a community a signed-out visitor may not read is **the same 404** as for a
 * community that does not exist. Distinguishing them would turn this route into an
 * oracle for which ids are private, answered without a cookie, cheaply, in a
 * loop.
 */
export const dynamic = 'force-dynamic'

function communityId(value: string): number | null {
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
  const id = communityId(slug)
  if (id === null) return noFeed()

  const scope = await publicScope()
  /*
   * The scope check comes first and is the only one: `recentThreads` intersects
   * the requested community with the scope, so a community outside it returns nothing
   * and this returns 404 — without a second permission call that could answer
   * differently from the query.
   */
  if (!scope.communityIds.includes(id)) return noFeed()

  const community = await getContainer().communities.findById(id)
  if (!community || community.type !== 'community') return noFeed()

  const threads = await repo.recentThreads(FEED_LIMIT, scope, id)

  const feed = feedFor(await origin())

  return feedResponse(
    feed.channel({
      title: community.title,
      description: community.description ?? '',
      path: `/community/${community.id}-${community.slug}`,
      selfPath: `/community/${community.id}-${community.slug}/feed.xml`,
      entries: threads.map(feed.threadEntry),
      now: new Date(),
    }),
    'rss',
  )
}
