import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { DIRECT_SOURCE, INTERNAL_SOURCE } from '@meith/analytics'

import { PostgresAnalyticsRepository } from './analytics-repo'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'

let harness: TestDb
let db: Database
let repo: PostgresAnalyticsRepository

const NOW = new Date('2026-08-17T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresAnalyticsRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from analytics_days`)
  await db.execute(sql`delete from analytics_pages`)
  await db.execute(sql`delete from analytics_sources`)
  await db.execute(sql`delete from analytics_visitors`)
})

function view(overrides: Partial<Parameters<typeof repo.record>[0]> = {}) {
  return {
    day: '2026-08-17',
    path: '/',
    source: DIRECT_SOURCE,
    visitor: 'visitor-a',
    member: false,
    now: NOW,
    ...overrides,
  }
}

const RANGE = { from: '2026-08-11', to: '2026-08-17', topPages: 10, topSources: 10 }

describe('record', () => {
  it('counts the first view of a day', async () => {
    await repo.record(view())

    const summary = await repo.summarise(RANGE)

    expect(summary.days).toEqual([
      {
        day: '2026-08-17',
        views: 1,
        memberViews: 0,
        visitors: 1,
        memberVisitors: 0,
      },
    ])
    expect(summary.pages).toEqual([{ path: '/', views: 1 }])
    expect(summary.directViews).toBe(1)
    expect(summary.recordedFrom).toBe('2026-08-17')
  })

  it('counts a returning reader once as a visitor and twice as a view', async () => {
    await repo.record(view())
    await repo.record(view({ path: '/12' }))

    const [day] = (await repo.summarise(RANGE)).days

    expect(day?.views).toBe(2)
    expect(day?.visitors).toBe(1)
  })

  it('counts a second reader separately', async () => {
    await repo.record(view())
    await repo.record(view({ visitor: 'visitor-b' }))

    const [day] = (await repo.summarise(RANGE)).days

    expect(day?.views).toBe(2)
    expect(day?.visitors).toBe(2)
  })

  it('keeps the member share of views and visitors', async () => {
    await repo.record(view())
    await repo.record(view({ visitor: 'visitor-m', member: true }))
    await repo.record(view({ visitor: 'visitor-m', member: true, path: '/12' }))

    const [day] = (await repo.summarise(RANGE)).days

    expect(day).toEqual({
      day: '2026-08-17',
      views: 3,
      memberViews: 2,
      visitors: 2,
      memberVisitors: 1,
    })
  })

  it('counts the same reader again on the next day', async () => {
    await repo.record(view())
    await repo.record(view({ day: '2026-08-16', visitor: 'visitor-a-yesterday' }))

    const summary = await repo.summarise(RANGE)

    expect(summary.days.map((row) => [row.day, row.visitors])).toEqual([
      ['2026-08-16', 1],
      ['2026-08-17', 1],
    ])
  })

  it('adds a page up across the range and ranks the busiest first', async () => {
    await repo.record(view({ path: '/12' }))
    await repo.record(view({ path: '/12', day: '2026-08-16', visitor: 'v2' }))
    await repo.record(view({ path: '/', visitor: 'v3' }))

    expect((await repo.summarise(RANGE)).pages).toEqual([
      { path: '/12', views: 2 },
      { path: '/', views: 1 },
    ])
  })

  it('separates external sources from direct and internal arrivals', async () => {
    await repo.record(view({ source: 'news.example' }))
    await repo.record(view({ source: 'news.example', visitor: 'v2' }))
    await repo.record(view({ source: INTERNAL_SOURCE, visitor: 'v3' }))
    await repo.record(view({ source: DIRECT_SOURCE, visitor: 'v4' }))

    const summary = await repo.summarise(RANGE)

    expect(summary.sources).toEqual([{ source: 'news.example', views: 2 }])
    expect(summary.internalViews).toBe(1)
    expect(summary.directViews).toBe(1)
  })

  it('leaves days outside the range alone', async () => {
    await repo.record(view({ day: '2026-08-01' }))

    const summary = await repo.summarise(RANGE)

    expect(summary.days).toEqual([])
    expect(summary.pages).toEqual([])
    expect(summary.recordedFrom).toBe('2026-08-01')
  })

  it('has nothing to report on a board that has never counted', async () => {
    const summary = await repo.summarise(RANGE)

    expect(summary.days).toEqual([])
    expect(summary.recordedFrom).toBeNull()
  })
})

describe('prune', () => {
  it('deletes every row before the cutoff and keeps the rest', async () => {
    await repo.record(view({ day: '2026-05-01' }))
    await repo.record(view({ day: '2026-08-17', visitor: 'v2' }))

    const removed = await repo.prune('2026-06-01')

    expect(removed).toBe(4)
    expect((await repo.summarise(RANGE)).recordedFrom).toBe('2026-08-17')
  })

  it('removes nothing when everything is inside the window', async () => {
    await repo.record(view())

    expect(await repo.prune('2026-01-01')).toBe(0)
  })
})
