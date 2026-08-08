/**
 * F38 — ancestor roll-up, against real Postgres.
 *
 * The interesting cases are all SQL semantics: a prefix match that must not
 * catch a sibling, an insert that must both claim and filter, and a delta that
 * must survive being delivered twice. None of them are visible to a mock.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { applyCreatedContentCounters, rollUpAncestorCounters } from './content-counters'
import { createTestDb, type TestDb } from './pglite.fixture'
import { communities, posts, threads, users } from './schema'

let harness: TestDb
let db: Database

const AT = new Date('2026-07-30T12:00:00Z')

/*
 * Two things this tree is shaped to catch:
 *   - `1.4` must not collect `1.40`'s posts (D22's prefix trap, which the
 *     roll-up's `LIKE path || '.%'` is the whole defence against);
 *   - a four-level chain, so "walks all the way up" is distinguishable from
 *     "updates the parent".
 */
const CATEGORY = 1
const COMMUNITY = 4
const SUBCOMMUNITY = 9
const DEEP = 12
const DECOY = 40
const DECOY_CHILD = 41

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values({
    id: 1,
    username: 'ada',
    usernameLower: 'ada',
    email: 'ada@example.test',
    emailLower: 'ada@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })

  await db.insert(communities).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: COMMUNITY, title: 'Community', slug: 'community', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: SUBCOMMUNITY, title: 'Sub', slug: 'sub', path: '1.4.9', depth: 2, parentId: COMMUNITY },
    { id: DEEP, title: 'Deep', slug: 'deep', path: '1.4.9.12', depth: 3, parentId: SUBCOMMUNITY },
    // Sibling of `1.4` whose path shares its text prefix, plus a child of it —
    // the child is what makes the trap reachable: `1.40.41` starts with the
    // text `1.4`, so a prefix match without the separator makes community 4 an
    // ancestor of a community it has nothing to do with.
    { id: DECOY, title: 'Decoy', slug: 'decoy', path: '1.40', depth: 1, parentId: CATEGORY },
    { id: DECOY_CHILD, title: 'Decoy sub', slug: 'decoy-sub', path: '1.40.41', depth: 2, parentId: DECOY },
  ])

  await db.insert(threads).values([
    {
      id: 20,
      communityId: DEEP,
      title: 'Hello',
      slug: 'hello',
      authorUserId: 1,
      authorUsername: 'ada',
    },
    {
      id: 22,
      communityId: DECOY_CHILD,
      title: 'Elsewhere',
      slug: 'elsewhere',
      authorUserId: 1,
      authorUsername: 'ada',
    },
  ])
})

async function addPost(id: number, isFirstPost: boolean, at = AT): Promise<void> {
  await db.insert(posts).values({
    id,
    threadId: 20,
    communityId: DEEP,
    authorUserId: 1,
    authorUsername: 'ada',
    message: 'Hello',
    isFirstPost,
    createdAt: at,
  })
}

async function counters(id: number) {
  const [row] = await db
    .select({
      threadCount: communities.threadCount,
      postCount: communities.postCount,
      lastPostId: communities.lastPostId,
      lastPostThreadTitle: communities.lastPostThreadTitle,
    })
    .from(communities)
    .where(eq(communities.id, id))
  return row
}

describe('rollUpAncestorCounters', () => {
  it('adds the post to every ancestor and to no sibling subtree', async () => {
    await addPost(30, true)
    await db.transaction((tx) =>
      applyCreatedContentCounters(tx, {
        postId: 30,
        threadId: 20,
        communityId: DEEP,
        authorId: 1,
        authorUsername: 'ada',
        threadTitle: 'Hello',
        createdAt: AT,
        isNewThread: true,
      }),
    )

    expect(await rollUpAncestorCounters(db, 30)).toBe(true)

    for (const id of [CATEGORY, COMMUNITY, SUBCOMMUNITY]) {
      expect(await counters(id)).toMatchObject({
        threadCount: 1,
        postCount: 1,
        lastPostId: 30,
        lastPostThreadTitle: 'Hello',
      })
    }

    // The posting community was counted synchronously and must not be counted twice.
    expect(await counters(DEEP)).toMatchObject({ threadCount: 1, postCount: 1 })
    // `1.40` shares a text prefix with `1.4` and is not an ancestor of anything.
    expect(await counters(DECOY)).toMatchObject({ threadCount: 0, postCount: 0 })
  })

  it('does not treat a text-prefix sibling as an ancestor', async () => {
    // `1.40.41` starts with the characters of `1.4`. A prefix match missing the
    // separator would credit community 4 with a post from a subtree it does not
    // contain — the same trap D22 records for the tree read.
    await db.insert(posts).values({
      id: 40,
      threadId: 22,
      communityId: DECOY_CHILD,
      authorUserId: 1,
      authorUsername: 'ada',
      message: 'Elsewhere',
      isFirstPost: true,
      createdAt: AT,
    })

    expect(await rollUpAncestorCounters(db, 40)).toBe(true)

    expect(await counters(DECOY)).toMatchObject({ threadCount: 1, postCount: 1 })
    expect(await counters(CATEGORY)).toMatchObject({ threadCount: 1, postCount: 1 })
    expect(await counters(COMMUNITY)).toMatchObject({ threadCount: 0, postCount: 0 })
    expect(await counters(SUBCOMMUNITY)).toMatchObject({ threadCount: 0, postCount: 0 })
  })

  it('is a no-op when the same event is delivered again', async () => {
    await addPost(30, true)
    await rollUpAncestorCounters(db, 30)

    expect(await rollUpAncestorCounters(db, 30)).toBe(false)

    // The whole reason the ledger exists: at-least-once delivery of a delta.
    expect(await counters(CATEGORY)).toMatchObject({ postCount: 1, threadCount: 1 })
  })

  it('ignores a post that is not visible', async () => {
    await addPost(30, true)
    await db.update(posts).set({ visibility: 'unapproved' }).where(eq(posts.id, 30))

    expect(await rollUpAncestorCounters(db, 30)).toBe(false)
    expect(await counters(CATEGORY)).toMatchObject({ postCount: 0 })
  })

  it('counts a reply without counting a second thread', async () => {
    await addPost(30, true)
    await rollUpAncestorCounters(db, 30)
    await addPost(31, false, new Date(AT.getTime() + 1000))
    await rollUpAncestorCounters(db, 31)

    expect(await counters(CATEGORY)).toMatchObject({
      threadCount: 1,
      postCount: 2,
      lastPostId: 31,
    })
  })

  it('does not move an ancestor last-post pointer backwards', async () => {
    await addPost(31, true, new Date(AT.getTime() + 60_000))
    await rollUpAncestorCounters(db, 31)
    // A post created earlier but rolled up later — an import, or a retried
    // relay running behind a live one.
    await addPost(32, false, AT)
    await rollUpAncestorCounters(db, 32)

    expect(await counters(CATEGORY)).toMatchObject({ postCount: 2, lastPostId: 31 })
  })
})
