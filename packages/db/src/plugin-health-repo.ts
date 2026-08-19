import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface PluginHealthRecord {
  readonly pluginKey: string
  readonly failures: number
  readonly disabledAt: Date | null
  readonly reason: string | null
}

function toRecord(row: Record<string, unknown>): PluginHealthRecord {
  return {
    pluginKey: String(row.plugin_key),
    failures: Number(row.failures),
    disabledAt: row.disabled_at === null ? null : new Date(row.disabled_at as string),
    reason: row.reason === null ? null : String(row.reason),
  }
}

export async function readPluginHealth(db: Database): Promise<readonly PluginHealthRecord[]> {
  const rows = resultRows(
    await db.execute(sql`
      select plugin_key, failures, disabled_at, reason
        from plugin_health
       order by plugin_key
    `),
  ) as Array<Record<string, unknown>>

  return rows.map(toRecord)
}

export async function recordPluginFailure(
  db: Database,
  input: {
    readonly pluginKey: string
    readonly threshold: number
    readonly reason: string
  },
): Promise<PluginHealthRecord> {
  const rows = resultRows(
    await db.execute(sql`
      insert into plugin_health (plugin_key, failures, disabled_at, reason, updated_at)
      values (
        ${input.pluginKey},
        1,
        case when 1 >= ${input.threshold} then now() else null end,
        case when 1 >= ${input.threshold} then ${input.reason} else null end,
        now()
      )
      on conflict (plugin_key) do update
        set failures = plugin_health.failures + 1,
            disabled_at = case
              when plugin_health.disabled_at is not null then plugin_health.disabled_at
              when plugin_health.failures + 1 >= ${input.threshold} then now()
              else null
            end,
            reason = case
              when plugin_health.disabled_at is not null then plugin_health.reason
              when plugin_health.failures + 1 >= ${input.threshold} then ${input.reason}
              else null
            end,
            updated_at = now()
      returning plugin_key, failures, disabled_at, reason
    `),
  ) as Array<Record<string, unknown>>

  return toRecord(rows[0]!)
}

export async function clearPluginHealth(db: Database, pluginKey: string): Promise<boolean> {
  const rows = resultRows(
    await db.execute(sql`
      delete from plugin_health where plugin_key = ${pluginKey} returning plugin_key
    `),
  ) as Array<Record<string, unknown>>

  return rows.length > 0
}
