/**
 * F67's bulk operations, against real Postgres.
 *
 * The mechanism — bounded batches, a keyset cursor, a dry run — is the same as
 * everywhere else in the panel and is the least interesting part. What is
 * proven here is the two rules that are not about mechanism:
 *
 *  - **a prune cannot reach an account whose loss is unrecoverable.** Anybody
 *    who has posted, any member of a staff group, any community moderator and any
 *    banned account are excluded unconditionally. Each exclusion has its own
 *    test because each is a different way for a maintenance sweep to do real
 *    damage;
 *  - **mass mail goes only to verified addresses**, and the cursor advances in
 *    the same transaction as the read — a duplicate mass mail is the one
 *    mistake in this panel that cannot be taken back.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresUserBulkRepository } from './user-bulk-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresUserBulkRepository

const REGISTERED = 2
const SUPER_MODS = 4
const OLD = new Date('2020-01-01T00:00:00Z')
const BOUNDARY = new Date('2025-01-01T00:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresUserBulkRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from mass_mails`)
  await db.execute(sql`delete from community_moderators`)
  await db.execute(sql`delete from user_group_memberships`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`delete from communities`)
  await db.execute(sql`
    insert into communities (id, type, title, slug, path)
    values (1, 'community', 'General', 'general', '1')
  `)
})

interface SeedUser {
  readonly id: number
  readonly username: string
  readonly groupId?: number
  readonly state?: string
  readonly postCount?: number
  readonly threadCount?: number
  readonly createdAt?: Date
  readonly lastActiveAt?: Date | null
  readonly verified?: boolean
}

async function seed(user: SeedUser): Promise<void> {
  const email = `${user.username}@example.test`
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id, state,
                       post_count, thread_count, created_at, last_active_at,
                       email_verified_at)
    values (${user.id}, ${user.username}, ${user.username.toLowerCase()},
            ${email}, ${email}, 'x', 'argon2id',
            ${user.groupId ?? REGISTERED}, ${user.state ?? 'active'},
            ${user.postCount ?? 0}, ${user.threadCount ?? 0},
            ${user.createdAt ?? OLD}, ${user.lastActiveAt ?? null},
            ${user.verified === false ? null : new Date('2024-01-01T00:00:00Z')})
  `)
}

const CRITERIA = { registeredBefore: BOUNDARY }

async function deletedIds(): Promise<number[]> {
  const rows = resultRows(
    await db.execute(sql`select id from users where deleted_at is not null order by id`),
  ) as Array<{ id: number }>
  return rows.map((row) => Number(row.id))
}

describe('prunePreview', () => {
  it('counts the matches and shows some of them', async () => {
    /*
     * The count alone is not evidence. An operator about to remove four hundred
     * accounts on a date filter needs to see that the ones it found are the
     * ones they meant.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'spectre' })

    const preview = await repo.prunePreview(CRITERIA)
    expect(preview.total).toBe(2)
    expect(preview.sample.map((row) => row.username)).toEqual(['ghost', 'spectre'])
  })

  it('excludes anybody who has posted', async () => {
    /*
     * Their account is attached to content, and what happens to that content is
     * a decision rather than something a sweep guesses at. Kills the mutant
     * that drops the post-count condition.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'poster', postCount: 1 })
    await seed({ id: 3, username: 'starter', threadCount: 1 })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes staff, however quiet they are', async () => {
    /*
     * A quiet administrator who registered years ago and reads more than they
     * write is the most likely person to match a naive inactivity filter and
     * the least acceptable to remove.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'boss', groupId: SUPER_MODS })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes staff held as a secondary group too', async () => {
    /*
     * The primary group is the obvious check and the incomplete one: F67 gave
     * `user_group_memberships` its first writer, so staff can be staff by way
     * of an additional group. Kills the mutant that checks only the primary.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'quiet-mod' })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (2, ${SUPER_MODS})
    `)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a community moderator, whatever group they are in', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'appointee' })
    await db.execute(sql`
      insert into community_moderators (community_id, user_id) values (1, 2)
    `)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a banned account', async () => {
    /*
     * The ban record is the reason they are quiet. Removing the account removes
     * the evidence of the decision.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'banned-one', state: 'banned' })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('respects the registration boundary', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'newcomer', createdAt: new Date('2026-01-01T00:00:00Z') })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('treats never-active as inactive when an inactivity date is given', async () => {
    /*
     * `last_active_at` is null for somebody who registered and never came back,
     * and a plain `<` comparison silently excludes exactly that group — who are
     * most of what a prune is for. Kills the mutant that drops the null branch.
     */
    await seed({ id: 1, username: 'never-came-back', lastActiveAt: null })
    await seed({ id: 2, username: 'recent', lastActiveAt: new Date('2026-01-01T00:00:00Z') })

    const preview = await repo.prunePreview({ ...CRITERIA, inactiveSince: BOUNDARY })
    expect(preview.sample.map((row) => row.id)).toEqual([1])
  })

  it('narrows to accounts awaiting activation when asked', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'unconfirmed', state: 'awaiting_activation' })

    const preview = await repo.prunePreview({ ...CRITERIA, onlyAwaitingActivation: true })
    expect(preview.sample.map((row) => row.id)).toEqual([2])
  })

  it('never counts an account that has already been pruned', async () => {
    await seed({ id: 1, username: 'ghost' })
    await db.execute(sql`update users set deleted_at = now() where id = 1`)

    expect((await repo.prunePreview(CRITERIA)).total).toBe(0)
  })
})

describe('pruneChunk', () => {
  it('closes a bounded batch and reports what is left', async () => {
    for (let id = 1; id <= 5; id += 1) await seed({ id, username: `u${id}` })

    const first = await repo.pruneChunk(CRITERIA, 2)
    expect(first).toEqual({ pruned: 2, remaining: 3 })
    expect(await deletedIds()).toEqual([1, 2])
  })

  it('closes rather than deletes, so a wrong date is recoverable', async () => {
    /*
     * Ten thousand deleted rows cannot be undone; ten thousand `deleted_at`
     * values can be cleared. The account also stays resolvable for anything
     * still pointing at it — "a former member" rather than a crash.
     */
    await seed({ id: 1, username: 'ghost' })
    await repo.pruneChunk(CRITERIA, 10)

    const rows = resultRows(
      await db.execute(sql`select count(*)::int as n from users where id = 1`),
    ) as Array<{ n: number }>
    expect(Number(rows[0]?.n)).toBe(1)
  })

  it('applies the same exclusions the preview showed', async () => {
    /*
     * The preview and the write share one predicate. A prune that removed
     * something the dry run did not list would make every future dry run
     * worthless. Kills the mutant that gives the write its own filter.
     */
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'poster', postCount: 3 })
    await seed({ id: 3, username: 'boss', groupId: SUPER_MODS })

    await repo.pruneChunk(CRITERIA, 50)
    expect(await deletedIds()).toEqual([1])
  })

  it('bumps the permission version', async () => {
    await seed({ id: 1, username: 'ghost' })
    const before = resultRows(
      await db.execute(sql`select version from cache_versions where key = 'permissions'`),
    ) as Array<{ version: number }>

    await repo.pruneChunk(CRITERIA, 10)

    const after = resultRows(
      await db.execute(sql`select version from cache_versions where key = 'permissions'`),
    ) as Array<{ version: number }>
    expect(Number(after[0]?.version)).toBe(Number(before[0]?.version) + 1)
  })
})

describe('mass mail', () => {
  it('reaches only verified, active, undeleted accounts', async () => {
    /*
     * The rule that is not a preference. An unverified address is as likely to
     * be a typo — or somebody else's mailbox — as the member's, and a board
     * that mails thousands of them stops being delivered anywhere. Kills the
     * mutant that drops the verification condition.
     */
    await seed({ id: 1, username: 'good' })
    await seed({ id: 2, username: 'unverified', verified: false })
    await seed({ id: 3, username: 'awaiting', state: 'awaiting_activation' })
    await seed({ id: 4, username: 'banned-one', state: 'banned' })
    await seed({ id: 5, username: 'gone' })
    await db.execute(sql`update users set deleted_at = now() where id = 5`)

    expect(await repo.massMailAudience(null)).toBe(1)
  })

  it('counts a group by primary *or* additional membership', async () => {
    await seed({ id: 1, username: 'primary', groupId: SUPER_MODS })
    await seed({ id: 2, username: 'secondary' })
    await seed({ id: 3, username: 'neither' })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (2, ${SUPER_MODS})
    `)

    expect(await repo.massMailAudience(SUPER_MODS)).toBe(2)
  })

  it('refuses an empty subject or body', async () => {
    await expect(
      repo.createMassMail({ subject: '  ', body: 'x', targetGroupId: null, createdByUserId: null }),
    ).rejects.toThrow(/subject/)
    await expect(
      repo.createMassMail({ subject: 'x', body: '  ', targetGroupId: null, createdByUserId: null }),
    ).rejects.toThrow(/body/)
  })

  it('claims recipients in batches and advances the cursor as it reads', async () => {
    /*
     * The cursor moves in the same transaction as the read. Two presses of the
     * button — or one double-submitted form — would otherwise both start from
     * the same point and mail those members twice, and a duplicate mass mail
     * cannot be taken back. Kills the mutant that reads first and saves after.
     */
    for (let id = 1; id <= 5; id += 1) await seed({ id, username: `u${id}` })
    const mailId = await repo.createMassMail({
      subject: 'Hello',
      body: 'Everyone',
      targetGroupId: null,
      createdByUserId: null,
    })

    const first = await repo.claimMassMailChunk(mailId, 2)
    expect(first.recipients.map((row) => row.userId)).toEqual([1, 2])
    expect(first.finished).toBe(false)

    const second = await repo.claimMassMailChunk(mailId, 2)
    expect(second.recipients.map((row) => row.userId)).toEqual([3, 4])

    const third = await repo.claimMassMailChunk(mailId, 2)
    expect(third.recipients.map((row) => row.userId)).toEqual([5])
    expect(third.finished).toBe(true)

    expect((await repo.readMassMail(mailId))?.queuedCount).toBe(5)
    expect((await repo.readMassMail(mailId))?.status).toBe('finished')
  })

  it('claims nothing more once it has finished', async () => {
    /*
     * A finished campaign is finished. Without this, pressing the button again
     * on an old one starts it over from a cursor that has already passed
     * everybody — which is only harmless because the cursor is at the end, and
     * would not be if anybody registered afterwards.
     */
    await seed({ id: 1, username: 'u1' })
    const mailId = await repo.createMassMail({
      subject: 'Hello',
      body: 'x',
      targetGroupId: null,
      createdByUserId: null,
    })

    await repo.claimMassMailChunk(mailId, 10)
    await seed({ id: 2, username: 'joined-later' })

    const again = await repo.claimMassMailChunk(mailId, 10)
    expect(again).toEqual({ recipients: [], finished: true })
  })

  it('refuses a message that does not exist', async () => {
    await expect(repo.claimMassMailChunk(9_999, 10)).rejects.toThrow(/No such message/)
  })

  it('carries the address and the name, so the job needs no second read', async () => {
    await seed({ id: 1, username: 'ann' })
    const mailId = await repo.createMassMail({
      subject: 'Hello',
      body: 'x',
      targetGroupId: null,
      createdByUserId: null,
    })

    const chunk = await repo.claimMassMailChunk(mailId, 10)
    expect(chunk.recipients[0]).toEqual({
      userId: 1,
      username: 'ann',
      email: 'ann@example.test',
    })
  })
})
