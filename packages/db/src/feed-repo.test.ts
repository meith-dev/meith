import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresFeedRepository, type FeedScope } from './feed-repo'

let harness: TestDb
let db: Database
let repo: PostgresFeedRepository

const OPEN = 1
const SECRET = 2
const ANN = 7

const SECRET_TITLE = 'Board takeover plan'
const SECRET_BODY = 'the passphrase is hunter2'

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresFeedRepository(db)
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
    insert into forums (id, type, title, slug, path, last_post_at) values
      (${OPEN}, 'forum', 'Open', 'open', '1', '2026-02-02T00:00:00Z'),
      (${SECRET}, 'forum', 'Staff room', 'staff-room', '2', null)
  `)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ANN}, 'ann', 'ann', 'ann@example.test', 'ann@example.test', 'x', 'argon2id', 2)
  `)
})

async function seedThread(input: {
  readonly id: number
  readonly forumId?: number
  readonly title?: string
  readonly visibility?: string
  readonly lastPostAt?: string
  readonly firstPostId?: number | null
}): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, author_user_id, author_username, title, slug,
                         first_post_id, last_post_at, visibility)
    values (${input.id}, ${input.forumId ?? OPEN}, ${ANN}, 'ann',
            ${input.title ?? `Thread ${input.id}`}, ${`t-${input.id}`},
            ${input.firstPostId === undefined ? null : input.firstPostId},
            ${input.lastPostAt ?? '2026-01-01T00:00:00Z'},
            ${input.visibility ?? 'visible'})
  `)
}

async function seedPost(input: {
  readonly id: number
  readonly threadId: number
  readonly message?: string
  readonly visibility?: string
  readonly createdAt?: string
}): Promise<void> {
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, created_at)
    values (${input.id}, ${input.threadId}, ${OPEN}, ${ANN}, 'ann',
            ${input.message ?? 'hello'}, ${input.visibility ?? 'visible'},
            ${input.createdAt ?? '2026-01-01T00:00:00Z'})
  `)
}

const guest = (overrides: Partial<FeedScope> = {}): FeedScope => ({
  forumIds: [OPEN],
  content: PUBLIC_CONTENT,
  ...overrides,
})

const staff: FeedScope = {
  forumIds: [OPEN, SECRET],
  content: contentScopeFrom({ seesUnapproved: true, seesDeleted: true }),
}

describe('the leak suite', () => {
  beforeEach(async () => {
    await seedThread({
      id: 100,
      forumId: SECRET,
      title: SECRET_TITLE,
      lastPostAt: '2026-09-09T00:00:00Z',
      firstPostId: 1000,
    })
    await seedPost({ id: 1000, threadId: 100, message: SECRET_BODY })

    await seedThread({
      id: 101,
      forumId: OPEN,
      title: SECRET_TITLE,
      visibility: 'unapproved',
      lastPostAt: '2026-09-09T00:00:00Z',
      firstPostId: 1001,
    })
    await seedPost({ id: 1001, threadId: 101, message: SECRET_BODY })

    await seedThread({ id: 1, firstPostId: 10 })
    await seedPost({ id: 10, threadId: 1, message: 'ordinary business' })
  })

  it('keeps a private forum out of the board feed, title and body alike', async () => {
    const serialised = JSON.stringify(await repo.recentThreads(50, guest()))

    expect(serialised).not.toContain(SECRET_TITLE)
    expect(serialised).not.toContain(SECRET_BODY)
    expect(serialised).not.toContain('Staff room')
    expect(serialised).toContain('ordinary business')
  })

  it('keeps a hidden thread in a readable forum out of the board feed', async () => {
    const rows = await repo.recentThreads(50, guest())
    expect(rows.map((row) => row.threadId)).toEqual([1])
  })

  it('refuses a private forum asked for by id', async () => {
    expect(await repo.recentThreads(50, guest(), SECRET)).toEqual([])
    expect((await repo.recentThreads(50, staff, SECRET)).map((r) => r.threadId)).toEqual([100])
  })

  it('refuses a private thread’s post feed asked for by id', async () => {
    expect(await repo.recentPosts(100, 50, guest())).toEqual([])
    expect((await repo.recentPosts(100, 50, staff)).map((r) => r.postId)).toEqual([1000])
  })

  it('refuses a hidden thread’s post feed even though its posts are visible', async () => {
    const serialised = JSON.stringify(await repo.recentPosts(101, 50, guest()))

    expect(serialised).not.toContain(SECRET_BODY)
    expect(await repo.recentPosts(101, 50, guest())).toEqual([])
    expect((await repo.recentPosts(101, 50, staff)).map((r) => r.postId)).toEqual([1001])
  })

  it('keeps a hidden post out of a readable thread’s feed', async () => {
    await seedPost({ id: 11, threadId: 1, message: SECRET_BODY, visibility: 'deleted' })

    const serialised = JSON.stringify(await repo.recentPosts(1, 50, guest()))
    expect(serialised).not.toContain(SECRET_BODY)
    expect(serialised).toContain('ordinary business')
  })

  it('keeps a private forum and a hidden thread out of the sitemap', async () => {
    const forums = JSON.stringify(await repo.sitemapForums(guest()))
    expect(forums).not.toContain('staff-room')
    expect(forums).toContain('open')

    const threads = await repo.sitemapThreads(0, 100, guest())
    expect(threads.map((row) => row.threadId)).toEqual([1])
    expect(await repo.sitemapThreadCount(guest())).toBe(1)
  })

  it('answers nothing for a scope with no forums at all', async () => {
    const empty = guest({ forumIds: [] })

    expect(await repo.recentThreads(50, empty)).toEqual([])
    expect(await repo.recentPosts(1, 50, empty)).toEqual([])
    expect(await repo.sitemapForums(empty)).toEqual([])
    expect(await repo.sitemapThreads(0, 100, empty)).toEqual([])
    expect(await repo.sitemapThreadCount(empty)).toBe(0)
    expect(await repo.sitemapBoundaryId(5, empty)).toBeNull()
  })
})

describe('recentThreads', () => {
  it('orders by last post, so a revived thread is news', async () => {
    await seedThread({ id: 1, lastPostAt: '2026-01-01T00:00:00Z' })
    await seedThread({ id: 2, lastPostAt: '2026-06-01T00:00:00Z' })

    expect((await repo.recentThreads(50, guest())).map((r) => r.threadId)).toEqual([2, 1])
  })

  it('summarises the opening post, and stays one entry per thread', async () => {
    await seedThread({ id: 1, firstPostId: 10 })
    await seedPost({ id: 10, threadId: 1, message: 'the question' })
    await seedPost({ id: 11, threadId: 1, message: 'the answer', createdAt: '2026-03-03T00:00:00Z' })

    const rows = await repo.recentThreads(50, guest())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.excerptSource).toBe('the question')
  })

  it('keeps a thread whose opening post was removed, without a summary', async () => {
    await seedThread({ id: 1, firstPostId: 10 })
    await seedPost({ id: 10, threadId: 1, visibility: 'deleted', message: SECRET_BODY })

    const rows = await repo.recentThreads(50, guest())
    expect(rows.map((r) => r.threadId)).toEqual([1])
    expect(rows[0]?.excerptSource).toBeNull()
  })

  it('honours the limit', async () => {
    for (const id of [1, 2, 3]) await seedThread({ id })
    expect(await repo.recentThreads(2, guest())).toHaveLength(2)
  })
})

describe('recentPosts', () => {
  it('returns the newest first', async () => {
    await seedThread({ id: 1 })
    await seedPost({ id: 10, threadId: 1, createdAt: '2026-01-01T00:00:00Z' })
    await seedPost({ id: 11, threadId: 1, createdAt: '2026-02-01T00:00:00Z' })

    expect((await repo.recentPosts(1, 50, guest())).map((r) => r.postId)).toEqual([11, 10])
  })
})

describe('the sitemap’s paging', () => {
  beforeEach(async () => {
    for (let id = 1; id <= 7; id += 1) await seedThread({ id })
  })

  it('walks the whole board once, in id order', async () => {
    const seen: number[] = []
    let after = 0
    for (;;) {
      const page = await repo.sitemapThreads(after, 3, guest())
      if (page.length === 0) break
      seen.push(...page.map((row) => row.threadId))
      after = page.at(-1)!.threadId
    }

    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('finds a chunk’s starting id by position', async () => {
    expect(await repo.sitemapBoundaryId(3, guest())).toBe(3)
    expect(await repo.sitemapBoundaryId(0, guest())).toBe(0)
  })

  it('says null — not zero — for a chunk past the end', async () => {
    expect(await repo.sitemapBoundaryId(99, guest())).toBeNull()
    expect(await repo.sitemapBoundaryId(1, guest())).toBe(1)
  })

  it('skips a hidden thread when counting positions', async () => {
    await db.execute(sql`update threads set visibility = 'deleted' where id = 4`)

    expect(await repo.sitemapThreadCount(guest())).toBe(6)
    expect(await repo.sitemapBoundaryId(3, guest())).toBe(3)
    expect(await repo.sitemapBoundaryId(4, guest())).toBe(5)
  })

  it('omits lastmod for a forum nobody has posted in', async () => {
    const forums = await repo.sitemapForums({ ...guest(), forumIds: [OPEN, SECRET] })

    expect(forums.find((f) => f.forumId === OPEN)?.lastPostAt).not.toBeNull()
    expect(forums.find((f) => f.forumId === SECRET)?.lastPostAt).toBeNull()
  })
})
