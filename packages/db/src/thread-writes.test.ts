import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PUBLIC_CONTENT } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, outbox, posts, threadSubscriptions, threads, users } from './schema'
import { PostgresSearchRepository } from './search-repo'
import { PostgresThreadWriteRepository } from './thread-writes'

let harness: TestDb
let db: Database
let repo: PostgresThreadWriteRepository

const AT = new Date('2026-07-30T12:00:00Z')

const CATEGORY = 1
const FORUM = 4

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresThreadWriteRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from thread_subscriptions`)
  await db.execute(sql`delete from content_counter_rollups`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from thread_prefixes`)
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
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
  ])
})

const RECORD = {
  forumId: FORUM,
  title: 'Hello there',
  slug: 'hello-there',
  message: 'First!',
  prefixId: null,
  authorUserId: 1,
  authorUsername: 'ada',
  visibility: 'visible' as const,
  subscribe: false,
  createdAt: AT,
}

describe('PostgresThreadWriteRepository.create', () => {
  it('writes thread, opening post, counters and the event together', async () => {
    const created = await repo.create(RECORD)

    const [thread] = await db.select().from(threads).where(eq(threads.id, created.threadId))
    expect(thread).toMatchObject({
      forumId: FORUM,
      title: 'Hello there',
      visibility: 'visible',
      firstPostId: created.postId,
      replyCount: 0,
      lastPostId: created.postId,
    })

    const [post] = await db.select().from(posts).where(eq(posts.id, created.postId))
    expect(post).toMatchObject({ threadId: created.threadId, isFirstPost: true, message: 'First!' })

    const [forum] = await db.select().from(forums).where(eq(forums.id, FORUM))
    expect(forum).toMatchObject({ threadCount: 1, postCount: 1, lastPostId: created.postId })
    const [category] = await db.select().from(forums).where(eq(forums.id, CATEGORY))
    expect(category).toMatchObject({ threadCount: 0, postCount: 0 })

    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ threadCount: 1, postCount: 1 })

    expect(await db.select({ topic: outbox.topic }).from(outbox)).toEqual([
      { topic: 'post.created' },
    ])
  })

  it('subscribes the author when asked, in the same transaction', async () => {
    const created = await repo.create({ ...RECORD, subscribe: true })

    const rows = await db.select().from(threadSubscriptions)
    expect(rows).toEqual([expect.objectContaining({ userId: 1, threadId: created.threadId })])
  })

  it('holds an unapproved thread out of every counter, and emits nothing', async () => {
    const created = await repo.create({ ...RECORD, visibility: 'unapproved' })

    const [thread] = await db.select().from(threads).where(eq(threads.id, created.threadId))
    expect(thread).toMatchObject({ visibility: 'unapproved', firstPostId: created.postId })

    const [forum] = await db.select().from(forums).where(eq(forums.id, FORUM))
    expect(forum).toMatchObject({ threadCount: 0, postCount: 0, lastPostId: null })
    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ threadCount: 0, postCount: 0 })
    expect(await db.select().from(outbox)).toEqual([])
  })

  it('leaves nothing behind when the write fails', async () => {
    await expect(repo.create({ ...RECORD, forumId: 9999 })).rejects.toThrow()

    expect(await db.select().from(threads)).toEqual([])
    expect(await db.select().from(posts)).toEqual([])
    expect(await db.select().from(outbox)).toEqual([])
  })
})

describe('PostgresThreadWriteRepository replies', () => {
  it('raises the reply and post counts without inventing a thread', async () => {
    const thread = await repo.create(RECORD)
    const at = new Date(AT.getTime() + 60_000)

    const { postId } = await repo.createReply({
      threadId: thread.threadId,
      forumId: FORUM,
      threadTitle: RECORD.title,
      message: 'Quite so.',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: false,
      createdAt: at,
    })

    const [row] = await db.select().from(threads).where(eq(threads.id, thread.threadId))
    expect(row).toMatchObject({
      replyCount: 1,
      firstPostId: thread.postId,
      lastPostId: postId,
      lastPostAt: at,
    })

    const [forum] = await db.select().from(forums).where(eq(forums.id, FORUM))
    expect(forum).toMatchObject({ threadCount: 1, postCount: 2, lastPostId: postId })

    const [user] = await db.select().from(users).where(eq(users.id, 1))
    expect(user).toMatchObject({ threadCount: 1, postCount: 2 })

    expect(await db.select({ topic: outbox.topic }).from(outbox)).toHaveLength(2)
  })

  it('holds an unapproved reply out of every counter', async () => {
    const thread = await repo.create(RECORD)
    await repo.createReply({
      threadId: thread.threadId,
      forumId: FORUM,
      threadTitle: RECORD.title,
      message: 'Held.',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'unapproved',
      subscribe: false,
      createdAt: new Date(AT.getTime() + 60_000),
    })

    const [row] = await db.select().from(threads).where(eq(threads.id, thread.threadId))
    expect(row).toMatchObject({ replyCount: 0, lastPostId: thread.postId })
    const [forum] = await db.select().from(forums).where(eq(forums.id, FORUM))
    expect(forum).toMatchObject({ postCount: 1 })
  })

  it('subscribes the replier when asked', async () => {
    const thread = await repo.create(RECORD)
    await repo.createReply({
      threadId: thread.threadId,
      forumId: FORUM,
      threadTitle: RECORD.title,
      message: 'Subscribe me.',
      authorUserId: 1,
      authorUsername: 'ada',
      visibility: 'visible',
      subscribe: true,
      createdAt: new Date(AT.getTime() + 60_000),
    })

    expect(await db.select().from(threadSubscriptions)).toHaveLength(1)
  })

  it('reports the thread the reply form needs', async () => {
    const thread = await repo.create(RECORD)

    expect(await repo.replyTarget(thread.threadId)).toMatchObject({
      threadId: thread.threadId,
      slug: 'hello-there',
      title: 'Hello there',
      isLocked: false,
      visibility: 'visible',
      lastPostId: thread.postId,
      replyCount: 0,
      forum: {
        id: FORUM,
        allowReplies: true,
        allowAttachments: true,
        moderateNewPosts: false,
      },
    })
  })

  it('carries the attachment switch the forum was saved with', async () => {
    const thread = await repo.create(RECORD)
    await db.update(forums).set({ allowAttachments: false }).where(eq(forums.id, FORUM))

    expect(await repo.replyTarget(thread.threadId)).toMatchObject({
      forum: { id: FORUM, allowAttachments: false },
    })
  })

  it('has no target for a thread that does not exist', async () => {
    expect(await repo.replyTarget(4242)).toBeNull()
  })
})

describe('PostgresThreadWriteRepository.postingRules', () => {
  it('reports a forum that takes attachments', async () => {
    expect(await repo.postingRules(FORUM)).toMatchObject({
      id: FORUM,
      slug: 'general',
      allowThreads: true,
      allowAttachments: true,
    })
  })

  it('reports a forum whose operator turned attachments off', async () => {
    await db.update(forums).set({ allowAttachments: false }).where(eq(forums.id, FORUM))

    expect(await repo.postingRules(FORUM)).toMatchObject({
      id: FORUM,
      allowThreads: true,
      allowAttachments: false,
    })
  })

  it('has no rules for a forum that does not exist', async () => {
    expect(await repo.postingRules(4242)).toBeNull()
  })
})

describe('PostgresThreadWriteRepository.lastPostAt', () => {
  it('is null for an author who has never posted', async () => {
    expect(await repo.lastPostAt(1)).toBeNull()
  })

  it('returns the most recent post, including one awaiting approval', async () => {
    await repo.create(RECORD)
    const later = new Date(AT.getTime() + 60_000)
    await repo.create({
      ...RECORD,
      title: 'Held for review',
      visibility: 'unapproved',
      createdAt: later,
    })

    expect(await repo.lastPostAt(1)).toEqual(later)
  })
})

describe('PostgresThreadWriteRepository prefixes', () => {
  beforeEach(async () => {
    await db.execute(sql`
      insert into thread_prefixes (id, label, token, display_order, forum_path_prefix)
      values (1, 'Board-wide', null, 0, null),
             (2, 'This subtree', null, 1, '1.4'),
             (3, 'Elsewhere', null, 2, '1.40')
    `)
  })

  it('offers board-wide prefixes and those scoped to this subtree', async () => {
    expect(await repo.allowedPrefixIds(FORUM)).toEqual([1, 2])
  })

  it('does not offer a prefix scoped to a text-prefix sibling', async () => {
    const labels = (await repo.listPrefixes(FORUM)).map((p) => p.label)
    expect(labels).toEqual(['Board-wide', 'This subtree'])
  })
})

describe('PostgresThreadWriteRepository and the search index', () => {
  const search = () => new PostgresSearchRepository(db)
  const scope = {
    forumIds: [FORUM],
    ownThreadsOnlyForumIds: [],
    viewerUserId: null,
    content: PUBLIC_CONTENT,
  }
  const find = async (terms: string) =>
    (
      await search().search(
        {
          terms,
          match: 'everything',
          grouping: 'posts',
          sort: 'relevance',
          limit: 10,
          after: null,
        },
        scope,
      )
    ).hits.map((hit) => hit.postId)

  it('makes a new thread findable by its title as well as its body', async () => {
    const created = await repo.create({ ...RECORD, title: 'Kestrel sightings', message: 'A bird.' })

    expect(await find('kestrel')).toEqual([created.postId])
    expect(await find('bird')).toEqual([created.postId])
  })

  it('writes the same document the backfill would', async () => {
    const created = await repo.create({ ...RECORD, title: 'Kestrel sightings', message: 'A bird.' })

    const written = await vectorOf(created.postId)
    await db.execute(sql`update posts set search_vector = null where id = ${created.postId}`)
    await new PostgresSearchRepository(db).reindexChunk(0, 10)

    expect(await vectorOf(created.postId)).toBe(written)
  })

  it('leaves the board with nothing outstanding to reindex', async () => {
    await repo.create(RECORD)

    expect(await new PostgresSearchRepository(db).indexProgress()).toEqual({
      indexed: 1,
      pending: 0,
    })
  })

  it('indexes a reply on its own words, not on the thread’s title', async () => {
    const thread = await repo.create({ ...RECORD, title: 'Kestrel sightings', message: 'A bird.' })
    const reply = await repo.createReply({
      threadId: thread.threadId,
      forumId: FORUM,
      threadTitle: 'Kestrel sightings',
      authorUserId: 1,
      authorUsername: 'ada',
      message: 'A peregrine, surely.',
      visibility: 'visible',
      subscribe: false,
      createdAt: AT,
    })

    expect(await find('peregrine')).toEqual([reply.postId])
    expect(await find('kestrel')).toEqual([thread.postId])
  })
})

async function vectorOf(postId: number): Promise<string> {
  const [row] = await db.select().from(posts).where(eq(posts.id, postId))
  return String(row?.searchVector ?? '')
}
