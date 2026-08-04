/**
 * F46's stores, against real Postgres.
 *
 * **The claim that only a database can settle is the concurrent one.** Ten
 * requests arriving together must produce ten distinct totals, exactly one of
 * which is the eleventh — because the whole feature is about traffic that
 * arrives in parallel, and a read-then-write implementation would pass every
 * single-threaded test in `packages/antispam` while letting all ten through.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'

import { RateLimiter } from '@meith/antispam'

import type { Database } from './client'
import {
  PostgresCaptchaQuestionRepository,
  PostgresRateLimitBucketStore,
} from './antispam-repo'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

let harness: TestDb
let db: Database
let store: PostgresRateLimitBucketStore
let questions: PostgresCaptchaQuestionRepository

const WINDOW = new Date('2026-08-04T12:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  store = new PostgresRateLimitBucketStore(db)
  questions = new PostgresCaptchaQuestionRepository(db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await db.execute(sql`delete from rate_limits`)
  await db.execute(sql`delete from captcha_questions`)
})

describe('the counter', () => {
  it('starts at the cost and increments from there', async () => {
    const spend = () =>
      store.consume({ scope: 'post', subject: 'u:1', windowStart: WINDOW, cost: 1 })

    expect(await spend()).toBe(1)
    expect(await spend()).toBe(2)
    expect(await spend()).toBe(3)
  })

  /*
   * The reason the statement is an upsert rather than a select and an update.
   * Every caller must get a *distinct* total: if two saw the same number, both
   * would make the same decision, and under an attack that is the common case
   * rather than a rare interleaving.
   */
  it('gives every concurrent caller a distinct total', async () => {
    const totals = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.consume({ scope: 'post', subject: 'u:1', windowStart: WINDOW, cost: 1 }),
      ),
    )

    expect([...totals].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  /* The same claim, through the limiter: exactly three of ten get in. */
  it('lets exactly `max` concurrent attempts through', async () => {
    const limiter = new RateLimiter(store, () => new Date('2026-08-04T12:00:30Z'))

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () =>
        limiter.consume({
          scope: 'post',
          subject: 'u:1',
          rule: { max: 3, windowSeconds: 60 },
        }),
      ),
    )

    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(3)
  })

  it('keeps scopes, subjects and windows apart', async () => {
    const at = (scope: 'post' | 'search', subject: string, window: Date) =>
      store.consume({ scope, subject, windowStart: window, cost: 1 })

    await at('post', 'u:1', WINDOW)
    expect(await at('search', 'u:1', WINDOW)).toBe(1)
    expect(await at('post', 'u:2', WINDOW)).toBe(1)
    expect(await at('post', 'u:1', new Date('2026-08-04T13:00:00Z'))).toBe(1)
  })

  it('honours a cost above one', async () => {
    expect(
      await store.consume({ scope: 'upload', subject: 'u:1', windowStart: WINDOW, cost: 5 }),
    ).toBe(5)
  })
})

describe('pruning', () => {
  async function seed(windows: readonly string[]): Promise<void> {
    for (const window of windows) {
      await store.consume({
        scope: 'post',
        subject: 'u:1',
        windowStart: new Date(window),
        cost: 1,
      })
    }
  }

  it('drops old windows and keeps current ones', async () => {
    await seed([
      '2026-08-04T09:00:00Z',
      '2026-08-04T10:00:00Z',
      '2026-08-04T12:00:00Z',
    ])

    expect(await store.prune(new Date('2026-08-04T11:00:00Z'))).toBe(2)

    const left = resultRows(
      await db.execute(sql`select window_start from rate_limits`),
    ) as Array<{ window_start: string }>
    expect(left).toHaveLength(1)
  })

  /*
   * Bounded, per invariant 18. This table grows with *traffic* rather than with
   * content, so on a busy board it is the fastest-growing thing in the schema
   * and an unbounded delete is the one statement that cannot finish inside a
   * serverless invocation.
   */
  it('never deletes more than its limit in one run', async () => {
    await seed(
      Array.from({ length: 6 }, (_, i) =>
        new Date(Date.UTC(2026, 7, 4, i)).toISOString(),
      ),
    )

    expect(await store.prune(new Date('2026-08-05T00:00:00Z'), 2)).toBe(2)
    expect(await store.prune(new Date('2026-08-05T00:00:00Z'), 2)).toBe(2)
  })

  it('is a no-op when nothing is old enough', async () => {
    await seed(['2026-08-04T12:00:00Z'])
    expect(await store.prune(new Date('2026-08-04T11:00:00Z'))).toBe(0)
  })
})

describe('captcha questions', () => {
  it('round-trips a question and splits its answers by line', async () => {
    await questions.create({ question: 'Colour of the sky?', answers: 'blue\nazure\n' })

    const [row] = await questions.list()
    expect(row).toMatchObject({
      question: 'Colour of the sky?',
      answers: ['blue', 'azure'],
      enabled: true,
    })
  })

  /*
   * The failure this prevents is silent and total: a question with no answers
   * is asked of every visitor and refuses all of them, and the symptom is
   * registration stopping on a board whose operator changed something
   * unrelated-looking.
   */
  it('refuses a question nobody could pass', async () => {
    await expect(
      questions.create({ question: 'Colour?', answers: '   \n  ' }),
    ).rejects.toThrow(/at least one answer/)
    await expect(
      questions.create({ question: '  ', answers: 'blue' }),
    ).rejects.toThrow(/needs to be asked/)
  })

  /* Dropped by the reader, not by the caller — the `activeWordFilters` rule. */
  it('leaves a disabled question out of the active set', async () => {
    const id = await questions.create({ question: 'Colour?', answers: 'blue' })
    await questions.update(id, { question: 'Colour?', answers: 'blue', enabled: false })

    expect(await questions.active()).toEqual([])
    expect(await questions.list()).toHaveLength(1)
  })

  /*
   * The ACP refuses this, but a hand-edited database does not — and one
   * unpassable row would refuse every visitor it was shown to.
   */
  it('degrades around a row whose answers are only whitespace', async () => {
    await db.execute(sql`insert into captcha_questions (question, answers) values ('Q?', '   ')`)
    await questions.create({ question: 'Colour?', answers: 'blue' })

    const active = await questions.active()
    expect(active.map((question) => question.question)).toEqual(['Colour?'])
  })

  it('reports an update to a row that is not there', async () => {
    await expect(
      questions.update(9999, { question: 'Q?', answers: 'a', enabled: true }),
    ).rejects.toThrow(/No such question/)
  })

  it('deletes', async () => {
    const id = await questions.create({ question: 'Colour?', answers: 'blue' })
    await questions.delete(id)
    expect(await questions.list()).toEqual([])
  })
})
