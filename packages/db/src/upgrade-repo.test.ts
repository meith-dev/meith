import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import { pluginData } from './plugin-data'
import { pluginDbRole } from './plugin-role'
import { resultRows } from './result-rows'
import { applyPluginMigration } from './upgrade-repo'

let h: TestDb

beforeAll(async () => {
  h = await createTestDb()
})
afterAll(async () => {
  await h.close()
})

async function roleExists(role: string): Promise<boolean> {
  const rows = resultRows(
    await h.db.execute(sql`select 1 from pg_roles where rolname = ${role}`),
  ) as unknown[]
  return rows.length > 0
}

describe('applyPluginMigration', () => {
  it('creates the plugin role and grants it its own tables', async () => {
    const ran = await applyPluginMigration(h.db, 'ledger', '0001_init', [
      'create table plugin_ledger_entry (id serial primary key, amount integer)',
    ])
    expect(ran).toBe(true)
    expect(await roleExists(pluginDbRole('ledger'))).toBe(true)

    const data = pluginData(h.db, 'ledger')
    await data.query('insert into plugin_ledger_entry (amount) values ($1)', [5])
    const rows = await data.query<{ amount: number }>('select amount from plugin_ledger_entry')
    expect(rows).toEqual([{ amount: 5 }])
  })

  it('leaves core tables out of the plugin role’s reach', async () => {
    await applyPluginMigration(h.db, 'ledger', '0001_init', [
      'create table plugin_ledger_entry (id serial primary key, amount integer)',
    ])

    const data = pluginData(h.db, 'ledger')
    let refused = 'NONE'
    try {
      await data.query('select id from users limit 1')
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause
      refused = cause instanceof Error ? cause.message : String((error as Error).message)
    }
    expect(refused).toMatch(/permission denied/i)
  })

  it('ensures the role even when the migration was already applied', async () => {
    const ran = await applyPluginMigration(h.db, 'archive', '0001_init', [
      'create table plugin_archive_item (id serial primary key)',
    ])
    expect(ran).toBe(true)

    const again = await applyPluginMigration(h.db, 'archive', '0001_init', [
      'create table plugin_archive_item (id serial primary key)',
    ])
    expect(again).toBe(false)
    expect(await roleExists(pluginDbRole('archive'))).toBe(true)
  })
})
