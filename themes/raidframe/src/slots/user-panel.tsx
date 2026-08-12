import type { UserPanelModel } from '@meith/theme-kit'

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  children,
}: UserPanelModel) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-2 border border-border bg-card px-2 py-1">
        <span
          aria-hidden="true"
          className={`size-1.5 ${viewer.isGuest ? 'bg-forum-read' : 'bg-moderation-approved'}`}
        />
        <span className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
          {viewer.isGuest ? 'guest' : (viewer.username ?? 'signed in')}
        </span>
      </span>

      {unreadNotifications > 0 && (
        <span className="inline-flex items-center gap-1 border border-primary/60 bg-primary/15 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-primary uppercase tabular-nums">
          {unreadNotifications} alerts
        </span>
      )}
      {unreadMessages > 0 && (
        <span className="inline-flex items-center gap-1 border border-forum-unread/60 bg-forum-unread/15 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.12em] text-forum-unread uppercase tabular-nums">
          {unreadMessages} whispers
        </span>
      )}

      <nav aria-label="Account" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-primary"
          >
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
