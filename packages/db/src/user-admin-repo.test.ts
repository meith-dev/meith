import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresUserAdminRepository, likeFragment } from './user-admin-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresUserAdminRepository

const REGISTERED = 2
const ADMINS = 3

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresUserAdminRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from users`)
  await db.execute(sql`update cache_versions set version = 1 where key = 'permissions'`)
})

interface SeedUser {
  readonly id: number
  readonly username: string
  readonly email?: string
  readonly groupId?: number
  readonly state?: string
  readonly postCount?: number
  readonly registrationIp?: string | null
  readonly lastIp?: string | null
  readonly createdAt?: Date
  readonly deletedAt?: Date | null
}

async function seed(user: SeedUser): Promise<void> {
  const email = user.email ?? `${user.username}@example.test`
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id, state,
                       post_count, registration_ip_prefix, last_ip_prefix,
                       created_at, deleted_at)
    values (${user.id}, ${user.username}, ${user.username.toLowerCase()},
            ${email}, ${email.toLowerCase()}, 'x', 'argon2id',
            ${user.groupId ?? REGISTERED}, ${user.state ?? 'active'},
            ${user.postCount ?? 0},
            ${user.registrationIp ?? null}, ${user.lastIp ?? null},
            ${user.createdAt ?? new Date('2026-01-01T00:00:00Z')},
            ${user.deletedAt ?? null})
  `)
}

const ALL = { afterUserId: 0, limit: 50 } as const

async function permissionVersion(): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select version from cache_versions where key = 'permissions'`),
  ) as Array<{ version: number }>
  return Number(rows[0]?.version ?? 0)
}

describe('likeFragment', () => {
  it('escapes every character `like` treats as special', () => {
    expect(likeFragment('100%')).toBe('100\\%')
    expect(likeFragment('a_c')).toBe('a\\_c')
    expect(likeFragment('back\\slash')).toBe('back\\\\slash')
    expect(likeFragment('plain')).toBe('plain')
  })
})

describe('search', () => {
  it('returns everybody when nothing is filtered', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 2, username: 'bob' })

    const page = await repo.search(ALL)
    expect(page.rows.map((row) => row.username)).toEqual(['ann', 'bob'])
    expect(page.nextCursor).toBeNull()
  })

  it('matches a username case-insensitively, anywhere in the name', async () => {
    await seed({ id: 1, username: 'Annabel' })
    await seed({ id: 2, username: 'bob' })

    const page = await repo.search({ ...ALL, username: 'NNA' })
    expect(page.rows.map((row) => row.id)).toEqual([1])
  })

  it('treats a wildcard in the term as a literal', async () => {
    await seed({ id: 1, username: '100%' })
    await seed({ id: 2, username: 'bob' })
    await seed({ id: 3, username: 'carol' })

    expect((await repo.search({ ...ALL, username: '100%' })).rows.map((r) => r.id)).toEqual([1])
    expect((await repo.search({ ...ALL, username: '%' })).rows.map((r) => r.id)).toEqual([1])
  })

  it('treats an underscore in the term as a literal too', async () => {
    await seed({ id: 1, username: 'a_c' })
    await seed({ id: 2, username: 'abc' })

    expect((await repo.search({ ...ALL, username: 'a_c' })).rows.map((r) => r.id)).toEqual([1])
  })

  it('matches an email fragment', async () => {
    await seed({ id: 1, username: 'ann', email: 'ann@school.test' })
    await seed({ id: 2, username: 'bob', email: 'bob@work.test' })

    expect((await repo.search({ ...ALL, email: 'SCHOOL' })).rows.map((r) => r.id)).toEqual([1])
  })

  it('matches an IP prefix against either column, as a starts-with', async () => {
    await seed({ id: 1, username: 'ann', registrationIp: '203.0.113.0', lastIp: null })
    await seed({ id: 2, username: 'bob', registrationIp: null, lastIp: '203.0.113.0' })
    await seed({ id: 3, username: 'carol', registrationIp: '198.51.100.0', lastIp: null })

    const page = await repo.search({ ...ALL, ipPrefix: '203.0.113.' })
    expect(page.rows.map((row) => row.id)).toEqual([1, 2])
  })

  it('anchors the IP search at the start, so a fragment cannot match mid-address', async () => {
    await seed({ id: 1, username: 'ann', lastIp: '198.51.100.0' })
    await seed({ id: 2, username: 'elsewhere', lastIp: '10.198.51.0' })

    expect((await repo.search({ ...ALL, ipPrefix: '198.51' })).rows.map((r) => r.id))
      .toEqual([1])
  })

  it('filters by group, by state and by post count', async () => {
    await seed({ id: 1, username: 'ann', groupId: ADMINS, postCount: 100 })
    await seed({ id: 2, username: 'bob', state: 'awaiting_activation' })
    await seed({ id: 3, username: 'carol', postCount: 5 })

    expect((await repo.search({ ...ALL, primaryGroupId: ADMINS })).rows.map((r) => r.id))
      .toEqual([1])
    expect((await repo.search({ ...ALL, state: 'awaiting_activation' })).rows.map((r) => r.id))
      .toEqual([2])
    expect((await repo.search({ ...ALL, minPostCount: 10 })).rows.map((r) => r.id)).toEqual([1])
    expect((await repo.search({ ...ALL, maxPostCount: 5 })).rows.map((r) => r.id))
      .toEqual([2, 3])
  })

  it('finds a member banned the way the board bans them, and marks the row', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 2, username: 'bob' })
    await db.execute(sql`insert into bans (user_id, created_at) values (2, now())`)

    const banned = await repo.search({ ...ALL, state: 'banned' })
    expect(banned.rows.map((r) => r.id)).toEqual([2])
    expect(banned.rows[0]?.isBanned).toBe(true)

    expect((await repo.search({ ...ALL, state: 'active' })).rows.map((r) => r.id)).toEqual([1])
    expect((await repo.readDetail(2))?.isBanned).toBe(true)
    expect((await repo.readDetail(1))?.isBanned).toBe(false)
  })

  it('stops reporting a ban once it has been lifted', async () => {
    await seed({ id: 1, username: 'ann' })
    await db.execute(
      sql`insert into bans (user_id, created_at, lifted_at) values (1, now(), now())`,
    )

    expect((await repo.search({ ...ALL, state: 'banned' })).rows).toEqual([])
    expect((await repo.search({ ...ALL, state: 'active' })).rows.map((r) => r.id)).toEqual([1])
    expect((await repo.readDetail(1))?.isBanned).toBe(false)
  })

  it('filters by registration date, with the window half-open', async () => {
    await seed({ id: 1, username: 'ann', createdAt: new Date('2026-01-01T00:00:00Z') })
    await seed({ id: 2, username: 'bob', createdAt: new Date('2026-06-01T00:00:00Z') })

    const boundary = new Date('2026-06-01T00:00:00Z')
    expect((await repo.search({ ...ALL, registeredBefore: boundary })).rows.map((r) => r.id))
      .toEqual([1])
    expect((await repo.search({ ...ALL, registeredAfter: boundary })).rows.map((r) => r.id))
      .toEqual([2])
  })

  it('hides soft-deleted members unless asked for them', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 2, username: 'gone', deletedAt: new Date('2026-05-01T00:00:00Z') })

    expect((await repo.search(ALL)).rows.map((row) => row.id)).toEqual([1])
    expect((await repo.search({ ...ALL, includeDeleted: true })).rows.map((row) => row.id))
      .toEqual([1, 2])
  })

  it('pages by keyset and reports a null cursor on the last page', async () => {
    for (let id = 1; id <= 5; id += 1) await seed({ id, username: `u${id}` })

    const first = await repo.search({ afterUserId: 0, limit: 2 })
    expect(first.rows.map((row) => row.id)).toEqual([1, 2])
    expect(first.nextCursor).toBe(2)

    const second = await repo.search({ afterUserId: 2, limit: 2 })
    expect(second.rows.map((row) => row.id)).toEqual([3, 4])

    const last = await repo.search({ afterUserId: 4, limit: 2 })
    expect(last.rows.map((row) => row.id)).toEqual([5])
    expect(last.nextCursor).toBeNull()
  })

  it('carries the group title, so the listing does not need a second query', async () => {
    await seed({ id: 1, username: 'ann', groupId: ADMINS })
    expect((await repo.search(ALL)).rows[0]?.primaryGroupTitle).toBe('Administrators')
  })
})

describe('readDetail', () => {
  it('returns the account, with the counts and the folded-column-free view', async () => {
    await seed({ id: 1, username: 'Ann', postCount: 12 })

    const detail = await repo.readDetail(1)
    expect(detail).toMatchObject({ id: 1, username: 'Ann', postCount: 12, state: 'active' })
  })

  it('is null for a member that does not exist', async () => {
    expect(await repo.readDetail(9_999)).toBeNull()
  })
})

describe('updateAccount', () => {
  it('writes the folded columns from the same values', async () => {
    await seed({ id: 1, username: 'ann' })

    await repo.updateAccount(1, {
      username: 'Annabel',
      email: 'NEW@Example.Test',
      primaryGroupId: REGISTERED,
      displayGroupId: null,
    })

    const rows = resultRows(
      await db.execute(sql`select username_lower, email_lower from users where id = 1`),
    ) as Array<Record<string, unknown>>
    expect(rows[0]).toEqual({ username_lower: 'annabel', email_lower: 'new@example.test' })
  })

  it('refuses a duplicate username at the database', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 2, username: 'bob' })

    await expect(
      repo.updateAccount(2, {
        username: 'ANN',
        email: 'bob@example.test',
        primaryGroupId: REGISTERED,
        displayGroupId: null,
      }),
    ).rejects.toThrow()
  })

  it('refuses an empty username or email rather than storing one', async () => {
    await seed({ id: 1, username: 'ann' })
    const base = { primaryGroupId: REGISTERED, displayGroupId: null }

    await expect(
      repo.updateAccount(1, { ...base, username: '  ', email: 'a@b.test' }),
    ).rejects.toThrow(/needs a username/)
    await expect(
      repo.updateAccount(1, { ...base, username: 'ann', email: '  ' }),
    ).rejects.toThrow(/needs an email/)
  })

  it('refuses a member that does not exist', async () => {
    await expect(
      repo.updateAccount(9_999, {
        username: 'ghost',
        email: 'g@example.test',
        primaryGroupId: REGISTERED,
        displayGroupId: null,
      }),
    ).rejects.toThrow(/No such member/)
  })

  it('bumps the permission version, because the group is on it', async () => {
    await seed({ id: 1, username: 'ann' })
    const before = await permissionVersion()

    await repo.updateAccount(1, {
      username: 'ann',
      email: 'ann@example.test',
      primaryGroupId: ADMINS,
      displayGroupId: ADMINS,
    })

    expect(await permissionVersion()).toBe(before + 1)
  })

  it('leaves the version alone when the write was refused', async () => {
    const before = await permissionVersion()
    await expect(
      repo.updateAccount(9_999, {
        username: 'ghost',
        email: 'g@example.test',
        primaryGroupId: REGISTERED,
        displayGroupId: null,
      }),
    ).rejects.toThrow()

    expect(await permissionVersion()).toBe(before)
  })
})

describe('setState', () => {
  it('activates a member who was awaiting activation', async () => {
    await seed({ id: 1, username: 'ann', state: 'awaiting_activation' })

    await repo.setState(1, 'active')
    expect((await repo.readDetail(1))?.state).toBe('active')
  })

  it('refuses to write `banned`', async () => {
    await seed({ id: 1, username: 'ann' })

    await expect(repo.setState(1, 'banned')).rejects.toThrow(/ban screen/)
    expect((await repo.readDetail(1))?.state).toBe('active')
  })

  it('refuses to move a banned member out of the banned state', async () => {
    await seed({ id: 1, username: 'ann', state: 'banned' })

    await expect(repo.setState(1, 'active')).rejects.toThrow(/banned/)
    expect((await repo.readDetail(1))?.state).toBe('banned')
  })

  it('bumps the permission version', async () => {
    await seed({ id: 1, username: 'ann', state: 'awaiting_activation' })
    const before = await permissionVersion()

    await repo.setState(1, 'active')
    expect(await permissionVersion()).toBe(before + 1)
  })
})

describe('sharingIpPrefix', () => {
  it('finds the other accounts on a prefix, and never the member themselves', async () => {
    await seed({ id: 1, username: 'ann', lastIp: '203.0.113.0' })
    await seed({ id: 2, username: 'alt', registrationIp: '203.0.113.0' })
    await seed({ id: 3, username: 'carol', lastIp: '198.51.100.0' })

    const shared = await repo.sharingIpPrefix('203.0.113.', 1)
    expect(shared.map((row) => row.id)).toEqual([2])
  })

  it('anchors at the start here too', async () => {
    await seed({ id: 1, username: 'ann', lastIp: '198.51.100.0' })
    await seed({ id: 2, username: 'alt', lastIp: '198.51.100.0' })
    await seed({ id: 3, username: 'elsewhere', lastIp: '10.198.51.0' })

    expect((await repo.sharingIpPrefix('198.51', 1)).map((row) => row.id)).toEqual([2])
  })

  it('is empty for a member with no recorded prefix, rather than matching everybody', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 2, username: 'bob', lastIp: '203.0.113.0' })

    expect(await repo.sharingIpPrefix('', 1)).toEqual([])
  })

  it('escapes the prefix, like the search does', async () => {
    await seed({ id: 1, username: 'ann', lastIp: '203.0.113.0' })
    await seed({ id: 2, username: 'bob', lastIp: '198.51.100.0' })

    expect(await repo.sharingIpPrefix('%', 1)).toEqual([])
  })
})

describe('secondary groups', () => {
  it('round-trips a set', async () => {
    await seed({ id: 1, username: 'ann' })
    await seed({ id: 9, username: 'granter' })

    await repo.setSecondaryGroups(1, [ADMINS, 4], 9)
    expect(await repo.readSecondaryGroups(1)).toEqual([ADMINS, 4])
  })

  it('replaces rather than adds, so unticking a box removes the group', async () => {
    await seed({ id: 1, username: 'ann' })

    await repo.setSecondaryGroups(1, [ADMINS, 4], null)
    await repo.setSecondaryGroups(1, [4], null)

    expect(await repo.readSecondaryGroups(1)).toEqual([4])
  })

  it('never stores the primary group as a secondary one', async () => {
    await seed({ id: 1, username: 'ann', groupId: REGISTERED })

    await repo.setSecondaryGroups(1, [REGISTERED, ADMINS], null)
    expect(await repo.readSecondaryGroups(1)).toEqual([ADMINS])
  })

  it('is idempotent when the same group arrives twice', async () => {
    await seed({ id: 1, username: 'ann' })
    await repo.setSecondaryGroups(1, [ADMINS, ADMINS], null)
    expect(await repo.readSecondaryGroups(1)).toEqual([ADMINS])
  })

  it('bumps the permission version', async () => {
    await seed({ id: 1, username: 'ann' })
    const before = await permissionVersion()

    await repo.setSecondaryGroups(1, [ADMINS], null)
    expect(await permissionVersion()).toBe(before + 1)
  })

  it('refuses a member that does not exist', async () => {
    await expect(repo.setSecondaryGroups(9_999, [ADMINS], null)).rejects.toThrow(
      /No such member/,
    )
  })
})

describe('listGroups', () => {
  it('returns the ladder in display order', async () => {
    const groups = await repo.listGroups()
    expect(groups.length).toBeGreaterThanOrEqual(4)
    expect(groups.find((group) => group.id === ADMINS)?.title).toBe('Administrators')
  })
})
