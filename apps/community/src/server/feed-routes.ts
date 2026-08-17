import 'server-only'

import { type FeedChannel, renderAtom, renderRss } from '@/view/feed'

import { boardOffline } from './board-offline'
import { activeWordFilter } from './content-admin'
import { feedFor } from './feed-builder'
import { getSettings } from './settings'
import { FEED_LIMIT, feedRepository, origin, publicScope } from './syndication'

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

export async function offlineFeed(): Promise<Response | null> {
  const offline = await boardOffline()
  if (offline === null) return null

  return new Response(offline.message, {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function boardFeed(format: FeedFormat, selfPath: string): Promise<Response> {
  const offline = await offlineFeed()
  if (offline !== null) return offline

  const repo = feedRepository()
  if (repo === null) return noFeed()

  const scope = await publicScope()
  const threads = await repo.recentThreads(FEED_LIMIT, scope)
  const settings = await getSettings()

  const feed = feedFor(await origin(), await activeWordFilter())

  return feedResponse(
    feed.channel({
      title: settings.get('board.name'),
      description: settings.get('board.description'),
      path: '/',
      selfPath,
      entries: threads.map(feed.threadEntry),
      now: new Date(),
    }),
    format,
  )
}

export function noFeed(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
