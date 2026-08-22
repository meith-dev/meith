import 'server-only'

import type { Actor } from '@meith/authorization'
import { type EditCapabilities, PostEditor, type PostWriteRepository } from '@meith/posts'

import { getContainer } from './container'
import { getActor } from './context'
import { moderatorTargetFor } from './modcp'
import { getSettings } from './settings'

export interface PostManageScope {
  readonly target: NonNullable<Awaited<ReturnType<PostWriteRepository['findEditTarget']>>>
  readonly isOwn: boolean
  readonly mayEdit: boolean
  readonly mayDelete: boolean
  readonly mayRestore: boolean
  readonly mayViewHistory: boolean
  readonly mayRollback: boolean
  readonly capabilities: EditCapabilities
  readonly bypassesLock: boolean
}

export async function resolvePostScope(
  threadId: number,
  postId: number,
  viewer?: Actor,
): Promise<PostManageScope | null> {
  const actor = viewer ?? (await getActor())
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
  const seesUnapproved = authorizer.can(actor, 'content.viewUnapproved', scope)
  const seesDeleted = authorizer.can(actor, 'content.viewDeleted', scope)
  const staffCanSeePost =
    editsOthers &&
    (target.post.visibility === 'visible' ||
      (target.post.visibility === 'unapproved' && seesUnapproved) ||
      (target.post.visibility === 'deleted' && seesDeleted))

  return {
    target,
    isOwn,
    mayEdit: isOwn ? authorizer.can(actor, 'post.editOwn', scope) : editsOthers,
    mayDelete: isOwn ? authorizer.can(actor, 'post.deleteOwn', scope) || softDeletes : softDeletes,
    mayRestore:
      authorizer.can(actor, 'post.restore', scope) &&
      authorizer.can(actor, 'content.viewDeleted', scope),
    mayViewHistory:
      (isOwn && target.post.visibility === 'visible') || staffCanSeePost,
    mayRollback: staffCanSeePost && target.post.visibility !== 'deleted',
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

export async function postEditor(posts: PostWriteRepository): Promise<PostEditor> {
  const settings = await getSettings()

  return new PostEditor({
    posts,
    config: {
      maxLength: settings.get('posting.max_length'),
      editGraceSeconds: settings.get('posting.edit_grace_seconds'),
    },
  })
}
