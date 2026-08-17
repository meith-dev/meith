import { noFeed, xmlResponse } from '@/server/feed-routes'
import {
  absoluteTo,
  feedRepository,
  isIndexable,
  origin,
  publicScope,
  SITEMAP_CHUNK,
} from '@/server/syndication'
import { renderSitemapIndex } from '@/view/feed'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const repo = feedRepository()
  if (repo === null || !(await isIndexable())) return noFeed()

  const scope = await publicScope()
  const threads = await repo.sitemapThreadCount(scope)
  const chunks = Math.max(1, Math.ceil(threads / SITEMAP_CHUNK))
  const site = await origin()

  return xmlResponse(
    renderSitemapIndex([
      { loc: absoluteTo(site, '/sitemap/forums.xml') },
      ...Array.from({ length: chunks }, (_, index) => ({
        loc: absoluteTo(site, `/sitemap/threads-${index + 1}.xml`),
      })),
    ]),
  )
}
