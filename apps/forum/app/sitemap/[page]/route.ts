import { renderSitemap } from '@/view/feed'
import { noFeed, xmlResponse } from '@/server/feed-routes'
import { SITEMAP_CHUNK, absolute, feedRepository, isIndexable, publicScope } from '@/server/syndication'

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
  const afterId = await repo.sitemapBoundaryId((chunk - 1) * SITEMAP_CHUNK, scope)
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
