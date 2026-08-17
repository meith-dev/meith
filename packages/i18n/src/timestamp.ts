import type { Translator } from './translator'

export interface TimestampLabel {
  readonly iso: string
  readonly label: string
}

interface CalendarParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function formatTimestamp(at: Date, now: Date, translator: Translator): TimestampLabel {
  const iso = at.toISOString()
  const when = calendarParts(at, translator)
  const today = calendarParts(now, translator)
  const time = clock(at, translator)

  if (sameDay(when, today)) {
    return { iso, label: translator.t('time.today', { time }) }
  }

  if (sameDay(when, calendarParts(new Date(now.getTime() - DAY_IN_MS), translator))) {
    return { iso, label: translator.t('time.yesterday', { time }) }
  }

  const day = number(when.day, translator)
  const month = monthName(at, translator)

  if (when.year === today.year) {
    return { iso, label: translator.t('time.thisYear', { day, month, time }) }
  }

  return {
    iso,
    label: translator.t('time.past', { day, month, year: number(when.year, translator) }),
  }
}

export function formatDay(at: Date, translator: Translator): TimestampLabel {
  const when = calendarParts(at, translator)

  return {
    iso: at.toISOString(),
    label: translator.t('time.day', {
      day: number(when.day, translator),
      month: monthName(at, translator),
      year: number(when.year, translator),
    }),
  }
}

function calendarParts(at: Date, translator: Translator): CalendarParts {
  const parts = new Map(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: translator.timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
  }
}

function sameDay(a: CalendarParts, b: CalendarParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function clock(at: Date, translator: Translator): string {
  const cycle = translator.t('time.hourCycle')

  return translator.parts(at, {
    hour: '2-digit',
    minute: '2-digit',
    ...(cycle === 'h11' || cycle === 'h12' || cycle === 'h23' || cycle === 'h24'
      ? { hourCycle: cycle }
      : {}),
  })
}

function monthName(at: Date, translator: Translator): string {
  return translator.parts(at, { month: 'short' })
}

function number(value: number, translator: Translator): string {
  return translator.number(value, { useGrouping: false })
}
