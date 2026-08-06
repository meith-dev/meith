import { sql } from 'drizzle-orm'

import type { Database } from './client'

export async function readVersion(db: Database, component: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    select version from component_versions where component = ${component}
  `)) as unknown as { version: string }[]
  return rows[0]?.version ?? null
}

export async function readVersions(db: Database): Promise<Readonly<Record<string, string>>> {
  const rows = (await db.execute(sql`
    select component, version from component_versions order by component
  `)) as unknown as { component: string; version: string }[]

  return Object.fromEntries(rows.map((row) => [row.component, row.version]))
}

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
