import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { createTestDb, type TestDb } from './pglite.fixture'
import { PostgresPollRepository } from './poll-repo'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let polls: PostgresPollRepository

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  polls = new PostgresPollRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from polls`)
  await db.execute(sql`delete from thread_ratings`)
  await db.execute(sql`delete from threads`)
  await db.execute(sql`delete from users where id in (901, 902)`)
  await db.execute(sql`delete from forums where id = 900`)
  const groups = await db.execute(
    sql`select id from usergroups where key = 'registered'`,
  )
  const groupId = Number(resultRows<{ id: number }>(groups)[0]!.id)
  await db.execute(sql`insert into users (id, username, username_lower, email, email_lower, primary_group_id)
    values (901, 'one', 'one', 'one@example.test', 'one@example.test', ${groupId}),
           (902, 'two', 'two', 'two@example.test', 'two@example.test', ${groupId})`)
  await db.execute(
    sql`insert into forums (id, type, title, slug, path) values (900, 'forum', 'Test', 'test', '900')`,
  )
  await db.execute(sql`insert into threads (id, forum_id, author_username, title, slug)
    values (900, 900, 'one', 'Thread', 'thread')`)
})

describe('polls', () => {
  it('accepts one vote per member in the database and increments only its option', async () => {
    await polls.create(900, {
      question: 'Choose',
      options: ['First', 'Second'],
      closesAt: null,
    })
    const poll = await polls.find(900, 901)
    expect(poll?.options).toHaveLength(2)
    expect(
      await polls.vote({
        pollId: poll!.id,
        optionId: poll!.options[1]!.id,
        userId: 901,
      }),
    ).toBe(true)
    expect(
      await polls.vote({
        pollId: poll!.id,
        optionId: poll!.options[0]!.id,
        userId: 901,
      }),
    ).toBe(false)
    expect(await polls.find(900, 901)).toMatchObject({
      votedOptionId: poll!.options[1]!.id,
    })
    expect(
      (await polls.find(900, null))?.options.map((option) => option.votes),
    ).toEqual([0, 1])
  })
})

describe('thread ratings', () => {
  it('keeps one rating per member and updates the aggregate when that rating changes', async () => {
    expect(
      await polls.rate({ threadId: 900, userId: 901, rating: 2 }),
    ).toMatchObject({ average: 2, count: 1, mine: 2 })
    expect(
      await polls.rate({ threadId: 900, userId: 902, rating: 4 }),
    ).toMatchObject({ average: 3, count: 2, mine: 4 })
    expect(
      await polls.rate({ threadId: 900, userId: 901, rating: 5 }),
    ).toMatchObject({ average: 4.5, count: 2, mine: 5 })
    expect(await polls.findRating(900, 901)).toMatchObject({
      average: 4.5,
      count: 2,
      mine: 5,
    })
  })
})
