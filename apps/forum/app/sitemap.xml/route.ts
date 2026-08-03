import { renderSitemapIndex } from '@/view/feed'
import { noFeed, xmlResponse } from '@/server/feed-routes'
import { SITEMAP_CHUNK, absolute, feedRepository, isIndexable, publicScope } from '@/server/syndication'

/**
 * F76 — the sitemap index.
 *
 * An **index**, not a sitemap, even on a small board. At the target data volume
 * a single document would be hundreds of thousands of URLs, and switching from
 * one shape to the other later means every crawler that cached the old one has
 * to rediscover the new — so it is an index from the first thread.
 *
 * Chunk zero is the forums; the rest are threads, keyset-paged on the id. The
 * count is the one aggregate this feature runs, once per index request, because
 * an index has to say how many chunks exist before any of them is built.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const repo = feedRepository()
  /*
   * An offline board serves no sitemap. A crawler treats a maintenance page as
   * content and will index it in place of the board — `robots.txt` refuses
   * everything for the same reason, and this is the other half of that.
   */
  if (repo === null || !(await isIndexable())) return noFeed()

  const scope = await publicScope()
  const threads = await repo.sitemapThreadCount(scope)
  const chunks = Math.max(1, Math.ceil(threads / SITEMAP_CHUNK))

  return xmlResponse(
    renderSitemapIndex([
      { loc: absolute('/sitemap/forums.xml') },
      ...Array.from({ length: chunks }, (_, index) => ({
        loc: absolute(`/sitemap/threads-${index + 1}.xml`),
      })),
    ]),
  )
}
