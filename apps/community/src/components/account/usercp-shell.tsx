/**
 * F57 — the member control panel's shell.
 *
 * ## Why a component and not one layout
 *
 * The panel's sections live in four route trees: `/usercp`, `/messages`,
 * `/notifications` and `/subscriptions`. They are not being merged — each has
 * its own URL, is linked from e-mails and from the user panel, and moving them
 * would break bookmarks for a tidier file tree, which is the wrong trade.
 *
 * So each of those segments has a layout, and each layout is this component.
 * A rail that vanished the moment you opened your inbox would be worse than no
 * rail: it would teach a member that the panel is somewhere they leave. The
 * ModCP has since met the same problem — its queue and reports are under
 * `/moderation` — and `ModCpShell` is the same answer.
 *
 * ## It is not the ACP's shell, and should not be
 *
 * The ACP replaces the board's chrome entirely, because it is a different
 * surface with different authority. This one sits *inside* the board — same
 * header, same footer, same theme — because it is the member's own corner of
 * the board rather than somewhere else. What it borrows is the *arrangement*,
 * and it borrows it literally: `PanelShell` is the sticky rail, the
 * `<details>` below `lg`, and the measure, for all three panels at once.
 *
 * The page keeps its own `<main id="board-content">`, through `PanelPage`, so
 * the skip link still lands on the page's content and not on the rail that
 * precedes it.
 *
 * ## The counts on the rail cost nothing
 *
 * `PageShell` reads both for the user panel's badges on every page a signed-in
 * member loads, and both are `React.cache`d — so the rail's "3" beside
 * Notifications is the same read the header's badge made, and cannot disagree
 * with it. A count that renders as 0 renders as nothing (see `countFor`).
 */

import { getActor } from '@/server/context'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import type { PanelLink } from '@/components/shell/panel-links'
import { PanelShell } from '@/components/shell/panel-shell'

import { UserCpNav } from './usercp-nav'

export async function UserCpShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  /*
   * A member who moderates gets the way through to the other panel. It is a
   * permission field read off the already-resolved actor, so it costs no query.
   * The ACP is deliberately never linked from the board — see `PanelLinks`.
   */
  const links: readonly PanelLink[] =
    actor.global.canAccessModCp === true
      ? [{ href: '/modcp', label: 'Moderator CP' }]
      : []

  return (
    <PanelShell
      nav={
        <UserCpNav counts={{ '/messages': messages, '/notifications': notifications }} />
      }
      links={links}
    >
      {children}
    </PanelShell>
  )
}
