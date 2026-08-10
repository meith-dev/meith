import 'server-only'

import { PUBLIC_CONTENT } from '@meith/core'
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
