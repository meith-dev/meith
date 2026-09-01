import type { PluginData } from '@meith/plugin-kit'

import type { CalendarEvent, EventDraft } from './events'

interface EventRow extends Record<string, unknown> {
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
                 link_url, link_label`

export async function createEvent(
  data: PluginData,
  draft: EventDraft,
  createdByUserId: number | null,
): Promise<void> {
  await data.query(
    `insert into plugin_calendar_event
       (title, starts_at, ends_at, location, thread_id, created_by_user_id, link_url, link_label)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      draft.title,
      draft.startsAt,
      draft.endsAt,
      draft.location,
      draft.threadId,
      createdByUserId,
      draft.linkUrl,
      draft.linkLabel,
    ],
  )
}

export async function updateEvent(data: PluginData, id: string, draft: EventDraft): Promise<void> {
  await data.query(
    `update plugin_calendar_event
        set title = $2, starts_at = $3, ends_at = $4, location = $5, thread_id = $6,
            link_url = $7, link_label = $8
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
    ],
  )
}

export async function upcomingEvents(
  data: PluginData,
  limit: number,
): Promise<readonly CalendarEvent[]> {
  const rows = await data.query<EventRow>(
    `select ${COLUMNS} from plugin_calendar_event
      where coalesce(ends_at, starts_at) >= now()
      order by starts_at
      limit $1`,
    [limit],
  )
  return rows.map(toEvent)
}

export async function pastEvents(
  data: PluginData,
  limit: number,
): Promise<readonly CalendarEvent[]> {
  const rows = await data.query<EventRow>(
    `select ${COLUMNS} from plugin_calendar_event
      where coalesce(ends_at, starts_at) < now()
      order by starts_at desc
      limit $1`,
    [limit],
  )
  return rows.map(toEvent)
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
  return rows.map(toEvent)
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
