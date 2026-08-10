import type { Scope } from './tokens'

export type Method = 'GET' | 'POST'

export interface RouteSpec {
  readonly method: Method
  readonly path: string
  readonly scope: Scope
  readonly summary: string
  readonly cost: number
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
    path: '/forums',
    scope: 'forums:read',
    summary: 'Every forum the token’s owner may see, as a flat list with parent ids.',
    cost: 1,
    authenticated: true,
  },
  {
    method: 'GET',
    path: '/forums/:forumId/threads',
    scope: 'threads:read',
    summary: 'Threads in a forum, newest activity first, keyset-paged.',
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

export function routeKey(route: Pick<RouteSpec, 'method' | 'path'>): RouteKey {
  return `${route.method} ${route.path}`
}

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

export function idParam(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
