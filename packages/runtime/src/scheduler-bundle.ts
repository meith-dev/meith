/**
 * The scheduler bundle: which tasks exist, and what backs each one.
 *
 * Lifted out of `container.ts` when F13's `task:run` and F04's worker turned
 * out to need the identical object. The rule it preserves is D32's: a *partial*
 * worker set goes in, `builtinTasks` registers only what can run, and a task
 * whose worker does not exist yet is absent rather than stubbed — so it never
 * appears as a healthy run of nothing.
 */
import type { QueueDriver } from '@forum/core'
import {
  getDb,
  PostgresBanRepository,
  PostgresContentCounterRepository,
  PostgresCounterRecount,
  PostgresMaintenanceRepository,
  PostgresOutboxReader,
  PostgresPromotionRepository,
  PostgresRenderBackfill,
  PostgresTaskRepository,
  PostgresThreadViewBuffer,
  PostgresWarningRepository,
  type Database,
} from '@forum/db'
import { builtinTasks, type TaskDefinition, type TaskRepository } from '@forum/tasks'

import { buildEventRegistry } from './event-handlers'
import { defaultPromotionGuards, taskWorkers } from './task-workers'

export interface SchedulerBundle {
  readonly repository: TaskRepository
  readonly tasks: readonly TaskDefinition[]
}

/**
 * Everything a tick needs, over a real database.
 *
 * `db` is optional so the app can hand in the client it already holds — opening
 * a second pool per request would be a connection leak on a serverless platform
 * — while the CLI and the worker, which have no client of their own, get one.
 */
export function buildSchedulerBundle(deps: {
  readonly queue: QueueDriver
  readonly db?: Database
}): SchedulerBundle {
  const db = deps.db ?? getDb()
  const threadViews = new PostgresThreadViewBuffer(db)

  return {
    repository: new PostgresTaskRepository(db),
    tasks: builtinTasks(
      taskWorkers({
        queue: deps.queue,
        bans: new PostgresBanRepository(db),
        promotions: new PostgresPromotionRepository(db),
        guards: defaultPromotionGuards(),
        maintenance: new PostgresMaintenanceRepository(db),
        outbox: new PostgresOutboxReader(db),
        events: buildEventRegistry({
          counters: new PostgresContentCounterRepository(db),
        }),
        recount: new PostgresCounterRecount(db),
        renderBackfill: new PostgresRenderBackfill(db),
        threadViews,
        warnings: new PostgresWarningRepository(db),
      }),
    ),
  }
}
