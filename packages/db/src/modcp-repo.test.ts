import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresModCpRepository } from './modcp-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresModCpRepository

const MINE = 4
const THEIRS = 5

const MOD = 1
const OTHER_MOD = 2
const IVAN = 3
const AT = new Date('2026-07-31T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresModCpRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from reports`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [MOD, 'mod'],
      [OTHER_MOD, 'othermod'],
      [IVAN, 'ivan'],
    ].map(([id, name]) => ({
      id: id as number,
      username: name as string,
      usernameLower: name as string,
      email: `${String(name)}@example.test`,
      emailLower: `${String(name)}@example.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: 2,
    })),
  )
  await db.insert(forums).values([
    { id: MINE, title: 'Mine', slug: 'mine', path: '4', depth: 0 },
    { id: THEIRS, title: 'Theirs', slug: 'theirs', path: '5', depth: 0 },
  ])
})

async function logRow(
  action: string,
  detail: Record<string, unknown>,
  userId: number = MOD,
): Promise<void> {
  await db.execute(sql`
    insert into admin_log (user_id, action, detail, created_at)
    values (${userId}, ${action}, ${JSON.stringify(detail)}::jsonb, now())
  `)
}

describe('the moderator log', () => {
  it('shows an entry in a forum this actor moderates', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: MINE }, OTHER_MOD)

    const page = await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })

    expect(page.entries).toHaveLength(1)
    expect(page.entries[0]).toMatchObject({
      action: 'thread.lock',
      forumId: MINE,
      forumTitle: 'Mine',
      actorUsername: 'othermod',
    })
  })

  it('hides an entry in a forum this actor does not moderate', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: THEIRS }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual([])
  })

  it('shows this actor"s own entry wherever it happened', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: THEIRS }, MOD)

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('never shows an administrative entry, whoever wrote it', async () => {
    await logRow('settings.update', { forumId: MINE }, MOD)
    await logRow('permission.bypass', { forumId: MINE }, MOD)
    await logRow('user.promote', { userId: IVAN }, MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual([])
  })

  it('shows a move to both ends" moderators', async () => {
    await logRow(
      'thread.move',
      { threadId: 7, fromForumId: THEIRS, toForumId: MINE, forumIds: [THEIRS, MINE] },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect(
      (await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('names both ends of a move, as forums rather than threads', async () => {
    await logRow(
      'thread.move',
      { threadId: 7, fromForumId: THEIRS, toForumId: MINE, forumIds: [THEIRS, MINE] },
      OTHER_MOD,
    )

    const entry = (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries[0]!
    expect(entry.forumTitle).toBe('Mine')
    expect(entry.detail).toContainEqual({ label: 'From forum', value: String(THEIRS) })
    expect(entry.detail).toContainEqual({ label: 'To forum', value: String(MINE) })
  })

  it('shows a split to the forum it happened in, and to nobody whose forum shares an id with the thread', async () => {
    await logRow(
      'thread.split',
      { threadId: THEIRS, newThreadId: 9, forumId: MINE, forumIds: [MINE], posts: 2 },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect((await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries).toEqual(
      [],
    )
  })

  it('shows a merge to both forums, and not to one that merely shares an id with a thread', async () => {
    await logRow(
      'thread.merge',
      {
        threadId: THEIRS,
        targetThreadId: MINE,
        fromForumId: MINE,
        toForumId: MINE,
        forumIds: [MINE],
        posts: 3,
      },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect((await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries).toEqual(
      [],
    )
  })

  it('shows an approval to everyone who moderates the forum it happened in', async () => {
    await logRow(
      'moderation.approve',
      { threadIds: [7], postIds: [], forumId: MINE, forumIds: [MINE], applied: 1 },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('shows a lock to a colleague moderating the same forum', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: MINE, forumIds: [MINE] }, OTHER_MOD)

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('spreads an approval that spanned two forums to both sets of moderators', async () => {
    await logRow(
      'moderation.approve',
      { threadIds: [7, 8], postIds: [], forumIds: [MINE, THEIRS], applied: 2 },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect(
      (await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('leaves an old split row with the actor who wrote it rather than guessing a forum', async () => {
    await logRow('thread.split', { from: THEIRS, to: 9, posts: 2 }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual([])
    expect((await repo.log({ forumIds: [THEIRS], actorUserId: MOD, limit: 10 })).entries).toEqual(
      [],
    )
    expect(
      (await repo.log({ forumIds: [], actorUserId: OTHER_MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('renders no forum for an old split row, and no forum-shaped detail either', async () => {
    await logRow('thread.split', { from: THEIRS, to: 9, posts: 2 }, MOD)

    const entry = (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries[0]!
    expect(entry.forumId).toBeNull()
    expect(entry.forumTitle).toBeNull()
    expect(entry.detail.map((d) => d.label)).toEqual(['Posts affected'])
  })

  it('still trusts the honest forum key an older row carried', async () => {
    await logRow('thread.delete', { threadId: 7, forumId: MINE, posts: 4 }, OTHER_MOD)

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('shows a copy to the moderators of the forum it came from and the one it landed in', async () => {
    await logRow(
      'thread.copy',
      {
        threadId: 7,
        fromForumId: THEIRS,
        toForumId: MINE,
        forumIds: [THEIRS, MINE],
        newThreadId: 9,
        posts: 2,
      },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect(
      (await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('shows a closed report to everyone who moderates the forum it was filed in', async () => {
    await logRow('report.resolve', { reportId: 3, forumId: MINE, forumIds: [MINE] }, OTHER_MOD)

    const entry = (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries[0]!
    expect(entry.action).toBe('report.resolve')
    expect(entry.forumTitle).toBe('Mine')
    expect(entry.detail).toContainEqual({ label: 'Report', value: '3' })
  })

  it('shows a single-post deletion to the forum the post was in', async () => {
    await logRow(
      'post.delete',
      { postId: 11, threadId: 7, forumId: MINE, forumIds: [MINE] },
      OTHER_MOD,
    )

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
    expect((await repo.log({ forumIds: [THEIRS], actorUserId: IVAN, limit: 10 })).entries).toEqual(
      [],
    )
  })

  it('shows a signature lock to the moderator who set it and to nobody else', async () => {
    await logRow('signature.lock', { userId: IVAN }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual([])
    const own = await repo.log({ forumIds: [], actorUserId: OTHER_MOD, limit: 10 })
    expect(own.entries[0]).toMatchObject({ action: 'signature.lock' })
    expect(own.entries[0]!.detail).toContainEqual({ label: 'Member', value: String(IVAN) })
  })

  it('shows a forum-less entry only to the moderator who wrote it', async () => {
    await logRow('warning.issue', { userId: IVAN, points: 2 }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual([])
    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: OTHER_MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('renders only the detail keys it has names for', async () => {
    await logRow('inline.delete', {
      threadIds: [1, 2],
      applied: 2,
      internalCursor: 'abc',
    })

    const entry = (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries[0]!
    const labels = entry.detail.map((d) => d.label)
    expect(labels).toContain('Threads')
    expect(labels).toContain('Applied to')
    expect(entry.detail.map((d) => d.value)).not.toContain('abc')
  })

  it('is newest first and keyset-paged', async () => {
    for (let i = 0; i < 4; i += 1) {
      await logRow('thread.lock', { threadId: i, forumId: MINE })
    }

    const first = await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 2 })
    expect(first.entries).toHaveLength(2)
    expect(first.nextCursor).toBeDefined()

    const second = await repo.log({
      forumIds: [MINE],
      actorUserId: MOD,
      limit: 2,
      after: first.nextCursor!,
    })
    expect(second.entries).toHaveLength(2)
    expect(second.nextCursor).toBeUndefined()
    const ids = [...first.entries, ...second.entries].map((e) => e.id)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('the dashboard workload', () => {
  async function seedHeldThread(forumId: number): Promise<void> {
    await db.execute(sql`
      insert into threads (forum_id, title, slug, author_user_id, author_username, visibility)
      values (${forumId}, 'Held', 'held', ${IVAN}, 'ivan', 'unapproved')
    `)
  }

  it('counts held threads and open reports per forum, in one query', async () => {
    await seedHeldThread(MINE)
    await seedHeldThread(MINE)
    await seedHeldThread(THEIRS)
    await db.execute(sql`
      insert into reports (target_kind, target_id, forum_id, reporter_user_id, reason, status)
      values ('post', 1, ${MINE}, ${IVAN}, 'spam', 'open')
    `)

    const workload = await repo.workload([MINE, THEIRS])

    expect(workload.get(MINE)).toEqual({ pending: 2, openReports: 1 })
    expect(workload.get(THEIRS)).toEqual({ pending: 1, openReports: 0 })
  })

  it('ignores a resolved report', async () => {
    await db.execute(sql`
      insert into reports (target_kind, target_id, forum_id, reporter_user_id, reason, status)
      values ('post', 1, ${MINE}, ${IVAN}, 'spam', 'resolved')
    `)
    expect(await repo.workload([MINE])).toEqual(new Map([[MINE, { pending: 0, openReports: 0 }]]))
  })

  it('asks nothing at all for an empty forum list', async () => {
    expect(await repo.workload([])).toEqual(new Map())
  })
})

describe('the address lookup', () => {
  beforeEach(async () => {
    await db.execute(sql`
      update users set registration_ip_prefix = '203.0.113.', last_ip_prefix = '203.0.113.'
       where id = ${IVAN}
    `)
  })

  it('finds an account sharing a stored range', async () => {
    await db.execute(sql`
      update users set last_ip_prefix = '203.0.113.' where id = ${OTHER_MOD}
    `)

    const matches = await repo.ipMatches(IVAN, 10)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ userId: OTHER_MOD, matchedOn: 'last_visit' })
  })

  it('says when an account matches on both recorded ranges', async () => {
    await db.execute(sql`
      update users set registration_ip_prefix = '203.0.113.', last_ip_prefix = '203.0.113.'
       where id = ${OTHER_MOD}
    `)
    expect((await repo.ipMatches(IVAN, 10))[0]).toMatchObject({ matchedOn: 'both' })
  })

  it('does not treat two unrecorded addresses as a match', async () => {
    await db.execute(sql`
      update users set registration_ip_prefix = null, last_ip_prefix = null
       where id in (${IVAN}, ${OTHER_MOD})
    `)
    expect(await repo.ipMatches(IVAN, 10)).toEqual([])
  })

  it('never includes the member being looked up', async () => {
    expect((await repo.ipMatches(IVAN, 10)).map((m) => m.userId)).not.toContain(IVAN)
  })

  it('excludes a deleted account', async () => {
    await db.execute(sql`
      update users set last_ip_prefix = '203.0.113.', state = 'deleted' where id = ${OTHER_MOD}
    `)
    expect(await repo.ipMatches(IVAN, 10)).toEqual([])
  })

  it('is bounded by the limit it is given', async () => {
    await db.execute(sql`
      update users set last_ip_prefix = '203.0.113.' where id in (${MOD}, ${OTHER_MOD})
    `)
    expect(await repo.ipMatches(IVAN, 1)).toHaveLength(1)
  })

  it('reports the ranges on record, so the screen can say what it searched', async () => {
    expect(await repo.ipPrefixesFor(IVAN)).toEqual({
      registration: '203.0.113.',
      lastVisit: '203.0.113.',
    })
    expect(await repo.ipPrefixesFor(999)).toEqual({ registration: null, lastVisit: null })
  })

  it('writes an audit row naming who asked, about whom, and what was found', async () => {
    await repo.recordIpLookup({
      actorUserId: MOD,
      subjectUserId: IVAN,
      matches: 0,
      at: AT,
    })

    const rows = resultRows(
      await db.execute(sql`select user_id, action, detail from admin_log`),
    ) as Array<{ user_id: number; action: string; detail: Record<string, unknown> }>

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: MOD, action: 'modcp.ip_lookup' })
    expect(rows[0]!.detail).toMatchObject({ subjectUserId: IVAN, matches: 0 })
  })

  it('appears in the moderator"s own log', async () => {
    await repo.recordIpLookup({ actorUserId: MOD, subjectUserId: IVAN, matches: 0, at: AT })

    const page = await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })
    expect(page.entries[0]).toMatchObject({ action: 'modcp.ip_lookup' })
  })
})
