import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import { expectedTables, missingTables } from './schema-state'

describe('the tables this board expects', () => {
  it('are read from the schema definitions, so no file has to be there', () => {
    expect(expectedTables().length).toBeGreaterThan(50)
  })

  it('are named once each, in a stable order', () => {
    const tables = expectedTables()

    expect(new Set(tables).size).toBe(tables.length)
    expect([...tables].sort()).toEqual([...tables])
  })
})

describe('the check that replaced applying migrations at runtime', () => {
  let db: TestDb

  beforeAll(async () => {
    db = await createTestDb()
  })

  afterAll(async () => {
    await db.close()
  })

  async function withTableRenamed(table: string, body: () => Promise<void>): Promise<void> {
    await db.db.execute(sql.raw(`alter table ${table} rename to ${table}_moved`))
    try {
      await body()
    } finally {
      await db.db.execute(sql.raw(`alter table ${table}_moved rename to ${table}`))
    }
  }

  it('finds nothing missing in a migrated database', async () => {
    await expect(missingTables(db.db)).resolves.toEqual([])
  })

  it('names a table that is not there', async () => {
    await withTableRenamed('announcements', async () => {
      await expect(missingTables(db.db)).resolves.toEqual(['announcements'])
    })
  })

  it('names every one of them, not only the first', async () => {
    await withTableRenamed('announcements', async () => {
      await withTableRenamed('bans', async () => {
        await expect(missingTables(db.db)).resolves.toEqual(['announcements', 'bans'])
      })
    })
  })

  it('reads the database rather than writing to it', async () => {
    await withTableRenamed('announcements', async () => {
      await missingTables(db.db)
      await expect(missingTables(db.db)).resolves.toEqual(['announcements'])
    })
  })
})
