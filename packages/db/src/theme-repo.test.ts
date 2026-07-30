import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
})
