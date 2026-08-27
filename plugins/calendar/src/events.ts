export const MAX_TITLE = 120

export const MAX_LOCATION = 120

export const MAX_LINK_LABEL = 40

export const MAX_LINK_URL = 500

export const MAX_DURATION_HOURS = 24 * 14

export interface EventDraft {
  readonly title: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly location: string
  readonly threadId: number | null
  readonly linkUrl: string
  readonly linkLabel: string
}

export type DraftProblem =
  | 'title-missing'
  | 'title-too-long'
  | 'location-too-long'
  | 'starts-missing'
  | 'ends-before-starts'
  | 'too-long'
  | 'link-not-a-url'
  | 'link-too-long'
  | 'link-label-too-long'
  | 'link-label-without-link'

export interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly location: string
  readonly threadId: number | null
  readonly createdByUserId: number | null
  readonly linkUrl: string
  readonly linkLabel: string
}

export const DEFAULT_LINK_LABEL = 'calendar.event.linkFallback'

export function safeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > MAX_LINK_URL) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.hostname === '') return null

  return parsed.toString()
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseThreadRef(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const fromUrl = /\/threads?\/(\d+)/.exec(trimmed)
  const digits = fromUrl?.[1] ?? (/^\d+$/.test(trimmed) ? trimmed : null)
  if (digits === null) return null

  const id = Number(digits)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function readDraft(form: Readonly<Record<string, string>>): {
  readonly draft: EventDraft | null
  readonly problems: readonly DraftProblem[]
} {
  const problems: DraftProblem[] = []

  const title = (form.title ?? '').trim()
  if (title === '') problems.push('title-missing')
  else if (title.length > MAX_TITLE) problems.push('title-too-long')

  const location = (form.location ?? '').trim()
  if (location.length > MAX_LOCATION) problems.push('location-too-long')

  const startsAt = parseDate(form.starts_at ?? '')
  if (startsAt === null) problems.push('starts-missing')

  const endsAt = parseDate(form.ends_at ?? '')
  if (startsAt !== null && endsAt !== null) {
    if (endsAt.getTime() <= startsAt.getTime()) problems.push('ends-before-starts')
    else if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_HOURS * 3_600_000) {
      problems.push('too-long')
    }
  }

  const rawLink = (form.link ?? '').trim()
  const linkLabel = (form.link_text ?? '').trim()
  const linkUrl = rawLink === '' ? '' : (safeLinkUrl(rawLink) ?? '')

  if (rawLink !== '' && linkUrl === '') {
    problems.push(rawLink.length > MAX_LINK_URL ? 'link-too-long' : 'link-not-a-url')
  }
  if (linkLabel.length > MAX_LINK_LABEL) problems.push('link-label-too-long')
  if (linkLabel !== '' && rawLink === '') problems.push('link-label-without-link')

  if (problems.length > 0 || startsAt === null) return { draft: null, problems }

  return {
    draft: {
      title,
      startsAt,
      endsAt,
      location,
      threadId: parseThreadRef(form.thread ?? ''),
      linkUrl,
      linkLabel,
    },
    problems: [],
  }
}

export const DEFAULT_LOCALE = 'en-GB'

const DATE_AND_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
}

const TIME_ONLY: Intl.DateTimeFormatOptions = { timeStyle: 'short', timeZone: 'UTC' }

function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

export function formatRange(
  startsAt: Date,
  endsAt: Date | null,
  locale: string = DEFAULT_LOCALE,
): string {
  const start = new Intl.DateTimeFormat(locale, DATE_AND_TIME).format(startsAt)
  if (endsAt === null) return start

  const end = sameUtcDay(startsAt, endsAt)
    ? new Intl.DateTimeFormat(locale, TIME_ONLY).format(endsAt)
    : new Intl.DateTimeFormat(locale, DATE_AND_TIME).format(endsAt)

  return `${start} — ${end}`
}

export interface DayParts {
  readonly day: string
  readonly weekday: string
}

export function dayParts(date: Date, locale: string = DEFAULT_LOCALE): DayParts {
  return {
    day: new Intl.DateTimeFormat(locale, { day: '2-digit', timeZone: 'UTC' }).format(date),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
      .format(date)
      .toUpperCase(),
  }
}

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export function monthLabel(date: Date, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(date)
    .toUpperCase()
}

export interface EventMonth {
  readonly key: string
  readonly label: string
  readonly events: readonly CalendarEvent[]
}

export function groupByMonth(
  events: readonly CalendarEvent[],
  locale: string = DEFAULT_LOCALE,
): readonly EventMonth[] {
  const months: EventMonth[] = []

  for (const event of events) {
    const key = monthKey(event.startsAt)
    const last = months.at(-1)

    if (last !== undefined && last.key === key) {
      months[months.length - 1] = { ...last, events: [...last.events, event] }
      continue
    }
    months.push({ key, label: monthLabel(event.startsAt, locale), events: [event] })
  }

  return months
}

function wholeDaysBetween(from: Date, to: Date): number {
  const day = 86_400_000
  const startOf = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.round((startOf(to) - startOf(from)) / day)
}

export function relativeHint(startsAt: Date, now: Date, locale: string = DEFAULT_LOCALE): string {
  const days = wholeDaysBetween(now, startsAt)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (Math.abs(days) < 7) return format.format(days, 'day')
  if (Math.abs(days) < 31) return format.format(Math.trunc(days / 7), 'week')
  return format.format(Math.trunc(days / 30), 'month')
}

export function isUpcoming(event: CalendarEvent, now: Date): boolean {
  const finishes = event.endsAt ?? event.startsAt
  return finishes.getTime() >= now.getTime()
}

export function pickThreadEvent(events: readonly CalendarEvent[], now: Date): CalendarEvent | null {
  if (events.length === 0) return null

  const upcoming = events.filter((event) => isUpcoming(event, now)).sort(byStart)
  if (upcoming.length > 0) return upcoming[0] ?? null

  return [...events].sort(byStart).at(-1) ?? null
}

export function byStart(a: CalendarEvent, b: CalendarEvent): number {
  return a.startsAt.getTime() - b.startsAt.getTime()
}

export function eventHref(event: CalendarEvent): string | null {
  return event.threadId === null ? null : `/threads/${event.threadId}`
}
