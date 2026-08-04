import { Avatar, Badge, buttonVariants } from '@meith/ui'
import type { UserPanelModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

/**
 * The welcome block (F25/F27) — MyBB's `header_welcomeblock`.
 *
 * A Server Component, deliberately. This is the region most likely to be turned
 * into an island for a dropdown menu, and it sits in the layout of every page:
 * making it a client component would put a JavaScript bundle on the guest board
 * index for the sake of a menu that a plain link handles. Base UI has a very
 * good `Menu`, and this is exactly the place not to use it.
 *
 * ## What this panel is actually holding
 *
 * `links` is not two or three items. A signed-in moderator is handed eight —
 * profile, control panel, notifications, messages, subscriptions, moderator CP,
 * the queue, reports — and the previous version of this slot rendered every one
 * of them as `font-medium text-foreground` at the same size as the board's name.
 * The header was a wall of eleven links of equal weight, and finding "Messages"
 * in it took as long as reading the whole thing.
 *
 * The fix is hierarchy rather than a menu, because hierarchy costs nothing at
 * runtime:
 *
 *  - **Who you are** — avatar and name — is the only thing at full contrast.
 *  - **What is waiting for you** sits beside it as counts, because a number that
 *    changed is the reason somebody looks at this corner of the page at all.
 *  - **Everywhere you can go** drops to a small muted row underneath. Still one
 *    click, still in tab order, no longer competing with the board.
 *
 * A guest gets none of that and two real buttons instead: signing in is the only
 * thing the header is asking them to do.
 *
 * ## The counts are not links, and cannot be
 *
 * `unreadNotifications` and `unreadMessages` are numbers; the routes they belong
 * to are somewhere in `links`, and the model gives a theme no way to say which —
 * matching on the label would break the moment the board is translated. So they
 * render as badges beside the name, each with a full sentence for a screen
 * reader, and the links stay where they are. Guessing the pairing from an href
 * would be a theme building a URL, which is the one thing the contract is
 * clearest about.
 */
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
            /*
             * The first link is the one the board wants pressed — the app orders
             * them sign-in, then register — so it is the only filled control in
             * the header. Two primary buttons side by side ask a question the
             * visitor did not come here to answer.
             */
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

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar src={viewer.avatarUrl} name={viewer.username ?? '?'} size={24} />

        <span className="truncate text-sm font-medium text-foreground">
          {viewer.username ?? 'Signed in'}
        </span>

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
      </div>

      <nav
        aria-label="Your account"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end"
      >
        {links.map((link) => (
          <a key={link.href} href={link.href} className={MUTED_LINK}>
            {link.label}
          </a>
        ))}

        {/*
          Account controls the app owns — the log-out form. Last, because it is
          the one control here nobody is looking for by accident.
        */}
        {children}
      </nav>
    </div>
  )
}
