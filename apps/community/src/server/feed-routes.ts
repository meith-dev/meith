import 'server-only'

/**
 * F76 — the shared body of every feed route.
 *
 * Four routes (board RSS, board Atom, community, thread) that differ in one read
 * and one title. Written once here so the parts that must be identical are:
 * the guest scope, the content type, the caching headers, and what happens when
 * there is no store.
 */
import { renderAtom, renderRss, type FeedChannel } from '@/view/feed'

/**
 * How long a feed may be cached.
 *
 * Five minutes at the edge, and `stale-while-revalidate` for an hour beyond
 * that. A feed is the one response on this board that is *designed* to be
 * cached by strangers — which is exactly why it is built as a guest (see
 * `syndication.ts`). Getting the two decisions consistent is the whole safety
 * argument: a cacheable response must contain nothing viewer-specific.
 */
const CACHE = 'public, max-age=300, stale-while-revalidate=3600'

export type FeedFormat = 'rss' | 'atom'

export function feedResponse(channel: FeedChannel, format: FeedFormat): Response {
  const body = format === 'atom' ? renderAtom(channel) : renderRss(channel)
  return new Response(body, {
    headers: {
      'content-type':
        format === 'atom'
          ? 'application/atom+xml; charset=utf-8'
          : 'application/rss+xml; charset=utf-8',
      'cache-control': CACHE,
    },
  })
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE },
  })
}

/**
 * What a feed route answers when it has nothing to serve.
 *
 * 404, not an empty feed. A reader subscribed to a feed that started answering
 * with zero entries would quietly show nothing for as long as the condition
 * lasted; a 404 is visible in the reader's own error list. This is the answer
 * for fixture mode (no store) and for a community a signed-out visitor may not see
 * — the same answer, deliberately, because distinguishing them would tell an
 * anonymous caller which community ids are private.
 */
export function noFeed(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
