import { sql } from 'drizzle-orm'

import type {
  BackupRunFinish,
  BackupRunRecord,
  BackupRunRepository,
  BackupRunStatus,
  BackupTrigger,
} from '@meith/backup'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

const COLUMNS = sql`
  id, trigger, status, requested_by_user_id, requested_at, started_at, finished_at,
  heartbeat_at, bundle_name, size_bytes, uploads, shipped, skipped_keys, error
`

function toRecord(row: Record<string, unknown>): BackupRunRecord {
  const optionalDate = (value: unknown): Date | null => (value === null ? null : toDate(value))
  return {
    id: Number(row.id),
    trigger: String(row.trigger) as BackupTrigger,
    status: String(row.status) as BackupRunStatus,
    requestedByUserId: row.requested_by_user_id === null ? null : Number(row.requested_by_user_id),
    requestedAt: toDate(row.requested_at),
    startedAt: optionalDate(row.started_at),
    finishedAt: optionalDate(row.finished_at),
    heartbeatAt: optionalDate(row.heartbeat_at),
    bundleName: row.bundle_name === null ? null : String(row.bundle_name),
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    uploads:
      row.uploads === 'included' || row.uploads === 'skipped'
        ? (row.uploads as 'included' | 'skipped')
        : null,
    shipped: row.shipped === true,
    skippedKeys: Number(row.skipped_keys),
    error: row.error === null ? null : String(row.error),
  }
}

export class PostgresBackupRunRepository implements BackupRunRepository {
  constructor(private readonly db: Database) {}

  async enqueue(input: {
    readonly trigger: BackupTrigger
    readonly requestedByUserId?: number | null | undefined
    readonly now: Date
  }): Promise<{ readonly id: number; readonly queued: boolean }> {
    return this.db.transaction(async (tx) => {
      const pending = resultRows<{ id: number }>(
        await tx.execute(sql`
          select id from backup_runs
           where status in ('queued', 'running')
           order by id
           limit 1
             for update
        `),
      )[0]
      if (pending !== undefined) return { id: Number(pending.id), queued: false }

      const inserted = resultRows<{ id: number }>(
        await tx.execute(sql`
          insert into backup_runs (trigger, status, requested_by_user_id, requested_at)
          values (${input.trigger}, 'queued', ${input.requestedByUserId ?? null}, ${input.now})
          returning id
        `),
      )[0]
      return { id: Number(inserted?.id), queued: true }
    })
  }

  async claimNext(now: Date): Promise<BackupRunRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        update backup_runs
           set status = 'running', started_at = ${now}, heartbeat_at = ${now}
         where id = (
           select id from backup_runs
            where status = 'queued'
              and not exists (select 1 from backup_runs where status = 'running')
            order by id
            limit 1
              for update skip locked
         )
        returning ${COLUMNS}
      `),
    ) as Array<Record<string, unknown>>
    const row = rows[0]
    return row === undefined ? null : toRecord(row)
  }

  async heartbeat(id: number, now: Date): Promise<void> {
    await this.db.execute(sql`
      update backup_runs set heartbeat_at = ${now} where id = ${id} and status = 'running'
    `)
  }

  async finish(id: number, outcome: BackupRunFinish): Promise<void> {
    await this.db.execute(sql`
      update backup_runs
         set status = ${outcome.status},
             finished_at = ${outcome.finishedAt},
             heartbeat_at = ${outcome.finishedAt},
             bundle_name = ${outcome.bundleName ?? null},
             size_bytes = ${outcome.sizeBytes ?? null},
             uploads = ${outcome.uploads ?? null},
             shipped = ${outcome.shipped ?? false},
             skipped_keys = ${outcome.skippedKeys ?? 0},
             error = ${outcome.error ?? null}
       where id = ${id}
    `)
  }

  async active(now: Date, staleBefore: Date): Promise<BackupRunRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS} from backup_runs
         where status = 'queued'
            or (status = 'running' and coalesce(heartbeat_at, started_at, ${now}) > ${staleBefore})
         order by id
         limit 1
      `),
    ) as Array<Record<string, unknown>>
    const row = rows[0]
    return row === undefined ? null : toRecord(row)
  }

  async recent(limit: number): Promise<readonly BackupRunRecord[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS} from backup_runs order by id desc limit ${limit}
      `),
    ) as Array<Record<string, unknown>>
    return rows.map(toRecord)
  }

  async lastScheduledAt(): Promise<Date | null> {
    const rows = resultRows<{ requested_at: unknown }>(
      await this.db.execute(sql`
        select requested_at from backup_runs
         where trigger = 'schedule'
         order by id desc
         limit 1
      `),
    )
    const row = rows[0]
    return row === undefined ? null : toDate(row.requested_at)
  }

  async failInterrupted(now: Date, staleBefore: Date): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        update backup_runs
           set status = 'failed',
               finished_at = ${now},
               error = 'The backup was interrupted before it finished: the process running it stopped.'
         where status = 'running'
           and coalesce(heartbeat_at, started_at, requested_at) <= ${staleBefore}
        returning id
      `),
    )
    return rows.length
  }

  async record(input: {
    readonly trigger: BackupTrigger
    readonly requestedByUserId?: number | null | undefined
    readonly startedAt: Date
    readonly outcome: BackupRunFinish
  }): Promise<void> {
    const { outcome } = input
    await this.db.execute(sql`
      insert into backup_runs (
        trigger, status, requested_by_user_id, requested_at, started_at, finished_at,
        heartbeat_at, bundle_name, size_bytes, uploads, shipped, skipped_keys, error
      ) values (
        ${input.trigger}, ${outcome.status}, ${input.requestedByUserId ?? null},
        ${input.startedAt}, ${input.startedAt}, ${outcome.finishedAt}, ${outcome.finishedAt},
        ${outcome.bundleName ?? null}, ${outcome.sizeBytes ?? null}, ${outcome.uploads ?? null},
        ${outcome.shipped ?? false}, ${outcome.skippedKeys ?? 0}, ${outcome.error ?? null}
      )
    `)
  }
}
