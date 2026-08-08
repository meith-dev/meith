/**
 * Shell view models (F25/F27).
 *
 * The first inhabitant of `src/view/`, which
 * `docs/nextjs-conventions.md` specifies as the home for typed page view models:
 * pages resolve params, build a view model, and hand it to components. **No
 * database row ever reaches a theme.**
 *
 * These builders are pure functions of already-resolved data — no `cookies()`, no
 * `getActor()`, no repository. That is what makes them unit-testable without a
 * request, and it is why the actor arrives as an argument rather than being read
 * here: a view builder that resolves the viewer itself cannot be called from a
 * cached region, and F10's guard would (correctly) reject it.
 */

import type { Actor } from '@meith/authorization'
import type {
  FooterModel,
  HeaderModel,
  LinkModel,
  LogoModel,
  UserPanelModel,
  ViewerModel,
} from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { timezoneLabel } from './time'

/**
 * The board's name when nothing has resolved one.
 *
 * A *fallback*, not the board's name — `board.name` is in the settings registry
 * and `PageShell` reads it. This is what the auth screens and the error pages
 * render, because both have to work when the database is unreachable and a
 * shell that throws while rendering an error page is the worst possible failure.
 */
export const BOARD_TITLE = 'Meith'

/**
 * Which timezone every `TimeModel.label` on the page was formatted in.
 *
 * The board's default, and the answer for a guest. A signed-in member's own
 * zone arrives as an argument to `buildFooterModel` — F57 made the constant a
 * fallback rather than the rule.
 *
 * The footer names it either way, and that is the point: silently rendering
 * local-looking times in a zone the reader did not choose is how "an hour ago"
 * ends up meaning nothing.
 */
export const TIMEZONE_LABEL = 'UTC'

/**
 * The viewer, as a theme is allowed to see them.
 *
 * `displayName` is passed in rather than looked up. `Actor` deliberately carries
 * permissions and group ids, not profile data (F20), so a page that wants to
 * greet someone by name has already read their row for another reason and can
 * supply it. The auth screens pass `null`: they exist for people who are not
 * signed in, and a name is not worth a query there.
 *
 * `canAccessAdminCp` is resolved by the caller through the Authorizer, never by
 * inspecting groups here — a rendering decision derived from group membership is
 * exactly what F20's lint rule bans, and it drifts from the real answer.
 */
export function buildViewerModel(
  actor: Actor,
  options: {
    displayName?: string | null
    canAccessAdminCp?: boolean
    canAccessModCp?: boolean
    /** F58. Null for a guest, for nobody who set one, and for a locked one. */
    avatarUrl?: string | null
  } = {},
): ViewerModel {
  const isGuest = actor.userId === null

  return {
    isGuest,
    userId: actor.userId,
    username: options.displayName ?? null,
    profileHref: actor.userId === null ? null : memberHref(actor.userId),
    /* F58. Supplied by the layout for a signed-in member; null for a guest,
       for anybody who has not set one, and for a locked one. */
    avatarUrl: options.avatarUrl ?? null,
    canAccessAdminCp: options.canAccessAdminCp ?? false,
    canAccessModCp: options.canAccessModCp ?? false,
  }
}

/**
 * The header's model.
 *
 * `navigation` is passed in because what belongs in it changes per phase — search
 * arrives with F73, the member list with F33 — and a builder that guessed would
 * be advertising pages that 404.
 */
export function buildHeaderModel(
  viewer: ViewerModel,
  navigation: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
  /*
   * Resolved by the caller, because deciding *which* logo a reader sees needs
   * the colour-scheme cookie and this module is a pure builder. Defaulted to
   * null so every existing call site — the auth screens and the error shell,
   * which render before there is a board to have a logo — keeps working.
   */
  logo: LogoModel | null = null,
): HeaderModel {
  return {
    boardTitle,
    homeHref: '/',
    viewer,
    navigation,
    ...(logo === null ? {} : { logo }),
  }
}

/**
 * The board's own navigation — the header's second row.
 *
 * `HeaderModel.navigation` has been part of the theme contract since F27 and
 * every caller has passed `[]`, for the reason `buildHeaderModel` states: a
 * builder that guessed would advertise pages that 404. F74 is the first phase
 * where enough of them exist to fill it, and it is the feature that needs it —
 * a discovery view nothing links to is a page only its author knows about.
 *
 * **Only routes that exist, and only routes this viewer can use.** The two
 * personal views are omitted for a guest rather than shown and refused: a
 * refusal is the right answer to a link somebody followed, and the wrong thing
 * to put in a permanent header. (The tab strip on the page itself does show
 * all five — somebody already on that page is looking for the list, and being
 * told to sign in beats the tab not existing.)
 */
export function buildBoardNavigation(viewer: ViewerModel): readonly LinkModel[] {
  return [
    { label: 'Communities', href: '/' },
    /* F74. The default view; the rest are tabs once a member is there. */
    { label: 'New posts', href: '/discover/new' },
    { label: 'Unanswered', href: '/discover/unanswered' },
    ...(viewer.isGuest ? [] : [{ label: 'My posts', href: '/discover/participated' }]),
    /* F73. In the header rather than only on its own page, because search is
       something a member reaches for from wherever they happen to be. */
    { label: 'Search', href: '/search' },
    /* F75. Both are linked from the index panels too; they are here because a
       member two communities deep should not have to go home to reach them. */
    { label: "Who's online", href: '/online' },
  ]
}

/**
 * The user panel's links.
 *
 * **Only routes that exist.** A guest gets sign-in and register, which are built
 * (F18/F19). A member gets their profile; the UserCP is F57, and the admin panel
 * is F63 — and log out is not a link at all, it is a POST to a
 * Server Action, so it cannot be one. `canAccessAdminCp` still crosses in the
 * viewer model because it is part of the contract themes are written against; it
 * simply has nothing to point at until F63.
 */
export function buildUserPanelModel(
  viewer: ViewerModel,
  options: { unreadNotifications?: number; unreadMessages?: number } = {},
): UserPanelModel {
  const links: readonly LinkModel[] = viewer.isGuest
    ? [
        { label: 'Sign in', href: '/login' },
        { label: 'Register', href: '/register' },
      ]
    : viewer.profileHref === null
      ? []
      : [
          { label: 'Profile', href: viewer.profileHref },
          /* F57. First of the account links, because it is where the rest are. */
          { label: 'Your control panel', href: '/usercp' },
          /*
           * F55. Listed for every member rather than only when something is
           * unread: the centre is where a member goes to check, and a link that
           * appears and disappears is one nobody learns the position of. The
           * count beside it is the part that varies.
           */
          { label: 'Notifications', href: '/notifications' },
          /*
           * F60. Beside the notification centre, and for the same reason: a
           * mailbox is somewhere a member goes to check rather than somewhere
           * they are sent, so the link is always there and only the count moves.
           */
          { label: 'Messages', href: '/messages' },
          /* F56. Beside the centre, because the two answer each other's question. */
          { label: 'Subscriptions', href: '/subscriptions' },
          ...(viewer.canAccessModCp
            ? [
                /*
                 * F54's panel first: it is the page a moderator opens when
                 * nobody has handed them a link, and the other two are sections
                 * of it. They stay in the nav because a moderator working a
                 * queue goes straight there several times an hour.
                 */
                { label: 'Moderator CP', href: '/modcp' },
                { label: 'Moderation queue', href: '/moderation' },
                { label: 'Reports', href: '/moderation/reports' },
              ]
            : []),
        ]

  return {
    viewer,
    links,
    /*
     * F55 supplies the first, F60 the second. Zero renders nothing, which is
     * the correct empty state — and is what a guest, a board with no store, and
     * a failed count all resolve to.
     */
    unreadNotifications: options.unreadNotifications ?? 0,
    unreadMessages: options.unreadMessages ?? 0,
  }
}

/**
 * What the board runs on, in the footer of every page.
 *
 * Here rather than in each theme because the app owns the words and the URL, the
 * same as it owns every other href a theme is handed — `themes/default` and
 * `themes/midnight` would otherwise carry a copy each, and a third theme a
 * third.
 *
 * The URL is spelled out rather than imported. `apps/web` is the site at the
 * other end of it and holds the same string in `src/content/site.ts`, but it
 * shares no package with the board — it depends on `next`, `react`, `marked` and
 * `shiki`, and nothing in this workspace — so a shared constant would mean
 * making the marketing site a dependent of the community to save one literal.
 */
const POWERED_BY: LinkModel = { label: 'Powered by Meith', href: 'https://meith.dev' }

export function buildFooterModel(
  links: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
  /** The viewer's zone (F57). Defaults to the board's. */
  zone: string = TIMEZONE_LABEL,
): FooterModel {
  return {
    boardTitle,
    links,
    timezoneLabel: timezoneLabel(zone),
    poweredBy: POWERED_BY,
  }
}
