import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { syncRenderSignature } from './render-signature'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(
    sql`delete from cache_versions where key in ('plugin_render', 'markdown_vocabulary')`,
  )
})

async function versionOf(key: string): Promise<number | null> {
  const rows = resultRows(
    await db.execute(sql`select version from cache_versions where key = ${key}`),
  ) as Array<{ version: number }>
  return rows[0] === undefined ? null : Number(rows[0].version)
}

describe('syncRenderSignature', () => {
  it('records the signature on a board that has never seen one, without re-rendering', async () => {
    expect(await syncRenderSignature(db, 42)).toBe(false)

    expect(await versionOf('plugin_render')).toBe(42)
    expect(await versionOf('markdown_vocabulary')).toBeNull()
  })

  it('says nothing changed when the signature is the one already recorded', async () => {
    await syncRenderSignature(db, 42)
    expect(await syncRenderSignature(db, 42)).toBe(false)
  })

  it('bumps the content revision when a formatting plugin arrives or leaves', async () => {
    await syncRenderSignature(db, 42)
    await db.execute(
      sql`insert into cache_versions (key, version) values ('markdown_vocabulary', 7)`,
    )

    expect(await syncRenderSignature(db, 43)).toBe(true)

    expect(await versionOf('plugin_render')).toBe(43)
    expect(await versionOf('markdown_vocabulary')).toBe(8)
  })
})
