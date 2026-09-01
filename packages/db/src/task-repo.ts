import { sql } from 'drizzle-orm'

import type { TaskRepository } from '@meith/tasks'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { taskLog, tasks } from './schema'

const NEVER_RUN = new Date(0)

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  async ensureRegistered(
    definitions: readonly {
      id: string
      intervalSeconds: number
      schedule?: string
      firstRunAt?: Date
    }[],
  ): Promise<void> {
    if (definitions.length === 0) return

    await this.db
      .insert(tasks)
      .values(
        definitions.map((d) => ({
          key: d.id,
          intervalSeconds: d.intervalSeconds,
          schedule: d.schedule ?? null,
          nextRunAt: d.firstRunAt ?? NEVER_RUN,
        })),
      )
      .onConflictDoUpdate({
        target: tasks.key,
        set: {
          intervalSeconds: sql`excluded.interval_seconds`,
          schedule: sql`excluded.schedule`,
          nextRunAt: sql`
            case when excluded.schedule is not null
                 then ${tasks.nextRunAt}
                 when ${tasks.intervalSeconds} is distinct from excluded.interval_seconds
                 then coalesce(${tasks.lastRunAt}, now())
                      + make_interval(secs => excluded.interval_seconds)
                 else ${tasks.nextRunAt}
            end
          `,
        },
      })
  }

  async claim(input: {
    taskId: string
    now: Date
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
         and t.next_run_at <= ${input.now}
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
    nextRunAt?: Date
  }): Promise<void> {
    const nextRunExpr =
      input.nextRunAt === undefined
        ? sql`${input.finishedAt}::timestamptz + make_interval(secs => interval_seconds)`
        : sql`${input.nextRunAt}::timestamptz`

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        update tasks
           set locked_until = null,
               next_run_at = ${nextRunExpr},
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
