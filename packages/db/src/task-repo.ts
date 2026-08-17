import { sql } from 'drizzle-orm'

import type { TaskRepository } from '@meith/tasks'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { taskLog, tasks } from './schema'

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  async ensureRegistered(
    definitions: readonly { id: string; intervalSeconds: number }[],
  ): Promise<void> {
    if (definitions.length === 0) return

    await this.db
      .insert(tasks)
      .values(
        definitions.map((d) => ({
          key: d.id,
          intervalSeconds: d.intervalSeconds,
        })),
      )
      .onConflictDoUpdate({
        target: tasks.key,
        set: { intervalSeconds: sql`excluded.interval_seconds` },
      })
  }

  async claim(input: {
    taskId: string
    now: Date
    dueBefore: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null> {
    const leaseMs = input.now.getTime() - input.staleBefore.getTime()
    const lockedUntil = new Date(input.now.getTime() + leaseMs)

    const result = await this.db.execute(sql`
      with previous as (
        select key, last_run_at from tasks where key = ${input.taskId}
      )
      update tasks as t
         set locked_until = ${lockedUntil},
             last_run_at  = ${input.now}
        from previous p
       where t.key = p.key
         and t.enabled
         and (t.locked_until is null or t.locked_until <= ${input.now})
         and (t.last_run_at is null or t.last_run_at <= ${input.dueBefore})
      returning p.last_run_at as previous_last_run_at
    `)

    const row = resultRows<{ previous_last_run_at: Date | string | null }>(result)[0]
    if (!row) return null

    const previous = row.previous_last_run_at
    return {
      previousLastRunAt:
        previous === null ? null : previous instanceof Date ? previous : new Date(previous),
    }
  }

  async release(input: {
    taskId: string
    finishedAt: Date
    success: boolean
    detail?: Record<string, unknown>
    error?: string
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        update tasks
           set locked_until = null,
               -- Explicit cast: an untyped bind parameter leaves Postgres
               -- unable to resolve timestamp-plus-interval at parse time.
               next_run_at = ${input.finishedAt}::timestamptz
                             + make_interval(secs => interval_seconds),
               consecutive_failures = ${input.success ? sql`0` : sql`consecutive_failures + 1`}
         where key = ${input.taskId}
      `)

      await tx.insert(taskLog).values({
        taskKey: input.taskId,
        succeeded: input.success,
        detail: input.detail === undefined ? null : JSON.stringify(input.detail),
        error: input.error ?? null,
        ranAt: input.finishedAt,
      })
    })
  }
}
