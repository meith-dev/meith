import { Authorizer, type Actor } from '@meith/authorization'
import { ActorBuilder, PostgresAuthorizationSource, schema } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let harness: TestDb
let authorizer: Authorizer
let member: Actor

const CATEGORY = 1
const LOUNGE = 2
const BACK_ROOM = 3
const VAULT = 4

beforeAll(async () => {
  harness = await createTestDb()
  const db = harness.db

  await db.insert(schema.forums).values([
    { id: CATEGORY, type: 'category', title: 'Category', slug: 'category', path: '1', depth: 0 },
    { id: LOUNGE, type: 'forum', title: 'Lounge', slug: 'lounge', parentId: CATEGORY, path: '1.2', depth: 1 },
    { id: BACK_ROOM, type: 'forum', title: 'Back room', slug: 'back-room', parentId: LOUNGE, path: '1.2.3', depth: 2 },
    { id: VAULT, type: 'forum', title: 'Vault', slug: 'vault', parentId: BACK_ROOM, path: '1.2.3.4', depth: 3 },
  ])

  await db.insert(schema.forumPermissions).values([
    { forumId: LOUNGE, groupId: 2, canView: false },
    { forumId: VAULT, groupId: 2, canView: true },
  ] as unknown as (typeof schema.forumPermissions.$inferInsert)[])

  await db.insert(schema.users).values({
    id: 500,
    username: 'member',
    usernameLower: 'member',
    email: 'member@example.test',
    emailLower: 'member@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })

  authorizer = new Authorizer(new PostgresAuthorizationSource(db))
  member = (await new ActorBuilder(db, { guestGroupId: 1 }).buildForUser(500)) as Actor
}, 60_000)

afterAll(async () => {
  await harness.close()
})

async function canView(forumId: number): Promise<boolean> {
  const forum = await authorizer.forumMatrix(member, forumId)
  return authorizer.can(member, 'forum.view', { forumId, forum })
}

describe('four-level resolution over Postgres', () => {
  it('level 1 uses the group default', async () => {
    expect(await canView(CATEGORY)).toBe(true)
  })

  it('level 2 applies its own override', async () => {
    expect(await canView(LOUNGE)).toBe(false)
  })

  it('level 3 inherits the denial rather than falling back to the group default', async () => {
    expect(await canView(BACK_ROOM)).toBe(false)
  })

  it('level 4 overrides the inherited denial', async () => {
    expect(await canView(VAULT)).toBe(true)
  })
})

describe('visibleForumIds agrees with forumMatrix', () => {
  it('returns exactly the forums forumMatrix would allow', async () => {
    const visible = new Set(await authorizer.visibleForumIds(member))

    for (const forumId of [CATEGORY, LOUNGE, BACK_ROOM, VAULT]) {
      expect(visible.has(forumId)).toBe(await canView(forumId))
    }
  })

  it('excludes the inherited-denial forum from the visible set', async () => {
    const visible = await authorizer.visibleForumIds(member)
    expect(visible).not.toContain(LOUNGE)
    expect(visible).not.toContain(BACK_ROOM)
    expect(visible).toContain(VAULT)
  })
})

describe('permission edits take effect', () => {
  it('a changed override is reflected on the next resolution', async () => {
    await harness.db
      .update(schema.forumPermissions)
      .set({ canView: true } as unknown as typeof schema.forumPermissions.$inferInsert)
      .where(eq(schema.forumPermissions.forumId, LOUNGE))

    expect(await canView(LOUNGE)).toBe(true)
    expect(await canView(BACK_ROOM)).toBe(true)
  })
})
