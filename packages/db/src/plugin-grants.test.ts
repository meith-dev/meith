import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ActorBuilder } from './actor-builder'
import {
  expireTimedGroupMemberships,
  permissionsCarryPower,
  pluginGrants,
} from './plugin-grants'
import { createTestDb, type TestDb } from './pglite.fixture'
import { cacheVersions, usergroups, userGroupMemberships, users } from './schema'

let h: TestDb

beforeAll(async () => {
  h = await createTestDb()
})
afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.db.delete(userGroupMemberships)
  await h.db.delete(users)
  await h.db.delete(usergroups)
  await h.db.delete(cacheVersions)
})

async function group(key: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [row] = await h.db
    .insert(usergroups)
    .values({ key, title: key, ...extra })
    .returning({ id: usergroups.id })
  return row!.id
}

async function user(username: string, primaryGroupId: number): Promise<number> {
  const lower = username.toLowerCase()
  const [row] = await h.db
    .insert(users)
    .values({
      username,
      usernameLower: lower,
      email: `${lower}@example.com`,
      emailLower: `${lower}@example.com`,
      primaryGroupId,
    })
    .returning({ id: users.id })
  return row!.id
}

async function permissionVersion(): Promise<number> {
  const rows = await h.db.select().from(cacheVersions)
  return rows.find((row) => row.key === 'permissions')?.version ?? 0
}

const HOUR = 3_600_000
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR)

describe('pluginGrants — refusals', () => {
  it('refuses a group that does not exist', async () => {
    const members = await group('members')
    const uid = await user('Alice', members)

    await expect(
      pluginGrants(h.db, 'dues').grant({
        userId: uid,
        groupKey: 'nowhere',
        until: inHours(1),
        reason: 'test',
      }),
    ).rejects.toThrow(/no group is keyed/)
  })

  it('refuses a group not marked grantable', async () => {
    const members = await group('members')
    await group('supporters')
    const uid = await user('Alice', members)

    await expect(
      pluginGrants(h.db, 'dues').grant({
        userId: uid,
        groupKey: 'supporters',
        until: inHours(1),
        reason: 'test',
      }),
    ).rejects.toThrow(/not marked as grantable/)
  })

  it.each([
    ['a system group', { isSystem: true, pluginGrantable: true }, /system group/],
    ['a staff group', { isStaffGroup: true, pluginGrantable: true }, /staff group/],
    ['an administrator group', { isAdministrator: true, pluginGrantable: true }, /power/],
    ['a moderation group', { canAccessModCp: true, pluginGrantable: true }, /power/],
    ['an approver group', { canApproveContent: true, pluginGrantable: true }, /power/],
  ])('refuses %s even when the flag is set', async (_kind, extra, message) => {
    const members = await group('members')
    await group('target', extra)
    const uid = await user('Alice', members)

    await expect(
      pluginGrants(h.db, 'dues').grant({
        userId: uid,
        groupKey: 'target',
        until: inHours(1),
        reason: 'test',
      }),
    ).rejects.toThrow(message)
  })

  it('refuses a past expiry, a two-year-plus expiry, and an empty reason', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await expect(
      grants.grant({ userId: uid, groupKey: 'supporters', until: inHours(-1), reason: 'x' }),
    ).rejects.toThrow(/past/)
    await expect(
      grants.grant({
        userId: uid,
        groupKey: 'supporters',
        until: inHours(3 * 366 * 24),
        reason: 'x',
      }),
    ).rejects.toThrow(/two years/)
    await expect(
      grants.grant({ userId: uid, groupKey: 'supporters', until: inHours(1), reason: '  ' }),
    ).rejects.toThrow(/reason/)
  })

  it('refuses to touch a membership someone else granted', async () => {
    const members = await group('members')
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    await h.db.insert(userGroupMemberships).values({ userId: uid, groupId: paid })

    await expect(
      pluginGrants(h.db, 'dues').grant({
        userId: uid,
        groupKey: 'supporters',
        until: inHours(1),
        reason: 'bought a pass',
      }),
    ).rejects.toThrow(/someone else/)

    // And revoking it silently does nothing rather than deleting it.
    await pluginGrants(h.db, 'dues').revoke({
      userId: uid,
      groupKey: 'supporters',
      reason: 'refund',
    })
    const rows = await h.db.select().from(userGroupMemberships)
    expect(rows).toHaveLength(1)
  })
})

describe('pluginGrants — the grant lifecycle', () => {
  it('grants, shows up on the actor, and bumps the permission version', async () => {
    const members = await group('members', { canView: true })
    await group('supporters', { pluginGrantable: true, canUploadAttachments: true })
    const uid = await user('Alice', members)
    const before = await permissionVersion()

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
    })

    const actor = await new ActorBuilder(h.db, { guestGroupId: members }).buildForUser(uid)
    expect(actor!.global.canUploadAttachments).toBe(true)
    expect(await permissionVersion()).toBeGreaterThan(before)

    const listed = await pluginGrants(h.db, 'dues').list(uid)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.groupKey).toBe('supporters')
  })

  it('re-granting moves the expiry forward, never backward', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await grants.grant({ userId: uid, groupKey: 'supporters', until: inHours(48), reason: 'a' })
    await grants.grant({ userId: uid, groupKey: 'supporters', until: inHours(24), reason: 'b' })

    const [row] = await pluginGrants(h.db, 'dues').list(uid)
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * HOUR)
  })

  it('extend is monotonic too, and does not create a grant', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await grants.extend({ userId: uid, groupKey: 'supporters', until: inHours(24) })
    expect(await grants.list(uid)).toHaveLength(0)

    await grants.grant({ userId: uid, groupKey: 'supporters', until: inHours(24), reason: 'a' })
    await grants.extend({ userId: uid, groupKey: 'supporters', until: inHours(12) })
    const [kept] = await grants.list(uid)
    expect(kept!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR)

    await grants.extend({ userId: uid, groupKey: 'supporters', until: inHours(72) })
    const [extended] = await grants.list(uid)
    expect(extended!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * HOUR)
  })

  it('revoke removes only its own grant and bumps', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'other').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'theirs',
    })

    await pluginGrants(h.db, 'dues').revoke({
      userId: uid,
      groupKey: 'supporters',
      reason: 'not ours',
    })
    expect(await pluginGrants(h.db, 'other').list(uid)).toHaveLength(1)

    const before = await permissionVersion()
    await pluginGrants(h.db, 'other').revoke({
      userId: uid,
      groupKey: 'supporters',
      reason: 'chargeback',
    })
    expect(await pluginGrants(h.db, 'other').list(uid)).toHaveLength(0)
    expect(await permissionVersion()).toBeGreaterThan(before)
  })
})

describe('pluginGrants — the primary group', () => {
  async function primaryOf(userId: number): Promise<number> {
    const [row] = await h.db
      .select({ primaryGroupId: users.primaryGroupId })
      .from(users)
      .where(eq(users.id, userId))
    return row!.primaryGroupId
  }

  async function secondaries(userId: number): Promise<number[]> {
    const rows = await h.db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, userId))
    return rows.map((row) => row.groupId).sort((a, b) => a - b)
  }

  it('makes the granted group primary and keeps the displaced one as a secondary', async () => {
    const members = await group('members')
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })

    expect(await primaryOf(uid)).toBe(paid)
    expect(await secondaries(uid)).toEqual([members, paid].sort((a, b) => a - b))
  })

  it('leaves the primary group alone when the grant does not ask for it', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
    })

    expect(await primaryOf(uid)).toBe(members)
  })

  it('hands the primary group back on revoke', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await grants.grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })
    await grants.revoke({ userId: uid, groupKey: 'supporters', reason: 'refunded' })

    expect(await primaryOf(uid)).toBe(members)
    expect(await secondaries(uid)).toEqual([])
  })

  it('hands the primary group back when the sweep collects a lapsed grant', async () => {
    const members = await group('members')
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(1),
      reason: 'order 42 paid',
      primary: true,
    })
    await h.db
      .update(userGroupMemberships)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userGroupMemberships.groupId, paid))

    expect(await expireTimedGroupMemberships(h.db, 100)).toBe(1)
    expect(await primaryOf(uid)).toBe(members)
    expect(await secondaries(uid)).toEqual([])
  })

  it('stops conferring the promoted group at the expiry, before any sweep runs', async () => {
    const members = await group('members', { canView: true })
    const paid = await group('supporters', {
      pluginGrantable: true,
      canUploadAttachments: true,
    })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(1),
      reason: 'order 42 paid',
      primary: true,
    })
    await h.db
      .update(userGroupMemberships)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userGroupMemberships.groupId, paid))

    const actor = await new ActorBuilder(h.db, { guestGroupId: members }).buildForUser(uid)
    expect(actor!.global.canUploadAttachments).toBe(false)
    expect(actor!.primaryGroupId).toBe(members)
  })

  it('remembers the group behind every promotion, not the one it displaced', async () => {
    const members = await group('members')
    await group('supporters', { pluginGrantable: true })
    const gold = await group('gold', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await grants.grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'a pass',
      primary: true,
    })
    await grants.grant({
      userId: uid,
      groupKey: 'gold',
      until: inHours(48),
      reason: 'a better pass',
      primary: true,
    })
    expect(await primaryOf(uid)).toBe(gold)

    await grants.revoke({ userId: uid, groupKey: 'supporters', reason: 'refunded' })
    expect(await primaryOf(uid)).toBe(gold)

    await grants.revoke({ userId: uid, groupKey: 'gold', reason: 'refunded' })
    expect(await primaryOf(uid)).toBe(members)
    expect(await secondaries(uid)).toEqual([])
  })

  it('displaces a plain system group, which is what Registered is on every board', async () => {
    const members = await group('members', { isSystem: true })
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })

    expect(await primaryOf(uid)).toBe(paid)
  })

  it.each([
    ['a staff group', { isStaffGroup: true }],
    ['an administrator group', { isAdministrator: true }],
    ['a moderation group', { canAccessModCp: true }],
    ['a warner group', { canWarnUsers: true }],
  ])('never displaces %s', async (_kind, extra) => {
    const staff = await group('staff', extra)
    await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', staff)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })

    expect(await primaryOf(uid)).toBe(staff)
  })

  it('still grants the group to staff, as an ordinary secondary membership', async () => {
    const staff = await group('staff', { isStaffGroup: true })
    const paid = await group('supporters', {
      pluginGrantable: true,
      canUploadAttachments: true,
    })
    const uid = await user('Alice', staff)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })

    expect(await secondaries(uid)).toEqual([paid])
    const actor = await new ActorBuilder(h.db, { guestGroupId: staff }).buildForUser(uid)
    expect(actor!.global.canUploadAttachments).toBe(true)
    expect(actor!.primaryGroupId).toBe(staff)
  })

  it('leaves a staff member’s standing alone when the grant lapses', async () => {
    const staff = await group('staff', { isStaffGroup: true })
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', staff)

    await pluginGrants(h.db, 'dues').grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(1),
      reason: 'order 42 paid',
      primary: true,
    })
    await h.db
      .update(userGroupMemberships)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userGroupMemberships.groupId, paid))

    expect(await expireTimedGroupMemberships(h.db, 100)).toBe(1)
    expect(await primaryOf(uid)).toBe(staff)
    expect(await secondaries(uid)).toEqual([])
  })

  it('drops a display group the member can no longer claim', async () => {
    const members = await group('members')
    const paid = await group('supporters', { pluginGrantable: true })
    const uid = await user('Alice', members)
    const grants = pluginGrants(h.db, 'dues')

    await grants.grant({
      userId: uid,
      groupKey: 'supporters',
      until: inHours(24),
      reason: 'order 42 paid',
      primary: true,
    })
    await h.db.update(users).set({ displayGroupId: paid }).where(eq(users.id, uid))

    await grants.revoke({ userId: uid, groupKey: 'supporters', reason: 'refunded' })

    const [row] = await h.db
      .select({ displayGroupId: users.displayGroupId })
      .from(users)
      .where(eq(users.id, uid))
    expect(row!.displayGroupId).toBeNull()
  })
})

describe('expireTimedGroupMemberships', () => {
  it('deletes only lapsed rows, bumps once, and is idempotent', async () => {
    const members = await group('members')
    const paid = await group('supporters', { pluginGrantable: true })
    const alice = await user('Alice', members)
    const bob = await user('Bob', members)

    await h.db.insert(userGroupMemberships).values([
      { userId: alice, groupId: paid, expiresAt: new Date(Date.now() - 1000) },
      { userId: bob, groupId: paid, expiresAt: inHours(24) },
    ])

    const before = await permissionVersion()
    expect(await expireTimedGroupMemberships(h.db, 100)).toBe(1)
    expect(await permissionVersion()).toBeGreaterThan(before)

    const versionAfter = await permissionVersion()
    expect(await expireTimedGroupMemberships(h.db, 100)).toBe(0)
    expect(await permissionVersion()).toBe(versionAfter)

    const rows = await h.db.select().from(userGroupMemberships)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(bob)
  })

  it('respects the batch limit', async () => {
    const members = await group('members')
    const paid = await group('supporters')
    const alice = await user('Alice', members)
    const bob = await user('Bob', members)

    await h.db.insert(userGroupMemberships).values([
      { userId: alice, groupId: paid, expiresAt: new Date(Date.now() - 1000) },
      { userId: bob, groupId: paid, expiresAt: new Date(Date.now() - 1000) },
    ])

    expect(await expireTimedGroupMemberships(h.db, 1)).toBe(1)
    expect(await expireTimedGroupMemberships(h.db, 1)).toBe(1)
    expect(await expireTimedGroupMemberships(h.db, 1)).toBe(0)
  })
})

describe('permissionsCarryPower', () => {
  it('is true for any moderation or administrative field, false otherwise', () => {
    expect(permissionsCarryPower({ isAdministrator: true })).toBe(true)
    expect(permissionsCarryPower({ canWarnUsers: true })).toBe(true)
    expect(permissionsCarryPower({ canView: true, canUploadAttachments: true } as never)).toBe(
      false,
    )
    expect(permissionsCarryPower({})).toBe(false)
  })
})
