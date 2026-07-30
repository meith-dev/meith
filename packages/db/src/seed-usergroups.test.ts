/**
 * F15 — the seeded group ladder, asserted against a real migrated database.
 *
 * This exists because the ladder is data, and data in a migration has no
 * compiler behind it: a mistyped column name, a permission granted to the wrong
 * group, or an id that drifts from `seed-board.ts` would all apply cleanly and
 * be wrong. Every claim the seed makes about *security* is pinned here.
 */
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { groupRowToPermissionSet } from './permissions-map'
import { createTestDb, type TestDb } from './pglite.fixture'
import { usergroups } from './schema'

let harness: TestDb
let db: Database

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
})
afterAll(async () => {
  await harness.close()
})

/**
 * Read a group and resolve its permissions the way production does.
 *
 * The permission columns are generated from the registry into a
 * `Record<string, ...>`, so drizzle's inferred row type does not carry them —
 * `permissions-map.ts` exists precisely to turn a loose row into a validated
 * `PermissionSet`. Asserting through that mapper rather than around it means
 * this test covers the same path the authorizer uses, including the coercion
 * that turns a Postgres numeric string into a number.
 */
async function byKey(key: string) {
  const rows = await db.select().from(usergroups).where(eq(usergroups.key, key)).limit(1)
  const row = rows[0]
  if (!row) return undefined
  return {
    id: row.id,
    isSystem: row.isSystem,
    ...groupRowToPermissionSet(row as Record<string, unknown>),
  }
}

describe('seeded usergroups', () => {
  it('creates the seven groups F15 names', async () => {
    const rows = await db.select({ key: usergroups.key }).from(usergroups).orderBy(asc(usergroups.id))
    expect(rows.map((r) => r.key)).toEqual([
      'guests',
      'registered',
      'administrators',
      'super_moderators',
      'moderators',
      'awaiting_activation',
      'banned',
    ])
  })

  /*
   * ActorBuilder is constructed with `guestGroupId: 1` and AUTH_CONFIG's
   * defaultMemberGroupId is the registered group, both matching the in-memory
   * seed board. If these ids drift, a fixture actor and a Postgres actor stop
   * resolving to the same permissions and every parity assumption breaks.
   */
  it('pins the ids the code depends on', async () => {
    expect((await byKey('guests'))?.id).toBe(1)
    expect((await byKey('registered'))?.id).toBe(2)
    expect((await byKey('administrators'))?.id).toBe(3)
    expect((await byKey('super_moderators'))?.id).toBe(4)
  })

  it('marks every seeded group as a system group', async () => {
    const rows = await db.select({ isSystem: usergroups.isSystem }).from(usergroups)
    // A system group cannot be deleted, because code references it by key.
    expect(rows.every((r) => r.isSystem)).toBe(true)
  })

  it('lets guests read but not write', async () => {
    const guests = await byKey('guests')
    expect(guests?.canView).toBe(true)
    expect(guests?.canViewThreads).toBe(true)
    expect(guests?.canSearch).toBe(true)

    expect(guests?.canPostThreads).toBe(false)
    expect(guests?.canPostReplies).toBe(false)
    expect(guests?.canUploadAttachments).toBe(false)
    expect(guests?.canUsePrivateMessages).toBe(false)
  })

  it('lets registered members post without queuing for approval', async () => {
    const registered = await byKey('registered')
    expect(registered?.canPostThreads).toBe(true)
    expect(registered?.canPostReplies).toBe(true)

    // Negative-sense flags: true would mean every post needs a moderator.
    expect(registered?.requiresThreadApproval).toBe(false)
    expect(registered?.requiresPostApproval).toBe(false)
  })

  it('gives registered members no moderation or staff powers', async () => {
    const registered = await byKey('registered')
    expect(registered?.canEditOthersPosts).toBe(false)
    expect(registered?.canApproveContent).toBe(false)
    expect(registered?.canViewUnapproved).toBe(false)
    expect(registered?.canAccessModCp).toBe(false)
    expect(registered?.isSuperModerator).toBe(false)
    expect(registered?.isAdministrator).toBe(false)
    expect(registered?.canAccessAdminCp).toBe(false)
  })

  it('gives only administrators the ACP', async () => {
    expect((await byKey('administrators'))?.canAccessAdminCp).toBe(true)
    expect((await byKey('administrators'))?.isAdministrator).toBe(true)

    // R4.2: super moderators bypass forum permissions but NOT admin-only
    // actions. An ACP that a super moderator can reach is a privilege bug.
    expect((await byKey('super_moderators'))?.canAccessAdminCp).toBe(false)
    expect((await byKey('super_moderators'))?.isAdministrator).toBe(false)
    expect((await byKey('super_moderators'))?.isSuperModerator).toBe(true)
  })

  it('gives moderators the moderation verbs but no bypass', async () => {
    const mods = await byKey('moderators')
    expect(mods?.canApproveContent).toBe(true)
    expect(mods?.canViewUnapproved).toBe(true)
    expect(mods?.canAccessModCp).toBe(true)

    // Which forums they may act in is decided by forum_moderators, not a bypass.
    expect(mods?.isSuperModerator).toBe(false)
    expect(mods?.isAdministrator).toBe(false)
  })

  it('denies the banned group everything', async () => {
    const banned = await byKey('banned')
    expect(banned?.canView).toBe(false)
    expect(banned?.canViewThreads).toBe(false)
    expect(banned?.canPostReplies).toBe(false)
    expect(banned?.canUsePrivateMessages).toBe(false)
    expect(banned?.canAccessModCp).toBe(false)
    expect(banned?.isAdministrator).toBe(false)
  })

  it('keeps awaiting-activation read-only and still moderated', async () => {
    const pending = await byKey('awaiting_activation')
    expect(pending?.canView).toBe(true)
    expect(pending?.canPostThreads).toBe(false)
    // If an admin later grants posting, it must still queue for approval.
    expect(pending?.requiresPostApproval).toBe(true)
  })

  /*
   * Explicit ids do not advance the identity sequence. Without the setval in the
   * migration, the first group an administrator creates collides on id 1.
   */
  it('leaves the identity sequence past the seeded ids', async () => {
    const [created] = await db
      .insert(usergroups)
      .values({ key: 'custom-vip', title: 'VIP' })
      .returning({ id: usergroups.id })

    expect(created?.id).toBeGreaterThan(7)
    await db.delete(usergroups).where(eq(usergroups.key, 'custom-vip'))
  })
})
