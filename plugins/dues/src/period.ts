
export interface Period {
  readonly years: number
  readonly months: number
  readonly weeks: number
  readonly days: number
}

const PATTERN = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/

export function parsePeriod(spec: string): Period | null {
  const match = PATTERN.exec(spec)
  if (match === null) return null

  const [, years, months, weeks, days] = match
  const period = {
    years: Number(years ?? 0),
    months: Number(months ?? 0),
    weeks: Number(weeks ?? 0),
    days: Number(days ?? 0),
  }

  const total = period.years + period.months + period.weeks + period.days
  return total === 0 ? null : period
}

export function periodCeilingDays(period: Period): number {
  return period.years * 366 + period.months * 31 + period.weeks * 7 + period.days
}

const DAY_MS = 86_400_000

export function addPeriod(from: Date, period: Period): Date {
  let out = new Date(from.getTime())

  const months = period.years * 12 + period.months
  if (months > 0) {
    const dayOfMonth = out.getUTCDate()
    out.setUTCDate(1)
    out.setUTCMonth(out.getUTCMonth() + months)
    const lastDay = new Date(
      Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
    ).getUTCDate()
    out.setUTCDate(Math.min(dayOfMonth, lastDay))
  }

  const days = period.weeks * 7 + period.days
  if (days > 0) out = new Date(out.getTime() + days * DAY_MS)

  return out
}

export function addBillingInterval(from: Date, interval: 'month' | 'year'): Date {
  return addPeriod(from, {
    years: interval === 'year' ? 1 : 0,
    months: interval === 'month' ? 1 : 0,
    weeks: 0,
    days: 0,
  })
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

export function describePeriod(period: Period): string {
  const parts: string[] = []
  const piece = (count: number, word: string) => {
    if (count > 0) parts.push(`${count} ${word}${count === 1 ? '' : 's'}`)
  }
  piece(period.years, 'year')
  piece(period.months, 'month')
  piece(period.weeks, 'week')
  piece(period.days, 'day')
  return parts.join(', ')
}
