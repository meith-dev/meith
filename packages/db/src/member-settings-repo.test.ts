import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresMemberSettingsRepository } from './member-settings-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let repo: PostgresMemberSettingsRepository

const IVAN = 1
const MOD = 2

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  repo = new PostgresMemberSettingsRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from users`)
  await db.execute(sql`
    insert into users (id, username, username_lower, email, email_lower,
                       password_hash, password_algo, primary_group_id)
    values (${IVAN}, 'ivan', 'ivan', 'ivan@example.test', 'ivan@example.test',
            'x', 'argon2id', 2),
           (${MOD}, 'mod', 'mod', 'mod@example.test', 'mod@example.test',
            'x', 'argon2id', 2)
  `)
})

describe('reading', () => {
  it('returns the board defaults for an account that has changed nothing', async () => {
    const settings = await repo.read(IVAN)

    expect(settings).toEqual({
      userId: IVAN,
      email: 'ivan@example.test',
      invisible: false,
      timezone: 'auto',
      postsPerPage: null,
      threadsPerPage: null,
      location: null,
      website: null,
      bio: null,
      displayGroupId: null,
    })
  })

  it('returns nothing for an account that does not exist', async () => {
    expect(await repo.read(9_999)).toBeNull()
  })

  it('returns nothing for a deleted account', async () => {
    await db.execute(sql`update users set state = 'deleted' where id = ${IVAN}`)
    expect(await repo.read(IVAN)).toBeNull()
  })
})

describe('saving', () => {
  it('stores the profile fields and reads them back', async () => {
    await repo.saveProfile({
      userId: IVAN,
      location: 'Cambridge',
      website: 'https://example.test/',
      bio: 'Hello.',
    })

    expect(await repo.read(IVAN)).toMatchObject({
      location: 'Cambridge',
      website: 'https://example.test/',
      bio: 'Hello.',
    })
  })

  it('clears a field that was emptied', async () => {
    await repo.saveProfile({ userId: IVAN, location: 'Cambridge', website: null, bio: null })
    await repo.saveProfile({ userId: IVAN, location: null, website: null, bio: null })

    expect((await repo.read(IVAN))?.location).toBeNull()
  })

  it('stores the options, including "follow the board"', async () => {
    await repo.saveOptions({
      userId: IVAN,
      timezone: 'Europe/London',
      postsPerPage: 50,
      threadsPerPage: null, invisible: false,
    })

    expect(await repo.read(IVAN)).toMatchObject({
      timezone: 'Europe/London',
      postsPerPage: 50,
      threadsPerPage: null, invisible: false,
    })
  })

  it('touches nobody else', async () => {
    await repo.saveOptions({
      userId: IVAN,
      timezone: 'Europe/London',
      postsPerPage: 50,
      threadsPerPage: 50, invisible: false,
    })

    expect(await repo.read(MOD)).toMatchObject({ timezone: 'auto', postsPerPage: null })
  })
})

describe('adopting a confirmed address', () => {
  it('moves the address and marks it verified', async () => {
    expect(
      await repo.adoptEmail({
        userId: IVAN,
        email: 'New@example.test',
        emailLower: 'new@example.test',
      }),
    ).toBe(true)

    const rows = resultRows(
      await db.execute(
        sql`select email, email_lower, email_verified_at from users where id = ${IVAN}`,
      ),
    ) as Array<{ email: string; email_lower: string; email_verified_at: unknown }>

    expect(rows[0]?.email).toBe('New@example.test')
    expect(rows[0]?.email_lower).toBe('new@example.test')
    expect(rows[0]?.email_verified_at).not.toBeNull()
  })

  it('refuses an address another account already holds', async () => {
    expect(
      await repo.adoptEmail({
        userId: IVAN,
        email: 'mod@example.test',
        emailLower: 'mod@example.test',
      }),
    ).toBe(false)

    expect((await repo.read(IVAN))?.email).toBe('ivan@example.test')
  })

  it('refuses it case-insensitively, like every other identifier on the board', async () => {
    expect(
      await repo.adoptEmail({
        userId: IVAN,
        email: 'MOD@example.test',
        emailLower: 'mod@example.test',
      }),
    ).toBe(false)
  })

  it('lets a member re-adopt the address they already have', async () => {
    expect(
      await repo.adoptEmail({
        userId: IVAN,
        email: 'ivan@example.test',
        emailLower: 'ivan@example.test',
      }),
    ).toBe(true)
  })

  it('refuses to move a deleted account’s address', async () => {
    await db.execute(sql`update users set state = 'deleted' where id = ${IVAN}`)

    expect(
      await repo.adoptEmail({
        userId: IVAN,
        email: 'new@example.test',
        emailLower: 'new@example.test',
      }),
    ).toBe(false)
  })
})

describe('the display group', () => {
  const SUPPORTERS = 90
  const ALUMNI = 91

  beforeEach(async () => {
    await db.execute(sql`delete from user_group_memberships`)
    await db.execute(sql`delete from usergroups where id in (${SUPPORTERS}, ${ALUMNI})`)
    await db.execute(sql`
      insert into usergroups (id, key, title, display_order)
      values (${SUPPORTERS}, 'supporters', 'Supporters', 20),
             (${ALUMNI}, 'alumni', 'Alumni', 30)
    `)
  })

  it('offers the primary group first, then every live membership', async () => {
    await db.execute(sql`
      insert into user_group_memberships (user_id, group_id, expires_at)
      values (${IVAN}, ${SUPPORTERS}, now() + interval '1 day'),
             (${IVAN}, ${ALUMNI}, now() - interval '1 day')
    `)

    expect(await repo.groupsHeldBy(IVAN)).toEqual([
      { groupId: 2, title: 'Registered', isPrimary: true },
      { groupId: SUPPORTERS, title: 'Supporters', isPrimary: false },
    ])
  })

  it('saves and clears the chosen group', async () => {
    await repo.saveDisplayGroup({ userId: IVAN, displayGroupId: SUPPORTERS })
    expect((await repo.read(IVAN))?.displayGroupId).toBe(SUPPORTERS)

    await repo.saveDisplayGroup({ userId: IVAN, displayGroupId: null })
    expect((await repo.read(IVAN))?.displayGroupId).toBeNull()
  })

  it('offers nothing for an account that is gone', async () => {
    await db.execute(sql`update users set state = 'deleted' where id = ${IVAN}`)
    expect(await repo.groupsHeldBy(IVAN)).toEqual([])
  })
})
