import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { textList } from './sql-lists'

export async function rememberOrphanKey(db: Database, key: string): Promise<void> {
  await db.execute(sql`
    insert into attachment_orphans (storage_key) values (${key})
    on conflict (storage_key) do nothing
  `)
}

export async function forgetOrphanKeys(db: Database, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  await db.execute(sql`
    delete from attachment_orphans
     where storage_key in ${textList(keys)}
  `)
}
