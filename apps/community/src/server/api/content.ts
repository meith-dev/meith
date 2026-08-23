import 'server-only'

import { idParam } from '@meith/api'
import type { Actor } from '@meith/authorization'
import { ForbiddenError, ValidationError } from '@meith/core'
import { canHoldThreads } from '@meith/forums'
import { msg } from '@meith/i18n'
import { sourceAsMarkdown } from '@meith/markdown'
import { type Poll, PollService } from '@meith/polls'
import type { ThreadCursor } from '@meith/threads'

import { getContainer } from '../container'
import { emitEvent, filterView, viewerRef } from '../plugin-view'
import { resolvePollScope } from '../poll-scope'
import { postEditor, resolvePostScope } from '../post-scope'
import { resolveReplyTarget, submitReply } from '../reply-core'
import { resolveThreadTarget, submitThread } from '../thread-core'
import {
  type ApiResult,
  type ApiRoutes,
  bodyFlag,
  bodyFlagOr,
  bodyId,
  bodyIdList,
  bodyInteger,
  bodyText,
  bodyTime,
  decodeCursor,
  encodeCursor,
  notFound,
  pageLimit,
  requireUserId,
} from './http'

interface ThreadScope {
  readonly scope: ReturnType<ReturnType<typeof getContainer>['authorizer']['contentScope']>
  readonly authors: ReturnType<ReturnType<typeof getContainer>['authorizer']['authorFilter']>
}

async function threadScope(actor: Actor, threadId: number): Promise<ThreadScope | null> {
  const { authorizer, forums, threads } = getContainer()

  const located = await threads.locate(threadId)
  if (located === null) return null

  const forum = await forums.findById(located.forumId)
  if (!forum || !canHoldThreads(forum.type)) return null

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  const target = await authorizer.moderatorTargetIn(actor, forum.id, matrix)
  if (!authorizer.can(actor, 'thread.view', { ...target, threadAuthorId: located.authorUserId })) {
    return null
  }

  return {
    scope: authorizer.contentScope(actor, target),
    authors: authorizer.authorFilter(actor, target),
  }
}

function pollBody(poll: Poll): Record<string, unknown> {
  return {
    id: poll.id,
    threadId: poll.threadId,
    question: poll.question,
    closesAt: poll.closesAt === null ? null : poll.closesAt.toISOString(),
    maxOptions: poll.maxOptions,
    allowRevote: poll.allowRevote,
    publicVotes: poll.publicVotes,
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      votes: option.votes,
      voters: option.voters.map((voter) => ({
        userId: voter.userId,
        username: voter.username,
        votedAt: voter.votedAt === null ? null : voter.votedAt.toISOString(),
      })),
    })),
    votedOptionId: poll.votedOptionIds[0] ?? null,
    votedOptionIds: poll.votedOptionIds,
  }
}

function pollOptionsFrom(body: Record<string, unknown> | null): readonly {
  id: number | null
  label: string
}[] {
  const value = body?.options
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'number' && Number.isSafeInteger(row.id) ? row.id : null
    return [{ id, label: typeof row.label === 'string' ? row.label : '' }]
  })
}

function threadBody(row: {
  readonly id: number
  readonly forumId: number
  readonly title: string
  readonly slug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly viewCount: number
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly visibility: string
  readonly lastPostAt: Date
}): Record<string, unknown> {
  return {
    id: row.id,
    forumId: row.forumId,
    title: row.title,
    slug: row.slug,
    authorUserId: row.authorUserId,
    authorUsername: row.authorUsername,
    replyCount: row.replyCount,
    viewCount: row.viewCount,
    isSticky: row.isSticky,
    isLocked: row.isLocked,
    visibility: row.visibility,
    lastPostAt: row.lastPostAt.toISOString(),
  }
}

export const CONTENT_HANDLERS: ApiRoutes = [
  [
    'GET',
    '/forums',
    async ({ actor }): Promise<ApiResult> => {
      const { authorizer, forums } = getContainer()
      const visible = new Set(await authorizer.forumIdsWhere(actor, 'forum.view'))
      const all = await forums.listAll()

      return {
        status: 200,
        body: {
          data: all
            .filter((forum) => visible.has(forum.id))
            .map((forum) => ({
              id: forum.id,
              title: forum.title,
              slug: forum.slug,
              type: forum.type,
              parentId: forum.parentId ?? null,
              depth: forum.depth,
            })),
        },
      }
    },
  ],

  [
    'GET',
    '/forums/:forumId/threads',
    async ({ actor, params, url }): Promise<ApiResult> => {
      const forumId = idParam(params.forumId)
      if (forumId === null) return notFound()

      const { authorizer, forums, threads } = getContainer()

      const forum = await forums.findById(forumId)
      if (!forum || !canHoldThreads(forum.type)) return notFound()

      const matrix = await authorizer.forumMatrix(actor, forum.id)
      if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) {
        return notFound()
      }

      const target = await authorizer.moderatorTargetIn(actor, forum.id, matrix)
      const cursor = decodeCursor<ThreadCursor>(url.searchParams.get('after'))
      const page = await threads.listForum(forum.id, {
        limit: pageLimit(url),
        scope: authorizer.contentScope(actor, target),
        authors: authorizer.authorFilter(actor, target),
        ...(cursor === null
          ? {}
          : { after: { ...cursor, lastPostAt: new Date(cursor.lastPostAt) } }),
      })

      return {
        status: 200,
        body: {
          data: page.rows.map(threadBody),
          nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
        },
      }
    },
  ],

  [
    'POST',
    '/forums/:forumId/threads',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const forumId = idParam(params.forumId)
      if (forumId === null) return notFound()

      const resolved = await resolveThreadTarget(actor, forumId)
      const created = await submitThread(actor, resolved, {
        title: bodyText(body, 'title'),
        message: bodyText(body, 'message'),
        prefixId: bodyId(body, 'prefixId'),
        subscribe: bodyFlag(body, 'subscribe'),
      })

      return {
        status: 201,
        body: {
          data: {
            id: created.threadId,
            postId: created.postId,
            slug: created.slug,
            visibility: created.visibility,
          },
        },
      }
    },
  ],

  [
    'GET',
    '/threads/:threadId',
    async ({ actor, params }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound()

      const resolved = await threadScope(actor, threadId)
      if (resolved === null) return notFound()

      const thread = await getContainer().threads.findById(
        threadId,
        resolved.scope,
        resolved.authors,
      )
      if (!thread) return notFound()

      return { status: 200, body: { data: threadBody(thread) } }
    },
  ],

  [
    'GET',
    '/threads/:threadId/poll',
    async ({ actor, params }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound()

      const resolved = await threadScope(actor, threadId)
      if (resolved === null) return notFound()

      const { polls } = getContainer()
      if (polls === null) return notFound()

      const poll = await polls.find(threadId, actor.userId)
      if (poll === null) return notFound()

      return { status: 200, body: { data: pollBody(poll) } }
    },
  ],

  [
    'POST',
    '/polls/:pollId/votes',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const pollId = idParam(params.pollId)
      const threadId = bodyId(body, 'threadId')
      if (pollId === null || threadId === null) return notFound()

      const single = bodyId(body, 'optionId')
      const optionIds = [...bodyIdList(body, 'optionIds'), ...(single === null ? [] : [single])]

      const { polls } = getContainer()
      if (polls === null) return notFound()

      const scope = await resolvePollScope(actor, threadId)
      if (scope === null) throw new ValidationError(msg('error.app.poll-exist'))

      await new PollService(polls).vote({
        threadId,
        pollId,
        optionIds,
        userId: requireUserId(actor),
        mayVote: scope.mayVote,
      })

      return { status: 201, body: { data: { pollId } } }
    },
  ],

  [
    'PATCH',
    '/polls/:pollId',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const pollId = idParam(params.pollId)
      const threadId = bodyId(body, 'threadId')
      if (pollId === null || threadId === null) return notFound()

      const { polls } = getContainer()
      if (polls === null) return notFound()

      requireUserId(actor)
      const scope = await resolvePollScope(actor, threadId)
      if (scope === null) throw new ValidationError(msg('error.app.poll-exist'))

      const current = await polls.find(threadId, null)
      if (current === null) throw new ValidationError(msg('error.app.poll-exist'))

      await new PollService(polls).edit({
        threadId,
        pollId,
        edit: {
          question: bodyText(body, 'question'),
          options: pollOptionsFrom(body),
          closesAt: bodyTime(body, 'closesAt'),
          maxOptions: bodyInteger(body, 'maxOptions') ?? current.maxOptions,
          allowRevote: bodyFlagOr(body, 'allowRevote', current.allowRevote),
          publicVotes: bodyFlagOr(body, 'publicVotes', current.publicVotes),
        },
        capabilities: scope.capabilities,
      })

      const edited = await polls.find(threadId, actor.userId)
      if (edited === null) throw new ValidationError(msg('error.app.poll-exist'))

      return { status: 200, body: { data: pollBody(edited) } }
    },
  ],

  [
    'GET',
    '/threads/:threadId/posts',
    async ({ actor, params, url }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound()

      const resolved = await threadScope(actor, threadId)
      if (resolved === null) return notFound()

      const after = url.searchParams.get('after')
      const afterId = after === null ? null : idParam(after)
      const page = await getContainer().posts.listThread(threadId, {
        ...(afterId === null ? {} : { afterId }),
        limit: pageLimit(url),
        scope: resolved.scope,
      })

      return {
        status: 200,
        body: {
          data: page.rows.map((post) => ({
            id: post.id,
            threadId,
            number: post.number,
            authorUserId: post.authorUserId,
            authorUsername: post.authorUsername,
            message: sourceAsMarkdown(post.message, post.bodyFormat),
            visibility: post.visibility,
            postedAt: post.createdAt.toISOString(),
          })),
          nextAfterId: page.nextAfterId,
        },
      }
    },
  ],

  [
    'POST',
    '/threads/:threadId/posts',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound()

      const resolved = await resolveReplyTarget(actor, threadId)
      const created = await submitReply(actor, resolved, {
        message: bodyText(body, 'message'),
        subscribe: bodyFlag(body, 'subscribe'),
      })

      return {
        status: 201,
        body: {
          data: {
            id: created.postId,
            threadId: created.threadId,
            visibility: created.visibility,
          },
        },
      }
    },
  ],

  [
    'PATCH',
    '/threads/:threadId/posts/:postId',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      const postId = idParam(params.postId)
      if (threadId === null || postId === null) return notFound()

      const { postWrites } = getContainer()
      if (postWrites === null) return notFound()

      const scope = await resolvePostScope(threadId, postId, actor)
      if (scope === null) return notFound()
      if (!scope.mayEdit) throw new ForbiddenError(msg('error.app.edit-post'))

      const userId = requireUserId(actor)
      const revised = await filterView(
        'post.edit.before',
        { body: bodyText(body, 'message'), reason: bodyText(body, 'reason') },
        { ...viewerRef(actor), postId, threadId, forumId: scope.target.forum.id },
      )

      const editor = await postEditor(postWrites)
      const edited = await editor.edit(
        {
          message: revised.body,
          reason: revised.reason ?? '',
          capabilities: scope.capabilities,
        },
        userId,
        scope.target,
      )

      if (edited.changed) {
        await emitEvent(
          'post.edited',
          {
            postId: edited.postId,
            threadId: edited.threadId,
            forumId: scope.target.forum.id,
            editorId: userId,
            revision: 0,
          },
          viewerRef(actor),
        )
      }

      return {
        status: 200,
        body: {
          data: {
            id: edited.postId,
            threadId: edited.threadId,
            changed: edited.changed,
            heldForApproval: edited.heldForApproval,
          },
        },
      }
    },
  ],

  [
    'DELETE',
    '/threads/:threadId/posts/:postId',
    async ({ actor, params }): Promise<ApiResult> => {
      const threadId = idParam(params.threadId)
      const postId = idParam(params.postId)
      if (threadId === null || postId === null) return notFound()

      const { postWrites } = getContainer()
      if (postWrites === null) return notFound()

      const scope = await resolvePostScope(threadId, postId, actor)
      if (scope === null) return notFound()
      if (!scope.mayDelete) throw new ForbiddenError(msg('error.app.delete-post'))

      const userId = requireUserId(actor)
      const editor = await postEditor(postWrites)
      const removed = await editor.softDelete(userId, scope.target, {
        bypassesLock: scope.bypassesLock,
      })

      return {
        status: 200,
        body: {
          data: { id: removed.postId, threadId: removed.threadId, changed: removed.changed },
        },
      }
    },
  ],
]
