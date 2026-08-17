import { describe, expect, it } from 'vitest'

import { DIRECT_SOURCE, INTERNAL_SOURCE, THREAD_PATH } from '@meith/analytics'
import type { AnalyticsSummary } from '@meith/analytics'

import {
  analyticsHref,
  buildAnalyticsModel,
  dayLabel,
  pathLabel,
  sourceLabel,
} from './admin-analytics'

function summary(overrides: Partial<AnalyticsSummary> = {}): AnalyticsSummary {
  return {
    from: '2026-08-15',
    to: '2026-08-17',
    days: [
      { day: '2026-08-15', views: 10, memberViews: 4, visitors: 5, memberVisitors: 2 },
      { day: '2026-08-17', views: 5, memberViews: 0, visitors: 3, memberVisitors: 0 },
    ],
    pages: [
      { path: '/', views: 9 },
      { path: THREAD_PATH, views: 6 },
    ],
    sources: [{ source: 'news.example', views: 3 }],
    directViews: 10,
    internalViews: 2,
    recordedFrom: '2026-08-01',
    ...overrides,
  }
}

describe('buildAnalyticsModel', () => {
  it('gives every day in the range a bar, including the empty ones', () => {
    const model = buildAnalyticsModel({
      summary: summary(),
      range: 7,
      connector: 'off',
    })

    expect(model.bars).toHaveLength(7)
    expect(model.bars.map((bar) => bar.views)).toEqual([0, 0, 0, 0, 10, 0, 5])
  })

  it('scales the bars against the busiest day and keeps a counted day visible', () => {
    const model = buildAnalyticsModel({ summary: summary(), range: 7, connector: 'off' })

    const busiest = model.bars.find((bar) => bar.views === 10)
    const quieter = model.bars.find((bar) => bar.views === 5)
    const empty = model.bars.find((bar) => bar.views === 0)

    expect(busiest?.height).toBe(100)
    expect(quieter?.height).toBe(50)
    expect(empty?.height).toBe(0)
  })

  it('never rounds a counted day down to nothing', () => {
    const model = buildAnalyticsModel({
      summary: summary({
        days: [
          { day: '2026-08-16', views: 1000, memberViews: 0, visitors: 0, memberVisitors: 0 },
          { day: '2026-08-17', views: 1, memberViews: 0, visitors: 0, memberVisitors: 0 },
        ],
      }),
      range: 7,
      connector: 'off',
    })

    expect(model.bars[model.bars.length - 1]?.height).toBe(2)
  })

  it('adds the range up and averages it over the days asked for', () => {
    const model = buildAnalyticsModel({ summary: summary(), range: 30, connector: 'off' })

    expect(model.totals.views).toBe(15)
    expect(model.totals.guestViews).toBe(11)
    expect(model.viewsPerDay).toBe(1)
  })

  it('shares each page and each source of the range’s views', () => {
    const model = buildAnalyticsModel({ summary: summary(), range: 7, connector: 'off' })

    expect(model.pages[0]).toEqual({
      key: '/',
      label: 'The board index',
      views: 9,
      share: 60,
    })
    expect(model.sources[0]?.share).toBe(20)
  })

  it('marks the range that is being shown', () => {
    const model = buildAnalyticsModel({ summary: summary(), range: 90, connector: 'off' })

    expect(model.ranges.filter((range) => range.current).map((range) => range.days)).toEqual([
      90,
    ])
    expect(model.ranges.map((range) => range.href)).toEqual([
      analyticsHref(7),
      analyticsHref(30),
      analyticsHref(90),
    ])
  })

  it('says when a range holds nothing at all', () => {
    const model = buildAnalyticsModel({
      summary: summary({ days: [], pages: [], sources: [], recordedFrom: null }),
      range: 7,
      connector: 'off',
    })

    expect(model.hasCounts).toBe(false)
    expect(model.totals.busiestDay).toBeNull()
    expect(model.bars.every((bar) => bar.height === 0)).toBe(true)
  })
})

describe('labels', () => {
  it('names the day in the reader’s language, in UTC', () => {
    expect(dayLabel('2026-08-17')).toBe('17 Aug')
  })

  it('says what a bucketed path stands for', () => {
    expect(pathLabel('/')).toBe('The board index')
    expect(pathLabel(THREAD_PATH)).toContain('Threads')
    expect(pathLabel('/12')).toBe('Forum 12')
    expect(pathLabel('/search')).toBe('/search')
  })

  it('explains the two bookkeeping sources and passes a host through', () => {
    expect(sourceLabel(DIRECT_SOURCE)).toContain('no referrer')
    expect(sourceLabel(INTERNAL_SOURCE)).toContain('this board')
    expect(sourceLabel('news.example')).toBe('news.example')
  })
})
