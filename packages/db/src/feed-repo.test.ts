/**
 * F76's reads, against real Postgres — and the leak suite the roadmap asks for
 * by name.
 *
 * F47's row has said since Phase 4 that feeds were one of two read paths its
 * guard had nothing to fire on. This is that path arriving, so the tests are
 * written as the guard's counterpart: **for every syndicated read, seed a
 * private community and a hidden thread, then assert that nothing about either
 * appears in the output.** Not "the ids are absent" — the titles, the slugs and
 * the bodies, because a leak through a feed is a leak of text.
 *
 * The second theme is the sitemap's paging. A crawler works through the chunks
 * over hours, so the boundary has to be stable while it does; the tests page
 * the whole board and assert every thread appears exactly once.
 */
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
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into communities (id, type, title, slug, path, last_post_at) values
      (${OPEN}, 'community', 'Open', 'open', '1', '2026-02-02T00:00:00Z'),
      (${SECRET}, 'community', 'Staff room', 'staff-room', '2', null)
  `)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ANN}, 'ann', 'ann', 'ann@example.test', 'ann@example.test', 'x', 'argon2id', 2)
  `)
})

async function seedThread(input: {
  readonly id: number
  readonly communityId?: number
  readonly title?: string
  readonly visibility?: string
  readonly lastPostAt?: string
  readonly firstPostId?: number | null
}): Promise<void> {
  await db.execute(sql`
    insert into threads (id, community_id, author_user_id, author_username, title, slug,
                         first_post_id, last_post_at, visibility)
    values (${input.id}, ${input.communityId ?? OPEN}, ${ANN}, 'ann',
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
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       message, visibility, created_at)
    values (${input.id}, ${input.threadId}, ${OPEN}, ${ANN}, 'ann',
            ${input.message ?? 'hello'}, ${input.visibility ?? 'visible'},
            ${input.createdAt ?? '2026-01-01T00:00:00Z'})
  `)
}

/** What a signed-out visitor sees: the open community, visible content only. */
const guest = (overrides: Partial<FeedScope> = {}): FeedScope => ({
  communityIds: [OPEN],
  content: PUBLIC_CONTENT,
  ...overrides,
})

const staff: FeedScope = {
  communityIds: [OPEN, SECRET],
  content: contentScopeFrom({ seesUnapproved: true, seesDeleted: true }),
}

describe('the leak suite', () => {
  beforeEach(async () => {
    /* Something private, in a community a guest cannot read. */
    await seedThread({
      id: 100,
      communityId: SECRET,
      title: SECRET_TITLE,
      lastPostAt: '2026-09-09T00:00:00Z',
      firstPostId: 1000,
    })
    await seedPost({ id: 1000, threadId: 100, message: SECRET_BODY })

    /* And something merely hidden, in a community a guest *can* read. */
    await seedThread({
      id: 101,
      communityId: OPEN,
      title: SECRET_TITLE,
      visibility: 'unapproved',
      lastPostAt: '2026-09-09T00:00:00Z',
      firstPostId: 1001,
    })
    await seedPost({ id: 1001, threadId: 101, message: SECRET_BODY })

    await seedThread({ id: 1, firstPostId: 10 })
    await seedPost({ id: 10, threadId: 1, message: 'ordinary business' })
  })

  it('keeps a private community out of the board feed, title and body alike', async () => {
    const serialised = JSON.stringify(await repo.recentThreads(50, guest()))

    expect(serialised).not.toContain(SECRET_TITLE)
    expect(serialised).not.toContain(SECRET_BODY)
    expect(serialised).not.toContain('Staff room')
    /* And it is not simply empty — that would pass every assertion above. */
    expect(serialised).toContain('ordinary business')
  })

  it('keeps a hidden thread in a readable community out of the board feed', async () => {
    /*
     * The second half, and the one a community-id filter alone would miss: thread
     * 101 is in the open community and would pass any permission check that stopped
     * at the community. Kills the mutant that drops the content scope.
     */
    const rows = await repo.recentThreads(50, guest())
    expect(rows.map((row) => row.threadId)).toEqual([1])
  })

  it('refuses a private community asked for by id', async () => {
    /*
     * The community feed takes an id from the URL. Asking for one outside the scope
     * must produce nothing — not that community's threads. Kills the mutant that
     * replaces the scope filter with the requested id instead of intersecting.
     */
    expect(await repo.recentThreads(50, guest(), SECRET)).toEqual([])
    /* Staff, who may read it, do get it — so the emptiness above is the scope. */
    expect((await repo.recentThreads(50, staff, SECRET)).map((r) => r.threadId)).toEqual([100])
  })

  it('refuses a private thread’s post feed asked for by id', async () => {
    expect(await repo.recentPosts(100, 50, guest())).toEqual([])
    expect((await repo.recentPosts(100, 50, staff)).map((r) => r.postId)).toEqual([1000])
  })

  it('refuses a hidden thread’s post feed even though its posts are visible', async () => {
    /*
     * Thread 101 is unapproved and sits in a community a guest may read, and its
     * post is visible in its own right. A feed that checked only the post — the
     * obvious reading of "list this thread's posts" — would publish the body of
     * a thread awaiting moderation, at a URL that is a bare id anybody can
     * guess. Kills the mutant that drops the thread's own visibility check.
     */
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

  it('keeps a private community and a hidden thread out of the sitemap', async () => {
    const communities = JSON.stringify(await repo.sitemapCommunities(guest()))
    expect(communities).not.toContain('staff-room')
    expect(communities).toContain('open')

    const threads = await repo.sitemapThreads(0, 100, guest())
    expect(threads.map((row) => row.threadId)).toEqual([1])
    expect(await repo.sitemapThreadCount(guest())).toBe(1)
  })

  it('answers nothing for a scope with no communities at all', async () => {
    /*
     * An empty community list is "nothing", never "no filter" — the same claim F74
     * makes first in its own suite, restated here because a feed is the one
     * surface where getting it wrong is served to the whole internet.
     */
    const empty = guest({ communityIds: [] })

    expect(await repo.recentThreads(50, empty)).toEqual([])
    expect(await repo.recentPosts(1, 50, empty)).toEqual([])
    expect(await repo.sitemapCommunities(empty)).toEqual([])
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
    /*
     * Two claims that are really one. An entry keyed on the thread must say
     * what the thread is *about* — taking the latest post would rewrite the
     * entry's meaning under a reader who has already seen it, every reply
     * changing history in their inbox.
     *
     * And it must be **one row**. The mutant that joins on `thread_id` rather
     * than on `first_post_id` gets the summary right by accident and returns a
     * row per post: a thread with forty replies fills the whole feed, and the
     * limit applies before anything could de-duplicate it. Asserting the count
     * is what separates the two.
     */
    await seedThread({ id: 1, firstPostId: 10 })
    await seedPost({ id: 10, threadId: 1, message: 'the question' })
    await seedPost({ id: 11, threadId: 1, message: 'the answer', createdAt: '2026-03-03T00:00:00Z' })

    const rows = await repo.recentThreads(50, guest())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.excerptSource).toBe('the question')
  })

  it('keeps a thread whose opening post was removed, without a summary', async () => {
    /*
     * A thread is still a thread. Dropping it would make a moderator deleting
     * one post remove the whole conversation from the feed — and an inner join
     * is how that happens by accident.
     */
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
    /*
     * The claim a crawler depends on. It works through the chunks over hours,
     * so every thread must appear exactly once across the whole walk — and by
     * id, because ordering by activity moves the boundary whenever somebody
     * posts, which makes the crawl skip threads and revisit others.
     */
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
    /*
     * The sitemap *index* names chunks by number before any of them exists, so
     * a chunk has to find its own start from that number. Skipping three
     * threads must land on the third id, and asking for none must start at the
     * beginning.
     */
    expect(await repo.sitemapBoundaryId(3, guest())).toBe(3)
    expect(await repo.sitemapBoundaryId(0, guest())).toBe(0)
  })

  it('says null — not zero — for a chunk past the end', async () => {
    /*
     * The distinction the sitemap index depends on. Zero means "start at the
     * beginning", so answering it for a chunk that does not exist would serve
     * the *first* chunk's threads at `/sitemap/threads-99.xml`: the same
     * content under a second URL, published to crawlers by the document whose
     * whole job is telling them what to crawl. Kills the mutant that collapses
     * the two.
     */
    expect(await repo.sitemapBoundaryId(99, guest())).toBeNull()
    expect(await repo.sitemapBoundaryId(1, guest())).toBe(1)
  })

  it('skips a hidden thread when counting positions', async () => {
    /*
     * The boundary and the chunk must agree about what exists, or a chunk
     * starts in the wrong place and the walk loses threads. Kills the mutant
     * that omits the scope from the boundary query.
     */
    await db.execute(sql`update threads set visibility = 'deleted' where id = 4`)

    expect(await repo.sitemapThreadCount(guest())).toBe(6)
    /* Positions 1..6 are ids 1,2,3,5,6,7 — so skipping 3 lands on 3, not 4. */
    expect(await repo.sitemapBoundaryId(3, guest())).toBe(3)
    expect(await repo.sitemapBoundaryId(4, guest())).toBe(5)
  })

  it('omits lastmod for a community nobody has posted in', async () => {
    /*
     * `lastmod` is a promise about when the page changed. Inventing "now" for a
     * dormant community teaches a crawler to keep re-fetching a page that never
     * moves — which is a cost paid forever for a field that could be absent.
     */
    const communities = await repo.sitemapCommunities({ ...guest(), communityIds: [OPEN, SECRET] })

    expect(communities.find((f) => f.communityId === OPEN)?.lastPostAt).not.toBeNull()
    expect(communities.find((f) => f.communityId === SECRET)?.lastPostAt).toBeNull()
  })
})
