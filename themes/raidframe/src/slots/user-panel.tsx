import { Menu } from '@meith/ui/menu'
import type { UserPanelModel } from '@meith/theme-kit'

import { BUTTON, BUTTON_PRIMARY, MICRO } from '../shared'

const COUNT =
  'inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] tabular-nums'

function Caret() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      className="size-2 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    >
      <path d="M1.5 3.5 5 7l3.5-3.5" />
    </svg>
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
      <div className="flex flex-wrap items-center gap-2">
        {links.map((link, index) => (
          <a key={link.href} href={link.href} className={index === 0 ? BUTTON_PRIMARY : BUTTON}>
            {link.label}
          </a>
        ))}
      </div>
    )
  }

  const name = viewer.username ?? 'signed in'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-account="menu"]{display:none}[data-account="plain"]{display:flex!important}</style>',
        }}
      />

      {unreadNotifications > 0 && (
        <a
          href={notificationsHref}
          className={`${COUNT} border-primary/60 bg-primary/15 text-primary hover:border-primary`}
        >
          {unreadNotifications} new
        </a>
      )}
      {unreadMessages > 0 && (
        <a
          href={messagesHref}
          className={`${COUNT} border-forum-unread/60 bg-forum-unread/15 text-forum-unread hover:border-forum-unread`}
        >
          {unreadMessages} pm
        </a>
      )}

      <div data-account="menu" className="flex min-w-0 items-center">
        <Menu
          label="Your account"
          items={links}
          triggerClassName="rounded-none border-border bg-card px-2 py-1 hover:border-primary/70 hover:bg-card"
          trigger={
            <>
              <span
                aria-hidden="true"
                className="size-1.5 rotate-45 bg-moderation-approved shadow-[0_0_6px_var(--color-moderation-approved)]"
              />
              <span className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-foreground uppercase">
                {name}
              </span>
              <Caret />
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
        className="flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span className={`${MICRO} text-foreground`}>{name}</span>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`${MICRO} hover:text-primary`}
          >
            {link.label}
          </a>
        ))}
        {children}
      </nav>
    </div>
  )
}
