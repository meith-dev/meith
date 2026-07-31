/**
 * F55 — notifications against real Postgres.
 *
 * Three properties can only be proved here, because all three are enforced by
 * the database rather than by code:
 *
 *  - **coalescing**, which is a partial unique index over *unread* rows, so a
 *    read notification starts a fresh one and an unread one absorbs;
 *  - **the outbox row**, written in the same transaction as the notification
 *    and only when e-mail is actually wanted;
 *  - **scoping**, where "not yours" and "does not exist" have to be the same
 *    answer because both are the absence of an updated row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresNotificationRepository } from './notification-repo'
import { resultRows } from './result-rows'
import { users } from './schema'

let harness: TestDb
let db: Database
let repo: PostgresNotificationRepository

const IVAN = 1
const MOD = 2
const ADMIN = 3
const AT = new Date('2026-07-31T12:00:00Z')

/** The seeded ladder (migration 0001): administrators hold `canAccessAdminCp`. */
const REGISTERED_GROUP = 2
const ADMIN_GROUP = 3

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresNotificationRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from notification_preferences`)
  await db.execute(sql`delete from notifications`)
  await db.execute(sql`delete from outbox`)
  await db.execute(sql`delete from user_group_memberships`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values(
    [
      [IVAN, 'ivan', REGISTERED_GROUP],
      [MOD, 'mod', REGISTERED_GROUP],
      [ADMIN, 'admin', ADMIN_GROUP],
    ].map(([id, name, group]) => ({
      id: id as number,
      username: name as string,
      usernameLower: name as string,
      email: `${String(name)}@example.test`,
      emailLower: `${String(name)}@example.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      primaryGroupId: group as number,
    })),
  )
})

function raise(over: Partial<Parameters<PostgresNotificationRepository['raise']>[0]> = {}) {
  return repo.raise({
    userId: IVAN,
    kind: 'warning.received',
    data: { title: 'Spamming', points: 2 },
    href: null,
    dedupeKey: null,
    email: false,
    at: AT,
    ...over,
  })
}

async function outboxTopics(): Promise<string[]> {
  const rows = resultRows(
    await db.execute(sql`select topic from outbox order by id`),
  ) as Array<{ topic: string }>
  return rows.map((r) => r.topic)
}

describe('raising', () => {
  it('writes the row and reads it back with its captured data', async () => {
    const { notificationId, coalesced } = await raise()

    expect(coalesced).toBe(false)
    const page = await repo.listFor(IVAN, { limit: 10 })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe(notificationId)
    expect(page.rows[0]?.data).toEqual({ title: 'Spamming', points: 2 })
    expect(page.rows[0]?.occurrences).toBe(1)
  })

  it('writes the outbox row in the same transaction when e-mail is wanted', async () => {
    await raise({ email: true })
    expect(await outboxTopics()).toEqual(['notification.created'])
  })

  it('writes no outbox row when e-mail is not wanted', async () => {
    await raise({ email: false })
    expect(await outboxTopics()).toEqual([])
  })

  it('keeps two members’ notifications apart', async () => {
    await raise({ userId: IVAN })
    await raise({ userId: MOD })

    expect((await repo.listFor(IVAN, { limit: 10 })).rows).toHaveLength(1)
    expect((await repo.listFor(MOD, { limit: 10 })).rows).toHaveLength(1)
  })
})

describe('coalescing', () => {
  const KEY = 'system.task_failed:queue.drain'

  it('merges into the unread row and counts the occurrences', async () => {
    const first = await raise({ kind: 'system.task_failed', dedupeKey: KEY, email: true })
    const second = await raise({
      kind: 'system.task_failed',
      dedupeKey: KEY,
      email: true,
      data: { taskId: 'queue.drain', error: 'the newest one' },
    })

    expect(second.notificationId).toBe(first.notificationId)
    expect(second.coalesced).toBe(true)

    const page = await repo.listFor(IVAN, { limit: 10 })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.occurrences).toBe(2)
    /* The newest facts win: an operator wants the last error, not the first. */
    expect(page.rows[0]?.data).toEqual({ taskId: 'queue.drain', error: 'the newest one' })
  })

  it('sends one e-mail however many times it happens', async () => {
    for (let i = 0; i < 10; i += 1) {
      await raise({ kind: 'system.task_failed', dedupeKey: KEY, email: true })
    }
    expect(await outboxTopics()).toEqual(['notification.created'])
  })

  it('starts a fresh notification once the outstanding one has been read', async () => {
    const first = await raise({ kind: 'system.task_failed', dedupeKey: KEY, email: true })
    await repo.markRead(IVAN, first.notificationId)

    const second = await raise({ kind: 'system.task_failed', dedupeKey: KEY, email: true })

    /*
     * The whole reason the unique index is partial on `read_at is null`: an
     * administrator who reads and clears an alert is told again the next time
     * it happens, rather than never again.
     */
    expect(second.notificationId).not.toBe(first.notificationId)
    expect(second.coalesced).toBe(false)
    expect(await outboxTopics()).toEqual(['notification.created', 'notification.created'])
  })

  it('never merges two rows that opted out of coalescing', async () => {
    await raise({ dedupeKey: null })
    await raise({ dedupeKey: null })

    /* Two warnings in a minute are two things that happened. */
    expect((await repo.listFor(IVAN, { limit: 10 })).rows).toHaveLength(2)
  })

  it('keeps one member’s key from colliding with another’s', async () => {
    const mine = await raise({ userId: IVAN, dedupeKey: KEY })
    const theirs = await raise({ userId: MOD, dedupeKey: KEY })
    expect(theirs.notificationId).not.toBe(mine.notificationId)
  })
})

describe('reading and paging', () => {
  beforeEach(async () => {
    for (let i = 0; i < 5; i += 1) {
      await raise({ at: new Date(AT.getTime() + i * 60_000), data: { n: i } })
    }
  })

  it('returns the newest first', async () => {
    const page = await repo.listFor(IVAN, { limit: 10 })
    expect(page.rows.map((r) => r.data['n'])).toEqual([4, 3, 2, 1, 0])
  })

  it('pages backwards through the keyset without repeating a row', async () => {
    const first = await repo.listFor(IVAN, { limit: 2 })
    expect(first.nextCursor).toBeDefined()

    const second = await repo.listFor(IVAN, { limit: 2, after: first.nextCursor! })
    const third = await repo.listFor(IVAN, { limit: 2, after: second.nextCursor! })

    expect(first.rows.map((r) => r.data['n'])).toEqual([4, 3])
    expect(second.rows.map((r) => r.data['n'])).toEqual([2, 1])
    expect(third.rows.map((r) => r.data['n'])).toEqual([0])
    expect(third.nextCursor).toBeUndefined()
  })

  it('treats a corrupt cursor as no cursor rather than failing the page', async () => {
    const page = await repo.listFor(IVAN, { limit: 2, after: 'not-a-cursor' })
    expect(page.rows).toHaveLength(2)
  })

  it('counts only what is unread', async () => {
    expect(await repo.unreadCount(IVAN)).toBe(5)
    expect(await repo.markAllRead(IVAN)).toBe(5)
    expect(await repo.unreadCount(IVAN)).toBe(0)
    /* Idempotent: a second click marks nothing. */
    expect(await repo.markAllRead(IVAN)).toBe(0)
  })
})

describe('marking read is scoped in the statement', () => {
  it('refuses somebody else’s notification exactly as it refuses a missing one', async () => {
    const mine = await raise({ userId: IVAN })

    expect(await repo.markRead(MOD, mine.notificationId)).toBe(false)
    expect(await repo.markRead(MOD, 999_999)).toBe(false)
    /* Still unread, because the other member's attempt touched nothing. */
    expect(await repo.unreadCount(IVAN)).toBe(1)
  })

  it('marks a second time as a no-op', async () => {
    const { notificationId } = await raise()
    expect(await repo.markRead(IVAN, notificationId)).toBe(true)
    expect(await repo.markRead(IVAN, notificationId)).toBe(false)
  })

  it('marks all for one member only', async () => {
    await raise({ userId: IVAN })
    await raise({ userId: MOD })

    await repo.markAllRead(IVAN)
    expect(await repo.unreadCount(MOD)).toBe(1)
  })
})

describe('preferences', () => {
  it('stores overrides and reads them back', async () => {
    await repo.saveEmailPreferences(
      IVAN,
      new Map([
        ['warning.received', false],
        ['report.actioned', true],
      ]),
    )

    const stored = await repo.emailPreferencesFor(IVAN)
    expect(stored.get('warning.received')).toBe(false)
    expect(stored.get('report.actioned')).toBe(true)
  })

  it('overwrites rather than duplicating on a second save', async () => {
    await repo.saveEmailPreferences(IVAN, new Map([['warning.received', false]]))
    await repo.saveEmailPreferences(IVAN, new Map([['warning.received', true]]))

    const stored = await repo.emailPreferencesFor(IVAN)
    expect(stored.size).toBe(1)
    expect(stored.get('warning.received')).toBe(true)
  })

  it('has no rows for a member who has never saved', async () => {
    expect((await repo.emailPreferencesFor(IVAN)).size).toBe(0)
  })
})

describe('delivery lookup', () => {
  it('returns the recipient and the effective preference', async () => {
    const { notificationId } = await raise({ email: true })

    const deliverable = await repo.findForDelivery(notificationId)
    expect(deliverable?.recipient.email).toBe('ivan@example.test')
    expect(deliverable?.recipient.username).toBe('ivan')
    /* No stored row, so the registry default for `warning.received` applies. */
    expect(deliverable?.emailEnabled).toBe(true)
    expect(deliverable?.emailSentAt).toBeNull()
  })

  it('reflects a preference changed after the raise', async () => {
    const { notificationId } = await raise({ email: true })
    await repo.saveEmailPreferences(IVAN, new Map([['warning.received', false]]))

    expect((await repo.findForDelivery(notificationId))?.emailEnabled).toBe(false)
  })

  it('records that a message went out', async () => {
    const { notificationId } = await raise({ email: true })
    await repo.markEmailSent(notificationId, AT)

    expect((await repo.findForDelivery(notificationId))?.emailSentAt).toEqual(AT)
  })

  it('returns nothing for a deleted account', async () => {
    const { notificationId } = await raise({ email: true })
    await db.execute(sql`update users set state = 'deleted' where id = ${IVAN}`)

    expect(await repo.findForDelivery(notificationId)).toBeNull()
  })

  it('returns nothing for a notification that has gone', async () => {
    expect(await repo.findForDelivery(999_999)).toBeNull()
  })

  it('refuses to deliver a kind this build does not know', async () => {
    /*
     * Written straight to the table rather than through `raise`, because
     * `RaiseInput.kind` is the registry union and a *caller* cannot produce
     * this row — only a previous deploy can, which is exactly the case being
     * covered.
     */
    const rows = resultRows(
      await db.execute(sql`
        insert into notifications (user_id, kind, data)
        values (${IVAN}, 'pm.received', '{}'::jsonb)
        returning id
      `),
    ) as Array<{ id: number }>

    /* A blank e-mail is worse than none, so an unknown kind resolves to off. */
    expect((await repo.findForDelivery(Number(rows[0]!.id)))?.emailEnabled).toBe(false)
  })
})

describe('who counts as an administrator', () => {
  it('resolves the permission column, not a group id', async () => {
    expect(await repo.administratorIds(50)).toEqual([ADMIN])
  })

  it('includes somebody who holds it through a secondary group', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (${MOD}, ${ADMIN_GROUP})
    `)
    expect(await repo.administratorIds(50)).toEqual([MOD, ADMIN])
  })

  it('excludes an account that is not active', async () => {
    await db.execute(sql`update users set state = 'banned' where id = ${ADMIN}`)
    expect(await repo.administratorIds(50)).toEqual([])
  })

  it('is bounded by the ceiling it is given', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id) values (${MOD}, ${ADMIN_GROUP})
    `)
    expect(await repo.administratorIds(1)).toHaveLength(1)
  })

  it('follows the column: a group that loses the grant stops being notified', async () => {
    await db.execute(sql`
      update usergroups set can_access_admin_cp = false where id = ${ADMIN_GROUP}
    `)
    expect(await repo.administratorIds(50)).toEqual([])
  })
})
