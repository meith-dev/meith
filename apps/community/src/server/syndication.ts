import 'server-only'

import { PUBLIC_CONTENT, env } from '@meith/core'
import { PostgresFeedRepository, getDb, type FeedScope } from '@meith/db'

import { boardUrl } from './board-url'
import { getContainer } from './container'
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
  // A demo is never indexable. Its content is thrown away every hour, so half of
  // what a crawler stored is already a 404, and the half that is not is whatever
  // an anonymous visitor typed into a board carrying the project's own domain.
  if (env.DEMO_MODE) return false

  try {
    return (await getSettings()).get('board.offline') !== true
  } catch {
    return true
  }
}
