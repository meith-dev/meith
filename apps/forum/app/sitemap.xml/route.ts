import { renderSitemapIndex } from '@/view/feed'
import { noFeed, xmlResponse } from '@/server/feed-routes'
import { SITEMAP_CHUNK, absolute, feedRepository, isIndexable, publicScope } from '@/server/syndication'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const repo = feedRepository()
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
