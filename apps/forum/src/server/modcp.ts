import 'server-only'

import {
  hasAnyModeratorRight,
  type Actor,
  type ModeratorRights,
} from '@meith/authorization'

import { getActor } from './context'
import { getContainer } from './container'

export interface ModCpAccess {
  readonly actor: Actor
  readonly userId: number
  readonly forumIds: readonly number[]
  readonly hasGroupAccess: boolean
  readonly canWarn: boolean
  readonly canLookUpIp: boolean
}

export async function resolveModCpAccess(): Promise<ModCpAccess | null> {
  const actor = await getActor()
  const { authorizer, modcp } = getContainer()

  if (modcp === null || actor.userId === null) return null

  const hasGroupAccess = authorizer.can(actor, 'modcp.access')
  const forumIds = await authorizer.moderatedForumIds(actor)
  if (!hasGroupAccess && forumIds.length === 0) return null

  return {
    actor,
    userId: actor.userId,
    forumIds,
    hasGroupAccess,
    canWarn: getContainer().warnings !== null && authorizer.can(actor, 'user.warn'),
    canLookUpIp:
      actor.global.isAdministrator === true || actor.global.isSuperModerator === true,
  }
}

export interface ModeratedForumRights {
  readonly forumId: number
  readonly title: string
  readonly slug: string
  readonly rights: readonly string[]
}

const RIGHT_LABELS: Readonly<Record<keyof ModeratorRights, string>> = {
  canApproveContent: 'Approve content',
  canEditPosts: 'Edit posts',
  canSoftDeletePosts: 'Delete and restore',
  canRestorePosts: 'Restore posts',
  canOpenCloseThreads: 'Lock and unlock',
  canStickThreads: 'Pin and unpin',
  canMoveThreads: 'Move threads',
  canMergeThreads: 'Merge threads',
  canSplitThreads: 'Split threads',
}

export async function moderatedForumRights(
  access: ModCpAccess,
): Promise<readonly ModeratedForumRights[]> {
  const { authorizer, forums } = getContainer()
  const rows = await forums.listListing()

  const resolved = await Promise.all(
    access.forumIds.map(async (forumId): Promise<ModeratedForumRights | null> => {
      const row = rows.find((r) => r.id === forumId)
      if (row === undefined || row.type !== 'forum') return null
      const rights = await authorizer.moderatorRightsIn(access.actor, forumId)
      return {
        forumId,
        title: row.title,
        slug: row.slug,
        rights: (Object.keys(RIGHT_LABELS) as (keyof ModeratorRights)[])
          .filter((key) => rights[key])
          .map((key) => RIGHT_LABELS[key]),
      }
    }),
  )

  return resolved.filter((row): row is ModeratedForumRights => row !== null)
}

export async function moderatorTargetFor(
  actor: Actor,
  forumId: number,
  forum: Awaited<ReturnType<ReturnType<typeof getContainer>['authorizer']['forumMatrix']>>,
): Promise<{
  forumId: number
  forum: typeof forum
  moderatorRights: ModeratorRights
  isForumModerator: boolean
}> {
  const { authorizer } = getContainer()
  const moderatorRights = await authorizer.moderatorRightsIn(actor, forumId)
  return {
    forumId,
    forum,
    moderatorRights,
    isForumModerator: hasAnyModeratorRight(moderatorRights),
  }
}
