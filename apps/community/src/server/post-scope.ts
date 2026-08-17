import 'server-only'

import type { EditCapabilities, PostWriteRepository } from '@meith/posts'

import { getContainer } from './container'
import { getActor } from './context'
import { moderatorTargetFor } from './modcp'

export interface PostManageScope {
  readonly target: NonNullable<Awaited<ReturnType<PostWriteRepository['findEditTarget']>>>
  readonly isOwn: boolean
  readonly mayEdit: boolean
  readonly mayDelete: boolean
  readonly mayRestore: boolean
  readonly capabilities: EditCapabilities
  readonly bypassesLock: boolean
}

export async function resolvePostScope(
  threadId: number,
  postId: number,
): Promise<PostManageScope | null> {
  const actor = await getActor()
  const { authorizer, postWrites } = getContainer()
  if (postWrites === null) return null

  const target = await postWrites.findEditTarget(threadId, postId)
  if (!target) return null

  const matrix = await authorizer.forumMatrix(actor, target.forum.id)
  const scope = {
    ...(await moderatorTargetFor(actor, target.forum.id, matrix)),
    ownerId: target.post.authorUserId,
  }
  if (!authorizer.can(actor, 'thread.view', scope)) return null

  const isOwn = actor.userId !== null && target.post.authorUserId === actor.userId
  const editsOthers = authorizer.can(actor, 'post.editOthers', scope)
  const moderates = authorizer.can(actor, 'content.viewUnapproved', scope)
  const softDeletes = authorizer.can(actor, 'post.softDelete', scope)

  return {
    target,
    isOwn,
    mayEdit: isOwn ? authorizer.can(actor, 'post.editOwn', scope) : editsOthers,
    mayDelete: isOwn ? authorizer.can(actor, 'post.deleteOwn', scope) || softDeletes : softDeletes,
    mayRestore:
      authorizer.can(actor, 'post.restore', scope) &&
      authorizer.can(actor, 'content.viewDeleted', scope),
    bypassesLock: moderates,
    capabilities: {
      isOwn,
      editWindowMinutes: Number(scope.forum.editTimeLimitMinutes ?? 0),
      bypassesWindow: editsOthers || moderates,
      bypassesLock: moderates,
      requiresApprovalOnEdit: scope.forum.requiresApprovalOnEdit === true,
      bypassesModeration: moderates,
    },
  }
}
