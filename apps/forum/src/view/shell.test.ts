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

  it('offers the member profile route', () => {
    expect(buildUserPanelModel(buildViewerModel(member)).links).toEqual([
      { label: 'Profile', href: '/member/42' },
    ])
  })

  it('reports no unread counts until F55', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.unreadNotifications).toBe(0)
    expect(panel.unreadMessages).toBe(0)
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
