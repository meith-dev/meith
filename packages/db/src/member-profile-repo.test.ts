import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { users } from './schema'
import { PostgresMemberProfileRepository } from './member-profile-repo'

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
    await db
      .update(users)
      .set({ primaryGroupId: 3, displayGroupId: 2 })
      .where(eq(users.id, 50))

    expect(await repo.findPublicById(50)).toMatchObject({ title: 'Administrators' })
  })

  it('still honours an ordinary member’s choice', async () => {
    await db
      .update(users)
      .set({ primaryGroupId: 2, displayGroupId: 5 })
      .where(eq(users.id, 50))

    expect(await repo.findPublicById(50)).toMatchObject({ title: 'Moderators' })
  })
})
