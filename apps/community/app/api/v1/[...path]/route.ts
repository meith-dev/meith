import {
  ROUTES,
  bearerFrom,
  consumeRateLimit,
  hasScope,
  idParam,
  matchRoute,
  rateLimitHeaders,
  type RouteSpec,
} from '@meith/api'
import { sourceAsMarkdown } from '@meith/markdown'
import { isAppError, statusForError, toPublicError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import {
  isRunnable,
  parseSearchInput,
  readGrouping,
  readMatch,
  readPeriod,
  readSort,
  searchQueryFrom,
  type SearchCursor,
} from '@meith/search'
import type { ThreadCursor } from '@meith/threads'
import type { NextRequest } from 'next/server'

import { apiActor, apiToken } from '@/server/api-auth'
import { activeWordFilter } from '@/server/content-admin'
import { getContainer } from '@/server/container'
import { resolveReplyTarget, submitReply } from '@/server/reply-core'
import { requireSearch, requireSearchEnabled, searchScopeFor } from '@/server/search'
import { filterWords } from '@/view/word-filter'
import { canHoldThreads } from '@meith/forums'

export const dynamic = 'force-dynamic'

interface Ok {
  readonly status: number
  readonly body: unknown
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

function fail(status: number, code: string, message: string, headers = {}): Response {
  return json({ error: { code, message, requestId: currentRequestId() ?? null } }, status, headers)
}

async function handle(request: NextRequest, method: 'GET' | 'POST'): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/v1/, '')

  const matched = matchRoute(method, path)
  if (matched === null) {
    return fail(404, 'no_such_route', 'No such endpoint. See /api/v1 for the route list.')
  }

  const presented = bearerFrom(request.headers.get('authorization'))
  if (presented === null) {
    return fail(401, 'unauthenticated', 'Send a bearer token in the Authorization header.')
  }

  const authenticated = await apiToken(presented)
  if (authenticated === null) {
    return fail(401, 'unauthenticated', 'That token is not valid.')
  }

  if (!hasScope(authenticated.token, matched.route.scope)) {
    return fail(
      403,
      'missing_scope',
      `This token does not carry the "${matched.route.scope}" scope.`,
    )
  }

  const limit = await consumeRateLimit(
    authenticated.limits,
    authenticated.token.id,
    matched.route.cost,
    new Date(),
  )
  const headers = rateLimitHeaders(limit)

  if (!limit.allowed) {
    return fail(429, 'rate_limited', 'Too many requests. Slow down and try again.', {
      ...headers,
      'retry-after': String(limit.resetSeconds),
    })
  }

  const actor = await apiActor(authenticated.token.userId)
  if (actor === null) {
    return fail(403, 'owner_unavailable', 'The account this token belongs to cannot act.')
  }

  try {
    const result = await dispatch(matched.route, matched.params, actor, request)
    return json(result.body, result.status, headers)
  } catch (err) {
    if (isAppError(err)) {
      const { error } = toPublicError(err)
      return fail(statusForError(err), error.code, error.message, headers)
    }
    throw err
  }
}

const DEFAULT_PAGE = 25
const MAX_PAGE = 100

function pageLimit(url: URL): number {
  const raw = url.searchParams.get('limit')
  if (raw === null) return DEFAULT_PAGE
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_PAGE
  return Math.min(parsed, MAX_PAGE)
}

function encodeCursor(cursor: unknown): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

async function threadScope(
  actor: Awaited<ReturnType<typeof apiActor>> & object,
  threadId: number,
): Promise<{
  readonly scope: ReturnType<ReturnType<typeof getContainer>['authorizer']['contentScope']>
  readonly forumId: number
} | null> {
  const { authorizer, forums, threads } = getContainer()

  const forumId = await threads.locateForum(threadId)
  if (forumId === null) return null

  const forum = await forums.findById(forumId)
  if (!forum || !canHoldThreads(forum.type)) return null

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) return null

  return {
    scope: await authorizer.contentScopeIn(actor, forum.id, matrix),
    forumId: forum.id,
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

async function dispatch(
  route: RouteSpec,
  params: Readonly<Record<string, string>>,
  actor: Awaited<ReturnType<typeof apiActor>> & object,
  request: NextRequest,
): Promise<Ok> {
  const { authorizer, forums, threads, posts } = getContainer()
  const url = new URL(request.url)

  const notFound: Ok = {
    status: 404,
    body: { error: { code: 'not_found', message: 'No such resource.' } },
  }

  switch (`${route.method} ${route.path}`) {
    case 'GET /me':
      return { status: 200, body: { userId: actor.userId } }

    case 'GET /forums': {
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
    }

    case 'GET /forums/:forumId/threads': {
      const forumId = idParam(params.forumId)
      if (forumId === null) return notFound

      const forum = await forums.findById(forumId)
      if (!forum || !canHoldThreads(forum.type)) return notFound

      const matrix = await authorizer.forumMatrix(actor, forum.id)
      if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) {
        return notFound
      }

      const cursor = decodeCursor<ThreadCursor>(url.searchParams.get('after'))
      const page = await threads.listForum(forum.id, {
        limit: pageLimit(url),
        scope: await authorizer.contentScopeIn(actor, forum.id, matrix),
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
    }

    case 'GET /threads/:threadId': {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound

      const resolved = await threadScope(actor, threadId)
      if (resolved === null) return notFound

      const thread = await threads.findById(threadId, resolved.scope)
      if (!thread) return notFound

      return { status: 200, body: { data: threadBody(thread) } }
    }

    case 'GET /threads/:threadId/posts': {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound

      const resolved = await threadScope(actor, threadId)
      if (resolved === null) return notFound

      const after = url.searchParams.get('after')
      const afterId = after === null ? null : idParam(after)
      const page = await posts.listThread(threadId, {
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
    }

    case 'POST /threads/:threadId/posts': {
      const threadId = idParam(params.threadId)
      if (threadId === null) return notFound

      const body = await readJsonBody(request)
      const message = typeof body?.message === 'string' ? body.message : ''

      const resolved = await resolveReplyTarget(actor, threadId)
      const created = await submitReply(actor, resolved, {
        message,
        subscribe: body?.subscribe === true,
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
    }

    case 'GET /search': {
      await requireSearchEnabled()

      const parsed = parseSearchInput(url.searchParams.get('q') ?? '')
      if (!isRunnable(parsed)) {
        return {
          status: 400,
          body: {
            error: {
              code: 'bad_query',
              message:
                parsed.refusal === 'too-short'
                  ? 'That search term is too short.'
                  : parsed.refusal === 'too-long'
                    ? 'That search term is too long.'
                    : 'Provide a search term in ?q=.',
            },
          },
        }
      }

      const ids = (key: string): readonly number[] | undefined => {
        const values = url.searchParams
          .getAll(key)
          .map((value) => Number(value))
          .filter((value) => Number.isSafeInteger(value) && value > 0)

        return values.length === 0 ? undefined : values
      }

      const forumIds = ids('forum')
      const authorUserIds = ids('by')

      const results = await requireSearch().search(
        searchQueryFrom(
          parsed.terms,
          {
            sort: readSort(url.searchParams.get('sort')),
            match: readMatch(url.searchParams.get('in')),
            grouping: readGrouping(url.searchParams.get('show')),
            period: readPeriod(url.searchParams.get('when')),
            ...(forumIds === undefined ? {} : { forumIds }),
            ...(authorUserIds === undefined ? {} : { authorUserIds }),
          },
          {
            limit: pageLimit(url),
            after: decodeCursor<SearchCursor>(url.searchParams.get('after')),
            now: new Date(),
          },
        ),
        await searchScopeFor(actor),
      )

      const wordFilter = await activeWordFilter()

      return {
        status: 200,
        body: {
          data: results.hits.map((hit) => ({
            postId: hit.postId,
            threadId: hit.threadId,
            forumId: hit.forumId,
            threadTitle: hit.threadTitle,
            authorUserId: hit.authorUserId,
            authorUsername: hit.authorUsername,
            postedAt: hit.postedAt.toISOString(),
            excerpt: filterWords(hit.excerpt, wordFilter),
          })),
          nextCursor: results.nextCursor === null ? null : encodeCursor(results.nextCursor),
        },
      }
    }

    default:
      return {
        status: 501,
        body: {
          error: {
            code: 'not_implemented',
            message: `${route.method} ${route.path} is declared but not yet implemented.`,
          },
        },
      }
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request, 'GET')
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request, 'POST')
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json()
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export const IMPLEMENTED_ROUTES: readonly string[] = [
  'GET /me',
  'GET /forums',
  'GET /forums/:forumId/threads',
  'GET /threads/:threadId',
  'GET /threads/:threadId/posts',
  'POST /threads/:threadId/posts',
  'GET /search',
]

export const DECLARED_ROUTES: readonly string[] = ROUTES.map(
  (route) => `${route.method} ${route.path}`,
)
