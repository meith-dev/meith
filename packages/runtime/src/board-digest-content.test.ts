import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Authorizer } from '@meith/authorization'
import {
  ActorBuilder,
  type Database,
  PostgresAuthorizationSource,
  PostgresDiscoveryRepository,
} from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'

import { boardDigestContentSource } from './board-digest-content'

let harness: TestDb
let db: Database
let source: ReturnType<typeof boardDigestContentSource>

const REGISTERED = 2
const INSIDERS = 90

const OPEN_FORUM = 10
const PRIVATE_FORUM = 11

const OPEN_THREAD = 20
const PRIVATE_THREAD = 21

const AUTHOR = 1
const MEMBER_A = 2
const MEMBER_B = 3

const EPOCH = new Date('2000-01-01T00:00:00Z')
const RECENT = new Date('2026-08-01T00:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db

  source = boardDigestContentSource({
    authorizer: new Authorizer(new PostgresAuthorizationSource(db)),
    actors: new ActorBuilder(db, { guestGroupId: 1 }),
    discovery: new PostgresDiscoveryRepository(db),
  })
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from forum_permissions`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users where id <> 0`)
  await db.execute(sql`delete from usergroups where id = ${INSIDERS}`)

  await db.execute(sql`
    insert into usergroups (id, key, title, display_order)
    values (${INSIDERS}, 'insiders', 'Insiders', 50)
  `)

  await db.execute(sql`
    insert into forums (id, type, title, slug, path)
    values (${OPEN_FORUM}, 'forum', 'Open', 'open', ${String(OPEN_FORUM)}),
           (${PRIVATE_FORUM}, 'forum', 'Private', 'private', ${String(PRIVATE_FORUM)})
  `)

  await db.execute(sql`
    insert into forum_permissions (forum_id, group_id, can_view, can_view_threads,
                                   can_view_others_threads)
    values (${OPEN_FORUM}, ${REGISTERED}, true, true, true),
           (${OPEN_FORUM}, ${INSIDERS}, true, true, true),
           (${PRIVATE_FORUM}, ${REGISTERED}, false, false, false),
           (${PRIVATE_FORUM}, ${INSIDERS}, true, true, true)
  `)

  for (const [id, groupId] of [
    [AUTHOR, REGISTERED],
    [MEMBER_A, INSIDERS],
    [MEMBER_B, REGISTERED],
  ] as const) {
    await db.execute(sql`
      insert into users (id, username, username_lower, email, email_lower,
                         password_hash, password_algo, primary_group_id, last_active_at)
      values (${id}, ${`u${id}`}, ${`u${id}`}, ${`u${id}@example.test`}, ${`u${id}@example.test`},
              'x', 'argon2id', ${groupId}, ${RECENT})
    `)
  }

  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, created_at, last_post_at)
    values (${OPEN_THREAD}, ${OPEN_FORUM}, 'Everybody can read this', 'open-thread', ${AUTHOR}, 'u1',
            'visible', ${RECENT}, ${RECENT}),
           (${PRIVATE_THREAD}, ${PRIVATE_FORUM}, 'Only insiders can read this', 'private-thread',
            ${AUTHOR}, 'u1', 'visible', ${RECENT}, ${RECENT})
  `)
})

describe('the permission bridge to real Postgres', () => {
  it('includes the private forum’s thread for a member who may see it', async () => {
    const threads = await source.threadsActiveSince(MEMBER_A, EPOCH, 10)

    expect(threads.map((t) => t.title)).toEqual(
      expect.arrayContaining(['Everybody can read this', 'Only insiders can read this']),
    )
  })

  it('excludes the private forum’s thread for a member who may not see it', async () => {
    const threads = await source.threadsActiveSince(MEMBER_B, EPOCH, 10)

    expect(threads.map((t) => t.title)).toEqual(['Everybody can read this'])
  })

  it('never leaks the private forum’s name to the member excluded from it', async () => {
    const threads = await source.threadsActiveSince(MEMBER_B, EPOCH, 10)

    expect(threads.map((t) => t.forumTitle)).not.toContain('Private')
  })

  it('returns nothing for a member the board does not recognise', async () => {
    const threads = await source.threadsActiveSince(999, EPOCH, 10)
    expect(threads).toEqual([])
  })
})
