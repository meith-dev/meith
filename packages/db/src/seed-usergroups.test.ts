import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from './client'
import { groupRowToPermissionSet } from './permissions-map'
import { createTestDb, type TestDb } from './pglite.fixture'
import { SEED_GROUP_KEY } from './seed-groups'
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
  it('creates the seven groups SEED_GROUP_KEY names', async () => {
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

  it('seeds exactly the keys SEED_GROUP_KEY names', async () => {
    const rows = await db.select({ key: usergroups.key }).from(usergroups)
    const seeded = new Set(rows.map((r) => r.key))

    for (const key of Object.values(SEED_GROUP_KEY)) {
      expect(seeded.has(key), `SEED_GROUP_KEY names "${key}", which no migration seeds`).toBe(true)
    }
    expect(seeded.size).toBe(Object.values(SEED_GROUP_KEY).length)
  })

  it('carries the two groups the installer promotes between', async () => {
    expect((await byKey(SEED_GROUP_KEY.registered))?.id).toBe(2)
    expect((await byKey(SEED_GROUP_KEY.administrators))?.isAdministrator).toBe(true)
  })

  it('pins the ids the code depends on', async () => {
    expect((await byKey('guests'))?.id).toBe(1)
    expect((await byKey('registered'))?.id).toBe(2)
    expect((await byKey('administrators'))?.id).toBe(3)
    expect((await byKey('super_moderators'))?.id).toBe(4)
  })

  it('marks every seeded group as a system group', async () => {
    const rows = await db.select({ isSystem: usergroups.isSystem }).from(usergroups)
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

    expect((await byKey('super_moderators'))?.canAccessAdminCp).toBe(false)
    expect((await byKey('super_moderators'))?.isAdministrator).toBe(false)
    expect((await byKey('super_moderators'))?.isSuperModerator).toBe(true)
  })

  it('gives moderators the moderation verbs but no bypass', async () => {
    const mods = await byKey('moderators')
    expect(mods?.canApproveContent).toBe(true)
    expect(mods?.canViewUnapproved).toBe(true)
    expect(mods?.canAccessModCp).toBe(true)

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
    expect(pending?.requiresPostApproval).toBe(true)
  })

  it('leaves the identity sequence past the seeded ids', async () => {
    const [created] = await db
      .insert(usergroups)
      .values({ key: 'custom-vip', title: 'VIP' })
      .returning({ id: usergroups.id })

    expect(created?.id).toBeGreaterThan(7)
    await db.delete(usergroups).where(eq(usergroups.key, 'custom-vip'))
  })
})
