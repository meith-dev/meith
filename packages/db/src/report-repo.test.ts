import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ReportService } from '@meith/moderation'

import { PostgresAdminLogRepository } from './admin-session-repo'
import type { Database } from './client'
import { PostgresModCpRepository } from './modcp-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresReportRepository } from './report-repo'
import { resultRows } from './result-rows'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresReportRepository

const CATEGORY = 1
const FORUM = 4
const OTHER = 5
const AUTHOR = 1
const REPORTER = 2
const MOD = 3
const AT = new Date('2026-07-30T12:00:00Z')

const IN_FORUM = { forumIds: [FORUM], global: false }
const BOARD_STAFF = { forumIds: [FORUM, OTHER], global: true }

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresReportRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from private_message_copies`)
  await db.execute(sql`delete from private_messages`)
  await db.execute(sql`delete from report_events`)
  await db.execute(sql`delete from reports`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [AUTHOR, 'ada'],
      [REPORTER, 'bob'],
      [MOD, 'mod'],
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
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
    { id: OTHER, title: 'Elsewhere', slug: 'elsewhere', path: '1.5', depth: 1, parentId: CATEGORY },
  ])
})

async function seedThread(id: number, forumId = FORUM, visibility = 'visible'): Promise<number> {
  const postId = id * 10
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, first_post_id, last_post_at, created_at, updated_at)
    values (${id}, ${forumId}, ${'Thread ' + String(id)}, ${'t' + String(id)},
            ${AUTHOR}, 'ada', ${visibility}, ${postId}, ${AT}, ${AT}, ${AT})
  `)
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (${postId}, ${id}, ${forumId}, ${AUTHOR}, 'ada', 'a body',
            ${visibility}, true, ${AT})
  `)
  return postId
}

function service(): ReportService {
  return new ReportService({ reports: repo, now: () => AT })
}

describe('resolveTarget', () => {
  it('resolves a post to its forum, thread and thread title', async () => {
    const postId = await seedThread(100)

    expect(await repo.resolveTarget('post', postId, REPORTER)).toEqual({
      kind: 'post',
      id: postId,
      forumId: FORUM,
      threadId: 100,
      threadAuthorUserId: AUTHOR,
      label: 'Thread 100',
    })
  })

  it('resolves a thread and a user', async () => {
    await seedThread(100)

    expect(await repo.resolveTarget('thread', 100, REPORTER)).toMatchObject({
      forumId: FORUM,
      threadId: 100,
      label: 'Thread 100',
    })
    expect(await repo.resolveTarget('user', AUTHOR, REPORTER)).toEqual({
      kind: 'user',
      id: AUTHOR,
      forumId: null,
      threadId: null,
      threadAuthorUserId: null,
      label: 'ada',
    })
  })

  it('refuses a target that is not public', async () => {
    const postId = await seedThread(100, FORUM, 'unapproved')
    expect(await repo.resolveTarget('post', postId, REPORTER)).toBeNull()
    expect(await repo.resolveTarget('thread', 100, REPORTER)).toBeNull()
  })

  it('refuses a deleted account', async () => {
    await db.execute(sql`update users set deleted_at = ${AT} where id = ${AUTHOR}`)
    expect(await repo.resolveTarget('user', AUTHOR, REPORTER)).toBeNull()
  })

  it('refuses something that is not there', async () => {
    expect(await repo.resolveTarget('post', 4242, REPORTER)).toBeNull()
  })

  describe('a private message', () => {
    async function seedMessage(): Promise<number> {
      const rows = resultRows(
        await db.execute(sql`
          insert into private_messages (author_user_id, author_username, subject, message)
          values (${AUTHOR}, 'ada', 'Read this', 'A message.')
          returning id
        `),
      ) as Array<{ id: number }>
      const id = Number(rows[0]!.id)

      await db.execute(sql`
        insert into private_message_copies (message_id, owner_user_id, folder, role)
        values (${id}, ${AUTHOR}, 'sent', 'author'),
               (${id}, ${REPORTER}, 'inbox', 'to')
      `)
      return id
    }

    it('resolves for somebody who was sent it, with no forum', async () => {
      const id = await seedMessage()

      expect(await repo.resolveTarget('private_message', id, REPORTER)).toEqual({
        kind: 'private_message',
        id,
        forumId: null,
        threadId: null,
        threadAuthorUserId: null,
        label: 'Read this',
      })
    })

    it('refuses somebody who holds no copy of it', async () => {
      const id = await seedMessage()
      expect(await repo.resolveTarget('private_message', id, MOD)).toBeNull()
    })

    it('refuses a message that does not exist', async () => {
      expect(await repo.resolveTarget('private_message', 4242, REPORTER)).toBeNull()
    })
  })
})

describe('filing a report', () => {
  it('writes the report and its opening event together', async () => {
    const postId = await seedThread(100)

    const { reportId, duplicate } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })

    expect(duplicate).toBe(false)
    const found = await repo.find(reportId)
    expect(found!.report).toMatchObject({
      kind: 'post',
      targetId: postId,
      forumId: FORUM,
      threadId: 100,
      targetLabel: 'Thread 100',
      reporterUsername: 'bob',
      reason: 'spam',
      status: 'open',
      assignedToUserId: null,
    })
    expect(found!.events.map((e) => e.kind)).toEqual(['opened'])
  })

  it('is a friendly no-op the second time', async () => {
    const postId = await seedThread(100)
    const file = () =>
      service().file({
        kind: 'post',
        targetId: postId,
        reason: 'spam',
        reporterUserId: REPORTER,
      })

    await file()
    expect(await file()).toMatchObject({ duplicate: true })

    const rows = resultRows(await db.execute(sql`select id from reports`))
    expect(rows).toHaveLength(1)
  })

  it('lets a different member report the same thing', async () => {
    const postId = await seedThread(100)
    const file = (who: number) =>
      service().file({ kind: 'post', targetId: postId, reason: 'spam', reporterUserId: who })

    await file(REPORTER)
    expect(await file(MOD)).toMatchObject({ duplicate: false })
  })

  it('lets the same member report again once the first is closed', async () => {
    const postId = await seedThread(100)
    const file = () =>
      service().file({
        kind: 'post',
        targetId: postId,
        reason: 'spam',
        reporterUserId: REPORTER,
      })

    const first = await file()
    await repo.close({
      reportId: first.reportId,
      status: 'rejected',
      note: null,
      actorUserId: MOD,
      at: AT,
    })

    expect(await file()).toMatchObject({ duplicate: false })
  })
})

describe('the moderator list', () => {
  async function fileOn(forumId: number, threadId: number): Promise<number> {
    const postId = await seedThread(threadId, forumId)
    const { reportId } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })
    return reportId
  }

  it('shows only the forums in scope', async () => {
    const mine = await fileOn(FORUM, 100)
    await fileOn(OTHER, 101)

    const page = await repo.listOpen(IN_FORUM, { limit: 10 })
    expect(page.rows.map((r) => r.id)).toEqual([mine])
    expect(await repo.countOpen(IN_FORUM)).toBe(1)
  })

  it('gives a user report to board staff and to nobody else', async () => {
    await service().file({
      kind: 'user',
      targetId: AUTHOR,
      reason: 'impersonation',
      reporterUserId: REPORTER,
    })

    expect(await repo.countOpen(IN_FORUM)).toBe(0)
    expect(await repo.countOpen(BOARD_STAFF)).toBe(1)
  })

  it('lists forum and user reports together, oldest first', async () => {
    const first = await fileOn(FORUM, 100)
    const { reportId: second } = await service().file({
      kind: 'user',
      targetId: AUTHOR,
      reason: 'impersonation',
      reporterUserId: REPORTER,
    })

    const page = await repo.listOpen(BOARD_STAFF, { limit: 10 })
    expect(page.rows.map((r) => r.id)).toEqual([first, second])
  })

  it('drops a report once it is closed', async () => {
    const id = await fileOn(FORUM, 100)
    await repo.close({
      reportId: id,
      status: 'resolved',
      note: null,
      actorUserId: MOD,
      at: AT,
    })

    expect((await repo.listOpen(IN_FORUM, { limit: 10 })).rows).toEqual([])
  })

  it('pages with a keyset cursor', async () => {
    const ids = [await fileOn(FORUM, 100), await fileOn(FORUM, 101), await fileOn(FORUM, 102)]

    const first = await repo.listOpen(IN_FORUM, { limit: 2 })
    expect(first.rows.map((r) => r.id)).toEqual(ids.slice(0, 2))

    const second = await repo.listOpen(IN_FORUM, { limit: 2, after: first.nextCursor! })
    expect(second.rows.map((r) => r.id)).toEqual([ids[2]])
    expect(second.nextCursor).toBeUndefined()
  })
})

describe('assignment and closing', () => {
  async function open(): Promise<number> {
    const postId = await seedThread(100)
    const { reportId } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })
    return reportId
  }

  it('records who took it', async () => {
    const id = await open()
    expect(await repo.assign({ reportId: id, toUserId: MOD, actorUserId: MOD, at: AT })).toBe(true)

    const found = await repo.find(id)
    expect(found!.report).toMatchObject({ assignedToUserId: MOD, assignedToUsername: 'mod' })
    expect(found!.events.map((e) => e.kind)).toEqual(['opened', 'assigned'])
  })

  it('records putting it back', async () => {
    const id = await open()
    await repo.assign({ reportId: id, toUserId: MOD, actorUserId: MOD, at: AT })
    await repo.assign({ reportId: id, toUserId: null, actorUserId: MOD, at: AT })

    const found = await repo.find(id)
    expect(found!.report.assignedToUserId).toBeNull()
    expect(found!.events.map((e) => e.kind)).toEqual(['opened', 'assigned', 'unassigned'])
  })

  it('keeps a private note on the closing event', async () => {
    const id = await open()
    await repo.close({
      reportId: id,
      status: 'resolved',
      note: 'warned the member',
      actorUserId: MOD,
      at: AT,
    })

    const found = await repo.find(id)
    expect(found!.report.status).toBe('resolved')
    const closing = found!.events.at(-1)!
    expect(closing).toMatchObject({
      kind: 'resolved',
      note: 'warned the member',
      actorUsername: 'mod',
    })
  })

  it('refuses to act on a report somebody else already closed', async () => {
    const id = await open()
    await repo.close({
      reportId: id,
      status: 'resolved',
      note: null,
      actorUserId: MOD,
      at: AT,
    })

    expect(await repo.assign({ reportId: id, toUserId: MOD, actorUserId: MOD, at: AT })).toBe(false)
    expect(
      await repo.close({
        reportId: id,
        status: 'rejected',
        note: null,
        actorUserId: MOD,
        at: AT,
      }),
    ).toBe(false)

    const found = await repo.find(id)
    expect(found!.report.status).toBe('resolved')
    expect(found!.events.map((e) => e.kind)).toEqual(['opened', 'resolved'])
  })
})

describe('the moderator log a closed report leaves', () => {
  async function logRows(): Promise<
    Array<{ user_id: number; action: string; detail: Record<string, unknown> }>
  > {
    return resultRows(
      await db.execute(sql`select user_id, action, detail from admin_log order by id`),
    ) as Array<{ user_id: number; action: string; detail: Record<string, unknown> }>
  }

  async function openOn(forumId: number): Promise<number> {
    const postId = await seedThread(100, forumId)
    const { reportId } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })
    return reportId
  }

  it('names who resolved it, which report, and the forum it was filed in', async () => {
    const id = await openOn(FORUM)
    await repo.close({
      reportId: id,
      status: 'resolved',
      note: 'warned the member',
      actorUserId: MOD,
      at: AT,
    })

    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: MOD, action: 'report.resolve' })
    expect(rows[0]!.detail).toEqual({ reportId: id, forumId: FORUM, forumIds: [FORUM] })
  })

  it('separates a dismissal from a resolution', async () => {
    const id = await openOn(FORUM)
    await repo.close({
      reportId: id,
      status: 'rejected',
      note: null,
      actorUserId: MOD,
      at: AT,
    })

    expect((await logRows())[0]).toMatchObject({ action: 'report.reject' })
  })

  it('keeps the private note out of the shared log', async () => {
    const id = await openOn(FORUM)
    await repo.close({
      reportId: id,
      status: 'resolved',
      note: 'banned them for the third time',
      actorUserId: MOD,
      at: AT,
    })

    expect(JSON.stringify(await logRows())).not.toContain('third time')
  })

  it('carries no forum key for a report about a member rather than a post', async () => {
    const { reportId } = await service().file({
      kind: 'user',
      targetId: AUTHOR,
      reason: 'spam',
      reporterUserId: REPORTER,
    })
    await repo.close({
      reportId,
      status: 'resolved',
      note: null,
      actorUserId: MOD,
      at: AT,
    })

    expect((await logRows())[0]!.detail).toEqual({ reportId })
  })

  it('appears in the administrator log the panel lists, named after who closed it', async () => {
    const id = await openOn(FORUM)
    await repo.close({ reportId: id, status: 'resolved', note: null, actorUserId: MOD, at: AT })

    const listed = await new PostgresAdminLogRepository(db).list({ limit: 10 })

    expect(listed[0]).toMatchObject({
      action: 'report.resolve',
      userId: MOD,
      username: 'mod',
      detail: { reportId: id, forumId: FORUM },
    })
  })

  it('appears in the moderator log of the forum the report was filed in', async () => {
    const id = await openOn(FORUM)
    await repo.close({ reportId: id, status: 'rejected', note: null, actorUserId: MOD, at: AT })

    const page = await new PostgresModCpRepository(db).log({
      forumIds: [FORUM],
      actorUserId: REPORTER,
      limit: 10,
    })

    expect(page.entries[0]).toMatchObject({
      action: 'report.reject',
      forumTitle: 'General',
      actorUsername: 'mod',
    })
  })

  it('writes nothing when the report was already closed', async () => {
    const id = await openOn(FORUM)
    await repo.close({ reportId: id, status: 'resolved', note: null, actorUserId: MOD, at: AT })
    await repo.close({ reportId: id, status: 'rejected', note: null, actorUserId: MOD, at: AT })

    expect(await logRows()).toHaveLength(1)
  })
})

describe('through the service', () => {
  it('will not open, assign or close a report outside the actor"s scope', async () => {
    const postId = await seedThread(100, OTHER)
    const { reportId } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })

    expect(await service().open(reportId, IN_FORUM)).toBeNull()
    await expect(
      service().assign({ reportId, toUserId: MOD, actorUserId: MOD, scope: IN_FORUM }),
    ).rejects.toThrow(/does not exist/i)
    await expect(
      service().close({
        reportId,
        status: 'resolved',
        note: '',
        actorUserId: MOD,
        scope: IN_FORUM,
      }),
    ).rejects.toThrow(/does not exist/i)

    expect((await repo.find(reportId))!.report.status).toBe('open')
  })

  it('lets the right moderator do all three', async () => {
    const postId = await seedThread(100, OTHER)
    const { reportId } = await service().file({
      kind: 'post',
      targetId: postId,
      reason: 'spam',
      reporterUserId: REPORTER,
    })
    const scope = { forumIds: [OTHER], global: false }

    expect(await service().open(reportId, scope)).not.toBeNull()
    await service().assign({ reportId, toUserId: MOD, actorUserId: MOD, scope })
    await service().close({
      reportId,
      status: 'resolved',
      note: 'handled',
      actorUserId: MOD,
      scope,
    })

    expect((await repo.find(reportId))!.report.status).toBe('resolved')
  })
})
