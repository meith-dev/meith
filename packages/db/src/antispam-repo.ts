import { sql } from 'drizzle-orm'

import type { CaptchaQuestion, RateLimitScope, RateLimitStore } from '@meith/antispam'
import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { Database } from './client'
import { resultRows } from './result-rows'

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

function splitAnswers(raw: string): readonly string[] {
  return raw
    .split('\n')
    .map((answer) => answer.trim())
    .filter((answer) => answer !== '')
}

export class PostgresCaptchaQuestionRepository {
  constructor(private readonly db: Database) {}

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
      .filter((question) => question.answers.length > 0)
  }

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

    if (rows[0] === undefined) throw new ValidationError(msg('error.db.such-question'))
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from captcha_questions where id = ${id}`)
  }
}

function assertUsable(question: string, answers: string): void {
  if (question.trim() === '') throw new ValidationError(msg('error.db.question-needs-asked'))
  if (splitAnswers(answers).length === 0) {
    throw new ValidationError(msg('error.db.question-needs-at-least-one'))
  }
}
