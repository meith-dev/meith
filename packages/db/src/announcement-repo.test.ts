/**
 * F71's announcements, against real Postgres.
 *
 * The read is where the risk is, and it has two halves that fail differently:
 *
 *  - **the window** — three conditions, and the one that gets forgotten is
 *    `ends_at`, because it is null on most rows and therefore right in every
 *    test written from the happy path;
 *  - **the permission filter** — in SQL, so an announcement on a forum a viewer
 *    cannot see never reaches the process rendering their page.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { PostgresAnnouncementRepository } from './announcement-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresAnnouncementRepository

const CATEGORY = 1
const PUBLIC_FORUM = 4
const PRIVATE_FORUM = 5
const NOW = new Date('2026-08-04T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAnnouncementRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from announcements`)
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
    { id: PUBLIC_FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: PRIVATE_FORUM, title: 'Staff', slug: 'staff', path: '1.5', depth: 1, parentId: CATEGORY },
  ])
})

async function add(input: {
  forumId?: number | null
  title?: string
  startsAt?: Date
  endsAt?: Date | null
  enabled?: boolean
}): Promise<number> {
  return repo.create({
    forumId: input.forumId ?? null,
    title: input.title ?? 'Notice',
    message: 'Read this.',
    startsAt: input.startsAt ?? new Date('2026-08-01T00:00:00Z'),
    endsAt: input.endsAt ?? null,
    enabled: input.enabled ?? true,
    authorUserId: 1,
  })
}

describe('writing', () => {
  /*
   * The name is captured by the insert rather than passed in, so a deleted
   * administrator's announcement still says who wrote it and no caller can put
   * the wrong name on a board-wide notice.
   */
  it('captures the author’s name at write time', async () => {
    const id = await add({})
    expect((await repo.find(id))?.authorUsername).toBe('ada')
  })

  it('survives its author being deleted, keeping the name and losing the id', async () => {
    const id = await add({})
    await db.execute(sql`delete from users where id = 1`)

    const row = await repo.find(id)
    expect(row?.authorUserId).toBeNull()
    expect(row?.authorUsername).toBe('ada')
  })

  it('refuses a window that finishes before it starts', async () => {
    await expect(
      add({
        startsAt: new Date('2026-08-10T00:00:00Z'),
        endsAt: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toThrow(/cannot finish before it starts/)
  })

  it('refuses an empty title or body', async () => {
    await expect(add({ title: '   ' })).rejects.toThrow(/needs a title/)
    await expect(
      repo.create({
        forumId: null,
        title: 'x',
        message: '  ',
        startsAt: NOW,
        endsAt: null,
        enabled: true,
        authorUserId: 1,
      }),
    ).rejects.toThrow(/needs something in it/)
  })

  /*
   * An administrator fixing a typo in somebody else's notice should not become
   * its author — the same rule a post edit follows.
   */
  it('does not rewrite the author on an edit', async () => {
    const id = await add({})
    await repo.update(id, {
      forumId: null,
      title: 'Fixed',
      message: 'Read this.',
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: null,
      enabled: true,
    })

    const row = await repo.find(id)
    expect(row?.title).toBe('Fixed')
    expect(row?.authorUsername).toBe('ada')
  })

  it('reports an edit to a row that is not there', async () => {
    await expect(
      repo.update(9999, {
        forumId: null,
        title: 'x',
        message: 'y',
        startsAt: NOW,
        endsAt: null,
        enabled: true,
      }),
    ).rejects.toThrow(/No such announcement/)
  })

  it('deletes cleanly — there is nothing hanging off one', async () => {
    const id = await add({})
    await repo.delete(id)
    expect(await repo.find(id)).toBeNull()
  })

  /* Cascades: an announcement about a forum that is gone is unreachable anyway. */
  it('goes with its forum', async () => {
    const id = await add({ forumId: PUBLIC_FORUM })
    await db.execute(sql`delete from forums where id = ${PUBLIC_FORUM}`)
    expect(await repo.find(id)).toBeNull()
  })
})

describe('the live window', () => {
  const visible = [PUBLIC_FORUM]

  it('shows one that has started and has no end', async () => {
    await add({})
    expect(await repo.live({ now: NOW, visibleForumIds: visible })).toHaveLength(1)
  })

  it('hides one that has not started', async () => {
    await add({ startsAt: new Date('2026-09-01T00:00:00Z') })
    expect(await repo.live({ now: NOW, visibleForumIds: visible })).toHaveLength(0)
  })

  /*
   * The condition that gets forgotten. It is null on most rows, so a predicate
   * missing it passes every test written from the happy path — and the symptom
   * is a notice that never goes away.
   */
  it('hides one whose end has passed', async () => {
    await add({ endsAt: new Date('2026-08-02T00:00:00Z') })
    expect(await repo.live({ now: NOW, visibleForumIds: visible })).toHaveLength(0)
  })

  it('still shows one whose end is in the future', async () => {
    await add({ endsAt: new Date('2026-09-01T00:00:00Z') })
    expect(await repo.live({ now: NOW, visibleForumIds: visible })).toHaveLength(1)
  })

  it('hides one that is switched off, whatever its dates say', async () => {
    await add({ enabled: false })
    expect(await repo.live({ now: NOW, visibleForumIds: visible })).toHaveLength(0)
  })

  it('lists them newest first', async () => {
    await add({ title: 'older', startsAt: new Date('2026-07-01T00:00:00Z') })
    await add({ title: 'newer', startsAt: new Date('2026-08-01T00:00:00Z') })

    const live = await repo.live({ now: NOW, visibleForumIds: visible })
    expect(live.map((row) => row.title)).toEqual(['newer', 'older'])
  })

  it('shows expired and switched-off rows to the panel', async () => {
    await add({ enabled: false })
    await add({ endsAt: new Date('2026-08-02T00:00:00Z') })
    expect(await repo.list()).toHaveLength(2)
  })
})

describe('the permission filter', () => {
  it('shows a board-wide announcement to everybody, visible set or not', async () => {
    await add({ forumId: null })
    expect(await repo.live({ now: NOW, visibleForumIds: [] })).toHaveLength(1)
  })

  /*
   * In SQL, not in the caller. An announcement on a private forum must not
   * reach the process rendering a guest's page at all.
   */
  it('withholds a forum’s announcement from somebody who cannot see the forum', async () => {
    await add({ forumId: PRIVATE_FORUM })

    const live = await repo.live({
      now: NOW,
      visibleForumIds: [PUBLIC_FORUM],
      scope: PRIVATE_FORUM,
    })
    expect(live).toHaveLength(0)
  })

  it('shows a forum’s announcement on that forum, to somebody who can see it', async () => {
    await add({ forumId: PUBLIC_FORUM, title: 'forum notice' })

    const live = await repo.live({
      now: NOW,
      visibleForumIds: [PUBLIC_FORUM],
      scope: PUBLIC_FORUM,
    })
    expect(live.map((row) => row.title)).toEqual(['forum notice'])
    expect(live[0]?.forumTitle).toBe('General')
    expect(live[0]?.forumSlug).toBe('general')
  })

  /*
   * A forum's announcement belongs on that forum. Showing it on the index would
   * put a notice about one corner of the board above all of it.
   */
  it('keeps a forum’s announcement off the index', async () => {
    await add({ forumId: PUBLIC_FORUM })
    expect(await repo.live({ now: NOW, visibleForumIds: [PUBLIC_FORUM] })).toHaveLength(0)
  })

  it('keeps it off a different forum’s page too', async () => {
    await add({ forumId: PUBLIC_FORUM })

    const live = await repo.live({
      now: NOW,
      visibleForumIds: [PUBLIC_FORUM, PRIVATE_FORUM],
      scope: PRIVATE_FORUM,
    })
    expect(live).toHaveLength(0)
  })

  /*
   * A board-wide notice has to reach a forum page: it is the page most people
   * arrive on, and one visible only on the index would be seen by almost nobody.
   */
  it('shows the board’s own announcement on a forum page as well', async () => {
    await add({ forumId: null, title: 'board' })
    await add({ forumId: PUBLIC_FORUM, title: 'forum' })

    const live = await repo.live({
      now: NOW,
      visibleForumIds: [PUBLIC_FORUM],
      scope: PUBLIC_FORUM,
    })
    expect(live.map((row) => row.title).sort()).toEqual(['board', 'forum'])
  })

  it('does not fall over on an empty visible set', async () => {
    await add({ forumId: PUBLIC_FORUM })
    expect(await repo.live({ now: NOW, visibleForumIds: [], scope: PUBLIC_FORUM })).toEqual([])
  })
})
