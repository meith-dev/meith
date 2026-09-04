import { sql } from 'drizzle-orm'

import { MYBB_PREFIX, PHPBB_PREFIX } from '@meith/accounts'
import type { TaskHealthInput } from '@meith/tasks'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

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

export interface BoardVolumes {
  readonly users: number
  readonly threads: number
  readonly posts: number
  readonly attachments: number
  readonly queuedJobs: number
  readonly deadLetteredJobs: number
}

export class PostgresSystemHealthRepository {
  constructor(private readonly db: Database) {}

  async taskHealth(): Promise<readonly TaskHealthInput[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select key, interval_seconds, enabled, last_run_at, next_run_at,
               locked_until, consecutive_failures
          from tasks order by key
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      key: String(row.key),
      intervalSeconds: Number(row.interval_seconds),
      enabled: row.enabled === true,
      lastRunAt: row.last_run_at === null ? null : toDate(row.last_run_at),
      nextRunAt: row.next_run_at === null ? null : toDate(row.next_run_at),
      lockedUntil: row.locked_until === null ? null : toDate(row.locked_until),
      consecutiveFailures: Number(row.consecutive_failures),
    }))
  }

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

  async legacyPasswordHashes(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as count
          from users
         where deleted_at is null
           and (password_hash like ${`${MYBB_PREFIX}%`}
                or password_hash like ${`${PHPBB_PREFIX}%`})
      `),
    ) as Array<Record<string, unknown>>

    return Number(rows[0]?.count ?? 0)
  }

  async activeConnections(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as active
          from pg_stat_activity
         where datname = current_database()
      `),
    ) as Array<Record<string, unknown>>

    return Number(rows[0]?.active ?? 0)
  }
}
