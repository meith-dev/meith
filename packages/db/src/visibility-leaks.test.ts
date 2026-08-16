import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import {
  ALL_THREAD_AUTHORS,
  PUBLIC_CONTENT,
  contentScopeFrom,
  type ContentScope,
  type ContentVisibility,
} from '@meith/core'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresPostRepository } from './post-repo'
import { PostgresReadStateRepository } from './read-state-repo'
import { PostgresThreadRepository } from './thread-repo'
import { forums, users } from './schema'

let harness: TestDb
let db: Database
let threads: PostgresThreadRepository
let posts: PostgresPostRepository
let readState: PostgresReadStateRepository

const CATEGORY = 1
const FORUM = 4
const READER = 1
const AT = new Date('2026-07-30T12:00:00Z')

const SCOPES: ReadonlyArray<{ name: string; scope: ContentScope }> = [
  { name: 'a guest or ordinary member', scope: PUBLIC_CONTENT },
  {
    name: 'a moderator who reviews the queue',
    scope: contentScopeFrom({ seesUnapproved: true, seesDeleted: false }),
  },
  {
    name: 'a moderator who reads removed content',
    scope: contentScopeFrom({ seesUnapproved: false, seesDeleted: true }),
  },
  {
    name: 'full staff',
    scope: contentScopeFrom({ seesUnapproved: true, seesDeleted: true }),
  },
]

const THREAD = { visible: 100, unapproved: 101, deleted: 102 } as const
const POST = { visible: 1000, unapproved: 1001, deleted: 1002 } as const

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  threads = new PostgresThreadRepository(db)
  posts = new PostgresPostRepository(db)
  readState = new PostgresReadStateRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

async function seedThread(id: number, visibility: ContentVisibility): Promise<void> {
  await db.execute(sql`
    insert into threads (id, forum_id, title, slug, author_user_id, author_username,
                         visibility, last_post_id, last_post_at, created_at, updated_at)
    values (${id}, ${FORUM}, ${'T' + String(id)}, ${'t' + String(id)}, ${READER}, 'ada',
            ${visibility}, ${id * 10}, ${AT}, ${AT}, ${AT})
  `)
}

async function seedPost(
  id: number,
  threadId: number,
  visibility: ContentVisibility,
): Promise<void> {
  await db.execute(sql`
    insert into posts (id, thread_id, forum_id, author_user_id, author_username,
                       message, visibility, is_first_post, created_at)
    values (${id}, ${threadId}, ${FORUM}, ${READER}, 'ada', ${'body ' + String(id)},
            ${visibility}, ${id === POST.visible}, ${AT})
  `)
}

beforeEach(async () => {
  await db.execute(sql`delete from threads_read`)
  await db.execute(sql`delete from forums_read`)
  await db.execute(sql`delete from posts`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from forums`)
  await db.execute(sql`delete from users`)

  await db.insert(users).values({
    id: READER,
    username: 'ada',
    usernameLower: 'ada',
    email: 'ada@example.test',
    emailLower: 'ada@example.test',
    passwordHash: 'x',
    passwordAlgo: 'argon2id',
    primaryGroupId: 2,
  })
  await db.insert(forums).values([
    { id: CATEGORY, type: 'category', title: 'Cat', slug: 'cat', path: '1', depth: 0 },
    { id: FORUM, title: 'General', slug: 'general', path: '1.4', depth: 1, parentId: CATEGORY },
  ])

  await seedThread(THREAD.visible, 'visible')
  await seedThread(THREAD.unapproved, 'unapproved')
  await seedThread(THREAD.deleted, 'deleted')

  await seedPost(POST.visible, THREAD.visible, 'visible')
  await seedPost(POST.unapproved, THREAD.visible, 'unapproved')
  await seedPost(POST.deleted, THREAD.visible, 'deleted')
})

const PATHS: ReadonlyArray<{
  name: string
  run(scope: ContentScope): Promise<readonly ContentVisibility[]>
}> = [
  {
    name: 'threads.listForum',
    async run(scope) {
      const page = await threads.listForum(FORUM, {
        limit: 50,
        scope,
        authors: ALL_THREAD_AUTHORS,
      })
      return page.rows.map((row) => row.visibility)
    },
  },
  {
    name: 'threads.findById',
    async run(scope) {
      const found = await Promise.all(
        Object.values(THREAD).map((id) =>
          threads.findById(id, scope, ALL_THREAD_AUTHORS),
        ),
      )
      return found.flatMap((row) => (row === null ? [] : [row.visibility]))
    },
  },
  {
    name: 'posts.listThread',
    async run(scope) {
      const page = await posts.listThread(THREAD.visible, { limit: 50, scope })
      return page.rows.map((row) => row.visibility)
    },
  },
]

describe('no read path returns content outside its scope', () => {
  for (const { name, scope } of SCOPES) {
    for (const path of PATHS) {
      it(`${path.name} shows ${name} only what they may see`, async () => {
        const states = await path.run(scope)
        for (const state of states) {
          expect(scope.states, `${path.name} leaked a ${state} row`).toContain(state)
        }
      })
    }
  }

  it('shows exactly the expected threads at each scope', async () => {
    const listed = async (scope: ContentScope): Promise<number[]> =>
      (await threads.listForum(FORUM, { limit: 50, scope, authors: ALL_THREAD_AUTHORS })).rows
        .map((row) => row.id)
        .sort()

    expect(await listed(PUBLIC_CONTENT)).toEqual([THREAD.visible])
    expect(await listed(contentScopeFrom({ seesUnapproved: true, seesDeleted: false }))).toEqual(
      [THREAD.visible, THREAD.unapproved].sort(),
    )
    expect(await listed(contentScopeFrom({ seesUnapproved: false, seesDeleted: true }))).toEqual(
      [THREAD.visible, THREAD.deleted].sort(),
    )
    expect(await listed(contentScopeFrom({ seesUnapproved: true, seesDeleted: true }))).toEqual(
      [THREAD.visible, THREAD.unapproved, THREAD.deleted].sort(),
    )
  })

  it('shows exactly the expected posts at each scope', async () => {
    const listed = async (scope: ContentScope): Promise<number[]> =>
      (await posts.listThread(THREAD.visible, { limit: 50, scope })).rows.map((r) => r.id).sort()

    expect(await listed(PUBLIC_CONTENT)).toEqual([POST.visible])
    expect(await listed(contentScopeFrom({ seesUnapproved: true, seesDeleted: true }))).toEqual(
      [POST.visible, POST.unapproved, POST.deleted].sort(),
    )
  })
})

describe('action targets stay public for everybody', () => {
  it('will not quote a hidden post', async () => {
    expect(await posts.findQuotable(THREAD.visible, POST.visible)).not.toBeNull()
    expect(await posts.findQuotable(THREAD.visible, POST.unapproved)).toBeNull()
    expect(await posts.findQuotable(THREAD.visible, POST.deleted)).toBeNull()
  })

  it('will not accept a hidden post as a read marker', async () => {
    expect(await posts.findVisibleById(THREAD.visible, POST.visible)).toBe(POST.visible)
    expect(await posts.findVisibleById(THREAD.visible, POST.unapproved)).toBeNull()
    expect(await posts.findVisibleById(THREAD.visible, POST.deleted)).toBeNull()
  })

  it('counts only visible threads as unread', async () => {
    const state = await readState.forUser(READER)
    expect(state.unreadForumIds.has(FORUM)).toBe(true)

    await db.execute(sql`update threads set visibility = 'deleted' where id = ${THREAD.visible}`)
    const after = await readState.forUser(READER)
    expect(after.unreadForumIds.has(FORUM)).toBe(false)
  })
})

describe('nothing widens a read except the scope', () => {
  it('hides a member"s own hidden posts from them', async () => {
    const page = await posts.listThread(THREAD.visible, {
      limit: 50,
      scope: PUBLIC_CONTENT,
    })
    expect(page.rows.map((row) => row.id)).toEqual([POST.visible])
  })

  it('numbers posts within the reader"s own scope', async () => {
    const staff = contentScopeFrom({ seesUnapproved: true, seesDeleted: true })

    const forStaff = await posts.listThread(THREAD.visible, {
      afterId: POST.visible,
      limit: 50,
      scope: staff,
    })
    expect(forStaff.rows.map((row) => [row.id, row.number])).toEqual([
      [POST.unapproved, 2],
      [POST.deleted, 3],
    ])

    await seedPost(POST.deleted + 1, THREAD.visible, 'visible')
    const forMember = await posts.listThread(THREAD.visible, {
      afterId: POST.deleted,
      limit: 50,
      scope: PUBLIC_CONTENT,
    })
    expect(forMember.rows.map((row) => [row.id, row.number])).toEqual([
      [POST.deleted + 1, 2],
    ])
  })

  it('does not let a cursor page past the filter', async () => {
    const page = await posts.listThread(THREAD.visible, {
      afterId: POST.unapproved,
      limit: 50,
      scope: PUBLIC_CONTENT,
    })
    expect(page.rows).toHaveLength(0)
  })
})
