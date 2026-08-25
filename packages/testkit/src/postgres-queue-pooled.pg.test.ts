import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createIsolatedDb, jobs } from '@meith/db'
import { migrationScript } from '@meith/db/pglite.fixture'
import { PostgresQueue } from '@meith/drivers'

const URL = process.env.TEST_DATABASE_URL
const describeIfPg = URL ? describe : describe.skip

const SCRATCH = `meith_queue_pooled_${process.pid}`

type Connection = ReturnType<typeof createIsolatedDb>

function scratchUrl(adminUrl: string): string {
  const url = new globalThis.URL(adminUrl)
  url.pathname = `/${SCRATCH}`
  return url.toString()
}

describeIfPg('PostgresQueue across separate connections, against real Postgres', () => {
  let admin: Connection
  let harness: Connection
  let url: string
  const connections: Connection[] = []

  function connect(): Connection {
    const connection = createIsolatedDb(url, 1)
    connections.push(connection)
    return connection
  }

  beforeAll(async () => {
    admin = createIsolatedDb(URL!)
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.db.execute(sql.raw(`CREATE DATABASE "${SCRATCH}"`))

    url = scratchUrl(URL!)
    harness = createIsolatedDb(url)
    await harness.db.execute(sql.raw(migrationScript()))
  }, 60_000)

  afterAll(async () => {
    for (const connection of connections) await connection.close().catch(() => undefined)
    await harness.close()
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`))
    await admin.close()
  })

  it('claims on one connection a job enqueued on another', async () => {
    const producer = connect()
    const consumer = connect()
    await producer.db.execute(sql`delete from jobs`)

    const enqueued = await new PostgresQueue(producer.db).enqueue('pooled.handoff', { n: 1 })
    expect(enqueued.deduplicated).toBe(false)

    const handled: unknown[] = []
    const result = await new PostgresQueue(consumer.db).drain(10, async (job) => {
      handled.push(job.payload)
    })

    expect(result).toEqual({ processed: 1, failed: 0 })
    expect(handled).toEqual([{ n: 1 }])

    const rows = await producer.db.select({ status: jobs.status }).from(jobs)
    expect(rows.map((row) => row.status)).toEqual(['done'])
  })

  it('hands a job to exactly one of two connections claiming at once', async () => {
    const producer = connect()
    const a = connect()
    const b = connect()
    await producer.db.execute(sql`delete from jobs`)

    for (let n = 0; n < 4; n++) {
      await new PostgresQueue(producer.db).enqueue('pooled.race', { n })
    }

    const seen: number[] = []
    const record = async (job: { payload: unknown }): Promise<void> => {
      seen.push((job.payload as { n: number }).n)
    }

    const [first, second] = await Promise.all([
      new PostgresQueue(a.db).drain(4, record),
      new PostgresQueue(b.db).drain(4, record),
    ])

    expect(first.processed + second.processed).toBe(4)
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('deduplicates across connections, so a retried invocation enqueues once', async () => {
    const a = connect()
    const b = connect()
    await a.db.execute(sql`delete from jobs`)

    const first = await new PostgresQueue(a.db).enqueue('pooled.dedupe', {}, { dedupeKey: 'k-1' })
    const second = await new PostgresQueue(b.db).enqueue('pooled.dedupe', {}, { dedupeKey: 'k-1' })

    expect(first.deduplicated).toBe(false)
    expect(second.deduplicated).toBe(true)
    expect(second.id).toBe(first.id)

    const rows = await a.db.select({ id: jobs.id }).from(jobs)
    expect(rows).toHaveLength(1)
  })
})
