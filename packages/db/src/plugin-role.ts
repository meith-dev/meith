import { sql } from 'drizzle-orm'

import { pluginTablePrefix } from '@meith/plugin-kit'

import type { Tx } from './permission-version'
import { resultRows } from './result-rows'

const ROLE_PATTERN = /^plugin_[a-z][a-z0-9_]{1,63}$/

export function pluginDbRole(pluginKey: string): string {
  const role = `plugin_${pluginKey.replace(/-/g, '_')}`
  if (!ROLE_PATTERN.test(role)) {
    throw new Error(`plugin key "${pluginKey}" does not map to a usable database role name.`)
  }
  return role
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export async function ensurePluginDataRole(executor: Tx, pluginKey: string): Promise<void> {
  const role = pluginDbRole(pluginKey)
  const roleIdent = quoteIdentifier(role)
  const prefix = pluginTablePrefix(pluginKey)

  await executor.execute(
    sql.raw(
      `do $meith$ begin
         if not exists (select 1 from pg_roles where rolname = ${quoteLiteral(role)}) then
           create role ${roleIdent} with nologin;
         end if;
       exception when duplicate_object then null;
       end $meith$;`,
    ),
  )

  await executor.execute(sql.raw(`grant ${roleIdent} to current_user`))
  await executor.execute(sql.raw(`grant usage on schema public to ${roleIdent}`))

  const tables = resultRows(
    await executor.execute(sql`
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and table_type = 'BASE TABLE'
         and table_name like ${`${prefix}%`}
    `),
  ) as Array<{ table_name: string }>

  const sequences = resultRows(
    await executor.execute(sql`
      select sequence_name
        from information_schema.sequences
       where sequence_schema = 'public'
         and sequence_name like ${`${prefix}%`}
    `),
  ) as Array<{ sequence_name: string }>

  for (const { table_name } of tables) {
    await executor.execute(
      sql.raw(
        `grant select, insert, update, delete on ${quoteIdentifier(String(table_name))} to ${roleIdent}`,
      ),
    )
  }

  for (const { sequence_name } of sequences) {
    await executor.execute(
      sql.raw(
        `grant usage, select, update on ${quoteIdentifier(String(sequence_name))} to ${roleIdent}`,
      ),
    )
  }
}
