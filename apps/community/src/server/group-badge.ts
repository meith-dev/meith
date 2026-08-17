import 'server-only'

import { cache } from 'react'

import { CacheTags } from '@meith/core'
import { getDb, PostgresGroupAdminRepository } from '@meith/db'
import { drivers } from '@meith/drivers'

import { getContainer } from './container'
import { forgetImage, type ImageScheme, storeImage } from './image-upload'

export const BADGE_FIELD = 'badge'

const KEY_SHAPE = /^group\/(\d+)\/badge-(light|dark)-[a-f0-9-]{36}\.(png|jpg|webp|svg)$/

function repository(): PostgresGroupAdminRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresGroupAdminRepository(getDb()) : null
}

export function badgeSrc(groupId: number, scheme: ImageScheme, key: string): string {
  return `/group/${groupId}/badge/${scheme}?v=${key.slice(-16, -4)}`
}

export const badgeKey = cache(
  async (groupId: number, scheme: ImageScheme): Promise<string | null> => {
    const repo = repository()
    if (repo === null) return null

    const group = (await repo.list().catch(() => [])).find((row) => row.id === groupId)
    const key = scheme === 'dark' ? group?.badgeImageDark : group?.badgeImageLight
    if (typeof key !== 'string' || !KEY_SHAPE.test(key)) return null

    return KEY_SHAPE.exec(key)?.[1] === String(groupId) ? key : null
  },
)

export async function saveBadge(groupId: number, scheme: ImageScheme, file: File): Promise<void> {
  const repo = requireGroups()
  const key = await storeImage(`group/${groupId}`, `badge-${scheme}`, file)

  const previous = await repo.setBadge(groupId, scheme, key)
  await invalidate()
  if (previous !== key) await forgetImage(previous)
}

export async function removeBadge(groupId: number, scheme: ImageScheme): Promise<void> {
  const previous = await requireGroups().setBadge(groupId, scheme, null)
  await invalidate()
  await forgetImage(previous)
}

function requireGroups(): PostgresGroupAdminRepository {
  const repo = repository()
  if (repo === null) {
    throw new Error('This board is running on in-memory sample data, so groups cannot be edited.')
  }
  return repo
}

async function invalidate(): Promise<void> {
  await drivers().cache.invalidateTags([CacheTags.groups()])
}
