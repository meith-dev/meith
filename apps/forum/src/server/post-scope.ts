import 'server-only'

/**
 * F41 — one answer to "may this actor touch this post".
 *
 * Deliberately *not* in `content-actions.ts`: a `'use server'` module publishes
 * every export as a callable endpoint, and this returns a post's stored body
 * along with the permissions around it. It belongs where the page and the three
 * actions can share it without it becoming a fourth route nobody meant to open.
 */
import type { EditCapabilities, PostWriteRepository } from '@forum/posts'

import { getActor } from './context'
import { getContainer } from './container'

/**
 * Resolve the post and decide, once, what this actor may do to it.
 *
 * Shared by all three actions and by the page that renders their forms, so
 * there is one answer to "may this actor touch this post" rather than four that
 * have to be kept in step. Thread-scoped: the post id from the form is only
 * ever looked up *within* the thread the form also names, so a post id alone
 * cannot address a post in a forum the actor was never authorised against.
 */
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

  const scope = {
    forumId: target.forum.id,
    forum: await authorizer.forumMatrix(actor, target.forum.id),
    ownerId: target.post.authorUserId,
  }
  // The existence of a post in a forum you cannot read is not something to
  // confirm — same answer an invisible forum gives everywhere else.
  if (!authorizer.can(actor, 'thread.view', scope)) return null

  const isOwn =
    actor.userId !== null && target.post.authorUserId === actor.userId
  /*
   * `post.editOthers` is refused to the post's own author by design (see the
   * Authorizer), so an author who is also a moderator is asked the *own*
   * question — and gets the window that goes with it unless they hold the
   * moderation bypass separately.
   */
  const editsOthers = authorizer.can(actor, 'post.editOthers', scope)
  const moderates = authorizer.can(actor, 'content.viewUnapproved', scope)
  const softDeletes = authorizer.can(actor, 'post.softDelete', scope)

  return {
    target,
    isOwn,
    mayEdit: isOwn ? authorizer.can(actor, 'post.editOwn', scope) : editsOthers,
    mayDelete: isOwn
      ? authorizer.can(actor, 'post.deleteOwn', scope) || softDeletes
      : softDeletes,
    mayRestore: softDeletes && authorizer.can(actor, 'content.viewDeleted', scope),
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
