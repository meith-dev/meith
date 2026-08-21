import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ActorBuilder } from './actor-builder'
import { createTestDb, type TestDb } from './pglite.fixture'
import { cacheVersions, userGroupMemberships, usergroups, users } from './schema'

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

async function group(key: string, perms: Record<string, unknown> = {}): Promise<number> {
  const [row] = await h.db
    .insert(usergroups)
    .values({ key, title: key, ...perms })
    .returning({ id: usergroups.id })
  return row!.id
}

async function user(username: string, primaryGroupId: number, state = 'active'): Promise<number> {
  const lower = username.toLowerCase()
  const [row] = await h.db
    .insert(users)
    .values({
      username,
      usernameLower: lower,
      email: `${lower}@example.com`,
      emailLower: `${lower}@example.com`,
      state,
      primaryGroupId,
    })
    .returning({ id: users.id })
  return row!.id
}

describe('ActorBuilder.buildGuest', () => {
  it('resolves the guest group, no user id, guest state', async () => {
    const guestId = await group('guests', { canView: true, canSearch: true })
    const builder = new ActorBuilder(h.db, { guestGroupId: guestId })

    const actor = await builder.buildGuest()
    expect(actor.userId).toBeNull()
    expect(actor.groupIds).toEqual([guestId])
    expect(actor.state).toBe('guest')
    expect(actor.global.canView).toBe(true)
    expect(actor.global.canSearch).toBe(true)
  })
})

describe('ActorBuilder.buildForUser — group combination (R4.2)', () => {
  it('OR-combines booleans across primary and secondary groups', async () => {
    const members = await group('members', {
      canView: true,
      canPostThreads: false,
    })
    const staff = await group('staff', {
      canPostThreads: true,
      isAdministrator: true,
    })
    const uid = await user('Alice', members)
    await h.db.insert(userGroupMemberships).values({ userId: uid, groupId: staff })

    const builder = new ActorBuilder(h.db, { guestGroupId: members })
    const actor = await builder.buildForUser(uid)

    expect(actor).not.toBeNull()
    expect(new Set(actor!.groupIds)).toEqual(new Set([members, staff]))
    expect(actor!.primaryGroupId).toBe(members)
    expect(actor!.global.canView).toBe(true)
    expect(actor!.global.canPostThreads).toBe(true)
    expect(actor!.global.isAdministrator).toBe(true)
  })

  it('does not duplicate a group that is both primary and secondary', async () => {
    const g = await group('members', { canView: true })
    const uid = await user('Bob', g)
    await h.db.insert(userGroupMemberships).values({ userId: uid, groupId: g })

    const builder = new ActorBuilder(h.db, { guestGroupId: g })
    const actor = await builder.buildForUser(uid)
    expect(actor!.groupIds).toEqual([g])
  })
})

describe('ActorBuilder.buildForUser — timed memberships', () => {
  it('sees a membership with no expiry and one expiring in the future', async () => {
    const members = await group('members', { canView: true })
    const paid = await group('supporters', { canUploadAttachments: true })
    const uid = await user('Carol', members)

    await h.db.insert(userGroupMemberships).values({ userId: uid, groupId: paid })
    const withPermanent = await new ActorBuilder(h.db, { guestGroupId: members }).buildForUser(uid)
    expect(new Set(withPermanent!.groupIds)).toEqual(new Set([members, paid]))

    await h.db.delete(userGroupMemberships)
    await h.db.insert(userGroupMemberships).values({
      userId: uid,
      groupId: paid,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const withTimed = await new ActorBuilder(h.db, { guestGroupId: members }).buildForUser(uid)
    expect(new Set(withTimed!.groupIds)).toEqual(new Set([members, paid]))
    expect(withTimed!.global.canUploadAttachments).toBe(true)
  })

  it('does not see a lapsed membership, even before any sweep runs', async () => {
    const members = await group('members', { canView: true })
    const paid = await group('supporters', { canUploadAttachments: true })
    const uid = await user('Dan', members)

    await h.db.insert(userGroupMemberships).values({
      userId: uid,
      groupId: paid,
      expiresAt: new Date(Date.now() - 1),
    })

    const actor = await new ActorBuilder(h.db, { guestGroupId: members }).buildForUser(uid)
    expect(actor!.groupIds).toEqual([members])
    expect(actor!.global.canUploadAttachments).toBe(false)
  })
})

describe('ActorBuilder.buildForUser — lifecycle state', () => {
  let members: number
  beforeEach(async () => {
    members = await group('members', { canView: true })
  })

  it('maps active, banned, and both awaiting_* states', async () => {
    const builder = new ActorBuilder(h.db, { guestGroupId: members })

    const active = await user('Active', members, 'active')
    const banned = await user('Banned', members, 'banned')
    const emailWait = await user('EmailWait', members, 'awaiting_activation')
    const adminWait = await user('AdminWait', members, 'awaiting_approval')

    expect((await builder.buildForUser(active))!.state).toBe('active')
    expect((await builder.buildForUser(banned))!.state).toBe('banned')
    expect((await builder.buildForUser(emailWait))!.state).toBe('awaiting_activation')
    expect((await builder.buildForUser(adminWait))!.state).toBe('awaiting_activation')
  })

  it('returns null for a deleted state, tombstoned row, and missing id', async () => {
    const builder = new ActorBuilder(h.db, { guestGroupId: members })
    const deleted = await user('Ghost', members, 'deleted')
    const tombstoned = await user('Closed', members)
    await h.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, tombstoned))

    expect(await builder.buildForUser(deleted)).toBeNull()
    expect(await builder.buildForUser(tombstoned)).toBeNull()
    expect(await builder.buildForUser(999_999)).toBeNull()
  })
})

describe('ActorBuilder — permission version', () => {
  it('reads cache_versions[permissions], defaulting to 1 when unset', async () => {
    const g = await group('guests', { canView: true })
    const builder = new ActorBuilder(h.db, { guestGroupId: g })

    expect((await builder.buildGuest()).permissionVersion).toBe(1)

    await h.db.insert(cacheVersions).values({ key: 'permissions', version: 7 })
    expect((await builder.buildGuest()).permissionVersion).toBe(7)
  })
})
