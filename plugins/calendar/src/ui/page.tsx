import {
  PLUGIN_CARD,
  PLUGIN_NOTE,
  PLUGIN_TAB_LIST,
  type PluginPageContext,
  pluginTabClass,
} from '@meith/plugin-kit'

import { mayAdd, mayManage, resolveCalendarConfig } from '../access'
import {
  type CalendarEvent,
  dayParts,
  eventHref,
  formatRange,
  groupByMonth,
  relativeHint,
} from '../events'
import en from '../messages/en.json'
import { eventById, organiserIds, pastEvents, upcomingEvents } from '../store'
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
  manageable,
}: {
  event: CalendarEvent
  locale: string
  now: Date
  context: PluginPageContext
  manageable: boolean
}) {
  const href = eventHref(event)

  return (
    <li className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <DateBlock event={event} locale={locale} />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold leading-tight">{event.title}</p>

        <p className="text-muted-foreground text-sm">
          <time dateTime={event.startsAt.toISOString()}>
            {formatRange(event.startsAt, event.endsAt, locale)}
          </time>
          {event.location !== '' && <span> · {event.location}</span>}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
          {manageable && (
            <>
              <a
                className="underline underline-offset-2"
                href={`/plugins/calendar?edit=${event.id}`}
              >
                {translated(context, 'calendar.event.edit')}
              </a>
              <form method="post" action="/api/plugins/calendar/events/delete">
                <input type="hidden" name="id" value={event.id} />
                <button type="submit" className="underline underline-offset-2">
                  {translated(context, 'calendar.event.delete')}
                </button>
              </form>
            </>
          )}
        </div>

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
  organisers,
}: {
  events: readonly CalendarEvent[]
  locale: string
  now: Date
  context: PluginPageContext
  organisers: readonly number[]
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupByMonth(events, locale).map((month) => (
        <section key={month.key} className={PLUGIN_CARD}>
          <h2 className="text-muted-foreground text-xs font-semibold tracking-widest">
            {month.label}
          </h2>
          <ul className="divide-border divide-y">
            {month.events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                locale={locale}
                now={now}
                context={context}
                manageable={mayManage({
                  userId: context.viewer.userId,
                  createdByUserId: event.createdByUserId,
                  organisers,
                })}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function toDateTimeInput(date: Date | null): string {
  return date === null ? '' : date.toISOString().slice(0, 16)
}

function EventForm({
  context,
  event,
}: {
  context: PluginPageContext
  event: CalendarEvent | null
}) {
  const action =
    event === null ? '/api/plugins/calendar/events' : '/api/plugins/calendar/events/update'
  const heading = translated(
    context,
    event === null ? 'calendar.event.add' : 'calendar.event.editTitle',
  )
  const submit = translated(context, event === null ? 'calendar.event.add' : 'calendar.event.save')

  return (
    <form method="post" action={action} className={PLUGIN_CARD}>
      <h2 className="font-semibold">{heading}</h2>
      {event !== null && <input type="hidden" name="id" value={event.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {translated(context, 'calendar.event.title')}
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={event?.title ?? ''}
            className="rounded border p-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.starts')}
          <input
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={toDateTimeInput(event?.startsAt ?? null)}
            className="rounded border p-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.until')}
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={toDateTimeInput(event?.endsAt ?? null)}
            className="rounded border p-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.location')}
          <input
            name="location"
            maxLength={120}
            defaultValue={event?.location ?? ''}
            className="rounded border p-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.thread')}
          <input
            name="thread"
            defaultValue={event?.threadId == null ? '' : String(event.threadId)}
            className="rounded border p-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.link')}
          <input
            name="link"
            type="url"
            maxLength={500}
            placeholder="https://"
            defaultValue={event?.linkUrl ?? ''}
            className="rounded border p-1.5"
          />
          <span className="text-muted-foreground text-xs">
            {translated(context, 'calendar.event.linkHint')}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translated(context, 'calendar.event.linkText')}
          <input
            name="link_text"
            maxLength={40}
            defaultValue={event?.linkLabel ?? ''}
            className="rounded border p-1.5"
          />
          <span className="text-muted-foreground text-xs">
            {translated(context, 'calendar.event.linkTextHint')}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="bg-muted rounded border px-3 py-1.5 text-sm">
          {submit}
        </button>
        {event !== null && (
          <a className="text-sm underline underline-offset-2" href="/plugins/calendar">
            {translated(context, 'calendar.event.cancel')}
          </a>
        )}
      </div>
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

  const editId = context.query.edit?.trim() ?? ''
  let editing: CalendarEvent | null = null
  if (/^\d+$/.test(editId)) {
    const found = await eventById(context.data, editId).catch(() => null)
    if (
      found !== null &&
      mayManage({
        userId: context.viewer.userId,
        createdByUserId: found.createdByUserId,
        organisers,
      })
    ) {
      editing = found
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={translated(context, 'calendar.page.views')}>
        <ul className={PLUGIN_TAB_LIST}>
          <li className="shrink-0">
            <a
              href="/plugins/calendar"
              {...(showingPast ? {} : { 'aria-current': 'page' as const })}
              className={pluginTabClass(!showingPast)}
            >
              {translated(context, 'calendar.page.upcoming')}
            </a>
          </li>
          <li className="shrink-0">
            <a
              href="/plugins/calendar?show=past"
              {...(showingPast ? { 'aria-current': 'page' as const } : {})}
              className={pluginTabClass(showingPast)}
            >
              {translated(context, 'calendar.page.past')}
            </a>
          </li>
        </ul>
      </nav>

      {events.length === 0 ? (
        <p className={PLUGIN_NOTE}>
          {translated(context, showingPast ? 'calendar.page.emptyPast' : 'calendar.page.empty')}
        </p>
      ) : (
        <Agenda
          events={events}
          locale={context.locale}
          now={now}
          context={context}
          organisers={organisers}
        />
      )}

      {editing !== null ? (
        <EventForm context={context} event={editing} />
      ) : (
        <>
          {!showingPast && verdict === 'allowed' && <EventForm context={context} event={null} />}
          {!showingPast && verdict === 'not-an-organiser' && (
            <p className={PLUGIN_NOTE}>{translated(context, 'calendar.error.notAnOrganiser')}</p>
          )}
        </>
      )}
    </div>
  )
}
