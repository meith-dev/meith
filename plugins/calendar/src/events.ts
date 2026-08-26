export const MAX_TITLE = 120

export const MAX_LOCATION = 120

export const MAX_DURATION_HOURS = 24 * 14

export interface EventDraft {
  readonly title: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly location: string
  readonly threadId: number | null
}

export type DraftProblem =
  | 'title-missing'
  | 'title-too-long'
  | 'location-too-long'
  | 'starts-missing'
  | 'ends-before-starts'
  | 'too-long'

export interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly location: string
  readonly threadId: number | null
  readonly createdByUserId: number | null
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

  if (problems.length > 0 || startsAt === null) return { draft: null, problems }

  return {
    draft: { title, startsAt, endsAt, location, threadId: parseThreadRef(form.thread ?? '') },
    problems: [],
  }
}

export function isUpcoming(event: CalendarEvent, now: Date): boolean {
  const finishes = event.endsAt ?? event.startsAt
  return finishes.getTime() >= now.getTime()
}

export function byStart(a: CalendarEvent, b: CalendarEvent): number {
  return a.startsAt.getTime() - b.startsAt.getTime()
}

export function eventHref(event: CalendarEvent): string | null {
  return event.threadId === null ? null : `/threads/${event.threadId}`
}
