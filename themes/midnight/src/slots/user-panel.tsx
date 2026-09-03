import type { SlotCopy, UserPanelModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Menu } from '@meith/ui/menu'

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
  const c = (key: string) => fromSlotCopy(copy, `midnight.userPanel.${key}`)

  const counts = regions?.notifications ?? (
    <>
      {unreadNotifications.value > 0 && (
        <a href={notificationsHref} className="text-accent hover:underline">
          [{unreadNotifications.label} {c('new')}]
          <span className="sr-only"> {c('notificationsSrOnly')}</span>
        </a>
      )}
      {unreadMessages.value > 0 && (
        <a href={messagesHref} className="text-accent hover:underline">
          [{unreadMessages.label} {c('pm')}]<span className="sr-only"> {c('messagesSrOnly')}</span>
        </a>
      )}
    </>
  )

  if (viewer.isGuest) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
        <span className="text-muted-foreground">{c('guest')}</span>
        {counts}
        {links.map((link) => (
          <a key={link.href} href={link.href} className="text-primary hover:underline">
            {link.label}
          </a>
        ))}
        {children}
      </div>
    )
  }

  const name = viewer.username ?? c('signedIn')

  return (
    <div className="flex min-w-0 flex-col items-end gap-1 font-mono text-xs">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-account="menu"]{display:none}[data-account="plain"]{display:flex!important}</style>',
        }}
      />

      <div className="flex min-w-0 items-center gap-x-3">
        {counts}

        <span data-account="menu" className="flex min-w-0 items-center">
          <Menu
            label={c('yourAccount')}
            items={links}
            triggerClassName="rounded-none border-border bg-card font-mono text-xs hover:bg-muted data-[popup-open]:bg-muted"
            trigger={
              <>
                <span className="max-w-40 truncate text-foreground">{name}</span>
                <span aria-hidden="true" className="text-muted-foreground">
                  ▾
                </span>
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
        className="flex-wrap items-center justify-end gap-x-3 gap-y-1"
      >
        <span className="text-muted-foreground">{name}</span>
        {links.map((link) => (
          <a key={link.href} href={link.href} className="text-primary hover:underline">
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
