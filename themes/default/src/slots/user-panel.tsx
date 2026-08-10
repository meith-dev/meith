import { Avatar, Badge, buttonVariants } from '@meith/ui'
import { Menu } from '@meith/ui/menu'
import type { UserPanelModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  children,
}: UserPanelModel) {
  if (viewer.isGuest) {
    return (
      <div className="flex items-center gap-2">
        {links.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className={buttonVariants({
              variant: index === 0 ? 'primary' : 'outline',
              size: 'sm',
            })}
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

      <div data-account="menu" className="flex min-w-0 items-center gap-2">
        {unreadNotifications > 0 && (
          <Badge tone="solid">
            {unreadNotifications}
            <span className="sr-only"> unread notifications</span>
            <span aria-hidden="true"> new</span>
          </Badge>
        )}
        {unreadMessages > 0 && (
          <Badge tone="outline">
            {unreadMessages}
            <span className="sr-only"> unread messages</span>
            <span aria-hidden="true"> unread</span>
          </Badge>
        )}

        <Menu
          label="Your account"
          items={links}
          trigger={
            <>
              <Avatar src={viewer.avatarUrl} name={name} size={24} />
              <span className="max-w-40 truncate font-medium text-foreground">{name}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className="size-3 shrink-0 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
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
      </div>

      <nav
        data-account="plain"
        style={{ display: 'none' }}
        aria-label="Your account"
        className="flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end"
      >
        <span className="font-medium text-foreground">{name}</span>
        {links.map((link) => (
          <a key={link.href} href={link.href} className={MUTED_LINK}>
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
