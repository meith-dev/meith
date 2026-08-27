import 'server-only'

import { idParam } from '@meith/api'
import type { Actor } from '@meith/authorization'
import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseSubscriptionTarget, SubscriptionService } from '@meith/subscriptions'

import { filterWords } from '@/view/word-filter'

import { getContainer } from '../container'
import { activeWordFilter } from '../content-admin'
import { type ApiResult, type ApiRoutes, bodyId, bodyText, notFound, requireUserId } from './http'

async function mayView(
  actor: Actor,
  target: 'thread' | 'forum',
  targetId: number,
): Promise<boolean> {
  const { authorizer, threads, forums } = getContainer()

  const located = target === 'forum' ? null : await threads.locate(targetId)
  const forumId = target === 'forum' ? targetId : (located?.forumId ?? null)
  if (forumId === null) return false

  const forum = await forums.findById(forumId)
  if (!forum) return false

  const matrix = await authorizer.forumMatrix(actor, forumId)
  return target === 'forum'
    ? authorizer.can(actor, 'forum.view', { forumId, forum: matrix })
    : authorizer.can(actor, 'thread.view', {
        ...(await authorizer.moderatorTargetIn(actor, forumId, matrix)),
        threadAuthorId: located?.authorUserId ?? null,
      })
}

function requireSubscriptions(): SubscriptionService {
  const { subscriptions } = getContainer()
  if (subscriptions === null) {
    throw new ValidationError(msg('error.app.board-running-in-memory-sample-data-17'))
  }
  return new SubscriptionService({ subscriptions })
}

export const SUBSCRIPTION_HANDLERS: ApiRoutes = [
  [
    'GET',
    '/subscriptions',
    async ({ actor }): Promise<ApiResult> => {
      const userId = requireUserId(actor)
      const visibleForumIds = await getContainer().authorizer.visibleForumIds(actor)
      const rows = await requireSubscriptions().list(userId, visibleForumIds)
      const wordFilter = await activeWordFilter()

      return {
        status: 200,
        body: {
          data: rows.map((row) => ({
            target: row.target,
            targetId: row.targetId,
            title: row.target === 'thread' ? filterWords(row.title, wordFilter) : row.title,
            href: row.href,
            mode: row.mode,
            createdAt: row.createdAt.toISOString(),
            pending: row.pending,
          })),
        },
      }
    },
  ],

  [
    'POST',
    '/subscriptions',
    async ({ actor, body }): Promise<ApiResult> => {
      const userId = requireUserId(actor)
      const target = parseSubscriptionTarget(bodyText(body, 'target'))
      const targetId = bodyId(body, 'targetId')
      if (target === null || targetId === null) return notFound()

      const requested = bodyText(body, 'mode')

      const mode = await requireSubscriptions().subscribe({
        userId,
        target,
        targetId,
        mode: requested === '' ? 'instant' : requested,
        mayView: await mayView(actor, target, targetId),
      })

      return { status: 201, body: { data: { target, targetId, mode } } }
    },
  ],

  [
    'DELETE',
    '/subscriptions/:target/:targetId',
    async ({ actor, params }): Promise<ApiResult> => {
      const userId = requireUserId(actor)
      const target = parseSubscriptionTarget(params.target ?? '')
      const targetId = idParam(params.targetId)
      if (target === null || targetId === null) return notFound()

      await requireSubscriptions().unsubscribe({ userId, target, targetId })

      return { status: 200, body: { data: { target, targetId } } }
    },
  ],
]
