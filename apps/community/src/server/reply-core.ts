import { msg } from '@meith/i18n'
import 'server-only'

import type { Actor } from '@meith/authorization'
import { ForbiddenError, ValidationError } from '@meith/core'
import { restrictsPosting } from '@meith/moderation'
import {
  type AuthorRestriction,
  ReplyComposer,
  type ReplyTarget,
  type SubscriptionCadence,
} from '@meith/threads'

import {
  dailyLimitMessage,
  holdsNewMember,
  limitMessage,
  spendDailyLimit,
  spendLimit,
} from './antispam'
import type { AttachmentScope } from './attachments'
import { getContainer } from './container'
import { emitEvent, filterView, viewerRef } from './plugin-view'
import { notifyPostAudience } from './post-notifications'
import { getSettings } from './settings'

export interface ResolvedReplyTarget {
  readonly target: ReplyTarget
  readonly forumId: number
  readonly scope: AttachmentScope
}

export async function resolveReplyTarget(
  actor: Actor,
  threadId: number,
): Promise<ResolvedReplyTarget> {
  const { authorizer, threadWrites } = getContainer()

  if (threadWrites === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-8'))
  }

  const target = await threadWrites.replyTarget(threadId)
  if (!target) throw new ValidationError(msg('error.app.thread-exist'))

  const forumId = target.forum.id
  const scope = {
    forumId,
    forum: await authorizer.forumMatrix(actor, forumId),
    allowsAttachments: target.forum.allowAttachments,
  }

  if (
    !authorizer.can(actor, 'thread.view', {
      ...(await authorizer.moderatorTargetIn(actor, forumId, scope.forum)),
      threadAuthorId: target.authorUserId,
    })
  ) {
    throw new ValidationError(msg('error.app.thread-exist'))
  }
  authorizer.require(actor, 'reply.post', scope)

  if (actor.userId === null) {
    throw new ForbiddenError(msg('error.app.must-logged-post'))
  }

  return { target, forumId, scope }
}

export interface SubmitReplyInput {
  readonly message: string
  readonly subscribe?: boolean
  readonly subscribeMode?: SubscriptionCadence
  readonly seenLastPostId?: number | null
}

export async function submitReply(
  actor: Actor,
  resolved: ResolvedReplyTarget,
  input: SubmitReplyInput,
): Promise<Awaited<ReturnType<ReplyComposer['create']>>> {
  const { authorizer, threadWrites, memberProfiles, warnings } = getContainer()
  if (threadWrites === null) {
    throw new ValidationError(msg('error.app.board-accept-posts'))
  }

  const userId = actor.userId
  if (userId === null) throw new ForbiddenError(msg('error.app.must-logged-post'))

  const settings = await getSettings()
  const { scope, target, forumId } = resolved

  const limited = await spendLimit({ scope: 'post', actor, settings })
  if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

  const daily = await spendDailyLimit({ scope: 'post_day', actor })
  if (daily !== null && !daily.allowed) {
    throw new ValidationError(dailyLimitMessage('post_day', daily))
  }

  const composer = new ReplyComposer({
    posts: threadWrites,
    config: {
      floodSeconds: settings.get('posting.flood_seconds'),
      maxLength: settings.get('posting.max_length'),
    },
  })

  const profile = await memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError(msg('error.app.account-longer-post'))

  const draft = await filterView(
    'post.create.before',
    {
      subject: null,
      body: input.message,
      prefixId: null,
      forumId,
      authorId: userId,
    },
    { ...viewerRef(actor), threadId: target.threadId },
  )

  const objections = await filterView('post.create.validate', [], {
    draft,
    threadId: target.threadId,
  })
  if (objections.length > 0) throw new ValidationError(objections[0]!)

  const created = await composer.create(
    {
      message: draft.body,
      subscribe: input.subscribe ?? false,
      ...(input.subscribeMode === undefined ? {} : { subscribeMode: input.subscribeMode }),
      seenLastPostId: input.seenLastPostId ?? null,
      bypassesModeration: authorizer.can(actor, 'content.viewUnapproved', scope),
      bypassesFlood: authorizer.can(actor, 'flood.bypass'),
      heldAsNewMember: await holdsNewMember({
        actor,
        postCount: profile.postCount,
        target: scope,
        settings,
      }),
      requiresApproval: scope.forum.requiresPostApproval === true,
      bypassesLock: authorizer.can(actor, 'content.viewUnapproved', scope),
      restriction: await authorRestriction(warnings, userId),
    },
    { userId, username: profile.username },
    target,
  )

  if (created.visibility === 'unapproved') {
    await emitEvent('approval.queued', { kind: 'post', id: created.postId }, viewerRef(actor))
  }

  await emitEvent(
    'post.created',
    { postId: created.postId, threadId: created.threadId, forumId, authorId: userId },
    viewerRef(actor),
  )

  await notifyPostAudience({
    postId: created.postId,
    threadId: created.threadId,
    forumId,
    threadSlug: created.slug,
    threadTitle: target.title,
    threadAuthorId: target.authorUserId,
    message: draft.body,
    authorUsername: profile.username,
    visibility: created.visibility,
  })

  return created
}

async function authorRestriction(
  warnings: ReturnType<typeof getContainer>['warnings'],
  userId: number,
): Promise<AuthorRestriction> {
  if (warnings === null) return { suspended: false, moderated: false }
  return restrictsPosting(await warnings.readRestriction(userId), new Date())
}
