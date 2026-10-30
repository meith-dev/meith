import { readFileSync } from 'node:fs'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import { jobs } from './schema'

let harness: TestDb
beforeAll(async () => {
  harness = await createTestDb()
}, 60_000)
afterAll(async () => {
  await harness.close()
})

it('preserves completed work and retires legacy duplicate keys before adding uniqueness', async () => {
  await harness.db.execute(sql`drop index jobs_idempotency_key`)
  await harness.db.execute(
    sql`create unique index jobs_idempotency_key on jobs (idempotency_key) where idempotency_key is not null and status = 'pending'`,
  )
  await harness.db.execute(sql`
    insert into jobs (kind, idempotency_key, status) values
      ('completed', 'first', 'done'), ('pending-duplicate', 'first', 'pending'),
      ('running-duplicate', 'first', 'running'), ('running', 'second', 'running'),
      ('second-duplicate', 'second', 'pending'), ('empty-pending', '', 'pending'),
      ('empty-done', '', 'done')
  `)
  const source = readFileSync(
    new URL('../migrations/0072_job_idempotency.sql', import.meta.url),
    'utf8',
  )
  await harness.client.exec(source.split('--> statement-breakpoint').join('\n'))
  const rows = await harness.db.select().from(jobs)
  expect(rows).toHaveLength(7)
  expect(rows.filter((row) => row.idempotencyKey === 'first')).toMatchObject([
    { kind: 'completed', status: 'done' },
  ])
  expect(rows.filter((row) => row.idempotencyKey === 'second')).toMatchObject([
    { kind: 'running', status: 'running' },
  ])
  expect(rows.find((row) => row.kind === 'pending-duplicate')).toMatchObject({
    status: 'dead',
    idempotencyKey: null,
  })
  expect(rows.find((row) => row.kind === 'running-duplicate')).toMatchObject({
    status: 'dead',
    idempotencyKey: null,
  })
  expect(rows.find((row) => row.kind === 'empty-pending')).toMatchObject({
    status: 'pending',
    idempotencyKey: null,
  })
  await expect(
    harness.db.execute(sql`insert into jobs (kind, idempotency_key) values ('replay', 'first')`),
  ).rejects.toThrow()
})
