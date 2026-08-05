/**
 * F66's writes, against real Postgres.
 *
 * Two claims carry the feature and both are settled here:
 *
 *  - **every write bumps `permission_version`, in the same transaction** — a
 *    lost bump leaves resolved actors holding permissions that have been
 *    revoked, which is the failure direction that matters;
 *  - **a mass membership move is chunked and resumable** — bounded batches on a
 *    keyset cursor, rather than one UPDATE holding locks on `users` while the
 *    board tries to read it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresGroupAdminRepository } from './group-admin-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresGroupAdminRepository

const GUESTS = 1
const REGISTERED = 2
const ADMINS = 3

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresGroupAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from users`)
  /*
   * Created groups take a generated identity id in the single digits — the
   * seeded ladder occupies 1–7 — so a cleanup keyed on a high id would leave
   * them behind to collide on the next `create` with the same key.
   */
  await db.execute(sql`delete from usergroups where is_system = false`)
  await db.execute(sql`update cache_versions set version = 1 where key = 'permissions'`)
})

async function permissionVersion(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select version from cache_versions where key = 'permissions'`),
  ) as Array<{ version: number }>
  return Number(rows[0]?.version ?? 0)
}

async function seedMembers(count: number, groupId: number): Promise<void> {
  for (let i = 1; i <= count; i += 1) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${i}, ${`u${i}`}, ${`u${i}`}, ${`u${i}@example.test`},
              ${`u${i}@example.test`}, 'x', 'argon2id', ${groupId})
    `)
  }
}

describe('list', () => {
  it('returns the seeded ladder in display order, with member counts', async () => {
    await seedMembers(3, REGISTERED)

    const groups = await repo.list()
    expect(groups.length).toBeGreaterThanOrEqual(4)
    expect(groups.map((group) => group.displayOrder)).toEqual(
      [...groups.map((group) => group.displayOrder)].sort((a, b) => a - b),
    )
    expect(groups.find((group) => group.id === REGISTERED)?.memberCount).toBe(3)
    expect(groups.find((group) => group.id === GUESTS)?.memberCount).toBe(0)
  })

  it('marks the groups the board resolves by key as system groups', async () => {
    /*
     * `is_system` is what stops `remove` deleting registration out from under
     * the board. It has to be readable, or the screen cannot say so.
     */
    const groups = await repo.list()
    expect(groups.find((group) => group.id === REGISTERED)?.isSystem).toBe(true)
  })
})

describe('readPermissions', () => {
  it('returns a complete set, coerced, for a real group', async () => {
    const permissions = await repo.readPermissions(REGISTERED)

    expect(permissions?.canPostThreads).toBe(true)
    /* Numerics come back as numbers, not as the strings some drivers hand over. */
    expect(typeof permissions?.maxPostsPerDay).toBe('number')
  })

  it('is null for a group that does not exist', async () => {
    expect(await repo.readPermissions(9_999)).toBeNull()
  })
})

describe('savePermissions', () => {
  it('writes every field, so an omitted one is a default rather than a leftover', async () => {
    /*
     * There is no inherit state at this layer — a group's global permission is
     * the bottom of the resolution (R4.1 layer 1), so every cell has an answer.
     * Kills the mutant that writes only the keys it was handed.
     */
    await repo.savePermissions(REGISTERED, { canPostThreads: false })

    const after = await repo.readPermissions(REGISTERED)
    expect(after?.canPostThreads).toBe(false)
    /* `canView` was not in the payload, so it is the registry fallback. */
    expect(after?.canView).toBe(false)
  })

  it('bumps the permission version', async () => {
    /*
     * The claim the whole file is about. A revocation whose bump is lost stays
     * un-revoked for the cache's lifetime. Kills the mutant that drops it.
     */
    const before = await permissionVersion()
    await repo.savePermissions(REGISTERED, { canPostThreads: false })

    expect(await permissionVersion()).toBe(before + 1)
  })
})

describe('updateIdentity', () => {
  it('renames without touching permissions, and still bumps', async () => {
    /*
     * A rename is not a permission change, but the badge and the staff flag are
     * read through the same resolved actor — so the bump is unconditional
     * rather than a judgement about which columns matter.
     */
    const before = await permissionVersion()
    /*
     * Compared against what was actually there rather than a literal: the claim
     * is that the identity write leaves the permission columns alone, and a
     * hardcoded expectation would instead be asserting the seed.
     */
    const permissionsBefore = await repo.readPermissions(REGISTERED)

    await repo.updateIdentity(REGISTERED, {
      title: 'Members',
      description: 'Renamed',
      displayOrder: 5,
      isStaffGroup: false,
      badgeToken: 'badge-member',
      nameColorLight: 'oklch(0.49 0.13 250)',
      nameColorDark: 'oklch(0.69 0.12 250)',
    })

    const group = (await repo.list()).find((row) => row.id === REGISTERED)
    expect(group).toMatchObject({
      title: 'Members',
      displayOrder: 5,
      badgeToken: 'badge-member',
      /*
       * Both schemes round-trip. A write that stored one and dropped the other
       * would leave half the board's names uncoloured at night, which is the
       * failure two columns exist to prevent.
       */
      nameColorLight: 'oklch(0.49 0.13 250)',
      nameColorDark: 'oklch(0.69 0.12 250)',
    })
    expect(await repo.readPermissions(REGISTERED)).toEqual(permissionsBefore)
    expect(await permissionVersion()).toBe(before + 1)
  })
})

describe('create', () => {
  it('copies another group’s permissions rather than starting from deny', async () => {
    /*
     * The registry defaults are deny-everything, so a group made from them is
     * one whose members cannot see the board. "Like Registered, but…" is what
     * an operator means essentially every time.
     */
    const id = await repo.create({
      key: 'veterans',
      title: 'Veterans',
      copyFromGroupId: REGISTERED,
    })

    const copied = await repo.readPermissions(id)
    const source = await repo.readPermissions(REGISTERED)
    expect(copied?.canPostThreads).toBe(source?.canPostThreads)
    expect(copied?.canView).toBe(source?.canView)
  })

  it('is not a system group, so it can be deleted again', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    expect((await repo.list()).find((row) => row.id === id)?.isSystem).toBe(false)
  })

  it('refuses a duplicate key at the database', async () => {
    await expect(
      repo.create({ key: 'registered', title: 'Clash', copyFromGroupId: REGISTERED }),
    ).rejects.toThrow()
  })

  it('refuses to copy from a group that does not exist', async () => {
    await expect(
      repo.create({ key: 'veterans', title: 'V', copyFromGroupId: 9_999 }),
    ).rejects.toThrow(/no group to copy from/)
  })
})

describe('remove', () => {
  it('moves the members and then deletes the group', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await seedMembers(2, id)

    await repo.remove(id, REGISTERED)

    const groups = await repo.list()
    expect(groups.find((group) => group.id === id)).toBeUndefined()
    expect(groups.find((group) => group.id === REGISTERED)?.memberCount).toBe(2)
  })

  it('refuses a system group', async () => {
    /*
     * `is_system` marks the groups the board's own code resolves by key.
     * Deleting one breaks registration rather than a screen. Kills the mutant
     * that drops the check.
     */
    await expect(repo.remove(REGISTERED, ADMINS)).rejects.toThrow(/how the board works/)
    expect((await repo.list()).find((group) => group.id === REGISTERED)).toBeDefined()
  })

  it('refuses to move members into the group being deleted', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await expect(repo.remove(id, id)).rejects.toThrow(/being deleted/)
  })

  it('refuses a group that does not exist', async () => {
    await expect(repo.remove(9_999, REGISTERED)).rejects.toThrow(/No such group/)
  })

  it('leaves the version alone when the write was refused', async () => {
    /*
     * The bump is inside the transaction, so a refusal rolls it back with
     * everything else. Kills the mutant that bumps outside it: that one throws
     * away every resolved actor on an operation that changed nothing, which is
     * a stampede rather than a correctness bug and so would otherwise go
     * unnoticed until it happened under load.
     *
     * Note the mutant this *cannot* kill, because there is nothing to kill:
     * bumping before the work rather than after is the same transaction either
     * way, so the two orders are indistinguishable by construction.
     */
    const before = await permissionVersion()
    await expect(repo.remove(REGISTERED, ADMINS)).rejects.toThrow()

    expect(await permissionVersion()).toBe(before)
  })
})

describe('moveMembersChunk', () => {
  it('moves at most one chunk and reports where to continue', async () => {
    await seedMembers(5, REGISTERED)

    const first = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 2,
    })

    expect(first.moved).toBe(2)
    expect(first.nextCursor).toBe(2)
    expect((await repo.list()).find((g) => g.id === ADMINS)?.memberCount).toBe(2)
  })

  it('resumes from the cursor and finishes with a null one', async () => {
    /*
     * The cursor is what makes a long run interruptible. A short chunk means
     * the source is exhausted, and saying so with `null` is what lets a caller
     * stop without a second query that finds nothing.
     */
    await seedMembers(5, REGISTERED)

    let cursor: number | null = 0
    let total = 0
    while (cursor !== null) {
      const chunk: Awaited<ReturnType<typeof repo.moveMembersChunk>> =
        await repo.moveMembersChunk({
          fromGroupId: REGISTERED,
          toGroupId: ADMINS,
          afterUserId: cursor,
          limit: 2,
        })
      total += chunk.moved
      cursor = chunk.nextCursor
    }

    expect(total).toBe(5)
    expect((await repo.list()).find((g) => g.id === REGISTERED)?.memberCount).toBe(0)
  })

  it('reports a null cursor when the chunk came back short', async () => {
    /*
     * Short means exhausted. Kills the mutant that always reports the last id
     * moved: the loop above would still total 5, because the extra round trip
     * finds nothing and stops — the cost is a wasted query per run, which no
     * assertion on the total can see.
     */
    await seedMembers(3, REGISTERED)

    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(chunk).toEqual({ moved: 3, nextCursor: null })
  })

  it('starts after the cursor rather than at the beginning of the group', async () => {
    /*
     * Kills the mutant that drops `id > afterUserId`. A sequential run hides it
     * — the source group shrinks as it goes, so the totals still come out right
     * — and it only shows when the cursor is ahead of members who are still
     * there, which is exactly the case a resumed run is in.
     */
    await seedMembers(5, REGISTERED)

    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 3,
      limit: 10,
    })

    expect(chunk.moved).toBe(2)
    expect((await repo.list()).find((g) => g.id === REGISTERED)?.memberCount).toBe(3)
  })

  it('moves nobody when the source group is empty', async () => {
    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(chunk).toEqual({ moved: 0, nextCursor: null })
  })

  it('touches only the source group', async () => {
    await seedMembers(2, REGISTERED)
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (99, 'other', 'other', 'o@example.test', 'o@example.test', 'x', 'argon2id', ${GUESTS})
    `)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect((await repo.list()).find((g) => g.id === GUESTS)?.memberCount).toBe(1)
  })

  it('refuses a move into the same group', async () => {
    await expect(
      repo.moveMembersChunk({
        fromGroupId: REGISTERED,
        toGroupId: REGISTERED,
        afterUserId: 0,
        limit: 10,
      }),
    ).rejects.toThrow(/two different groups/)
  })

  it('bumps the version on every chunk, not only the last', async () => {
    /*
     * A run that stops half way has still changed real permissions, and the
     * actors holding the old ones have to go. Kills the mutant that bumps once
     * at the end of a multi-chunk run.
     */
    await seedMembers(4, REGISTERED)
    const before = await permissionVersion()

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 2,
    })
    expect(await permissionVersion()).toBe(before + 1)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 2,
      limit: 2,
    })
    expect(await permissionVersion()).toBe(before + 2)
  })
})
