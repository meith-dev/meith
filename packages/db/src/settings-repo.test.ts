import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { settings } from './schema'
import { PostgresSettingsRepository, settingSealer } from './settings-repo'

let harness: TestDb
let db: Database

const KEY = 'a-board-auth-secret-0000000000000'

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(settings)
})

describe('sealed settings', () => {
  it('stores a sealed setting as ciphertext and reads it back in the clear', async () => {
    const repo = new PostgresSettingsRepository(db, settingSealer(KEY))
    await repo.save(
      new Map([
        ['backup.s3_secret_access_key', 'hunter2'],
        ['backup.s3_bucket', 'board-backups'],
      ]),
    )

    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
    const stored = new Map(rows.map((row) => [row.key, row.value]))
    expect(stored.get('backup.s3_bucket')).toBe('board-backups')
    expect(stored.get('backup.s3_secret_access_key')).not.toContain('hunter2')
    expect(stored.get('backup.s3_secret_access_key')).toMatch(/^v1\./)

    const loaded = await repo.loadAll()
    expect(loaded.get('backup.s3_secret_access_key')).toBe('hunter2')
    expect(loaded.get('backup.s3_bucket')).toBe('board-backups')
  })

  it('treats a sealed value it cannot open as unset rather than as ciphertext', async () => {
    await new PostgresSettingsRepository(db, settingSealer(KEY)).save(
      new Map([['backup.s3_secret_access_key', 'hunter2']]),
    )

    const other = new PostgresSettingsRepository(db, settingSealer(`${KEY}-rotated`))
    expect((await other.loadAll()).has('backup.s3_secret_access_key')).toBe(false)
  })

  it('refuses to store a sealed setting when there is no key to seal it with', async () => {
    const repo = new PostgresSettingsRepository(db, settingSealer(undefined))
    await expect(repo.save(new Map([['backup.s3_secret_access_key', 'hunter2']]))).rejects.toThrow(
      /AUTH_SECRET/,
    )
    await expect(repo.save(new Map([['board.name', 'Fine']]))).resolves.toBeUndefined()
  })
})
