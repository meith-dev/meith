/**
 * Actor construction, against a real (in-memory) Postgres. These prove the
 * things pure unit tests cannot: that a user's primary + secondary groups are
 * actually OR/max-combined (R4.2) after a real join, that DB lifecycle states
 * map correctly, and that the permission_version cache key is read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ActorBuilder } from './actor-builder'
import { createTestDb, type TestDb } from './pglite.fixture'
import { cacheVersions, usergroups, userGroupMemberships, users } from './schema'

let h: TestDb

beforeEach(async () => {
  h = await createTestDb()
})
afterEach(async () => {
  await h.close()
})

/** Insert a group and return its id. Permission flags default off unless set. */
async function group(
  key: string,
  perms: Record<string, unknown> = {},
): Promise<number> {
  const [row] = await h.db
    .insert(usergroups)
    .values({ key, title: key, ...perms })
    .returning({ id: usergroups.id })
  return row!.id
}

async function user(
  username: string,
  primaryGroupId: number,
  state = 'active',
): Promise<number> {
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
    // Primary can view but not post; secondary can post and is an admin.
    const members = await group('members', {
      canView: true,
      canPostThreads: false,
    })
    const staff = await group('staff', {
      canPostThreads: true,
      isAdministrator: true,
    })
    const uid = await user('Alice', members)
    await h.db
      .insert(userGroupMemberships)
      .values({ userId: uid, groupId: staff })

    const builder = new ActorBuilder(h.db, { guestGroupId: members })
    const actor = await builder.buildForUser(uid)

    expect(actor).not.toBeNull()
    expect(new Set(actor!.groupIds)).toEqual(new Set([members, staff]))
    expect(actor!.primaryGroupId).toBe(members)
    // true from either group wins.
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
    // Both DB "awaiting" states collapse to the authorizer's single one.
    expect((await builder.buildForUser(emailWait))!.state).toBe('awaiting_activation')
    expect((await builder.buildForUser(adminWait))!.state).toBe('awaiting_activation')
  })

  it('returns null for a deleted user (not a principal) and for a missing id', async () => {
    const builder = new ActorBuilder(h.db, { guestGroupId: members })
    const deleted = await user('Ghost', members, 'deleted')
    expect(await builder.buildForUser(deleted)).toBeNull()
    expect(await builder.buildForUser(999_999)).toBeNull()
  })
})

describe('ActorBuilder — permission version', () => {
  it('reads cache_versions[permissions], defaulting to 1 when unset', async () => {
    const g = await group('guests', { canView: true })
    const builder = new ActorBuilder(h.db, { guestGroupId: g })

    expect((await builder.buildGuest()).permissionVersion).toBe(1)

    await h.db
      .insert(cacheVersions)
      .values({ key: 'permissions', version: 7 })
    expect((await builder.buildGuest()).permissionVersion).toBe(7)
  })
})
