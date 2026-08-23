import { type SQL, sql } from 'drizzle-orm'

import {
  POLL_CHOICES_UNLIMITED,
  POLL_VOTERS_SHOWN_MAX,
  type Poll,
  type PollEditPlan,
  type PollRepository,
  type PollVote,
  type PollVoter,
  type ThreadRating,
  type ThreadRatingRepository,
  type ValidatedPoll,
} from '@meith/polls'

import type { Database } from './client'
import { resultRows } from './result-rows'

function date(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value)
}

function ids(values: readonly number[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

export class PostgresPollRepository implements PollRepository, ThreadRatingRepository {
  constructor(private readonly db: Database) {}

  async create(threadId: number, poll: ValidatedPoll): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          insert into polls (thread_id, question, closes_at, max_options, allow_revote, public_votes)
          values (${threadId}, ${poll.question}, ${poll.closesAt}, ${poll.maxOptions},
                  ${poll.allowRevote}, ${poll.publicVotes}) returning id
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
        select id, question, closes_at, created_at, max_options, allow_revote, public_votes
          from polls where thread_id = ${threadId}
      `),
    ) as Array<{
      id: number
      question: string
      closes_at: Date | string | null
      created_at: Date | string
      max_options: number
      allow_revote: boolean
      public_votes: boolean
    }>
    const poll = polls[0]
    if (poll === undefined) return null

    const [options, votes, voters] = await Promise.all([
      this.db.execute(sql`
        select id, label, vote_count from poll_options
         where poll_id = ${poll.id} order by display_order, id
      `),
      voterUserId === null
        ? Promise.resolve([])
        : this.db.execute(sql`
            select option_id from poll_votes
             where poll_id = ${poll.id} and user_id = ${voterUserId}
          `),
      poll.public_votes ? this.voters(Number(poll.id)) : Promise.resolve(new Map()),
    ])
    const voteRows = resultRows(votes) as Array<{ option_id: number }>
    const byOption = voters as Map<number, PollVoter[]>

    return {
      id: Number(poll.id),
      threadId,
      question: poll.question,
      closesAt: date(poll.closes_at),
      createdAt: date(poll.created_at) ?? new Date(0),
      maxOptions: Number(poll.max_options),
      allowRevote: poll.allow_revote === true,
      publicVotes: poll.public_votes === true,
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
        voters: byOption.get(Number(row.id)) ?? [],
      })),
      votedOptionIds: voteRows.map((row) => Number(row.option_id)),
    }
  }

  private async voters(pollId: number): Promise<Map<number, PollVoter[]>> {
    const rows = resultRows(
      await this.db.execute(sql`
        select o.id as option_id, v.user_id, u.username, v.created_at
          from poll_options o
          join lateral (
            select pv.user_id, pv.created_at from poll_votes pv
             where pv.poll_id = o.poll_id and pv.option_id = o.id
             order by pv.created_at, pv.user_id limit ${POLL_VOTERS_SHOWN_MAX}
          ) v on true
          join users u on u.id = v.user_id
         where o.poll_id = ${pollId}
         order by o.display_order, o.id, v.created_at, v.user_id
      `),
    ) as Array<{
      option_id: number
      user_id: number
      username: string
      created_at: Date | string | null
    }>

    const byOption = new Map<number, PollVoter[]>()
    for (const row of rows) {
      const optionId = Number(row.option_id)
      const list = byOption.get(optionId) ?? []
      list.push({
        userId: Number(row.user_id),
        username: row.username,
        votedAt: date(row.created_at),
      })
      byOption.set(optionId, list)
    }
    return byOption
  }

  async vote(input: PollVote): Promise<boolean> {
    const wanted = [...new Set(input.optionIds)]
    if (wanted.length === 0) return false

    return this.db.transaction(async (tx) => {
      const polls = resultRows(
        await tx.execute(sql`
          select id, max_options, allow_revote from polls
           where id = ${input.pollId} and thread_id = ${input.threadId}
             and (closes_at is null or closes_at > now())
           for update
        `),
      ) as Array<{ id: number; max_options: number; allow_revote: boolean }>
      const poll = polls[0]
      if (poll === undefined) return false

      const maxOptions = Number(poll.max_options)
      if (maxOptions !== POLL_CHOICES_UNLIMITED && wanted.length > maxOptions) return false

      const chosen = resultRows(
        await tx.execute(sql`
          select id from poll_options
           where poll_id = ${poll.id} and id in (${ids(wanted)})
        `),
      )
      if (chosen.length !== wanted.length) return false

      const previous = resultRows(
        await tx.execute(sql`
          select option_id from poll_votes
           where poll_id = ${poll.id} and user_id = ${input.userId}
        `),
      ) as Array<{ option_id: number }>

      if (previous.length > 0) {
        if (poll.allow_revote !== true) return false
        await tx.execute(sql`
          delete from poll_votes where poll_id = ${poll.id} and user_id = ${input.userId}
        `)
        await tx.execute(sql`
          update poll_options set vote_count = greatest(0, vote_count - 1)
           where poll_id = ${poll.id}
             and id in (${ids(previous.map((row) => Number(row.option_id)))})
        `)
      }

      await tx.execute(sql`
        insert into poll_votes (poll_id, user_id, option_id)
        values ${sql.join(
          wanted.map((optionId) => sql`(${poll.id}, ${input.userId}, ${optionId})`),
          sql`, `,
        )}
      `)
      await tx.execute(sql`
        update poll_options set vote_count = vote_count + 1
         where poll_id = ${poll.id} and id in (${ids(wanted)})
      `)
      return true
    })
  }

  async applyEdit(plan: PollEditPlan): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const polls = resultRows(
        await tx.execute(sql`
          select id, public_votes from polls where id = ${plan.pollId} for update
        `),
      ) as Array<{ id: number; public_votes: boolean }>
      const poll = polls[0]
      if (poll === undefined) return false

      const kept = plan.options.map((option) => option.id).filter((id): id is number => id !== null)
      const known = resultRows(
        await tx.execute(sql`
          select id from poll_options where poll_id = ${poll.id}
        `),
      ) as Array<{ id: number }>
      const existing = new Set(known.map((row) => Number(row.id)))
      if (kept.some((id) => !existing.has(id))) return false

      const cast = resultRows(
        await tx.execute(sql`
          select option_id from poll_votes where poll_id = ${poll.id}
        `),
      ) as Array<{ option_id: number }>

      const removed = [...existing].filter((id) => !kept.includes(id))
      if (removed.some((id) => cast.some((row) => Number(row.option_id) === id))) return false
      if (plan.publicVotes && poll.public_votes !== true && cast.length > 0) return false

      if (removed.length > 0) {
        await tx.execute(sql`
          delete from poll_options where poll_id = ${poll.id} and id in (${ids(removed)})
        `)
      }

      if (kept.length > 0) {
        await tx.execute(sql`
          update poll_options set display_order = -1 - display_order where poll_id = ${poll.id}
        `)
      }

      let order = 0
      for (const option of plan.options) {
        if (option.id === null) {
          await tx.execute(sql`
            insert into poll_options (poll_id, label, display_order)
            values (${poll.id}, ${option.label}, ${order})
          `)
        } else {
          await tx.execute(sql`
            update poll_options set label = ${option.label}, display_order = ${order}
             where poll_id = ${poll.id} and id = ${option.id}
          `)
        }
        order += 1
      }

      await tx.execute(sql`
        update polls set question = ${plan.question}, closes_at = ${plan.closesAt},
                         max_options = ${plan.maxOptions}, allow_revote = ${plan.allowRevote},
                         public_votes = ${plan.publicVotes}
         where id = ${poll.id}
      `)
      return true
    })
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
