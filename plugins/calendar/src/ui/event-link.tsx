import type { CalendarEvent } from '../events'

export const EXTERNAL_REL = 'nofollow ugc noopener noreferrer'

export function EventLink({ event, label }: { event: CalendarEvent; label: string }) {
  if (event.linkUrl === '') return null

  return (
    <p className="text-sm">
      <a
        className="underline underline-offset-2"
        href={event.linkUrl}
        rel={EXTERNAL_REL}
        target="_blank"
      >
        {event.linkLabel === '' ? label : event.linkLabel}
      </a>
    </p>
  )
}
