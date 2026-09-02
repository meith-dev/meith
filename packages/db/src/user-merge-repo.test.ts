import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { DENORMALISED_USERNAME_COLUMNS } from './denormalised-username'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { mergeMapColumns } from './user-merge-map'
import { PostgresUserMergeRepository } from './user-merge-repo'

let harness: TestDb
let db: Database
let repo: PostgresUserMergeRepository

const REGISTERED = 2
const WINNER = 1
const LOSER = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresUserMergeRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from reputation`)
  await db.execute(sql`delete from warnings`)
  await db.execute(sql`delete from user_relations`)
  await db.execute(sql`delete from thread_subscriptions`)
  await db.execute(sql`delete from forum_subscriptions`)
  await db.execute(sql`delete from user_group_memberships`)
  await db.execute(sql`delete from sessions`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from announcements`)
  await db.execute(sql`delete from private_messages`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`update board_stats set newest_user_id = null, newest_username = null`)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path)
    values (1, 'forum', 'General', 'general', '1')
  `)
})

async function seedUser(id: number, username: string, state = 'active'): Promise<void> {
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id, state,
                       post_count, thread_count, reputation)
    values (${id}, ${username}, ${username.toLowerCase()},
            ${`${username}@example.test`}, ${`${username}@example.test`},
            'x', 'argon2id', ${REGISTERED}, ${state}, 0, 0, 0)
  `)
}

async function seedPair(): Promise<void> {
  await seedUser(WINNER, 'keeper')
  await seedUser(LOSER, 'duplicate')
}

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const rows = resultRows(await db.execute(query)) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

describe('the merge map', () => {
  it('accounts for every column in the schema that points at a user', async () => {
    const rows = resultRows(
      await db.execute(sql`
        select table_name, column_name
          from information_schema.columns
         where table_schema = 'public'
           and (column_name like '%user_id' or column_name like '%username')
           and not (table_name = 'users' and column_name in ('username', 'username_lower'))
         order by 1, 2
      `),
    ) as Array<{ table_name: string; column_name: string }>

    const inSchema = rows.map((row) => `${row.table_name}.${row.column_name}`).sort()
    expect(mergeMapColumns()).toEqual(inSchema)
  })

  it('puts every column in exactly one list', () => {
    const columns = mergeMapColumns()
    expect(new Set(columns).size).toBe(columns.length)
  })
})

describe('preview', () => {
  it('counts what would move, and names both accounts', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug)
      values (1, 1, ${LOSER}, 'duplicate', 'T', 't')
    `)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username, message)
      values (1, 1, 1, ${LOSER}, 'duplicate', 'x'),
             (2, 1, 1, ${LOSER}, 'duplicate', 'y')
    `)

    const preview = await repo.preview(LOSER, WINNER)
    expect(preview).toMatchObject({
      fromUsername: 'duplicate',
      toUsername: 'keeper',
      posts: 2,
      threads: 1,
      blockedByBan: false,
    })
  })

  it('reports a ban, because a ban blocks the merge', async () => {
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate', 'banned')

    expect((await repo.preview(LOSER, WINNER))?.blockedByBan).toBe(true)
  })

  it('reports an unlifted ban, however the state column reads', async () => {
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate')
    await db.execute(sql`insert into bans (user_id, created_at) values (${LOSER}, now())`)

    expect((await repo.preview(LOSER, WINNER))?.blockedByBan).toBe(true)
  })

  it('is null when either account does not exist', async () => {
    await seedPair()
    expect(await repo.preview(LOSER, 9_999)).toBeNull()
  })
})

describe('mergePostsChunk', () => {
  it('moves a bounded batch and reports what is left', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug)
      values (1, 1, ${LOSER}, 'duplicate', 'T', 't')
    `)
    for (let id = 1; id <= 5; id += 1) {
      await db.execute(sql`
        insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                           message)
        values (${id}, 1, 1, ${LOSER}, 'duplicate', 'x')
      `)
    }

    const first = await repo.mergePostsChunk(LOSER, WINNER, 2)
    expect(first).toEqual({ moved: 2, remaining: 3 })

    let remaining = first.remaining
    while (remaining > 0) {
      remaining = (await repo.mergePostsChunk(LOSER, WINNER, 2)).remaining
    }

    expect(
      await count(sql`select count(*)::int as n from posts where author_user_id = ${WINNER}`),
    ).toBe(5)
  })

  it('refuses to merge an account into itself', async () => {
    await seedPair()
    await expect(repo.mergePostsChunk(LOSER, LOSER, 10)).rejects.toThrow(/two different/)
  })
})

describe('finish', () => {
  it('refuses while posts remain, so the chunked stage cannot be skipped', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug)
      values (1, 1, ${LOSER}, 'duplicate', 'T', 't')
    `)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username, message)
      values (1, 1, 1, ${LOSER}, 'duplicate', 'x')
    `)

    await expect(repo.finish(LOSER, WINNER)).rejects.toThrow(/still posts to move/)
  })

  it('refuses when either account is banned', async () => {
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate', 'banned')

    await expect(repo.finish(LOSER, WINNER)).rejects.toThrow(/banned/)
  })

  it('refuses when either account carries an unlifted ban', async () => {
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate')
    await db.execute(sql`insert into bans (user_id, created_at) values (${LOSER}, now())`)

    await expect(repo.finish(LOSER, WINNER)).rejects.toThrow(/banned/)
  })

  it('destroys the loser’s sessions rather than moving them', async () => {
    await seedPair()
    await db.execute(sql`
      insert into sessions (id, user_id, token_hash, expires_at)
      values (11, ${LOSER}, 'h1', now() + interval '1 day'),
             (12, ${WINNER}, 'h2', now() + interval '1 day')
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select id, user_id from sessions order by id`),
    ) as Array<{ id: number; user_id: number }>
    expect(rows).toEqual([{ id: 12, user_id: WINNER }])
  })

  it('discards the loser’s identities and passkeys without changing the winner’s', async () => {
    await seedPair()
    await db.execute(sql`
      insert into user_identities (user_id, provider, subject)
      values (${LOSER}, 'oidc', 'loser'), (${WINNER}, 'oidc', 'winner')
    `)
    await db.execute(sql`
      insert into passkeys (user_id, credential_id, public_key, label)
      values (${LOSER}, 'loser-key', 'loser-public', 'Loser'),
             (${WINNER}, 'winner-key', 'winner-public', 'Winner')
    `)
    await db.execute(sql`
      insert into feed_tokens (user_id, lookup, secret_hash)
      values (${LOSER}, 'loserlkp', 'loser-hash'), (${WINNER}, 'winnerlk', 'winner-hash')
    `)

    await repo.finish(LOSER, WINNER)

    const identities = resultRows(
      await db.execute(sql`select user_id, subject from user_identities order by id`),
    ) as Array<{ user_id: number; subject: string }>
    const keys = resultRows(
      await db.execute(sql`select user_id, credential_id from passkeys order by id`),
    ) as Array<{ user_id: number; credential_id: string }>
    const feedTokens = resultRows(
      await db.execute(sql`select user_id, lookup from feed_tokens order by id`),
    ) as Array<{ user_id: number; lookup: string }>
    expect(identities).toEqual([{ user_id: WINNER, subject: 'winner' }])
    expect(keys).toEqual([{ user_id: WINNER, credential_id: 'winner-key' }])
    expect(feedTokens).toEqual([{ user_id: WINNER, lookup: 'winnerlk' }])
  })

  it('keeps the winner’s row when both hold one under a uniqueness rule', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug)
      values (1, 1, ${WINNER}, 'keeper', 'T', 't'), (2, 1, ${WINNER}, 'keeper', 'U', 'u')
    `)
    await db.execute(sql`
      insert into thread_subscriptions (user_id, thread_id, mode)
      values (${WINNER}, 1, 'instant'), (${LOSER}, 1, 'daily'), (${LOSER}, 2, 'instant')
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select thread_id, mode from thread_subscriptions order by thread_id`),
    ) as Array<{ thread_id: number; mode: string }>
    expect(rows).toEqual([
      { thread_id: 1, mode: 'instant' },
      { thread_id: 2, mode: 'instant' },
    ])
  })

  it('moves secondary group membership, dropping a group both were in', async () => {
    await seedPair()
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id)
      values (${WINNER}, 3), (${LOSER}, 3), (${LOSER}, 4)
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(
        sql`select group_id from user_group_memberships where user_id = ${WINNER} order by 1`,
      ),
    ) as Array<{ group_id: number }>
    expect(rows.map((row) => row.group_id)).toEqual([3, 4])
  })

  it('deletes a rating that would become a self-rating', async () => {
    await seedPair()
    await db.execute(sql`
      insert into reputation (id, user_id, given_by_user_id, points)
      values (1, ${WINNER}, ${LOSER}, 1), (2, ${LOSER}, ${WINNER}, 1)
    `)

    await repo.finish(LOSER, WINNER)

    expect(await count(sql`select count(*)::int as n from reputation`)).toBe(0)
  })

  it('deletes a relation that would become a self-relation', async () => {
    await seedPair()
    await db.execute(sql`
      insert into user_relations (user_id, other_user_id, kind)
      values (${WINNER}, ${LOSER}, 'ignore')
    `)

    await repo.finish(LOSER, WINNER)

    expect(await count(sql`select count(*)::int as n from user_relations`)).toBe(0)
  })

  it('keeps one relation when both accounts had the same one', async () => {
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate')
    await seedUser(3, 'third')
    await db.execute(sql`
      insert into user_relations (user_id, other_user_id, kind)
      values (${WINNER}, 3, 'friend'), (${LOSER}, 3, 'ignore')
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select user_id, other_user_id, kind from user_relations`),
    ) as Array<Record<string, unknown>>
    expect(rows).toEqual([{ user_id: WINNER, other_user_id: 3, kind: 'friend' }])
  })

  it('moves the denormalised last-post columns, which have no foreign key', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                           last_post_user_id, last_post_username)
      values (1, 1, ${WINNER}, 'keeper', 'T', 't', ${LOSER}, 'duplicate')
    `)
    await db.execute(sql`
      update forums set last_post_user_id = ${LOSER}, last_post_username = 'duplicate'
       where id = 1
    `)

    await repo.finish(LOSER, WINNER)

    expect(
      await count(sql`select count(*)::int as n from threads where last_post_user_id = ${WINNER}`),
    ).toBe(1)
    expect(
      await count(sql`select count(*)::int as n from forums where last_post_user_id = ${WINNER}`),
    ).toBe(1)

    expect(
      await count(sql`select count(*)::int as n from threads where last_post_username = 'keeper'`),
    ).toBe(1)
    expect(
      await count(sql`select count(*)::int as n from forums where last_post_username = 'keeper'`),
    ).toBe(1)
  })

  it('rewrites the author name on posts the winner now owns', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug)
      values (1, 1, ${LOSER}, 'duplicate', 'T', 't')
    `)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username, message)
      values (1, 1, 1, ${LOSER}, 'duplicate', 'x')
    `)

    let remaining = 1
    while (remaining > 0) {
      remaining = (await repo.mergePostsChunk(LOSER, WINNER, 10)).remaining
    }
    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select author_username from posts where id = 1`),
    ) as Array<{ author_username: string }>
    expect(rows[0]?.author_username).toBe('keeper')
  })

  it('rewrites every column the rename path rewrites, so the two cannot drift', async () => {
    await seedPair()
    await db.execute(sql`
      insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                           last_post_user_id, last_post_username)
      values (1, 1, ${WINNER}, 'stale', 'T', 't', ${WINNER}, 'stale')
    `)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username, message)
      values (1, 1, 1, ${WINNER}, 'stale', 'x')
    `)
    await db.execute(sql`
      insert into private_messages (id, author_user_id, author_username, subject, message)
      values (1, ${WINNER}, 'stale', 'Re', 'body')
    `)
    await db.execute(sql`
      insert into announcements (id, forum_id, title, message, author_user_id, author_username)
      values (1, 1, 'Rules', 'body', ${WINNER}, 'stale')
    `)
    await db.execute(sql`
      update forums set last_post_user_id = ${WINNER}, last_post_username = 'stale' where id = 1
    `)
    await db.execute(sql`
      update board_stats set newest_user_id = ${WINNER}, newest_username = 'stale'
    `)

    await repo.finish(LOSER, WINNER)

    for (const entry of DENORMALISED_USERNAME_COLUMNS) {
      const rows = resultRows(
        await db.execute(sql`
          select ${sql.raw(entry.column)} as name
            from ${sql.raw(entry.table)}
           where ${sql.raw(entry.idColumn)} = ${WINNER}
        `),
      ) as Array<{ name: string | null }>
      expect(
        rows.map((row) => String(row.name)),
        `${entry.table}.${entry.column}`,
      ).toEqual(['keeper'])
    }
  })

  it('adds the post counters, and rebuilds reputation from the rows that survive', async () => {
    await seedPair()
    await seedUser(3, 'third')
    await db.execute(sql`
      update users set post_count = 10, thread_count = 2, reputation = 5 where id = ${WINNER}
    `)
    await db.execute(sql`
      update users set post_count = 3, thread_count = 1, reputation = 2 where id = ${LOSER}
    `)
    await db.execute(sql`
      insert into reputation (id, user_id, given_by_user_id, points)
      values (1, ${WINNER}, 3, 1), (2, ${LOSER}, 3, 1)
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select id, post_count, thread_count, reputation
                             from users where id in (${WINNER}, ${LOSER}) order by id`),
    ) as Array<Record<string, number>>
    expect(rows[0]).toMatchObject({ post_count: 13, thread_count: 3, reputation: 1 })
    expect(rows[1]).toMatchObject({ post_count: 0, thread_count: 0, reputation: 0 })
    expect(await count(sql`select count(*)::int as n from reputation`)).toBe(1)
  })

  it('corrects a third party whose rating the dedupe removed', async () => {
    await seedPair()
    await seedUser(3, 'third')
    await db.execute(sql`
      insert into reputation (id, user_id, given_by_user_id, points)
      values (1, 3, ${WINNER}, 1), (2, 3, ${LOSER}, 1)
    `)
    await db.execute(sql`update users set reputation = 2 where id = 3`)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select reputation from users where id = 3`),
    ) as Array<{ reputation: number }>
    expect(Number(rows[0]?.reputation)).toBe(1)
    expect(await count(sql`select count(*)::int as n from reputation where user_id = 3`)).toBe(1)
  })

  it('rebuilds the winner’s warning points from the warnings that are still live', async () => {
    await seedPair()
    await db.execute(sql`
      insert into warnings (id, user_id, title, points, created_at, expires_at, revoked_at)
      values (1, ${WINNER}, 'Spam', 2, now(), null, null),
             (2, ${WINNER}, 'Old', 6, now(), null, now()),
             (3, ${LOSER}, 'Flame', 3, now(), now() + interval '30 days', null),
             (4, ${LOSER}, 'Lapsed', 4, now(), now() - interval '1 day', null)
    `)
    await db.execute(sql`update users set warning_points = 9 where id in (${WINNER}, ${LOSER})`)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select id, warning_points from users
                            where id in (${WINNER}, ${LOSER}) order by id`),
    ) as Array<{ id: number; warning_points: number }>
    expect(rows.map((row) => Number(row.warning_points))).toEqual([5, 0])
    expect(
      await count(sql`select count(*)::int as n from warnings where user_id = ${WINNER}`),
    ).toBe(4)
  })

  it('soft-deletes the losing account rather than dropping it', async () => {
    await seedPair()
    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select deleted_at from users where id = ${LOSER}`),
    ) as Array<{ deleted_at: unknown }>
    expect(rows[0]?.deleted_at).not.toBeNull()
  })

  it('bumps the permission version', async () => {
    await seedPair()
    const before = resultRows(
      await db.execute(sql`select version from cache_versions where key = 'permissions'`),
    ) as Array<{ version: number }>

    await repo.finish(LOSER, WINNER)

    const after = resultRows(
      await db.execute(sql`select version from cache_versions where key = 'permissions'`),
    ) as Array<{ version: number }>
    expect(Number(after[0]?.version)).toBe(Number(before[0]?.version) + 1)
  })

  it('refuses a member that does not exist, and changes nothing', async () => {
    await seedPair()
    await expect(repo.finish(9_999, WINNER)).rejects.toThrow(/No such member/)
    expect(await count(sql`select count(*)::int as n from users where deleted_at is null`)).toBe(2)
  })

  it('refuses to merge an account into itself', async () => {
    await seedPair()
    await expect(repo.finish(LOSER, LOSER)).rejects.toThrow(/two different/)
  })
})
