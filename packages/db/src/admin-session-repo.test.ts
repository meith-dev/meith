import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresAdminLogRepository, PostgresAdminSessionRepository } from './admin-session-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let sessions: PostgresAdminSessionRepository
let log: PostgresAdminLogRepository

const ADA = 1
const BOB = 2

const AT = new Date('2026-08-02T12:00:00Z')
const LATER = new Date(AT.getTime() + 10 * 60_000)

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  sessions = new PostgresAdminSessionRepository(db)
  log = new PostgresAdminLogRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from admin_sessions`)
  await db.execute(sql`delete from admin_log`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${ADA}, 'ada', 'ada', 'a@example.test', 'a@example.test', 'x', 'argon2id', 3),
           (${BOB}, 'bob', 'bob', 'b@example.test', 'b@example.test', 'x', 'argon2id', 3)
  `)
})

function open(tokenHash: string, userId = ADA, at = AT) {
  return sessions.create({
    userId,
    tokenHash,
    ipPrefix: '203.0.113.0',
    expiresAt: new Date(at.getTime() + 30 * 60_000),
    at,
  })
}

describe('findLive', () => {
  it('returns a live session with both clocks', async () => {
    await open('hash-a')

    const found = await sessions.findLive('hash-a', AT)
    expect(found).toMatchObject({ userId: ADA, ipPrefix: '203.0.113.0' })
    expect(found?.authenticatedAt).toEqual(AT)
    expect(found?.createdAt).toEqual(AT)
  })

  it('returns nothing for an unknown token', async () => {
    await open('hash-a')
    expect(await sessions.findLive('hash-b', AT)).toBeNull()
  })

  it('returns nothing once expired — liveness is in the query', async () => {
    await open('hash-a')
    expect(await sessions.findLive('hash-a', new Date(AT.getTime() + 31 * 60_000))).toBeNull()
  })

  it('returns nothing once revoked', async () => {
    const created = await open('hash-a')
    await sessions.revoke(created.id, LATER)
    expect(await sessions.findLive('hash-a', AT)).toBeNull()
  })

  it('refuses a duplicate token hash at the database', async () => {
    await open('hash-a')
    await expect(open('hash-a', BOB)).rejects.toThrow()
  })
})

describe('touch', () => {
  it('extends the session and moves last_seen_at', async () => {
    const created = await open('hash-a')
    const extended = new Date(LATER.getTime() + 30 * 60_000)

    await sessions.touch(created.id, LATER, extended, 60)

    const found = await sessions.findLive('hash-a', LATER)
    expect(found?.lastSeenAt).toEqual(LATER)
    expect(found?.expiresAt).toEqual(extended)
  })

  it('never moves authenticated_at', async () => {
    const created = await open('hash-a')
    await sessions.touch(created.id, LATER, new Date(LATER.getTime() + 60_000), 60)

    expect((await sessions.findLive('hash-a', LATER))?.authenticatedAt).toEqual(AT)
  })

  it('skips inside the throttle window', async () => {
    const created = await open('hash-a')
    const soon = new Date(AT.getTime() + 30_000)

    await sessions.touch(created.id, soon, new Date(soon.getTime() + 60_000), 60)
    expect((await sessions.findLive('hash-a', soon))?.lastSeenAt).toEqual(AT)
  })

  it('does nothing to a revoked session', async () => {
    const created = await open('hash-a')
    await sessions.revoke(created.id, AT)
    await sessions.touch(created.id, LATER, new Date(LATER.getTime() + 60_000), 60)

    expect(await sessions.findLive('hash-a', LATER)).toBeNull()
  })
})

describe('markReauthenticated', () => {
  it('moves the proof clock and nothing else’s meaning', async () => {
    const created = await open('hash-a')
    await sessions.markReauthenticated(created.id, LATER)

    const found = await sessions.findLive('hash-a', LATER)
    expect(found?.authenticatedAt).toEqual(LATER)
    expect(found?.createdAt).toEqual(AT)
  })
})

describe('revoking', () => {
  it('revokes one member’s sessions without touching another’s', async () => {
    await open('hash-a', ADA)
    await open('hash-b', BOB)

    await sessions.revokeAllForUser(ADA, LATER)

    expect(await sessions.findLive('hash-a', AT)).toBeNull()
    expect(await sessions.findLive('hash-b', AT)).not.toBeNull()
  })

  it('goes with the account, by cascade', async () => {
    await open('hash-a', ADA)
    await db.execute(sql`delete from users where id = ${ADA}`)

    expect(await sessions.findLive('hash-a', AT)).toBeNull()
  })
})

describe('the admin log', () => {
  it('records who, what, the detail and where from', async () => {
    await log.record({
      userId: ADA,
      action: 'admin.signed_in',
      detail: { note: 'first' },
      ipPrefix: '203.0.113.0',
      at: AT,
    })

    const [row] = await log.list({ limit: 10 })
    expect(row).toMatchObject({
      userId: ADA,
      username: 'ada',
      action: 'admin.signed_in',
      ipPrefix: '203.0.113.0',
    })
    expect(row?.detail).toEqual({ note: 'first' })
  })

  it('is unscoped, unlike the ModCP view of the same table', async () => {
    await log.record({ userId: ADA, action: 'a.one', detail: {}, ipPrefix: null, at: AT })
    await log.record({ userId: BOB, action: 'b.two', detail: {}, ipPrefix: null, at: AT })

    expect(await log.list({ limit: 10 })).toHaveLength(2)
  })

  it('pages by number, and counts the filter', async () => {
    for (const action of ['a.one', 'a.two', 'b.one']) {
      await log.record({ userId: ADA, action, detail: {}, ipPrefix: null, at: AT })
    }

    expect(await log.count({})).toBe(3)
    expect(await log.count({ action: 'a.one' })).toBe(1)

    const second = await log.list({ limit: 2, offset: 2 })
    expect(second).toHaveLength(1)
  })

  it('filters by action', async () => {
    await log.record({ userId: ADA, action: 'a.one', detail: {}, ipPrefix: null, at: AT })
    await log.record({ userId: ADA, action: 'b.two', detail: {}, ipPrefix: null, at: AT })

    const filtered = await log.list({ limit: 10, action: 'b.two' })
    expect(filtered.map((row) => row.action)).toEqual(['b.two'])
  })

  it('pages backwards on the row id', async () => {
    for (const action of ['a.one', 'a.two', 'a.three']) {
      await log.record({ userId: ADA, action, detail: {}, ipPrefix: null, at: AT })
    }

    const first = await log.list({ limit: 2 })
    const next = await log.list({ limit: 2, before: first[1]!.id })

    expect(first).toHaveLength(2)
    expect(next).toHaveLength(1)
    expect(next[0]!.id).toBeLessThan(first[1]!.id)
  })

  it('keeps a row whose actor has been deleted', async () => {
    await log.record({ userId: ADA, action: 'a.one', detail: {}, ipPrefix: null, at: AT })
    await db.execute(sql`delete from users where id = ${ADA}`)

    const [row] = await log.list({ limit: 10 })
    expect(row?.action).toBe('a.one')
    expect(row?.userId).toBeNull()
    expect(row?.username).toBeNull()
  })

  it('lists the distinct actions for the filter control', async () => {
    await log.record({ userId: ADA, action: 'b.two', detail: {}, ipPrefix: null, at: AT })
    await log.record({ userId: ADA, action: 'a.one', detail: {}, ipPrefix: null, at: AT })
    await log.record({ userId: BOB, action: 'a.one', detail: {}, ipPrefix: null, at: AT })

    expect(await log.actions()).toEqual(['a.one', 'b.two'])
  })

  it('offers every action present, not just the first alphabetical page of them', async () => {
    const names = Array.from(
      { length: 120 },
      (_, i) => `${String.fromCharCode(97 + (i % 26))}.action_${String(i).padStart(3, '0')}`,
    )
    for (const action of names) {
      await log.record({ userId: ADA, action, detail: {}, ipPrefix: null, at: AT })
    }

    expect(await log.actions()).toHaveLength(names.length)
    expect([...(await log.actions())].sort()).toEqual([...names].sort())
  })

  it('reads a non-object detail as empty rather than failing the page', async () => {
    await db.execute(sql`
      insert into admin_log (user_id, action, detail)
      values (${ADA}, 'a.one', '"a bare string"'::jsonb)
    `)

    expect((await log.list({ limit: 10 }))[0]?.detail).toEqual({})
  })
})
