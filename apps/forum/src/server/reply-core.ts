import 'server-only'

import { ForbiddenError, ValidationError, type ForumPermissions } from '@meith/core'
import type { Actor } from '@meith/authorization'
import { ReplyComposer, type AuthorRestriction, type ReplyTarget } from '@meith/threads'
import { restrictsPosting } from '@meith/moderation'

import { holdsNewMember, limitMessage, spendLimit } from './antispam'
import { emitEvent, viewerRef } from './plugin-view'
import { getContainer } from './container'
import { getSettings } from './settings'

export interface ResolvedReplyTarget {
  readonly target: ReplyTarget
  readonly forumId: number
  readonly scope: { readonly forumId: number; readonly forum: ForumPermissions }
}

export async function resolveReplyTarget(
  actor: Actor,
  threadId: number,
): Promise<ResolvedReplyTarget> {
  const { authorizer, threadWrites } = getContainer()

  if (threadWrites === null) {
    throw new ValidationError(
      'This board is running on in-memory sample data, so it cannot accept posts.',
    )
  }

  const target = await threadWrites.replyTarget(threadId)
  if (!target) throw new ValidationError('That thread does not exist.')

  const forumId = target.forum.id
  const scope = { forumId, forum: await authorizer.forumMatrix(actor, forumId) }

  if (!authorizer.can(actor, 'thread.view', scope)) {
    throw new ValidationError('That thread does not exist.')
  }
  authorizer.require(actor, 'reply.post', scope)

  if (actor.userId === null) {
    throw new ForbiddenError('You must be logged in to post.')
  }

  return { target, forumId, scope }
}

export interface SubmitReplyInput {
  readonly message: string
  readonly subscribe?: boolean
  readonly seenLastPostId?: number | null
}

export async function submitReply(
  actor: Actor,
  resolved: ResolvedReplyTarget,
  input: SubmitReplyInput,
): Promise<Awaited<ReturnType<ReplyComposer['create']>>> {
  const { authorizer, threadWrites, memberProfiles, warnings } = getContainer()
  if (threadWrites === null) {
    throw new ValidationError('This board cannot accept posts.')
  }

  const userId = actor.userId
  if (userId === null) throw new ForbiddenError('You must be logged in to post.')

  const settings = await getSettings()
  const { scope, target, forumId } = resolved

  const limited = await spendLimit({ scope: 'post', actor, settings })
  if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

  const composer = new ReplyComposer({
    posts: threadWrites,
    config: {
      floodSeconds: settings.get('posting.flood_seconds'),
      maxLength: settings.get('posting.max_length'),
    },
  })

  const profile = await memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError('Your account can no longer post.')

  const created = await composer.create(
    {
      message: input.message,
      subscribe: input.subscribe ?? false,
      seenLastPostId: input.seenLastPostId ?? null,
      bypassesModeration: authorizer.can(actor, 'content.viewUnapproved', scope),
      bypassesFlood: authorizer.can(actor, 'flood.bypass'),
      heldAsNewMember: await holdsNewMember({
        actor,
        postCount: profile.postCount,
        settings,
      }),
      bypassesLock: authorizer.can(actor, 'content.viewUnapproved', scope),
      restriction: await authorRestriction(warnings, userId),
    },
    { userId, username: profile.username },
    target,
  )

  await emitEvent(
    'post.created',
    { postId: created.postId, threadId: created.threadId, forumId, authorId: userId },
    viewerRef(actor),
  )

  return created
}

async function authorRestriction(
  warnings: ReturnType<typeof getContainer>['warnings'],
  userId: number,
): Promise<AuthorRestriction> {
  if (warnings === null) return { suspended: false, moderated: false }
  return restrictsPosting(await warnings.readRestriction(userId), new Date())
}
