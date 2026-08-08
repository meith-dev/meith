/**
 * F48 — reading `community_moderators`, which nothing had ever done.
 *
 * The table has existed since F21 with no reader, so this is the first evidence
 * that the columns are the ones the resolver expects. It runs against real
 * Postgres because the query's whole job is to be a query — a mock would have
 * accepted the `= any($1::int[])` form that drizzle compiles into a syntax
 * error, which is exactly how this file came to exist.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresAuthorizationSource } from './authorization-source'
import { communities, users } from './schema'

let harness: TestDb
let db: Database
let source: PostgresAuthorizationSource

const COMMUNITY = 4
const MODERATOR = 1

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  source = new PostgresAuthorizationSource(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from community_moderators`)
  await db.execute(sql`delete from communities`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values({
    id: MODERATOR,
    username: 'mod',
    usernameLower: 'mod',
    email: 'mod@example.test',
    emailLower: 'mod@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
  await db.insert(communities).values([
    { id: COMMUNITY, title: 'General', slug: 'general', path: '4', depth: 0 },
  ])
})

describe('moderatorAppointments', () => {
  it('reads a personal appointment with its granular rights', async () => {
    await db.execute(sql`
      insert into community_moderators (community_id, user_id, cascade_to_subcommunities,
                                    can_approve_content, can_edit_posts)
      values (${COMMUNITY}, ${MODERATOR}, true, true, false)
    `)

    expect(await source.moderatorAppointments(MODERATOR, [2])).toEqual([
      {
        communityId: COMMUNITY,
        cascadeToSubcommunities: true,
        canApproveContent: true,
        canEditPosts: false,
        canSoftDeletePosts: false,
        canRestorePosts: false,
        canOpenCloseThreads: false,
        canStickThreads: false,
        canMoveThreads: false,
        canMergeThreads: false,
        canSplitThreads: false,
      },
    ])
  })

  it('reads a group appointment for a member of that group', async () => {
    await db.execute(sql`
      insert into community_moderators (community_id, group_id, can_approve_content)
      values (${COMMUNITY}, 5, true)
    `)

    expect(await source.moderatorAppointments(999, [5])).toHaveLength(1)
    expect(await source.moderatorAppointments(999, [2])).toEqual([])
  })

  it('returns nothing for somebody with no appointment', async () => {
    await db.execute(sql`
      insert into community_moderators (community_id, user_id, can_approve_content)
      values (${COMMUNITY}, ${MODERATOR}, true)
    `)
    expect(await source.moderatorAppointments(999, [2])).toEqual([])
  })

  /* A guest has no user id and no groups; the query must not be built at all. */
  it('short-circuits for an actor with neither a user id nor groups', async () => {
    expect(await source.moderatorAppointments(null, [])).toEqual([])
  })

  it('does not fail on an actor with a user id but no groups', async () => {
    await db.execute(sql`
      insert into community_moderators (community_id, user_id, can_approve_content)
      values (${COMMUNITY}, ${MODERATOR}, true)
    `)
    expect(await source.moderatorAppointments(MODERATOR, [])).toHaveLength(1)
  })
})
