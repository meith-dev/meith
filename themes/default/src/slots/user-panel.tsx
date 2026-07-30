import type { UserPanelModel } from '@forum/theme-kit'

/**
 * The welcome block (F25/F27) — MyBB's `header_welcomeblock`.
 *
 * A Server Component, deliberately. This is the region most likely to be turned
 * into an island for a dropdown menu, and it sits in the layout of every page:
 * making it a client component would put a JavaScript bundle on the guest board
 * index for the sake of a menu that a plain link handles.
 *
 * `viewer.username` is `null` on pages that do not resolve a display name (the
 * auth screens do not — they exist for people who are not signed in). The panel
 * shows the account links either way rather than inventing a name.
 */
export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  children,
}: UserPanelModel) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {viewer.isGuest ? 'Not signed in' : (viewer.username ?? 'Signed in')}
      </span>

      {unreadNotifications > 0 && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
          {unreadNotifications} new
        </span>
      )}
      {unreadMessages > 0 && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {unreadMessages} messages
        </span>
      )}

      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="font-medium text-foreground hover:text-primary"
        >
          {link.label}
        </a>
      ))}

      {/* Account controls the app owns — the log-out form. */}
      {children}
    </div>
  )
}
