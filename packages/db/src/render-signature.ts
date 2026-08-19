import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

const SIGNATURE_KEY = 'plugin_render'
const VOCABULARY_KEY = 'markdown_vocabulary'

export async function syncRenderSignature(db: Database, signature: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = resultRows(
      await tx.execute(sql`select version from cache_versions where key = ${SIGNATURE_KEY}`),
    ) as Array<{ version: number }>

    const recorded = rows[0] === undefined ? null : Number(rows[0].version)
    if (recorded === signature) return false

    await tx.execute(sql`
      insert into cache_versions (key, version) values (${SIGNATURE_KEY}, ${signature})
      on conflict (key) do update set version = ${signature}, bumped_at = now()
    `)

    if (recorded === null) return false

    await tx.execute(sql`
      insert into cache_versions (key, version) values (${VOCABULARY_KEY}, 1)
      on conflict (key)
        do update set version = cache_versions.version + 1, bumped_at = now()
    `)

    return true
  })
}
