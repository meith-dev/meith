import type { SlotCopy, UserPanelModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, cn } from '@meith/ui'
import { Menu } from '@meith/ui/menu'

import { Arrow, LABEL, NUMERIC, QUIET_LINK, TOUCH } from '../shared'

const GUEST_LINK = `inline-flex h-10 items-center px-1 text-[0.8125rem] font-medium tracking-[0.01em] text-muted-foreground ${QUIET_LINK} ${TOUCH}`

const GUEST_ACTION = `group inline-flex min-h-10 items-center gap-4 rounded-[2px] border border-foreground bg-foreground px-[1.2rem] text-xs font-medium whitespace-nowrap text-background transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground ${TOUCH}`

const COUNT_LINK = `${LABEL} inline-flex items-center gap-1 ${QUIET_LINK} ${TOUCH}`

export function UserPanel({
  viewer,
  links,
  unreadNotifications,
  unreadMessages,
  notificationsHref,
  messagesHref,
  regions,
  children,
  copy,
}: UserPanelModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.userPanel.${key}`)

  if (viewer.isGuest) {
    return (
      <div className="flex items-center gap-3 sm:gap-5">
        {links.map((link, index) =>
          index === 0 ? (
            <a key={link.href} href={link.href} className={GUEST_ACTION}>
              {link.label}
              <Arrow className="ms-0 text-[1.1rem] leading-none text-current" />
            </a>
          ) : (
            <a key={link.href} href={link.href} className={cn(GUEST_LINK, 'hidden sm:inline-flex')}>
              {link.label}
            </a>
          ),
        )}
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

      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {regions?.notifications ?? (
          <>
            {unreadNotifications.value > 0 && (
              <a href={notificationsHref} className={COUNT_LINK}>
                <span className={`${NUMERIC} text-primary`}>{unreadNotifications.label}</span>
                <span className="sr-only"> {c('unreadNotifications')}</span>
                <span aria-hidden="true">{c('new')}</span>
              </a>
            )}
            {unreadMessages.value > 0 && (
              <a href={messagesHref} className={COUNT_LINK}>
                <span className={`${NUMERIC} text-primary`}>{unreadMessages.label}</span>
                <span className="sr-only"> {c('unreadMessages')}</span>
                <span aria-hidden="true">{c('unread')}</span>
              </a>
            )}
          </>
        )}

        <span data-account="menu" className="flex min-w-0 items-center">
          <Menu
            label={c('yourAccount')}
            items={links}
            triggerClassName="rounded-none py-0.5 pl-0.5 pr-1.5"
            trigger={
              <>
                <Avatar src={viewer.avatarUrl} name={name} size={28} className="rounded-none" />
                <span className="hidden max-w-40 truncate text-[0.8125rem] font-medium text-foreground sm:inline">
                  {name}
                </span>
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
          <a key={link.href} href={link.href} className={`text-muted-foreground ${QUIET_LINK}`}>
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
