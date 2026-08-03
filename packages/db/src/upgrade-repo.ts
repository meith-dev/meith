/**
 * F84 — the upgrade's reads and its two writes.
 *
 * Everything that *decides* is in `@forum/upgrade` and tested without a
 * database. This is the part that cannot be.
 */

import { sql } from 'drizzle-orm'

import type { Database } from './client'

/** The version recorded for a component, or `null` for one never recorded. */
export async function readVersion(db: Database, component: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    select version from component_versions where component = ${component}
  `)) as unknown as { version: string }[]
  return rows[0]?.version ?? null
}

/** Every recorded version, for the ACP's table. */
export async function readVersions(db: Database): Promise<Readonly<Record<string, string>>> {
  const rows = (await db.execute(sql`
    select component, version from component_versions order by component
  `)) as unknown as { component: string; version: string }[]

  return Object.fromEntries(rows.map((row) => [row.component, row.version]))
}

/** Record a component's version. Idempotent by construction. */
export async function recordVersion(
  db: Database,
  component: string,
  version: string,
): Promise<void> {
  await db.execute(sql`
    insert into component_versions (component, version, updated_at)
    values (${component}, ${version}, now())
    on conflict (component) do update set version = excluded.version, updated_at = now()
  `)
}

/** Which of a plugin's migrations have run. */
export async function appliedPluginMigrations(
  db: Database,
  pluginKey: string,
): Promise<readonly string[]> {
  const rows = (await db.execute(sql`
    select migration_id from plugin_migrations
    where plugin_key = ${pluginKey}
    order by migration_id
  `)) as unknown as { migration_id: string }[]

  return rows.map((row) => row.migration_id)
}

/**
 * Apply one plugin migration, and record it, in one transaction.
 *
 * **The record is part of the migration**, which is the only arrangement that
 * survives a crash between the two. Applied-and-unrecorded means the next run
 * applies it again — a `create table` that fails, or worse, an `insert` that
 * does not; recorded-and-unapplied means a column that never exists and a plugin
 * that fails on every request.
 *
 * Statements run in order inside that transaction. A plugin whose second
 * statement fails leaves neither applied, which is what makes "try the upgrade
 * again" a safe instruction rather than a hopeful one.
 *
 * Returns `false` when the migration was already recorded — the insert conflicts
 * and the statements are skipped, so an interrupted upgrade re-run is a no-op
 * rather than a second application.
 */
export async function applyPluginMigration(
  db: Database,
  pluginKey: string,
  migrationId: string,
  statements: readonly string[],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = (await tx.execute(sql`
      insert into plugin_migrations (plugin_key, migration_id)
      values (${pluginKey}, ${migrationId})
      on conflict (plugin_key, migration_id) do nothing
      returning migration_id
    `)) as unknown as unknown[]

    if (claimed.length === 0) return false

    for (const statement of statements) {
      await tx.execute(sql.raw(statement))
    }
    return true
  })
}
