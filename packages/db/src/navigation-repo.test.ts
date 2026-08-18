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
  await db.execute(sql`delete from navigation_items where key is null`)
  await db.execute(sql`update navigation_items set parent_id = null`)
  await reseed()
})

async function reseed(): Promise<void> {
  const order: Record<string, number> = {
    home: 0,
    'new-posts': 10,
    unanswered: 20,
    'my-posts': 30,
    search: 40,
    online: 50,
  }

  for (const [key, place] of Object.entries(order)) {
    await db.execute(
      sql`update navigation_items set display_order = ${place}, label = '' where key = ${key}`,
    )
  }
}

async function idOf(key: string): Promise<number> {
  const row = (await repo.list()).find((entry) => entry.key === key)
  if (row === undefined) throw new Error(`the seed is missing the ${key} item`)
  return row.id
}

function input(over: Partial<NavigationItemInput> = {}): NavigationItemInput {
  return {
    parentId: null,
    label: 'Chat',
    href: 'https://chat.example.test',
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
  })

  it('ignores a group that does not exist', async () => {
    const id = await repo.create(input({ visibleToGroups: [9999] }))

    expect((await repo.list()).find((row) => row.id === id)?.visibleToGroups).toEqual([])
  })

  it('replaces the groups on an update rather than adding to them', async () => {
    const id = await repo.create(input({ visibleToGroups: [REGISTERED] }))
    await repo.update(id, input({ visibleToGroups: [] }))

    expect((await repo.list()).find((row) => row.id === id)?.visibleToGroups).toEqual([])
  })
})

describe('editing a built-in item', () => {
  it('renames one without taking its key away', async () => {
    const home = await idOf('home')

    await repo.update(home, input({ label: 'Front page', href: '/' }))

    const renamed = (await repo.list()).find((row) => row.id === home)
    expect(renamed?.key).toBe('home')
    expect(renamed?.label).toBe('Front page')
  })

  it('accepts an empty label, which is how a built-in keeps its own name', async () => {
    await expect(
      repo.update(await idOf('online'), input({ label: '', href: '/online' })),
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

describe('nesting', () => {
  it('places a new child last under its parent', async () => {
    const home = await idOf('home')
    const first = await repo.create(input({ parentId: home, label: 'First' }))
    const second = await repo.create(input({ parentId: home, label: 'Second' }))

    const rows = await repo.list()
    const children = rows.filter((row) => row.parentId === home)

    expect(children.map((row) => row.id)).toEqual([first, second])
  })

  it('refuses a parent that is itself under something', async () => {
    const home = await idOf('home')
    const child = await repo.create(input({ parentId: home, label: 'Child' }))

    await expect(repo.create(input({ parentId: child, label: 'Grandchild' }))).rejects.toThrow()
  })

  it('refuses to put an item with children under another item', async () => {
    const home = await idOf('home')
    const parent = await repo.create(input({ label: 'Parent' }))
    await repo.create(input({ parentId: parent, label: 'Child' }))

    await expect(repo.update(parent, input({ parentId: home, label: 'Parent' }))).rejects.toThrow()
  })

  it('refuses an item as its own parent', async () => {
    const id = await repo.create(input({ label: 'Loop' }))

    await expect(repo.update(id, input({ parentId: id, label: 'Loop' }))).rejects.toThrow()
  })

  it('takes the children with it when the parent is deleted', async () => {
    const parent = await repo.create(input({ label: 'Parent' }))
    const child = await repo.create(input({ parentId: parent, label: 'Child' }))

    await repo.delete(parent)

    expect((await repo.list()).some((row) => row.id === child)).toBe(false)
  })
})

describe('arranging', () => {
  it('moves an item to the front when nothing precedes it', async () => {
    const online = await idOf('online')
    await repo.arrange(online, { parentId: null, afterId: null })

    const top = (await repo.list()).filter((row) => row.parentId === null)
    expect(top[0]?.id).toBe(online)
  })

  it('drops an item straight after the one it was aimed at', async () => {
    const home = await idOf('home')
    const online = await idOf('online')
    await repo.arrange(online, { parentId: null, afterId: home })

    const top = (await repo.list()).filter((row) => row.parentId === null)
    expect(top.map((row) => row.id).slice(0, 2)).toEqual([home, online])
  })

  it('leaves the display order sequential so a later drop has room', async () => {
    await repo.arrange(await idOf('online'), { parentId: null, afterId: await idOf('home') })

    const top = (await repo.list()).filter((row) => row.parentId === null)
    expect(top.map((row) => row.displayOrder)).toEqual([0, 10, 20, 30, 40, 50])
  })

  it('nests an item under a top-level one', async () => {
    const home = await idOf('home')
    const search = await idOf('search')
    await repo.arrange(search, { parentId: home, afterId: null })

    const moved = (await repo.list()).find((row) => row.id === search)
    expect(moved?.parentId).toBe(home)
  })

  it('lifts a child back out to the top level', async () => {
    const home = await idOf('home')
    const search = await idOf('search')
    await repo.arrange(search, { parentId: home, afterId: null })
    await repo.arrange(search, { parentId: null, afterId: home })

    const top = (await repo.list()).filter((row) => row.parentId === null)
    expect(top.map((row) => row.id).slice(0, 2)).toEqual([home, search])
  })

  it('refuses to nest an item under one of its own children', async () => {
    const parent = await repo.create(input({ label: 'Parent' }))
    const child = await repo.create(input({ parentId: parent, label: 'Child' }))

    await expect(repo.arrange(parent, { parentId: child, afterId: null })).rejects.toThrow()
  })

  it('refuses to arrange an item that is not there', async () => {
    await expect(repo.arrange(999_999, { parentId: null, afterId: null })).rejects.toThrow()
  })
})
