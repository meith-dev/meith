/**
 * F07's relay read side, against real Postgres.
 *
 * The claim is a single `UPDATE ... FOR UPDATE SKIP LOCKED`, and the reason it
 * is written that way — two overlapping relays must partition the backlog —
 * cannot be observed anywhere but a real database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresOutboxReader } from './outbox-repo'
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
    await reader.markRelayed(claimed.map((r) => r.id))

    expect(await reader.claimUnrelayed(10)).toEqual([])
  })

  it('re-claims an event whose relay never marked it', async () => {
    await addEvent(1)
    await reader.claimUnrelayed(10)

    /*
     * The relay marks rows *after* the enqueue returns, so a process that dies
     * in between must leave the event claimable. At-least-once is the contract:
     * a duplicate is absorbed by the queue's idempotency key and by the
     * handler's own ledger, while a lost event is unrecoverable.
     */
    expect(await reader.claimUnrelayed(10)).toHaveLength(1)
  })

  it('gives up on an event that has exhausted its claims', async () => {
    await addEvent(1)
    for (let i = 0; i < 10; i++) await reader.claimUnrelayed(10)

    // A poison event stops being claimed rather than blocking the backlog
    // behind it forever — and stays visible to the operator.
    expect(await reader.claimUnrelayed(10)).toEqual([])
    expect(await reader.stuck()).toHaveLength(1)
  })

  it('marks nothing when given no ids', async () => {
    await addEvent(1)
    await reader.markRelayed([])

    expect(await db.select().from(outbox)).toHaveLength(1)
  })
})
