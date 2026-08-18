import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { type NavigationItemInput, PostgresNavigationRepository } from './navigation-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresNavigationRepository

const REGISTERED = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresNavigationRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from navigation_item_groups`)
})

function input(over: Partial<NavigationItemInput> = {}): NavigationItemInput {
  return {
    label: 'Chat',
    href: 'https://chat.example.test',
    displayOrder: 100,
    audience: 'all',
    newTab: true,
    enabled: true,
    visibleToGroups: [],
    ...over,
  }
}

describe('the seeded menu', () => {
  it('carries the six items a board starts with, in order', async () => {
    const rows = (await repo.list()).filter((row) => row.key !== null)

    expect(rows.map((row) => row.key)).toEqual([
      'home',
      'new-posts',
      'unanswered',
      'my-posts',
      'search',
      'online',
    ])
  })

  it('leaves every seeded label empty so the board names them itself', async () => {
    const rows = (await repo.list()).filter((row) => row.key !== null)

    expect(rows.every((row) => row.label === '')).toBe(true)
  })

  it('seeds the personal view for members only', async () => {
    const rows = await repo.list()

    expect(rows.find((row) => row.key === 'my-posts')?.audience).toBe('members')
  })
})

describe('adding an item', () => {
  it('stores it as a custom row and orders it by display order', async () => {
    const id = await repo.create(input())
    const rows = await repo.list()
    const added = rows.find((row) => row.id === id)

    expect(added?.key).toBeNull()
    expect(added?.label).toBe('Chat')
    expect(added?.newTab).toBe(true)
    expect(rows.at(-1)?.id).toBe(id)

    await repo.delete(id)
  })

  it('refuses a custom item with no label', async () => {
    await expect(repo.create(input({ label: '  ' }))).rejects.toThrow()
  })

  it('refuses an item with no address', async () => {
    await expect(repo.create(input({ href: '' }))).rejects.toThrow()
  })
})

describe('group visibility', () => {
  it('keeps the groups an item was given', async () => {
    const id = await repo.create(input({ visibleToGroups: [REGISTERED, REGISTERED] }))

    expect((await repo.list()).find((row) => row.id === id)?.visibleToGroups).toEqual([REGISTERED])

    await repo.delete(id)
  })

  it('ignores a group that does not exist', async () => {
    const id = await repo.create(input({ visibleToGroups: [9999] }))

    expect((await repo.list()).find((row) => row.id === id)?.visibleToGroups).toEqual([])

    await repo.delete(id)
  })

  it('replaces the groups on an update rather than adding to them', async () => {
    const id = await repo.create(input({ visibleToGroups: [REGISTERED] }))
    await repo.update(id, input({ visibleToGroups: [] }))

    expect((await repo.list()).find((row) => row.id === id)?.visibleToGroups).toEqual([])

    await repo.delete(id)
  })
})

describe('editing a built-in item', () => {
  it('renames one without taking its key away', async () => {
    const home = (await repo.list()).find((row) => row.key === 'home')
    if (home === undefined) throw new Error('the seed is missing the home item')

    await repo.update(home.id, input({ label: 'Front page', href: '/', displayOrder: 0 }))

    const renamed = (await repo.list()).find((row) => row.id === home.id)
    expect(renamed?.key).toBe('home')
    expect(renamed?.label).toBe('Front page')

    await repo.update(home.id, input({ label: '', href: '/', displayOrder: 0 }))
  })

  it('accepts an empty label, which is how a built-in keeps its own name', async () => {
    const online = (await repo.list()).find((row) => row.key === 'online')
    if (online === undefined) throw new Error('the seed is missing the online item')

    await expect(
      repo.update(online.id, input({ label: '', href: '/online', displayOrder: 50 })),
    ).resolves.toBeUndefined()
  })

  it('refuses an update to an item that is not there', async () => {
    await expect(repo.update(999_999, input())).rejects.toThrow()
  })
})

describe('removing an item', () => {
  it('takes its group rows with it', async () => {
    const id = await repo.create(input({ visibleToGroups: [REGISTERED] }))
    await repo.delete(id)

    const rows = resultRows(
      await db.execute(
        sql`select count(*)::int as count from navigation_item_groups where item_id = ${id}`,
      ),
    ) as Array<{ count: number }>

    expect(Number(rows[0]?.count)).toBe(0)
  })
})
