import 'server-only'

import { authenticateFeedToken, FEED_TOKEN_PREFIX, issueToken } from '@meith/api'
import { PUBLIC_CONTENT, ValidationError } from '@meith/core'
import {
  type FeedScope,
  type FeedTokenSummary,
  getDb,
  PostgresFeedTokenRepository,
} from '@meith/db'
import { msg } from '@meith/i18n'

import { getContainer } from './container'
import { publicScope } from './syndication'

export type { FeedTokenSummary }

export function feedTokenStore(): PostgresFeedTokenRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresFeedTokenRepository(getDb()) : null
}

export async function resolveFeedToken(presented: string): Promise<number | null> {
  const store = feedTokenStore()
  if (store === null) return null

  const outcome = await authenticateFeedToken(presented, store)
  if (!outcome.ok) return null

  await store.touch(outcome.record.id, new Date()).catch(() => {})
  return outcome.record.userId
}

export async function memberFeedScope(userId: number): Promise<FeedScope | null> {
  const { authorizer, actorSource } = getContainer()
  const actor = await actorSource.buildForUser(userId)
  if (actor === null) return null

  return { ...(await authorizer.threadAudience(actor)), content: PUBLIC_CONTENT }
}

export interface ResolvedFeedScope {
  readonly scope: FeedScope
  readonly tokened: boolean
}

export async function feedScopeForRequest(request: Request): Promise<ResolvedFeedScope> {
  const presented = new URL(request.url).searchParams.get('token')
  if (presented === null || presented === '') {
    return { scope: await publicScope(), tokened: false }
  }

  const userId = await resolveFeedToken(presented)
  if (userId === null) return { scope: await publicScope(), tokened: true }

  const member = await memberFeedScope(userId)
  return { scope: member ?? (await publicScope()), tokened: true }
}

export async function issueFeedToken(userId: number): Promise<string> {
  const store = feedTokenStore()
  if (store === null) throw new ValidationError(msg('error.app.feed-token-needs-database'))

  const issued = issueToken(FEED_TOKEN_PREFIX)
  await store.regenerate({ userId, lookup: issued.lookup, secretHash: issued.secretHash })
  return issued.token
}

export async function revokeFeedToken(userId: number): Promise<void> {
  const store = feedTokenStore()
  if (store === null) return
  await store.revokeForUser(userId)
}

export async function feedTokenSummary(userId: number): Promise<FeedTokenSummary | null> {
  const store = feedTokenStore()
  if (store === null) return null
  return store.summaryForUser(userId)
}
