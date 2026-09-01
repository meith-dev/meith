import type { PluginRegionContext, PluginRuntimeContext } from '@meith/plugin-kit'

import { type CalendarEvent, formatRange, pickThreadEvent } from '../events'
import en from '../messages/en.json'
import { eventsForThread } from '../store'
import { EventLink } from './event-link'

function translated(context: PluginRegionContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}

export async function ThreadEventCard(context: PluginRegionContext) {
  if (context.subjectId === null) return null

  let event: CalendarEvent | null = null
  try {
    const runtime = (await context.runtime()) as PluginRuntimeContext
    event = pickThreadEvent(await eventsForThread(runtime.data, context.subjectId), new Date())
  } catch {
    return null
  }

  if (event === null) return null

  return (
    <section className="rounded-md border border-border bg-card p-3 text-sm" data-plugin="calendar">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {translated(context, 'calendar.thread.card')}
      </p>
      <p className="font-semibold">{event.title}</p>
      <p className="text-muted-foreground">
        <time dateTime={event.startsAt.toISOString()}>
          {formatRange(event.startsAt, event.endsAt, context.locale)}
        </time>
        {event.location !== '' && <span> · {event.location}</span>}
      </p>
      <EventLink event={event} label={translated(context, 'calendar.event.linkFallback')} />
    </section>
  )
}
