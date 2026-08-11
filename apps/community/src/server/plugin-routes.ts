import 'server-only'

import { logger, readPluginEnv } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import {
  DEFAULT_ROUTE_BODY_BYTES,
  resolvePluginSettings,
  type PluginDefinition,
  type PluginRequest,
  type PluginResponse,
  type PluginRoute,
} from '@meith/plugin-kit'

import { recordAdminAction, requireAdmin } from './admin'
import { boardUrl } from './board-url'
import { getActor } from './context'
import { activeDefinitions, pluginHost, syncOperatorDisables } from './plugin-host'
import { dataFor, grantsFor, usersFor } from './plugin-pages'
import { getSettingOverrides } from './settings'
import { viewerRef } from './plugin-view'

const STRIPPED_HEADERS = new Set(['cookie', 'authorization'])

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message, requestId: currentRequestId() ?? null } }, status)
}

function crossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return false

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host === null) return true

  try {
    return new URL(origin).host !== host.trim().toLowerCase()
  } catch {
    return true
  }
}

function passedHeaders(request: Request): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (STRIPPED_HEADERS.has(lower) || lower.startsWith('x-forum-')) return
    out[lower] = value
  })
  return out
}

function queryOf(url: URL): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [name, value] of url.searchParams) {
    if (!(name in out)) out[name] = value
  }
  return out
}

interface ParsedBody {
  readonly rawBody: Uint8Array | null
  readonly form: Readonly<Record<string, string>> | null
  readonly json: unknown
}

async function readBody(
  request: Request,
  route: PluginRoute,
): Promise<ParsedBody | 'too-large' | 'unreadable'> {
  if (route.method !== 'POST') return { rawBody: null, form: null, json: null }

  const limit = route.maxBodyBytes ?? DEFAULT_ROUTE_BODY_BYTES

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > limit) return 'too-large'

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await request.arrayBuffer())
  } catch {
    return 'unreadable'
  }
  if (bytes.byteLength > limit) return 'too-large'

  if (route.rawBody === true) return { rawBody: bytes, form: null, json: null }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
  const text = () => new TextDecoder().decode(bytes)

  if (contentType.includes('application/json')) {
    try {
      return { rawBody: null, form: null, json: JSON.parse(text()) as unknown }
    } catch {
      return 'unreadable'
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form: Record<string, string> = {}
    for (const [name, value] of new URLSearchParams(text())) {
      if (!(name in form)) form[name] = value
    }
    return { rawBody: null, form, json: null }
  }

  return { rawBody: null, form: null, json: null }
}

function redirectAllowed(to: string, definition: PluginDefinition): boolean {
  if (to.startsWith('/') && !to.startsWith('//')) return true

  let url: URL
  try {
    url = new URL(to)
  } catch {
    return false
  }

  const hostname = url.hostname.toLowerCase()
  const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  const scheme = url.protocol === 'https:' || (url.protocol === 'http:' && loopback)

  return scheme && (definition.allowedRedirectHosts ?? []).includes(hostname)
}

function toResponse(
  answer: PluginResponse,
  method: 'GET' | 'POST',
  definition: PluginDefinition,
  pluginKey: string,
): Response {
  switch (answer.kind) {
    case 'json':
      return json(answer.body, answer.status ?? 200)

    case 'text':
      return new Response(answer.body, {
        status: answer.status ?? 200,
        headers: {
          'content-type': answer.contentType ?? 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      })

    case 'redirect': {
      if (!redirectAllowed(answer.to, definition)) {
        logger({ component: 'plugin-route', plugin: pluginKey }).error(
          { to: answer.to },
          'refused a redirect outside the plugin’s allowed hosts',
        )
        return fail(502, 'redirect_refused', 'The plugin answered with a redirect it may not make.')
      }
      return new Response(null, {
        status: method === 'POST' ? 303 : 307,
        headers: { location: answer.to, 'cache-control': 'no-store' },
      })
    }
  }
}

export type PluginRouteSurface = 'board' | 'admin'

export async function dispatchPluginRoute(
  request: Request,
  pluginKey: string,
  segments: readonly string[],
  surface: PluginRouteSurface = 'board',
): Promise<Response> {
  const definition = activeDefinitions().find((candidate) => candidate.key === pluginKey)
  if (definition === undefined) {
    return fail(404, 'no_such_route', 'No such endpoint.')
  }

  await syncOperatorDisables()
  if (!pluginHost.isEnabled(pluginKey)) {
    return fail(404, 'no_such_route', 'No such endpoint.')
  }

  const path = segments.join('/')
  const method = request.method === 'POST' ? 'POST' : request.method === 'GET' ? 'GET' : null
  if (method === null) {
    return fail(405, 'method_not_allowed', 'Plugin routes answer GET and POST.')
  }

  // Admin routes live only under /admin/api/plugins, where the panel's own
  // path-scoped session cookie travels; everything else lives only on the
  // board mount. Off the right surface, a route does not exist.
  const declared = (definition.routes ?? []).filter(
    (candidate) =>
      candidate.path === path && (candidate.access === 'admin') === (surface === 'admin'),
  )
  if (declared.length === 0) {
    return fail(404, 'no_such_route', 'No such endpoint.')
  }

  const route = declared.find((candidate) => candidate.method === method)
  if (route === undefined) {
    return fail(405, 'method_not_allowed', `This endpoint answers ${declared[0]!.method}.`)
  }

  const actor = await getActor()
  if (route.access === 'member' && actor.userId === null) {
    return fail(401, 'unauthenticated', 'Sign in to use this.')
  }

  if (route.access === 'admin') {
    try {
      await requireAdmin()
    } catch {
      return fail(403, 'administrators_only', 'Enter the control panel and try again.')
    }
  }

  if (route.access !== 'anonymous' && method === 'POST' && crossOrigin(request)) {
    return fail(403, 'cross_origin', 'This form was posted from somewhere that is not the board.')
  }

  const body = await readBody(request, route)
  if (body === 'too-large') {
    return fail(413, 'body_too_large', 'The request body is over this endpoint’s limit.')
  }
  if (body === 'unreadable') {
    return fail(400, 'unreadable_body', 'The request body could not be read as declared.')
  }

  const url = new URL(request.url)
  const pluginRequest: PluginRequest = {
    viewer: viewerRef(actor),
    method,
    path,
    query: queryOf(url),
    headers: passedHeaders(request),
    rawBody: body.rawBody,
    form: body.form,
    json: body.json,
    boardUrl: await boardUrl(),
  }

  const overrides = await getSettingOverrides()
  const log = logger({ component: 'plugin-route', plugin: pluginKey })

  const outcome = await pluginHost.run(pluginKey, `route ${method} ${path}`, () =>
    route.handler(pluginRequest, {
      settings: resolvePluginSettings(definition, overrides, readPluginEnv),
      logger: {
        info: (message, detail) => log.info(detail ?? {}, message),
        warn: (message, detail) => log.warn(detail ?? {}, message),
        error: (message, detail) => log.error(detail ?? {}, message),
      },
      grants: grantsFor(pluginKey),
      data: dataFor(pluginKey),
      users: usersFor(),
    }),
  )

  if (outcome.status === 'disabled') {
    return fail(404, 'no_such_route', 'No such endpoint.')
  }
  if (outcome.status === 'failed' || outcome.value === undefined || outcome.value === null) {
    return fail(500, 'plugin_failed', 'The plugin could not answer. The error is in the log.')
  }

  if (route.access === 'admin' && method === 'POST') {
    await recordAdminAction({ action: 'plugin.route', detail: { plugin: pluginKey, path } })
  }

  return toResponse(outcome.value, method, definition, pluginKey)
}
