import { sql } from 'drizzle-orm'

import { pluginTablePrefix } from '@meith/plugin-kit'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface PluginPurgeResult {
  readonly tables: readonly string[]
  readonly settings: number
  readonly migrations: number
  readonly navigation: number
  readonly versionRemoved: boolean
  readonly healthRemoved: boolean
}

export async function pluginOwnedTables(
  db: Database,
  pluginKey: string,
): Promise<readonly string[]> {
  const rows = resultRows(
    await db.execute(sql`
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and table_type = 'BASE TABLE'
         and table_name like ${`${pluginTablePrefix(pluginKey)}%`}
       order by table_name
    `),
  ) as Array<{ table_name: string }>

  return rows.map((row) => String(row.table_name))
}

export async function purgePlugin(db: Database, pluginKey: string): Promise<PluginPurgeResult> {
  const tables = await pluginOwnedTables(db, pluginKey)

  return db.transaction(async (tx) => {
    for (const table of tables) {
      await tx.execute(sql.raw(`drop table if exists "${table}" cascade`))
    }

    const settings = resultRows(
      await tx.execute(sql`
        delete from settings where key like ${`plugin.${pluginKey}.%`} returning key
      `),
    ) as Array<unknown>

    const migrations = resultRows(
      await tx.execute(sql`
        delete from plugin_migrations where plugin_key = ${pluginKey} returning migration_id
      `),
    ) as Array<unknown>

    const navigation = resultRows(
      await tx.execute(sql`
        delete from navigation_items where key like ${`plugin.${pluginKey}.%`} returning id
      `),
    ) as Array<unknown>

    const version = resultRows(
      await tx.execute(sql`
        delete from component_versions where component = ${`plugin:${pluginKey}`}
        returning component
      `),
    ) as Array<unknown>

    const health = resultRows(
      await tx.execute(sql`
        delete from plugin_health where plugin_key = ${pluginKey} returning plugin_key
      `),
    ) as Array<unknown>

    return {
      tables,
      settings: settings.length,
      migrations: migrations.length,
      navigation: navigation.length,
      versionRemoved: version.length > 0,
      healthRemoved: health.length > 0,
    }
  })
}
