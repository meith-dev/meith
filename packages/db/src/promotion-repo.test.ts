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

async function displayGroupOf(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ g: users.displayGroupId })
    .from(users)
    .where(eq(users.id, userId))
  return row?.g ?? null
}

function service() {
  return new PromotionService({ promotions: repo, guards: GUARDS })
}

describe('dry run', () => {
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
    expect(version?.v).toBe(1)
  })

  it('keeps a display group the member chose for themselves', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await addUser(2, { postCount: 150 })
    await db.execute(sql`update users set display_group_id = ${ADMINS} where id = 1`)

    await service().apply()

    expect(await displayGroupOf(1)).toBe(ADMINS)
    expect(await displayGroupOf(2)).toBeNull()
  })

  it('clears a display group pinned to the group the promotion moves them out of', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await db.execute(sql`update users set display_group_id = ${REGISTERED} where id = 1`)

    await service().apply()

    expect(await displayGroupOf(1)).toBeNull()
  })

  it('stores nothing when the chosen group is the one being promoted into', async () => {
    await addRule()
    await addUser(1, { postCount: 150 })
    await db.execute(sql`update users set display_group_id = ${VETERAN} where id = 1`)

    await service().apply()

    expect(await displayGroupOf(1)).toBeNull()
  })

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

  it('never demotes a user whose group is merely higher-ranked', async () => {
    await addRule({ fromPrimaryGroupId: null, minPostCount: 1, toPrimaryGroupId: REGISTERED })
    await addUser(1, { postCount: 5000, groupId: VETERAN })

    await service().apply()
    expect(await groupOf(1)).toBe(VETERAN)
  })

  it('does nothing when no rules are configured', async () => {
    await addUser(1, { postCount: 5000 })
    const result = await service().apply()

    expect(result.examined).toBe(0)
    expect(await groupOf(1)).toBe(REGISTERED)
  })
})

describe('paging', () => {
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
    expect(result.outcomes).toHaveLength(0)
    expect(result.examined).toBe(12)
  })
})

describe('rules', () => {
  it('reads null criteria as "no constraint", not as zero', async () => {
    await addRule({ minPostCount: null, minReputation: null, minDaysRegistered: null })
    await addUser(1, { postCount: 0 })

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

describe('rule writes', () => {
  const INPUT = {
    title: 'Veteran',
    displayOrder: 3,
    minPostCount: 100,
    minReputation: null,
    minDaysRegistered: null,
    fromPrimaryGroupId: REGISTERED,
    toPrimaryGroupId: VETERAN,
  }

  it('reads back everything a create was given', async () => {
    const id = await repo.createRule({
      ...INPUT,
      minReputation: 5,
      minDaysRegistered: 30,
    })

    const [rule] = await repo.listRules()
    expect(rule).toEqual({
      id,
      title: 'Veteran',
      enabled: true,
      displayOrder: 3,
      minPostCount: 100,
      minReputation: 5,
      minDaysRegistered: 30,
      fromPrimaryGroupId: REGISTERED,
      toPrimaryGroupId: VETERAN,
    })
  })

  it('stores a blank criterion as "no constraint" rather than as zero', async () => {
    await repo.createRule(INPUT)

    const [rule] = await repo.listRules()
    expect(rule?.minReputation).toBeUndefined()
    expect(rule?.minDaysRegistered).toBeUndefined()
  })

  it('stores a rule from any group', async () => {
    await repo.createRule({ ...INPUT, fromPrimaryGroupId: null })

    const [rule] = await repo.listRules()
    expect(rule?.fromPrimaryGroupId).toBeNull()
  })

  it('replaces every field on an edit, including clearing a criterion', async () => {
    const id = await repo.createRule({ ...INPUT, minReputation: 5 })

    await repo.updateRule(id, {
      ...INPUT,
      title: 'Old hand',
      displayOrder: 9,
      minPostCount: null,
      minReputation: null,
      minDaysRegistered: 90,
      fromPrimaryGroupId: null,
    })

    const [rule] = await repo.listRules()
    expect(rule).toMatchObject({
      id,
      title: 'Old hand',
      displayOrder: 9,
      minDaysRegistered: 90,
      fromPrimaryGroupId: null,
    })
    expect(rule?.minPostCount).toBeUndefined()
    expect(rule?.minReputation).toBeUndefined()
  })

  it('toggles enabled both ways without touching the criteria', async () => {
    const id = await repo.createRule(INPUT)

    await repo.setRuleEnabled(id, false)
    expect((await repo.listRules())[0]).toMatchObject({ enabled: false, minPostCount: 100 })

    await repo.setRuleEnabled(id, true)
    expect((await repo.listRules())[0]?.enabled).toBe(true)
  })

  it('deletes a rule', async () => {
    const id = await repo.createRule(INPUT)
    await repo.deleteRule(id)

    expect(await repo.listRules()).toEqual([])
  })

  it('refuses an edit or a toggle of a rule that is not there', async () => {
    await expect(repo.updateRule(9_999, INPUT)).rejects.toThrow(/no such promotion rule/i)
    await expect(repo.setRuleEnabled(9_999, false)).rejects.toThrow(
      /no such promotion rule/i,
    )
  })

  it('refuses a rule that promotes a group into itself', async () => {
    await expect(
      repo.createRule({ ...INPUT, fromPrimaryGroupId: VETERAN, toPrimaryGroupId: VETERAN }),
    ).rejects.toThrow(/into itself/i)

    expect(await repo.listRules()).toEqual([])
  })

  it('refuses a rule with no criteria at all', async () => {
    await expect(
      repo.createRule({
        ...INPUT,
        minPostCount: null,
        minReputation: null,
        minDaysRegistered: null,
      }),
    ).rejects.toThrow(/every member/i)

    expect(await repo.listRules()).toEqual([])
  })

  it('refuses an edit that would make a stored rule invalid, leaving it as it was', async () => {
    const id = await repo.createRule(INPUT)

    await expect(
      repo.updateRule(id, { ...INPUT, toPrimaryGroupId: REGISTERED }),
    ).rejects.toThrow(/into itself/i)

    expect((await repo.listRules())[0]?.toPrimaryGroupId).toBe(VETERAN)
  })

  it('promotes exactly the members a stored rule matches, and leaves the rest alone', async () => {
    await repo.createRule({
      ...INPUT,
      minPostCount: 100,
      minDaysRegistered: 30,
    })

    await addUser(1, { postCount: 150, createdAt: new Date('2020-01-01T00:00:00Z') })
    await addUser(2, { postCount: 99, createdAt: new Date('2020-01-01T00:00:00Z') })
    await addUser(3, { postCount: 150, createdAt: new Date() })
    await addUser(4, { postCount: 150, groupId: VETERAN })

    const result = await service().apply()

    expect(result.outcomes.map((o) => o.userId)).toEqual([1])
    expect(await groupOf(1)).toBe(VETERAN)
    expect(await groupOf(2)).toBe(REGISTERED)
    expect(await groupOf(3)).toBe(REGISTERED)
    expect(await groupOf(4)).toBe(VETERAN)
  })

  it('is skipped by the run once it is disabled', async () => {
    const id = await repo.createRule(INPUT)
    await addUser(1, { postCount: 150 })

    await repo.setRuleEnabled(id, false)
    expect((await service().preview()).outcomes).toEqual([])

    await repo.setRuleEnabled(id, true)
    expect((await service().preview()).outcomes).toHaveLength(1)
  })
})

describe('schema', () => {
  it('cascades a rule away when its target group is deleted', async () => {
    await addRule()
    await db.execute(sql`delete from usergroups where id = ${VETERAN}`)

    expect(await db.select({ id: groupPromotions.id }).from(groupPromotions)).toHaveLength(0)

    await db.insert(usergroups).values({ id: VETERAN, key: 'veteran', title: 'Veteran' })
  })
})
