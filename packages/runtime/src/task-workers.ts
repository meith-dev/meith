import { type BanRepository, BanService } from '@meith/accounts'
import type { AttachmentService } from '@meith/attachments'
import type { AvatarService } from '@meith/avatars'
import { optional, type QueueDriver } from '@meith/core'
import { type EventRegistry, type OutboxReader, relayOutbox as runOutboxRelay } from '@meith/events'
import { type PromotionGuards, PromotionService } from '@meith/groups'
import { type WarningRepository, WarningService } from '@meith/moderation'
import type { NotificationService } from '@meith/notifications'
import {
  SubscriptionNotifier,
  type SubscriptionRepository,
  type VisibleForumSource,
} from '@meith/subscriptions'
import type { TaskWorkers } from '@meith/tasks'

import { SEED_GROUP } from './groups'
import { deliverWebhooks, type WebhookDeliveryStore } from './webhook-delivery'

export interface TaskWorkerDeps {
  readonly queue: QueueDriver
  readonly bans: BanRepository
  readonly promotions: ConstructorParameters<typeof PromotionService>[0]['promotions']
  readonly guards: PromotionGuards
  readonly maintenance: {
    pruneSessions(now: Date, limit?: number): Promise<number>
    pruneExpiredTokens(now: Date, limit?: number): Promise<number>
  }
  readonly rateLimits?: { prune(before: Date, limit?: number): Promise<number> }
  readonly authEvents?: {
    retentionDays(): Promise<number>
    pruneBefore(cutoff: Date, limit?: number): Promise<number>
  }
  readonly timedGroups?: { expire(limit: number): Promise<number> }
  readonly outbox: OutboxReader
  readonly events: EventRegistry
  readonly recount: { run(batchSize: number): Promise<{ corrected: number }> }
  readonly threadViews: { flush(limit: number): Promise<number> }
  readonly renderBackfill: { run(batchSize: number): Promise<{ rendered: number }> }
  readonly searchIndex?:
    | { reindexChunk(afterPostId: number, limit: number): Promise<{ indexed: number }> }
    | undefined
  readonly webhooks?: WebhookDeliveryStore | undefined
  readonly warnings: WarningRepository
  readonly subscriptions?: {
    readonly repository: SubscriptionRepository
    readonly notifications: NotificationService
    readonly forums: VisibleForumSource
    readonly unsubscribeSecret: string | null
  }
  readonly attachments?: AttachmentService
  readonly avatars?: AvatarService
  readonly statistics?: {
    readonly stats: { rollUp(now: Date): Promise<{ memberCount: number }> }
    readonly presence: {
      concurrentCount(now: Date): Promise<number>
      recordIfHigher(count: number, now: Date): Promise<boolean>
    }
  }
}

export function defaultPromotionGuards(): PromotionGuards {
  return {
    protectedGroupIds: [SEED_GROUP.banned, SEED_GROUP.administrators, SEED_GROUP.superModerators],
    rank: new Map([
      [SEED_GROUP.guest, 0],
      [SEED_GROUP.registered, 2],
      [SEED_GROUP.superModerators, 8],
      [SEED_GROUP.administrators, 9],
    ]),
  }
}

export function taskWorkers(deps: TaskWorkerDeps): Partial<TaskWorkers> {
  const bans = new BanService({ bans: deps.bans, bannedGroupId: SEED_GROUP.banned })
  const promotions = new PromotionService({
    promotions: deps.promotions,
    guards: deps.guards,
  })

  return {
    async relayOutbox(batchSize) {
      const { claimed } = await runOutboxRelay({
        reader: deps.outbox,
        target: {
          async enqueue(jobs) {
            for (const job of jobs) {
              await deps.queue.enqueue(job.name, job.payload, {
                dedupeKey: job.idempotencyKey,
              })
            }
          },
        },
        handlerIdsFor: (event) => deps.events.handlerIdsFor(event),
        batchSize,
      })
      return claimed
    },

    async drainQueue(batchSize, signal) {
      const { processed } = await deps.queue.drain(
        batchSize,
        async (job) => {
          await deps.events.dispatch(job.kind, job.payload)
        },
        { signal },
      )
      return processed
    },

    async reconcileCounters(batchSize) {
      const { corrected } = await deps.recount.run(batchSize)
      return corrected
    },

    async flushThreadViews(batchSize) {
      return deps.threadViews.flush(batchSize)
    },

    async backfillPostRenders(batchSize) {
      const { rendered } = await deps.renderBackfill.run(batchSize)
      return rendered
    },

    ...optional(deps.searchIndex, (searchIndex) => ({
      async reindexSearch(batchSize: number) {
        const { indexed } = await searchIndex.reindexChunk(0, batchSize)
        return indexed
      },
    })),

    ...optional(deps.webhooks, (webhooks) => ({
      async deliverWebhooks(batchSize: number) {
        return deliverWebhooks(webhooks, batchSize)
      },
    })),

    async pruneSessions() {
      return deps.maintenance.pruneSessions(new Date())
    },

    async pruneExpiredTokens() {
      return deps.maintenance.pruneExpiredTokens(new Date())
    },

    ...(deps.rateLimits === undefined
      ? {}
      : {
          async pruneRateLimits() {
            const before = new Date(Date.now() - 2 * 3600 * 1000)
            return deps.rateLimits!.prune(before)
          },
        }),

    ...optional(deps.authEvents, (authEvents) => ({
      async pruneAuthEvents() {
        const days = await authEvents.retentionDays()
        if (days <= 0) return 0

        return authEvents.pruneBefore(new Date(Date.now() - days * 86_400_000))
      },
    })),

    async applyPromotions(batchSize) {
      const result = await promotions.apply(batchSize)
      return result.outcomes.length
    },

    async expireBans(batchSize) {
      return bans.expireDue(batchSize)
    },

    ...optional(deps.timedGroups, (timedGroups) => ({
      async expireGroupMemberships(batchSize: number) {
        return timedGroups.expire(batchSize)
      },
    })),

    async expireWarnings(batchSize) {
      return new WarningService({ warnings: deps.warnings, bans: banPort(bans) }).expireDue(
        batchSize,
      )
    },

    ...optional(deps.subscriptions, () => ({
      async notifySubscribers(batchSize: number, signal: AbortSignal) {
        const { notified } = await subscriptionNotifier(deps).runInstant(batchSize, signal)
        return notified
      },

      async sendDigests(batchSize: number, signal: AbortSignal) {
        const notifier = subscriptionNotifier(deps)
        const daily = await notifier.runDigest('daily', batchSize, signal)
        if (signal.aborted) return daily.notified

        const weekly = await notifier.runDigest('weekly', batchSize, signal)
        return daily.notified + weekly.notified
      },
    })),

    ...optional(deps.attachments, (attachments) => ({
      async sweepAttachments(batchSize: number) {
        return attachments.sweep(batchSize)
      },
    })),

    ...optional(deps.avatars, (avatars) => ({
      async sweepAvatars(batchSize: number) {
        return avatars.sweep(batchSize)
      },
    })),

    ...optional(deps.statistics, (statistics) => ({
      async rollUpStatistics() {
        const now = new Date()
        const { memberCount } = await statistics.stats.rollUp(now)
        const online = await statistics.presence.concurrentCount(now)
        const record = await statistics.presence.recordIfHigher(online, now)
        return { memberCount, online, record }
      },
    })),
  }
}

function subscriptionNotifier(deps: TaskWorkerDeps): SubscriptionNotifier {
  const wiring = deps.subscriptions!
  return new SubscriptionNotifier({
    subscriptions: wiring.repository,
    forums: wiring.forums,
    unsubscribeSecret: wiring.unsubscribeSecret,
    notifications: {
      async raise(input) {
        await wiring.notifications.raise({
          userId: input.userId,
          kind: input.kind,
          data: input.data as Parameters<NotificationService['raise']>[0]['data'],
          href: input.href,
          dedupeKey: input.dedupeKey,
        })
      },
    },
  })
}

function banPort(bans: BanService): {
  ban: (input: {
    userId: number
    bannedByUserId: number
    reason: string
    publicReason: string
    expiresAt?: Date | undefined
  }) => Promise<void>
} {
  return {
    async ban(input) {
      await bans.ban(input)
    },
  }
}
