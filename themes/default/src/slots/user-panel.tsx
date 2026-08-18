import type { SlotCopy, UserPanelModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, Badge, buttonVariants } from '@meith/ui'
import { Menu } from '@meith/ui/menu'

import { MUTED_LINK } from '../shared'

const COUNT_LINK =
  'rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring'

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  notificationsHref,
  messagesHref,
  children,
  copy,
}: UserPanelModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.userPanel.${key}`)

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

  const name = viewer.username ?? c('signedIn')

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-account="menu"]{display:none}[data-account="plain"]{display:flex!important}</style>',
        }}
      />

      <div className="flex min-w-0 items-center gap-2">
        {unreadNotifications.value > 0 && (
          <a href={notificationsHref} className={COUNT_LINK}>
            <Badge tone="solid">
              {unreadNotifications.label}
              <span className="sr-only"> {c('unreadNotifications')}</span>
              <span aria-hidden="true"> {c('new')}</span>
            </Badge>
          </a>
        )}
        {unreadMessages.value > 0 && (
          <a href={messagesHref} className={COUNT_LINK}>
            <Badge tone="outline">
              {unreadMessages.label}
              <span className="sr-only"> {c('unreadMessages')}</span>
              <span aria-hidden="true"> {c('unread')}</span>
            </Badge>
          </a>
        )}

        <span data-account="menu" className="flex min-w-0 items-center">
          <Menu
            label={c('yourAccount')}
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
        </span>
      </div>

      <nav
        data-account="plain"
        style={{ display: 'none' }}
        aria-label={c('yourAccount')}
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
