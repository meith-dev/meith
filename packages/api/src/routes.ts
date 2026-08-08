/**
 * F81 — the endpoint registry.
 *
 * Every route is declared here once, with its method, its required scope, its
 * rate-limit cost and a description. The registry has three consumers, which is
 * why it is data and not a folder of files:
 *
 *  - the request handler dispatches through it, so an endpoint cannot exist
 *    without a declared scope — the failure mode being an endpoint added in a
 *    hurry that checks authentication and forgets authorization;
 *  - `scripts/api-docs.mjs` generates `docs/rest-api.md` from it and CI fails
 *    when the two disagree, so the published reference cannot describe a route
 *    that was renamed;
 *  - the tests iterate it, which is how "every route requires a scope" and
 *    "every route is documented" are assertions rather than review comments.
 *
 * ## Versioned in the path
 *
 * `/api/v1/...`. Header-based versioning is more fashionable and worse for this:
 * a board's API is consumed by shell scripts and chat bots, and a version you
 * cannot see in a URL is a version nobody pins. The path is also what makes a
 * v2 addable without touching v1's handler.
 *
 * ## Read-mostly, deliberately
 *
 * v1 exposes reading plus posting a reply. It is not the ACP over HTTP, and the
 * omission of anything administrative is the same decision `SCOPES` makes: a
 * token is a long-lived string in somebody's CI configuration, and there is no
 * value in it being able to reconfigure a board.
 */

import type { Scope } from './tokens'

export type Method = 'GET' | 'POST'

export interface RouteSpec {
  readonly method: Method
  /** The path after `/api/v1`, with `:name` for parameters. */
  readonly path: string
  readonly scope: Scope
  readonly summary: string
  /**
   * What one request costs against the window.
   *
   * A search is not a community listing: it runs full-text over the board and is the
   * cheapest way for a token to be expensive. Costing it more is honest pricing
   * rather than a special case — the limit is about work done, not requests
   * made.
   */
  readonly cost: number
  /** Whether a guest token — there is no such thing — could ever reach it. */
  readonly authenticated: true
}

export const ROUTES = [
  {
    method: 'GET',
    path: '/me',
    scope: 'members:read',
    summary: 'The token’s owner, and the scopes this token carries.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/communities',
    scope: 'communities:read',
    summary: 'Every community the token’s owner may see, as a flat list with parent ids.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/communities/:communityId/threads',
    scope: 'threads:read',
    summary: 'Threads in a community, newest activity first, keyset-paged.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/threads/:threadId',
    scope: 'threads:read',
    summary: 'One thread’s metadata.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/threads/:threadId/posts',
    scope: 'posts:read',
    summary: 'Posts in a thread, oldest first, keyset-paged.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'POST',
    path: '/threads/:threadId/posts',
    scope: 'posts:write',
    summary: 'Post a reply. Subject to the same flood control and moderation as the web form.',
    cost: 5,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/search',
    scope: 'search:read',
    summary: 'Full-text search, filtered to what the token’s owner may read.',
    cost: 10,
    authenticated: true,
  },
] as const satisfies readonly RouteSpec[]

export type RouteKey = `${Method} ${string}`

/** `GET /communities/:communityId/threads` — the key the handler and the docs both use. */
export function routeKey(route: Pick<RouteSpec, 'method' | 'path'>): RouteKey {
  return `${route.method} ${route.path}`
}

/**
 * Match a concrete path against the registry.
 *
 * Segment-by-segment rather than by regex, because a regex built from a path
 * template is where path-traversal bugs come from: `.` and `*` in a template
 * silently become wildcards, and `/threads/:id` written as `^/threads/(.+)$`
 * matches `/threads/1/../../admin`.
 */
export function matchRoute(
  method: string,
  path: string,
): { readonly route: RouteSpec; readonly params: Readonly<Record<string, string>> } | null {
  const parts = path.split('/').filter((part) => part !== '')

  for (const route of ROUTES) {
    if (route.method !== method) continue

    const template = route.path.split('/').filter((part) => part !== '')
    if (template.length !== parts.length) continue

    const params: Record<string, string> = {}
    let matched = true

    for (const [index, segment] of template.entries()) {
      const actual = parts[index]!
      if (segment.startsWith(':')) {
        /*
         * An empty parameter is not a match. `/threads//posts` would otherwise
         * resolve with an id of "", and every downstream `Number('')` is 0 —
         * which is a real community id on some boards and a confusing 404 on the
         * rest.
         */
        if (actual === '') {
          matched = false
          break
        }
        params[segment.slice(1)] = actual
        continue
      }
      if (segment !== actual) {
        matched = false
        break
      }
    }

    if (matched) return { route, params }
  }

  return null
}

/** Positive integer from a path parameter, or `null`. */
export function idParam(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
