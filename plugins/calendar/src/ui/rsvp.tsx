import type { PluginPageContext, PluginRegionContext } from '@meith/plugin-kit'
import { buttonVariants, textLinkVariants } from '@meith/ui'

import { type CalendarEvent, occurrenceHref } from '../events'
import en from '../messages/en.json'
import { RSVP_LABELS, RSVP_STATUSES, type rsvpSummary } from '../store'

export function Rsvp({
  event,
  summary,
  context,
  form = false,
}: {
  event: CalendarEvent
  summary: Awaited<ReturnType<typeof rsvpSummary>>
  context: PluginPageContext | PluginRegionContext
  form?: boolean
}) {
  const t = (key: keyof typeof en) => (context.t.has(key) ? context.t.t(key) : en[key])
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {RSVP_STATUSES.map((status) => (
          <span key={status} className="mr-3">
            {t(RSVP_LABELS[status])}: {summary.counts[status] ?? 0}
          </span>
        ))}
      </p>
      {context.viewer.userId !== null && (
        <p>
          {t('calendar.rsvp.own')}:{' '}
          {t(summary.own === null ? 'calendar.rsvp.unanswered' : RSVP_LABELS[summary.own])}
        </p>
      )}
      {form && context.viewer.userId !== null ? (
        <form
          method="post"
          action="/api/plugins/calendar/events/rsvp"
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="id" value={event.id} />
          <input
            type="hidden"
            name="occurrence"
            value={event.startsAt.toISOString().slice(0, 10)}
          />
          {([...RSVP_STATUSES, 'clear'] as const).map((status) => (
            <button
              key={status}
              type="submit"
              name="status"
              value={status}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              {t(RSVP_LABELS[status])}
            </button>
          ))}
        </form>
      ) : (
        <a className={textLinkVariants()} href={occurrenceHref(event)}>
          {t('calendar.rsvp.respond')}
        </a>
      )}
    </div>
  )
}
