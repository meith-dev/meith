import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import {
  LocalFileStore,
  LogMailDriver,
  MemoryCache,
  MemoryMailDriver,
  MemoryQueue,
  PostgresQueue,
  RedisCacheDriver,
} from '@meith/drivers'

import {
  cacheDriverContract,
  fileStoreContract,
  mailDriverContract,
  queueDriverContract,
} from './driver-contracts'
import { redisServerAvailable, startTestRedis, type TestRedis } from './redis.fixture'

cacheDriverContract('MemoryCache', () => new MemoryCache())

if (redisServerAvailable()) {
  let redis: TestRedis
  const opened: RedisCacheDriver[] = []
  let isolation = 0

  beforeAll(async () => {
    redis = await startTestRedis()
  }, 30_000)

  afterAll(async () => {
    for (const driver of opened) await driver.close()
    await redis?.close()
  })

  const makeRedisCache = (keyPrefix?: string): RedisCacheDriver => {
    const driver = new RedisCacheDriver({
      socketPath: redis.socketPath,
      keyPrefix: keyPrefix ?? `contract-${isolation++}:`,
    })
    opened.push(driver)
    return driver
  }

  cacheDriverContract('RedisCacheDriver', () => makeRedisCache())

  describe('RedisCacheDriver across processes', () => {
    it('shows one instance a value another wrote', async () => {
      const prefix = `shared-${isolation++}:`
      const a = makeRedisCache(prefix)
      const b = makeRedisCache(prefix)

      await a.set('settings', { closed: true }, { tags: ['t'] })
      expect(await b.get('settings')).toEqual({ closed: true })
    })

    it('invalidating a tag on one instance clears it for every other', async () => {
      const prefix = `shared-${isolation++}:`
      const a = makeRedisCache(prefix)
      const b = makeRedisCache(prefix)

      await a.set('filters', ['old'], { tags: ['t'] })
      expect(await b.get('filters')).toEqual(['old'])

      await b.invalidateTags(['t'])

      expect(await a.get('filters')).toBeUndefined()
      expect(await b.get('filters')).toBeUndefined()
    })

    it('keeps instances with different prefixes apart', async () => {
      const a = makeRedisCache(`apart-a-${isolation}:`)
      const b = makeRedisCache(`apart-b-${isolation++}:`)

      await a.set('k', 'a-value')
      expect(await b.get('k')).toBeUndefined()
    })
  })
} else {
  describe.skip('CacheDriver contract: RedisCacheDriver (no valkey-server or redis-server)', () => {
    it('skipped', () => undefined)
  })
}

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
