import { Menu } from '@meith/ui/menu'
import type { UserPanelModel } from '@meith/theme-kit'

import { Circle, ICON_BUTTON, MUTED_LINK, PILL, PILL_PRIMARY, count } from '../shared'

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0 0 10 2.5Z" />
      <path d="M8.5 14.5a1.75 1.75 0 0 0 3 0" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3c4 0 7 2.8 7 6.3S14 15.5 10 15.5a8 8 0 0 1-2.2-.3L4 16.5l.9-2.8A6 6 0 0 1 3 9.3C3 5.8 6 3 10 3Z" />
    </svg>
  )
}

function IconButton({
  href,
  title,
  children,
}: {
  href: string | null
  title: string
  children: React.ReactNode
}) {
  if (href === null) {
    return (
      <span className={`relative ${ICON_BUTTON}`} aria-hidden="true">
        {children}
      </span>
    )
  }

  return (
    <a href={href} title={title} className={`relative ${ICON_BUTTON}`}>
      <span className="sr-only">{title}</span>
      {children}
    </a>
  )
}

function CountBadge({ value, label }: { value: number; label: string }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground ring-2 ring-card">
      <span aria-hidden="true">{value > 99 ? '99+' : value}</span>
      <span className="sr-only">
        {count(value)} {label}
      </span>
    </span>
  )
}

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
          <a key={link.href} href={link.href} className={index === 0 ? PILL_PRIMARY : PILL}>
            {link.label}
          </a>
        ))}
      </div>
    )
  }

  const name = viewer.username ?? 'Signed in'
  const hrefFor = (label: string): string | null =>
    links.find((link) => link.label === label)?.href ?? null

  return (
    <div className="flex items-center gap-2">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-account="menu"]{display:none}[data-account="plain"]{display:flex!important}</style>',
        }}
      />

      {unreadNotifications > 0 && (
        <IconButton href={hrefFor('Notifications')} title="Notifications">
          <BellIcon />
          <CountBadge value={unreadNotifications} label="unread notifications" />
        </IconButton>
      )}

      {unreadMessages > 0 && (
        <IconButton href={hrefFor('Messages')} title="Messages">
          <MessageIcon />
          <CountBadge value={unreadMessages} label="unread messages" />
        </IconButton>
      )}

      <div data-account="menu" className="flex min-w-0 items-center">
        <Menu
          label="Your account"
          items={links}
          trigger={
            <>
              <Circle src={viewer.avatarUrl} name={name} size={32} />
              <span className="sr-only">{name}</span>
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
        className="flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      >
        <span className="font-semibold text-foreground">{name}</span>
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
