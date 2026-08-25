import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RedisCacheDriver } from '@meith/drivers'

import { redisServerAvailable, startTestRedis, type TestRedis } from './redis.fixture'

const describeIfRedis = redisServerAvailable() ? describe : describe.skip

interface Internals {
  ready: Promise<unknown> | undefined
  client: { isOpen: boolean }
}

function internals(driver: RedisCacheDriver): Internals {
  return driver as unknown as Internals
}

describeIfRedis('RedisCacheDriver over a URL, the way resolve() builds it', () => {
  let redis: TestRedis
  const opened: RedisCacheDriver[] = []

  beforeAll(async () => {
    redis = await startTestRedis()
  }, 30_000)

  afterAll(async () => {
    for (const driver of opened) await driver.close()
    await redis?.close()
  })

  function driver(keyPrefix: string): RedisCacheDriver {
    const made = new RedisCacheDriver({ url: redis.url, keyPrefix })
    opened.push(made)
    return made
  }

  it('round-trips a value over TCP rather than a unix socket', async () => {
    const cache = driver('url-roundtrip:')

    await cache.set('settings', { closed: true })

    expect(await cache.get('settings')).toEqual({ closed: true })
  })

  it('connects lazily, so constructing the bundle opens no socket', () => {
    const cache = driver('url-lazy:')

    expect(internals(cache).ready).toBeUndefined()
    expect(internals(cache).client.isOpen).toBe(false)
  })

  it('connects once per instance however many operations run', async () => {
    const cache = driver('url-reuse:')

    await Promise.all(Array.from({ length: 20 }, (_, n) => cache.set(`k${n}`, n)))
    const afterWrites = internals(cache).ready

    for (let n = 0; n < 20; n++) await cache.get(`k${n}`)

    expect(afterWrites).toBeDefined()
    expect(internals(cache).ready).toBe(afterWrites)
    expect(internals(cache).client.isOpen).toBe(true)
  })

  it('serves a second instance holding its own connection', async () => {
    const a = driver('url-shared:')
    const b = driver('url-shared:')

    await a.set('k', 'written-by-a')

    expect(await b.get('k')).toBe('written-by-a')
    expect(internals(a).ready).not.toBe(internals(b).ready)
  })
})
