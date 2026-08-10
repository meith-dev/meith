import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresRelationRepository } from './relation-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresRelationRepository

const IVAN = 1
const BOB = 2
const CAROL = 3

const AT = new Date('2026-08-01T12:00:00Z')
const LATER = new Date('2026-08-02T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresRelationRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from user_relations`)
  await db.execute(sql`delete from users`)

  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${IVAN}, 'ivan', 'ivan', 'ivan@example.test', 'ivan@example.test',
            'x', 'argon2id', 2),
           (${BOB}, 'bob', 'bob', 'bob@example.test', 'bob@example.test',
            'x', 'argon2id', 2),
           (${CAROL}, 'carol', 'carol', 'carol@example.test', 'carol@example.test',
            'x', 'argon2id', 2)
  `)
})

describe('set', () => {
  it('adds a row and reads it back with the member it names', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })

    const rows = await repo.list({ userId: IVAN, kind: 'buddy' })
    expect(rows).toEqual([
      { userId: BOB, username: 'bob', kind: 'buddy', lastActiveAt: null, createdAt: AT },
    ])
  })

  it('is an upsert, so one member is on exactly one list', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'ignore', at: AT })
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: LATER })

    expect(await repo.list({ userId: IVAN, kind: 'ignore' })).toEqual([])
    expect(await repo.list({ userId: IVAN, kind: 'buddy' })).toHaveLength(1)
    expect(await repo.count(IVAN)).toBe(1)
  })

  it('keeps the original created_at across a change of kind', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'ignore', at: AT })
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: LATER })

    const [row] = await repo.list({ userId: IVAN, kind: 'buddy' })
    expect(row?.createdAt).toEqual(AT)
  })

  it('is one member’s opinion, not a mutual state', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'ignore', at: AT })

    expect(await repo.ignores(IVAN, BOB)).toBe(true)
    expect(await repo.ignores(BOB, IVAN)).toBe(false)
    expect(await repo.list({ userId: BOB, kind: 'ignore' })).toEqual([])
  })
})

describe('list', () => {
  it('returns one kind at a time, in username order', async () => {
    await repo.set({ userId: IVAN, otherUserId: CAROL, kind: 'buddy', at: AT })
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })

    expect((await repo.list({ userId: IVAN, kind: 'buddy' })).map((r) => r.username)).toEqual([
      'bob',
      'carol',
    ])
  })

  it('carries last_active_at, which is what "online" is computed from', async () => {
    await db.execute(sql`update users set last_active_at = ${AT} where id = ${BOB}`)
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })

    const [row] = await repo.list({ userId: IVAN, kind: 'buddy' })
    expect(row?.lastActiveAt).toEqual(AT)
  })

  it('drops a deleted account from the list without deleting the row', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })
    await db.execute(sql`update users set deleted_at = ${AT} where id = ${BOB}`)

    expect(await repo.list({ userId: IVAN, kind: 'buddy' })).toEqual([])
    expect(await repo.count(IVAN)).toBe(1)
  })

  it('is scoped to one member’s list', async () => {
    await repo.set({ userId: BOB, otherUserId: CAROL, kind: 'buddy', at: AT })
    expect(await repo.list({ userId: IVAN, kind: 'buddy' })).toEqual([])
  })
})

describe('ignoredIds', () => {
  it('returns ignore rows only, as ids', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'ignore', at: AT })
    await repo.set({ userId: IVAN, otherUserId: CAROL, kind: 'buddy', at: AT })

    expect(await repo.ignoredIds(IVAN)).toEqual([BOB])
  })

  it('includes somebody whose account was deleted', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'ignore', at: AT })
    await db.execute(sql`update users set deleted_at = ${AT} where id = ${BOB}`)

    expect(await repo.ignoredIds(IVAN)).toEqual([BOB])
  })

  it('is empty for somebody with no lists', async () => {
    expect(await repo.ignoredIds(CAROL)).toEqual([])
  })
})

describe('remove', () => {
  it('removes one pair and reports whether there was one', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })

    expect(await repo.remove({ userId: IVAN, otherUserId: BOB })).toBe(true)
    expect(await repo.remove({ userId: IVAN, otherUserId: BOB })).toBe(false)
  })

  it('will not remove somebody from another member’s list', async () => {
    await repo.set({ userId: BOB, otherUserId: CAROL, kind: 'ignore', at: AT })

    expect(await repo.remove({ userId: IVAN, otherUserId: CAROL })).toBe(false)
    expect(await repo.ignores(BOB, CAROL)).toBe(true)
  })
})

describe('the cascade', () => {
  it('takes both directions with a deleted user row', async () => {
    await repo.set({ userId: IVAN, otherUserId: BOB, kind: 'buddy', at: AT })
    await repo.set({ userId: BOB, otherUserId: IVAN, kind: 'ignore', at: AT })

    await db.execute(sql`delete from users where id = ${BOB}`)

    const rows = resultRows(
      await db.execute(sql`select count(*)::int as n from user_relations`),
    ) as Array<{ n: number }>
    expect(rows[0]?.n).toBe(0)
  })
})
