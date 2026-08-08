/**
 * The index sidebar's two lists, against real Postgres.
 *
 * Three claims carry the feature, and each of them is a leak if it is wrong:
 *
 *  - **the community scope is in the query**, and an empty scope means nothing
 *    rather than everything;
 *  - **a post is hidden when its thread is**, not only when the post itself is —
 *    the panel joins two tables and either one can be the removed thing;
 *  - **newest first**, which is the only reason anybody looks at the panel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresLatestRepository, type LatestScope } from './latest-repo'

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
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into communities (id, type, title, slug, path) values
      (${OPEN}, 'community', 'Open', 'open', '1'),
      (${PRIVATE}, 'community', 'Private', 'private', '2')
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
  readonly communityId?: number
  readonly visibility?: string
}

async function seedThread(thread: SeedThread): Promise<void> {
  await db.execute(sql`
    insert into threads (id, community_id, author_user_id, author_username, title, slug,
                         reply_count, visibility)
    values (${thread.id}, ${thread.communityId ?? OPEN}, ${ANN}, 'ann',
            ${`Thread ${thread.id}`}, ${`t-${thread.id}`}, 0,
            ${thread.visibility ?? 'visible'})
  `)
}

interface SeedPost {
  readonly id: number
  readonly threadId: number
  readonly communityId?: number
  readonly message?: string
  readonly visibility?: string
}

async function seedPost(post: SeedPost): Promise<void> {
  await db.execute(sql`
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       message, visibility)
    values (${post.id}, ${post.threadId}, ${post.communityId ?? OPEN}, ${ANN}, 'ann',
            ${post.message ?? 'hello'}, ${post.visibility ?? 'visible'})
  `)
}

const scope = (overrides: Partial<LatestScope> = {}): LatestScope => ({
  communityIds: [OPEN, PRIVATE],
  content: PUBLIC_CONTENT,
  ...overrides,
})

describe('the permission filter', () => {
  it('returns nothing for an empty scope, rather than everything', async () => {
    await seedThread({ id: 1 })
    await seedPost({ id: 1, threadId: 1 })

    expect(await repo.threads(5, scope({ communityIds: [] }))).toEqual([])
    expect(await repo.posts(5, scope({ communityIds: [] }))).toEqual([])
  })

  it('leaves out communities the reader may not see', async () => {
    await seedThread({ id: 1, communityId: OPEN })
    await seedThread({ id: 2, communityId: PRIVATE })
    await seedPost({ id: 1, threadId: 1, communityId: OPEN })
    await seedPost({ id: 2, threadId: 2, communityId: PRIVATE })

    expect((await repo.threads(5, scope({ communityIds: [OPEN] }))).map((r) => r.threadId)).toEqual([1])
    expect((await repo.posts(5, scope({ communityIds: [OPEN] }))).map((r) => r.postId)).toEqual([1])
  })

  it('leaves out content the reader may not see, and shows it to staff', async () => {
    await seedThread({ id: 1 })
    await seedThread({ id: 2, visibility: 'deleted' })
    await seedPost({ id: 1, threadId: 1 })
    await seedPost({ id: 2, threadId: 1, visibility: 'unapproved' })

    expect((await repo.threads(5, scope())).map((r) => r.threadId)).toEqual([1])
    expect((await repo.posts(5, scope())).map((r) => r.postId)).toEqual([1])

    expect((await repo.threads(5, scope({ content: STAFF }))).map((r) => r.threadId)).toEqual([2, 1])
    expect((await repo.posts(5, scope({ content: STAFF }))).map((r) => r.postId)).toEqual([2, 1])
  })

  it('hides a visible post whose thread was removed', async () => {
    /*
     * The claim the join exists for. Kills the mutant that checks only
     * `p.visibility` — under which deleting a thread leaves its replies on the
     * front page, with a link, an author and an excerpt of what was said.
     */
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
  it('carries the community a thread is in, so two same-named threads differ', async () => {
    await seedThread({ id: 1, communityId: PRIVATE })

    const [row] = await repo.threads(5, scope())

    expect(row).toMatchObject({
      threadId: 1,
      title: 'Thread 1',
      slug: 't-1',
      communityId: PRIVATE,
      communityTitle: 'Private',
      communitySlug: 'private',
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
      communityId: OPEN,
      communityTitle: 'Open',
      authorUsername: 'ann',
    })
    /*
     * Asserting the cut happened rather than its exact size: the point is that
     * a pasted stack trace does not cross the wire to be thrown away, and the
     * budget is free to change without this test having an opinion.
     */
    expect(row!.messageSource.length).toBeLessThan(1000)
  })
})
