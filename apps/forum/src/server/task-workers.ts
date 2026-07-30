import 'server-only'

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
import { PromotionService, type PromotionGuards } from '@forum/groups'
import type { QueueDriver } from '@forum/core'

import { SEED_GROUP } from './seed-board'

export interface TaskWorkerDeps {
  readonly queue: QueueDriver
  readonly bans: BanRepository
  readonly promotions: ConstructorParameters<typeof PromotionService>[0]['promotions']
  readonly guards: PromotionGuards
  readonly maintenance: {
    pruneSessions(now: Date, limit?: number): Promise<number>
    pruneExpiredTokens(now: Date, limit?: number): Promise<number>
  }
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
 * Deliberately **partial**. Two workers have no implementation yet and are
 * omitted rather than stubbed:
 *
 *  - `reconcileCounters` needs F38 — there are no maintained counters to
 *    reconcile, so a stub would report a healthy run of nothing;
 *  - `relayOutbox` needs an `OutboxReader`/`RelayTarget` over Postgres, which
 *    `@forum/db` does not implement yet.
 *
 * Each appears as a registered task the moment its worker does.
 */
export function taskWorkers(deps: TaskWorkerDeps): Partial<TaskWorkers> {
  const bans = new BanService({ bans: deps.bans, bannedGroupId: SEED_GROUP.banned })
  const promotions = new PromotionService({
    promotions: deps.promotions,
    guards: deps.guards,
  })

  return {
    async drainQueue(batchSize) {
      const { processed } = await deps.queue.drain(batchSize, async () => {
        /*
         * Handler dispatch arrives with the outbox relay: until events are
         * relayed onto the queue there is nothing enqueued to dispatch, so a
         * handler registry here would have no callers. Draining still matters —
         * it is what proves the queue is wired and drains anything a test or
         * the CLI enqueues.
         */
      })
      return processed
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
  }
}
