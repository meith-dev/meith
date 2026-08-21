import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { PostgresUserBulkRepository } from './user-bulk-repo'
import { ACCOUNT_CLOSURE_DISCARD } from './user-merge-map'

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
  await db.execute(sql`delete from forum_moderators`)
  await db.execute(sql`delete from user_group_memberships`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`delete from usergroups where is_system = false`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path)
    values (1, 'forum', 'General', 'general', '1')
  `)
})

async function powerGroupWithoutTheFlag(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`
      insert into usergroups (key, title, is_system, is_staff_group, can_approve_content)
      values ('helpers', 'Helpers', false, false, true)
      returning id
    `),
  ) as Array<{ id: number }>
  return Number(rows[0]?.id)
}

async function addThread(input: {
  readonly id: number
  readonly authorUserId: number
  readonly visibility: string
  readonly deleted?: boolean
}): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility)
    values (${input.id}, 1, ${`T${input.id}`}, ${`t${input.id}`}, ${input.authorUserId},
            ${`u${input.authorUserId}`}, ${input.visibility})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post)
    values (${input.id}, ${input.id}, 1, ${input.authorUserId}, ${`u${input.authorUserId}`},
            'hello', ${input.visibility}, true)
  `)
}

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

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const rows = resultRows(await db.execute(query)) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('prunePreview', () => {
  it('counts the matches and shows some of them', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'spectre' })

    const preview = await repo.prunePreview(CRITERIA)
    expect(preview.total).toBe(2)
    expect(preview.sample.map((row) => row.username)).toEqual(['ghost', 'spectre'])
  })

  it('excludes anybody who has posted', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'poster', postCount: 1 })
    await seed({ id: 3, username: 'starter', threadCount: 1 })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes staff, however quiet they are', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'boss', groupId: SUPER_MODS })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes staff held as a secondary group too', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'quiet-mod' })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (2, ${SUPER_MODS})
    `)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a group that carries power without the staff flag', async () => {
    const helpers = await powerGroupWithoutTheFlag()
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'helper-primary', groupId: helpers })
    await seed({ id: 3, username: 'helper-secondary' })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (3, ${helpers})
    `)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a member whose only posts are held or deleted', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'held' })
    await seed({ id: 3, username: 'removed' })
    await addThread({ id: 1, authorUserId: 2, visibility: 'unapproved' })
    await addThread({ id: 2, authorUserId: 3, visibility: 'deleted' })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a forum moderator, whatever group they are in', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'appointee' })
    await db.execute(sql`
      insert into forum_moderators (forum_id, user_id) values (1, 2)
    `)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes a banned account', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'banned-one', state: 'banned' })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('excludes an account with an unlifted ban, however its state column reads', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'banned-properly' })
    await db.execute(sql`insert into bans (user_id, created_at) values (2, now())`)

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('does not exclude an account whose ban was lifted', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'forgiven' })
    await db.execute(
      sql`insert into bans (user_id, created_at, lifted_at) values (2, now(), now())`,
    )

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1, 2])
  })

  it('respects the registration boundary', async () => {
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'newcomer', createdAt: new Date('2026-01-01T00:00:00Z') })

    expect((await repo.prunePreview(CRITERIA)).sample.map((r) => r.id)).toEqual([1])
  })

  it('treats never-active as inactive when an inactivity date is given', async () => {
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
    expect(first).toEqual({ pruned: 2, prunedUserIds: [1, 2], remaining: 3 })
    expect(await deletedIds()).toEqual([1, 2])
  })

  it('closes rather than deletes, so a wrong date is recoverable', async () => {
    await seed({ id: 1, username: 'ghost' })
    await repo.pruneChunk(CRITERIA, 10)

    const rows = resultRows(
      await db.execute(sql`select count(*)::int as n from users where id = 1`),
    ) as Array<{ n: number }>
    expect(Number(rows[0]?.n)).toBe(1)
  })

  it('removes every authentication artifact while retaining the account row', async () => {
    await seed({ id: 1, username: 'ghost' })
    await db.execute(sql`
      insert into sessions (user_id, token_hash, expires_at)
      values (1, 'session', now() + interval '1 day')
    `)
    await db.execute(sql`
      insert into remember_tokens (user_id, token_hash, family_id, expires_at)
      values (1, 'remember', 'family', now() + interval '1 day')
    `)
    await db.execute(sql`
      insert into credential_tokens (user_id, token_hash, purpose, expires_at)
      values (1, 'credential', 'password_reset', now() + interval '1 day')
    `)
    await db.execute(sql`
      insert into admin_sessions (user_id, token_hash, expires_at)
      values (1, 'admin', now() + interval '1 day')
    `)
    await db.execute(sql`
      insert into user_identities (user_id, provider, subject)
      values (1, 'oidc', 'subject')
    `)
    await db.execute(sql`
      insert into passkeys (user_id, credential_id, public_key, label)
      values (1, 'passkey', 'public-key', 'Key')
    `)
    await db.execute(sql`
      insert into user_two_factor (user_id, sealed_secret, confirmed_at)
      values (1, 'sealed', now())
    `)
    await db.execute(sql`
      insert into recovery_codes (user_id, code_hash) values (1, 'recovery')
    `)
    await db.execute(sql`
      insert into api_tokens (user_id, name, lookup, secret_hash)
      values (1, 'CLI', 'lookup', 'secret')
    `)

    await repo.pruneChunk(CRITERIA, 10)

    expect(await deletedIds()).toEqual([1])
    for (const entry of ACCOUNT_CLOSURE_DISCARD) {
      expect(
        await count(sql`
          select count(*)::int as n
            from ${sql.raw(entry.table)}
           where ${sql.raw(entry.column)} = 1
        `),
        entry.table,
      ).toBe(0)
    }
  })

  it('applies the same exclusions the preview showed', async () => {
    const helpers = await powerGroupWithoutTheFlag()
    await seed({ id: 1, username: 'ghost' })
    await seed({ id: 2, username: 'poster', postCount: 3 })
    await seed({ id: 3, username: 'boss', groupId: SUPER_MODS })
    await seed({ id: 4, username: 'helper', groupId: helpers })
    await seed({ id: 5, username: 'held' })
    await addThread({ id: 1, authorUserId: 5, visibility: 'unapproved' })

    const preview = await repo.prunePreview(CRITERIA)
    await repo.pruneChunk(CRITERIA, 50)

    expect(preview.sample.map((row) => row.id)).toEqual([1])
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

  it('gives every group its own audience, on the same terms as the whole board', async () => {
    await seed({ id: 1, username: 'primary', groupId: SUPER_MODS })
    await seed({ id: 2, username: 'secondary' })
    await seed({ id: 3, username: 'ordinary' })
    await seed({ id: 4, username: 'unverified', groupId: SUPER_MODS, verified: false })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (2, ${SUPER_MODS})
    `)

    const byGroup = await repo.massMailAudienceByGroup()

    expect(byGroup.get(SUPER_MODS)).toBe(2)
    expect(byGroup.get(REGISTERED)).toBe(2)
    expect(await repo.massMailAudience(SUPER_MODS)).toBe(byGroup.get(SUPER_MODS))
    expect(await repo.massMailAudience(REGISTERED)).toBe(byGroup.get(REGISTERED))
  })

  it('counts a member holding a group twice over only once', async () => {
    await seed({ id: 1, username: 'both', groupId: SUPER_MODS })
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (1, ${SUPER_MODS})
    `)

    expect((await repo.massMailAudienceByGroup()).get(SUPER_MODS)).toBe(1)
  })

  it('reads every group in one query', async () => {
    await seed({ id: 1, username: 'one' })
    await seed({ id: 2, username: 'two', groupId: SUPER_MODS })

    harness.queries.reset()
    await repo.massMailAudienceByGroup()
    expect(harness.queries.count).toBe(1)
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
