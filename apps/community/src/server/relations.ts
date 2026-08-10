import 'server-only'

import { cache } from 'react'

import { RelationService } from '@meith/relations'

import { getContainer } from './container'
import { getActor } from './context'

export function relationService(): RelationService | null {
  const { relations } = getContainer()
  return relations === null ? null : new RelationService({ relations })
}

export const viewerIgnoredIds = cache(async (): Promise<ReadonlySet<number>> => {
  const service = relationService()
  const actor = await getActor()
  if (service === null || actor.userId === null) return new Set()

  try {
    return new Set(await service.ignoredIds(actor.userId))
  } catch {
    return new Set()
  }
})

export async function isStaff(userId: number): Promise<boolean> {
  const { actorSource, authorizer } = getContainer()
  const actor = await actorSource.buildForUser(userId)
  if (actor === null) return false
  return authorizer.can(actor, 'modcp.access')
}

const ACTIVITY_WINDOW_SECONDS = 300

export async function touchActivity(userId: number | null): Promise<void> {
  if (userId === null) return

  try {
    const { accountStore } = getContainer()
    await accountStore.accounts.touchLastActive(userId, new Date(), ACTIVITY_WINDOW_SECONDS)
  } catch {
    /* ignore */
  }
}
