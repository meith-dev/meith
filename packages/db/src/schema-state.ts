import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import * as schema from './schema'

export function expectedTables(): readonly string[] {
  return Object.values(schema as Record<string, unknown>)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableName(table as PgTable))
    .sort()
}

export async function missingTables(db: Database): Promise<readonly string[]> {
  const result = await db.execute(sql`
    select table_name from information_schema.tables where table_schema = 'public'
  `)

  const present = new Set(resultRows<{ table_name: string }>(result).map((row) => row.table_name))
  return expectedTables().filter((table) => !present.has(table))
}
