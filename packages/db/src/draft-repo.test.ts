import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

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
  const groupId = Number(resultRows<{ id: number }>(await db.execute(sql`select id from usergroups where key = 'registered'`))[0]!.id)
  await db.execute(sql`insert into users (id, username, username_lower, email, email_lower, primary_group_id) values (901, 'one', 'one', 'one@example.test', 'one@example.test', ${groupId})`)
  await db.execute(sql`insert into forums (id, type, title, slug, path) values (900, 'forum', 'Test', 'test', '900')`)
})

describe('PostgresDraftRepository', () => {
  it('keeps one new-thread draft per user and forum', async () => {
    await drafts.save(901, { forumId: 900, threadId: null, title: 'First', message: 'one', prefixId: null })
    await drafts.save(901, { forumId: 900, threadId: null, title: 'Second', message: 'two', prefixId: null })
    expect(await drafts.find(901, 900, null)).toMatchObject({ title: 'Second', message: 'two' })
    await drafts.remove(901, 900, null)
    expect(await drafts.find(901, 900, null)).toBeNull()
  })
})
