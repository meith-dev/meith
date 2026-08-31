import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { expectQueryBudget } from '@meith/testkit'

import type { Database } from './client'
import { PostgresMemberDirectoryRepository } from './member-directory-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresMemberDirectoryRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresMemberDirectoryRepository(db)
})

afterAll(async () => {
  await harness.close()
})

async function seedUser(input: {
  readonly id: number
  readonly username: string
  readonly groupId?: number
  readonly postCount?: number
  readonly createdAt?: string
  readonly state?: string
}): Promise<void> {
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       primary_group_id, post_count, state, created_at)
    values (${input.id}, ${input.username}, ${input.username.toLowerCase()},
            ${`${input.username.toLowerCase()}@example.com`},
            ${`${input.username.toLowerCase()}@example.com`},
            ${input.groupId ?? 2}, ${input.postCount ?? 0},
            ${input.state ?? 'active'},
            ${input.createdAt ?? '2026-01-01T00:00:00Z'})
  `)
}

beforeEach(async () => {
  await db.delete(users)
  await seedUser({ id: 60, username: 'Ada', postCount: 5, createdAt: '2026-01-01T00:00:00Z' })
  await seedUser({ id: 61, username: 'brin', postCount: 12, createdAt: '2026-02-01T00:00:00Z' })
  await seedUser({
    id: 62,
    username: 'Cato',
    groupId: 3,
    postCount: 2,
    createdAt: '2026-03-01T00:00:00Z',
  })
})

describe('page', () => {
  it('lists members by name within the query budget, case aside', async () => {
    const page = await expectQueryBudget(harness, 2, () =>
      repo.page({ offset: 0, limit: 10, sort: 'name' }),
    )

    expect(page.total).toBe(3)
    expect(page.rows.map((row) => row.username)).toEqual(['Ada', 'brin', 'Cato'])
    expect(page.rows[0]).toMatchObject({ id: 60, postCount: 5 })
  })

  it('sorts by posts and by newest arrival', async () => {
    const byPosts = await repo.page({ offset: 0, limit: 10, sort: 'posts' })
    expect(byPosts.rows.map((row) => row.username)).toEqual(['brin', 'Ada', 'Cato'])

    const byJoined = await repo.page({ offset: 0, limit: 10, sort: 'joined' })
    expect(byJoined.rows.map((row) => row.username)).toEqual(['Cato', 'brin', 'Ada'])
  })

  it('pages with a total that spans every page', async () => {
    const page = await repo.page({ offset: 2, limit: 2, sort: 'name' })
    expect(page.total).toBe(3)
    expect(page.rows.map((row) => row.username)).toEqual(['Cato'])
  })

  it('narrows to names containing the filter, however it is cased', async () => {
    const page = await repo.page({ offset: 0, limit: 10, sort: 'name', nameContains: 'A' })
    expect(page.rows.map((row) => row.username)).toEqual(['Ada', 'Cato'])
    expect(page.total).toBe(2)
  })

  it('treats like wildcards in the filter as characters', async () => {
    const page = await repo.page({ offset: 0, limit: 10, sort: 'name', nameContains: '%' })
    expect(page.total).toBe(0)
  })

  it('leaves deleted accounts out', async () => {
    await seedUser({ id: 63, username: 'gone', state: 'deleted' })
    const page = await repo.page({ offset: 0, limit: 10, sort: 'name' })
    expect(page.total).toBe(3)
  })
})

describe('staff', () => {
  it('groups staff by the staff flag, in display order, in one query', async () => {
    await seedUser({ id: 64, username: 'Moya', groupId: 5 })

    const staff = await expectQueryBudget(harness, 1, () => repo.staff())

    expect(staff.map((group) => group.title)).toEqual(['Moderators', 'Administrators'])
    expect(staff[0]?.members.map((member) => member.username)).toEqual(['Moya'])
    expect(staff[1]?.members.map((member) => member.username)).toEqual(['Cato'])
  })

  it('counts a live secondary membership, and not a lapsed one', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (60, 5)
    `)
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id, expires_at)
      values (61, 5, now() - interval '1 day')
    `)

    const staff = await repo.staff()
    const moderators = staff.find((group) => group.title === 'Moderators')
    expect(moderators?.members.map((member) => member.username)).toEqual(['Ada'])
  })

  it('does not list a staff group nobody is in', async () => {
    const staff = await repo.staff()
    expect(staff.map((group) => group.title)).toEqual(['Administrators'])
  })

  it('does not resurrect a deleted staff account', async () => {
    await db.execute(sql`update users set state = 'deleted' where id = 62`)
    expect(await repo.staff()).toEqual([])
  })
})
