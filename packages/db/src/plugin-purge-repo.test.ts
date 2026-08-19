import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { pluginOwnedTables, purgePlugin } from './plugin-purge-repo'
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
  await db.execute(sql`drop table if exists plugin_dues_note`)
  await db.execute(sql`drop table if exists plugin_dues_ledger`)
  await db.execute(sql`drop table if exists plugin_other_note`)
  await db.execute(sql`delete from settings where key like 'plugin.%'`)
  await db.execute(sql`delete from plugin_migrations`)
  await db.execute(sql`delete from plugin_health`)
  await db.execute(sql`delete from component_versions where component like 'plugin:%'`)
  await db.execute(sql`delete from navigation_items where key like 'plugin.%'`)
})

async function seedDues(): Promise<void> {
  await db.execute(sql`create table plugin_dues_note (id integer primary key)`)
  await db.execute(sql`create table plugin_dues_ledger (id integer primary key)`)
  await db.execute(sql`insert into settings (key, value) values ('plugin.dues.currency', 'gbp')`)
  await db.execute(sql`
    insert into plugin_migrations (plugin_key, migration_id) values ('dues', '0001_create')
  `)
  await db.execute(sql`
    insert into component_versions (component, version) values ('plugin:dues', '1.0.0')
  `)
  await db.execute(sql`insert into plugin_health (plugin_key, failures) values ('dues', 3)`)
  await db.execute(sql`
    insert into navigation_items (key, href, display_order) values ('plugin.dues.plans', '/x', 90)
  `)
}

async function count(query: ReturnType<typeof sql>): Promise<number> {
  return (resultRows(await db.execute(query)) as Array<unknown>).length
}

describe('pluginOwnedTables', () => {
  it('finds the tables named for the plugin, and only those', async () => {
    await seedDues()
    await db.execute(sql`create table plugin_other_note (id integer primary key)`)

    expect(await pluginOwnedTables(db, 'dues')).toEqual(['plugin_dues_ledger', 'plugin_dues_note'])
  })

  it('finds nothing for a plugin that kept no data', async () => {
    expect(await pluginOwnedTables(db, 'dues')).toEqual([])
  })
})

describe('purgePlugin', () => {
  it('takes away everything the plugin left behind', async () => {
    await seedDues()

    const result = await purgePlugin(db, 'dues')

    expect(result).toEqual({
      tables: ['plugin_dues_ledger', 'plugin_dues_note'],
      settings: 1,
      migrations: 1,
      navigation: 1,
      versionRemoved: true,
      healthRemoved: true,
    })

    expect(await pluginOwnedTables(db, 'dues')).toEqual([])
    expect(await count(sql`select key from settings where key like 'plugin.dues.%'`)).toBe(0)
    expect(await count(sql`select migration_id from plugin_migrations`)).toBe(0)
    expect(await count(sql`select plugin_key from plugin_health`)).toBe(0)
    expect(
      await count(sql`select component from component_versions where component = 'plugin:dues'`),
    ).toBe(0)
    expect(await count(sql`select id from navigation_items where key like 'plugin.dues.%'`)).toBe(0)
  })

  it('leaves another plugin’s tables and settings alone', async () => {
    await seedDues()
    await db.execute(sql`create table plugin_other_note (id integer primary key)`)
    await db.execute(sql`insert into settings (key, value) values ('plugin.other.on', '1')`)

    await purgePlugin(db, 'dues')

    expect(await pluginOwnedTables(db, 'other')).toEqual(['plugin_other_note'])
    expect(await count(sql`select key from settings where key like 'plugin.other.%'`)).toBe(1)
  })

  it('leaves the board’s own navigation alone', async () => {
    await seedDues()
    const before = await count(sql`select id from navigation_items where key = 'home'`)

    await purgePlugin(db, 'dues')

    expect(await count(sql`select id from navigation_items where key = 'home'`)).toBe(before)
  })

  it('is harmless on a plugin that never wrote anything', async () => {
    expect(await purgePlugin(db, 'ghost')).toEqual({
      tables: [],
      settings: 0,
      migrations: 0,
      navigation: 0,
      versionRemoved: false,
      healthRemoved: false,
    })
  })
})
