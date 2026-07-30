/**
 * Postgres implementation of `TaskRepository` (F06).
 *
 * The whole feature rests on `claim` being atomic. Two overlapping ticks — a
 * slow run plus the next cron fire, a platform retry, a worker loop racing the
 * cron — must never both run the same task. Serverless instances share no
 * memory, so a JavaScript mutex protects nothing; the guard has to be a
 * conditional UPDATE that only one transaction can win.
 */
import { sql } from 'drizzle-orm'

import type { TaskRepository } from '@forum/tasks'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { taskLog, tasks } from './schema'

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  /**
   * Ensure a row exists per registered task.
   *
   * `interval_seconds` is updated on conflict so changing a task's cadence in
   * code takes effect on the next deploy, but the runtime columns
   * (`last_run_at`, `locked_until`, `consecutive_failures`) are deliberately
   * left alone — a deploy must not reset a task's history or steal a live lease
   * from a tick that is still running.
   */
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

  /**
   * Claim a task if it is due and unlocked, in one statement.
   *
   * A read-then-write would reintroduce the race it exists to close: two ticks
   * both read "not running", both write "running", both execute. The `WHERE`
   * clause carries the whole guard, so the second UPDATE matches zero rows and
   * returns null.
   *
   * The CTE captures `last_run_at` *before* the update, because the scheduler
   * needs the previous value to compute `elapsedSeconds` and `RETURNING` would
   * otherwise hand back the value just written.
   */
  async claim(input: {
    taskId: string
    now: Date
    dueBefore: Date
    staleBefore: Date
  }): Promise<{ previousLastRunAt: Date | null } | null> {
    /*
     * The scheduler expresses staleness as "a claim older than staleBefore is
     * abandoned", which is the same thing as a lease of (now - staleBefore).
     * Storing an absolute expiry rather than a claim time means a crashed
     * worker's lease lapses on its own with nothing to clean up.
     */
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

  /**
   * Release the lease, schedule the next run, and record what happened.
   *
   * `next_run_at` is set from `finishedAt`, not from when the task became due:
   * anchoring to the due time would make a task that overran its interval fire
   * again immediately and keep doing so, which turns one slow run into a busy
   * loop.
   *
   * `consecutive_failures` is reset on success and incremented on failure — it
   * is what F70's System Health reads to tell "a task is failing" from "a task
   * failed once".
   */
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
               consecutive_failures = ${
                 input.success ? sql`0` : sql`consecutive_failures + 1`
               }
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
