import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PostgresBoardDigestRepository } from './board-digest-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let repo: PostgresBoardDigestRepository

const LAPSED = 1
const RECENT = 2
const NEVER_ENABLED = 3
const NEVER_VISITED = 4

const AT = new Date('2026-09-02T12:00:00Z')
const DUE_BEFORE = new Date('2026-08-26T12:00:00Z')
const LAPSED_BEFORE = new Date('2026-08-26T12:00:00Z')

const LONG_AGO = new Date('2026-07-01T00:00:00Z')
const RECENTLY = new Date('2026-09-01T00:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresBoardDigestRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

async function setUser(over: {
  id: number
  lastActiveAt: Date | null
  cadence?: string
  sentAt?: Date | null
  state?: string
}): Promise<void> {
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id,
                       last_active_at, board_digest_cadence, board_digest_sent_at, state)
    values (${over.id}, ${`user${over.id}`}, ${`user${over.id}`},
            ${`user${over.id}@example.test`}, ${`user${over.id}@example.test`},
            'x', 'argon2id', 2,
            ${over.lastActiveAt}, ${over.cadence ?? 'weekly'}, ${over.sentAt ?? null},
            ${over.state ?? 'active'})
  `)
}

async function enable(userId: number, on = true): Promise<void> {
  await db.execute(sql`
    insert into notification_preferences (user_id, kind, email, updated_at)
    values (${userId}, 'board.digest', ${on}, now())
  `)
}

beforeEach(async () => {
  await db.execute(sql`delete from notification_preferences`)
  await db.execute(sql`delete from users`)
})

describe('dueMembers', () => {
  it('selects a lapsed member with the digest enabled and no prior send', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO })
    await enable(LAPSED)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([{ userId: LAPSED, lastActiveAt: LONG_AGO }])
  })

  it('skips a member who has visited recently', async () => {
    await setUser({ id: RECENT, lastActiveAt: RECENTLY })
    await enable(RECENT)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('skips a member who never turned the digest on', async () => {
    await setUser({ id: NEVER_ENABLED, lastActiveAt: LONG_AGO })

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('skips a member who explicitly turned the digest off', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO })
    await enable(LAPSED, false)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('skips a member who has never visited at all', async () => {
    await setUser({ id: NEVER_VISITED, lastActiveAt: null })
    await enable(NEVER_VISITED)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('skips a member whose clock has not elapsed yet', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO, sentAt: RECENTLY })
    await enable(LAPSED)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('picks the member back up once their clock has elapsed', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO, sentAt: LONG_AGO })
    await enable(LAPSED)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([{ userId: LAPSED, lastActiveAt: LONG_AGO }])
  })

  it('only matches the cadence the member has chosen', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO, cadence: 'monthly' })
    await enable(LAPSED)

    const weekly = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })
    const monthly = await repo.dueMembers({
      cadence: 'monthly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(weekly).toEqual([])
    expect(monthly).toEqual([{ userId: LAPSED, lastActiveAt: LONG_AGO }])
  })

  it('skips a banned or deleted account even when everything else matches', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO, state: 'banned' })
    await enable(LAPSED)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('respects the batch limit', async () => {
    await setUser({ id: 1, lastActiveAt: LONG_AGO })
    await setUser({ id: 2, lastActiveAt: LONG_AGO })
    await enable(1)
    await enable(2)

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 1,
    })

    expect(due).toHaveLength(1)
  })
})

describe('recordDigestRun', () => {
  it('stamps the clock so the same member is not immediately due again', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO })
    await enable(LAPSED)

    await repo.recordDigestRun({ userId: LAPSED, at: AT })

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([])
  })

  it('touches nobody else’s clock', async () => {
    await setUser({ id: LAPSED, lastActiveAt: LONG_AGO })
    await setUser({ id: RECENT, lastActiveAt: LONG_AGO })
    await enable(LAPSED)
    await enable(RECENT)

    await repo.recordDigestRun({ userId: LAPSED, at: AT })

    const due = await repo.dueMembers({
      cadence: 'weekly',
      dueBefore: DUE_BEFORE,
      lapsedBefore: LAPSED_BEFORE,
      limit: 50,
    })

    expect(due).toEqual([{ userId: RECENT, lastActiveAt: LONG_AGO }])
  })
})
