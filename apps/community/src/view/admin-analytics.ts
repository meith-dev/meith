import {
  DIRECT_SOURCE,
  INTERNAL_SOURCE,
  MEMBER_PATH,
  RANGE_CHOICES,
  THREAD_PATH,
  analyticsTotals,
  fillDays,
  startOfDay,
  type AnalyticsSummary,
  type AnalyticsTotals,
  type ConnectorState,
  type DayKey,
  type RangeChoice,
} from '@meith/analytics'

export const ANALYTICS_HREF = '/admin/analytics'

export interface AnalyticsBar {
  readonly day: DayKey
  readonly label: string
  readonly views: number
  readonly visitors: number
  readonly height: number
}

export interface AnalyticsEntry {
  readonly key: string
  readonly label: string
  readonly views: number
  readonly share: number
}

export interface AnalyticsRangeLink {
  readonly days: RangeChoice
  readonly label: string
  readonly href: string
  readonly current: boolean
}

export interface AnalyticsModel {
  readonly range: RangeChoice
  readonly bars: readonly AnalyticsBar[]
  readonly totals: AnalyticsTotals
  readonly viewsPerDay: number
  readonly pages: readonly AnalyticsEntry[]
  readonly sources: readonly AnalyticsEntry[]
  readonly directViews: number
  readonly internalViews: number
  readonly ranges: readonly AnalyticsRangeLink[]
  readonly recordedFrom: DayKey | null
  readonly hasCounts: boolean
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function analyticsHref(days: RangeChoice): string {
  return `${ANALYTICS_HREF}?days=${days}`
}

export function dayLabel(day: DayKey): string {
  return DAY_LABEL.format(startOfDay(day))
}

export function pathLabel(path: string): string {
  if (path === '/') return 'The board index'
  if (path === THREAD_PATH) return 'Threads (every thread together)'
  if (path === MEMBER_PATH) return 'Profiles (every member together)'
  if (/^\/\d+$/.test(path)) return `Forum ${path.slice(1)}`
  return path
}

export function sourceLabel(source: string): string {
  if (source === DIRECT_SOURCE) return 'Typed in, or a link with no referrer'
  if (source === INTERNAL_SOURCE) return 'A link on this board'
  return source
}

function share(views: number, total: number): number {
  return total === 0 ? 0 : Math.round((views / total) * 100)
}

export function buildAnalyticsModel(input: {
  readonly summary: AnalyticsSummary
  readonly range: RangeChoice
  readonly connector: ConnectorState
}): AnalyticsModel {
  const days = fillDays({
    to: input.summary.to,
    days: input.range,
    recorded: input.summary.days,
  })

  const totals = analyticsTotals(days)
  const busiest = totals.busiestDay?.views ?? 0

  const bars = days.map((day) => ({
    day: day.day,
    label: dayLabel(day.day),
    views: day.views,
    visitors: day.visitors,
    height:
      busiest === 0 || day.views === 0
        ? 0
        : Math.max(2, Math.round((day.views / busiest) * 100)),
  }))

  return {
    range: input.range,
    bars,
    totals,
    viewsPerDay: Math.round(totals.views / input.range),
    pages: input.summary.pages.map((page) => ({
      key: page.path,
      label: pathLabel(page.path),
      views: page.views,
      share: share(page.views, totals.views),
    })),
    sources: input.summary.sources.map((source) => ({
      key: source.source,
      label: sourceLabel(source.source),
      views: source.views,
      share: share(source.views, totals.views),
    })),
    directViews: input.summary.directViews,
    internalViews: input.summary.internalViews,
    ranges: RANGE_CHOICES.map((days) => ({
      days,
      label: `${days} days`,
      href: analyticsHref(days),
      current: days === input.range,
    })),
    recordedFrom: input.summary.recordedFrom,
    hasCounts: totals.views > 0,
  }
}
