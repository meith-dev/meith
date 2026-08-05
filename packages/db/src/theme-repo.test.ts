import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { themes } from './schema'
import { PostgresThemeRepository } from './theme-repo'

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
  await db.execute(sql`delete from themes`)
})

describe('PostgresThemeRepository', () => {
  it('returns only runtime style fields for its theme key', async () => {
    await db.insert(themes).values({
      key: 'default',
      title: 'Default',
      tokenOverrides: { primary: '#123456' },
      customCss: '.forum-row { font-weight: 600; }',
    })
    await db.insert(themes).values({ key: 'other', title: 'Other' })

    await expect(new PostgresThemeRepository(db).findRuntimeByKey('default')).resolves.toEqual({
      tokenOverrides: { primary: '#123456' },
      customCss: '.forum-row { font-weight: 600; }',
    })
    await expect(new PostgresThemeRepository(db).findRuntimeByKey('missing')).resolves.toBeNull()
  })

  describe('listRuntime', () => {
    it('reads every row the cascade needs in one query', async () => {
      await db.insert(themes).values({
        key: 'midnight',
        title: 'Midnight',
        tokenOverrides: { light: { primary: '#33cccc' }, dark: {} },
        customCss: null,
        isDefault: true,
      })

      await expect(new PostgresThemeRepository(db).listRuntime()).resolves.toEqual([
        {
          key: 'midnight',
          tokenOverrides: { light: { primary: '#33cccc' }, dark: {} },
          customCss: null,
          enabled: true,
          isDefault: true,
        },
      ])
    })

    /*
     * An empty table is a board that has never opened the theme screen, and it
     * renders exactly as it did before the table had a writer. The composition
     * that turns this into a palette lives in the app, where the registry is —
     * which theme exists is `forum.config.ts`'s answer, not a row's.
     */
    it('is empty for a board that has decided nothing', async () => {
      await expect(new PostgresThemeRepository(db).listRuntime()).resolves.toEqual([])
    })

    it('reports a disabled theme as disabled', async () => {
      await db.insert(themes).values({ key: 'midnight', title: 'Midnight', enabled: false })

      const rows = await new PostgresThemeRepository(db).listRuntime()
      expect(rows[0]?.enabled).toBe(false)
    })
  })
})
