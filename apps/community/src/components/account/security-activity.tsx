export interface ActivityView {
  readonly id: number
  readonly label: string
  readonly at: string
  readonly address: string
  readonly device: string
}

export function SecurityActivity({ events }: { readonly events: readonly ActivityView[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Recent security activity</h2>
        <p className="text-xs text-muted-foreground">
          What has happened to your account’s sign-in, most recent first. If something here was not
          you, change your password and sign out everywhere.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="font-medium">{event.label}</span>
              <span className="text-xs text-muted-foreground">
                {event.at} · {event.device} · {event.address}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
