import { dayRange, type DayKey } from './day'

export const RANGE_CHOICES = [7, 30, 90] as const

export type RangeChoice = (typeof RANGE_CHOICES)[number]

export const DEFAULT_RANGE: RangeChoice = 30

export const TOP_LIST_SIZE = 10

export interface AnalyticsDay {
  readonly day: DayKey
  readonly views: number
  readonly memberViews: number
  readonly visitors: number
  readonly memberVisitors: number
}

export interface AnalyticsPage {
  readonly path: string
  readonly views: number
}

export interface AnalyticsSource {
  readonly source: string
  readonly views: number
}

export interface AnalyticsSummary {
  readonly from: DayKey
  readonly to: DayKey
  readonly days: readonly AnalyticsDay[]
  readonly pages: readonly AnalyticsPage[]
  readonly sources: readonly AnalyticsSource[]
  readonly directViews: number
  readonly internalViews: number
  readonly recordedFrom: DayKey | null
}

export interface AnalyticsTotals {
  readonly views: number
  readonly memberViews: number
  readonly guestViews: number
  readonly visitors: number
  readonly memberVisitors: number
  readonly guestVisitors: number
  readonly busiestDay: AnalyticsDay | null
}

export function rangeChoice(raw: string | undefined): RangeChoice {
  const asked = Number(raw)
  const found = RANGE_CHOICES.find((choice) => choice === asked)
  return found ?? DEFAULT_RANGE
}

export function emptyDay(day: DayKey): AnalyticsDay {
  return { day, views: 0, memberViews: 0, visitors: 0, memberVisitors: 0 }
}

export function fillDays(input: {
  readonly to: DayKey
  readonly days: number
  readonly recorded: readonly AnalyticsDay[]
}): readonly AnalyticsDay[] {
  const byDay = new Map(input.recorded.map((row) => [row.day, row]))

  return dayRange({ to: input.to, days: input.days }).map(
    (day) => byDay.get(day) ?? emptyDay(day),
  )
}

export function analyticsTotals(days: readonly AnalyticsDay[]): AnalyticsTotals {
  let views = 0
  let memberViews = 0
  let visitors = 0
  let memberVisitors = 0
  let busiestDay: AnalyticsDay | null = null

  for (const day of days) {
    views += day.views
    memberViews += day.memberViews
    visitors += day.visitors
    memberVisitors += day.memberVisitors

    if (day.views > 0 && (busiestDay === null || day.views > busiestDay.views)) {
      busiestDay = day
    }
  }

  return {
    views,
    memberViews,
    guestViews: views - memberViews,
    visitors,
    memberVisitors,
    guestVisitors: visitors - memberVisitors,
    busiestDay,
  }
}
