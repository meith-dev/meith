import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { PollOption, ValidatedPoll } from '@meith/polls'

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
  const groups = await db.execute(sql`select id from usergroups where key = 'registered'`)
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

const newPoll = (overrides: Partial<ValidatedPoll> = {}): ValidatedPoll => ({
  question: 'Choose',
  options: ['First', 'Second'],
  closesAt: null,
  maxOptions: 1,
  allowRevote: false,
  publicVotes: false,
  ...overrides,
})

const counts = async (): Promise<readonly number[]> =>
  ((await polls.find(900, null))?.options ?? []).map((option: PollOption) => option.votes)

describe('polls', () => {
  it('accepts one vote per member in the database and increments only its option', async () => {
    await polls.create(900, newPoll())
    const poll = await polls.find(900, 901)
    expect(poll?.options).toHaveLength(2)
    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [poll!.options[1]!.id],
        userId: 901,
      }),
    ).toBe(true)
    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [poll!.options[0]!.id],
        userId: 901,
      }),
    ).toBe(false)
    expect(await polls.find(900, 901)).toMatchObject({
      votedOptionIds: [poll!.options[1]!.id],
    })
    expect(await counts()).toEqual([0, 1])
  })

  it('rejects a poll from a different authorized thread', async () => {
    await db.execute(sql`insert into threads (id, forum_id, author_username, title, slug)
      values (901, 900, 'two', 'Other thread', 'other-thread')`)
    await polls.create(900, newPoll())
    const poll = await polls.find(900, null)

    expect(
      await polls.vote({
        threadId: 901,
        pollId: poll!.id,
        optionIds: [poll!.options[0]!.id],
        userId: 901,
      }),
    ).toBe(false)
    expect(await counts()).toEqual([0, 0])
  })

  it('takes as many options as the choice limit allows and refuses one more', async () => {
    await polls.create(900, newPoll({ options: ['First', 'Second', 'Third'], maxOptions: 2 }))
    const poll = await polls.find(900, null)
    const [first, second, third] = poll!.options

    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [first!.id, third!.id],
        userId: 901,
      }),
    ).toBe(true)
    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [first!.id, second!.id, third!.id],
        userId: 902,
      }),
    ).toBe(false)
    expect(await counts()).toEqual([1, 0, 1])
    expect((await polls.find(900, 901))?.votedOptionIds).toEqual([first!.id, third!.id])
  })

  it('takes any number of options when the poll sets no limit', async () => {
    await polls.create(900, newPoll({ options: ['First', 'Second', 'Third'], maxOptions: 0 }))
    const poll = await polls.find(900, null)

    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: poll!.options.map((option: PollOption) => option.id),
        userId: 901,
      }),
    ).toBe(true)
    expect(await counts()).toEqual([1, 1, 1])
  })

  it('refuses an option that belongs to another poll', async () => {
    await polls.create(900, newPoll())
    const poll = await polls.find(900, null)

    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [poll!.options[0]!.id, 9_999],
        userId: 901,
      }),
    ).toBe(false)
    expect(await counts()).toEqual([0, 0])
  })

  it('refuses a vote in a poll that has closed', async () => {
    await polls.create(900, newPoll())
    const poll = await polls.find(900, null)
    await db.execute(sql`update polls set closes_at = now() - interval '1 hour'`)

    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [poll!.options[0]!.id],
        userId: 901,
      }),
    ).toBe(false)
  })

  it('moves a member’s vote when the poll allows re-voting', async () => {
    await polls.create(900, newPoll({ allowRevote: true, maxOptions: 2 }))
    const poll = await polls.find(900, null)
    const [first, second] = poll!.options

    await polls.vote({ threadId: 900, pollId: poll!.id, optionIds: [first!.id], userId: 901 })
    await polls.vote({ threadId: 900, pollId: poll!.id, optionIds: [second!.id], userId: 902 })
    expect(await counts()).toEqual([1, 1])

    expect(
      await polls.vote({
        threadId: 900,
        pollId: poll!.id,
        optionIds: [first!.id, second!.id],
        userId: 901,
      }),
    ).toBe(true)
    expect(await counts()).toEqual([1, 2])
    expect((await polls.find(900, 901))?.votedOptionIds).toEqual([first!.id, second!.id])
  })

  it('names the voters only when the poll makes them public', async () => {
    await polls.create(900, newPoll({ publicVotes: true }))
    const poll = await polls.find(900, null)
    await polls.vote({
      threadId: 900,
      pollId: poll!.id,
      optionIds: [poll!.options[0]!.id],
      userId: 901,
    })

    const open = await polls.find(900, null)
    expect(open?.options[0]?.voters.map((voter) => voter.username)).toEqual(['one'])
    expect(open?.options[1]?.voters).toEqual([])

    await db.execute(sql`update polls set public_votes = false`)
    expect((await polls.find(900, null))?.options[0]?.voters).toEqual([])
  })

  it('renames, reorders, adds and removes options in one edit', async () => {
    await polls.create(900, newPoll({ options: ['First', 'Second', 'Third'] }))
    const poll = await polls.find(900, null)
    const [first, second, third] = poll!.options

    expect(
      await polls.applyEdit({
        pollId: poll!.id,
        question: 'Choose again',
        closesAt: null,
        maxOptions: 2,
        allowRevote: true,
        publicVotes: true,
        options: [
          { id: third!.id, label: 'Third' },
          { id: first!.id, label: 'Renamed' },
          { id: null, label: 'Fourth' },
        ],
        removedOptionIds: [second!.id],
      }),
    ).toBe(true)

    const edited = await polls.find(900, null)
    expect(edited).toMatchObject({
      question: 'Choose again',
      maxOptions: 2,
      allowRevote: true,
      publicVotes: true,
    })
    expect(edited?.options.map((option: PollOption) => option.label)).toEqual([
      'Third',
      'Renamed',
      'Fourth',
    ])
  })

  it('refuses an edit that would drop an option somebody voted for', async () => {
    await polls.create(900, newPoll())
    const poll = await polls.find(900, null)
    const [first, second] = poll!.options
    await polls.vote({ threadId: 900, pollId: poll!.id, optionIds: [second!.id], userId: 901 })

    expect(
      await polls.applyEdit({
        pollId: poll!.id,
        question: 'Choose',
        closesAt: null,
        maxOptions: 1,
        allowRevote: false,
        publicVotes: false,
        options: [
          { id: first!.id, label: 'First' },
          { id: null, label: 'Third' },
        ],
        removedOptionIds: [second!.id],
      }),
    ).toBe(false)
    expect(await counts()).toEqual([0, 1])
  })

  it('refuses an edit that would expose voters after voting has started', async () => {
    await polls.create(900, newPoll())
    const poll = await polls.find(900, null)
    await polls.vote({
      threadId: 900,
      pollId: poll!.id,
      optionIds: [poll!.options[0]!.id],
      userId: 901,
    })

    expect(
      await polls.applyEdit({
        pollId: poll!.id,
        question: 'Choose',
        closesAt: null,
        maxOptions: 1,
        allowRevote: false,
        publicVotes: true,
        options: poll!.options.map((option: PollOption) => ({
          id: option.id,
          label: option.label,
        })),
        removedOptionIds: [],
      }),
    ).toBe(false)
    expect((await polls.find(900, null))?.publicVotes).toBe(false)
  })
})

describe('thread ratings', () => {
  it('keeps one rating per member and updates the aggregate when that rating changes', async () => {
    expect(await polls.rate({ threadId: 900, userId: 901, rating: 2 })).toMatchObject({
      average: 2,
      count: 1,
      mine: 2,
    })
    expect(await polls.rate({ threadId: 900, userId: 902, rating: 4 })).toMatchObject({
      average: 3,
      count: 2,
      mine: 4,
    })
    expect(await polls.rate({ threadId: 900, userId: 901, rating: 5 })).toMatchObject({
      average: 4.5,
      count: 2,
      mine: 5,
    })
    expect(await polls.findRating(900, 901)).toMatchObject({
      average: 4.5,
      count: 2,
      mine: 5,
    })
  })
})
