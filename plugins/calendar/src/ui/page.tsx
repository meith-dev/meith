import type { PluginPageContext } from '@meith/plugin-kit'

import { mayAdd, resolveCalendarConfig } from '../access'
import { type CalendarEvent, eventHref } from '../events'
import en from '../messages/en.json'
import { organiserIds, upcomingEvents } from '../store'

export const UPCOMING_LIMIT = 50

function translated(context: PluginPageContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}

function EventRow({ event }: { event: CalendarEvent }) {
  const href = eventHref(event)

  return (
    <li className="border-border border-b py-3 last:border-b-0">
      <p className="font-semibold">{event.title}</p>
      <p className="text-muted-foreground text-sm">
        <time dateTime={event.startsAt.toISOString()}>{event.startsAt.toISOString()}</time>
        {event.endsAt !== null && (
          <>
            {' — '}
            <time dateTime={event.endsAt.toISOString()}>{event.endsAt.toISOString()}</time>
          </>
        )}
        {event.location !== '' && <span> · {event.location}</span>}
      </p>
      {href !== null && (
        <a className="text-sm underline underline-offset-2" href={href}>
          {en['calendar.event.discuss']}
        </a>
      )}
    </li>
  )
}

function AddForm({ context }: { context: PluginPageContext }) {
  return (
    <form method="post" action="/api/plugins/calendar/events" className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        {translated(context, 'calendar.event.title')}
        <input name="title" required maxLength={120} className="rounded border p-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {translated(context, 'calendar.event.starts')}
        <input name="starts_at" type="datetime-local" required className="rounded border p-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {translated(context, 'calendar.event.until')}
        <input name="ends_at" type="datetime-local" className="rounded border p-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {translated(context, 'calendar.event.location')}
        <input name="location" maxLength={120} className="rounded border p-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {translated(context, 'calendar.event.thread')}
        <input name="thread" className="rounded border p-1" />
      </label>
      <button type="submit" className="self-start rounded border px-3 py-1 text-sm">
        {translated(context, 'calendar.event.add')}
      </button>
    </form>
  )
}

export async function CalendarPage(context: PluginPageContext) {
  const config = resolveCalendarConfig(context.settings)

  const [events, organisers] = await Promise.all([
    upcomingEvents(context.data, UPCOMING_LIMIT).catch(() => [] as readonly CalendarEvent[]),
    organiserIds(context.data).catch(() => [] as readonly number[]),
  ])

  const verdict = mayAdd({ userId: context.viewer.userId, config, organisers })

  return (
    <div className="flex flex-col gap-6">
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {translated(context, 'calendar.page.empty')}
        </p>
      ) : (
        <ul>
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}

      {verdict === 'allowed' && <AddForm context={context} />}
      {verdict === 'not-an-organiser' && (
        <p className="text-muted-foreground text-sm">
          {translated(context, 'calendar.error.notAnOrganiser')}
        </p>
      )}
    </div>
  )
}
