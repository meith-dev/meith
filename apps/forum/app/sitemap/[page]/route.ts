import { renderSitemap } from '@/view/feed'
import { noFeed, xmlResponse } from '@/server/feed-routes'
import { SITEMAP_CHUNK, absolute, feedRepository, isIndexable, publicScope } from '@/server/syndication'

/**
 * F76 — one chunk of the sitemap.
 *
 * `/sitemap/forums.xml` and `/sitemap/threads-<n>.xml`, both named by the index
 * rather than discovered. A crawler works through the chunks over hours or
 * days, so the pages have to be **stable while it does**: the thread chunks are
 * keyset-paged on the id, ascending, because ordering by activity would move
 * the boundary every time somebody posted and make the crawl skip threads and
 * revisit others.
 *
 * The keyset here is derived from the page number rather than carried in the
 * URL, which is the one place on this board where paging is not a cursor. It
 * has to be: the index names the chunks, and a cursor the index cannot compute
 * would mean generating every chunk to build the index.
 */
export const dynamic = 'force-dynamic'

const THREADS = /^threads-([1-9]\d*)\.xml$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> },
): Promise<Response> {
  const repo = feedRepository()
  if (repo === null || !(await isIndexable())) return noFeed()

  const { page } = await params
  const scope = await publicScope()

  if (page === 'forums.xml') {
    const forums = await repo.sitemapForums(scope)
    return xmlResponse(
      renderSitemap(
        forums.map((forum) => ({
          loc: absolute(`/forum/${forum.forumId}-${forum.slug}`),
          ...(forum.lastPostAt === null ? {} : { lastmod: forum.lastPostAt }),
        })),
      ),
    )
  }

  const match = THREADS.exec(page)
  if (match === null) return noFeed()

  const chunk = Number(match[1])
  /*
   * Chunk n starts after the ((n-1) × size)th thread by position. That is the
   * one OFFSET on this board, explained where it lives: the index names the
   * chunks by number, so a chunk must find its own start from the number alone.
   * It fetches a single id, and the page itself is keyset-paged from there like
   * everything else.
   */
  const afterId = await repo.sitemapBoundaryId((chunk - 1) * SITEMAP_CHUNK, scope)
  /*
   * Null means the skip ran off the end — there is no such chunk. It has to be
   * distinguishable from zero, or `/sitemap/threads-99.xml` would answer with
   * the *first* chunk's threads: the same content under a second URL, published
   * to crawlers by the document whose job is telling them what to crawl.
   */
  if (afterId === null) return noFeed()

  const threads = await repo.sitemapThreads(afterId, SITEMAP_CHUNK, scope)
  if (threads.length === 0) return noFeed()

  return xmlResponse(
    renderSitemap(
      threads.map((thread) => ({
        loc: absolute(`/thread/${thread.threadId}-${thread.slug}`),
        lastmod: thread.lastPostAt,
      })),
    ),
  )
}
