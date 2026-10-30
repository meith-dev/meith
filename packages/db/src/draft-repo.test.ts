import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { unrestrictedAudience } from '@meith/core'

import type { Database } from './client'
import { PostgresDraftRepository } from './draft-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let drafts: PostgresDraftRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  drafts = new PostgresDraftRepository(db)
})
afterAll(async () => harness.close())
beforeEach(async () => {
  await db.execute(sql`delete from post_drafts`)
  await db.execute(sql`delete from users where id = 901`)
  await db.execute(sql`delete from forums where id = 900`)
  const groupId = Number(
    resultRows<{ id: number }>(
      await db.execute(sql`select id from usergroups where key = 'registered'`),
    )[0]!.id,
  )
  await db.execute(
    sql`insert into users (id, username, username_lower, email, email_lower, primary_group_id) values (901, 'one', 'one', 'one@example.test', 'one@example.test', ${groupId})`,
  )
  await db.execute(
    sql`insert into forums (id, type, title, slug, path) values (900, 'forum', 'Test', 'test', '900')`,
  )
})

describe('PostgresDraftRepository', () => {
  it('keeps one new-thread draft per user and forum', async () => {
    await drafts.save(901, {
      forumId: 900,
      threadId: null,
      title: 'First',
      message: 'one',
      prefixId: null,
    })
    await drafts.save(901, {
      forumId: 900,
      threadId: null,
      title: 'Second',
      message: 'two',
      prefixId: null,
    })
    expect(await drafts.find(901, 900, null)).toMatchObject({ title: 'Second', message: 'two' })
    await drafts.remove(901, 900, null)
    expect(await drafts.find(901, 900, null)).toBeNull()
  })
})

describe('listByUser', () => {
  beforeEach(async () => {
    await db.execute(sql`delete from threads where id = 950`)
    await db.execute(
      sql`insert into threads (id, forum_id, title, slug, author_user_id, author_username)
          values (950, 900, 'Hello there', 'hello-there', 901, 'one')`,
    )
  })

  it('lists both a thread draft and a reply draft, target names attached, newest first', async () => {
    await drafts.save(901, {
      forumId: 900,
      threadId: null,
      title: 'A new thread',
      message: 'thread body',
      prefixId: null,
    })
    await db.execute(
      sql`update post_drafts set updated_at = now() - interval '1 hour'
           where user_id = 901 and thread_id is null`,
    )
    await drafts.save(901, {
      forumId: 900,
      threadId: 950,
      title: '',
      message: 'reply body',
      prefixId: null,
    })

    const rows = await drafts.listByUser(901, unrestrictedAudience([900], 901))
    expect(rows).toHaveLength(2)

    const [newest, oldest] = rows
    expect(newest).toMatchObject({
      forumId: 900,
      forumTitle: 'Test',
      forumSlug: 'test',
      threadId: 950,
      threadTitle: 'Hello there',
      threadSlug: 'hello-there',
      message: 'reply body',
    })
    expect(oldest).toMatchObject({
      forumId: 900,
      threadId: null,
      threadTitle: null,
      title: 'A new thread',
      message: 'thread body',
    })
  })

  it('is empty for a user with no drafts', async () => {
    expect(await drafts.listByUser(901, unrestrictedAudience([900], 901))).toEqual([])
  })

  it('never lists another user’s draft', async () => {
    await drafts.save(901, {
      forumId: 900,
      threadId: null,
      title: 'Mine',
      message: 'mine',
      prefixId: null,
    })
    expect(await drafts.listByUser(902, unrestrictedAudience([900], 902))).toEqual([])
  })

  it('excludes a reply draft whose thread no longer exists, rather than a broken resume link', async () => {
    await drafts.save(901, {
      forumId: 900,
      threadId: 950,
      title: '',
      message: 'orphaned reply',
      prefixId: null,
    })

    await db.execute(sql`alter table post_drafts disable trigger all`)
    await db.execute(sql`delete from threads where id = 950`)
    await db.execute(sql`alter table post_drafts enable trigger all`)

    expect(await drafts.listByUser(901, unrestrictedAudience([900], 901))).toEqual([])
  })
})

describe('draft target confidentiality', () => {
  beforeEach(async () => {
    await db.execute(sql`insert into threads (id, forum_id, title, slug, author_user_id, author_username)
      values (950, 900, 'Confidential title', 'confidential-title', 901, 'one')`)
    await drafts.save(901, {
      forumId: 900,
      threadId: 950,
      title: '',
      message: 'my reply',
      prefixId: null,
    })
  })

  it('hides reply targets after access is revoked and preserves the saved draft', async () => {
    expect(await drafts.listByUser(901, unrestrictedAudience([], 901))).toEqual([])
    expect(await drafts.find(901, 900, 950)).toMatchObject({ message: 'my reply' })
  })

  it('checks the current thread forum after a move', async () => {
    await db.execute(
      sql`insert into forums (id, title, slug, path) values (999, 'Staff', 'staff', '999')`,
    )
    await db.execute(sql`update threads set forum_id = 999 where id = 950`)
    expect(await drafts.listByUser(901, unrestrictedAudience([900], 901))).toEqual([])
    expect(await drafts.listByUser(901, unrestrictedAudience([999], 901))).toMatchObject([
      { threadTitle: 'Confidential title', forumTitle: 'Staff' },
    ])
    await db.execute(sql`update threads set forum_id = 900 where id = 950`)
    await db.execute(sql`delete from forums where id = 999`)
  })

  it('hides unapproved and deleted target titles', async () => {
    for (const visibility of ['unapproved', 'deleted']) {
      await db.execute(sql`update threads set visibility = ${visibility} where id = 950`)
      expect(await drafts.listByUser(901, unrestrictedAudience([900], 901))).toEqual([])
    }
  })

  it('honors own-thread-only forums', async () => {
    const audience = { forumIds: [900], ownThreadsOnlyForumIds: [900], viewerUserId: 901 }
    expect(await drafts.listByUser(901, audience)).toHaveLength(1)
    await db.execute(sql`update threads set author_user_id = null where id = 950`)
    expect(await drafts.listByUser(901, audience)).toEqual([])
  })

  it('hides new-thread drafts when forum access is revoked', async () => {
    await drafts.save(901, {
      forumId: 900,
      threadId: null,
      title: 'Mine',
      message: 'new',
      prefixId: null,
    })
    expect(await drafts.listByUser(901, unrestrictedAudience([], 901))).toEqual([])
  })
})
