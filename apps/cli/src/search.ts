import { getDb, PostgresSearchRepository } from '@meith/db'

import { requirePostgres } from './context'

const BATCH = 5_000

export async function searchReindex(): Promise<number> {
  requirePostgres()
  const search = new PostgresSearchRepository(getDb())

  const before = await search.indexProgress()
  if (before.pending === 0) {
    console.log(`Nothing to do: all ${before.indexed} post(s) are indexed.`)
    return 0
  }

  console.log(`Indexing ${before.pending} post(s)…`)

  let cursor = 0
  let indexed = 0
  for (;;) {
    const chunk = await search.reindexChunk(cursor, BATCH)
    indexed += chunk.indexed
    if (chunk.nextCursor === null) break
    cursor = chunk.nextCursor
    console.log(`  ${indexed}…`)
  }

  const after = await search.indexProgress()

  console.log(`Indexed ${indexed} post(s). ${after.indexed} indexed, ${after.pending} pending.`)
  return after.pending === 0 ? 0 : 1
}
