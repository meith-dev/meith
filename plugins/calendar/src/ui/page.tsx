import type { PluginPageContext } from '@meith/plugin-kit'

import { mayAdd, resolveCalendarConfig } from '../access'
import {
  type CalendarEvent,
  dayParts,
  eventHref,
  formatRange,
  groupByMonth,
  relativeHint,
} from '../events'
import en from '../messages/en.json'
import { organiserIds, pastEvents, upcomingEvents } from '../store'
import { EventLink } from './event-link'

export const UPCOMING_LIMIT = 50

export const PAST_LIMIT = 30

function translated(context: PluginPageContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}

function DateBlock({ event, locale }: { event: CalendarEvent; locale: string }) {
  const { day, weekday } = dayParts(event.startsAt, locale)

  return (
    <div className="bg-muted text-foreground flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border">
      <span className="text-lg font-semibold leading-none tabular-nums">{day}</span>
      <span className="text-muted-foreground mt-1 text-[0.625rem] font-medium tracking-widest">
        {weekday}
      </span>
    </div>
  )
}

function EventRow({
  event,
  locale,
  now,
  context,
}: {
  event: CalendarEvent
  locale: string
  now: Date
  context: PluginPageContext
}) {
  const href = eventHref(event)

  return (
    <li className="flex items-start gap-4 py-4">
      <DateBlock event={event} locale={locale} />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold leading-tight">{event.title}</p>

        <p className="text-muted-foreground text-sm">
          <time dateTime={event.startsAt.toISOString()}>
            {formatRange(event.startsAt, event.endsAt, locale)}
          </time>
          {event.location !== '' && <span> · {event.location}</span>}
        </p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">{relativeHint(event.startsAt, now, locale)}</span>
          {href !== null && (
            <a className="underline underline-offset-2" href={href}>
              {translated(context, 'calendar.event.discuss')}
            </a>
          )}
          <a
            className="underline underline-offset-2"
            href={`/api/plugins/calendar/events/ics?id=${event.id}`}
          >
            {translated(context, 'calendar.event.download')}
          </a>
        </p>

        <EventLink event={event} label={translated(context, 'calendar.event.linkFallback')} />
      </div>
    </li>
  )
}

function Agenda({
  events,
  locale,
  now,
  context,
}: {
  events: readonly CalendarEvent[]
  locale: string
  now: Date
  context: PluginPageContext
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupByMonth(events, locale).map((month) => (
        <section key={month.key}>
          <h2 className="text-muted-foreground border-b pb-1 text-xs font-semibold tracking-widest">
            {month.label}
          </h2>
          <ul className="divide-border divide-y">
            {month.events.map((event) => (
              <EventRow key={event.id} event={event} locale={locale} now={now} context={context} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function AddForm({ context }: { context: PluginPageContext }) {
  return (
    <form
      method="post"
      action="/api/plugins/calendar/events"
      className="bg-card flex flex-col gap-3 rounded-md border p-4"
    >
      <h2 className="font-semibold">{translated(context, 'calendar.event.add')}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {translated(context, 'calendar.event.title')}
          <input name="title" required maxLength={120} className="rounded border p-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.starts')}
          <input name="starts_at" type="datetime-local" required className="rounded border p-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.until')}
          <input name="ends_at" type="datetime-local" className="rounded border p-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.location')}
          <input name="location" maxLength={120} className="rounded border p-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.thread')}
          <input name="thread" className="rounded border p-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.link')}
          <input
            name="link"
            type="url"
            maxLength={500}
            placeholder="https://"
            className="rounded border p-1.5"
          />
          <span className="text-muted-foreground text-xs">
            {translated(context, 'calendar.event.linkHint')}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.linkText')}
          <input name="link_text" maxLength={40} className="rounded border p-1.5" />
          <span className="text-muted-foreground text-xs">
            {translated(context, 'calendar.event.linkTextHint')}
          </span>
        </label>
      </div>

      <button type="submit" className="bg-muted self-start rounded border px-3 py-1.5 text-sm">
        {translated(context, 'calendar.event.add')}
      </button>
    </form>
  )
}

export async function CalendarPage(context: PluginPageContext) {
  const config = resolveCalendarConfig(context.settings)
  const showingPast = context.query.show === 'past'
  const now = new Date()

  const [events, organisers] = await Promise.all([
    (showingPast
      ? pastEvents(context.data, PAST_LIMIT)
      : upcomingEvents(context.data, UPCOMING_LIMIT)
    ).catch(() => [] as readonly CalendarEvent[]),
    organiserIds(context.data).catch(() => [] as readonly number[]),
  ])

  const verdict = mayAdd({ userId: context.viewer.userId, config, organisers })

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-4 text-sm">
        <a
          className={showingPast ? 'underline underline-offset-2' : 'font-semibold'}
          href="/plugins/calendar"
        >
          {translated(context, 'calendar.page.upcoming')}
        </a>
        <a
          className={showingPast ? 'font-semibold' : 'underline underline-offset-2'}
          href="/plugins/calendar?show=past"
        >
          {translated(context, 'calendar.page.past')}
        </a>
      </nav>

      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {translated(context, showingPast ? 'calendar.page.emptyPast' : 'calendar.page.empty')}
        </p>
      ) : (
        <Agenda events={events} locale={context.locale} now={now} context={context} />
      )}

      {!showingPast && verdict === 'allowed' && <AddForm context={context} />}
      {!showingPast && verdict === 'not-an-organiser' && (
        <p className="text-muted-foreground text-sm">
          {translated(context, 'calendar.error.notAnOrganiser')}
        </p>
      )}
    </div>
  )
}
