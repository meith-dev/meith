import 'server-only'

/**
 * F81 — the app's half of API authentication.
 *
 * Two functions, both of which exist so the route handler contains no
 * conditional about which data source it is running against.
 */
import {
  authenticateToken,
  isScope,
  type ApiTokenRecord,
  type RateLimitStore,
} from '@meith/api'
import type { Actor } from '@meith/authorization'
import { env, logger } from '@meith/core'
import { PostgresApiTokenRepository, PostgresRateLimitStore, getDb } from '@meith/db'

import { getContainer } from './container'

export interface AuthenticatedToken {
  readonly token: ApiTokenRecord
  readonly limits: RateLimitStore
}

/**
 * Authenticate a presented token, or `null`.
 *
 * The failure *reason* is logged and never returned. Telling a caller "expired"
 * confirms the token was real, which turns the eight-character lookup prefix
 * into an enumerable space; the operator reading their own logs needs exactly
 * that distinction, and can have it there.
 *
 * Fixture mode has no token store, so the API is closed rather than open. That
 * is the right default for a surface whose whole job is to let software in: a
 * sample-data board that accepted any token would be a demo with an
 * authentication bypass in it.
 */
export async function apiToken(presented: string): Promise<AuthenticatedToken | null> {
  if (env.DATA_SOURCE === 'fixture') return null

  const db = getDb()
  const repository = new PostgresApiTokenRepository(db, isScope)
  const outcome = await authenticateToken(presented, repository, new Date())

  if (!outcome.ok) {
    logger().warn({ reason: outcome.reason }, 'api token rejected')
    return null
  }

  /* Throttled in the repository's WHERE clause, so this is not a write per request. */
  await repository.touch(outcome.token.id, new Date()).catch(() => {})

  return { token: outcome.token, limits: new PostgresRateLimitStore(db) }
}

/**
 * The token owner's `Actor`, or `null` when they can no longer act.
 *
 * The same `ActorSource` every page uses. A token does not carry permissions of
 * its own and never has: a member banned an hour ago must lose their API access
 * in the same instant, which only happens if the actor is resolved per request
 * rather than baked into the token at creation.
 */
export async function apiActor(userId: number): Promise<Actor | null> {
  return getContainer().actorSource.buildForUser(userId)
}
