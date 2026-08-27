import { type Database, pluginData } from '@meith/db'
import { addOrganiser, createEvent } from '@meith/plugin-calendar'

export const CALENDAR_PLUGIN_KEY = 'calendar'

export const CALENDAR_ORGANISERS: readonly string[] = ['admin', 'siobhan', 'gerry']

export interface CalendarDemoEvent {
  readonly title: string
  readonly daysFromNow: number
  readonly startHour: number
  readonly startMinute: number
  readonly durationHours: number | null
  readonly location: string
  readonly threadTitle: string | null
  readonly linkUrl: string
  readonly linkLabel: string
  readonly organiser: string
}

export const CALENDAR_DEMO_EVENTS: readonly CalendarDemoEvent[] = [
  {
    title: 'Away to Ballyquin — bus at 12:15',
    daysFromNow: 2,
    startHour: 12,
    startMinute: 15,
    durationHours: 6,
    location: 'Bus from the clubhouse',
    threadTitle: 'Saturday: away to Ballyquin, bus at 12:15',
    linkUrl: '',
    linkLabel: '',
    organiser: 'admin',
  },
  {
    title: 'Tuesday raid night',
    daysFromNow: 5,
    startHour: 20,
    startMinute: 0,
    durationHours: 3,
    location: 'Voice channel',
    threadTitle: 'Tuesday raid night: roster and sign-ups',
    linkUrl: 'https://meet.example/meitheal-raid',
    linkLabel: 'Join online',
    organiser: 'siobhan',
  },
  {
    title: 'U14 blitz — lifts from the clubhouse',
    daysFromNow: 8,
    startHour: 9,
    startMinute: 30,
    durationHours: 5,
    location: 'Ballyquin astro',
    threadTitle: 'U14 blitz on the 8th: lifts rota',
    linkUrl: '',
    linkLabel: '',
    organiser: 'gerry',
  },
  {
    title: 'Table quiz for the pitch fund',
    daysFromNow: 14,
    startHour: 20,
    startMinute: 30,
    durationHours: 3,
    location: 'The clubhouse bar',
    threadTitle: 'Table quiz for the pitch fund — teams of four, 14th',
    linkUrl: 'https://tickets.example/meitheal-quiz',
    linkLabel: 'Get tickets',
    organiser: 'admin',
  },
  {
    title: 'Committee meeting',
    daysFromNow: 21,
    startHour: 19,
    startMinute: 30,
    durationHours: null,
    location: 'Committee room, upstairs',
    threadTitle: null,
    linkUrl: '',
    linkLabel: '',
    organiser: 'siobhan',
  },
  {
    title: 'Summer camp — helpers needed',
    daysFromNow: 44,
    startHour: 10,
    startMinute: 0,
    durationHours: 6,
    location: 'The main pitch',
    threadTitle: 'Summer camp: dates, and we need six helpers',
    linkUrl: 'https://forms.example/meitheal-camp-helpers',
    linkLabel: 'Offer to help',
    organiser: 'gerry',
  },
  {
    title: 'AGM and committee elections',
    daysFromNow: -18,
    startHour: 19,
    startMinute: 30,
    durationHours: 2,
    location: 'The clubhouse',
    threadTitle: null,
    linkUrl: '',
    linkLabel: '',
    organiser: 'admin',
  },
  {
    title: 'Winter tournament final',
    daysFromNow: -40,
    startHour: 18,
    startMinute: 0,
    durationHours: 4,
    location: 'Voice channel',
    threadTitle: 'Winter tournament final: result, and the bracket that broke',
    linkUrl: '',
    linkLabel: '',
    organiser: 'siobhan',
  },
]

export interface CalendarDemoSummary {
  readonly events: number
  readonly organisers: number
}

export function eventStartsAt(event: CalendarDemoEvent, now: Date): Date {
  const day = new Date(now.getTime() + event.daysFromNow * 86_400_000)
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      event.startHour,
      event.startMinute,
    ),
  )
}

export function eventEndsAt(event: CalendarDemoEvent, startsAt: Date): Date | null {
  return event.durationHours === null
    ? null
    : new Date(startsAt.getTime() + event.durationHours * 3_600_000)
}

export async function seedCalendarDemoBoard(
  db: Database,
  input: {
    readonly userIds: ReadonlyMap<string, number>
    readonly threadIdByTitle: ReadonlyMap<string, number>
    readonly now: Date
  },
): Promise<CalendarDemoSummary> {
  const data = pluginData(db, CALENDAR_PLUGIN_KEY)

  let organisers = 0
  for (const key of CALENDAR_ORGANISERS) {
    const userId = input.userIds.get(key)
    if (userId === undefined) continue

    await addOrganiser(data, userId, input.userIds.get('admin') ?? null)
    organisers += 1
  }

  let events = 0
  for (const event of CALENDAR_DEMO_EVENTS) {
    const startsAt = eventStartsAt(event, input.now)

    await createEvent(
      data,
      {
        title: event.title,
        startsAt,
        endsAt: eventEndsAt(event, startsAt),
        location: event.location,
        threadId:
          event.threadTitle === null
            ? null
            : (input.threadIdByTitle.get(event.threadTitle) ?? null),
        linkUrl: event.linkUrl,
        linkLabel: event.linkLabel,
      },
      input.userIds.get(event.organiser) ?? null,
    )
    events += 1
  }

  return { events, organisers }
}
