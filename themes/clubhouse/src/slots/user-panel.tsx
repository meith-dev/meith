import { Avatar, cn } from '@meith/ui'
import { Menu } from '@meith/ui/menu'
import type { LinkModel, UserPanelModel } from '@meith/theme-kit'

import { BUTTON, MUTED_LINK } from '../shared'

const COUNT =
  'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold tabular-nums uppercase tracking-[0.08em]'

function Count({
  href,
  className,
  children,
}: {
  href?: string | undefined
  className: string
  children: React.ReactNode
}) {
  const badge = <span className={cn(COUNT, className)}>{children}</span>
  if (href === undefined) return badge
  return (
    <a
      href={href}
      className="rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {badge}
    </a>
  )
}

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  notificationsHref,
  messagesHref,
  children,
}: UserPanelModel) {
  if (viewer.isGuest) {
    return (
      <div className="flex items-center gap-2">
        {links.map((link: LinkModel, index: number) => (
          <a
            key={link.href}
            href={link.href}
            className={cn(
              BUTTON,
              index === 0
                ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'border border-border text-foreground hover:bg-accent',
            )}
          >
            {link.label}
          </a>
        ))}
      </div>
    )
  }

  const name = viewer.username ?? 'Signed in'

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-account="menu"]{display:none}[data-account="plain"]{display:flex!important}</style>',
        }}
      />

      <div className="flex min-w-0 items-center gap-2">
        {unreadNotifications > 0 && (
          <Count href={notificationsHref} className="bg-primary text-primary-foreground">
            {unreadNotifications}
            <span className="sr-only"> unread notifications</span>
            <span aria-hidden="true">new</span>
          </Count>
        )}
        {unreadMessages > 0 && (
          <Count href={messagesHref} className="border border-border text-foreground">
            {unreadMessages}
            <span className="sr-only"> unread messages</span>
            <span aria-hidden="true">unread</span>
          </Count>
        )}

        <span data-account="menu" className="flex min-w-0 items-center">
          <Menu
            label="Your account"
            items={links}
            triggerClassName="rounded-full px-2 py-1"
            trigger={
              <>
                <Avatar
                  src={viewer.avatarUrl}
                  name={name}
                  size={26}
                  className="rounded-full border-primary/60"
                />
                <span className="max-w-40 truncate text-sm font-semibold text-foreground">
                  {name}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </>
            }
          >
            {children}
          </Menu>
        </span>
      </div>

      <nav
        data-account="plain"
        style={{ display: 'none' }}
        aria-label="Your account"
        className="flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end"
      >
        <span className="font-semibold text-foreground">{name}</span>
        {links.map((link: LinkModel) => (
          <a key={link.href} href={link.href} className={MUTED_LINK}>
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
