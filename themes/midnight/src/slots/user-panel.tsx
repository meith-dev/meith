import type { UserPanelModel } from '@meith/theme-kit'

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  notificationsHref,
  messagesHref,
  children,
}: UserPanelModel) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
      <span className="text-muted-foreground">
        {viewer.isGuest ? 'guest' : (viewer.username ?? 'signed in')}
      </span>

      {unreadNotifications.value > 0 && (
        <a href={notificationsHref} className="text-accent hover:underline">
          [{unreadNotifications.label} new]
          <span className="sr-only"> notifications</span>
        </a>
      )}
      {unreadMessages.value > 0 && (
        <a href={messagesHref} className="text-accent hover:underline">
          [{unreadMessages.label} pm]
          <span className="sr-only"> unread messages</span>
        </a>
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
