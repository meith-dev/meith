import {
  ROUTES,
  bearerFrom,
  consumeRateLimit,
  hasScope,
  matchRoute,
  rateLimitHeaders,
  type RouteSpec,
} from '@meith/api'
import { currentRequestId } from '@meith/core/logger'
import type { NextRequest } from 'next/server'

import { apiActor, apiToken } from '@/server/api-auth'
import { getContainer } from '@/server/container'

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

  const result = await dispatch(matched.route, actor)
  return json(result.body, result.status, headers)
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
  actor: Awaited<ReturnType<typeof apiActor>> & object,
): Promise<Ok> {
  const { authorizer, forums } = getContainer()

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

/** Exported for the test that holds the registry against the implementation. */
export const IMPLEMENTED_ROUTES: readonly string[] = ['GET /me', 'GET /forums']

export const DECLARED_ROUTES: readonly string[] = ROUTES.map(
  (route) => `${route.method} ${route.path}`,
)
