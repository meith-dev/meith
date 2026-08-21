import 'server-only'

import type { Actor } from '@meith/authorization'
import { ValidationError } from '@meith/core'
import { canHoldThreads } from '@meith/forums'
import { msg } from '@meith/i18n'

import { getContainer } from './container'

export async function requireRateablePost(
  actor: Actor,
  userId: number,
  postId: number | null,
): Promise<void> {
  if (postId === null) return

  const { authorizer, forums, posts, threads } = getContainer()
  const post = await posts.findRatingTarget(postId)
  if (post === null || post.authorUserId !== userId) {
    throw new ValidationError(msg('error.app.such-post'))
  }

  const located = await threads.locate(post.threadId)
  if (located === null) throw new ValidationError(msg('error.app.such-post'))

  const forum = await forums.findById(located.forumId)
  if (forum === null || !canHoldThreads(forum.type)) {
    throw new ValidationError(msg('error.app.such-post'))
  }

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  const target = await authorizer.moderatorTargetIn(actor, forum.id, matrix)
  if (!authorizer.can(actor, 'thread.view', { ...target, threadAuthorId: located.authorUserId })) {
    throw new ValidationError(msg('error.app.such-post'))
  }

  const thread = await threads.findById(
    post.threadId,
    authorizer.contentScope(actor, target),
    authorizer.authorFilter(actor, target),
  )
  if (thread === null) throw new ValidationError(msg('error.app.such-post'))

  const visible = await posts.locate(post.threadId, postId, {
    scope: authorizer.contentScope(actor, target),
    pageSize: 1,
  })
  if (visible === null) throw new ValidationError(msg('error.app.such-post'))
}
