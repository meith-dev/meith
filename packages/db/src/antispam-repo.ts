/**
 * F46 — the anti-spam stores.
 *
 * Two of them, and only the first has anything interesting in it.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type { CaptchaQuestion, RateLimitScope, RateLimitStore } from '@meith/antispam'

import type { Database } from './client'
import { resultRows } from './result-rows'

/**
 * The counter, in one statement.
 *
 * `insert … on conflict do update … returning` is the entire concurrency
 * story. Postgres serialises conflicting upserts on the same key, so ten
 * requests arriving together get ten distinct totals back and exactly one of
 * them is the eleventh — whereas a `select` followed by an `update` would hand
 * all ten the same number and let all ten through. Under an attack that is not
 * an unlikely interleaving; it is the traffic pattern the feature exists for.
 *
 * Note there is no "check" method. Reading a counter without spending against
 * it is exactly what a caller would do just before forgetting to spend, so the
 * only operation is the one that does both.
 */
export class PostgresRateLimitBucketStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async consume(input: {
    readonly scope: RateLimitScope
    readonly subject: string
    readonly windowStart: Date
    readonly cost: number
  }): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into rate_limits (scope, subject, window_start, used)
        values (${input.scope}, ${input.subject}, ${input.windowStart}, ${input.cost})
        on conflict (scope, subject, window_start)
          do update set used = rate_limits.used + ${input.cost}
        returning used
      `),
    ) as Array<{ used: number }>

    return Number(rows[0]?.used ?? input.cost)
  }

  /**
   * Drop windows nobody will read again.
   *
   * Bounded by `limit` and driven by F06's tick, per invariant 18: this table
   * grows with traffic rather than with content, so on a busy board it is the
   * fastest-growing thing in the schema and an unbounded delete would be the
   * one statement that cannot finish inside a serverless invocation.
   *
   * `ctid` rather than a subquery on the primary key, because the key is three
   * columns and the point is to delete *some* rows cheaply rather than to
   * identify which.
   */
  async prune(before: Date, limit = 5000): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from rate_limits
         where ctid in (
           select ctid from rate_limits where window_start < ${before} limit ${limit}
         )
        returning subject
      `),
    ) as Array<unknown>

    return rows.length
  }
}

export interface CaptchaQuestionRow extends CaptchaQuestion {
  readonly enabled: boolean
}

/** Answers are stored one per line, as the operator typed them. */
function splitAnswers(raw: string): readonly string[] {
  return raw
    .split('\n')
    .map((answer) => answer.trim())
    .filter((answer) => answer !== '')
}

export class PostgresCaptchaQuestionRepository {
  constructor(private readonly db: Database) {}

  /**
   * The questions the challenge may ask.
   *
   * Disabled rows are dropped **here** rather than by the caller, the same rule
   * `activeWordFilters` follows: a question an operator switched off that still
   * gets asked on one form is worse than having no switch.
   */
  async active(): Promise<readonly CaptchaQuestion[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, question, answers from captcha_questions
         where enabled = true and question <> '' and answers <> ''
         order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows
      .map((row) => ({
        id: Number(row.id),
        question: String(row.question),
        answers: splitAnswers(String(row.answers)),
      }))
      /*
       * A row whose answers are all blank would be a question nobody can pass.
       * The `answers <> ''` above catches an empty column; this catches one
       * holding only whitespace, which the ACP refuses but a hand-edited
       * database does not.
       */
      .filter((question) => question.answers.length > 0)
  }

  /** Everything, for the editor. Disabled rows included. */
  async list(): Promise<readonly CaptchaQuestionRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, question, answers, enabled from captcha_questions order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      question: String(row.question),
      answers: splitAnswers(String(row.answers)),
      enabled: row.enabled === true,
    }))
  }

  async create(input: { readonly question: string; readonly answers: string }): Promise<number> {
    assertUsable(input.question, input.answers)

    const rows = resultRows(
      await this.db.execute(sql`
        insert into captcha_questions (question, answers)
        values (${input.question.trim()}, ${input.answers})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  async update(
    id: number,
    input: { readonly question: string; readonly answers: string; readonly enabled: boolean },
  ): Promise<void> {
    assertUsable(input.question, input.answers)

    const rows = resultRows(
      await this.db.execute(sql`
        update captcha_questions
           set question = ${input.question.trim()}, answers = ${input.answers},
               enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such question.')
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from captcha_questions where id = ${id}`)
  }
}

/**
 * Refuse a question nobody could pass.
 *
 * On the way in, because the failure it prevents is silent and total: a
 * question with no answers is asked of every visitor and refuses all of them,
 * and the symptom is registration stopping on a board whose operator changed
 * something unrelated-looking. The reader degrades around such a row (see
 * `active`); this is what stops one being written.
 */
function assertUsable(question: string, answers: string): void {
  if (question.trim() === '') throw new ValidationError('A question needs to be asked.')
  if (splitAnswers(answers).length === 0) {
    throw new ValidationError('A question needs at least one answer, one per line.')
  }
}
