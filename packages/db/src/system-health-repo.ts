/**
 * F70 — what the System Health screen reads.
 *
 * `tasks` and `task_log` have been written since F06 and read by nothing an
 * operator can see: the scheduler updates them and the CLI prints a summary,
 * but a board owner had no way to find out that the tick stopped. That is the
 * gap this closes, and it is the one that matters most on this list — every
 * catch-up operation the board has runs on that tick, and none of them *fail*
 * when it stops. They simply do not happen.
 *
 * The verdict itself is not here. "How late is too late" is a judgement about
 * the domain and lives in `@forum/tasks` as a pure function, so the screen, the
 * CLI and any future alerting reach the same answer from the same code.
 */
import { sql } from 'drizzle-orm'

import type { TaskHealthInput } from '@forum/tasks'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface TaskRunRow {
  readonly taskKey: string
  readonly succeeded: boolean
  readonly durationMs: number | null
  readonly detail: string | null
  readonly error: string | null
  readonly ranAt: Date
}

export interface RecountStateRow {
  readonly id: string
  readonly phase: string
  readonly cursor: number
  readonly passes: number
  readonly corrected: number
  readonly updatedAt: Date | null
}

/** Row counts an operator asks about when the board feels slow. */
export interface BoardVolumes {
  readonly users: number
  readonly threads: number
  readonly posts: number
  readonly attachments: number
  readonly queuedJobs: number
  readonly deadLetteredJobs: number
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

export class PostgresSystemHealthRepository {
  constructor(private readonly db: Database) {}

  /** Every registered task, in the shape `assessScheduler` wants. */
  async taskHealth(): Promise<readonly TaskHealthInput[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, interval_seconds, enabled, last_run_at, next_run_at,
               consecutive_failures
          from tasks order by key
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      key: String(row.key),
      intervalSeconds: Number(row.interval_seconds),
      enabled: row.enabled === true,
      lastRunAt: row.last_run_at === null ? null : toDate(row.last_run_at),
      nextRunAt: row.next_run_at === null ? null : toDate(row.next_run_at),
      consecutiveFailures: Number(row.consecutive_failures),
    }))
  }

  /**
   * The most recent runs, newest first.
   *
   * Failures included rather than filtered out: the log is where an operator
   * looks *after* the health summary has told them something is wrong, and the
   * error text is the only thing on this screen that says why.
   */
  async recentRuns(limit = 20): Promise<readonly TaskRunRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select task_key, succeeded, duration_ms, detail, error, ran_at
          from task_log order by ran_at desc, id desc limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      taskKey: String(row.task_key),
      succeeded: row.succeeded === true,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      detail: row.detail === null ? null : String(row.detail),
      error: row.error === null ? null : String(row.error),
      ranAt: toDate(row.ran_at),
    }))
  }

  /** F38's resumable recount, and how far it has got. */
  async recountState(): Promise<readonly RecountStateRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, phase, cursor, passes, corrected, updated_at
          from counter_recount_state order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: String(row.id),
      phase: String(row.phase),
      cursor: Number(row.cursor),
      passes: Number(row.passes),
      corrected: Number(row.corrected),
      updatedAt: row.updated_at === null ? null : toDate(row.updated_at),
    }))
  }

  /**
   * Volumes, in one round trip.
   *
   * Counted rather than estimated. These are read on a screen an operator opens
   * occasionally, and an approximate row count that disagrees with the member
   * list would cost more trust than the query costs milliseconds.
   */
  async volumes(): Promise<BoardVolumes> {
    const rows = resultRows(
      await this.db.execute(sql`
        select
          (select count(*) from users where deleted_at is null)::int as users,
          (select count(*) from threads)::int as threads,
          (select count(*) from posts)::int as posts,
          (select count(*) from attachments)::int as attachments,
          (select count(*) from jobs where status in ('pending', 'running'))::int
            as queued_jobs,
          (select count(*) from jobs where status = 'dead')::int as dead_lettered
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0] as Record<string, unknown>
    return {
      users: Number(row.users),
      threads: Number(row.threads),
      posts: Number(row.posts),
      attachments: Number(row.attachments),
      queuedJobs: Number(row.queued_jobs),
      deadLetteredJobs: Number(row.dead_lettered),
    }
  }
}
