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

  /*
   * F33 builds `/member/[id]`. Until it exists, composing the URL would put a
   * link to a 404 in the header of every page — so the model says `null` and the
   * theme renders no link. Delete this test when F33 lands and the builder starts
   * returning an href.
   */
  it('does not invent a profile href before F33 exists', () => {
    expect(buildViewerModel(member).profileHref).toBeNull()
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

  /*
   * A member gets nothing yet: profile is F33, UserCP is F57, admin is F63, and
   * log out is a POST to a Server Action rather than a link. An empty list is the
   * accurate rendering of a board with no member pages.
   */
  it('offers a member only routes that exist — which is none yet', () => {
    expect(buildUserPanelModel(buildViewerModel(member)).links).toEqual([])
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
