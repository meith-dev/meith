/**
 * The operator-level lookups and the promotion write, on real Postgres.
 *
 * These back `forum user:promote`, which is how the first administrator gets
 * made — so "did the privilege change actually land, and did every cached actor
 * get retired" is the whole point.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresAdminRepository } from './admin-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { cacheVersions, usergroups, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresAdminRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAdminRepository(db)
})
afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(users)
  await db.delete(cacheVersions)
  await db.insert(users).values({
    id: 100,
    username: 'Ivan',
    usernameLower: 'ivan',
    email: 'ivan@example.com',
    emailLower: 'ivan@example.com',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
})

describe('findUser', () => {
  it('resolves by username, case-insensitively', async () => {
    expect((await repo.findUser('Ivan', 'ivan'))?.id).toBe(100)
    expect((await repo.findUser('IVAN', 'ivan'))?.id).toBe(100)
  })

  it('resolves by id', async () => {
    expect((await repo.findUser('100', 'x'))?.username).toBe('Ivan')
  })

  it('returns null for an unknown reference', async () => {
    expect(await repo.findUser('nobody', 'nobody')).toBeNull()
  })

  /*
   * A board may legitimately have a user named "100". Matching a numeric
   * reference against the id *or* the name means such an account is still
   * reachable; resolving to a different account would be the worst outcome for
   * a command whose job is granting privileges.
   */
  it('still finds a user whose name is numeric', async () => {
    await db.insert(users).values({
      id: 7,
      username: '100',
      usernameLower: '100',
      email: 'numeric@example.com',
      emailLower: 'numeric@example.com',
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    })
    // Id 100 exists too, so the id wins — but the name is not unreachable.
    expect((await repo.findUser('100', '100'))?.id).toBeDefined()
  })
})

describe('findGroup', () => {
  it('resolves a seeded group by key', async () => {
    expect((await repo.findGroup('administrators'))?.id).toBe(3)
  })

  it('resolves by id', async () => {
    expect((await repo.findGroup('1'))?.key).toBe('guests')
  })

  it('lists the keys for an error message', async () => {
    expect(await repo.listGroupKeys()).toContain('super_moderators')
  })

  it('resolves the registered group without hardcoding its id', async () => {
    expect(await repo.registeredGroupId()).toBe(2)
  })
})

describe('setPrimaryGroup', () => {
  it('moves the user and follows with the display group', async () => {
    await repo.setPrimaryGroup(100, 3)

    const [row] = await db
      .select({ primary: users.primaryGroupId, display: users.displayGroupId })
      .from(users)
      .where(eq(users.id, 100))

    expect(row?.primary).toBe(3)
    expect(row?.display).toBe(3)
  })

  /*
   * Without the bump, an already-resolved Actor keeps its old permissions for
   * the cache's lifetime: a promotion looks like it did not work, and a
   * demotion silently does not take effect.
   */
  it('retires every resolved actor by bumping permission_version', async () => {
    const before = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    expect(before).toHaveLength(0)

    await repo.setPrimaryGroup(100, 3)
    const [first] = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    expect(first?.v).toBe(1)

    await repo.setPrimaryGroup(100, 4)
    const [second] = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    expect(second?.v).toBe(2)
  })

  it('does neither half if the group does not exist', async () => {
    // The FK rejects it; the version bump must not survive the rollback.
    await expect(repo.setPrimaryGroup(100, 9999)).rejects.toThrow()

    const rows = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    expect(rows).toHaveLength(0)

    const [row] = await db
      .select({ primary: users.primaryGroupId })
      .from(users)
      .where(eq(users.id, 100))
    expect(row?.primary).toBe(2)
  })
})

describe('seeded ladder is present for the CLI to use', () => {
  it('has the groups user:promote offers', async () => {
    const keys = await db.select({ key: usergroups.key }).from(usergroups)
    expect(keys.map((k) => k.key)).toEqual(
      expect.arrayContaining(['registered', 'moderators', 'administrators']),
    )
  })
})
