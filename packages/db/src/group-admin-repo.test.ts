import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { FORUM_PERMISSION_FIELDS, PERMISSION_FIELDS } from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresGroupAdminRepository } from './group-admin-repo'
import { columnName } from './schema/permission-columns'
import { PLUGIN_UNGRANTABLE_PERMISSIONS } from './staff-groups'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresGroupAdminRepository

const GUESTS = 1
const REGISTERED = 2
const ADMINS = 3

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresGroupAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from users`)
  await db.execute(sql`delete from usergroups where is_system = false`)
  await db.execute(sql`update cache_versions set version = 1 where key = 'permissions'`)
})

async function permissionVersion(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select version from cache_versions where key = 'permissions'`),
  ) as Array<{ version: number }>
  return Number(rows[0]?.version ?? 0)
}

async function displayGroupOf(userId: number): Promise<number | null> {
  const rows = resultRows(
    await db.execute(sql`select display_group_id from users where id = ${userId}`),
  ) as Array<{ display_group_id: number | null }>
  const value = rows[0]?.display_group_id
  return value === null || value === undefined ? null : Number(value)
}

async function setDisplayGroup(userId: number, groupId: number | null): Promise<void> {
  await db.execute(sql`update users set display_group_id = ${groupId} where id = ${userId}`)
}

async function seedMembers(count: number, groupId: number): Promise<void> {
  for (let i = 1; i <= count; i += 1) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (${i}, ${`u${i}`}, ${`u${i}`}, ${`u${i}@example.test`},
              ${`u${i}@example.test`}, 'x', 'argon2id', ${groupId})
    `)
  }
}

describe('list', () => {
  it('returns the seeded ladder in display order, with member counts', async () => {
    await seedMembers(3, REGISTERED)

    const groups = await repo.list()
    expect(groups.length).toBeGreaterThanOrEqual(4)
    expect(groups.map((group) => group.displayOrder)).toEqual(
      [...groups.map((group) => group.displayOrder)].sort((a, b) => a - b),
    )
    expect(groups.find((group) => group.id === REGISTERED)?.memberCount).toBe(3)
    expect(groups.find((group) => group.id === GUESTS)?.memberCount).toBe(0)
  })

  it('marks the groups the board resolves by key as system groups', async () => {
    const groups = await repo.list()
    expect(groups.find((group) => group.id === REGISTERED)?.isSystem).toBe(true)
  })
})

describe('readPermissions', () => {
  it('returns a complete set, coerced, for a real group', async () => {
    const permissions = await repo.readPermissions(REGISTERED)

    expect(permissions?.canPostThreads).toBe(true)
    expect(typeof permissions?.maxPostsPerDay).toBe('number')
  })

  it('is null for a group that does not exist', async () => {
    expect(await repo.readPermissions(9_999)).toBeNull()
  })
})

describe('the columns behind the group form', () => {
  async function columnsOf(table: string): Promise<string[]> {
    return (
      resultRows(
        await db.execute(sql`
          select column_name from information_schema.columns
           where table_name = ${table}
        `),
      ) as Array<{ column_name: string }>
    ).map((row) => row.column_name)
  }

  it('carries a column for every declared permission, and none besides', async () => {
    const groupColumns = await columnsOf('usergroups')
    for (const field of PERMISSION_FIELDS) {
      expect(groupColumns).toContain(columnName(field.key))
    }

    const declared = new Set(FORUM_PERMISSION_FIELDS.map((f) => columnName(f.key)))
    const structural = new Set(['forum_id', 'group_id', 'updated_at'])
    const matrixColumns = (await columnsOf('forum_permissions')).filter(
      (name) => !structural.has(name),
    )

    expect(matrixColumns.sort()).toEqual([...declared].sort())
  })

  it('does not offer canDeleteOthersPosts, which nothing could carry out', async () => {
    expect(PERMISSION_FIELDS.map((field) => field.key)).not.toContain(
      'canDeleteOthersPosts',
    )
    expect(PLUGIN_UNGRANTABLE_PERMISSIONS).not.toContain('canDeleteOthersPosts')
    expect(await columnsOf('usergroups')).not.toContain('can_delete_others_posts')
    expect(await columnsOf('forum_permissions')).not.toContain(
      'can_delete_others_posts',
    )
  })
})

describe('savePermissions', () => {
  it('writes every field, so an omitted one is a default rather than a leftover', async () => {
    await repo.savePermissions(REGISTERED, { canPostThreads: false })

    const after = await repo.readPermissions(REGISTERED)
    expect(after?.canPostThreads).toBe(false)
    expect(after?.canView).toBe(false)
  })

  it('bumps the permission version', async () => {
    const before = await permissionVersion()
    await repo.savePermissions(REGISTERED, { canPostThreads: false })

    expect(await permissionVersion()).toBe(before + 1)
  })
})

describe('updateIdentity', () => {
  it('renames without touching permissions, and still bumps', async () => {
    const before = await permissionVersion()
    const permissionsBefore = await repo.readPermissions(REGISTERED)

    await repo.updateIdentity(REGISTERED, {
      title: 'Members',
      description: 'Renamed',
      displayOrder: 5,
      isStaffGroup: false,
      pluginGrantable: false,
      badgeToken: 'badge-member',
      nameColorLight: 'oklch(0.49 0.13 250)',
      nameColorDark: 'oklch(0.69 0.12 250)',
    })

    const group = (await repo.list()).find((row) => row.id === REGISTERED)
    expect(group).toMatchObject({
      title: 'Members',
      displayOrder: 5,
      badgeToken: 'badge-member',
      nameColorLight: 'oklch(0.49 0.13 250)',
      nameColorDark: 'oklch(0.69 0.12 250)',
    })
    expect(await repo.readPermissions(REGISTERED)).toEqual(permissionsBefore)
    expect(await permissionVersion()).toBe(before + 1)
  })
})

describe('create', () => {
  it('copies another group’s permissions rather than starting from deny', async () => {
    const id = await repo.create({
      key: 'veterans',
      title: 'Veterans',
      copyFromGroupId: REGISTERED,
    })

    const copied = await repo.readPermissions(id)
    const source = await repo.readPermissions(REGISTERED)
    expect(copied?.canPostThreads).toBe(source?.canPostThreads)
    expect(copied?.canView).toBe(source?.canView)
  })

  it('is not a system group, so it can be deleted again', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    expect((await repo.list()).find((row) => row.id === id)?.isSystem).toBe(false)
  })

  it('refuses a duplicate key at the database', async () => {
    await expect(
      repo.create({ key: 'registered', title: 'Clash', copyFromGroupId: REGISTERED }),
    ).rejects.toThrow()
  })

  it('refuses to copy from a group that does not exist', async () => {
    await expect(
      repo.create({ key: 'veterans', title: 'V', copyFromGroupId: 9_999 }),
    ).rejects.toThrow(/no group to copy from/)
  })
})

describe('remove', () => {
  it('moves the members and then deletes the group', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await seedMembers(2, id)

    await repo.remove(id, REGISTERED)

    const groups = await repo.list()
    expect(groups.find((group) => group.id === id)).toBeUndefined()
    expect(groups.find((group) => group.id === REGISTERED)?.memberCount).toBe(2)
  })

  it('refuses a system group', async () => {
    await expect(repo.remove(REGISTERED, ADMINS)).rejects.toThrow(/how the board works/)
    expect((await repo.list()).find((group) => group.id === REGISTERED)).toBeDefined()
  })

  it('refuses to move members into the group being deleted', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await expect(repo.remove(id, id)).rejects.toThrow(/being deleted/)
  })

  it('refuses a group that does not exist', async () => {
    await expect(repo.remove(9_999, REGISTERED)).rejects.toThrow(/No such group/)
  })

  it('leaves the version alone when the write was refused', async () => {
    const before = await permissionVersion()
    await expect(repo.remove(REGISTERED, ADMINS)).rejects.toThrow()

    expect(await permissionVersion()).toBe(before)
  })

  it('keeps a display group the member chose for themselves', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await seedMembers(1, id)
    await db.execute(sql`insert into user_group_memberships (user_id, group_id) values (1, ${ADMINS})`)
    await setDisplayGroup(1, ADMINS)

    await repo.remove(id, REGISTERED)

    expect(await displayGroupOf(1)).toBe(ADMINS)
  })

  it('clears a display group that pointed at the group being deleted', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await seedMembers(1, id)
    await setDisplayGroup(1, id)

    await repo.remove(id, REGISTERED)

    expect(await displayGroupOf(1)).toBeNull()
  })

  it('stores nothing for a member who was displaying the group they land in', async () => {
    const id = await repo.create({ key: 'veterans', title: 'V', copyFromGroupId: REGISTERED })
    await seedMembers(1, id)
    await db.execute(
      sql`insert into user_group_memberships (user_id, group_id) values (1, ${REGISTERED})`,
    )
    await setDisplayGroup(1, REGISTERED)

    await repo.remove(id, REGISTERED)

    expect(await displayGroupOf(1)).toBeNull()
  })
})

describe('moveMembersChunk', () => {
  it('moves at most one chunk and reports where to continue', async () => {
    await seedMembers(5, REGISTERED)

    const first = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 2,
    })

    expect(first.moved).toBe(2)
    expect(first.nextCursor).toBe(2)
    expect((await repo.list()).find((g) => g.id === ADMINS)?.memberCount).toBe(2)
  })

  it('resumes from the cursor and finishes with a null one', async () => {
    await seedMembers(5, REGISTERED)

    let cursor: number | null = 0
    let total = 0
    while (cursor !== null) {
      const chunk: Awaited<ReturnType<typeof repo.moveMembersChunk>> =
        await repo.moveMembersChunk({
          fromGroupId: REGISTERED,
          toGroupId: ADMINS,
          afterUserId: cursor,
          limit: 2,
        })
      total += chunk.moved
      cursor = chunk.nextCursor
    }

    expect(total).toBe(5)
    expect((await repo.list()).find((g) => g.id === REGISTERED)?.memberCount).toBe(0)
  })

  it('reports a null cursor when the chunk came back short', async () => {
    await seedMembers(3, REGISTERED)

    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(chunk).toEqual({ moved: 3, nextCursor: null })
  })

  it('starts after the cursor rather than at the beginning of the group', async () => {
    await seedMembers(5, REGISTERED)

    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 3,
      limit: 10,
    })

    expect(chunk.moved).toBe(2)
    expect((await repo.list()).find((g) => g.id === REGISTERED)?.memberCount).toBe(3)
  })

  it('keeps a display group the member chose for themselves', async () => {
    await seedMembers(2, REGISTERED)
    await db.execute(sql`insert into user_group_memberships (user_id, group_id) values (1, ${GUESTS})`)
    await setDisplayGroup(1, GUESTS)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(await displayGroupOf(1)).toBe(GUESTS)
    expect(await displayGroupOf(2)).toBeNull()
  })

  it('clears a display group pointing at the group being moved out of', async () => {
    await seedMembers(1, REGISTERED)
    await setDisplayGroup(1, REGISTERED)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(await displayGroupOf(1)).toBeNull()
  })

  it('moves nobody when the source group is empty', async () => {
    const chunk = await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect(chunk).toEqual({ moved: 0, nextCursor: null })
  })

  it('touches only the source group', async () => {
    await seedMembers(2, REGISTERED)
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id)
      values (99, 'other', 'other', 'o@example.test', 'o@example.test', 'x', 'argon2id', ${GUESTS})
    `)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 10,
    })

    expect((await repo.list()).find((g) => g.id === GUESTS)?.memberCount).toBe(1)
  })

  it('refuses a move into the same group', async () => {
    await expect(
      repo.moveMembersChunk({
        fromGroupId: REGISTERED,
        toGroupId: REGISTERED,
        afterUserId: 0,
        limit: 10,
      }),
    ).rejects.toThrow(/two different groups/)
  })

  it('bumps the version on every chunk, not only the last', async () => {
    await seedMembers(4, REGISTERED)
    const before = await permissionVersion()

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 0,
      limit: 2,
    })
    expect(await permissionVersion()).toBe(before + 1)

    await repo.moveMembersChunk({
      fromGroupId: REGISTERED,
      toGroupId: ADMINS,
      afterUserId: 2,
      limit: 2,
    })
    expect(await permissionVersion()).toBe(before + 2)
  })
})

describe('setBadge', () => {
  it('returns the key it replaced, not the one it just wrote', async () => {
    expect(await repo.setBadge(REGISTERED, 'light', 'group/2/badge-light-a.png')).toBeNull()

    const previous = await repo.setBadge(REGISTERED, 'light', 'group/2/badge-light-b.png')
    expect(previous).toBe('group/2/badge-light-a.png')

    const group = (await repo.list()).find((row) => row.id === REGISTERED)
    expect(group?.badgeImageLight).toBe('group/2/badge-light-b.png')
  })

  it('keeps the two schemes apart', async () => {
    await repo.setBadge(REGISTERED, 'light', 'group/2/badge-light-a.png')
    await repo.setBadge(REGISTERED, 'dark', 'group/2/badge-dark-a.png')

    const group = (await repo.list()).find((row) => row.id === REGISTERED)
    expect(group?.badgeImageLight).toBe('group/2/badge-light-a.png')
    expect(group?.badgeImageDark).toBe('group/2/badge-dark-a.png')
  })

  it('clears back to no badge, handing back what it dropped', async () => {
    await repo.setBadge(REGISTERED, 'light', 'group/2/badge-light-a.png')

    expect(await repo.setBadge(REGISTERED, 'light', null)).toBe('group/2/badge-light-a.png')
    expect((await repo.list()).find((row) => row.id === REGISTERED)?.badgeImageLight).toBeNull()
  })

  it('does not bump the permission version', async () => {
    const before = await permissionVersion()
    await repo.setBadge(REGISTERED, 'light', 'group/2/badge-light-a.png')
    expect(await permissionVersion()).toBe(before)
  })
})
