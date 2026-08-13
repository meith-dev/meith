import type { Actor } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
import { describe, expect, it } from 'vitest'

import {
  buildBoardNavigation,
  buildFooterModel,
  buildHeaderModel,
  buildPanelLinks,
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
      { label: 'Profile', href: '/member/42', group: 'account' },
      { label: 'Your control panel', href: '/usercp', group: 'account' },
      { label: 'Notifications', href: '/notifications', group: 'account' },
      { label: 'Messages', href: '/messages', group: 'account' },
      { label: 'Subscriptions', href: '/subscriptions', group: 'account' },
    ])
  })

  it('offers the admin panel only to a viewer who may reach it', () => {
    const plain = buildUserPanelModel(buildViewerModel(member))
    expect(plain.links.map((l) => l.href)).not.toContain('/admin')

    const admin = buildUserPanelModel(
      buildViewerModel(member, { canAccessAdminCp: true }),
    )
    expect(admin.links.map((l) => l.href)).toContain('/admin')
  })

  it('puts the admin panel beside the moderator panel, not among the account routes', () => {
    const staff = buildUserPanelModel(
      buildViewerModel(member, { canAccessAdminCp: true, canAccessModCp: true }),
    )
    const hrefs = staff.links.map((l) => l.href)

    expect(hrefs.indexOf('/admin')).toBe(hrefs.indexOf('/subscriptions') + 1)
    expect(hrefs.indexOf('/modcp')).toBe(hrefs.indexOf('/admin') + 1)
  })

  it('marks the staff run as its own group, so a theme can rule it off', () => {
    const staff = buildUserPanelModel(
      buildViewerModel(member, { canAccessAdminCp: true, canAccessModCp: true }),
    )

    const groups = staff.links.map((link) => link.group)
    const changes = groups.filter((group, index) => index > 0 && group !== groups[index - 1])

    expect(changes).toEqual(['staff'])
    expect(groups[0]).toBe('account')
  })

  it('leaves a guest ungrouped, because two buttons are not a menu', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.links.every((link) => link.group === undefined)).toBe(true)
  })

  it('points the unread counts somewhere, so a badge can be clicked', () => {
    const panel = buildUserPanelModel(buildViewerModel(member), {
      unreadNotifications: 3,
      unreadMessages: 1,
    })

    expect(panel.notificationsHref).toBe('/notifications')
    expect(panel.messagesHref).toBe('/messages')
  })

  it('gives a guest nowhere to click, having nothing unread to click to', () => {
    const panel = buildUserPanelModel(buildViewerModel(guest))

    expect(panel.notificationsHref).toBeUndefined()
    expect(panel.messagesHref).toBeUndefined()
  })

  it('offers a guest no admin panel, whatever the flag says', () => {
    const panel = buildUserPanelModel(
      buildViewerModel(guest, { canAccessAdminCp: true }),
    )

    expect(panel.links.map((l) => l.href)).not.toContain('/admin')
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

  it('carries the unread notification count the shell resolved', () => {
    const panel = buildUserPanelModel(buildViewerModel(member), {
      unreadNotifications: 3,
    })

    expect(panel.unreadNotifications).toBe(3)
  })
})

describe('buildPanelLinks', () => {
  it('never links a panel back to itself', () => {
    expect(
      buildPanelLinks({ current: 'usercp' }).map((link) => link.href),
    ).not.toContain('/usercp')
  })

  it('offers a plain member nothing but the panel they are in', () => {
    expect(buildPanelLinks({ current: 'usercp' })).toEqual([])
  })

  it('offers the moderator and admin panels to staff who may reach them', () => {
    expect(
      buildPanelLinks({
        current: 'usercp',
        canAccessModCp: true,
        canAccessAdminCp: true,
      }),
    ).toEqual([
      { label: 'Moderator CP', href: '/modcp' },
      { label: 'Admin CP', href: '/admin' },
    ])
  })

  it('offers the admin panel from the moderator panel', () => {
    expect(
      buildPanelLinks({ current: 'modcp', canAccessAdminCp: true }).map((l) => l.href),
    ).toEqual(['/usercp', '/admin'])
  })

  it('withholds the admin panel from a moderator who may not reach it', () => {
    expect(
      buildPanelLinks({ current: 'modcp', canAccessModCp: true }).map((l) => l.href),
    ).toEqual(['/usercp'])
  })

  it('offers the other two panels from the admin panel', () => {
    expect(
      buildPanelLinks({ current: 'admincp', canAccessModCp: true }).map((l) => l.href),
    ).toEqual(['/usercp', '/modcp'])
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

describe('the board title', () => {
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

describe('buildBoardNavigation', () => {
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
