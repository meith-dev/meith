import type { SlotCopy, UserPanelModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

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
  const c = (key: string) => fromSlotCopy(copy, `midnight.userPanel.${key}`)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
      <span className="text-muted-foreground">
        {viewer.isGuest ? c('guest') : (viewer.username ?? c('signedIn'))}
      </span>

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

      {links.map((link) => (
        <a key={link.href} href={link.href} className="text-primary hover:underline">
          {link.label}
        </a>
      ))}

      {children}
    </div>
  )
}
