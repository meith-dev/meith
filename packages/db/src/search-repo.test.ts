import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'
import type { SearchQuery, SearchScope } from '@meith/search'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSearchRepository, searchVectorSql } from './search-repo'

let harness: TestDb
let db: Database
let repo: PostgresSearchRepository

const OPEN = 1
const PRIVATE = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresSearchRepository(db)
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
  for (const id of [7, 8]) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`},
              ${`u${id}@example.test`}, 'x', 'argon2id', 2)
    `)
  }
})

interface SeedPost {
  readonly id: number
  readonly forumId?: number
  readonly threadId?: number
  readonly title?: string
  readonly subject?: string | null
  readonly message: string
  readonly visibility?: string
  readonly authorUserId?: number | null
}

async function seed(post: SeedPost): Promise<void> {
  const forumId = post.forumId ?? OPEN
  const threadId = post.threadId ?? post.id

  await db.execute(sql`
    insert into threads (id, forum_id, author_username, title, slug, visibility)
    values (${threadId}, ${forumId}, 'ann', ${post.title ?? 'A thread'},
            ${`t-${threadId}`}, 'visible')
    on conflict (id) do nothing
  `)

  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       subject, message, visibility, search_vector)
    values (${post.id}, ${threadId}, ${forumId}, ${post.authorUserId ?? null}, 'ann',
            ${post.subject ?? null}, ${post.message}, ${post.visibility ?? 'visible'},
            ${searchVectorSql(sql`${post.subject ?? null}`, sql`${post.message}`)})
  `)
}

const STAFF_CONTENT = contentScopeFrom({ seesUnapproved: true, seesDeleted: true })

const scope = (overrides: Partial<SearchScope> = {}): SearchScope => ({
  forumIds: [OPEN, PRIVATE],
  viewerUserId: null,
  content: PUBLIC_CONTENT,
  ...overrides,
})

const query = (overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  terms: 'kestrel',
  grouping: 'posts',
  sort: 'relevance',
  limit: 10,
  after: null,
  ...overrides,
})

describe('the permission filter', () => {
  it('is in the query: an empty scope returns nothing', async () => {
    await seed({ id: 1, message: 'a kestrel flew past' })

    const results = await repo.search(query(), scope({ forumIds: [] }))
    expect(results.hits).toEqual([])
  })

  it('returns only hits from forums the viewer may see', async () => {
    await seed({ id: 1, forumId: OPEN, message: 'kestrel in the open forum' })
    await seed({ id: 2, forumId: PRIVATE, message: 'kestrel in the private forum' })

    const results = await repo.search(query(), scope({ forumIds: [OPEN] }))
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('lets a query narrow the scope but never widen it', async () => {
    await seed({ id: 1, forumId: OPEN, message: 'kestrel here' })
    await seed({ id: 2, forumId: PRIVATE, message: 'kestrel there' })

    const results = await repo.search(
      query({ forumIds: [PRIVATE] }),
      scope({ forumIds: [OPEN] }),
    )
    expect(results.hits).toEqual([])
  })

  it('hides unapproved posts from other members', async () => {
    await seed({ id: 1, message: 'kestrel approved' })
    await seed({ id: 2, message: 'kestrel pending', visibility: 'unapproved', authorUserId: 7 })

    const results = await repo.search(query(), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('hides a post whose thread was removed', async () => {
    await seed({ id: 1, message: 'kestrel in a removed thread' })
    await db.execute(sql`update threads set visibility = 'deleted' where id = 1`)

    expect((await repo.search(query(), scope())).hits).toEqual([])
  })

  it('shows staff what their scope admits', async () => {
    await seed({ id: 1, message: 'kestrel deleted', visibility: 'deleted' })

    const results = await repo.search(query(), scope({ content: STAFF_CONTENT }))
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })
})

describe('matching and ranking', () => {
  it('stems, so a search for one form finds the other', async () => {
    await seed({ id: 1, message: 'the birds were running quickly' })

    expect((await repo.search(query({ terms: 'run' }), scope())).hits).toHaveLength(1)
    expect((await repo.search(query({ terms: 'bird' }), scope())).hits).toHaveLength(1)
  })

  it('ranks a subject match above a passing mention', async () => {
    await seed({ id: 1, subject: 'kestrel', message: 'short note' })
    await seed({
      id: 2,
      subject: null,
      message: `a long post that mentions a kestrel once ${'and continues '.repeat(40)}`,
    })

    const results = await repo.search(query(), scope())
    expect(results.hits[0]?.postId).toBe(1)
  })

  it('understands a quoted phrase', async () => {
    await seed({ id: 1, message: 'the brown kestrel flew' })
    await seed({ id: 2, message: 'a kestrel and a brown owl' })

    const results = await repo.search(query({ terms: '"brown kestrel"' }), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('understands exclusion', async () => {
    await seed({ id: 1, message: 'kestrel and owl' })
    await seed({ id: 2, message: 'kestrel alone' })

    const results = await repo.search(query({ terms: 'kestrel -owl' }), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([2])
  })

  it('never raises on punctuation a member typed', async () => {
    await seed({ id: 1, message: 'kestrel' })

    for (const terms of ['kestrel & ', '(kestrel', 'kestrel | | owl', "don't"]) {
      await expect(repo.search(query({ terms }), scope())).resolves.toBeDefined()
    }
  })

  it('returns an excerpt with the match marked', async () => {
    await seed({ id: 1, message: 'a long way before the kestrel appears in the text' })

    const results = await repo.search(query(), scope())
    expect(results.hits[0]?.excerpt).toContain('kestrel')
    expect(results.hits[0]?.excerpt).toMatch(/<b>/)
  })

  it('runs no query at all for empty terms', async () => {
    await seed({ id: 1, message: 'kestrel' })
    expect((await repo.search(query({ terms: '  ' }), scope())).hits).toEqual([])
  })
})

describe('paging', () => {
  it('pages by keyset and stops with a null cursor', async () => {
    for (let id = 1; id <= 5; id += 1) await seed({ id, message: 'kestrel sighting' })

    const first = await repo.search(query({ limit: 2 }), scope())
    expect(first.hits).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const seen = new Set(first.hits.map((hit) => hit.postId))
    let cursor = first.nextCursor
    while (cursor !== null) {
      const page = await repo.search(query({ limit: 2, after: cursor }), scope())
      for (const hit of page.hits) seen.add(hit.postId)
      cursor = page.nextCursor
    }

    expect(seen.size).toBe(5)
  })

  it('does not lose rows when ranks tie', async () => {
    for (let id = 1; id <= 6; id += 1) await seed({ id, message: 'kestrel kestrel' })

    const seen: number[] = []
    let cursor = null as Awaited<ReturnType<typeof repo.search>>['nextCursor']
    do {
      const page = await repo.search(query({ limit: 2, after: cursor }), scope())
      seen.push(...page.hits.map((hit) => hit.postId))
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(6)
  })

  it('pages newest-first without repeating', async () => {
    for (let id = 1; id <= 4; id += 1) await seed({ id, message: 'kestrel' })

    const first = await repo.search(query({ sort: 'newest', limit: 2 }), scope())
    expect(first.hits.map((hit) => hit.postId)).toEqual([4, 3])

    const second = await repo.search(
      query({ sort: 'newest', limit: 2, after: first.nextCursor }),
      scope(),
    )
    expect(second.hits.map((hit) => hit.postId)).toEqual([2, 1])
  })
})

describe('filters', () => {
  it('restricts to an author', async () => {
    await seed({ id: 1, message: 'kestrel', authorUserId: 7 })
    await seed({ id: 2, message: 'kestrel', authorUserId: 8 })

    const results = await repo.search(query({ authorUserIds: [7] }), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('restricts by date, half-open', async () => {
    await seed({ id: 1, message: 'kestrel' })
    await db.execute(sql`update posts set created_at = '2026-01-01T00:00:00Z' where id = 1`)
    await seed({ id: 2, message: 'kestrel' })
    await db.execute(sql`update posts set created_at = '2026-06-01T00:00:00Z' where id = 2`)

    const boundary = new Date('2026-06-01T00:00:00Z')
    expect(
      (await repo.search(query({ postedBefore: boundary }), scope())).hits.map((h) => h.postId),
    ).toEqual([1])
    expect(
      (await repo.search(query({ postedAfter: boundary }), scope())).hits.map((h) => h.postId),
    ).toEqual([2])
  })
})

describe('reindexing', () => {
  it('indexes a bounded batch and resumes', async () => {
    for (let id = 1; id <= 5; id += 1) await seed({ id, message: 'kestrel' })
    await repo.invalidateIndex()

    const first = await repo.reindexChunk(0, 2)
    expect(first.indexed).toBe(2)
    expect(first.nextCursor).not.toBeNull()

    let cursor = first.nextCursor
    while (cursor !== null) {
      cursor = (await repo.reindexChunk(cursor, 2)).nextCursor
    }

    expect(await repo.indexProgress()).toEqual({ indexed: 5, pending: 0 })
  })

  it('only touches rows with no vector, so a re-run costs nothing', async () => {
    for (let id = 1; id <= 3; id += 1) await seed({ id, message: 'kestrel' })

    const again = await repo.reindexChunk(0, 10)
    expect(again.indexed).toBe(0)
  })

  it('makes a post findable that was not before', async () => {
    await seed({ id: 1, message: 'kestrel' })
    await repo.invalidateIndex()

    expect((await repo.search(query(), scope())).hits).toEqual([])

    await repo.reindexChunk(0, 10)
    expect((await repo.search(query(), scope())).hits).toHaveLength(1)
  })

  it('reports progress while a backfill is part-way through', async () => {
    for (let id = 1; id <= 4; id += 1) await seed({ id, message: 'kestrel' })
    await repo.invalidateIndex()
    await repo.reindexChunk(0, 1)

    expect(await repo.indexProgress()).toEqual({ indexed: 1, pending: 3 })
  })
})
