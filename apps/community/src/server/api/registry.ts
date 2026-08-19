import 'server-only'

import { ROUTES, type RouteKey, routeKey } from '@meith/api'

import { CONTENT_HANDLERS } from './content'
import type { ApiHandler, ApiRoutes } from './http'
import { MEMBER_HANDLERS } from './members'
import { MESSAGE_HANDLERS } from './messages'
import { SEARCH_HANDLERS } from './search'
import { SUBSCRIPTION_HANDLERS } from './subscriptions'

const DECLARED: ApiRoutes = [
  ...CONTENT_HANDLERS,
  ...MEMBER_HANDLERS,
  ...MESSAGE_HANDLERS,
  ...SEARCH_HANDLERS,
  ...SUBSCRIPTION_HANDLERS,
]

const HANDLERS = new Map<RouteKey, ApiHandler>(
  DECLARED.map(([method, path, handler]) => [routeKey({ method, path }), handler]),
)

export function handlerFor(key: RouteKey): ApiHandler | null {
  return HANDLERS.get(key) ?? null
}

export const IMPLEMENTED_ROUTES: readonly string[] = [...HANDLERS.keys()].sort()

export const DECLARED_ROUTES: readonly string[] = ROUTES.map((route) => routeKey(route)).sort()
