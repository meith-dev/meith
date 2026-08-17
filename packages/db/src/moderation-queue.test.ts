import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ModerationQueue } from '@meith/moderation'

import type { Database } from './client'
import { PostgresModerationQueueRepository } from './moderation-queue'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresModerationQueueRepository

const CATEGORY = 1
const FORUM = 4
const OTHER = 5
const AUTHOR = 1
const MODERATOR = 2
const AT = new Date('2026-07-30T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresModerationQueueRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values([
    {
      id: AUTHOR,
      username: 'ada',
      usernameLower: 'ada',
      email: 'ada@example.test',
      emailLower: 'ada@example.test',
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    },
    {
      id: MODERATOR,
      username: 'mod',
      usernameLower: 'mod',
      email: 'mod@example.test',
      emailLower: 'mod@example.test',
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    },
  ])
  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: OTHER, title: 'Elsewhere', slug: 'elsewhere', path: '1.5', depth: 1, parentId: CATEGORY },
  ])
})

async function heldThread(id: number, forumId = FORUM, at = AT): Promise<number> {
  const postId = id * 10
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, first_post_id, last_post_at, created_at, updated_at)
    values (${id}, ${forumId}, ${'Held ' + String(id)}, ${'held-' + String(id)},
            ${AUTHOR}, 'ada', 'unapproved', ${postId}, ${at}, ${at}, ${at})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (${postId}, ${id}, ${forumId}, ${AUTHOR}, 'ada', ${'body ' + String(id)},
            'unapproved', true, ${at})
  `)
  return postId
}

async function heldReply(threadId: number, postId: number, at = AT): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, first_post_id, last_post_at, created_at, updated_at)
    values (${threadId}, ${FORUM}, ${'Open ' + String(threadId)},
            ${'open-' + String(threadId)}, ${AUTHOR}, 'ada', 'visible', null,
            ${at}, ${at}, ${at})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (${postId}, ${threadId}, ${FORUM}, ${AUTHOR}, 'ada', 'a reply',
            'unapproved', false, ${at})
  `)
}

async function forumCounts(id: number): Promise<{ posts: number; threads: number }> {
  const rows = resultRows(
    await db.execute(sql`select post_count, thread_count from forums where id = ${id}`),
  ) as Array<{ post_count: number; thread_count: number }>
  return { posts: Number(rows[0]!.post_count), threads: Number(rows[0]!.thread_count) }
}

async function stateOf(table: 'threads' | 'posts', id: number): Promise<string> {
  const rows = resultRows(
    table === 'threads'
      ? await db.execute(sql`select visibility from threads where id = ${id}`)
      : await db.execute(sql`select visibility from posts where id = ${id}`),
  ) as Array<{ visibility: string }>
  return rows[0]!.visibility
}

describe('the queue read', () => {
  it('returns held threads and held replies in one page, oldest first', async () => {
    await heldThread(100, FORUM, new Date('2026-07-30T09:00:00Z'))
    await heldReply(200, 2000, new Date('2026-07-30T10:00:00Z'))

    const page = await repo.list([FORUM], { limit: 10 })

    expect(page.items.map((i) => [i.kind, i.id])).toEqual([
      ['thread', 100],
      ['post', 2000],
    ])
    expect(page.items[0]).toMatchObject({
      forumTitle: 'General',
      threadTitle: 'Held 100',
      authorUsername: 'ada',
      excerpt: 'body 100',
    })
  })

  it('does not list a reply whose thread is itself waiting', async () => {
    await heldThread(100)
    await db.execute(sql`
      insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                         message, visibility, is_first_post, created_at)
      values (999, 100, ${FORUM}, ${AUTHOR}, 'ada', 'later', 'unapproved', false, ${AT})
    `)

    const page = await repo.list([FORUM], { limit: 10 })
    expect(page.items.map((i) => i.id)).toEqual([100])
  })

  it('does not list a reply whose thread has been deleted', async () => {
    await heldReply(200, 2000)
    await db.execute(sql`update threads set visibility = 'deleted' where id = 200`)

    expect((await repo.list([FORUM], { limit: 10 })).items).toEqual([])
    expect(await repo.countPending([FORUM])).toBe(0)
  })

  it('lists the reply again once its thread is restored', async () => {
    await heldReply(200, 2000)
    await db.execute(sql`update threads set visibility = 'deleted' where id = 200`)
    await db.execute(sql`update threads set visibility = 'visible' where id = 200`)

    expect((await repo.list([FORUM], { limit: 10 })).items.map((i) => i.id)).toEqual([2000])
  })

  it('shows only the forums it was asked about', async () => {
    await heldThread(100, FORUM)
    await heldThread(101, OTHER)

    expect((await repo.list([FORUM], { limit: 10 })).items.map((i) => i.id)).toEqual([100])
    expect(await repo.countPending([FORUM])).toBe(1)
    expect(await repo.countPending([FORUM, OTHER])).toBe(2)
  })

  it('pages with a cursor that survives items being handled above it', async () => {
    for (let n = 0; n < 4; n += 1) {
      await heldThread(100 + n, FORUM, new Date(AT.getTime() + n * 60_000))
    }

    const first = await repo.list([FORUM], { limit: 2 })
    expect(first.items.map((i) => i.id)).toEqual([100, 101])
    expect(first.nextCursor).toBeDefined()

    await db.execute(sql`update threads set visibility = 'visible' where id in (100, 101)`)

    const second = await repo.list([FORUM], { limit: 2, after: first.nextCursor! })
    expect(second.items.map((i) => i.id)).toEqual([102, 103])
    expect(second.nextCursor).toBeUndefined()
  })

  it('treats a corrupt cursor as no cursor rather than failing the page', async () => {
    await heldThread(100)
    const page = await repo.list([FORUM], { limit: 10, after: 'not-a-cursor' })
    expect(page.items.map((i) => i.id)).toEqual([100])
  })
})

describe('resolve', () => {
  it('returns the forum each selected item is really in', async () => {
    await heldThread(100, FORUM)
    await heldThread(101, OTHER)

    const resolved = await repo.resolve([
      { kind: 'thread', id: 100 },
      { kind: 'thread', id: 101 },
    ])

    expect(resolved).toEqual([
      { kind: 'thread', id: 100, forumId: FORUM },
      { kind: 'thread', id: 101, forumId: OTHER },
    ])
  })

  it('omits anything no longer pending', async () => {
    await heldThread(100)
    await db.execute(sql`update threads set visibility = 'visible' where id = 100`)

    expect(await repo.resolve([{ kind: 'thread', id: 100 }])).toEqual([])
  })

  it('omits a reply whose thread is gone, so a crafted selection cannot approve it', async () => {
    await heldReply(200, 2000)
    await db.execute(sql`update threads set visibility = 'deleted' where id = 200`)

    expect(await repo.resolve([{ kind: 'post', id: 2000 }])).toEqual([])
  })
})

describe('approving', () => {
  it('publishes the thread and its opening post together', async () => {
    const postId = await heldThread(100)

    expect(
      await repo.apply({
        decision: 'approve',
        threadIds: [100],
        postIds: [],
        actorUserId: MODERATOR,
        at: AT,
      }),
    ).toBe(1)

    expect(await stateOf('threads', 100)).toBe('visible')
    expect(await stateOf('posts', postId)).toBe('visible')
  })

  it('applies the counters creating it would have', async () => {
    await heldThread(100)
    expect(await forumCounts(FORUM)).toEqual({ posts: 0, threads: 0 })

    await repo.apply({
      decision: 'approve',
      threadIds: [100],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })

    expect(await forumCounts(FORUM)).toEqual({ posts: 1, threads: 1 })
    const author = resultRows(
      await db.execute(sql`select post_count, thread_count from users where id = ${AUTHOR}`),
    ) as Array<{ post_count: number; thread_count: number }>
    expect(Number(author[0]!.post_count)).toBe(1)
    expect(Number(author[0]!.thread_count)).toBe(1)
  })

  it('raises a reply"s post count without touching the thread count', async () => {
    await heldReply(200, 2000)
    const before = await forumCounts(FORUM)

    await repo.apply({
      decision: 'approve',
      threadIds: [],
      postIds: [2000],
      actorUserId: MODERATOR,
      at: AT,
    })

    expect(await forumCounts(FORUM)).toEqual({
      posts: before.posts + 1,
      threads: before.threads,
    })
  })

  it('is a no-op on an item somebody else already handled', async () => {
    await heldThread(100)
    await repo.apply({
      decision: 'approve',
      threadIds: [100],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })
    const after = await forumCounts(FORUM)

    expect(
      await repo.apply({
        decision: 'approve',
        threadIds: [100],
        postIds: [],
        actorUserId: MODERATOR,
        at: AT,
      }),
    ).toBe(0)
    expect(await forumCounts(FORUM)).toEqual(after)
  })
})

describe('rejecting', () => {
  it('takes the thread and its opening post down', async () => {
    const postId = await heldThread(100)

    await repo.apply({
      decision: 'reject',
      threadIds: [100],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })

    expect(await stateOf('threads', 100)).toBe('deleted')
    expect(await stateOf('posts', postId)).toBe('deleted')
  })

  it('moves no counter, because held content was never counted', async () => {
    await heldThread(100)
    await heldReply(200, 2000)
    const before = await forumCounts(FORUM)

    await repo.apply({
      decision: 'reject',
      threadIds: [100],
      postIds: [2000],
      actorUserId: MODERATOR,
      at: AT,
    })

    expect(await forumCounts(FORUM)).toEqual(before)
  })
})

describe('the audit trail', () => {
  it('records one entry per batch, naming the decision', async () => {
    await heldThread(100)
    await heldThread(101)

    await repo.apply({
      decision: 'approve',
      threadIds: [100, 101],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`select user_id, action, detail from admin_log`),
    ) as Array<{ user_id: number; action: string; detail: Record<string, unknown> }>

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'moderation.approve' })
    expect(Number(rows[0]!.user_id)).toBe(MODERATOR)
    expect(rows[0]!.detail).toMatchObject({
      applied: 2,
      forumId: FORUM,
      forumIds: [FORUM],
    })
  })

  it('names every forum a batch reached, so each one"s moderators see it', async () => {
    await heldThread(100)
    await heldThread(101, OTHER)

    await repo.apply({
      decision: 'approve',
      threadIds: [100, 101],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })

    const rows = resultRows(await db.execute(sql`select detail from admin_log`)) as Array<{
      detail: { forumIds: number[]; forumId?: number }
    }>

    expect(new Set(rows[0]!.detail.forumIds)).toEqual(new Set([FORUM, OTHER]))
    expect(rows[0]!.detail.forumId).toBeUndefined()
  })

  it('records nothing when nothing changed', async () => {
    await repo.apply({
      decision: 'approve',
      threadIds: [4242],
      postIds: [],
      actorUserId: MODERATOR,
      at: AT,
    })
    expect(resultRows(await db.execute(sql`select id from admin_log`))).toHaveLength(0)
  })
})

describe('through the command', () => {
  it('acts only on the forums the actor moderates', async () => {
    await heldThread(100, FORUM)
    await heldThread(101, OTHER)
    const queue = new ModerationQueue({ queue: repo, now: () => AT })

    const outcome = await queue.decide({
      selection: [
        { kind: 'thread', id: 100 },
        { kind: 'thread', id: 101 },
      ],
      decision: 'approve',
      moderatedForumIds: new Set([FORUM]),
      actorUserId: MODERATOR,
    })

    expect(outcome).toMatchObject({ applied: 1, refused: 1, missing: 0 })
    expect(await stateOf('threads', 100)).toBe('visible')
    expect(await stateOf('threads', 101)).toBe('unapproved')
  })

  it('never publishes a reply into a deleted thread, so no counter drifts', async () => {
    await heldReply(200, 2000)
    await db.execute(sql`update threads set visibility = 'deleted' where id = 200`)
    const before = await forumCounts(FORUM)
    const queue = new ModerationQueue({ queue: repo, now: () => AT })

    const outcome = await queue.decide({
      selection: [{ kind: 'post', id: 2000 }],
      decision: 'approve',
      moderatedForumIds: new Set([FORUM]),
      actorUserId: MODERATOR,
    })

    expect(outcome).toMatchObject({ applied: 0, refused: 0, missing: 1 })
    expect(await stateOf('posts', 2000)).toBe('unapproved')
    expect(await forumCounts(FORUM)).toEqual(before)
  })
})
