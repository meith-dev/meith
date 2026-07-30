/**
 * Focused unit tests for the global-action bypass logic that the F22 forum
 * matrix does not, by construction, exercise.
 *
 * These exist because mutation testing found a gap: deleting the
 * `admincp.access` gate from can() left all 388 matrix assertions green. The
 * matrix's eight actors are either full administrators (who pass admincp via the
 * admin bypass) or non-staff (who are denied it regardless), so no matrix cell
 * distinguishes "granted by the admincp.access rule" from "granted by the admin
 * bypass". The staff-member-with-ACP-but-not-full-admin case lives only here.
 *
 * See docs/deviations.md D12.
 */
import { describe, expect, it, vi } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@forum/core'

import { Authorizer } from './authorizer'
import { MemoryAuthorizationSource } from './fixture'
import type { Actor } from './types'

const source = new MemoryAuthorizationSource()

/** Build an actor with a hand-specified global permission set. */
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
    // This is the assertion that kills the M3 mutant. This actor never hits the
    // administrator bypass, so the grant can only come from the admincp.access
    // rule itself — remove that rule and this fails.
    const staff = actorWith({
      isAdministrator: false,
      isSuperModerator: false,
      canAccessAdminCp: true,
    })
    const auth = new Authorizer(source)
    expect(auth.can(staff, 'admincp.access', {})).toBe(true)
  })

  it('is denied to a super-moderator who lacks canAccessAdminCp', () => {
    // Proves the super-mod bypass (which force-grants forum-scoped actions)
    // does NOT leak into the admin control panel.
    const superMod = actorWith({
      isAdministrator: false,
      isSuperModerator: true,
      canAccessAdminCp: false,
    })
    const auth = new Authorizer(source)
    expect(auth.can(superMod, 'admincp.access', {})).toBe(false)
  })

  it('is DENIED to a full administrator whose group lacks canAccessAdminCp', () => {
    // Deliberate security posture (D12): ACP access is never emergent from the
    // administrator bypass — it requires the explicit column, so a compromised
    // or misconfigured bypass cannot escalate into the control panel. In
    // practice an administrator group carries canAccessAdminCp: true; this
    // asserts the *mechanism*, not a recommended configuration.
    const admin = actorWith({ isAdministrator: true, canAccessAdminCp: false })
    const auth = new Authorizer(source)
    expect(auth.can(admin, 'admincp.access', {})).toBe(false)
  })

  it('is granted to an administrator whose group has canAccessAdminCp — via the column, not the bypass', () => {
    const onBypass = vi.fn()
    const admin = actorWith({ isAdministrator: true, canAccessAdminCp: true })
    const auth = new Authorizer(source, { onBypass })

    expect(auth.can(admin, 'admincp.access', {})).toBe(true)
    // The decision short-circuits on the column *before* the bypass, so no
    // bypass is logged for ACP access. This is what keeps the audit trail honest
    // about how ACP entry was actually granted.
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

    // A forum matrix that denies posting outright.
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
