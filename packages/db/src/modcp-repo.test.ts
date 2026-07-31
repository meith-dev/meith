/**
 * F54 — the ModCP's reads against real Postgres.
 *
 * Two of these queries decide what a moderator is allowed to *see*, so those
 * are the ones with the most tests: the log's allow-list (an administrative row
 * must never appear in it) and its forum scope (a moderator of one forum must
 * not read another's entries). The address lookup is third, and the thing worth
 * proving about it is that a `null` prefix matches nothing rather than matching
 * every other `null`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresModCpRepository } from './modcp-repo'
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

  /* Scoped in SQL, not in the rendering. */
  it('hides an entry in a forum this actor does not moderate', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: THEIRS }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual(
      [],
    )
  })

  /* Their own acts stay visible even in a forum they have since left. */
  it('shows this actor"s own entry wherever it happened', async () => {
    await logRow('thread.lock', { threadId: 7, forumId: THEIRS }, MOD)

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  /*
   * The allow-list. `admin_log` is shared with the ACP, and a deny-list would
   * turn every new administrative row type into a disclosure.
   */
  it('never shows an administrative entry, whoever wrote it', async () => {
    await logRow('settings.update', { forumId: MINE }, MOD)
    await logRow('permission.bypass', { forumId: MINE }, MOD)
    await logRow('user.promote', { userId: IVAN }, MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual(
      [],
    )
  })

  /* A move touches two forums, so it belongs in both moderators' logs (D49). */
  it('shows a move to the destination forum"s moderators as well', async () => {
    await logRow('thread.move', { threadId: 7, from: THEIRS, to: MINE }, OTHER_MOD)

    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  /*
   * A warning has no forum. Showing every one on the board through the log
   * would be a wider grant than the warn screen itself gives.
   */
  it('shows a forum-less entry only to the moderator who wrote it', async () => {
    await logRow('warning.issue', { userId: IVAN, points: 2 }, OTHER_MOD)

    expect((await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })).entries).toEqual(
      [],
    )
    expect(
      (await repo.log({ forumIds: [MINE], actorUserId: OTHER_MOD, limit: 10 })).entries,
    ).toHaveLength(1)
  })

  it('renders only the detail keys it has names for', async () => {
    await logRow('inline.delete', {
      threadIds: [1, 2],
      applied: 2,
      /* Not in the label map, so not shown. */
      internalCursor: 'abc',
    })

    const entry = (await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 }))
      .entries[0]!
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
    /* No overlap: a keyset that repeated a row would show the same act twice. */
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
    expect(await repo.workload([MINE])).toEqual(
      new Map([[MINE, { pending: 0, openReports: 0 }]]),
    )
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

  /*
   * The trap. A board that has not recorded an address for two accounts has not
   * established that they share one.
   */
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

  /* And it is one of the actions the log shows, so it is visible to peers. */
  it('appears in the moderator"s own log', async () => {
    await repo.recordIpLookup({ actorUserId: MOD, subjectUserId: IVAN, matches: 0, at: AT })

    const page = await repo.log({ forumIds: [MINE], actorUserId: MOD, limit: 10 })
    expect(page.entries[0]).toMatchObject({ action: 'modcp.ip_lookup' })
  })
})
