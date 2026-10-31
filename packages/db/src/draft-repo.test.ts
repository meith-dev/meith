import { readFileSync } from 'node:fs'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { unrestrictedAudience } from '@meith/core'

import type { Database } from './client'
import { PostgresDraftRepository } from './draft-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'
import { PostgresThreadToolsRepository } from './thread-tools'

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

describe('reply drafts across forum moves', () => {
  const reply = { forumId: 900, threadId: 950, title: '', message: 'Keep my reply', prefixId: null }
  beforeEach(async () => {
    await db.execute(sql`delete from forums where id = 999`)
    await db.execute(
      sql`insert into forums (id, title, slug, path) values (999, 'Destination', 'destination', '999')`,
    )
    await db.execute(
      sql`insert into threads (id, forum_id, title, slug, author_user_id, author_username) values (950, 900, 'Moved', 'moved', 901, 'one')`,
    )
    await drafts.save(901, reply)
  })

  it('finds and removes a legacy reply draft using its thread identity', async () => {
    await db.execute(sql`update threads set forum_id = 999 where id = 950`)
    expect(await drafts.find(901, 999, 950)).toMatchObject({
      forumId: 999,
      message: 'Keep my reply',
    })
    expect(await drafts.listByUser(901, unrestrictedAudience([999], 901))).toMatchObject([
      { forumId: 999 },
    ])
    await drafts.remove(902, 999, 950)
    expect(await drafts.find(901, 999, 950)).not.toBeNull()
    await drafts.remove(901, 999, 950)
    expect(await drafts.find(901, 900, 950)).toBeNull()
  })

  it('saves with the locked current forum even when the composer supplies an old forum', async () => {
    await db.execute(sql`update threads set forum_id = 999 where id = 950`)
    await drafts.save(901, { ...reply, message: 'Updated reply' })
    expect(
      resultRows(await db.execute(sql`select forum_id from post_drafts where thread_id = 950`)),
    ).toEqual([{ forum_id: 999 }])
    await db.execute(sql`delete from forums where id = 900`)
    expect(await drafts.find(901, 999, 950)).toMatchObject({ message: 'Updated reply' })
  })

  it('moves stored references before the old forum can delete an untouched reply draft', async () => {
    const tools = new PostgresThreadToolsRepository(db)
    expect(
      await tools.move({
        threadId: 950,
        fromForumId: 900,
        toForumId: 999,
        actorUserId: 901,
        at: new Date(),
      }),
    ).toBe(true)
    await db.execute(sql`delete from forums where id = 900`)
    expect(await drafts.find(901, 999, 950)).toMatchObject({
      message: 'Keep my reply',
      forumId: 999,
    })
  })

  it('repairs existing references without changing saved content or timestamps', async () => {
    await db.execute(sql`update threads set forum_id = 999 where id = 950`)
    const before = await drafts.find(901, 999, 950)
    const migration = readFileSync(
      new URL('../migrations/0073_reply_draft_forums.sql', import.meta.url),
      'utf8',
    )
    await db.execute(sql.raw(migration))
    expect(
      resultRows(await db.execute(sql`select forum_id from post_drafts where thread_id = 950`)),
    ).toEqual([{ forum_id: 999 }])
    expect(await drafts.find(901, 999, 950)).toEqual(before)
    await db.execute(sql`delete from forums where id = 900`)
    expect(await drafts.find(901, 999, 950)).toEqual(before)
  })

  it('keeps new-thread drafts scoped to their forum', async () => {
    await drafts.save(901, { ...reply, threadId: null, message: 'Original forum' })
    await drafts.save(901, { ...reply, forumId: 999, threadId: null, message: 'Other forum' })
    await drafts.remove(901, 999, null)
    expect(await drafts.find(901, 900, null)).toMatchObject({ message: 'Original forum' })
    expect(await drafts.find(901, 999, null)).toBeNull()
  })
})
