import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT } from '@meith/core'

import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresImportSink } from './import-sink'
import { PostgresSearchRepository } from './search-repo'
import { resultRows } from './result-rows'

/*
 * `resultRows`, not a cast. `db.execute` returns `{ rows }` under PGlite and
 * something array-like under postgres-js, and casting to an array gets empty
 * results from the first — silently, so every assertion becomes "expected [x],
 * got []". This file's first draft cast, and so did `import-repo.ts`, which is
 * how a latent bug in the shipped code was found by writing these tests.
 */
const rowsOf = async <T>(query: Parameters<TestDb['db']['execute']>[0]): Promise<T[]> =>
  resultRows<T>(await harness.db.execute(query))

/**
 * F85 — the sink, against real Postgres.
 *
 * Every property worth testing here is about the **second** run. An import is
 * chunked and resumable, which means the recovery instruction is "run it again",
 * which means every write in this file happens more than once in ordinary use.
 * A sink that is only correct the first time is a sink that corrupts a board on
 * the day something goes wrong — which is the only day it is resumed.
 */

let harness: TestDb
let sink: PostgresImportSink

beforeAll(async () => {
  harness = await createTestDb()
  sink = new PostgresImportSink(harness.db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await harness.db.execute(sql`
    truncate posts, threads, forums, legacy_ids restart identity cascade
  `)
  await harness.db.execute(sql`delete from users where legacy_mybb_uid is not null`)
})

const user = (uid: number, name = `mybb${uid}`) => ({
  legacyId: uid,
  username: name,
  email: `${name}@old.test`,
  legacyPasswordHash: `mybb$salt${uid}$${'a'.repeat(32)}`,
  registeredAt: new Date('2014-03-02T00:00:00Z'),
  lastVisitAt: new Date('2019-06-01T00:00:00Z'),
  postCount: 12,
  legacyGroupId: 2,
})

const forum = (fid: number, parent: number | null = null) => ({
  legacyId: fid,
  type: 'forum' as const,
  title: `Forum ${fid}`,
  description: 'A forum',
  legacyParentId: parent,
  displayOrder: fid,
  linkUrl: null,
})

const thread = (tid: number, fid: number, uid: number) => ({
  legacyId: tid,
  legacyForumId: fid,
  title: `Thread ${tid}`,
  legacyAuthorId: uid,
  authorUsername: `mybb${uid}`,
  createdAt: new Date('2015-01-01T00:00:00Z'),
  lastPostAt: new Date('2015-02-01T00:00:00Z'),
  replyCount: 2,
  viewCount: 40,
  isSticky: false,
  isLocked: false,
  visibility: 'visible' as const,
})

const post = (pid: number, tid: number, fid: number, uid: number, at = '2015-01-01T00:00:00Z') => ({
  legacyId: pid,
  legacyThreadId: tid,
  legacyForumId: fid,
  legacyAuthorId: uid,
  authorUsername: `mybb${uid}`,
  body: `Post ${pid} body`,
  createdAt: new Date(at),
  editedAt: null,
  visibility: 'visible' as const,
})

async function seedTree(): Promise<void> {
  await sink.putUsers([user(1)])
  await sink.putForums([forum(3)])
  await sink.putThreads([thread(91, 3, 1)])
}

const count = async (table: string): Promise<number> => {
  const rows = await rowsOf<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(table)}`)
  return rows[0]!.n
}

describe('running it twice', () => {
  /*
   * The headline property. Not "it does not crash" — it must produce *the same
   * board*, with the same ids, because F86's redirects are a lookup into
   * `legacy_ids` and a second run that renumbered everything would break every
   * inbound link the import existed to preserve.
   */
  it('produces the same rows and the same ids', async () => {
    await seedTree()
    await sink.putPosts([post(4102, 91, 3, 1)])

    const before = await rowsOf<unknown>(sql`select id, legacy_mybb_pid from posts order by id`)

    await seedTree()
    const second = await sink.putPosts([post(4102, 91, 3, 1)])

    const after = await rowsOf<unknown>(sql`select id, legacy_mybb_pid from posts order by id`)

    expect(after).toEqual(before)
    expect(await count('posts')).toBe(1)
    expect(second).toMatchObject({ inserted: 0, updated: 1 })
  })

  /*
   * `do update`, not `do nothing`. Re-running after fixing something on the
   * source board has to carry the fix across, or "run it again" is useless as
   * advice — which is the only advice a resumable importer gives.
   */
  it('carries an edit made on the source board across', async () => {
    await seedTree()
    await sink.putPosts([post(4102, 91, 3, 1)])
    await sink.putPosts([{ ...post(4102, 91, 3, 1), body: 'corrected on the old board' }])

    const rows = await rowsOf<{ message: string }>(sql`select message from posts where legacy_mybb_pid = 4102`)

    expect(rows[0]!.message).toBe('corrected on the old board')
  })

  it('reports inserted and updated separately, so a re-run is legible', async () => {
    await sink.putUsers([user(1)])
    const first = await sink.putUsers([user(1), user(2)])

    expect(first).toMatchObject({ inserted: 1, updated: 1 })
  })
})

describe('rows whose parent is missing', () => {
  /*
   * Skipped with a reason, never invented. A post attached to a placeholder
   * thread is content on the board in a place its author did not choose, and an
   * operator reading "thread 9912 not imported" can go and find out why.
   */
  it('skips a post whose thread was never imported', async () => {
    await seedTree()
    const result = await sink.putPosts([post(4102, 9912, 3, 1)])

    expect(result.inserted).toBe(0)
    expect(result.skipped).toEqual([{ legacyId: 4102, reason: 'thread 9912 not imported' }])
    expect(await count('posts')).toBe(0)
  })

  it('skips a thread whose forum was never imported', async () => {
    await sink.putUsers([user(1)])
    const result = await sink.putThreads([thread(91, 77, 1)])

    expect(result.skipped).toEqual([{ legacyId: 91, reason: 'forum 77 not imported' }])
  })

  /*
   * A child forum arriving before its parent is skipped rather than reparented
   * to the root — and picked up on the next pass. MyBB's fid order usually puts
   * parents first, and "usually" is not a thing to build a tree on.
   */
  it('skips a child forum until its parent exists, then places it', async () => {
    const first = await sink.putForums([forum(9, 3)])
    expect(first.skipped).toEqual([{ legacyId: 9, reason: 'parent forum 3 not imported yet' }])

    await sink.putForums([forum(3)])
    const second = await sink.putForums([forum(9, 3)])
    expect(second.inserted).toBe(1)

    const rows = await rowsOf<{ path: string; depth: number }>(sql`select path, depth from forums where legacy_mybb_fid = 9`)

    expect(rows[0]!.depth).toBe(1)
    expect(rows[0]!.path).toMatch(/^\d+\.\d+$/)
  })

  /*
   * A missing *author* is different, and deliberately not fatal: MyBB sets
   * `uid` to 0 for a deleted member but keeps the username on the row, which is
   * exactly what a nullable author id beside a non-null username is for.
   */
  it('keeps a post whose author was deleted on the old board', async () => {
    await sink.putUsers([user(1)])
    await sink.putForums([forum(3)])
    await sink.putThreads([thread(91, 3, 1)])

    const result = await sink.putPosts([
      { ...post(4102, 91, 3, 0), authorUsername: 'GhostMember' },
    ])

    expect(result.inserted).toBe(1)
    const rows = await rowsOf<{ author_user_id: number | null; author_username: string }>(sql`select author_user_id, author_username from posts where legacy_mybb_pid = 4102`)

    expect(rows[0]).toEqual({ author_user_id: null, author_username: 'GhostMember' })
  })
})

describe('users', () => {
  /*
   * A username on this board belongs to somebody, and it may not be the same
   * person. Renaming them to `wren_2` invents an identity nobody agreed to.
   */
  it('skips a username that already belongs to somebody else', async () => {
    await harness.db.execute(sql`
      insert into users (username, username_lower, email, email_lower, primary_group_id, display_group_id)
      values ('wren', 'wren', 'wren@new.test', 'wren@new.test', 2, 2)
    `)

    const result = await sink.putUsers([user(5, 'wren')])
    expect(result.inserted).toBe(0)
    expect(result.skipped[0]!.reason).toMatch(/username "wren" already taken/)
  })

  it('skips a duplicate e-mail address', async () => {
    await sink.putUsers([user(1, 'first')])
    const result = await sink.putUsers([{ ...user(2, 'second'), email: 'first@old.test' }])

    expect(result.skipped[0]!.reason).toMatch(/e-mail address already registered/)
  })

  /* The collision check must not fire on the row's own previous import. */
  it('does not treat its own earlier import as a collision', async () => {
    await sink.putUsers([user(1)])
    const again = await sink.putUsers([user(1)])

    expect(again.skipped).toEqual([])
    expect(again.updated).toBe(1)
  })

  /*
   * MyBB's group ids are not this board's. Filing an imported member into a
   * group by numeric coincidence would be a privilege grant made by accident.
   */
  it('files every imported member into registered, whatever MyBB said', async () => {
    await sink.putUsers([{ ...user(1), legacyGroupId: 4 }])

    const rows = await rowsOf<{ key: string }>(sql`
      select g.key from users u join usergroups g on g.id = u.primary_group_id
      where u.legacy_mybb_uid = 1
    `)

    expect(rows[0]!.key).toBe('registered')
  })

  it('carries the MyBB hash across so F86 can upgrade it on next sign-in', async () => {
    await sink.putUsers([user(1)])

    const rows = await rowsOf<{ password_hash: string; password_algo: string }>(sql`select password_hash, password_algo from users where legacy_mybb_uid = 1`)

    expect(rows[0]!.password_hash).toMatch(/^mybb\$/)
    expect(rows[0]!.password_algo).toBe('mybb')
  })
})

describe('the first post', () => {
  /*
   * By date, not by legacy id. A thread whose opening post was deleted has a
   * lowest `pid` that is not its first post, and the board shows the first
   * post's body wherever it shows an excerpt — so getting this wrong puts the
   * wrong text under the thread title everywhere at once.
   */
  it('marks the earliest post, not the lowest legacy id', async () => {
    await seedTree()

    await sink.putPosts([
      post(5000, 91, 3, 1, '2015-01-01T00:00:00Z'),
      post(4000, 91, 3, 1, '2015-06-01T00:00:00Z'),
    ])

    const rows = await rowsOf<{ legacy_mybb_pid: number; is_first_post: boolean }>(sql`
      select legacy_mybb_pid, is_first_post from posts where thread_id is not null
      order by legacy_mybb_pid
    `)

    expect(rows).toEqual([
      { legacy_mybb_pid: 4000, is_first_post: false },
      { legacy_mybb_pid: 5000, is_first_post: true },
    ])
  })

  /* And it re-decides when an earlier post arrives in a later chunk. */
  it('moves the mark when an earlier post arrives in a later chunk', async () => {
    await seedTree()
    await sink.putPosts([post(5000, 91, 3, 1, '2015-06-01T00:00:00Z')])
    await sink.putPosts([post(6000, 91, 3, 1, '2015-01-01T00:00:00Z')])

    const rows = await rowsOf<{ legacy_mybb_pid: number }>(sql`
      select legacy_mybb_pid from posts where is_first_post = true
    `)

    expect(rows).toEqual([{ legacy_mybb_pid: 6000 }])
  })

  /*
   * The body is stored as BBCode with no rendered HTML. Baking HTML in at
   * import time would freeze two million posts at whatever the renderer did on
   * migration day, and F87's render version exists precisely so it does not.
   */
  it('stores the body unrendered', async () => {
    await seedTree()
    await sink.putPosts([{ ...post(4102, 91, 3, 1), body: '[b]bold[/b]' }])

    const rows = await rowsOf<{ message: string; message_html: string | null }>(sql`select message, message_html from posts where legacy_mybb_pid = 4102`)

    expect(rows[0]).toEqual({ message: '[b]bold[/b]', message_html: null })
  })
})

/**
 * F72. An import writes no search document, and that is the right call for a
 * bulk insert of two million rows — but it is also how a board ends up with a
 * search box that works, runs its query, and answers every term with nothing.
 *
 * So the property worth pinning is not "the import indexes"; it is that the
 * board **knows** it has work outstanding and can finish it without anybody
 * being told to go and find a command.
 */
describe('the search index after an import', () => {
  const searchFor = async (terms: string) =>
    (
      await new PostgresSearchRepository(harness.db).search(
        { terms, grouping: 'posts', sort: 'relevance', limit: 10, after: null },
        { forumIds: [1], viewerUserId: null, content: PUBLIC_CONTENT },
      )
    ).hits.length

  it('leaves imported posts outstanding rather than looking finished', async () => {
    /*
     * The row arrives with no vector and the column's default version, so the
     * *version* alone would call it current. It is the missing vector that
     * makes it outstanding, and this is the assertion that says so — kills the
     * mutant that checks the version and not the vector, which would leave an
     * entire imported board reported as indexed and searchable for nothing.
     */
    await seedTree()
    await sink.putPosts([post(4200, 91, 3, 1)])

    expect(await new PostgresSearchRepository(harness.db).indexProgress()).toEqual({
      indexed: 0,
      pending: 1,
    })
    expect(await searchFor('body')).toBe(0)
  })

  it('becomes searchable once the backfill has run, by title as well as body', async () => {
    /*
     * The whole of the third fix, at the layer that motivates it. The title
     * matters twice over here: an imported post carries no `subject` of its
     * own, so the thread's title is the only weight-A field it will ever have,
     * and MyBB boards are searched by thread title more than by anything else.
     */
    await seedTree()
    await sink.putPosts([post(4201, 91, 3, 1)])

    const search = new PostgresSearchRepository(harness.db)
    const run = await search.reindexChunk(0, 100)

    expect(run.indexed).toBe(1)
    expect(await search.indexProgress()).toEqual({ indexed: 1, pending: 0 })
    expect(await searchFor('body')).toBe(1)
    /* `Thread 91` is the imported thread's title; no post body contains it. */
    expect(await searchFor('Thread 91')).toBe(1)
  })
})

describe('the legacy id map', () => {
  /*
   * The map is what F86's redirects read. An import that wrote the rows and not
   * the map would be a one-way door: the content arrives and every inbound link
   * a board accumulated over fifteen years 404s.
   */
  it('records a mapping for every kind', async () => {
    await seedTree()
    await sink.putPosts([post(4102, 91, 3, 1)])

    const rows = await rowsOf<{ kind: string; legacy_id: number }>(sql`select kind, legacy_id from legacy_ids order by kind`)

    expect(rows).toEqual([
      { kind: 'forum', legacy_id: 3 },
      { kind: 'post', legacy_id: 4102 },
      { kind: 'thread', legacy_id: 91 },
      { kind: 'user', legacy_id: 1 },
    ])
  })

  it('points the map at the current row after a re-run', async () => {
    await seedTree()
    const rows = await rowsOf<{ new_id: number }>(sql`select new_id from legacy_ids where kind = 'thread' and legacy_id = 91`)

    await seedTree()
    const again = await rowsOf<{ new_id: number }>(sql`select new_id from legacy_ids where kind = 'thread' and legacy_id = 91`)

    expect(again).toEqual(rows)
  })
})

describe('an empty page', () => {
  /* The runner calls with an empty page at the end of a table. */
  it.each(['putUsers', 'putForums', 'putThreads', 'putPosts'] as const)(
    '%s costs nothing and reports nothing',
    async (method) => {
      expect(await sink[method]([])).toEqual({ inserted: 0, updated: 0, skipped: [] })
    },
  )
})
