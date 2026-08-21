import { sql } from 'drizzle-orm'

import type {
  NewPoll,
  Poll,
  PollRepository,
  ThreadRating,
  ThreadRatingRepository,
} from '@meith/polls'

import type { Database } from './client'
import { resultRows } from './result-rows'

function date(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value)
}

export class PostgresPollRepository implements PollRepository, ThreadRatingRepository {
  constructor(private readonly db: Database) {}

  async create(threadId: number, poll: NewPoll): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          insert into polls (thread_id, question, closes_at)
          values (${threadId}, ${poll.question}, ${poll.closesAt}) returning id
        `),
      ) as Array<{ id: number }>
      const id = rows[0]?.id
      if (id === undefined) throw new Error('Poll insert returned no row.')
      await tx.execute(sql`
        insert into poll_options (poll_id, label, display_order)
        values ${sql.join(
          poll.options.map((label, index) => sql`(${id}, ${label}, ${index})`),
          sql`, `,
        )}
      `)
    })
  }

  async find(threadId: number, voterUserId: number | null): Promise<Poll | null> {
    const polls = resultRows(
      await this.db.execute(sql`
        select id, question, closes_at from polls where thread_id = ${threadId}
      `),
    ) as Array<{
      id: number
      question: string
      closes_at: Date | string | null
    }>
    const poll = polls[0]
    if (poll === undefined) return null

    const [options, votes] = await Promise.all([
      this.db.execute(sql`
        select id, label, vote_count from poll_options
         where poll_id = ${poll.id} order by display_order, id
      `),
      voterUserId === null
        ? Promise.resolve([])
        : this.db.execute(sql`
            select option_id from poll_votes where poll_id = ${poll.id} and user_id = ${voterUserId}
          `),
    ])
    const voteRows = resultRows(votes) as Array<{ option_id: number }>
    return {
      id: Number(poll.id),
      threadId,
      question: poll.question,
      closesAt: date(poll.closes_at),
      options: (
        resultRows(options) as Array<{
          id: number
          label: string
          vote_count: number
        }>
      ).map((row) => ({
        id: Number(row.id),
        label: row.label,
        votes: Number(row.vote_count),
      })),
      votedOptionId: voteRows[0] === undefined ? null : Number(voteRows[0].option_id),
    }
  }

  async vote(input: {
    readonly threadId: number
    readonly pollId: number
    readonly optionId: number
    readonly userId: number
  }): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        with vote as (
          insert into poll_votes (poll_id, user_id, option_id)
          select p.id, ${input.userId}, o.id
            from polls p join poll_options o on o.poll_id = p.id
           where p.id = ${input.pollId} and p.thread_id = ${input.threadId}
             and o.id = ${input.optionId}
             and (p.closes_at is null or p.closes_at > now())
          on conflict (poll_id, user_id) do nothing
          returning poll_id, option_id
        )
        update poll_options o set vote_count = o.vote_count + 1
          from vote where o.poll_id = vote.poll_id and o.id = vote.option_id
        returning o.id
      `),
    )
    return rows.length === 1
  }

  async rate(input: {
    readonly threadId: number
    readonly userId: number
    readonly rating: number
  }): Promise<ThreadRating | null> {
    return this.db.transaction(async (tx) => {
      const locked = resultRows(
        await tx.execute(sql`select id from threads where id = ${input.threadId} for update`),
      )
      if (locked.length === 0) return null
      const previous = resultRows(
        await tx.execute(sql`
          select rating from thread_ratings where thread_id = ${input.threadId} and user_id = ${input.userId}
        `),
      ) as Array<{ rating: number }>
      await tx.execute(sql`
        insert into thread_ratings (thread_id, user_id, rating, updated_at)
        values (${input.threadId}, ${input.userId}, ${input.rating}, now())
        on conflict (thread_id, user_id) do update set rating = excluded.rating, updated_at = excluded.updated_at
      `)
      const prior = Number(previous[0]?.rating ?? 0)
      const rows = resultRows(
        await tx.execute(sql`
          update threads set rating_total = rating_total + ${input.rating - prior},
                             rating_count = rating_count + ${previous.length === 0 ? 1 : 0}
           where id = ${input.threadId}
           returning rating_total, rating_count
        `),
      ) as Array<{ rating_total: number; rating_count: number }>
      const row = rows[0]!
      return {
        average: Number(row.rating_total) / Number(row.rating_count),
        count: Number(row.rating_count),
        mine: input.rating,
      }
    })
  }

  async findRating(threadId: number, userId: number | null): Promise<ThreadRating | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select t.rating_total, t.rating_count, r.rating as mine
          from threads t left join thread_ratings r on r.thread_id = t.id and r.user_id = ${userId}
         where t.id = ${threadId}
      `),
    ) as Array<{
      rating_total: number
      rating_count: number
      mine: number | null
    }>
    const row = rows[0]
    if (row === undefined) return null
    return {
      average: row.rating_count === 0 ? 0 : Number(row.rating_total) / Number(row.rating_count),
      count: Number(row.rating_count),
      mine: row.mine === null ? null : Number(row.mine),
    }
  }
}
