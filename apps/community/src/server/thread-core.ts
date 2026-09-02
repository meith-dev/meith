import 'server-only'

import type { Actor } from '@meith/authorization'
import { ForbiddenError, type ForumPermissions, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { restrictsPosting } from '@meith/moderation'
import {
  type AuthorRestriction,
  type ForumPostingTarget,
  type SubscriptionCadence,
  ThreadComposer,
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

export interface ResolvedThreadTarget {
  readonly forum: ForumPostingTarget
  readonly matrix: ForumPermissions
  readonly scope: AttachmentScope
}

export async function resolveThreadTarget(
  actor: Actor,
  forumId: number,
): Promise<ResolvedThreadTarget> {
  const { authorizer, threadWrites } = getContainer()

  if (threadWrites === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-8'))
  }

  const forum = await threadWrites.postingRules(forumId)
  if (!forum) throw new ValidationError(msg('error.app.forum-exist'))

  const matrix = await authorizer.forumMatrix(actor, forumId)
  if (!authorizer.can(actor, 'thread.view', { forumId, forum: matrix })) {
    throw new ValidationError(msg('error.app.forum-exist'))
  }
  authorizer.require(actor, 'thread.post', { forumId, forum: matrix })

  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged-post'))

  return {
    forum,
    matrix,
    scope: { forumId, forum: matrix, allowsAttachments: forum.allowAttachments },
  }
}

export interface SubmitThreadInput {
  readonly title: string
  readonly message: string
  readonly prefixId?: number | null
  readonly subscribe?: boolean
  readonly subscribeMode?: SubscriptionCadence
  readonly poll?:
    | {
        readonly question: string
        readonly options: readonly string[]
        readonly closesAt?: Date | null
        readonly maxOptions?: number
        readonly allowRevote?: boolean
        readonly publicVotes?: boolean
      }
    | undefined
}

export async function submitThread(
  actor: Actor,
  resolved: ResolvedThreadTarget,
  input: SubmitThreadInput,
): Promise<Awaited<ReturnType<ThreadComposer['create']>>> {
  const { authorizer, threadWrites, memberProfiles, warnings } = getContainer()
  if (threadWrites === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-8'))
  }

  const userId = actor.userId
  if (userId === null) throw new ForbiddenError(msg('error.app.must-logged-post'))

  const settings = await getSettings()
  const { forum, matrix, scope } = resolved
  const target = { forumId: forum.id, forum: matrix }

  const limited = await spendLimit({ scope: 'post', actor, settings })
  if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

  const daily = await spendDailyLimit({ scope: 'post_day', actor })
  if (daily !== null && !daily.allowed) {
    throw new ValidationError(dailyLimitMessage('post_day', daily))
  }

  const profile = await memberProfiles.findPublicById(userId)
  if (!profile) throw new ForbiddenError(msg('error.app.account-longer-post'))

  const draft = await filterView(
    'thread.create.before',
    {
      subject: input.title,
      body: input.message,
      prefixId: input.prefixId ?? null,
      forumId: forum.id,
      authorId: userId,
    },
    viewerRef(actor),
  )

  const objections = await filterView('thread.create.validate', [], { draft })
  if (objections.length > 0) throw new ValidationError(objections[0]!)

  const composer = new ThreadComposer({
    threads: threadWrites,
    config: {
      floodSeconds: settings.get('posting.flood_seconds'),
      maxLength: settings.get('posting.max_length'),
    },
  })

  const created = await composer.create(
    {
      title: draft.subject ?? input.title,
      message: draft.body,
      prefixId: draft.prefixId,
      subscribe: input.subscribe ?? false,
      ...(input.subscribeMode === undefined ? {} : { subscribeMode: input.subscribeMode }),
      heldAsNewMember: await holdsNewMember({
        actor,
        postCount: profile.postCount,
        target: scope,
        settings,
      }),
      requiresApproval: scope.forum.requiresThreadApproval === true,
      ...(input.poll === undefined
        ? {}
        : {
            poll: {
              question: input.poll.question,
              options: input.poll.options,
              closesAt: input.poll.closesAt ?? null,
              ...(input.poll.maxOptions === undefined ? {} : { maxOptions: input.poll.maxOptions }),
              ...(input.poll.allowRevote === undefined
                ? {}
                : { allowRevote: input.poll.allowRevote }),
              ...(input.poll.publicVotes === undefined
                ? {}
                : { publicVotes: input.poll.publicVotes }),
            },
          }),
      mayPostPoll: authorizer.can(actor, 'poll.post', target),
      bypassesModeration: authorizer.can(actor, 'content.viewUnapproved', target),
      bypassesFlood: authorizer.can(actor, 'flood.bypass'),
      restriction: await authorRestriction(warnings, userId),
    },
    { userId, username: profile.username },
    forum,
  )

  if (created.visibility === 'unapproved') {
    await emitEvent('approval.queued', { kind: 'thread', id: created.threadId }, viewerRef(actor))
  }

  if (input.poll !== undefined) {
    const { polls } = getContainer()
    const poll = polls === null ? null : await polls.find(created.threadId, null)
    if (poll !== null) {
      await emitEvent(
        'poll.created',
        {
          threadId: created.threadId,
          forumId: forum.id,
          pollId: poll.id,
          optionCount: poll.options.length,
        },
        viewerRef(actor),
      )
    }
  }

  await emitEvent(
    'thread.created',
    {
      threadId: created.threadId,
      forumId: forum.id,
      authorId: userId,
      subject: draft.subject ?? input.title,
    },
    viewerRef(actor),
  )

  await notifyPostAudience({
    postId: created.postId,
    threadId: created.threadId,
    threadSlug: created.slug,
    threadTitle: draft.subject ?? input.title,
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
