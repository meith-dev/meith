import { absolute, isIndexable } from '@/server/syndication'

/**
 * F76 — `robots.txt`.
 *
 * Two jobs, and the second one is the interesting half.
 *
 * **Point at the sitemap.** One line, and it is how a crawler finds the index
 * without guessing.
 *
 * **Keep crawlers off the routes that cost something and index nothing.**
 * Search (F72/F73), the discovery views (F74) and the online list (F75) are all
 * *per-request computed views of content that is already indexed elsewhere*. A
 * crawler working through `/search/<token>` re-runs a full-text query per
 * request for a page whose every result has its own indexable URL, and
 * `/discover/new` is a different page every hour, which is the definition of
 * content a crawler will keep coming back to and never settle on.
 *
 * This is **not** a security boundary and is not treated as one. Every private
 * route here is already refused server-side; `robots.txt` is a request, obeyed
 * by the crawlers that matter and ignored by everything else, and listing a
 * path in it is publishing that the path exists. That is why the private areas
 * listed are the ones anybody can find from the header anyway, and why no
 * *content* path is listed — a `Disallow: /9-secret` would be a map of
 * the board's private communities served to the whole internet.
 */
export const dynamic = 'force-dynamic'

/** Computed views: expensive to serve, and every result is indexed elsewhere. */
const COMPUTED = ['/search', '/discover', '/online', '/stats']

/** Member-specific or staff-only. Already refused server-side; listed to save the request. */
const PRIVATE = ['/usercp', '/messages', '/notifications', '/subscriptions', '/modcp', '/moderation', '/admin', '/api']

export async function GET(): Promise<Response> {
  /*
   * An offline board refuses everything. A crawler does not know a maintenance
   * page from a board — it will index it, and the board's search results become
   * its downtime notice for as long as the recrawl takes.
   */
  const body = (await isIndexable())
    ? [
        'User-agent: *',
        ...[...COMPUTED, ...PRIVATE].map((path) => `Disallow: ${path}`),
        '',
        `Sitemap: ${await absolute('/sitemap.xml')}`,
        '',
      ].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n')

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      /*
       * Short, because it carries the offline switch. A `robots.txt` cached for
       * a day would keep refusing crawlers for a day after maintenance ended.
       */
      'cache-control': 'public, max-age=300',
    },
  })
}
