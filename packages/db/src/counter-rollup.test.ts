import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'

import type { Database } from './client'
import { applyCreatedContentCounters, rollUpAncestorCounters } from './content-counters'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, posts, threads, users } from './schema'

let harness: TestDb
let db: Database

const AT = new Date('2026-07-30T12:00:00Z')

const CATEGORY = 1
const FORUM = 4
const SUBFORUM = 9
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
  await db.execute(sql`delete from forums`)
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

  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'Forum', slug: 'forum', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: SUBFORUM, title: 'Sub', slug: 'sub', path: '1.4.9', depth: 2, parentId: FORUM },
    { id: DEEP, title: 'Deep', slug: 'deep', path: '1.4.9.12', depth: 3, parentId: SUBFORUM },
    { id: DECOY, title: 'Decoy', slug: 'decoy', path: '1.40', depth: 1, parentId: CATEGORY },
    { id: DECOY_CHILD, title: 'Decoy sub', slug: 'decoy-sub', path: '1.40.41', depth: 2, parentId: DECOY },
  ])

  await db.insert(threads).values([
    {
      id: 20,
      forumId: DEEP,
      title: 'Hello',
      slug: 'hello',
      authorUserId: 1,
      authorUsername: 'ada',
    },
    {
      id: 22,
      forumId: DECOY_CHILD,
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
    forumId: DEEP,
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
      threadCount: forums.threadCount,
      postCount: forums.postCount,
      lastPostId: forums.lastPostId,
      lastPostThreadTitle: forums.lastPostThreadTitle,
    })
    .from(forums)
    .where(eq(forums.id, id))
  return row
}

describe('rollUpAncestorCounters', () => {
  it('adds the post to every ancestor and to no sibling subtree', async () => {
    await addPost(30, true)
    await db.transaction((tx) =>
      applyCreatedContentCounters(tx, {
        postId: 30,
        threadId: 20,
        forumId: DEEP,
        authorId: 1,
        authorUsername: 'ada',
        threadTitle: 'Hello',
        createdAt: AT,
        isNewThread: true,
      }),
    )

    expect(await rollUpAncestorCounters(db, 30)).toBe(true)

    for (const id of [CATEGORY, FORUM, SUBFORUM]) {
      expect(await counters(id)).toMatchObject({
        threadCount: 1,
        postCount: 1,
        lastPostId: 30,
        lastPostThreadTitle: 'Hello',
      })
    }

    expect(await counters(DEEP)).toMatchObject({ threadCount: 1, postCount: 1 })
    expect(await counters(DECOY)).toMatchObject({ threadCount: 0, postCount: 0 })
  })

  it('does not treat a text-prefix sibling as an ancestor', async () => {
    await db.insert(posts).values({
      id: 40,
      threadId: 22,
      forumId: DECOY_CHILD,
      authorUserId: 1,
      authorUsername: 'ada',
      message: 'Elsewhere',
      isFirstPost: true,
      createdAt: AT,
    })

    expect(await rollUpAncestorCounters(db, 40)).toBe(true)

    expect(await counters(DECOY)).toMatchObject({ threadCount: 1, postCount: 1 })
    expect(await counters(CATEGORY)).toMatchObject({ threadCount: 1, postCount: 1 })
    expect(await counters(FORUM)).toMatchObject({ threadCount: 0, postCount: 0 })
    expect(await counters(SUBFORUM)).toMatchObject({ threadCount: 0, postCount: 0 })
  })

  it('is a no-op when the same event is delivered again', async () => {
    await addPost(30, true)
    await rollUpAncestorCounters(db, 30)

    expect(await rollUpAncestorCounters(db, 30)).toBe(false)

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
    await addPost(32, false, AT)
    await rollUpAncestorCounters(db, 32)

    expect(await counters(CATEGORY)).toMatchObject({ postCount: 2, lastPostId: 31 })
  })
})
