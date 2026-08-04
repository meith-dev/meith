import 'server-only'

/**
 * F40/F81 — posting a reply, once, for both callers.
 *
 * The web form and `POST /api/v1/threads/:id/posts` must agree on every rule
 * that decides whether a reply is allowed: which thread may be known to exist,
 * who may add to it, the flood interval, the length cap, whether the author is
 * under a warning restriction, and whether the result lands in the moderation
 * queue. None of that is presentation, and a second copy of it in the API
 * handler would be a second thing to get wrong — with the failure mode being an
 * API that quietly skips the check the form applies.
 *
 * So the security-critical middle lives here and the two adapters keep only
 * what genuinely differs: the form has previews, drafts, attachments and a
 * redirect; the API has JSON and a status code.
 *
 * **Split in two on purpose.** `resolveReplyTarget` authorises and hands back
 * the scope; `submitReply` writes. The form needs the gap between them, because
 * attachments are staged against the resolved scope *before* the post exists
 * and attached to it afterwards. Collapsing the two would either lose
 * attachments or make the API carry a parameter it has no use for.
 *
 * Not a `'use server'` module: those may only export async actions, and these
 * are functions the API route calls directly.
 */
import { ForbiddenError, ValidationError, type ForumPermissions } from '@meith/core'
import type { Actor } from '@meith/authorization'
import { ReplyComposer, type AuthorRestriction, type ReplyTarget } from '@meith/threads'
import { restrictsPosting } from '@meith/moderation'

import { emitEvent, viewerRef } from './plugin-view'
import { getContainer } from './container'
import { getSettings } from './settings'

/** What `resolveReplyTarget` proved, and what writing the reply needs. */
export interface ResolvedReplyTarget {
  readonly target: ReplyTarget
  readonly forumId: number
  /** The post scope, for the Authorizer and for staging attachments. */
  readonly scope: { readonly forumId: number; readonly forum: ForumPermissions }
}

/**
 * Find the thread and prove this actor may reply to it.
 *
 * Two permissions, in this order, and the order is the feature: `thread.view`
 * decides whether the thread may be *known to exist*, and its failure is
 * deliberately the same "that thread does not exist" a missing row produces.
 * Answering "you may not reply to that" would confirm the thread is real to
 * somebody who cannot see the forum it is in.
 */
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
  /** F32's unread watermark, so the author is not shown their own reply as new. */
  readonly seenLastPostId?: number | null
}

/**
 * Compose and write the reply, then announce it.
 *
 * Every bypass is a `can()` against the resolved scope rather than a flag the
 * caller passes, so neither adapter can hand itself a moderation exemption.
 */
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
      /*
       * Replying to a locked thread is a moderator act, and `content.viewDeleted`
       * would be the wrong test — seeing removed content says nothing about
       * writing to a closed thread.
       */
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

/** F53 — a warned author may be silenced or forced through the queue. */
async function authorRestriction(
  warnings: ReturnType<typeof getContainer>['warnings'],
  userId: number,
): Promise<AuthorRestriction> {
  if (warnings === null) return { suspended: false, moderated: false }
  return restrictsPosting(await warnings.readRestriction(userId), new Date())
}
