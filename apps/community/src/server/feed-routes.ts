import 'server-only'

import { renderAtom, renderRss, type FeedChannel } from '@/view/feed'

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

export function noFeed(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
