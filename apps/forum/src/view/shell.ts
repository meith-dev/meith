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

import type { Actor } from '@forum/authorization'
import type { FooterModel, HeaderModel, LinkModel, UserPanelModel, ViewerModel } from '@forum/theme-kit'

import { memberHref } from './member-profile'

/**
 * The board's name when nothing has resolved one.
 *
 * A *fallback*, not the board's name — `board.name` is in the settings registry
 * and `PageShell` reads it. This is what the auth screens and the error pages
 * render, because both have to work when the database is unreachable and a
 * shell that throws while rendering an error page is the worst possible failure.
 */
export const BOARD_TITLE = 'Forum'

/**
 * Which timezone every `TimeModel.label` on the page was formatted in.
 *
 * A constant for now: per-user timezones are F57 (UserCP), and until then the
 * board formats in UTC. Naming it in the footer is the honest version of that —
 * silently rendering local-looking times in UTC is how "an hour ago" ends up
 * meaning nothing.
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
  } = {},
): ViewerModel {
  const isGuest = actor.userId === null

  return {
    isGuest,
    userId: actor.userId,
    username: options.displayName ?? null,
    profileHref: actor.userId === null ? null : memberHref(actor.userId),
    // F58. No avatar pipeline yet, and a broken <img> is worse than none.
    avatarUrl: null,
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
): HeaderModel {
  return {
    boardTitle,
    homeHref: '/',
    viewer,
    navigation,
  }
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
export function buildUserPanelModel(viewer: ViewerModel): UserPanelModel {
  const links: readonly LinkModel[] = viewer.isGuest
    ? [
        { label: 'Sign in', href: '/login' },
        { label: 'Register', href: '/register' },
      ]
    : viewer.profileHref === null
      ? []
      : [
          { label: 'Profile', href: viewer.profileHref },
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
    // F55 supplies both. Zero renders nothing, which is the correct empty state.
    unreadNotifications: 0,
    unreadMessages: 0,
  }
}

export function buildFooterModel(
  links: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
): FooterModel {
  return {
    boardTitle,
    links,
    timezoneLabel: TIMEZONE_LABEL,
  }
}
