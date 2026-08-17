import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { contentScopeFrom, PUBLIC_CONTENT } from '@meith/core'

import type { Database } from './client'
import { type LatestScope, PostgresLatestRepository } from './latest-repo'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let repo: PostgresLatestRepository

const OPEN = 1
const PRIVATE = 2
const ANN = 7

const STAFF = contentScopeFrom({ seesUnapproved: true, seesDeleted: true })

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresLatestRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into forums (id, type, title, slug, path) values
      (${OPEN}, 'forum', 'Open', 'open', '1'),
      (${PRIVATE}, 'forum', 'Private', 'private', '2')
  `)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ANN}, 'ann', 'ann', 'ann@example.test', 'ann@example.test',
            'x', 'argon2id', 2)
  `)
})

interface SeedThread {
  readonly id: number
  readonly forumId?: number
  readonly visibility?: string
}

async function seedThread(thread: SeedThread): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                         reply_count, visibility)
    values (${thread.id}, ${thread.forumId ?? OPEN}, ${ANN}, 'ann',
            ${`Thread ${thread.id}`}, ${`t-${thread.id}`}, 0,
            ${thread.visibility ?? 'visible'})
  `)
}

interface SeedPost {
  readonly id: number
  readonly threadId: number
  readonly forumId?: number
  readonly message?: string
  readonly visibility?: string
}

async function seedPost(post: SeedPost): Promise<void> {
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility)
    values (${post.id}, ${post.threadId}, ${post.forumId ?? OPEN}, ${ANN}, 'ann',
            ${post.message ?? 'hello'}, ${post.visibility ?? 'visible'})
  `)
}

const scope = (overrides: Partial<LatestScope> = {}): LatestScope => ({
  forumIds: [OPEN, PRIVATE],
  ownThreadsOnlyForumIds: [],
  viewerUserId: null,
  content: PUBLIC_CONTENT,
  ...overrides,
})

describe('the permission filter', () => {
  it('returns nothing for an empty scope, rather than everything', async () => {
    await seedThread({ id: 1 })
    await seedPost({ id: 1, threadId: 1 })

    expect(await repo.threads(5, scope({ forumIds: [] }))).toEqual([])
    expect(await repo.posts(5, scope({ forumIds: [] }))).toEqual([])
  })

  it('leaves out forums the reader may not see', async () => {
    await seedThread({ id: 1, forumId: OPEN })
    await seedThread({ id: 2, forumId: PRIVATE })
    await seedPost({ id: 1, threadId: 1, forumId: OPEN })
    await seedPost({ id: 2, threadId: 2, forumId: PRIVATE })

    expect((await repo.threads(5, scope({ forumIds: [OPEN] }))).map((r) => r.threadId)).toEqual([1])
    expect((await repo.posts(5, scope({ forumIds: [OPEN] }))).map((r) => r.postId)).toEqual([1])
  })

  it('leaves out content the reader may not see, and shows it to staff', async () => {
    await seedThread({ id: 1 })
    await seedThread({ id: 2, visibility: 'deleted' })
    await seedPost({ id: 1, threadId: 1 })
    await seedPost({ id: 2, threadId: 1, visibility: 'unapproved' })

    expect((await repo.threads(5, scope())).map((r) => r.threadId)).toEqual([1])
    expect((await repo.posts(5, scope())).map((r) => r.postId)).toEqual([1])

    expect((await repo.threads(5, scope({ content: STAFF }))).map((r) => r.threadId)).toEqual([
      2, 1,
    ])
    expect((await repo.posts(5, scope({ content: STAFF }))).map((r) => r.postId)).toEqual([2, 1])
  })

  it('hides a visible post whose thread was removed', async () => {
    await seedThread({ id: 1, visibility: 'deleted' })
    await seedPost({ id: 1, threadId: 1, visibility: 'visible' })

    expect(await repo.posts(5, scope())).toEqual([])
    expect((await repo.posts(5, scope({ content: STAFF }))).map((r) => r.postId)).toEqual([1])
  })
})

describe('ordering and size', () => {
  it('is newest first and stops at the limit', async () => {
    for (const id of [1, 2, 3, 4]) {
      await seedThread({ id })
      await seedPost({ id, threadId: id })
    }

    expect((await repo.threads(2, scope())).map((r) => r.threadId)).toEqual([4, 3])
    expect((await repo.posts(2, scope())).map((r) => r.postId)).toEqual([4, 3])
  })
})

describe('the rows a panel renders from', () => {
  it('carries the forum a thread is in, so two same-named threads differ', async () => {
    await seedThread({ id: 1, forumId: PRIVATE })

    const [row] = await repo.threads(5, scope())

    expect(row).toMatchObject({
      threadId: 1,
      title: 'Thread 1',
      slug: 't-1',
      forumId: PRIVATE,
      forumTitle: 'Private',
      forumSlug: 'private',
      authorUserId: ANN,
      authorUsername: 'ann',
      replyCount: 0,
    })
    expect(row?.createdAt).toBeInstanceOf(Date)
  })

  it('carries the thread a post is in, and cuts the message in the database', async () => {
    await seedThread({ id: 1 })
    await seedPost({ id: 1, threadId: 1, message: 'x'.repeat(1000) })

    const [row] = await repo.posts(5, scope())

    expect(row).toMatchObject({
      postId: 1,
      threadId: 1,
      threadTitle: 'Thread 1',
      threadSlug: 't-1',
      forumId: OPEN,
      forumTitle: 'Open',
      authorUsername: 'ann',
    })
    expect(row!.messageSource.length).toBeLessThan(1000)
  })
})
