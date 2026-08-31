import type { NextRequest } from 'next/server'

import {
  bearerFrom,
  consumeAnonymousRateLimit,
  consumeRateLimit,
  hasScope,
  type Method,
  matchRoute,
  type RateLimitOutcome,
  type RouteSpec,
  rateLimitHeaders,
  routeKey,
} from '@meith/api'
import type { Actor } from '@meith/authorization'
import { isAppError, metrics, statusForError, toPublicError, withSpan } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'

import { readJsonBody } from '@/server/api/body'
import { JSON_MEDIA_TYPE } from '@/server/api/http'
import { handlerFor } from '@/server/api/registry'
import {
  type AuthenticatedToken,
  anonymousLimits,
  anonymousSubject,
  apiActor,
  apiGuest,
  apiToken,
} from '@/server/api-auth'
import { boardOffline } from '@/server/board-offline'
import { getMessageResolver } from '@/server/i18n'

export const dynamic = 'force-dynamic'

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_MEDIA_TYPE, ...headers },
  })
}

function fail(status: number, code: string, message: string, headers = {}): Response {
  return json({ error: { code, message, requestId: currentRequestId() ?? null } }, status, headers)
}

interface Caller {
  readonly actor: Actor
  readonly authenticated: AuthenticatedToken | null
  readonly limit: RateLimitOutcome | null
}

async function resolveCaller(
  route: RouteSpec,
  presented: string | null,
): Promise<Caller | Response> {
  if (presented !== null) {
    const authenticated = await apiToken(presented)
    if (authenticated === null) return fail(401, 'unauthenticated', 'That token is not valid.')

    if (!hasScope(authenticated.token, route.scope)) {
      return fail(403, 'missing_scope', `This token does not carry the "${route.scope}" scope.`)
    }

    const limit = await consumeRateLimit(
      authenticated.limits,
      authenticated.token.id,
      route.cost,
      new Date(),
    )
    if (!limit.allowed) return refused(limit)

    const actor = await apiActor(authenticated.token.userId)
    if (actor === null) {
      return fail(403, 'owner_unavailable', 'The account this token belongs to cannot act.', {
        ...rateLimitHeaders(limit),
      })
    }

    return { actor, authenticated, limit }
  }

  if (route.authenticated) {
    return fail(401, 'unauthenticated', 'Send a bearer token in the Authorization header.')
  }

  const store = anonymousLimits()
  const limit =
    store === null
      ? null
      : await consumeAnonymousRateLimit(store, await anonymousSubject(), route.cost, new Date())

  if (limit !== null && !limit.allowed) return refused(limit)

  return { actor: await apiGuest(), authenticated: null, limit }
}

function refused(limit: RateLimitOutcome): Response {
  return fail(429, 'rate_limited', 'Too many requests. Slow down and try again.', {
    ...rateLimitHeaders(limit),
    'retry-after': String(limit.resetSeconds),
  })
}

const httpRequestSeconds = metrics.histogram(
  'meith_http_request_duration_seconds',
  'REST API v1 request duration in seconds, labelled by method, route and status.',
)

async function handle(request: NextRequest, method: Method): Promise<Response> {
  const startedAt = Date.now()
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/v1/, '')
  const matched = matchRoute(method, path)
  const routeLabel = matched === null ? 'unmatched' : matched.route.path

  const response = await withSpan(
    'http.request',
    { 'http.method': method, 'http.route': routeLabel },
    async (span) => {
      const result = await respondTo(request, url, matched)
      span.setAttribute('http.status_code', result.status)
      return result
    },
  )

  httpRequestSeconds.observe((Date.now() - startedAt) / 1000, {
    method,
    route: routeLabel,
    status: String(response.status),
  })

  return response
}

async function respondTo(
  request: NextRequest,
  url: URL,
  matched: ReturnType<typeof matchRoute>,
): Promise<Response> {
  if (matched === null) {
    return fail(404, 'no_such_route', 'No such endpoint. See /api/v1/openapi.json for the routes.')
  }

  const caller = await resolveCaller(
    matched.route,
    bearerFrom(request.headers.get('authorization')),
  )
  if (caller instanceof Response) return caller

  const headers = caller.limit === null ? {} : rateLimitHeaders(caller.limit)

  const offline = await boardOffline(caller.actor)
  if (offline !== null) return fail(503, 'board_offline', offline.message, headers)

  const handler = handlerFor(routeKey(matched.route))
  if (handler === null) {
    return fail(
      501,
      'not_implemented',
      `${matched.route.method} ${matched.route.path} is declared but not yet implemented.`,
      headers,
    )
  }

  let body: Record<string, unknown> | null = null
  if (matched.route.request !== undefined) {
    const outcome = await readJsonBody(request)
    if (outcome.kind === 'too-large') {
      return fail(
        413,
        'payload_too_large',
        'The request body is larger than the API allows.',
        headers,
      )
    }
    if (outcome.kind === 'invalid') {
      return fail(400, 'invalid_body', 'The request body is not valid JSON.', headers)
    }
    body = outcome.body
  }

  try {
    const result = await handler({
      actor: caller.actor,
      token: caller.authenticated?.token ?? null,
      params: matched.params,
      url,
      body,
    })

    return json(result.body, result.status, headers)
  } catch (err) {
    if (isAppError(err)) {
      const { error } = toPublicError(err, await getMessageResolver())
      return fail(statusForError(err), error.code, error.message, headers)
    }
    throw err
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request, 'GET')
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request, 'POST')
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return handle(request, 'PATCH')
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handle(request, 'DELETE')
}
