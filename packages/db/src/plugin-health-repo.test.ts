import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { clearPluginHealth, readPluginHealth, recordPluginFailure } from './plugin-health-repo'

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
  await db.execute(sql`delete from plugin_health`)
})

function fail(pluginKey: string, threshold = 3) {
  return recordPluginFailure(db, { pluginKey, threshold, reason: 'it threw' })
}

describe('recordPluginFailure', () => {
  it('counts a first failure without switching anything off', async () => {
    const record = await fail('alpha')

    expect(record).toMatchObject({ pluginKey: 'alpha', failures: 1, disabledAt: null })
  })

  it('accumulates across calls, which is what makes the count cross instances', async () => {
    await fail('alpha')
    await fail('alpha')

    expect((await fail('alpha')).failures).toBe(3)
  })

  it('switches the plugin off with its reason when the count reaches the threshold', async () => {
    await fail('alpha')
    await fail('alpha')
    const record = await fail('alpha')

    expect(record.disabledAt).not.toBeNull()
    expect(record.reason).toBe('it threw')
  })

  it('keeps the first reason and the first moment once it is off', async () => {
    await fail('alpha')
    await fail('alpha')
    const first = await fail('alpha')

    const later = await recordPluginFailure(db, {
      pluginKey: 'alpha',
      threshold: 3,
      reason: 'something else',
    })

    expect(later.reason).toBe('it threw')
    expect(later.disabledAt).toEqual(first.disabledAt)
    expect(later.failures).toBe(4)
  })

  it('counts each plugin on its own', async () => {
    await fail('alpha')
    await fail('beta')

    expect((await readPluginHealth(db)).map((row) => [row.pluginKey, row.failures])).toEqual([
      ['alpha', 1],
      ['beta', 1],
    ])
  })
})

describe('clearPluginHealth', () => {
  it('takes the record away, so the plugin runs again', async () => {
    await fail('alpha', 1)
    expect((await readPluginHealth(db))[0]?.disabledAt).not.toBeNull()

    expect(await clearPluginHealth(db, 'alpha')).toBe(true)
    expect(await readPluginHealth(db)).toEqual([])
  })

  it('says so when there was nothing to clear', async () => {
    expect(await clearPluginHealth(db, 'alpha')).toBe(false)
  })
})
