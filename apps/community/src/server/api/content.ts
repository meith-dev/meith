import 'server-only'

import { idParam } from '@meith/api'
import type { Actor } from '@meith/authorization'
import { ForbiddenError, ValidationError } from '@meith/core'
import { canHoldThreads } from '@meith/forums'
import { msg } from '@meith/i18n'
import { sourceAsMarkdown } from '@meith/markdown'
import { PollService } from '@meith/polls'
import type { ThreadCursor } from '@meith/threads'

import { getContainer } from '../container'
import { emitEvent, viewerRef } from '../plugin-view'
import { postEditor, resolvePostScope } from '../post-scope'
import { resolveReplyTarget, submitReply } from '../reply-core'
import { resolveThreadTarget, submitThread } from '../thread-core'
import {
  type ApiResult,
  type ApiRoutes,
  bodyFlag,
  bodyId,
  bodyText,
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

      return {
        status: 200,
        body: {
          data: {
            id: poll.id,
            threadId: poll.threadId,
            question: poll.question,
            closesAt: poll.closesAt === null ? null : poll.closesAt.toISOString(),
            options: poll.options.map((option) => ({
              id: option.id,
              label: option.label,
              votes: option.votes,
            })),
            votedOptionId: poll.votedOptionId,
          },
        },
      }
    },
  ],

  [
    'POST',
    '/polls/:pollId/votes',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const pollId = idParam(params.pollId)
      const threadId = bodyId(body, 'threadId')
      const optionId = bodyId(body, 'optionId')
      if (pollId === null || threadId === null || optionId === null) return notFound()

      const { authorizer, forums, polls, threads } = getContainer()
      if (polls === null) return notFound()

      const located = await threads.locate(threadId)
      const forum = located === null ? null : await forums.findById(located.forumId)
      if (located === null || forum === null || !canHoldThreads(forum.type)) {
        throw new ValidationError(msg('error.app.poll-exist'))
      }

      const target = {
        forumId: forum.id,
        forum: await authorizer.forumMatrix(actor, forum.id),
        threadAuthorId: located.authorUserId,
      }
      if (!authorizer.can(actor, 'thread.view', target)) {
        throw new ValidationError(msg('error.app.poll-exist'))
      }

      await new PollService(polls).vote({
        pollId,
        optionId,
        userId: requireUserId(actor),
        mayVote: authorizer.can(actor, 'poll.vote', target),
      })

      return { status: 201, body: { data: { pollId } } }
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
      const editor = await postEditor(postWrites)
      const edited = await editor.edit(
        {
          message: bodyText(body, 'message'),
          reason: bodyText(body, 'reason'),
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
