/**
 * F24 on real Postgres.
 *
 * `evaluatePromotions` is unit-tested in `@meith/groups`, which proves the
 * rules and the safety guards. What needs a database is the run: that a dry run
 * writes nothing, that a real run is idempotent, and that paging a set the run
 * is *mutating* does not skip anybody.
 */
import { PromotionService, type PromotionGuards } from '@meith/groups'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresPromotionRepository } from './promotion-repo'
import { cacheVersions, groupPromotions, usergroups, users } from './schema'

const REGISTERED = 2
const ADMINS = 3
const BANNED = 7
const VETERAN = 50

let harness: TestDb
let db: Database
let repo: PostgresPromotionRepository

const GUARDS: PromotionGuards = {
  protectedGroupIds: [BANNED, ADMINS],
  rank: new Map([
    [REGISTERED, 2],
    [VETERAN, 3],
    [ADMINS, 9],
  ]),
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresPromotionRepository(db)

  // A target group to promote into; the seeded ladder has no "Veteran".
  await db.insert(usergroups).values({ id: VETERAN, key: 'veteran', title: 'Veteran' })
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(groupPromotions)
  await db.delete(users)
  await db.delete(cacheVersions)
})

async function addUser(
  id: number,
  over: Partial<{ postCount: number; reputation: number; groupId: number; createdAt: Date }> = {},
) {
  await db.insert(users).values({
    id,
    username: `u${id}`,
    usernameLower: `u${id}`,
    email: `u${id}@example.test`,
    emailLower: `u${id}@example.test`,
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: over.groupId ?? REGISTERED,
    postCount: over.postCount ?? 0,
    reputation: over.reputation ?? 0,
    createdAt: over.createdAt ?? new Date('2020-01-01T00:00:00Z'),
  })
}

async function addRule(over: Partial<typeof groupPromotions.$inferInsert> = {}) {
  await db.insert(groupPromotions).values({
    title: 'Veteran',
    minPostCount: 100,
    fromPrimaryGroupId: REGISTERED,
    toPrimaryGroupId: VETERAN,
    ...over,
  })
}

async function groupOf(userId: number): Promise<number | null> {
  const [row] = await db.select({ g: users.primaryGroupId }).from(users).where(eq(users.id, userId))
  return row?.g ?? null
}

function service() {
  return new PromotionService({ promotions: repo, guards: GUARDS })
}

describe('dry run', () => {
  /*
   * F24's acceptance: "Dry run reports affected users without writing." An ACP
   * preview that quietly applied would be the worst possible surprise.
   */
  it('reports the affected users and changes nothing', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await addUser(2, { postCount: 5 })

    const result = await service().preview()

    expect(result.applied).toBe(false)
    expect(result.outcomes.map((o) => o.userId)).toEqual([1])
    expect(await groupOf(1)).toBe(REGISTERED)
    expect(await db.select({ v: cacheVersions.version }).from(cacheVersions)).toHaveLength(0)
  })

  it('agrees exactly with what a real run then does', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await addUser(2, { postCount: 150 })

    const preview = await service().preview()
    const applied = await service().apply()

    // A preview computed by different code would eventually lie; these share
    // one evaluation and differ only in whether they write.
    expect(applied.outcomes).toEqual(preview.outcomes)
  })
})

describe('applying', () => {
  it('moves the user and bumps permission_version once for the batch', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await addUser(2, { postCount: 150 })

    const result = await service().apply()

    expect(result.applied).toBe(true)
    expect(await groupOf(1)).toBe(VETERAN)
    expect(await groupOf(2)).toBe(VETERAN)

    const [version] = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    // Once for two users — it is a global counter, so per-user bumps are waste.
    expect(version?.v).toBe(1)
  })

  /* F24's other acceptance criterion. */
  it('is idempotent across repeated runs', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })

    expect((await service().apply()).outcomes).toHaveLength(1)
    expect((await service().apply()).outcomes).toHaveLength(0)
    expect(await groupOf(1)).toBe(VETERAN)
  })

  it('never lifts a ban, whatever the criteria say', async () => {
    await addRule({ fromPrimaryGroupId: null, minPostCount: 1 })
    await addUser(1, { postCount: 5000, groupId: BANNED })

    await service().apply()
    expect(await groupOf(1)).toBe(BANNED)
  })

  it('never touches a protected group, even for a rule that matches', async () => {
    await addRule({ fromPrimaryGroupId: null, minPostCount: 1, toPrimaryGroupId: REGISTERED })
    await addUser(1, { postCount: 5000, groupId: ADMINS })

    await service().apply()
    expect(await groupOf(1)).toBe(ADMINS)
  })

  /*
   * Deliberately uses VETERAN, which is *not* in protectedGroupIds. An earlier
   * version of this test used an administrator and passed even with the
   * demotion guard removed — the protected-groups check was catching it, so the
   * test proved nothing about ranking. Mutation testing surfaced that.
   */
  it('never demotes a user whose group is merely higher-ranked', async () => {
    await addRule({ fromPrimaryGroupId: null, minPostCount: 1, toPrimaryGroupId: REGISTERED })
    await addUser(1, { postCount: 5000, groupId: VETERAN })

    await service().apply()
    expect(await groupOf(1)).toBe(VETERAN)
  })

  it('does nothing when no rules are configured', async () => {
    await addUser(1, { postCount: 5000 })
    const result = await service().apply()

    // And does not page the whole user table to find that out.
    expect(result.examined).toBe(0)
    expect(await groupOf(1)).toBe(REGISTERED)
  })
})

describe('paging', () => {
  /*
   * The bug that only appears on a real run: applying a promotion changes the
   * rows being paged. With OFFSET, moving a user shifts every later row up one
   * and the next page skips somebody — which shows up as "some people never get
   * promoted" and is near-impossible to reproduce by hand. Keyset paging on an
   * immutable id does not have the problem.
   */
  it('promotes everyone when the batch is smaller than the population', async () => {
    await addRule()
    for (let id = 1; id <= 25; id++) await addUser(id, { postCount: 150 })

    const result = await service().apply(5)

    expect(result.outcomes).toHaveLength(25)
    expect(result.examined).toBe(25)
    for (let id = 1; id <= 25; id++) expect(await groupOf(id)).toBe(VETERAN)
  })

  it('counts everyone it examined, so an empty result is explicable', async () => {
    await addRule({ minPostCount: 10_000 })
    for (let id = 1; id <= 12; id++) await addUser(id)

    const result = await service().preview(5)
    // Nobody qualified, but the run did look at the whole board.
    expect(result.outcomes).toHaveLength(0)
    expect(result.examined).toBe(12)
  })
})

describe('rules', () => {
  it('reads null criteria as "no constraint", not as zero', async () => {
    await addRule({ minPostCount: null, minReputation: null, minDaysRegistered: null })
    await addUser(1, { postCount: 0 })

    // A rule with no thresholds means "everyone in the source group".
    expect((await service().preview()).outcomes).toHaveLength(1)
  })

  it('ignores disabled rules', async () => {
    await addRule({ enabled: false })
    await addUser(1, { postCount: 500 })
    expect((await service().preview()).outcomes).toHaveLength(0)
  })

  it('applies the first rule in display order', async () => {
    await addRule({ title: 'Second', displayOrder: 1, toPrimaryGroupId: REGISTERED })
    await addRule({ title: 'First', displayOrder: 0, toPrimaryGroupId: VETERAN })
    await addUser(1, { postCount: 500 })

    const [outcome] = (await service().preview()).outcomes
    expect(outcome?.ruleTitle).toBe('First')
  })
})

describe('candidate scan', () => {
  it('reads a page in one query', async () => {
    for (let id = 1; id <= 5; id++) await addUser(id)

    harness.queries.reset()
    await repo.candidates(0, 10)
    expect(harness.queries.count).toBe(1)
  })

  it('pages strictly after the given id', async () => {
    for (let id = 1; id <= 5; id++) await addUser(id)

    const page = await repo.candidates(3, 10)
    expect(page.map((c) => c.userId)).toEqual([4, 5])
  })
})

describe('schema', () => {
  it('cascades a rule away when its target group is deleted', async () => {
    await addRule()
    await db.execute(sql`delete from usergroups where id = ${VETERAN}`)

    // A rule pointing at a group that no longer exists would promote people
    // into nothing; the FK removes it instead.
    expect(await db.select({ id: groupPromotions.id }).from(groupPromotions)).toHaveLength(0)

    // Restore for the remaining tests in this file.
    await db.insert(usergroups).values({ id: VETERAN, key: 'veteran', title: 'Veteran' })
  })
})
