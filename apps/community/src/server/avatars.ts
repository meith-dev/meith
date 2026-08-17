import 'server-only'

import { cache } from 'react'

import type { Actor } from '@meith/authorization'
import {
  AvatarService,
  avatarUrl,
  avatarVisible,
  NO_AVATAR,
  type StoredAvatar,
} from '@meith/avatars'
import { ForbiddenError } from '@meith/core'
import { drivers } from '@meith/drivers'
import { imageProcessor } from '@meith/drivers/images'

import { getContainer } from './container'

export const AVATAR_FIELD = 'avatar'

export function avatarService(): AvatarService | null {
  const { avatars } = getContainer()
  if (avatars === null) return null

  return new AvatarService({
    avatars,
    files: drivers().files,
    images: imageProcessor,
  })
}

export async function avatarFor(userId: number): Promise<StoredAvatar> {
  const { avatars } = getContainer()
  if (avatars === null) return NO_AVATAR
  return (await avatars.find(userId)) ?? NO_AVATAR
}

export const avatarsFor = cache(
  async (userIds: readonly number[]): Promise<ReadonlyMap<number, string>> => {
    const { avatars } = getContainer()
    if (avatars === null || userIds.length === 0) return new Map()

    const stored = await avatars.readMany(userIds)
    const urls = new Map<number, string>()
    for (const [userId, avatar] of stored) {
      const url = avatarUrl(userId, avatar)
      if (url !== null) urls.set(userId, url)
    }
    return urls
  },
)

export function canUploadAvatar(actor: Actor): boolean {
  const { authorizer } = getContainer()
  return avatarService() !== null && actor.userId !== null && authorizer.can(actor, 'avatar.upload')
}

export async function resolveAvatar(
  actor: Actor,
  userId: number,
): Promise<{ readonly key: string } | null> {
  const { avatars, authorizer } = getContainer()
  if (avatars === null) return null

  if (!authorizer.can(actor, 'profile.view')) return null

  const avatar = await avatars.find(userId)
  if (avatar === null || !avatarVisible(avatar) || avatar.key === null) return null

  return { key: avatar.key }
}

export function requireAvatarService(actor: Actor): AvatarService {
  const service = avatarService()
  if (service === null) {
    throw new ForbiddenError('This board cannot accept avatar uploads.')
  }
  if (actor.userId === null) {
    throw new ForbiddenError('You must be logged in to change your avatar.')
  }
  return service
}
