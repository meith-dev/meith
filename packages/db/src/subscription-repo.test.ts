/**
 * F56 — subscriptions against real Postgres.
 *
 * Four properties can only be proved here, and every one of them is about what
 * a member is *not* told:
 *
 *  - a held or soft-deleted post never reaches a digest, because the pending
 *    read goes through F47's `visibleIn` like every other read on the board;
 *  - a community the member can no longer see is filtered out, per member, from
 *    the visible set the caller resolves;
 *  - nobody is told about their own post;
 *  - the watermark only ever moves forward, so a run that raced another one
 *    cannot re-deliver a week of posts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresSubscriptionRepository } from './subscription-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresSubscriptionRepository

const IVAN = 1
const MOD = 2

const COMMUNITY = 10
const OTHER_COMMUNITY = 11
const THREAD = 20
const OTHER_THREAD = 21

const AT = new Date('2026-07-31T12:00:00Z')
const ALL_COMMUNITIES = [COMMUNITY, OTHER_COMMUNITY]

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresSubscriptionRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from digest_runs`)
  await db.execute(sql`delete from thread_subscriptions`)
  await db.execute(sql`delete from community_subscriptions`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${IVAN}, 'ivan', 'ivan', 'ivan@example.test', 'ivan@example.test',
            'x', 'argon2id', 2),
           (${MOD}, 'mod', 'mod', 'mod@example.test', 'mod@example.test',
            'x', 'argon2id', 2)
  `)

  await db.execute(sql`
    insert into communities (id, type, title, slug, path, display_order)
    values (${COMMUNITY}, 'community', 'General', 'general', '10', 1),
           (${OTHER_COMMUNITY}, 'community', 'Private', 'private', '11', 2)
  `)

  await db.execute(sql`
    insert into threads (id, community_id, title, slug, author_user_id, author_username,
                         visibility, created_at, last_post_at)
    values (${THREAD}, ${COMMUNITY}, 'A thread', 'a-thread', ${IVAN}, 'ivan',
            'visible', ${AT}, ${AT}),
           (${OTHER_THREAD}, ${OTHER_COMMUNITY}, 'Elsewhere', 'elsewhere', ${IVAN}, 'ivan',
            'visible', ${AT}, ${AT})
  `)
})

/** Add a post, and return its id. */
async function addPost(
  over: {
    id: number
    threadId?: number
    authorId?: number | null
    visibility?: string
  },
): Promise<number> {
  await db.execute(sql`
    insert into posts (id, thread_id, community_id, author_user_id, author_username,
                       message, visibility, created_at)
    select ${over.id}, t.id, t.community_id, ${over.authorId ?? MOD}, 'mod',
           'hello', ${over.visibility ?? 'visible'}, ${AT}
      from threads t where t.id = ${over.threadId ?? THREAD}
  `)
  return over.id
}

async function storedMode(target: 'thread' | 'community', userId = IVAN): Promise<string | null> {
  const table = target === 'thread' ? sql`thread_subscriptions` : sql`community_subscriptions`
  const rows = resultRows(
    await db.execute(sql`select mode from ${table} where user_id = ${userId}`),
  ) as Array<{ mode: string }>
  return rows[0]?.mode ?? null
}

async function watermark(target: 'thread' | 'community', userId = IVAN): Promise<number> {
  const table = target === 'thread' ? sql`thread_subscriptions` : sql`community_subscriptions`
  const rows = resultRows(
    await db.execute(
      sql`select last_notified_post_id from ${table} where user_id = ${userId}`,
    ),
  ) as Array<{ last_notified_post_id: number }>
  return Number(rows[0]?.last_notified_post_id ?? -1)
}

describe('subscribing', () => {
  it('follows a thread from its current last post', async () => {
    await addPost({ id: 100 })
    await db.execute(sql`update threads set last_post_id = 100 where id = ${THREAD}`)

    expect(
      await repo.subscribe({
        userId: IVAN,
        target: 'thread',
        targetId: THREAD,
        mode: 'instant',
        at: AT,
      }),
    ).toBe(true)

    /*
     * The whole point of seeding the watermark: following a busy thread must
     * not produce a notification about everything already in it.
     */
    expect(await watermark('thread')).toBe(100)
  })

  it('changes the cadence without touching the watermark', async () => {
    await addPost({ id: 100 })
    await db.execute(sql`update threads set last_post_id = 100 where id = ${THREAD}`)
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })

    /*
     * A reply arrives *and the thread's pointer moves with it* — which is what
     * makes this test able to tell the two implementations apart. With only the
     * post inserted, `excluded.last_notified_post_id` would still be 100 and a
     * reset would be indistinguishable from leaving it alone.
     */
    await addPost({ id: 101 })
    await db.execute(sql`update threads set last_post_id = 101 where id = ${THREAD}`)

    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'weekly', at: AT })

    expect(await storedMode('thread')).toBe('weekly')
    /*
     * Still 100. Resetting here would mark post 101 as told about because
     * somebody changed how often they want to hear — a notification lost to a
     * settings change, which is the invisible kind of loss.
     */
    expect(await watermark('thread')).toBe(100)

    /* And the post is still reported, which is the consequence that matters. */
    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'weekly',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })
    expect(pending.posts.map((p) => p.postId)).toEqual([101])
  })

  it('refuses a thread that does not exist rather than writing a dangling row', async () => {
    expect(
      await repo.subscribe({
        userId: IVAN,
        target: 'thread',
        targetId: 9_999,
        mode: 'instant',
        at: AT,
      }),
    ).toBe(false)
  })

  it('follows a community the same way', async () => {
    await addPost({ id: 100 })
    await db.execute(sql`update communities set last_post_id = 100 where id = ${COMMUNITY}`)

    await repo.subscribe({ userId: IVAN, target: 'community', targetId: COMMUNITY, mode: 'daily', at: AT })

    expect(await storedMode('community')).toBe('daily')
    expect(await watermark('community')).toBe(100)
  })

  it('unsubscribes, and says whether there was anything to remove', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })

    expect(await repo.unsubscribe({ userId: IVAN, target: 'thread', targetId: THREAD })).toBe(true)
    expect(await repo.unsubscribe({ userId: IVAN, target: 'thread', targetId: THREAD })).toBe(false)
    expect(await repo.modeFor(IVAN, 'thread', THREAD)).toBeNull()
  })

  it('keeps one member’s subscription out of another’s', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    expect(await repo.modeFor(MOD, 'thread', THREAD)).toBeNull()
  })
})

describe('what is pending', () => {
  beforeEach(async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
  })

  it('finds posts newer than the watermark', async () => {
    await addPost({ id: 100 })
    await addPost({ id: 101 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts.map((p) => p.postId)).toEqual([100, 101])
    expect(pending.watermarks).toEqual([
      { target: 'thread', targetId: THREAD, lastPostId: 101 },
    ])
  })

  it('never includes the subscriber’s own posts', async () => {
    await addPost({ id: 100, authorId: IVAN })
    await addPost({ id: 101, authorId: MOD })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts.map((p) => p.postId)).toEqual([101])
  })

  it('never includes a held or deleted post', async () => {
    await addPost({ id: 100, visibility: 'unapproved' })
    await addPost({ id: 101, visibility: 'deleted' })
    await addPost({ id: 102 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    /* A digest is not a moderator surface, whoever is reading it. */
    expect(pending.posts.map((p) => p.postId)).toEqual([102])
  })

  it('never includes a post in a thread that has been removed', async () => {
    await addPost({ id: 100 })
    await db.execute(sql`update threads set visibility = 'deleted' where id = ${THREAD}`)

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts).toEqual([])
  })

  it('drops a community the member can no longer see', async () => {
    await addPost({ id: 100 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      /* The community this thread lives in is not in the visible set. */
      visibleCommunityIds: [OTHER_COMMUNITY],
      limit: 50,
    })

    expect(pending.posts).toEqual([])
  })

  it('reads only the cadence it was asked for', async () => {
    await addPost({ id: 100 })

    const daily = await repo.pendingFor({
      userId: IVAN,
      mode: 'daily',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(daily.posts).toEqual([])
  })

  it('carries the thread title and the author for the digest', async () => {
    await addPost({ id: 100 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts[0]).toMatchObject({
      threadTitle: 'A thread',
      threadSlug: 'a-thread',
      authorUsername: 'mod',
      communityId: COMMUNITY,
    })
  })

  it('survives an author whose account has gone', async () => {
    await addPost({ id: 100 })
    await db.execute(sql`update posts set author_user_id = null where id = 100`)

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts[0]?.authorUsername).toBeNull()
  })
})

describe('a community subscription', () => {
  beforeEach(async () => {
    await repo.subscribe({ userId: IVAN, target: 'community', targetId: COMMUNITY, mode: 'instant', at: AT })
  })

  it('finds posts in every thread beneath it', async () => {
    await db.execute(sql`
      insert into threads (id, community_id, title, slug, author_user_id, author_username,
                           visibility, created_at, last_post_at)
      values (22, ${COMMUNITY}, 'Second', 'second', ${MOD}, 'mod', 'visible', ${AT}, ${AT})
    `)
    await addPost({ id: 100, threadId: THREAD })
    await addPost({ id: 101, threadId: 22 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts.map((p) => p.postId).sort()).toEqual([100, 101])
  })

  it('reports one post once when both a thread and its community are followed', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await addPost({ id: 100 })

    const pending = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(pending.posts.map((p) => p.postId)).toEqual([100])
    /* Both watermarks still move, so neither subscription re-delivers it. */
    expect(pending.watermarks).toHaveLength(2)
  })
})

describe('watermarks', () => {
  beforeEach(async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
  })

  it('advance, and stop the same post being reported twice', async () => {
    await addPost({ id: 100 })

    const first = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })
    await repo.advanceWatermarks({ userId: IVAN, watermarks: first.watermarks })

    const second = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(second.posts).toEqual([])
  })

  it('never move backwards', async () => {
    await addPost({ id: 100 })
    await addPost({ id: 101 })

    await repo.advanceWatermarks({
      userId: IVAN,
      watermarks: [{ target: 'thread', targetId: THREAD, lastPostId: 101 }],
    })
    /* A slower run finishing late must not re-deliver 101. */
    await repo.advanceWatermarks({
      userId: IVAN,
      watermarks: [{ target: 'thread', targetId: THREAD, lastPostId: 100 }],
    })

    expect(await watermark('thread')).toBe(101)
  })

  it('resume from where a capped run stopped', async () => {
    for (const id of [100, 101, 102]) await addPost({ id })

    const capped = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 2,
    })
    await repo.advanceWatermarks({ userId: IVAN, watermarks: capped.watermarks })

    const rest = await repo.pendingFor({
      userId: IVAN,
      mode: 'instant',
      visibleCommunityIds: ALL_COMMUNITIES,
      limit: 50,
    })

    expect(capped.posts.map((p) => p.postId)).toEqual([100, 101])
    expect(rest.posts.map((p) => p.postId)).toEqual([102])
  })
})

describe('who is due', () => {
  it('lists members with something outstanding on that cadence', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await addPost({ id: 100 })

    expect(await repo.usersWithPending({ mode: 'instant', dueBefore: null, limit: 10 })).toEqual([
      IVAN,
    ])
    expect(await repo.usersWithPending({ mode: 'daily', dueBefore: null, limit: 10 })).toEqual([])
  })

  it('lists nobody when the only pending post is their own', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await addPost({ id: 100, authorId: IVAN })

    expect(await repo.usersWithPending({ mode: 'instant', dueBefore: null, limit: 10 })).toEqual([])
  })

  it('holds a digest back until its interval has passed', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'daily', at: AT })
    await addPost({ id: 100 })

    const dueBefore = new Date(AT.getTime() - 24 * 3_600_000)

    /* Never sent: due immediately, which is what makes a new subscriber's
     * first digest arrive rather than never. */
    expect(await repo.usersWithPending({ mode: 'daily', dueBefore, limit: 10 })).toEqual([IVAN])

    await repo.recordDigestRun({ userId: IVAN, cadence: 'daily', at: AT })
    expect(await repo.usersWithPending({ mode: 'daily', dueBefore, limit: 10 })).toEqual([])

    /* A day later, due again. */
    const tomorrow = new Date(AT.getTime() + 1)
    expect(
      await repo.usersWithPending({ mode: 'daily', dueBefore: tomorrow, limit: 10 }),
    ).toEqual([IVAN])
  })

  it('keeps the two cadences on separate clocks', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'daily', at: AT })
    await repo.subscribe({ userId: IVAN, target: 'community', targetId: COMMUNITY, mode: 'weekly', at: AT })
    await addPost({ id: 100 })

    const dueBefore = new Date(AT.getTime() - 3_600_000)
    await repo.recordDigestRun({ userId: IVAN, cadence: 'daily', at: AT })

    expect(await repo.usersWithPending({ mode: 'daily', dueBefore, limit: 10 })).toEqual([])
    /* The weekly clock is untouched by the daily one. */
    expect(await repo.usersWithPending({ mode: 'weekly', dueBefore, limit: 10 })).toEqual([IVAN])
  })

  it('is bounded by the limit it is given', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await repo.subscribe({ userId: MOD, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await addPost({ id: 100, authorId: null })

    expect(
      await repo.usersWithPending({ mode: 'instant', dueBefore: null, limit: 1 }),
    ).toHaveLength(1)
  })
})

describe('the management screen', () => {
  it('lists both kinds with their pending counts', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await repo.subscribe({ userId: IVAN, target: 'community', targetId: OTHER_COMMUNITY, mode: 'weekly', at: AT })
    await addPost({ id: 100 })

    const rows = await repo.listFor(IVAN, { visibleCommunityIds: ALL_COMMUNITIES, limit: 50 })

    expect(rows).toHaveLength(2)
    const thread = rows.find((r) => r.target === 'thread')
    expect(thread).toMatchObject({ title: 'A thread', mode: 'instant', pending: 1 })
    expect(thread?.href).toBe(`/thread/${THREAD}-a-thread`)

    const community = rows.find((r) => r.target === 'community')
    expect(community).toMatchObject({ title: 'Private', mode: 'weekly', pending: 0 })
  })

  it('hides a subscription whose community the member may no longer see', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: OTHER_THREAD, mode: 'instant', at: AT })

    const rows = await repo.listFor(IVAN, { visibleCommunityIds: [COMMUNITY], limit: 50 })

    /*
     * Dropped, not greyed out: a row that names a now-private community back at
     * somebody is a disclosure, and the subscription still works if access
     * returns.
     */
    expect(rows).toEqual([])
  })

  it('hides a subscription to a thread that has been removed', async () => {
    await repo.subscribe({ userId: IVAN, target: 'thread', targetId: THREAD, mode: 'instant', at: AT })
    await db.execute(sql`update threads set visibility = 'deleted' where id = ${THREAD}`)

    expect(await repo.listFor(IVAN, { visibleCommunityIds: ALL_COMMUNITIES, limit: 50 })).toEqual([])
  })
})
