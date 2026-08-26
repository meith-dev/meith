import 'server-only'

import { env, PUBLIC_CONTENT } from '@meith/core'
import { type FeedScope, getDb, PostgresFeedRepository } from '@meith/db'

import type { SitemapUrl } from '@/view/feed'

import { boardUrl } from './board-url'
import { getContainer } from './container'
import { filterView } from './plugin-view'
import { getSettings } from './settings'

export const FEED_LIMIT = 30

export const SITEMAP_CHUNK = 5_000

export function feedRepository(): PostgresFeedRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresFeedRepository(getDb()) : null
}

export async function origin(): Promise<string> {
  return (await boardUrl()) || 'http://localhost:3000'
}

export function absoluteTo(base: string, path: string): string {
  return `${base}${path}`
}

export async function absolute(path: string): Promise<string> {
  return absoluteTo(await origin(), path)
}

export async function publicScope(): Promise<FeedScope> {
  const { authorizer, actorSource } = getContainer()
  const guest = await actorSource.buildGuest()

  return {
    ...(await authorizer.threadAudience(guest)),
    content: PUBLIC_CONTENT,
  }
}

export async function isIndexable(): Promise<boolean> {
  if (env.DEMO_MODE) return false

  try {
    return (await getSettings()).get('board.offline') !== true
  } catch {
    return true
  }
}

export async function filterSitemapEntries(
  urls: readonly SitemapUrl[],
  chunk: number,
): Promise<readonly SitemapUrl[]> {
  const filtered = await filterView(
    'sitemap.entries',
    urls.map((url) => ({
      href: url.loc,
      lastModified: url.lastmod?.toISOString() ?? null,
    })),
    { chunk },
  )

  return filtered.map((row) => {
    const lastmod = row.lastModified === null ? undefined : new Date(row.lastModified)
    return {
      loc: row.href,
      ...(lastmod === undefined || Number.isNaN(lastmod.getTime()) ? {} : { lastmod }),
    }
  })
}
