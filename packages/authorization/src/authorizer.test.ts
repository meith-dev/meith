import { describe, expect, it, vi } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import { Authorizer } from './authorizer'
import { MemoryAuthorizationSource } from './fixture'
import type { Actor } from './types'

const source = new MemoryAuthorizationSource()

function actorWith(global: Partial<PermissionSet>, overrides: Partial<Actor> = {}): Actor {
  return {
    userId: 99,
    groupIds: [2],
    primaryGroupId: 2,
    state: 'active',
    global: { ...emptyPermissionSet(), ...global },
    permissionVersion: 1,
    ...overrides,
  }
}

describe('admincp.access', () => {
  it('is granted to a staff member with canAccessAdminCp but NOT the administrator flag', () => {
    const staff = actorWith({
      isAdministrator: false,
      isSuperModerator: false,
      canAccessAdminCp: true,
    })
    const auth = new Authorizer(source)
    expect(auth.can(staff, 'admincp.access', {})).toBe(true)
  })

  it('is denied to a super-moderator who lacks canAccessAdminCp', () => {
    const superMod = actorWith({
      isAdministrator: false,
      isSuperModerator: true,
      canAccessAdminCp: false,
    })
    const auth = new Authorizer(source)
    expect(auth.can(superMod, 'admincp.access', {})).toBe(false)
  })

  it('is DENIED to a full administrator whose group lacks canAccessAdminCp', () => {
    const admin = actorWith({ isAdministrator: true, canAccessAdminCp: false })
    const auth = new Authorizer(source)
    expect(auth.can(admin, 'admincp.access', {})).toBe(false)
  })

  it('is granted to an administrator whose group has canAccessAdminCp — via the column, not the bypass', () => {
    const onBypass = vi.fn()
    const admin = actorWith({ isAdministrator: true, canAccessAdminCp: true })
    const auth = new Authorizer(source, { onBypass })

    expect(auth.can(admin, 'admincp.access', {})).toBe(true)
    expect(onBypass).not.toHaveBeenCalled()
  })

  it('is denied to an ordinary active user', () => {
    const auth = new Authorizer(source)
    expect(auth.can(actorWith({}), 'admincp.access', {})).toBe(false)
  })
})

describe('super-moderator bypass isolation', () => {
  it('force-grants a forum-scoped action the matrix would deny, and logs it', () => {
    const onBypass = vi.fn()
    const superMod = actorWith({ isSuperModerator: true })
    const auth = new Authorizer(source, { onBypass })

    const denied = { ...emptyPermissionSet(), canView: true, canPostThreads: false }
    expect(
      auth.can(superMod, 'thread.post', { forumId: 1, forum: denied }),
    ).toBe(true)
    expect(onBypass).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'super_moderator', action: 'thread.post' }),
    )
  })

  it('does NOT force-grant a global admin action', () => {
    const superMod = actorWith({ isSuperModerator: true, canAccessAdminCp: false })
    const auth = new Authorizer(source)
    expect(auth.can(superMod, 'admincp.access', {})).toBe(false)
  })
})

describe('forum-scoped action without a resolved matrix', () => {
  it('throws rather than silently denying — a missing Target.forum is a bug', () => {
    const auth = new Authorizer(source)
    expect(() => auth.can(actorWith({}), 'thread.post', { forumId: 1 })).toThrow()
  })
})

describe('flood.bypass', () => {
  it('is granted by the permission, without any forum context', () => {
    const actor = actorWith({ canBypassFloodCheck: true })

    expect(new Authorizer(source).can(actor, 'flood.bypass')).toBe(true)
  })

  it('is denied to an ordinary member', () => {
    expect(new Authorizer(source).can(actorWith({}), 'flood.bypass')).toBe(false)
  })

  it('is force-granted to an administrator, and logged like any bypass', () => {
    const onBypass = vi.fn()
    const admin = actorWith({ isAdministrator: true })

    expect(new Authorizer(source, { onBypass }).can(admin, 'flood.bypass')).toBe(true)
    expect(onBypass).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'administrator', action: 'flood.bypass' }),
    )
  })
})

describe('applicableGroupRows', () => {
  const rows = [
    { fieldId: 1, groupId: 2, canView: true },
    { fieldId: 1, groupId: 4, canView: false },
    { fieldId: 2, groupId: 7, canView: true },
  ]

  it('returns only the rows whose group the actor is in', () => {
    const actor = actorWith({}, { groupIds: [2, 7] })
    expect(new Authorizer(source).applicableGroupRows(actor, rows)).toEqual([
      rows[0],
      rows[2],
    ])
  })

  it('matches every group, not only the primary one', () => {
    const actor = actorWith({}, { groupIds: [2, 4], primaryGroupId: 2 })
    expect(new Authorizer(source).applicableGroupRows(actor, rows)).toEqual([
      rows[0],
      rows[1],
    ])
  })

  it('returns nothing when no row names one of the actor’s groups', () => {
    const actor = actorWith({}, { groupIds: [99] })
    expect(new Authorizer(source).applicableGroupRows(actor, rows)).toEqual([])
  })

  it('narrows by explicit group ids for somebody who has no actor yet', () => {
    expect(new Authorizer(source).applicableGroupRowsForGroups([4], rows)).toEqual([rows[1]])
  })
})
