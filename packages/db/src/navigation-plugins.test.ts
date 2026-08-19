import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresNavigationRepository } from './navigation-repo'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let repository: PostgresNavigationRepository

const PLANS = {
  key: 'plugin.dues.plans',
  href: '/plugins/dues',
  audience: 'all',
  parentKey: null,
} as const
const MANAGE = {
  key: 'plugin.dues.manage',
  href: '/plugins/dues/manage',
  audience: 'members',
  parentKey: PLANS.key,
} as const

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repository = new PostgresNavigationRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from navigation_items where key like 'plugin.%'`)
})

async function pluginRows() {
  return (await repository.list()).filter((row) => row.key?.startsWith('plugin.') === true)
}

describe('syncPluginItems', () => {
  it('adds a row for an item no board has seen before', async () => {
    expect(await repository.syncPluginItems([PLANS])).toEqual({ added: [PLANS.key], removed: [] })

    expect(await pluginRows()).toMatchObject([
      { key: PLANS.key, href: PLANS.href, audience: 'all', label: '', enabled: true },
    ])
  })

  it('places it after everything already in the menu', async () => {
    await repository.syncPluginItems([PLANS])

    const rows = await repository.list()
    const added = rows.find((row) => row.key === PLANS.key)
    const others = rows.filter((row) => row.key !== PLANS.key)

    expect(added?.displayOrder).toBeGreaterThan(
      Math.max(...others.map((row) => row.displayOrder)) - 1,
    )
  })

  it('adds nothing the second time, so a redeploy is not a duplicate', async () => {
    await repository.syncPluginItems([PLANS])

    expect(await repository.syncPluginItems([PLANS])).toEqual({ added: [], removed: [] })
    expect(await pluginRows()).toHaveLength(1)
  })

  it('keeps the operator’s label, audience, nesting and switch across a redeploy', async () => {
    await repository.syncPluginItems([PLANS])
    const [row] = await pluginRows()

    await repository.update(row!.id, {
      parentId: null,
      label: 'Join us',
      href: row!.href,
      audience: 'guests',
      newTab: true,
      enabled: false,
      visibleToGroups: [],
    })

    await repository.syncPluginItems([PLANS])

    expect(await pluginRows()).toMatchObject([
      { label: 'Join us', audience: 'guests', newTab: true, enabled: false },
    ])
  })

  it('refreshes the address, which is the half the plugin owns', async () => {
    await repository.syncPluginItems([PLANS])
    await repository.syncPluginItems([{ ...PLANS, href: '/plugins/dues/plans' }])

    expect(await pluginRows()).toMatchObject([{ href: '/plugins/dues/plans' }])
  })

  it('creates a child under its declared parent, whichever is declared first', async () => {
    await repository.syncPluginItems([MANAGE, PLANS])

    const rows = await pluginRows()
    const plans = rows.find((row) => row.key === PLANS.key)
    const manage = rows.find((row) => row.key === MANAGE.key)

    expect(plans?.parentId).toBeNull()
    expect(manage?.parentId).toBe(plans?.id)
  })

  it('lands at the top level when the declared parent is not a top-level row', async () => {
    await repository.syncPluginItems([PLANS])
    const [plans] = await pluginRows()
    const shelter = await repository.create({
      parentId: null,
      label: 'More',
      href: '/more',
      audience: 'all',
      newTab: false,
      enabled: true,
      visibleToGroups: [],
    })
    await repository.arrange(plans!.id, { parentId: shelter, afterId: null })

    await repository.syncPluginItems([PLANS, MANAGE])

    const manage = (await pluginRows()).find((row) => row.key === MANAGE.key)
    expect(manage?.parentId).toBeNull()

    await repository.delete(shelter)
  })

  it('removes a row whose plugin is no longer installed', async () => {
    await repository.syncPluginItems([PLANS, MANAGE])

    expect(await repository.syncPluginItems([PLANS])).toEqual({
      added: [],
      removed: [MANAGE.key],
    })
    expect(await pluginRows()).toHaveLength(1)
  })

  it('leaves the board’s own items alone', async () => {
    const before = (await repository.list()).filter(
      (row) => row.key?.startsWith('plugin.') !== true,
    )

    await repository.syncPluginItems([])

    const after = (await repository.list()).filter((row) => row.key?.startsWith('plugin.') !== true)
    expect(after).toEqual(before)
  })
})
