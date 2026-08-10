import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresAuthorizationSource } from './authorization-source'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let source: PostgresAuthorizationSource

const FORUM = 4
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
  await db.execute(sql`delete from forum_moderators`)
  await db.execute(sql`delete from forums`)
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
  await db.insert(forums).values([
    { id: FORUM, title: 'General', slug: 'general', path: '4', depth: 0 },
  ])
})

describe('moderatorAppointments', () => {
  it('reads a personal appointment with its granular rights', async () => {
    await db.execute(sql`
      insert into forum_moderators (forum_id, user_id, cascade_to_subforums,
                                    can_approve_content, can_edit_posts)
      values (${FORUM}, ${MODERATOR}, true, true, false)
    `)

    expect(await source.moderatorAppointments(MODERATOR, [2])).toEqual([
      {
        forumId: FORUM,
        cascadeToSubforums: true,
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
      insert into forum_moderators (forum_id, group_id, can_approve_content)
      values (${FORUM}, 5, true)
    `)

    expect(await source.moderatorAppointments(999, [5])).toHaveLength(1)
    expect(await source.moderatorAppointments(999, [2])).toEqual([])
  })

  it('returns nothing for somebody with no appointment', async () => {
    await db.execute(sql`
      insert into forum_moderators (forum_id, user_id, can_approve_content)
      values (${FORUM}, ${MODERATOR}, true)
    `)
    expect(await source.moderatorAppointments(999, [2])).toEqual([])
  })

  it('short-circuits for an actor with neither a user id nor groups', async () => {
    expect(await source.moderatorAppointments(null, [])).toEqual([])
  })

  it('does not fail on an actor with a user id but no groups', async () => {
    await db.execute(sql`
      insert into forum_moderators (forum_id, user_id, can_approve_content)
      values (${FORUM}, ${MODERATOR}, true)
    `)
    expect(await source.moderatorAppointments(MODERATOR, [])).toHaveLength(1)
  })
})
