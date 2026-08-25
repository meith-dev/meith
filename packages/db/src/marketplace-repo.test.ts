import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { MarketplaceFeed } from '@meith/marketplace'

import type { Database } from './client'
import { PostgresMarketplaceCacheRepository } from './marketplace-repo'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let repository: PostgresMarketplaceCacheRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repository = new PostgresMarketplaceCacheRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from marketplace_catalog`)
})

const FEED: MarketplaceFeed = {
  schema: 'https://www.meith.dev/marketplace/v1.json#/schema',
  listings: [
    {
      key: 'dues',
      kind: 'plugin',
      package: '@meith/plugin-dues',
      name: 'Dues',
      description: 'Paid memberships through Stripe.',
      screenshots: ['/marketplace/screenshots/dues-light.png'],
      version: '0.16.0',
      apiVersion: 0,
      meith: '>=0.16 <1',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'MIT',
    },
  ],
}

describe('PostgresMarketplaceCacheRepository', () => {
  it('reads an empty cache before anything has been saved', async () => {
    expect(await repository.read()).toEqual({
      feed: null,
      sourceUrl: null,
      fetchedAt: null,
      error: null,
      errorAt: null,
    })
  })

  it('saves and reads back a fetched feed', async () => {
    const fetchedAt = new Date('2026-01-01T00:00:00Z')
    await repository.saveFeed({
      feed: FEED,
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt,
    })

    const cached = await repository.read()
    expect(cached.feed).toEqual(FEED)
    expect(cached.sourceUrl).toBe('https://www.meith.dev/marketplace/v1.json')
    expect(cached.fetchedAt).toEqual(fetchedAt)
    expect(cached.error).toBeNull()
  })

  it('records an error without touching a previously cached feed', async () => {
    const fetchedAt = new Date('2026-01-01T00:00:00Z')
    await repository.saveFeed({
      feed: FEED,
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt,
    })

    const errorAt = new Date('2026-01-02T00:00:00Z')
    await repository.saveError({ message: 'could not reach the host', at: errorAt })

    const cached = await repository.read()
    expect(cached.feed).toEqual(FEED)
    expect(cached.error).toBe('could not reach the host')
    expect(cached.errorAt).toEqual(errorAt)
  })

  it('clears a previous error once a fetch succeeds', async () => {
    await repository.saveError({ message: 'unreachable', at: new Date() })
    await repository.saveFeed({
      feed: FEED,
      sourceUrl: 'https://www.meith.dev/marketplace/v1.json',
      fetchedAt: new Date(),
    })

    const cached = await repository.read()
    expect(cached.error).toBeNull()
    expect(cached.errorAt).toBeNull()
  })

  it('tracks notified (plugin, version) pairs independently', async () => {
    expect(await repository.claimNotified('dues', '0.17.0')).toBe(true)

    expect(await repository.claimNotified('dues', '0.17.0')).toBe(false)
    expect(await repository.claimNotified('dues', '0.18.0')).toBe(true)
    expect(await repository.claimNotified('other', '0.17.0')).toBe(true)
  })

  it('accumulates more than one notified version without losing earlier ones', async () => {
    await repository.claimNotified('dues', '0.17.0')
    await repository.claimNotified('dues', '0.18.0')

    expect(await repository.claimNotified('dues', '0.17.0')).toBe(false)
    expect(await repository.claimNotified('dues', '0.18.0')).toBe(false)
  })

  it('is idempotent: claiming the same version twice only succeeds once', async () => {
    expect(await repository.claimNotified('dues', '0.17.0')).toBe(true)
    expect(await repository.claimNotified('dues', '0.17.0')).toBe(false)
  })

  it('lets exactly one of two concurrent claims for the same version win', async () => {
    const [first, second] = await Promise.all([
      repository.claimNotified('dues', '0.17.0'),
      repository.claimNotified('dues', '0.17.0'),
    ])

    expect([first, second].filter(Boolean)).toHaveLength(1)
  })
})
