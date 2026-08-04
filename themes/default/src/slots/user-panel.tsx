import { Avatar, Badge, buttonVariants } from '@meith/ui'
import { Menu } from '@meith/ui/menu'
import type { UserPanelModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

/**
 * The welcome block (F25/F27) — MyBB's `header_welcomeblock`.
 *
 * **This module is still a Server Component**, and the slot registry still
 * declares `UserPanel` as `server`. What changed is that it now renders one
 * small island inside itself: the account menu. That distinction is the whole
 * design, and `scripts/slot-kinds.mjs` checks the half that matters — this file
 * carries no `"use client"`, so nothing here except the menu crosses to the
 * browser, and a guest's page ships none of it at all.
 *
 * ## Why a dropdown, after arguing against one
 *
 * The previous version of this comment said a menu would "put a JavaScript
 * bundle on the guest board index for the sake of a menu that a plain link
 * handles". The first half of that is still true and is why the guest branch
 * below renders two buttons and nothing else. The second half was wrong, and
 * rendering the real thing is what showed it: `links` is not two or three
 * items. A signed-in member is handed five, a moderator eight — profile,
 * control panel, notifications, messages, subscriptions, moderator CP, the
 * queue, reports — and the header printed every one of them, inline, above the
 * board's own navigation. Hierarchy alone did not save it; it was still eight
 * links wide and it wrapped onto two lines the moment a username was long.
 *
 * So the identity stays visible — avatar, name, and the counts that are the
 * reason anybody looks at this corner — and the *routes* move behind one
 * control. See `@meith/ui/menu` for what Base UI is buying, which is mostly the
 * keyboard and focus behaviour nobody hand-writes correctly.
 *
 * ## The no-JavaScript row is not a formality
 *
 * With scripting off the trigger is inert, so the same links render again as
 * plain anchors. That is the row this menu replaced, kept for exactly the
 * readers who would otherwise lose every account route on the board — and it is
 * what keeps "the board works without JavaScript" true of the header rather
 * than only of the pages.
 *
 * **It is swapped by a stylesheet, not by putting elements inside `<noscript>`.**
 * A browser with scripting *enabled* parses everything between `<noscript>`
 * tags as text rather than as elements, so React cannot hydrate anything it
 * renders there and a client component inside one is a hydration mismatch. What
 * `<noscript>` can carry safely is a `<style>`, and the rule below hides the
 * trigger and reveals the plain row. Both are in the DOM; exactly one is ever
 * displayed, so exactly one is ever in the accessibility tree.
 *
 * ## The counts are not links, and cannot be
 *
 * `unreadNotifications` and `unreadMessages` are numbers; the routes they belong
 * to are somewhere in `links`, and the model gives a theme no way to say which —
 * matching on the label would break the moment the board is translated. So they
 * render as badges beside the name, each with a full sentence for a screen
 * reader. Guessing the pairing from an href would be a theme building a URL,
 * which is the one thing the contract is clearest about.
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

  const name = viewer.username ?? 'Signed in'

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      {/*
        The swap. Scoped by `data-account`, which is on the two boxes below, so
        this rule cannot reach anything a plugin or a page put in the header.
        `dangerouslySetInnerHTML` rather than children: see this file's header
        for why elements inside `<noscript>` cannot be React's to hydrate.
      */}
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
              {/*
                A caret, drawn rather than imported: the theme has no icon set,
                and a dropdown with no affordance is a name somebody has to
                discover is clickable. `aria-hidden` because the trigger already
                says what it is and announces its own expanded state.
              */}
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
          {/*
            Account controls the app owns — the log-out form. Server-rendered
            here and passed through the island as children, which is what keeps
            its Server Action reference out of client code.
          */}
          {children}
        </Menu>
      </div>

      {/*
        The same routes, for a browser that will never open the menu. `hidden`
        until the `<noscript>` rule above overrides it — so with scripting on
        this costs a hidden element and nothing in the accessibility tree, and
        with scripting off it is the whole panel.

        `viewer.username` is repeated here because without the trigger there is
        nothing else naming who is signed in.
      */}
      <nav
        data-account="plain"
        /*
         * `style`, not the `hidden` attribute, and the difference is a cascade
         * rule worth writing down. Tailwind's preflight ships
         * `[hidden] { display: none !important }` **inside `@layer base`**, and
         * for `!important` declarations the layer order is inverted: a layered
         * `!important` beats an unlayered one. The `<noscript>` rule above is
         * unlayered, so against `hidden` it lost and this row stayed invisible
         * with scripting off — which is the exact case it exists for, and the
         * only case where nothing would have reported it.
         *
         * An inline style has no such problem: an author `!important` beats it.
         */
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
