import type { PluginRegionContext, PluginRuntimeContext } from '@meith/plugin-kit'

import type { CalendarEvent } from '../events'
import en from '../messages/en.json'
import { eventForThread } from '../store'

function when(event: CalendarEvent): string {
  const starts = event.startsAt.toISOString()
  return event.endsAt === null ? starts : `${starts} — ${event.endsAt.toISOString()}`
}

export async function ThreadEventCard(context: PluginRegionContext) {
  if (context.subjectId === null) return null

  let event: CalendarEvent | null = null
  try {
    const runtime = (await context.runtime()) as PluginRuntimeContext
    event = await eventForThread(runtime.data, context.subjectId)
  } catch {
    return null
  }

  if (event === null) return null

  return (
    <section className="rounded-md border border-border bg-card p-3 text-sm" data-plugin="calendar">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {en['calendar.thread.card']}
      </p>
      <p className="font-semibold">{event.title}</p>
      <p className="text-muted-foreground">
        <time dateTime={event.startsAt.toISOString()}>{when(event)}</time>
        {event.location !== '' && <span> · {event.location}</span>}
      </p>
    </section>
  )
}
