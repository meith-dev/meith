import 'server-only'

/**
 * F58's avatars at the app layer.
 *
 * The same three jobs `attachments.ts` has, and they are here rather than there
 * because the permission is a different one: `avatar.upload` is global, and
 * seeing somebody's avatar is `profile.view` rather than anything community-scoped.
 * An avatar appears in a member list and on a profile, not only under a post.
 */
import { ForbiddenError } from '@meith/core'
import type { Actor } from '@meith/authorization'
import {
  AvatarService,
  NO_AVATAR,
  avatarUrl,
  avatarVisible,
  type StoredAvatar,
} from '@meith/avatars'
import { imageProcessor } from '@meith/drivers/images'
import { drivers } from '@meith/drivers'
import { cache } from 'react'

import { getContainer } from './container'

/** The form field the avatar screen's file input uses. */
export const AVATAR_FIELD = 'avatar'

/**
 * The board's avatar service, or null when it cannot have one.
 *
 * Null in fixture mode (D38). Answered before a byte is accepted, not after —
 * an upload that validates and stores and then finds there is nowhere to record
 * it is the worst of the three outcomes.
 */
export function avatarService(): AvatarService | null {
  const { avatars } = getContainer()
  if (avatars === null) return null

  return new AvatarService({
    avatars,
    files: drivers().files,
    images: imageProcessor,
  })
}

/** One member's avatar, or the "never uploaded one" state. */
export async function avatarFor(userId: number): Promise<StoredAvatar> {
  const { avatars } = getContainer()
  if (avatars === null) return NO_AVATAR
  return (await avatars.find(userId)) ?? NO_AVATAR
}

/**
 * Every avatar on a page of postbits, in one query, memoised per request.
 *
 * `React.cache` because a thread page resolves the same handful of authors for
 * the postbit and again for anything else that wants them, and the second call
 * should not be a second query.
 */
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

/** Whether the UserCP should offer the control at all. */
export function canUploadAvatar(actor: Actor): boolean {
  const { authorizer } = getContainer()
  return (
    avatarService() !== null &&
    actor.userId !== null &&
    authorizer.can(actor, 'avatar.upload')
  )
}

/**
 * Resolve one member's avatar for serving, or say no.
 *
 * Every refusal is null with no reason, for `attachments.ts`'s reason: the id
 * is a small integer anybody can enumerate, and distinguishing "no avatar" from
 * "not for you" would make the route an oracle for who exists on a board whose
 * member list is closed.
 */
export async function resolveAvatar(
  actor: Actor,
  userId: number,
): Promise<{ readonly key: string } | null> {
  const { avatars, authorizer } = getContainer()
  if (avatars === null) return null

  /*
   * `profile.view` and not a community permission. An avatar is shown in a member
   * list and on a profile as well as under a post, so the community a thread
   * happens to be in cannot be the thing that decides it.
   */
  if (!authorizer.can(actor, 'profile.view')) return null

  const avatar = await avatars.find(userId)
  if (avatar === null || !avatarVisible(avatar) || avatar.key === null) return null

  return { key: avatar.key }
}

/** The service, or a refusal that says why. Used by both write actions. */
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
