import type { ThreadAudience } from '@meith/core'

import type { DigestCadence, SubscriptionMode, SubscriptionTarget } from './modes'

export interface SubscriptionRow {
  readonly target: SubscriptionTarget
  readonly targetId: number
  readonly title: string
  readonly href: string
  readonly mode: SubscriptionMode
  readonly createdAt: Date
  readonly pending: number
}

export interface PendingPost {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly forumId: number
  readonly authorUsername: string | null
  readonly createdAt: Date
}

export interface PendingForUser {
  readonly userId: number
  readonly posts: readonly PendingPost[]
  readonly watermarks: readonly {
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly lastPostId: number
  }[]
}

export interface SubscriptionRepository {
  subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: SubscriptionMode
    readonly at: Date
  }): Promise<boolean>

  unsubscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
  }): Promise<boolean>

  modeFor(
    userId: number,
    target: SubscriptionTarget,
    targetId: number,
  ): Promise<SubscriptionMode | null>

  listFor(
    userId: number,
    options: { readonly audience: ThreadAudience; readonly limit: number },
  ): Promise<readonly SubscriptionRow[]>

  usersWithPending(input: {
    readonly mode: SubscriptionMode
    readonly dueBefore: Date | null
    readonly limit: number
  }): Promise<readonly number[]>

  pendingFor(input: {
    readonly userId: number
    readonly mode: SubscriptionMode
    readonly audience: ThreadAudience
    readonly limit: number
  }): Promise<PendingForUser>

  advanceWatermarks(input: {
    readonly userId: number
    readonly watermarks: PendingForUser['watermarks']
  }): Promise<void>

  recordDigestRun(input: {
    readonly userId: number
    readonly cadence: DigestCadence
    readonly at: Date
  }): Promise<void>
}

export interface SubscriptionNotifierPort {
  raise(input: {
    readonly userId: number
    readonly kind: 'subscription.reply' | 'subscription.digest'
    readonly data: Record<string, unknown>
    readonly href: string | null
    readonly dedupeKey: string | null
  }): Promise<void>
}

export interface SubscriberAudienceSource {
  audienceFor(userId: number): Promise<ThreadAudience>
}
