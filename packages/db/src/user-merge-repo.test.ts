/**
 * F67's merge, against real Postgres.
 *
 * The first test in this file is the most valuable one, and it is not about
 * behaviour at all: it holds the merge map against `information_schema`. The
 * dangerous failure of an account merge is a **column nobody remembered** —
 * rows left pointing at an account that has been merged away, which raises no
 * error and surfaces months later as a post with no author. A test that
 * enumerates the schema catches the next migration that adds one; a test that
 * checks a few tables by hand does not.
 *
 * After that, the four things a naive `update … set user_id = winner` gets
 * wrong: credentials must be destroyed rather than moved, duplicates under a
 * uniqueness rule must be dropped rather than collided, the two-ended tables
 * can produce rows the board cannot otherwise create, and the denormalised
 * display columns have no foreign key to remind anybody they exist.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresUserMergeRepository } from './user-merge-repo'
import { mergeMapColumns } from './user-merge-map'
import { resultRows } from './result-rows'

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
  await db.execute(sql`delete from user_relations`)
  await db.execute(sql`delete from thread_subscriptions`)
  await db.execute(sql`delete from forum_subscriptions`)
  await db.execute(sql`delete from user_group_memberships`)
  await db.execute(sql`delete from sessions`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`delete from forums`)
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
    /*
     * The guard this feature actually rests on. A migration that adds a
     * user-shaped column fails here until somebody decides whether a merge
     * reassigns it, dedupes it, discards it, renames it, or handles it
     * bespoke — which is a decision, not an oversight. Kills the whole class
     * of "we forgot `x.user_id`" bugs rather than one instance of it.
     *
     * It has already earned its place: the first version of the map covered
     * only the id columns, and this test failed on the five denormalised
     * *username* columns — `posts.author_username` and its siblings — which
     * carry a name rather than an id and would have gone on displaying the
     * merged-away account forever.
     */
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

    expect(await count(sql`select count(*)::int as n from posts where author_user_id = ${WINNER}`))
      .toBe(5)
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
    /*
     * `bans.user_id` is reassigned like any other column, so merging a banned
     * account would carry its active ban onto the winner and lock out an
     * account nobody decided to ban. Kills the mutant that drops the check.
     */
    await seedUser(WINNER, 'keeper')
    await seedUser(LOSER, 'duplicate', 'banned')

    await expect(repo.finish(LOSER, WINNER)).rejects.toThrow(/banned/)
  })

  it('destroys the loser’s sessions rather than moving them', async () => {
    /*
     * The security claim. A merge is not an authentication event: moving a
     * session row would hand the winner's account to whoever holds that
     * cookie. Kills the mutant that treats `sessions` as an ordinary pointer.
     */
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

  it('keeps the winner’s row when both hold one under a uniqueness rule', async () => {
    /*
     * Both subscribed to the same thread. A straight UPDATE violates the
     * index; dropping the loser's keeps what the winner has been living with.
     */
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
      await db.execute(
        sql`select thread_id, mode from thread_subscriptions order by thread_id`,
      ),
    ) as Array<{ thread_id: number; mode: string }>
    /* The winner's own mode survived; the thread only they had came across. */
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
    /*
     * The two-ended case, and the reason `reputation` is not in the generic
     * dedupe list. The loser rated the winner; after a merge that row says the
     * winner rated themselves — a state the board refuses to create and no
     * reader expects. Kills the mutant that moves it like any other column.
     */
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
    /*
     * `threads.last_post_user_id` is a display cache. Nothing in the database
     * would complain if it were missed; the thread list would simply keep
     * showing the merged-away name forever.
     */
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

    expect(await count(
      sql`select count(*)::int as n from threads where last_post_user_id = ${WINNER}`,
    )).toBe(1)
    expect(await count(
      sql`select count(*)::int as n from forums where last_post_user_id = ${WINNER}`,
    )).toBe(1)

    /*
     * And the *names* beside them. Moving the id and leaving the name is the
     * failure this whole map exists to prevent: no error, no foreign key, and
     * a thread list that shows the merged-away account forever.
     */
    expect(await count(
      sql`select count(*)::int as n from threads where last_post_username = 'keeper'`,
    )).toBe(1)
    expect(await count(
      sql`select count(*)::int as n from forums where last_post_username = 'keeper'`,
    )).toBe(1)
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

  it('adds the counters and zeroes the loser’s', async () => {
    await seedPair()
    await db.execute(sql`
      update users set post_count = 10, thread_count = 2, reputation = 5 where id = ${WINNER}
    `)
    await db.execute(sql`
      update users set post_count = 3, thread_count = 1, reputation = 2 where id = ${LOSER}
    `)

    await repo.finish(LOSER, WINNER)

    const rows = resultRows(
      await db.execute(sql`select id, post_count, thread_count, reputation
                             from users order by id`),
    ) as Array<Record<string, number>>
    expect(rows[0]).toMatchObject({ post_count: 13, thread_count: 3, reputation: 7 })
    expect(rows[1]).toMatchObject({ post_count: 0, thread_count: 0, reputation: 0 })
  })

  it('soft-deletes the losing account rather than dropping it', async () => {
    /*
     * Its row is what any column this map missed still points at — a deleted
     * account renders as a former member where a dangling id renders as a
     * crash — and it is the only evidence afterwards that a merge happened.
     */
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
    expect(await count(sql`select count(*)::int as n from users where deleted_at is null`))
      .toBe(2)
  })

  it('refuses to merge an account into itself', async () => {
    await seedPair()
    await expect(repo.finish(LOSER, LOSER)).rejects.toThrow(/two different/)
  })
})
