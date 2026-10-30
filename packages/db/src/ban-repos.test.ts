import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { BanService } from '@meith/accounts'
import { Authorizer } from '@meith/authorization'

import { ActorBuilder } from './actor-builder'
import { PostgresAuthorizationSource } from './authorization-source'
import { PostgresBanFilterRepository, PostgresBanRepository } from './ban-repos'
import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import {
  adminSessions,
  banFilters,
  bans,
  cacheVersions,
  credentialTokens,
  feedTokens,
  pushSubscriptions,
  rememberTokens,
  sessions,
  userGroupMemberships,
  users,
} from './schema'

const MODERATORS = 5
const REGISTERED = 2
const BANNED = 7
const USER = 100

let harness: TestDb
let db: Database
let repo: PostgresBanRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresBanRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.delete(sessions)
  await db.delete(bans)
  await db.delete(banFilters)
  await db.delete(users)
  await db.delete(cacheVersions)

  await db.insert(users).values({
    id: USER,
    username: 'Mod',
    usernameLower: 'mod',
    email: 'mod@example.test',
    emailLower: 'mod@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: MODERATORS,
    displayGroupId: MODERATORS,
  })
})

async function groupOf(userId: number): Promise<number | null> {
  const [row] = await db.select({ g: users.primaryGroupId }).from(users).where(eq(users.id, userId))
  return row?.g ?? null
}

function service(now: () => Date) {
  return new BanService({ bans: repo, bannedGroupId: BANNED, clock: now })
}

describe('banning', () => {
  it('enforces an existing ban without changing the saved activation state', async () => {
    await db.update(users).set({ state: 'awaiting_activation', primaryGroupId: BANNED })
    await db.insert(bans).values({ userId: USER, previousPrimaryGroupId: MODERATORS })
    const builder = new ActorBuilder(db, { guestGroupId: 1 })
    expect((await builder.buildForUser(USER))?.state).toBe('banned')
    await service(() => new Date()).lift(USER)
    expect((await builder.buildForUser(USER))?.state).toBe('awaiting_activation')
  })

  it('denies secondary-group permissions and revokes every outstanding credential', async () => {
    const expiresAt = new Date('2099-01-01T00:00:00Z')
    await db.insert(userGroupMemberships).values({ userId: USER, groupId: MODERATORS })
    await db.insert(adminSessions).values({ userId: USER, tokenHash: 'admin', expiresAt })
    await db.insert(rememberTokens).values({
      userId: USER,
      tokenHash: 'remember',
      familyId: 'family',
      expiresAt,
    })
    await db.insert(feedTokens).values({ userId: USER, lookup: 'feed', secretHash: 'secret' })
    await db.insert(credentialTokens).values({
      userId: USER,
      tokenHash: 'reset',
      purpose: 'password_reset',
      expiresAt,
    })
    await db.insert(pushSubscriptions).values({
      userId: USER,
      endpoint: 'https://push.example.test',
      p256dh: 'key',
      auth: 'auth',
    })
    await db.execute(sql`
      insert into api_tokens (user_id, name, lookup, secret_hash, scopes)
      values (${USER}, 'test', 'api', 'secret', '[]')
    `)

    const now = new Date('2026-07-30T12:00:00Z')
    await service(() => now).ban({ userId: USER })

    const actor = await new ActorBuilder(db, { guestGroupId: 1 }).buildForUser(USER)
    expect(actor?.state).toBe('banned')
    expect(actor?.groupIds).toEqual([BANNED])
    expect(
      new Authorizer(new PostgresAuthorizationSource(db)).can(actor!, 'thread.view', {
        forumId: 1,
      }),
    ).toBe(false)
    expect((await db.select().from(adminSessions))[0]?.revokedAt).toEqual(now)
    expect((await db.select().from(rememberTokens))[0]?.revokedAt).toEqual(now)
    expect((await db.select().from(credentialTokens))[0]?.consumedAt).toEqual(now)
    expect(await db.select().from(feedTokens)).toEqual([])
    expect(await db.select().from(pushSubscriptions)).toEqual([])
    const tokens = resultRows<{ revoked_at: string }>(
      await db.execute(sql`select revoked_at from api_tokens`),
    )
    expect(new Date(tokens[0]!.revoked_at)).toEqual(now)
    expect((await db.select().from(cacheVersions))[0]?.version).toBe(1)
  })

  it('records the ban, moves the group and revokes sessions together', async () => {
    await db.insert(sessions).values({
      userId: USER,
      tokenHash: 'live-session',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    })

    await service(() => new Date('2026-07-30T12:00:00Z')).ban({ userId: USER })

    expect(await groupOf(USER)).toBe(BANNED)

    const [row] = await db.select({ revokedAt: sessions.revokedAt }).from(sessions)
    expect(row?.revokedAt).not.toBeNull()
  })

  it('captures the group the user actually held', async () => {
    await service(() => new Date('2026-07-30T12:00:00Z')).ban({ userId: USER })

    const [row] = await db.select({ prev: bans.previousPrimaryGroupId }).from(bans)
    expect(row?.prev).toBe(MODERATORS)
  })

  it('rolls back entirely when the user does not exist', async () => {
    await expect(service(() => new Date()).ban({ userId: 9999 })).rejects.toThrow()

    expect(await db.select({ id: bans.id }).from(bans)).toHaveLength(0)
  })
})

describe('expiry', () => {
  it('restores the captured group, not the default', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)

    await svc.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })
    expect(await groupOf(USER)).toBe(BANNED)

    now = new Date('2026-08-06T12:00:01Z')
    expect(await svc.expireDue()).toBe(1)

    expect(await groupOf(USER)).toBe(MODERATORS)
    expect(await groupOf(USER)).not.toBe(REGISTERED)
  })

  it('is idempotent across repeated ticks', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)
    await svc.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })

    now = new Date('2026-08-07T00:00:00Z')
    expect(await svc.expireDue()).toBe(1)
    expect(await svc.expireDue()).toBe(0)
  })

  it('leaves permanent bans alone forever', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)
    await svc.ban({ userId: USER })

    now = new Date('2099-01-01T00:00:00Z')
    expect(await svc.expireDue()).toBe(0)
    expect(await groupOf(USER)).toBe(BANNED)
  })

  it('bumps permission_version so resolved actors are retired', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)
    await svc.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })

    now = new Date('2026-08-07T00:00:00Z')
    await svc.expireDue()

    const [row] = await db
      .select({ v: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
    expect(row?.v).toBe(2)
  })

  it('does not bump the version when nothing expired', async () => {
    await service(() => new Date('2026-07-30T12:00:00Z')).expireDue()
    expect(await db.select({ v: cacheVersions.version }).from(cacheVersions)).toHaveLength(0)
  })

  it('still lifts the ban when the captured group has been deleted', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)
    await svc.ban({ userId: USER, expiresAt: new Date('2026-08-06T12:00:00Z') })

    await db.update(bans).set({ previousPrimaryGroupId: null })

    now = new Date('2026-08-07T00:00:00Z')
    expect(await svc.expireDue()).toBe(1)
    expect(await groupOf(USER)).toBe(BANNED)

    expect(await repo.findActive(USER)).toBeNull()
  })

  it('drains oldest-expiry-first when bounded', async () => {
    let now = new Date('2026-07-30T12:00:00Z')
    const svc = service(() => now)

    for (let i = 0; i < 3; i++) {
      const id = 200 + i
      await db.insert(users).values({
        id,
        username: `u${id}`,
        usernameLower: `u${id}`,
        email: `u${id}@example.test`,
        emailLower: `u${id}@example.test`,
        passwordHash: 'x',
        passwordAlgo: 'argon2id',
        primaryGroupId: REGISTERED,
      })
      await svc.ban({
        userId: id,
        expiresAt: new Date(`2026-08-0${i + 1}T00:00:00Z`),
      })
    }

    now = new Date('2026-09-01T00:00:00Z')
    expect(await svc.expireDue(1)).toBe(1)
    expect(await groupOf(200)).toBe(REGISTERED)
    expect(await groupOf(201)).toBe(BANNED)
  })
})

describe('lifting early', () => {
  it('restores the captured group', async () => {
    const svc = service(() => new Date('2026-07-30T12:00:00Z'))
    await svc.ban({ userId: USER })
    await svc.lift(USER)

    expect(await groupOf(USER)).toBe(MODERATORS)
    expect(await repo.findActive(USER)).toBeNull()
    expect((await new ActorBuilder(db, { guestGroupId: 1 }).buildForUser(USER))?.state).toBe(
      'active',
    )
    expect((await db.select().from(cacheVersions))[0]?.version).toBe(2)
  })
})

describe('PostgresBanFilterRepository', () => {
  it('reads every filter in one query', async () => {
    await db.insert(banFilters).values([
      { type: 'email', pattern: '*@spam.example' },
      { type: 'ip', pattern: '192.0.2.*' },
    ])

    harness.queries.reset()
    const all = await new PostgresBanFilterRepository(db).listAll()

    expect(all).toHaveLength(2)
    expect(harness.queries.count).toBe(1)
  })

  it('returns an empty list on a board with no filters', async () => {
    expect(await new PostgresBanFilterRepository(db).listAll()).toEqual([])
  })
})
