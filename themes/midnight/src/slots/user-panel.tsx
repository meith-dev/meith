import type { UserPanelModel } from '@meith/theme-kit'

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
