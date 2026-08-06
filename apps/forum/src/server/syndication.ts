import 'server-only'

import { PUBLIC_CONTENT, env } from '@meith/core'
import { PostgresFeedRepository, getDb, type FeedScope } from '@meith/db'

import { getContainer } from './container'
import { getSettings } from './settings'

export const FEED_LIMIT = 30

export const SITEMAP_CHUNK = 5_000

export function feedRepository(): PostgresFeedRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresFeedRepository(getDb()) : null
}

export function origin(): string {
  return (env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export function absolute(path: string): string {
  return `${origin()}${path}`
}

export async function publicScope(): Promise<FeedScope> {
  const { authorizer, actorSource } = getContainer()
  const guest = await actorSource.buildGuest()

  return {
    forumIds: await authorizer.forumIdsWhere(guest, 'thread.view'),
    content: PUBLIC_CONTENT,
  }
}

export async function isIndexable(): Promise<boolean> {
  try {
    return (await getSettings()).get('board.offline') !== true
  } catch {
    return true
  }
}
