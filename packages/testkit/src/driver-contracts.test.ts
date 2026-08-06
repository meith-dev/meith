import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LocalFileStore,
  LogMailDriver,
  MemoryCache,
  MemoryMailDriver,
  MemoryQueue,
  PostgresQueue,
} from '@meith/drivers'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll } from 'vitest'

import {
  cacheDriverContract,
  fileStoreContract,
  mailDriverContract,
  queueDriverContract,
} from './driver-contracts'

cacheDriverContract('MemoryCache', () => new MemoryCache())

queueDriverContract('MemoryQueue', () => new MemoryQueue())

let queueHarness: TestDb

beforeAll(async () => {
  queueHarness = await createTestDb()
}, 60_000)

afterAll(async () => {
  await queueHarness?.close()
})

queueDriverContract('PostgresQueue', async () => {
  await queueHarness.db.execute(sql`delete from jobs`)
  return new PostgresQueue(queueHarness.db)
})

fileStoreContract('LocalFileStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forum-filestore-'))
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return new LocalFileStore(dir, 'http://localhost:3000/uploads')
})

mailDriverContract('MemoryMailDriver', () => new MemoryMailDriver())
mailDriverContract('LogMailDriver', () => new LogMailDriver())
