/**
 * Every shipped driver, driven through the shared contract (F05).
 *
 * "Driver selection resolves from env with no conditional feature code
 * downstream" only holds if the implementations actually agree. This is where
 * that is checked — one suite, run once per implementation, so a divergence
 * shows up as a named failure against a named driver rather than as a bug three
 * features later.
 */
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
} from '@forum/drivers'
import { createTestDb, type TestDb } from '@forum/db/pglite.fixture'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll } from 'vitest'

import {
  cacheDriverContract,
  fileStoreContract,
  mailDriverContract,
  queueDriverContract,
} from './driver-contracts'

/* ---- Cache ---- */

cacheDriverContract('MemoryCache', () => new MemoryCache())

/* ---- Queue ---- */

queueDriverContract('MemoryQueue', () => new MemoryQueue())

/*
 * The Postgres queue is the default and the one that has to survive a
 * concurrent double-drain, since two serverless instances share no memory and a
 * JavaScript lock protects nothing. It gets a real database.
 */
let queueHarness: TestDb

beforeAll(async () => {
  queueHarness = await createTestDb()
}, 60_000)

afterAll(async () => {
  await queueHarness?.close()
})

queueDriverContract('PostgresQueue', async () => {
  // A fresh logical queue per test: the contract must not depend on ordering,
  // and these share one database for boot cost.
  await queueHarness.db.execute(sql`delete from jobs`)
  return new PostgresQueue(queueHarness.db)
})

/* ---- FileStore ---- */

fileStoreContract('LocalFileStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forum-filestore-'))
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return new LocalFileStore(dir, 'http://localhost:3000/uploads')
})

/* ---- Mail ---- */

mailDriverContract('MemoryMailDriver', () => new MemoryMailDriver())
mailDriverContract('LogMailDriver', () => new LogMailDriver())
