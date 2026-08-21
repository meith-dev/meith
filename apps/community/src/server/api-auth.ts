import 'server-only'

import {
  type AnonymousRateLimitStore,
  type ApiTokenRecord,
  authenticateToken,
  isScope,
  type RateLimitStore,
} from '@meith/api'
import type { Actor } from '@meith/authorization'
import { env, logger } from '@meith/core'
import { getDb, PostgresApiTokenRepository, PostgresRateLimitStore } from '@meith/db'

import { rateLimitStore } from './antispam'
import { getContainer } from './container'
import { countingPrefix } from './request-fingerprint'

const ANONYMOUS_SCOPE = 'api_anon'

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

export async function apiGuest(): Promise<Actor> {
  return getContainer().actorSource.buildGuest()
}

export async function anonymousSubject(): Promise<string> {
  return (await countingPrefix()) ?? 'unknown'
}

export function anonymousLimits(): AnonymousRateLimitStore | null {
  const store = rateLimitStore()
  if (store === null) return null

  return {
    async spend(subject, windowStart, cost) {
      return store.spend({ scope: ANONYMOUS_SCOPE, subject }, windowStart, cost)
    },
    async peek(subject, windowStart) {
      return store.peek({ scope: ANONYMOUS_SCOPE, subject }, windowStart)
    },
  }
}
