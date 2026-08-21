import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresMemberProfileRepository } from './member-profile-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresMemberProfileRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresMemberProfileRepository(db)
})

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(users)
  await db.insert(users).values([
    {
      id: 50,
      username: 'Ada',
      usernameLower: 'ada',
      email: 'ada@example.com',
      emailLower: 'ada@example.com',
      primaryGroupId: 2,
      displayGroupId: 3,
      postCount: 42,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastActiveAt: new Date('2026-07-30T08:41:00Z'),
    },
    {
      id: 51,
      username: 'Departed',
      usernameLower: 'departed',
      email: 'departed@example.com',
      emailLower: 'departed@example.com',
      primaryGroupId: 2,
      state: 'deleted',
    },
  ])
})

describe('PostgresMemberProfileRepository', () => {
  it('returns only public profile fields and hides deleted accounts', async () => {
    expect(await repo.findPublicById(50)).toMatchObject({
      id: 50,
      username: 'Ada',
      title: 'Administrators',
      postCount: 42,
      lastActiveAt: new Date('2026-07-30T08:41:00Z'),
    })
    expect(await repo.findPublicById(51)).toBeNull()
  })

  it('falls back to the primary group for a member who has chosen no display group', async () => {
    await db.update(users).set({ displayGroupId: null }).where(eq(users.id, 50))

    expect(await repo.findPublicById(50)).toMatchObject({ title: 'Registered' })
  })
})

describe('staff standing', () => {
  it('shows a staff member as their staff group, whatever they chose', async () => {
    await db.update(users).set({ primaryGroupId: 3, displayGroupId: 2 }).where(eq(users.id, 50))

    expect(await repo.findPublicById(50)).toMatchObject({ title: 'Administrators' })
  })

  it('still honours an ordinary member’s choice', async () => {
    await db.update(users).set({ primaryGroupId: 2, displayGroupId: 5 }).where(eq(users.id, 50))

    expect(await repo.findPublicById(50)).toMatchObject({ title: 'Moderators' })
  })
})

describe('searchByUsernamePrefix', () => {
  beforeEach(async () => {
    await db.insert(users).values([
      {
        id: 52,
        username: 'Adam',
        usernameLower: 'adam',
        email: 'adam@example.com',
        emailLower: 'adam@example.com',
        primaryGroupId: 2,
      },
      {
        id: 53,
        username: 'banned_ada',
        usernameLower: 'banned_ada',
        email: 'banned@example.com',
        emailLower: 'banned@example.com',
        primaryGroupId: 2,
        state: 'banned',
      },
      {
        id: 54,
        username: 'ad_x',
        usernameLower: 'ad_x',
        email: 'adx@example.com',
        emailLower: 'adx@example.com',
        primaryGroupId: 2,
      },
      {
        id: 55,
        username: 'adyx',
        usernameLower: 'adyx',
        email: 'adyx@example.com',
        emailLower: 'adyx@example.com',
        primaryGroupId: 2,
      },
    ])
  })

  it('matches a prefix case-insensitively, shorter names sorting before longer ones', async () => {
    expect(await repo.searchByUsernamePrefix('ADA', 10)).toEqual([
      { id: 50, username: 'Ada' },
      { id: 52, username: 'Adam' },
    ])
  })

  it('excludes an account that is not active', async () => {
    const found = await repo.searchByUsernamePrefix('banned', 10)
    expect(found).toEqual([])
  })

  it('caps results at the given limit', async () => {
    expect(await repo.searchByUsernamePrefix('ad', 1)).toHaveLength(1)
  })

  it('treats a literal underscore in the prefix as a literal, not a "match any" wildcard', async () => {
    // Unescaped, `_` in LIKE means "any single character" — "ad_" would then also
    // match "adyx", which is exactly what escaping in likePrefix() prevents.
    expect(await repo.searchByUsernamePrefix('ad_', 10)).toEqual([{ id: 54, username: 'ad_x' }])
  })

  it('answers nothing for an empty prefix rather than the whole membership', async () => {
    expect(await repo.searchByUsernamePrefix('', 10)).toEqual([])
  })
})
