import { noFeed, xmlResponse } from '@/server/feed-routes'
import {
  absoluteTo,
  feedRepository,
  filterSitemapEntries,
  isIndexable,
  origin,
  publicScope,
  SITEMAP_CHUNK,
} from '@/server/syndication'
import { renderSitemap } from '@/view/feed'

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
  const site = await origin()

  if (page === 'forums.xml') {
    const forums = await repo.sitemapForums(scope)
    return xmlResponse(
      renderSitemap(
        await filterSitemapEntries(
          forums.map((forum) => ({
            loc: absoluteTo(site, `/${forum.forumId}-${forum.slug}`),
            ...(forum.lastPostAt === null ? {} : { lastmod: forum.lastPostAt }),
          })),
          0,
        ),
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
      await filterSitemapEntries(
        threads.map((thread) => ({
          loc: absoluteTo(site, `/thread/${thread.threadId}-${thread.slug}`),
          lastmod: thread.lastPostAt,
        })),
        chunk,
      ),
    ),
  )
}
