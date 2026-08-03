import { requireSlot } from '@forum/theme-kit'
import type { Actor } from '@forum/authorization'

import { LogoutForm } from '@/components/account/logout-form'
import { getContainer } from '@/server/container'
import { unreadMessageCount } from '@/server/messages'
import { touchActivity } from '@/server/relations'
import { touchCurrentLocation } from '@/server/presence'
import { unreadNotificationCount } from '@/server/notifications'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { getSettings } from '@/server/settings'
import { avatarsFor } from '@/server/avatars'
import { activeTheme } from '@/server/theme'
import {
  buildBoardNavigation,
  buildFooterModel,
  buildHeaderModel,
  buildUserPanelModel,
  buildViewerModel,
} from '@/view/shell'

/**
 * The chrome every page renders inside (F27).
 *
 * ## Why this exists rather than each layout composing slots itself
 *
 * A slot never renders another slot — the page or layout resolves them and
 * composes (D35). Left there, every layout would repeat the same four
 * `requireSlot` calls and the same four builders, and they would drift: the auth
 * screens would grow a header the board pages do not have, or lose one they
 * should. So the composition lives here, once, and layouts hand it their body.
 *
 * It is not a theme slot itself, deliberately. The *order* of header, body and
 * footer is the application's structure; what each of those looks like is the
 * theme's. A theme that wants a sidebar overrides `Shell` and gets the same
 * children.
 */
export async function PageShell({
  actor,
  children,
}: {
  actor: Actor
  children: React.ReactNode
}) {
  const Shell = requireSlot(activeTheme, 'Shell')
  const Header = requireSlot(activeTheme, 'Header')
  const UserPanel = requireSlot(activeTheme, 'UserPanel')
  const Footer = requireSlot(activeTheme, 'Footer')

  /*
   * The board's name, from `board.name` (F08). Cached globally and tagged, so
   * this costs no query per request — and it is board-wide rather than
   * viewer-dependent, which is exactly the shape F10's cache guard permits.
   */
  const settings = await getSettings()
  const boardTitle = settings.get('board.name')

  /*
   * The viewer's own name. `Actor` carries permissions rather than profile data
   * (F20), so it is read here — one indexed primary-key lookup on a row the
   * shell is the only caller of. Every page that wanted to greet somebody by
   * name previously could not, and `ViewerModel.username` was always `null`.
   *
   * A failure is swallowed to `null` rather than propagated: a missing display
   * name is a cosmetic loss, and taking the whole page down for it would make
   * the profile table a dependency of rendering the header.
   */
  const displayName =
    actor.userId === null
      ? null
      : ((await getContainer()
          .memberProfiles.findPublicById(actor.userId)
          .catch(() => null))?.username ?? null)

  /*
   * `canAccessModCp` is a permission field, not a group check — the same rule
   * `canAccessAdminCp` follows. It is read off the already-resolved actor, so
   * the shell costs no extra query on any page (F48).
   */
  /*
   * F58. One read for the signed-in member, memoised per request by
   * `avatarsFor`, so a page that also renders their avatar in a postbit does
   * not fetch it twice. Guests skip it entirely.
   */
  const ownAvatar =
    actor.userId === null
      ? null
      : ((await avatarsFor([actor.userId])).get(actor.userId) ?? null)

  const viewer = buildViewerModel(actor, {
    displayName,
    canAccessModCp: actor.global.canAccessModCp === true,
    avatarUrl: ownAvatar,
  })
  const header = buildHeaderModel(viewer, buildBoardNavigation(viewer), boardTitle)

  /*
   * F55's badge. One count per page render for a signed-in member — the reason
   * `notifications_unread_idx` is partial — and zero queries for a guest or on
   * a board with no notification store. Swallowed to 0 on failure inside
   * `unreadNotificationCount`, because the shell also renders the error pages.
   */
  const unreadNotifications = await unreadNotificationCount(actor.userId)

  /*
   * F60's badge, filling a `UserPanelModel` field the theme contract has
   * carried since F27 with nothing to put in it. Same shape and same costs as
   * the count above, over its own partial index.
   */
  const unreadMessages = await unreadMessageCount(actor.userId)

  /*
   * F61. `users.last_active_at` has been in the schema since `0000` with no
   * writer; this is it. A conditional UPDATE that usually matches nothing —
   * the throttle is in the repository's WHERE clause — so it is not a write per
   * page view, and it never throws.
   */
  await touchActivity(actor.userId)

  /*
   * F75. `sessions.location_*` has been in the schema since `0000` and
   * `touchLocation` since F17, with no caller; this is it. Beside
   * `touchActivity` for the same reason — the shell is the one place every
   * reading page passes through — and throttled the same way, in the `where`
   * clause, so it is not a write per page view. Guests included: they are most
   * of an online list, and a board that counted only members would report a
   * fraction of its own traffic.
   */
  await touchCurrentLocation()

  /*
   * F57. The zone the footer names, and the one every timestamp on the page was
   * formatted in — resolved once per request and shared with the page body
   * through `React.cache`, so this costs no second read.
   */
  const preferences = await getViewerPreferences()

  return (
    <Shell boardTitle={header.boardTitle} viewer={viewer}>
      <Header {...header}>
        <UserPanel {...buildUserPanelModel(viewer, { unreadNotifications, unreadMessages })}>
          {/*
           * Only for a signed-in viewer, and only as a form: log out is a POST to
           * a Server Action, which cannot cross into the theme as data. A theme
           * decides where in the panel it sits, not whether it exists.
           */}
          {viewer.isGuest ? null : <LogoutForm />}
        </UserPanel>
      </Header>

      {children}

      <Footer {...buildFooterModel([], boardTitle, preferences.timezone)} />
    </Shell>
  )
}
