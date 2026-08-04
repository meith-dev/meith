import type { UserPanelModel } from '@meith/theme-kit'

/**
 * The welcome block, as a single dense line.
 *
 * Counts are rendered as `[3 new]` rather than as pills — same information,
 * a deliberately plainer voice. `children` is the app's log-out form and is
 * rendered last: it cannot be a link (a GET that ends a session is fired by
 * every prefetcher), so a theme that dropped it would strand a signed-in member.
 */
export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  children,
}: UserPanelModel) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
      <span className="text-muted-foreground">
        {viewer.isGuest ? 'guest' : (viewer.username ?? 'signed in')}
      </span>

      {unreadNotifications > 0 && (
        <span className="text-accent">[{unreadNotifications} new]</span>
      )}
      {unreadMessages > 0 && (
        <span className="text-accent">[{unreadMessages} pm]</span>
      )}

      {links.map((link) => (
        <a key={link.href} href={link.href} className="text-primary hover:underline">
          {link.label}
        </a>
      ))}

      {children}
    </div>
  )
}
