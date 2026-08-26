import type { CalendarEvent } from './events'

export const ICS_CONTENT_TYPE = `text/calendar; charset=utf-8`

export const DEFAULT_DURATION_MINUTES = 60

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function fold(line: string): string {
  if (line.length <= 75) return line

  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest.length > 0) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

export function icsFileName(event: CalendarEvent): string {
  const slug = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug === '' ? 'event' : slug}.ics`
}

export function absoluteBase(boardUrl: string): string | null {
  const trimmed = boardUrl.trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+/.test(trimmed) ? trimmed : null
}

export function toIcs(event: CalendarEvent, boardUrl: string, now: Date): string {
  const ends =
    event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000)

  const base = absoluteBase(boardUrl)
  const host = base === null ? 'meith' : base.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meith//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:calendar-${event.id}@${host}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(ends)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location === '' ? [] : [`LOCATION:${escapeText(event.location)}`]),
    ...(event.threadId === null || base === null
      ? []
      : [`URL:${escapeText(`${base}/threads/${event.threadId}`)}`]),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(fold).join('\r\n')}\r\n`
}
