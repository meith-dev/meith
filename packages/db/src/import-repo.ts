/**
 * F85 — the legacy-id map and the run's cursors.
 *
 * The interesting table is `legacy_ids`. Every MyBB URL contains an id, so F86's
 * redirects are a lookup here — and an import that did not record the mapping
 * would be a one-way door that breaks every inbound link a board has
 * accumulated, which for a forum is most of its traffic.
 */

import { sql } from 'drizzle-orm'

import type { Database } from './client'
/*
 * `db.execute` returns a driver-shaped result, and the two drivers disagree:
 * postgres-js hands back something array-like, PGlite a `{ rows }` object. Every
 * read in this package goes through `resultRows` for that reason.
 *
 * This file did not, and cast the result to an array instead. That is correct
 * under postgres-js and empty under PGlite — so every lookup here returned
 * nothing in any PGlite-backed test, and no test covered them, which is the only
 * reason it survived. F85's sink is the first caller with an integration test,
 * and it failed on the first run.
 */
import { resultRows } from './result-rows'

export type LegacyKind = 'user' | 'forum' | 'thread' | 'post'

/**
 * Record a mapping. Idempotent, because the import is.
 *
 * `do update` rather than `do nothing`: re-importing a row that was deleted and
 * re-created on this board should point the old URL at the *current* row, not at
 * an id that no longer exists.
 */
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

/** What a MyBB id became here, or `null` when it was never imported. */
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

/**
 * Resolve many at once.
 *
 * The import maps a page of rows at a time and needs their parents' new ids; one
 * query per row would make a 200-row page 200 round trips, which on a pooled
 * serverless connection is the difference between an import that finishes and
 * one that times out every run.
 */
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
        and legacy_id in (${sql.join(legacyIds.map((id) => sql`${id}`), sql`, `)})
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

/**
 * The run in progress, or `null`.
 *
 * A partial unique index enforces one at a time. Two concurrent runs would
 * interleave two cursor sets over one destination, and the failure — rows
 * imported twice under different ids — is what the idempotency was meant to
 * prevent.
 */
export async function currentImportRun(db: Database): Promise<ImportRunRow | null> {
  const rows = resultRows<{
    id: number
    cursors: Record<string, number>
    status: string
    rows_read: number
  }>(
    await db.execute(sql`
      select id, cursors, status, rows_read from import_runs
      where status = 'running' and source = 'mybb'
      limit 1
    `),
  )

  const row = rows[0]
  return row === undefined
    ? null
    : { id: row.id, cursors: row.cursors, status: row.status, rowsRead: row.rows_read }
}

export async function startImportRun(db: Database): Promise<number> {
  const rows = resultRows<{ id: number }>(
    await db.execute(sql`insert into import_runs (source) values ('mybb') returning id`),
  )
  return rows[0]!.id
}

/** Save progress. Called after every chunk, so a crash loses one chunk at most. */
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
