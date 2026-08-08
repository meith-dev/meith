/**
 * F21 acceptance: "Four-level tree with overrides at levels 2 and 4 resolves
 * correctly at every level."
 *
 * The F22 matrix drives this logic through the in-memory source, which proves
 * the *rules*. This proves the **wiring**: that the real Postgres adapter feeds
 * the resolver the same shapes, that NULL genuinely means inherit once it has
 * been through a nullable column, and that the ancestor walk reads the
 * materialised path correctly.
 *
 * Those are exactly the things a fixture cannot tell you, and exactly where a
 * private community leaks.
 */
import { Authorizer, type Actor } from '@meith/authorization'
import { ActorBuilder, PostgresAuthorizationSource, schema } from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let harness: TestDb
let authorizer: Authorizer
let member: Actor

/**
 * 1 Category            '1'          level 1
 *   2 Lounge            '1.2'        level 2 — override: DENY view
 *     3 Back room       '1.2.3'      level 3 — no override, inherits deny
 *       4 Vault         '1.2.3.4'    level 4 — override: GRANT view
 */
const CATEGORY = 1
const LOUNGE = 2
const BACK_ROOM = 3
const VAULT = 4

beforeAll(async () => {
  harness = await createTestDb()
  const db = harness.db

  await db.insert(schema.communities).values([
    { id: CATEGORY, type: 'category', title: 'Category', slug: 'category', path: '1', depth: 0 },
    { id: LOUNGE, type: 'community', title: 'Lounge', slug: 'lounge', parentId: CATEGORY, path: '1.2', depth: 1 },
    { id: BACK_ROOM, type: 'community', title: 'Back room', slug: 'back-room', parentId: LOUNGE, path: '1.2.3', depth: 2 },
    { id: VAULT, type: 'community', title: 'Vault', slug: 'vault', parentId: BACK_ROOM, path: '1.2.3.4', depth: 3 },
  ])

  /*
   * The registered group can view by default (migration 0001). Level 2 denies
   * it; level 4 grants it back. Level 3 sets nothing at all, so it must inherit
   * the denial from level 2 rather than fall back to the group default — that
   * distinction is the entire point of NULL meaning "inherit".
   */
  /*
   * Cast because the permission columns are generated from the registry into a
   * `Record<string, …>`, so drizzle's inferred insert type does not carry
   * `canView` — the same typing gap recorded in D23. The column exists; only
   * the static type is missing.
   */
  await db.insert(schema.communityPermissions).values([
    { communityId: LOUNGE, groupId: 2, canView: false },
    { communityId: VAULT, groupId: 2, canView: true },
  ] as unknown as (typeof schema.communityPermissions.$inferInsert)[])

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

async function canView(communityId: number): Promise<boolean> {
  const community = await authorizer.communityMatrix(member, communityId)
  return authorizer.can(member, 'community.view', { communityId, community })
}

describe('four-level resolution over Postgres', () => {
  it('level 1 uses the group default', async () => {
    expect(await canView(CATEGORY)).toBe(true)
  })

  it('level 2 applies its own override', async () => {
    expect(await canView(LOUNGE)).toBe(false)
  })

  /*
   * The case that separates a correct implementation from one that "works".
   * Level 3 has no row of its own, so a resolver that falls back to the group
   * default when it finds nothing on the community will grant access here — and
   * quietly expose a child of a private community.
   */
  it('level 3 inherits the denial rather than falling back to the group default', async () => {
    expect(await canView(BACK_ROOM)).toBe(false)
  })

  it('level 4 overrides the inherited denial', async () => {
    expect(await canView(VAULT)).toBe(true)
  })
})

describe('visibleCommunityIds agrees with communityMatrix', () => {
  /*
   * Two code paths answer "can this actor see this community": the per-community matrix
   * and the bulk visible set. If they ever disagree, one of them is wrong and
   * the board either leaks a community or hides one — and because list pages use
   * the bulk path while permission checks use the matrix, the disagreement
   * would show up as a community you can see in a listing but cannot open.
   */
  it('returns exactly the communities communityMatrix would allow', async () => {
    const visible = new Set(await authorizer.visibleCommunityIds(member))

    for (const communityId of [CATEGORY, LOUNGE, BACK_ROOM, VAULT]) {
      expect(visible.has(communityId)).toBe(await canView(communityId))
    }
  })

  it('excludes the inherited-denial community from the visible set', async () => {
    const visible = await authorizer.visibleCommunityIds(member)
    expect(visible).not.toContain(LOUNGE)
    expect(visible).not.toContain(BACK_ROOM)
    expect(visible).toContain(VAULT)
  })
})

describe('permission edits take effect', () => {
  it('a changed override is reflected on the next resolution', async () => {
    await harness.db
      .update(schema.communityPermissions)
      .set({ canView: true } as unknown as typeof schema.communityPermissions.$inferInsert)
      .where(eq(schema.communityPermissions.communityId, LOUNGE))

    // No caching between the adapter and the resolver, so the window is "next
    // request". Once the resolved matrix is cached (F21's stated invalidation
    // window), this is the test that has to grow a cache-bust alongside it.
    expect(await canView(LOUNGE)).toBe(true)
    expect(await canView(BACK_ROOM)).toBe(true)
  })
})
