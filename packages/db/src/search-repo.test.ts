/**
 * F72's search, against real Postgres.
 *
 * The claim the whole feature rests on: **the permission filter is in the
 * query.** Fetching a page and filtering it afterwards is wrong twice over —
 * twenty hits come back as three, and the cursor is computed from rows the
 * viewer cannot see, so paging skips and repeats. An empty scope must mean no
 * results, never all of them.
 *
 * After that: weighted ranking (a subject match beats a passing mention),
 * keyset paging on (rank, id) because ranks tie constantly, and a reindex that
 * resumes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, contentScopeFrom } from '@meith/core'
import type { SearchQuery, SearchScope } from '@meith/search'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import {
  PostgresSearchRepository,
  SEARCH_DOCUMENT_VERSION,
  indexedSubjectSql,
  searchVectorSql,
} from './search-repo'

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
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into communities (id, type, title, slug, path) values
      (${OPEN}, 'community', 'Open', 'open', '1'),
      (${PRIVATE}, 'community', 'Private', 'private', '2')
  `)
  /* Two members, because several tests turn on who wrote a post. */
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
  readonly communityId?: number
  readonly threadId?: number
  readonly title?: string
  readonly subject?: string | null
  readonly message: string
  readonly visibility?: string
  readonly authorUserId?: number | null
  /** Defaults to true: most fixtures here are one post standing for a thread. */
  readonly isFirstPost?: boolean
}

/**
 * Insert one post and index it exactly as the board would.
 *
 * The vector is written by the **same expression the backfill uses** rather
 * than by a second copy of the rule spelled out here. A fixture that built its
 * own document is a fixture that keeps passing after the real one changes — and
 * that is not hypothetical: this file used to index `post.subject` directly,
 * which is the mistake the production write path was making, so every test here
 * agreed with a search that could not find a thread by its title.
 */
async function seed(post: SeedPost): Promise<void> {
  const communityId = post.communityId ?? OPEN
  const threadId = post.threadId ?? post.id

  await db.execute(sql`
    insert into threads (id, community_id, author_username, title, slug, visibility)
    values (${threadId}, ${communityId}, 'ann', ${post.title ?? 'A thread'},
            ${`t-${threadId}`}, 'visible')
    on conflict (id) do nothing
  `)

  await db.execute(sql`
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       subject, message, visibility, is_first_post)
    values (${post.id}, ${threadId}, ${communityId}, ${post.authorUserId ?? null}, 'ann',
            ${post.subject ?? null}, ${post.message}, ${post.visibility ?? 'visible'},
            ${post.isFirstPost ?? true})
  `)

  await index(post.id)
}

/** Write one post's document, the way `reindexChunk` writes every post's. */
async function index(postId: number): Promise<void> {
  await db.execute(sql`
    update posts p
       set search_vector = ${searchVectorSql(indexedSubjectSql(sql`p`), sql`p.message`)},
           search_version = ${SEARCH_DOCUMENT_VERSION}
     where p.id = ${postId}
  `)
}

const STAFF_CONTENT = contentScopeFrom({ seesUnapproved: true, seesDeleted: true })

const scope = (overrides: Partial<SearchScope> = {}): SearchScope => ({
  communityIds: [OPEN, PRIVATE],
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
    /*
     * The claim. A provider that omitted the community clause for an empty list
     * would search the whole board — a permission failure turning into a full
     * disclosure. Kills the mutant that treats an empty scope as unrestricted.
     */
    await seed({ id: 1, message: 'a kestrel flew past' })

    const results = await repo.search(query(), scope({ communityIds: [] }))
    expect(results.hits).toEqual([])
  })

  it('returns only hits from communities the viewer may see', async () => {
    await seed({ id: 1, communityId: OPEN, message: 'kestrel in the open community' })
    await seed({ id: 2, communityId: PRIVATE, message: 'kestrel in the private community' })

    const results = await repo.search(query(), scope({ communityIds: [OPEN] }))
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('lets a query narrow the scope but never widen it', async () => {
    /*
     * `communityIds` on the query is a member's filter, not an authorisation. A
     * provider that used it in place of the scope would let anybody search any
     * community by naming it. Kills the mutant that replaces rather than intersects.
     */
    await seed({ id: 1, communityId: OPEN, message: 'kestrel here' })
    await seed({ id: 2, communityId: PRIVATE, message: 'kestrel there' })

    const results = await repo.search(
      query({ communityIds: [PRIVATE] }),
      scope({ communityIds: [OPEN] }),
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
    /*
     * Both sides of the join are filtered. Checking only the post would make
     * search the way to read threads that were taken down — the post is still
     * `visible`, it is the thread around it that is not.
     */
    await seed({ id: 1, message: 'kestrel in a removed thread' })
    await db.execute(sql`update threads set visibility = 'deleted' where id = 1`)

    expect((await repo.search(query(), scope())).hits).toEqual([])
  })

  it('shows staff what their scope admits', async () => {
    /*
     * The scope decides, not the provider — which is why this passes a real
     * `ContentScope` rather than a "staff?" flag. Kills the mutant that ignores
     * the scope and filters to `visible` regardless.
     */
    await seed({ id: 1, message: 'kestrel deleted', visibility: 'deleted' })

    const results = await repo.search(query(), scope({ content: STAFF_CONTENT }))
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })
})

describe('the indexed document', () => {
  it('finds a thread by its title', async () => {
    /*
     * **The bug this whole change is about.** A thread's subject is
     * `threads.title`; `posts.subject` is null on everything this board writes.
     * Indexing the column alone left the weight-A half of every document empty,
     * so the most ordinary search anybody runs on a community — the title of the
     * thread they are trying to find again — matched nothing at all, on a board
     * where search otherwise looked like it was working.
     *
     * Kills the mutant that indexes `p.subject` alone.
     */
    await seed({ id: 1, title: 'Kestrel sightings by the estuary', message: 'no bird here' })

    const results = await repo.search(query(), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('answers a title search with the thread once, not with every reply in it', async () => {
    /*
     * Why the title is the opening post's document and not every post's. A
     * board that folded it into all of them would answer one thread with forty
     * identical-looking hits, and the reader still only wants the thread. Kills
     * the mutant that drops the `is_first_post` test.
     */
    await seed({ id: 1, threadId: 1, title: 'Kestrel sightings', message: 'opening post' })
    await seed({ id: 2, threadId: 1, message: 'a reply that says nothing', isFirstPost: false })

    const results = await repo.search(query(), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('still indexes a post’s own subject, which is where an import puts one', async () => {
    /*
     * `posts.subject` is not dead: MyBB gave every post one and the importer
     * carries them across. Kills the mutant that replaces the column with the
     * title outright rather than falling back to it.
     */
    await seed({
      id: 1,
      title: 'Something else entirely',
      subject: 'Kestrel',
      message: 'no bird here',
      isFirstPost: false,
    })

    expect((await repo.search(query(), scope())).hits.map((hit) => hit.postId)).toEqual([1])
  })

  it('weights the title above a passing mention in a longer post', async () => {
    /*
     * The weighting was always the point; until the title was indexed there was
     * nothing in the weight-A slot for it to apply to.
     */
    await seed({ id: 1, threadId: 1, title: 'Kestrel', message: 'short note' })
    await seed({
      id: 2,
      threadId: 2,
      title: 'Something else',
      message: `a long post that mentions a kestrel once ${'and continues '.repeat(40)}`,
    })

    const results = await repo.search(query(), scope())
    expect(results.hits.map((hit) => hit.postId)).toEqual([1, 2])
  })
})

describe('matching and ranking', () => {
  it('stems, so a search for one form finds the other', async () => {
    await seed({ id: 1, message: 'the birds were running quickly' })

    expect((await repo.search(query({ terms: 'run' }), scope())).hits).toHaveLength(1)
    expect((await repo.search(query({ terms: 'bird' }), scope())).hits).toHaveLength(1)
  })

  it('ranks a subject match above a passing mention', async () => {
    /*
     * Weighted for exactly this: without weights a two-word subject loses to a
     * long post that happens to say the word once. Kills the mutant that drops
     * `setweight`.
     */
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
    /*
     * `websearch_to_tsquery` accepts arbitrary text; `to_tsquery` would throw a
     * syntax error at the member. Kills the mutant that swaps them.
     */
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
    /*
     * Identical posts score identically, so every row here is a tie. Paging on
     * rank alone would skip or repeat across the boundary; the id tie-break is
     * what makes the order total. Kills the mutant that drops it.
     */
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

  it('only touches rows that need it, so a re-run costs nothing', async () => {
    /*
     * The set shrinks monotonically, which is what makes an interrupted run
     * resumable from anywhere and a repeated run harmless. Kills the mutant
     * that reindexes every row in range.
     */
    for (let id = 1; id <= 3; id += 1) await seed({ id, message: 'kestrel' })

    const again = await repo.reindexChunk(0, 10)
    expect(again.indexed).toBe(0)
  })

  it('picks up a row indexed under an older definition of the document', async () => {
    /*
     * How a change to what the document holds reaches a board that already has
     * one. The row keeps a *valid* vector throughout — it is merely built to
     * the old rule — so `search_vector is null` cannot find it, and a board
     * upgrading would have gone on answering the old way for ever. Kills the
     * mutant that drops the version half of the predicate.
     */
    await seed({ id: 1, title: 'Kestrel sightings', message: 'no bird here' })
    await db.execute(sql`update posts set search_version = 0 where id = 1`)

    expect(await repo.indexProgress()).toEqual({ indexed: 0, pending: 1 })

    const run = await repo.reindexChunk(0, 10)
    expect(run.indexed).toBe(1)
    expect(await repo.indexProgress()).toEqual({ indexed: 1, pending: 0 })
  })

  it('leaves a stale row findable while it waits its turn', async () => {
    /*
     * The reason this is a version stamp rather than a call to
     * `invalidateIndex()`. Nulling every vector would also mark the board as
     * needing a rebuild — and would take search away from all of it until the
     * rebuild finished, which is a strange way to ship a fix for search.
     */
    await seed({ id: 1, message: 'a kestrel flew past' })
    await db.execute(sql`update posts set search_version = 0 where id = 1`)

    expect((await repo.search(query(), scope())).hits).toHaveLength(1)
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
