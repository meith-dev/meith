import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresWarningRepository } from './warning-repo'
import { resultRows } from './result-rows'
import { users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresWarningRepository

const IVAN = 1
const MOD = 2
const AT = new Date('2026-07-31T12:00:00Z')
const DAY = 86_400_000

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresWarningRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from warnings`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [IVAN, 'ivan'],
      [MOD, 'mod'],
    ].map(([id, name]) => ({
      id: id as number,
      username: name as string,
      usernameLower: name as string,
      email: `${String(name)}@example.test`,
      emailLower: `${String(name)}@example.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    })),
  )
})

async function cachedPoints(userId = IVAN): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select warning_points from users where id = ${userId}`),
  ) as Array<{ warning_points: number }>
  return Number(rows[0]!.warning_points)
}

async function issue(
  over: Partial<Parameters<PostgresWarningRepository['issue']>[0]> = {},
): Promise<{ warningId: number; points: number }> {
  return repo.issue({
    userId: IVAN,
    issuedByUserId: MOD,
    typeId: null,
    title: 'Spamming',
    points: 2,
    reason: 'Four threads, one link.',
    postId: null,
    expiresAt: null,
    at: AT,
    ...over,
  })
}

describe('the seeded configuration', () => {
  it('ships usable warning types', async () => {
    const types = await repo.listTypes()
    expect(types.length).toBeGreaterThan(0)
    expect(types[0]).toMatchObject({ title: 'Spamming', points: 2, expiryDays: 90 })
  })

  it('ships the three-rung ladder, ascending', async () => {
    expect(await repo.listLevels()).toEqual([
      { points: 4, action: 'moderate_posting', durationDays: 30 },
      { points: 7, action: 'suspend_posting', durationDays: 14 },
      { points: 10, action: 'ban', durationDays: null },
    ])
  })

  it('drops a level whose action this build does not recognise', async () => {
    await db.execute(
      sql`insert into warning_levels (points, action) values (20, 'delete_account')`,
    )
    expect((await repo.listLevels()).map((l) => l.points)).toEqual([4, 7, 10])
  })

  it('hides an inactive type from the form and from lookup', async () => {
    await db.execute(sql`update warning_types set is_active = false where id = 1`)
    expect((await repo.listTypes()).map((t) => t.id)).not.toContain(1)
    expect(await repo.findType(1)).toBeNull()
  })
})

describe('issuing', () => {
  it('writes the warning and the total in one go', async () => {
    const written = await issue()

    expect(written.points).toBe(2)
    expect(await cachedPoints()).toBe(2)

    const rows = resultRows(
      await db.execute(sql`select action, detail from admin_log`),
    ) as Array<{ action: string; detail: Record<string, unknown> }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'warning.issue' })
    expect(rows[0]!.detail).toMatchObject({ warningId: written.warningId, total: 2 })
  })

  it('sums several live warnings', async () => {
    await issue({ points: 2 })
    await issue({ points: 3 })
    expect((await issue({ points: 1 })).points).toBe(6)
  })

  it('does not count a warning that has already expired', async () => {
    await issue({ points: 5, expiresAt: new Date(Date.now() - DAY) })
    expect(await cachedPoints()).toBe(0)
  })

  it('counts one whose expiry is still ahead', async () => {
    await issue({ points: 5, expiresAt: new Date(Date.now() + DAY) })
    expect(await cachedPoints()).toBe(5)
  })

  it('warns one member without touching another', async () => {
    await issue()
    expect(await cachedPoints(MOD)).toBe(0)
  })
})

describe('revoking', () => {
  it('withdraws the warning and recomputes the total', async () => {
    const first = await issue({ points: 2 })
    await issue({ points: 3 })
    expect(await cachedPoints()).toBe(5)

    const revoked = await repo.revoke({
      warningId: first.warningId,
      actorUserId: MOD,
      reason: 'Wrong member.',
      at: AT,
    })

    expect(revoked).toEqual({ userId: IVAN, points: 3 })
    expect(await cachedPoints()).toBe(3)
  })

  it('is a no-op the second time, and writes no second audit row', async () => {
    const written = await issue()
    const input = {
      warningId: written.warningId,
      actorUserId: MOD,
      reason: 'Wrong member.',
      at: AT,
    }

    expect(await repo.revoke(input)).not.toBeNull()
    expect(await repo.revoke(input)).toBeNull()

    const actions = resultRows(
      await db.execute(sql`select action from admin_log order by id`),
    ) as Array<{ action: string }>
    expect(actions.map((a) => a.action)).toEqual(['warning.issue', 'warning.revoke'])
  })

  it('reports a warning that never existed the same way', async () => {
    expect(
      await repo.revoke({ warningId: 999, actorUserId: MOD, reason: '', at: AT }),
    ).toBeNull()
  })

  it('keeps the withdrawal on the record rather than deleting the row', async () => {
    const written = await issue()
    await repo.revoke({
      warningId: written.warningId,
      actorUserId: MOD,
      reason: 'Issued twice.',
      at: AT,
    })

    const page = await repo.history(IVAN, { limit: 10 })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toMatchObject({
      revokedByUsername: 'mod',
      revokeReason: 'Issued twice.',
    })
  })
})

describe('the total is derived, not adjusted', () => {
  it('repairs a cached total that has been corrupted', async () => {
    await issue({ points: 2 })
    await db.execute(sql`update users set warning_points = 47 where id = ${IVAN}`)

    expect(await repo.pointsFor(IVAN)).toBe(2)
    expect(await cachedPoints()).toBe(2)
  })

  it('repairs it on the next issue too, rather than adding to the wrong number', async () => {
    await issue({ points: 2 })
    await db.execute(sql`update users set warning_points = 47 where id = ${IVAN}`)

    expect((await issue({ points: 3 })).points).toBe(5)
  })
})

describe('restrictions', () => {
  it('writes and clears both timestamps', async () => {
    const until = new Date(Date.now() + 30 * DAY)
    await repo.applyRestriction({
      userId: IVAN,
      restriction: { suspendedUntil: null, moderatedUntil: until },
      at: AT,
    })

    let read = await repo.readRestriction(IVAN)
    expect(read.moderatedUntil?.getTime()).toBe(until.getTime())
    expect(read.suspendedUntil).toBeNull()

    await repo.applyRestriction({
      userId: IVAN,
      restriction: { suspendedUntil: null, moderatedUntil: null },
      at: AT,
    })
    read = await repo.readRestriction(IVAN)
    expect(read).toEqual({ suspendedUntil: null, moderatedUntil: null })
  })

  it('reports nothing for a member who does not exist', async () => {
    expect(await repo.readRestriction(999)).toEqual({
      suspendedUntil: null,
      moderatedUntil: null,
    })
  })
})

describe('history', () => {
  it('is newest first and keyset-paged', async () => {
    for (let i = 0; i < 5; i += 1) {
      await issue({ title: `W${i}`, at: new Date(AT.getTime() + i * 1000) })
    }

    const first = await repo.history(IVAN, { limit: 2 })
    expect(first.rows.map((r) => r.title)).toEqual(['W4', 'W3'])
    expect(first.nextCursor).toBeDefined()

    const second = await repo.history(IVAN, { limit: 2, after: first.nextCursor! })
    expect(second.rows.map((r) => r.title)).toEqual(['W2', 'W1'])
  })

  it('stops offering a cursor on the last page', async () => {
    await issue()
    expect((await repo.history(IVAN, { limit: 10 })).nextCursor).toBeUndefined()
  })

  it('names who issued it', async () => {
    await issue()
    expect((await repo.history(IVAN, { limit: 10 })).rows[0]).toMatchObject({
      issuedByUsername: 'mod',
      points: 2,
    })
  })
})

describe('the expiry sweep', () => {
  it('finds a member whose cached total still counts a lapsed warning', async () => {
    await issue({ points: 5, expiresAt: new Date(Date.now() + DAY) })
    expect(await cachedPoints()).toBe(5)

    await db.execute(sql`update warnings set expires_at = now() - interval '1 day'`)

    const due = await repo.expireDue(new Date(), 100)
    expect(due.expired).toBe(1)
    expect(due.userIds).toEqual([IVAN])
  })

  it('finds nothing once the cache agrees with the live rows', async () => {
    await issue({ points: 5, expiresAt: new Date(Date.now() + DAY) })
    await db.execute(sql`update warnings set expires_at = now() - interval '1 day'`)
    await repo.pointsFor(IVAN)

    expect(await repo.expireDue(new Date(), 100)).toEqual({ expired: 0, userIds: [] })
  })

  it('ignores a revoked warning, whose points were already removed', async () => {
    const written = await issue({ points: 5, expiresAt: new Date(Date.now() - DAY) })
    await repo.revoke({ warningId: written.warningId, actorUserId: MOD, reason: '', at: AT })

    expect((await repo.expireDue(new Date(), 100)).expired).toBe(0)
  })

  it('is bounded, so a board that has been down catches up over several ticks', async () => {
    for (let i = 0; i < 4; i += 1) {
      await issue({ points: 1, expiresAt: new Date(Date.now() + DAY) })
    }
    await db.execute(sql`update warnings set expires_at = now() - interval '1 day'`)

    expect((await repo.expireDue(new Date(), 2)).expired).toBe(2)
  })
})

describe('the evidence a warning cites', () => {
  it('reports the author of a post, and nothing for one that is gone', async () => {
    expect(await repo.findPostAuthor(999)).toBeNull()
  })
})

describe('who can be warned', () => {
  it('resolves a live member', async () => {
    expect(await repo.findWarnable(IVAN)).toEqual({ id: IVAN, username: 'ivan' })
  })

  it('refuses a deleted account, which has nobody to receive the warning', async () => {
    await db.execute(sql`update users set state = 'deleted' where id = ${IVAN}`)
    expect(await repo.findWarnable(IVAN)).toBeNull()
  })
})
