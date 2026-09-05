import 'server-only'

import type { Actor } from '@meith/authorization'
import { canHoldThreads } from '@meith/forums'
import type { PollEditCapabilities } from '@meith/polls'

import { getContainer } from './container'
import { moderatorTargetFor } from './modcp'

export interface PollScope {
  readonly forumId: number
  readonly threadAuthorId: number | null
  readonly mayVote: boolean
  readonly mayEdit: boolean
  readonly capabilities: PollEditCapabilities
}

export async function resolvePollScope(actor: Actor, threadId: number): Promise<PollScope | null> {
  const { authorizer, forums, threads } = getContainer()

  const located = await threads.locate(threadId)
  if (located === null) return null

  const forum = await forums.findById(located.forumId)
  if (forum === null || !canHoldThreads(forum.type)) return null

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  const scope = {
    ...(await moderatorTargetFor(actor, forum.id, matrix)),
    threadAuthorId: located.authorUserId,
    ownerId: located.authorUserId,
  }
  if (!authorizer.can(actor, 'thread.view', scope)) return null

  if (
    (located.visibility === 'deleted' && !authorizer.can(actor, 'content.viewDeleted', scope)) ||
    (located.visibility === 'unapproved' && !authorizer.can(actor, 'content.viewUnapproved', scope))
  )
    return null

  const wroteIt = actor.userId !== null && located.authorUserId === actor.userId
  const editsOwn = wroteIt && authorizer.can(actor, 'post.editOwn', scope)
  const mayEditOthers = authorizer.can(actor, 'post.editOthers', scope)
  const moderates = authorizer.can(actor, 'content.viewUnapproved', scope)

  return {
    forumId: forum.id,
    threadAuthorId: located.authorUserId,
    mayVote: authorizer.can(actor, 'poll.vote', scope),
    mayEdit: editsOwn || mayEditOthers,
    capabilities: {
      isAuthor: editsOwn,
      mayEditOthers,
      editWindowMinutes: Number(matrix.editTimeLimitMinutes ?? 0),
      bypassesWindow: mayEditOthers || moderates,
    },
  }
}
