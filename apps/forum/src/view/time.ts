import type { TimeModel } from '@meith/theme-kit'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export const DEFAULT_TIMEZONE = 'UTC'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

interface CalendarParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function partsIn(date: Date, timeZone: string): CalendarParts {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
  } catch {
    return partsIn(date, DEFAULT_TIMEZONE)
  }

  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    hour: Number(parts.get('hour')) % 24,
    minute: Number(parts.get('minute')),
  }
}

function sameDay(a: CalendarParts, b: CalendarParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function formatTime(
  at: Date,
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): TimeModel {
  const iso = at.toISOString()

  const when = partsIn(at, timeZone)
  const today = partsIn(now, timeZone)
  const time = `${pad(when.hour)}:${pad(when.minute)}`

  if (sameDay(when, today)) {
    return { iso, label: `Today, ${time}` }
  }

  const yesterday = partsIn(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone)
  if (sameDay(when, yesterday)) {
    return { iso, label: `Yesterday, ${time}` }
  }

  const month = MONTHS[when.month - 1]

  if (when.year === today.year) {
    return { iso, label: `${when.day} ${month}, ${time}` }
  }

  return { iso, label: `${when.day} ${month} ${when.year}` }
}

export function formatDate(at: Date, timeZone: string = DEFAULT_TIMEZONE): TimeModel {
  const when = partsIn(at, timeZone)
  return {
    iso: at.toISOString(),
    label: `${when.day} ${MONTHS[when.month - 1]} ${when.year}`,
  }
}

export function timezoneLabel(timeZone: string): string {
  return timeZone.replace(/_/g, ' ')
}
