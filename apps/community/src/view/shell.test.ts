import type { Actor } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
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
  it('names the timezone timestamps were formatted in', () => {
    expect(buildFooterModel().timezoneLabel).toBe(TIMEZONE_LABEL)
  })
})

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
  it('carries the display name the caller resolved', () => {
    expect(buildViewerModel(member, { displayName: 'ada' }).username).toBe('ada')
  })

  it('is null when the caller has no name to give, rather than inventing one', () => {
    expect(buildViewerModel(member).username).toBeNull()
    expect(buildViewerModel(guest).username).toBeNull()
  })
})

describe('buildBoardNavigation (F74)', () => {
  it('points only at routes that exist', () => {
    const hrefs = buildBoardNavigation(buildViewerModel(member)).map((link) => link.href)

    expect(hrefs).toEqual([
      '/',
      '/discover/new',
      '/discover/unanswered',
      '/discover/participated',
      '/search',
      '/online',
    ])
  })

  it('omits the personal view for a guest rather than offering a refusal', () => {
    const hrefs = buildBoardNavigation(buildViewerModel(guest)).map((link) => link.href)

    expect(hrefs).not.toContain('/discover/participated')
    expect(hrefs).toContain('/discover/new')
  })
})
