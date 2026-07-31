/**
 * The app-tier implementations behind the scheduled tasks (F06).
 *
 * `@forum/tasks` owns *when* a task runs and `@forum/db` owns the SQL; this is
 * the composition point where a task id becomes actual work. It lives in the
 * app rather than in a package because assembling concrete infrastructure is an
 * application concern — the same reason `container.ts` does.
 *
 * **Only workers that can genuinely do something are returned.** `builtinTasks`
 * registers a task only when its worker is supplied, so an absent worker means
 * an unregistered task rather than a stub reporting healthy runs of nothing.
 * See D32.
 */
import type { TaskWorkers } from '@forum/tasks'
import { BanService, type BanRepository } from '@forum/accounts'
import { WarningService, type WarningRepository } from '@forum/moderation'
import { PromotionService, type PromotionGuards } from '@forum/groups'
import {
  relayOutbox as runOutboxRelay,
  type EventRegistry,
  type OutboxReader,
} from '@forum/events'
import type { QueueDriver } from '@forum/core'

import { SEED_GROUP } from './groups'

export interface TaskWorkerDeps {
  readonly queue: QueueDriver
  readonly bans: BanRepository
  readonly promotions: ConstructorParameters<typeof PromotionService>[0]['promotions']
  readonly guards: PromotionGuards
  readonly maintenance: {
    pruneSessions(now: Date, limit?: number): Promise<number>
    pruneExpiredTokens(now: Date, limit?: number): Promise<number>
  }
  /** The outbox's read side, and the handlers its events fan out to (F07). */
  readonly outbox: OutboxReader
  readonly events: EventRegistry
  /** F38's bounded resumable recount. */
  readonly recount: { run(batchSize: number): Promise<{ corrected: number }> }
  /** F38's view buffer. */
  readonly threadViews: { flush(limit: number): Promise<number> }
  /** F36's stale-render sweep. */
  readonly renderBackfill: { run(batchSize: number): Promise<{ rendered: number }> }
  /** F53's warning store. */
  readonly warnings: WarningRepository
}

/**
 * Groups an automatic promotion must never move a user out of.
 *
 * Banned first and foremost — a promotion that un-bans somebody is a cron job
 * quietly overruling a moderator (D30). Staff are here because a broad rule
 * ("10 posts → Registered") would otherwise demote them.
 */
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

/**
 * Build the worker set.
 *
 * Still typed as **partial**: `builtinTasks` registers a task only when its
 * worker is present, and that filter is what keeps an unimplemented feature off
 * the System Health screen instead of showing it as a healthy run of nothing
 * (D32). Every worker the built-in task list names now exists.
 */
export function taskWorkers(deps: TaskWorkerDeps): Partial<TaskWorkers> {
  const bans = new BanService({ bans: deps.bans, bannedGroupId: SEED_GROUP.banned })
  const promotions = new PromotionService({
    promotions: deps.promotions,
    guards: deps.guards,
  })

  return {
    /**
     * Move committed events onto the queue.
     *
     * The relay enqueues one job per (event, handler) pair, keyed by
     * `outbox:<row>:<handler>`, and only marks the row dispatched once the
     * enqueue has returned. Dying in between re-relays the event, which the
     * key deduplicates and — where it cannot, because the first job already
     * ran — the handler's own idempotency absorbs.
     */
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

    async drainQueue(batchSize) {
      /*
       * A relayed job's `kind` *is* the handler id — that is the whole contract
       * between the relay and this drain. An unknown id is a no-op rather than a
       * throw: a rolling deploy can leave jobs naming a handler this build
       * removed, and retrying those forever would eventually dead-letter every
       * one of them for no reason.
       */
      const { processed } = await deps.queue.drain(batchSize, async (job) => {
        await deps.events.dispatch(job.kind, job.payload)
      })
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

    async pruneSessions() {
      return deps.maintenance.pruneSessions(new Date())
    },

    async pruneExpiredTokens() {
      return deps.maintenance.pruneExpiredTokens(new Date())
    },

    async applyPromotions(batchSize) {
      const result = await promotions.apply(batchSize)
      return result.outcomes.length
    },

    async expireBans(batchSize) {
      return bans.expireDue(batchSize)
    },

    /*
     * The same `WarningService` the moderator screens use, not a second copy of
     * the arithmetic. Expiry has to re-evaluate the level and lift a
     * restriction, which is exactly what issuing and revoking do — three
     * callers, one evaluation (D52).
     */
    async expireWarnings(batchSize) {
      return new WarningService({ warnings: deps.warnings, bans: banPort(bans) }).expireDue(
        batchSize,
      )
    },
  }
}

/**
 * F23's `BanService` behind F53's narrow port.
 *
 * An adapter rather than a direct dependency because the warning service needs
 * exactly one verb — `ban` — and handing it the whole service would let a
 * future change reach `lift`, which must stay a human decision (D52).
 */
function banPort(bans: BanService): { ban: (input: {
  userId: number
  bannedByUserId: number
  reason: string
  publicReason: string
  expiresAt?: Date | undefined
}) => Promise<void> } {
  return {
    async ban(input) {
      await bans.ban(input)
    },
  }
}
