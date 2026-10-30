import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { PostgresOutboxReader } from './outbox-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { outbox } from './schema'

let harness: TestDb
let db: Database
let reader: PostgresOutboxReader

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  reader = new PostgresOutboxReader(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from outbox`)
})

async function addEvent(postId: number): Promise<void> {
  await db.execute(sql`
    insert into outbox (topic, payload)
    values ('post.created', ${JSON.stringify({ postId })}::jsonb)
  `)
}

describe('PostgresOutboxReader', () => {
  it('claims undispatched events oldest first, bounded by the limit', async () => {
    await addEvent(1)
    await addEvent(2)
    await addEvent(3)

    const claimed = await reader.claimUnrelayed(2)

    expect(claimed).toHaveLength(2)
    expect(claimed[0]!.name).toBe('post.created')
    expect(claimed[0]!.payload).toEqual({ postId: 1 })
    expect(claimed[1]!.payload).toEqual({ postId: 2 })
  })

  it('stops returning an event once it is marked relayed', async () => {
    await addEvent(1)
    const claimed = await reader.claimUnrelayed(10)
    await reader.markRelayed(claimed)

    expect(await reader.claimUnrelayed(10)).toEqual([])
  })

  it('holds a live lease and reclaims it after expiration', async () => {
    await addEvent(1)
    await reader.claimUnrelayed(10)

    expect(await reader.claimUnrelayed(10)).toHaveLength(0)
    await db.execute(sql`update outbox set locked_until = now() - interval '1 second'`)
    expect(await reader.claimUnrelayed(10)).toHaveLength(1)
  })

  it('gives up on an event that has exhausted its claims', async () => {
    await addEvent(1)
    for (let i = 0; i < 10; i++) {
      await reader.claimUnrelayed(10)
      await db.execute(sql`update outbox set locked_until = now() - interval '1 second'`)
    }

    expect(await reader.claimUnrelayed(10)).toEqual([])
    expect(await reader.stuck()).toHaveLength(1)
  })

  it('does not let an older claimant acknowledge a renewed lease', async () => {
    await addEvent(1)
    const stale = await reader.claimUnrelayed(1)
    await db.execute(sql`update outbox set locked_until = now() - interval '1 second'`)
    const fresh = await new PostgresOutboxReader(db).claimUnrelayed(1)
    await reader.markRelayed(stale)
    expect((await db.select().from(outbox))[0]?.dispatchedAt).toBeNull()
    await reader.markRelayed(fresh)
    expect((await db.select().from(outbox))[0]?.dispatchedAt).not.toBeNull()
  })

  it('marks nothing when given no ids', async () => {
    await addEvent(1)
    await reader.markRelayed([])

    expect(await db.select().from(outbox)).toHaveLength(1)
  })
})
