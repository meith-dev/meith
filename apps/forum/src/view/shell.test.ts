/**
 * F25 — the shell view models.
 *
 * These are pure functions, so this suite needs no database and no request. What
 * it is really pinning is the two rules that are easy to break by being helpful:
 * no link to a route that does not exist, and no permission conclusion drawn from
 * an actor's groups.
 */

import type { Actor } from '@forum/authorization'
import { emptyPermissionSet } from '@forum/core'
import { describe, expect, it } from 'vitest'

import {
  buildBoardNavigation,
  buildFooterModel,
  buildHeaderModel,
  buildUserPanelModel,
  buildViewerModel,
  BOARD_TITLE,
  TIMEZONE_LABEL,
} from './shell'

const guest: Actor = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: emptyPermissionSet(),
  permissionVersion: 1,
}

const member: Actor = {
  ...guest,
  userId: 42,
  groupIds: [2],
  primaryGroupId: 2,
  state: 'active',
}

describe('buildViewerModel', () => {
  it('marks a null user id as a guest', () => {
    const viewer = buildViewerModel(guest)

    expect(viewer.isGuest).toBe(true)
    expect(viewer.userId).toBeNull()
    expect(viewer.username).toBeNull()
  })

  it('marks a real user id as a member', () => {
    expect(buildViewerModel(member).isGuest).toBe(false)
    expect(buildViewerModel(member).userId).toBe(42)
  })

  it('links a member to the profile route', () => {
    expect(buildViewerModel(member).profileHref).toBe('/member/42')
  })

  /*
   * The panel must never decide admin access by looking at groups — that is F20's
   * banned pattern, and it drifts from the Authorizer's answer the moment a
   * permission changes. The caller asks the Authorizer and passes the result.
   */
  it('takes admin-panel access from the caller, never from the actor', () => {
    expect(buildViewerModel(member).canAccessAdminCp).toBe(false)
    expect(buildViewerModel(member, { canAccessAdminCp: true }).canAccessAdminCp).toBe(true)
  })

  it('carries a display name only when one is supplied', () => {
    expect(buildViewerModel(member, { displayName: 'ada' }).username).toBe('ada')
    expect(buildViewerModel(member).username).toBeNull()
  })
})

describe('buildUserPanelModel', () => {
  it('offers a guest sign-in and register', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.links.map((l) => l.href)).toEqual(['/login', '/register'])
  })

  it('offers the member profile and every account route', () => {
    expect(buildUserPanelModel(buildViewerModel(member)).links).toEqual([
      { label: 'Profile', href: '/member/42' },
      { label: 'Your control panel', href: '/usercp' },
      { label: 'Notifications', href: '/notifications' },
      /* F60. Always present rather than only when something is unread: a
         mailbox is somewhere a member goes to check. */
      { label: 'Messages', href: '/messages' },
      { label: 'Subscriptions', href: '/subscriptions' },
    ])
  })

  it('carries both unread counts, defaulting each to zero', () => {
    const none = buildUserPanelModel(buildViewerModel(member))
    expect(none.unreadNotifications).toBe(0)
    expect(none.unreadMessages).toBe(0)

    const some = buildUserPanelModel(buildViewerModel(member), {
      unreadNotifications: 3,
      unreadMessages: 2,
    })
    expect(some.unreadNotifications).toBe(3)
    expect(some.unreadMessages).toBe(2)
  })

  it('offers a guest no notification centre', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.links.map((l) => l.href)).not.toContain('/notifications')
  })

  it('reports no unread notifications unless it is given a count', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.unreadNotifications).toBe(0)
    /* F60 supplies this one; until then zero renders nothing. */
    expect(panel.unreadMessages).toBe(0)
  })

  it('carries the unread notification count the shell resolved (F55)', () => {
    const panel = buildUserPanelModel(buildViewerModel(member), {
      unreadNotifications: 3,
    })

    expect(panel.unreadNotifications).toBe(3)
  })
})

describe('buildHeaderModel', () => {
  it('links home and defaults to no navigation', () => {
    const header = buildHeaderModel(buildViewerModel(guest))

    expect(header.homeHref).toBe('/')
    expect(header.navigation).toEqual([])
  })

  it('passes navigation through unchanged', () => {
    const nav = [{ label: 'Search', href: '/search' }]

    expect(buildHeaderModel(buildViewerModel(guest), nav).navigation).toEqual(nav)
  })
})

describe('buildFooterModel', () => {
  /*
   * Every timestamp on the board is formatted server-side in one zone, so the
   * footer is where a reader learns which. Rendering "Today, 09:14" with no zone
   * stated is how a relative time ends up meaning nothing.
   */
  it('names the timezone timestamps were formatted in', () => {
    expect(buildFooterModel().timezoneLabel).toBe(TIMEZONE_LABEL)
  })
})

/**
 * The board title and the viewer's name, both of which were hardcoded.
 *
 * `BOARD_TITLE` stays as a *fallback* rather than being removed: the auth
 * screens and the error pages render the shell when the database may be
 * unreachable, and a header that throws while rendering an error page is the
 * worst possible failure.
 */
describe('the board title (F08)', () => {
  it('falls back to the constant when nothing resolves one', () => {
    expect(buildHeaderModel(buildViewerModel(guest)).boardTitle).toBe(BOARD_TITLE)
    expect(buildFooterModel().boardTitle).toBe(BOARD_TITLE)
  })

  it('uses the resolved name in the header and the footer alike', () => {
    expect(buildHeaderModel(buildViewerModel(guest), [], 'Ada"s Board').boardTitle).toBe('Ada"s Board')
    expect(buildFooterModel([], 'Ada"s Board').boardTitle).toBe('Ada"s Board')
  })
})

describe('ViewerModel.username', () => {
  /* It was `null` for every viewer on every page until the shell read it. */
  it('carries the display name the caller resolved', () => {
    expect(buildViewerModel(member, { displayName: 'ada' }).username).toBe('ada')
  })

  it('is null when the caller has no name to give, rather than inventing one', () => {
    expect(buildViewerModel(member).username).toBeNull()
    expect(buildViewerModel(guest).username).toBeNull()
  })
})

/**
 * F74. The header's navigation was `[]` for every viewer from F27 until the
 * discovery views gave it something true to say.
 */
describe('buildBoardNavigation (F74)', () => {
  it('points only at routes that exist', () => {
    /*
     * The rule `buildHeaderModel` states in its own doc comment, and the one
     * this builder is most likely to break later: a nav entry is a promise,
     * and a header linking to a 404 is worse than a header with one fewer
     * link. Every href here is checked against a real route in this repo.
     */
    const hrefs = buildBoardNavigation(buildViewerModel(member)).map((link) => link.href)

    expect(hrefs).toEqual([
      '/',
      '/discover/new',
      '/discover/unanswered',
      '/discover/participated',
      '/search',
    ])
  })

  it('omits the personal view for a guest rather than offering a refusal', () => {
    /*
     * `/discover/participated` needs a signed-in member, and a permanent
     * header entry that always refuses teaches people to ignore the header.
     * Kills the mutant that returns the same list for everybody.
     */
    const hrefs = buildBoardNavigation(buildViewerModel(guest)).map((link) => link.href)

    expect(hrefs).not.toContain('/discover/participated')
    expect(hrefs).toContain('/discover/new')
  })
})
