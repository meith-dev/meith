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
import { getDb, PostgresApiTokenRepository, PostgresRateLimitBucketStore } from '@meith/db'

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

  const store = new PostgresRateLimitBucketStore(db)
  return {
    token: outcome.token,
    limits: {
      spend: (userId, ...args) =>
        store.spend({ scope: 'api_user', subject: String(userId) }, ...args),
      peek: (userId, windowStart) =>
        store.peek({ scope: 'api_user', subject: String(userId) }, windowStart),
    },
  }
}

export async function apiActor(userId: number): Promise<Actor | null> {
  const actor = await getContainer().actorSource.buildForUser(userId)
  return actor?.state === 'banned' ? null : actor
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
    async spend(subject, windowStart, cost, ceiling) {
      return store.spend({ scope: ANONYMOUS_SCOPE, subject }, windowStart, cost, ceiling)
    },
    async peek(subject, windowStart) {
      return store.peek({ scope: ANONYMOUS_SCOPE, subject }, windowStart)
    },
  }
}
