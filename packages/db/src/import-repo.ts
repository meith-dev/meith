import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export type LegacyKind = 'user' | 'forum' | 'thread' | 'post' | 'poll' | 'pm' | 'attachment'

export async function mapLegacyId(
  db: Database,
  kind: LegacyKind,
  legacyId: number,
  newId: number,
): Promise<void> {
  await db.execute(sql`
    insert into legacy_ids (kind, legacy_id, new_id)
    values (${kind}, ${legacyId}, ${newId})
    on conflict (kind, legacy_id) do update set new_id = excluded.new_id
  `)
}

export async function resolveLegacyId(
  db: Database,
  kind: LegacyKind,
  legacyId: number,
): Promise<number | null> {
  const rows = resultRows<{ new_id: number }>(
    await db.execute(
      sql`select new_id from legacy_ids where kind = ${kind} and legacy_id = ${legacyId}`,
    ),
  )

  return rows[0]?.new_id ?? null
}

export async function resolveLegacyIds(
  db: Database,
  kind: LegacyKind,
  legacyIds: readonly number[],
): Promise<ReadonlyMap<number, number>> {
  if (legacyIds.length === 0) return new Map()

  const rows = resultRows<{ legacy_id: number; new_id: number }>(
    await db.execute(sql`
      select legacy_id, new_id from legacy_ids
      where kind = ${kind}
        and legacy_id in (${sql.join(
          legacyIds.map((id) => sql`${id}`),
          sql`, `,
        )})
    `),
  )

  return new Map(rows.map((row) => [row.legacy_id, row.new_id]))
}

export interface ImportRunRow {
  readonly id: number
  readonly cursors: Record<string, number>
  readonly status: string
  readonly rowsRead: number
}

export type ImportSourceName = 'mybb' | 'phpbb'

export async function currentImportRun(
  db: Database,
  source: ImportSourceName,
): Promise<ImportRunRow | null> {
  const rows = resultRows<{
    id: number
    cursors: Record<string, number>
    status: string
    rows_read: number
  }>(
    await db.execute(sql`
      select id, cursors, status, rows_read from import_runs
      where status = 'running' and source = ${source}
      limit 1
    `),
  )

  const row = rows[0]
  return row === undefined
    ? null
    : { id: row.id, cursors: row.cursors, status: row.status, rowsRead: row.rows_read }
}

export async function startImportRun(db: Database, source: ImportSourceName): Promise<number> {
  const rows = resultRows<{ id: number }>(
    await db.execute(sql`insert into import_runs (source) values (${source}) returning id`),
  )
  return rows[0]!.id
}

export async function saveImportProgress(
  db: Database,
  id: number,
  cursors: Record<string, number>,
  rowsRead: number,
  report: unknown,
): Promise<void> {
  await db.execute(sql`
    update import_runs
    set cursors = ${JSON.stringify(cursors)}::jsonb,
        rows_read = rows_read + ${rowsRead},
        report = ${JSON.stringify(report)}::jsonb,
        updated_at = now()
    where id = ${id}
  `)
}

export async function finishImportRun(
  db: Database,
  id: number,
  status: 'finished' | 'failed',
  error: string | null,
): Promise<void> {
  await db.execute(sql`
    update import_runs
    set status = ${status}, last_error = ${error}, updated_at = now()
    where id = ${id}
  `)
}
