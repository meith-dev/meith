import type { PluginData } from '@meith/plugin-kit'

import { byStart, type CalendarEvent, type EventDraft, occurrences, type Repeat } from './events'

interface EventRow extends Record<string, unknown> {
  readonly repeat?: Repeat
  readonly repeat_until?: string | Date | null
  readonly id: string | number
  readonly title: string
  readonly starts_at: Date | string
  readonly ends_at: Date | string | null
  readonly location: string
  readonly thread_id: number | null
  readonly created_by_user_id: number | null
  readonly link_url: string | null
  readonly link_label: string | null
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    repeat: row.repeat ?? 'none',
    repeatUntil:
      row.repeat_until == null ? null : new Date(row.repeat_until).toISOString().slice(0, 10),
    id: String(row.id),
    title: row.title,
    startsAt: new Date(row.starts_at),
    endsAt: row.ends_at === null ? null : new Date(row.ends_at),
    location: row.location,
    threadId: row.thread_id,
    createdByUserId: row.created_by_user_id,
    linkUrl: row.link_url ?? '',
    linkLabel: row.link_label ?? '',
  }
}

const COLUMNS = `id, title, starts_at, ends_at, location, thread_id, created_by_user_id,
                 link_url, link_label, repeat, repeat_until`

export async function createEvent(
  data: PluginData,
  draft: EventDraft,
  createdByUserId: number | null,
): Promise<void> {
  await data.query(
    `insert into plugin_calendar_event
       (title, starts_at, ends_at, location, thread_id, created_by_user_id, link_url, link_label, repeat, repeat_until)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      draft.title,
      draft.startsAt,
      draft.endsAt,
      draft.location,
      draft.threadId,
      createdByUserId,
      draft.linkUrl,
      draft.linkLabel,
      draft.repeat ?? 'none',
      draft.repeatUntil ?? null,
    ],
  )
}

export async function updateEvent(data: PluginData, id: string, draft: EventDraft): Promise<void> {
  await data.query(
    `update plugin_calendar_event
        set title = $2, starts_at = $3, ends_at = $4, location = $5, thread_id = $6,
            link_url = $7, link_label = $8, repeat = $9, repeat_until = $10
      where id = $1`,
    [
      id,
      draft.title,
      draft.startsAt,
      draft.endsAt,
      draft.location,
      draft.threadId,
      draft.linkUrl,
      draft.linkLabel,
      draft.repeat ?? 'none',
      draft.repeatUntil ?? null,
    ],
  )
}

export async function windowEvents(
  data: PluginData,
  from: Date,
  to: Date,
): Promise<readonly CalendarEvent[]> {
  const rows = await data.query<EventRow>(
    `select ${COLUMNS} from plugin_calendar_event
      where starts_at < $2 and
        (starts_at >= $1 or (repeat <> 'none' and
          (repeat_until is null or repeat_until >= $1::date)))
      order by starts_at`,
    [from, to],
  )
  return rows.flatMap((row) => occurrences(toEvent(row), from, to)).sort(byStart)
}

export async function eventById(data: PluginData, id: string): Promise<CalendarEvent | null> {
  const row = await data.one<EventRow>(
    `select ${COLUMNS} from plugin_calendar_event where id = $1`,
    [id],
  )
  return row === null ? null : toEvent(row)
}

export const THREAD_EVENT_SCAN = 20

export async function eventsForThread(
  data: PluginData,
  threadId: number,
): Promise<readonly CalendarEvent[]> {
  const rows = await data.query<EventRow>(
    `select ${COLUMNS} from plugin_calendar_event
      where thread_id = $1
      order by starts_at desc
      limit $2`,
    [threadId, THREAD_EVENT_SCAN],
  )
  const now = new Date()
  const from = new Date(now.getTime() - 366 * 86_400_000)
  const to = new Date(now.getTime() + 366 * 86_400_000)
  return rows.flatMap((row) => {
    const event = toEvent(row)
    return event.repeat === 'none' ? [event] : occurrences(event, from, to)
  })
}

export async function deleteEvent(data: PluginData, id: string): Promise<void> {
  await data.query(`delete from plugin_calendar_event where id = $1`, [id])
}

export async function organiserIds(data: PluginData): Promise<readonly number[]> {
  const rows = await data.query<{ user_id: number }>(
    `select user_id from plugin_calendar_organiser order by added_at`,
  )
  return rows.map((row) => Number(row.user_id))
}

export async function addOrganiser(
  data: PluginData,
  userId: number,
  addedByUserId: number | null,
): Promise<void> {
  await data.query(
    `insert into plugin_calendar_organiser (user_id, added_by_user_id)
     values ($1, $2)
     on conflict (user_id) do nothing`,
    [userId, addedByUserId],
  )
}

export async function removeOrganiser(data: PluginData, userId: number): Promise<void> {
  await data.query(`delete from plugin_calendar_organiser where user_id = $1`, [userId])
}

export const RSVP_STATUSES = ['yes', 'no', 'maybe'] as const
export const RSVP_LABELS = {
  yes: 'calendar.rsvp.yes',
  no: 'calendar.rsvp.no',
  maybe: 'calendar.rsvp.maybe',
  clear: 'calendar.rsvp.clear',
} as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

export async function saveRsvp(
  data: PluginData,
  event: CalendarEvent,
  userId: number,
  status: RsvpStatus | null,
): Promise<void> {
  const params = [event.id, event.startsAt.toISOString().slice(0, 10), userId]
  if (status === null) {
    await data.query(
      `delete from plugin_calendar_rsvps where event_id = $1 and occurrence_date = $2 and user_id = $3`,
      params,
    )
  } else {
    await data.query(
      `insert into plugin_calendar_rsvps (event_id, occurrence_date, user_id, status)
       values ($1, $2, $3, $4)
       on conflict (event_id, occurrence_date, user_id)
       do update set status = excluded.status, updated_at = now()`,
      [...params, status],
    )
  }
}

export async function rsvpSummary(data: PluginData, event: CalendarEvent, userId: number | null) {
  const params = [event.id, event.startsAt.toISOString().slice(0, 10)]
  const counts = await data.query<{ status: RsvpStatus; count: string }>(
    `select status, count(*) as count from plugin_calendar_rsvps
     where event_id = $1 and occurrence_date = $2 group by status`,
    params,
  )
  const own =
    userId === null
      ? null
      : await data.one<{ status: RsvpStatus }>(
          `select status from plugin_calendar_rsvps
     where event_id = $1 and occurrence_date = $2 and user_id = $3`,
          [...params, userId],
        )
  return {
    counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])),
    own: own?.status ?? null,
  }
}
