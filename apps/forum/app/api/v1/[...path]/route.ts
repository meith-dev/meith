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
import { isAppError, statusForError, toPublicError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { isRunnable, parseSearchInput, type SearchCursor } from '@meith/search'
import type { ThreadCursor } from '@meith/threads'
import type { NextRequest } from 'next/server'

import { apiActor, apiToken } from '@/server/api-auth'
import { getContainer } from '@/server/container'
import { resolveReplyTarget, submitReply } from '@/server/reply-core'
import { requireSearch, searchScopeFor } from '@/server/search'

/**
 * F81 — the public REST API, in one route handler.
 *
 * A catch-all dispatching through `ROUTES` rather than a folder of route files,
 * and the reason is the registry's: an endpoint cannot exist without a declared
 * scope. With one file per route, adding an endpoint means remembering to
 * authenticate it, remembering to check a scope, remembering to meter it, and
 * remembering to document it — four things, one of which will be forgotten, and
 * the one that gets forgotten is the scope check.
 *
 * Here the order is fixed and there is no path around it:
 *
 *   route match → token → scope → rate limit → **authorization** → handler
 *
 * The fourth arrow is the one that matters. A scope says what the *token* may
 * ask for; the Authorizer says what its *owner* may see. A token is a
 * restriction on an actor and never a grant to one, so both run, and the
 * per-request authorization is exactly the same code a page uses — `visibleIn`,
 * `visibleForumIds`, the lot. There is no API-specific visibility path, because
 * a second implementation of F47 is a second thing to get wrong.
 *
 * ## Errors say what is wrong and nothing more
 *
 * Every token failure is one 401 with one message. The *reason* — expired,
 * revoked, unknown, malformed — goes to the log, where the board's operator can
 * see it and an attacker cannot. Telling a caller "expired" confirms the token
 * was real, which is a slow enumeration of the board's token list.
 */

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

/**
 * The one shape every error takes.
 *
 * `code` is machine-readable and stable; `message` is for a human reading a
 * terminal. A client that has to regex the message is a client that breaks when
 * the wording improves.
 */
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
    /*
     * 403 rather than 401: the caller is authenticated and the token is simply
     * not permitted. Naming the missing scope is safe — it is a property of the
     * *endpoint*, which is public in the documentation — and it is the
     * difference between a five-minute fix and a support thread.
     */
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
    /*
     * The owner is gone, banned, or otherwise not a valid principal. The token
     * string is still correct, so this is not an authentication failure — and
     * answering 401 would send a bot into a credential-refresh loop over an
     * account that is not coming back.
     */
    return fail(403, 'owner_unavailable', 'The account this token belongs to cannot act.')
  }

  try {
    const result = await dispatch(matched.route, matched.params, actor, request)
    return json(result.body, result.status, headers)
  } catch (err) {
    /*
     * The domain's own errors, in the API's error shape. `toPublicError` is
     * what the web pages already use to decide what a stranger may be told, so
     * a validation message reaches the caller and an internal failure does not
     * — reimplementing that judgement here would be a second place for a stack
     * trace to escape into a response body.
     */
    if (isAppError(err)) {
      const { error } = toPublicError(err)
      return fail(statusForError(err), error.code, error.message, headers)
    }
    throw err
  }
}

/** `?limit=`, clamped. A caller asking for 5,000 posts gets the maximum. */
const DEFAULT_PAGE = 25
const MAX_PAGE = 100

function pageLimit(url: URL): number {
  const raw = url.searchParams.get('limit')
  if (raw === null) return DEFAULT_PAGE
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_PAGE
  return Math.min(parsed, MAX_PAGE)
}

/**
 * Keyset cursors, opaque on the wire.
 *
 * A thread cursor is six fields and a search cursor is two, and neither is
 * something a client should be assembling. Base64url JSON keeps the wire format
 * stable while the internal shape stays free to change — and a cursor cannot
 * widen what the caller may see whatever it contains, because the scope is
 * rebuilt server-side on every request.
 */
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

/**
 * Locate a thread, authorise it, and return the scope it may be read in.
 *
 * The same order the thread page uses, for the same reason: the scope cannot be
 * built before the forum is known, and the forum cannot be known before the
 * thread is located. `null` means "does not exist" *and* "you may not see it",
 * deliberately indistinguishable.
 */
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
  if (!forum || forum.type !== 'forum') return null

  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) return null

  return {
    scope: authorizer.contentScope(actor, { forumId: forum.id, forum: matrix }),
    forumId: forum.id,
  }
}

/** One thread, as the API describes it. Ids and text, no rendered HTML. */
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

/**
 * Resource handlers.
 *
 * Deliberately thin, and every one of them goes through the same container the
 * pages use. Anything that reads content passes the actor into a repository
 * that filters in-query (F47) — none of these assembles its own `where`.
 */
async function dispatch(
  route: RouteSpec,
  params: Readonly<Record<string, string>>,
  actor: Awaited<ReturnType<typeof apiActor>> & object,
  request: NextRequest,
): Promise<Ok> {
  const { authorizer, forums, threads, posts } = getContainer()
  const url = new URL(request.url)

  /* A bad id is a 404, not a 400: `/threads/abc` names no thread, and telling
     the caller which of the two it was distinguishes nothing useful. */
  const notFound: Ok = {
    status: 404,
    body: { error: { code: 'not_found', message: 'No such resource.' } },
  }

  switch (`${route.method} ${route.path}`) {
    case 'GET /me':
      return { status: 200, body: { userId: actor.userId } }

    case 'GET /forums': {
      /*
       * `forumIdsWhere` is the single source of what this actor may see (F21),
       * the same call the board index makes. Listing every forum and filtering
       * the array afterwards would be a second visibility implementation.
       */
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
      if (!forum || forum.type !== 'forum') return notFound

      const matrix = await authorizer.forumMatrix(actor, forum.id)
      if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) {
        return notFound
      }

      const cursor = decodeCursor<ThreadCursor>(url.searchParams.get('after'))
      const page = await threads.listForum(forum.id, {
        limit: pageLimit(url),
        scope: authorizer.contentScope(actor, { forumId: forum.id, forum: matrix }),
        /*
         * A stored cursor carries the sort it was produced under, so paging
         * cannot silently change ordering halfway through a run. Reviving one
         * is `...(x ?? {})` rather than a default, because `listForum` treats
         * an absent cursor and a null one differently.
         */
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
            /*
             * The stored BBCode, not `bodyHtml`. A caller wants the source it
             * could post back; the rendered form is a *theme's* output and
             * shipping it would make the renderer's markup an API contract.
             */
            message: post.message,
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

      /*
       * Every rule — flood interval, length cap, lock, warning restriction,
       * moderation queue — comes from `reply-core`, which the web form also
       * calls. The one thing this route decides is the status code.
       */
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
            /* `unapproved` is a success: the reply was accepted and is waiting
               for a moderator. A caller that treated it as failure would post
               again, which is how a queue fills with duplicates. */
            visibility: created.visibility,
          },
        },
      }
    }

    case 'GET /search': {
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

      const results = await requireSearch().search(
        {
          terms: parsed.terms,
          grouping: 'posts',
          sort: 'relevance',
          limit: pageLimit(url),
          after: decodeCursor<SearchCursor>(url.searchParams.get('after')),
        },
        /* The same scope the search page builds: `thread.view` forum ids and
           the viewer's content visibility, never a widened API-only variant. */
        await searchScopeFor(actor),
      )

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
            excerpt: hit.excerpt,
          })),
          nextCursor: results.nextCursor === null ? null : encodeCursor(results.nextCursor),
        },
      }
    }

    default:
      /*
       * A route in the registry with no handler. It is a 501 rather than a 404
       * because the two are genuinely different: the endpoint is documented and
       * will exist, and a client told "no such route" would stop asking.
       *
       * `ROUTES` is the documented set and this switch is the implemented one;
       * `api.route.test.ts` asserts which entries are which, so the gap is
       * visible in a test rather than discovered by a caller.
       */
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

/**
 * A JSON body, or null.
 *
 * Never throws: a malformed body is a caller's mistake and reaches them as the
 * validation error for the field that ends up missing, rather than as a 500
 * from `JSON.parse` with a stack in the log.
 */
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

/** Exported for the test that holds the registry against the implementation. */
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
