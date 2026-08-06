import { sql } from 'drizzle-orm'

import type { Database } from './client'

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function bumpPermissionVersion(tx: Tx): Promise<void> {
  await tx.execute(sql`
    insert into cache_versions (key, version) values ('permissions', 1)
    on conflict (key) do update
       set version = cache_versions.version + 1, bumped_at = now()
  `)
}

export async function withPermissionVersionBump<T>(
  db: Database,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await work(tx)
    await bumpPermissionVersion(tx)
    return result
  })
}
