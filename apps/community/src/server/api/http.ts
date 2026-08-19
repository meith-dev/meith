import 'server-only'

import type { ApiTokenRecord, Method, RouteSpec } from '@meith/api'
import type { Actor } from '@meith/authorization'
import { ForbiddenError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { msg } from '@meith/i18n'

export interface ApiRequest {
  readonly actor: Actor
  readonly token: ApiTokenRecord | null
  readonly params: Readonly<Record<string, string>>
  readonly url: URL
  readonly body: Record<string, unknown> | null
}

export interface ApiResult {
  readonly status: number
  readonly body: unknown
}

export type ApiHandler = (request: ApiRequest) => Promise<ApiResult>

export type ApiRoute = readonly [Method, RouteSpec['path'], ApiHandler]

export type ApiRoutes = readonly ApiRoute[]

export const JSON_MEDIA_TYPE = 'application/json; charset=utf-8'

export const SPEC_CACHE = 'public, max-age=300, stale-while-revalidate=3600'

export const DEFAULT_PAGE = 25
export const MAX_PAGE = 100

export function failure(status: number, code: string, message: string): ApiResult {
  return {
    status,
    body: { error: { code, message, requestId: currentRequestId() ?? null } },
  }
}

export function notFound(): ApiResult {
  return failure(404, 'not_found', 'No such resource.')
}

export function requireUserId(actor: Actor): number {
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))
  return actor.userId
}

export function badRequest(message: string): ApiResult {
  return failure(400, 'bad_request', message)
}

export function pageLimit(url: URL): number {
  const raw = url.searchParams.get('limit')
  if (raw === null) return DEFAULT_PAGE
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_PAGE
  return Math.min(parsed, MAX_PAGE)
}

export function encodeCursor(cursor: unknown): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function bodyText(body: Record<string, unknown> | null, name: string): string {
  const value = body?.[name]
  return typeof value === 'string' ? value : ''
}

export function bodyFlag(body: Record<string, unknown> | null, name: string): boolean {
  return body?.[name] === true
}

export function bodyId(body: Record<string, unknown> | null, name: string): number | null {
  const value = body?.[name]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null
  return value
}

export function bodyInteger(body: Record<string, unknown> | null, name: string): number | null {
  const value = body?.[name]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
