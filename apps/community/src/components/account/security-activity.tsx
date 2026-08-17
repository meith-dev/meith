import { type Copy, fromCopy } from '../shell/copy-record'

export interface ActivityView {
  readonly id: number
  readonly label: string
  readonly detail: string
}

export function SecurityActivity({
  events,
  copy,
}: {
  readonly events: readonly ActivityView[]
  readonly copy: Copy
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.activity.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.activity.blurb')}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fromCopy(copy, 'accountForm.activity.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="font-medium">{event.label}</span>
              <span className="text-xs text-muted-foreground">{event.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
