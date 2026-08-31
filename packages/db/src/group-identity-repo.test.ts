import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresGroupIdentityRepository } from './group-identity-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresGroupIdentityRepository

const ADA = 60

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresGroupIdentityRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(users)
  await db.execute(sql`
    update usergroups set name_color_light = 'red' where key = 'administrators'
  `)
  await db.execute(sql`
    update usergroups set name_color_light = 'green' where key = 'registered'
  `)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower, primary_group_id)
    values (${ADA}, 'Ada', 'ada', 'ada@example.com', 'ada@example.com', 2)
  `)
})

describe('PostgresGroupIdentityRepository', () => {
  it('reads the display group an ordinary member chose', async () => {
    await db.execute(sql`update users set display_group_id = 5 where id = ${ADA}`)

    expect((await repo.forUsers([ADA])).get(ADA)?.title).toBe('Moderators')
  })

  it('falls back to the primary group where nothing was chosen', async () => {
    expect((await repo.forUsers([ADA])).get(ADA)?.title).toBe('Registered')
  })

  it('shows staff as their staff group, whatever they chose', async () => {
    await db.execute(
      sql`update users set primary_group_id = 3, display_group_id = 2 where id = ${ADA}`,
    )

    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.title).toBe('Administrators')
    expect(standing?.nameColorLight).toBe('red')
  })

  it('lists every held group, the display group first', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (${ADA}, 5), (${ADA}, 3)
    `)
    await db.execute(sql`update users set display_group_id = 5 where id = ${ADA}`)

    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.groups.map((group) => group.title)).toEqual([
      'Moderators',
      'Registered',
      'Administrators',
    ])
    expect(standing?.groups[0]).toMatchObject({ groupId: 5, title: 'Moderators' })
  })

  it('leads with the staff group and keeps the rest for staff', async () => {
    await db.execute(
      sql`update users set primary_group_id = 3, display_group_id = 2 where id = ${ADA}`,
    )
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (${ADA}, 2)
    `)

    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.groups.map((group) => group.title)).toEqual(['Administrators', 'Registered'])
  })

  it('holds only the display group for a member of one group', async () => {
    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.groups.map((group) => group.title)).toEqual(['Registered'])
  })

  it('does not list a lapsed membership', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id, expires_at)
      values (${ADA}, 5, now() - interval '1 day')
    `)

    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.groups.map((group) => group.title)).toEqual(['Registered'])
  })

  it('carries each group colour so every shown group can be styled', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (${ADA}, 3)
    `)

    const standing = (await repo.forUsers([ADA])).get(ADA)
    expect(standing?.groups.map((group) => group.nameColorLight)).toEqual(['green', 'red'])
  })
})
