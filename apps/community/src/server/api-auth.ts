import 'server-only'

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

export async function apiToken(presented: string): Promise<AuthenticatedToken | null> {
  if (env.DATA_SOURCE === 'fixture') return null

  const db = getDb()
  const repository = new PostgresApiTokenRepository(db, isScope)
  const outcome = await authenticateToken(presented, repository, new Date())

  if (!outcome.ok) {
    logger().warn({ reason: outcome.reason }, 'api token rejected')
    return null
  }

  await repository.touch(outcome.token.id, new Date()).catch(() => {})

  return { token: outcome.token, limits: new PostgresRateLimitStore(db) }
}

export async function apiActor(userId: number): Promise<Actor | null> {
  return getContainer().actorSource.buildForUser(userId)
}
