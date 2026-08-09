/**
 * F67 — merging one account into another.
 *
 * The roadmap's phrase is "correct reassignment on merge", and correctness here
 * has four parts that a naive `update … set user_id = winner` gets wrong.
 *
 * **Every column, including the denormalised ones.** Forty columns in this
 * schema point at a user; two of them (`threads.last_post_user_id`,
 * `forums.last_post_user_id`) are display caches with no foreign key at all.
 * Missing one leaves rows pointing at an account that no longer participates —
 * which raises no error and is noticed months later. The map is a declaration
 * in `user-merge-map.ts` and a test holds it against `information_schema`.
 *
 * **Credentials are destroyed, never moved.** A merge is not an authentication
 * event. Moving the loser's session row would hand the winner's account to
 * whoever holds that cookie.
 *
 * **A merge can create rows that were never possible.** `reputation` and
 * `user_relations` each have two user-shaped ends, and bringing the ends
 * together produces somebody who has rated themselves or put themselves on
 * their own ignore list — states the board's own validation refuses to create
 * and none of its readers expect. They are deleted rather than moved.
 *
 * **The unbounded table is chunked.** `posts` is the one table whose size is a
 * function of how long the board has existed rather than of one member's
 * settings, so authorship moves in bounded batches with a resumable cursor; the
 * rest is a member's own activity and fits in the finishing transaction.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { withPermissionVersionBump, type Tx } from './permission-version'
import { resultRows } from './result-rows'
import { BANNED_PREDICATE } from './user-admin-repo'
import {
  MERGE_DEDUPE,
  MERGE_DISCARD,
  MERGE_REASSIGN,
  MERGE_RENAME,
  type DedupeColumn,
} from './user-merge-map'

export interface MergePreview {
  readonly fromUsername: string
  readonly toUsername: string
  /** Posts still to move. The chunked part, and the only unbounded one. */
  readonly posts: number
  readonly threads: number
  readonly privateMessages: number
  readonly attachments: number
  /** True when either account is banned, which refuses the merge. */
  readonly blockedByBan: boolean
}

export interface MergeChunkResult {
  readonly moved: number
  /** Posts still owned by the losing account. */
  readonly remaining: number
}

export class PostgresUserMergeRepository {
  constructor(private readonly db: Database) {}

  /**
   * What a merge would touch.
   *
   * A count rather than a list: the point is scale — "this moves 9,000 posts"
   * tells an operator whether they are starting something that finishes in one
   * press — and a list of nine thousand posts would tell them nothing they can
   * read.
   */
  async preview(fromUserId: number, toUserId: number): Promise<MergePreview | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select
          (select username from users where id = ${fromUserId}) as from_username,
          (select username from users where id = ${toUserId}) as to_username,
          (select count(*) from posts where author_user_id = ${fromUserId})::int as posts,
          (select count(*) from threads where author_user_id = ${fromUserId})::int as threads,
          (select count(*) from private_messages where author_user_id = ${fromUserId})::int
            as private_messages,
          (select count(*) from attachments where uploader_user_id = ${fromUserId})::int
            as attachments,
          (select count(*) from users u
            where u.id in (${fromUserId}, ${toUserId})
              and ${BANNED_PREDICATE})::int as banned
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined || row.from_username === null || row.to_username === null) {
      return null
    }

    return {
      fromUsername: String(row.from_username),
      toUsername: String(row.to_username),
      posts: Number(row.posts),
      threads: Number(row.threads),
      privateMessages: Number(row.private_messages),
      attachments: Number(row.attachments),
      blockedByBan: Number(row.banned) > 0,
    }
  }

  /**
   * Move one batch of post authorship.
   *
   * Keyset-free on purpose: the predicate is "still owned by the loser", and
   * each batch removes rows from that set, so the next batch finds the next
   * ones without a cursor. That is only safe because the set shrinks
   * monotonically — which it does, since nothing in the system re-assigns a
   * post *to* the losing account while a merge is running.
   */
  async mergePostsChunk(
    fromUserId: number,
    toUserId: number,
    limit: number,
  ): Promise<MergeChunkResult> {
    assertDistinct(fromUserId, toUserId)

    const moved = resultRows(
      await this.db.execute(sql`
        update posts
           set author_user_id = ${toUserId}
         where id in (
           select id from posts where author_user_id = ${fromUserId} order by id limit ${limit}
         )
        returning id
      `),
    ) as Array<{ id: number }>

    const remaining = resultRows(
      await this.db.execute(
        sql`select count(*)::int as n from posts where author_user_id = ${fromUserId}`,
      ),
    ) as Array<{ n: number }>

    return { moved: moved.length, remaining: Number(remaining[0]?.n ?? 0) }
  }

  /**
   * Everything else, in one transaction.
   *
   * One transaction because the rest is bounded by a member's own activity and
   * because a half-applied merge is the worst of the three states: the loser
   * would own some of their history and not the rest, with no record of where
   * the boundary was.
   *
   * Refuses while posts remain, so the chunked stage cannot be skipped by a
   * caller who forgot to loop.
   */
  async finish(fromUserId: number, toUserId: number): Promise<void> {
    assertDistinct(fromUserId, toUserId)

    await withPermissionVersionBump(this.db, async (tx) => {
      const state = resultRows(
        await tx.execute(sql`
          select
            (select count(*) from users where id in (${fromUserId}, ${toUserId}))::int as found,
            (select count(*) from users u
              where u.id in (${fromUserId}, ${toUserId})
                and ${BANNED_PREDICATE})::int as banned,
            (select count(*) from posts where author_user_id = ${fromUserId})::int as posts
        `),
      ) as Array<Record<string, unknown>>

      const row = state[0] as Record<string, unknown>
      if (Number(row.found) !== 2) throw new ValidationError('No such member.')
      if (Number(row.banned) > 0) {
        /*
         * `bans.user_id` is reassigned like any other column, so merging a
         * banned account would carry its active ban onto the winner and lock
         * out an account nobody decided to ban. Lift it first, deliberately.
         */
        throw new ValidationError(
          'One of these accounts is banned. Lift the ban before merging.',
        )
      }
      if (Number(row.posts) > 0) {
        throw new ValidationError('There are still posts to move. Finish the run first.')
      }

      for (const entry of MERGE_DISCARD) {
        await tx.execute(sql`
          delete from ${sql.raw(entry.table)}
           where ${sql.raw(entry.column)} = ${fromUserId}
        `)
      }

      for (const entry of MERGE_DEDUPE) {
        await dedupeThenMove(tx, entry, fromUserId, toUserId)
      }

      await mergeBespoke(tx, fromUserId, toUserId)

      for (const entry of MERGE_REASSIGN) {
        await tx.execute(sql`
          update ${sql.raw(entry.table)}
             set ${sql.raw(entry.column)} = ${toUserId}
           where ${sql.raw(entry.column)} = ${fromUserId}
        `)
      }

      /*
       * The denormalised names, after the ids have moved. Reassigning the id
       * and stopping there leaves every post displaying the merged-away name,
       * with no foreign key and no error to say so — this is a *second* kind
       * of pointer, and the coverage test is what found it.
       */
      const winner = resultRows(
        await tx.execute(sql`select username from users where id = ${toUserId}`),
      ) as Array<{ username: string }>
      const username = winner[0]?.username
      if (username === undefined) throw new ValidationError('No such member.')

      for (const entry of MERGE_RENAME) {
        await tx.execute(sql`
          update ${sql.raw(entry.table)}
             set ${sql.raw(entry.column)} = ${username}
           where ${sql.raw(entry.idColumn)} = ${toUserId}
        `)
      }

      /*
       * Counters are added rather than recomputed. F38's recount is the
       * authority on these numbers and runs on its own schedule; adding gets
       * the display right immediately without this transaction scanning every
       * post the winner has ever made.
       */
      await tx.execute(sql`
        update users w
           set post_count = w.post_count + l.post_count,
               thread_count = w.thread_count + l.thread_count,
               reputation = w.reputation + l.reputation,
               updated_at = now()
          from users l
         where w.id = ${toUserId} and l.id = ${fromUserId}
      `)

      /*
       * The loser is soft-deleted rather than dropped. Its row is what any
       * column this map missed still points at — a deleted account renders as
       * "a former member", where a dangling id renders as a crash — and it is
       * the only evidence afterwards that the merge happened at all.
       */
      await tx.execute(sql`
        update users
           set deleted_at = now(), post_count = 0, thread_count = 0, reputation = 0,
               updated_at = now()
         where id = ${fromUserId}
      `)
    })
  }
}

function assertDistinct(fromUserId: number, toUserId: number): void {
  if (fromUserId === toUserId) {
    throw new ValidationError('Choose two different accounts.')
  }
}

/**
 * Drop the loser's row where the winner already has one, then move the rest.
 *
 * The winner keeps theirs, which is the choice that loses nothing the winner
 * did not already have: their read state, their subscription settings, their
 * notification preferences are the ones they have been living with.
 */
async function dedupeThenMove(
  tx: Tx,
  entry: DedupeColumn,
  fromUserId: number,
  toUserId: number,
): Promise<void> {
  const predicate = entry.where === undefined ? sql`` : sql` and ${sql.raw(entry.where)}`
  const matches = entry.keys.map(
    (key) => sql`loser.${sql.raw(key)} is not distinct from winner.${sql.raw(key)}`,
  )

  await tx.execute(sql`
    delete from ${sql.raw(entry.table)} loser
     where loser.${sql.raw(entry.column)} = ${fromUserId}${predicate}
       and exists (
         select 1 from ${sql.raw(entry.table)} winner
          where winner.${sql.raw(entry.column)} = ${toUserId}
            and ${sql.join(matches, sql` and `)}
       )
  `)

  await tx.execute(sql`
    update ${sql.raw(entry.table)}
       set ${sql.raw(entry.column)} = ${toUserId}
     where ${sql.raw(entry.column)} = ${fromUserId}
  `)
}

/**
 * The two-ended tables.
 *
 * `reputation` and `user_relations` both have a *giver* and a *subject*, and a
 * merge can bring the two ends onto the same account. What comes out is a row
 * the board cannot otherwise produce: a member who has rated themselves, or who
 * has put themselves on their own ignore list. Neither is representable in the
 * UI and neither is something any reader expects, so those rows are deleted
 * rather than moved — the alternative is a permanent, invisible inconsistency
 * that only shows up as a strange profile.
 *
 * Order matters: collapse the self-referencing rows *first*, then dedupe
 * against the winner's existing rows, then move the remainder. Doing it the
 * other way round moves a row into a self-reference and then fails to notice.
 */
async function mergeBespoke(tx: Tx, fromUserId: number, toUserId: number): Promise<void> {
  /* Ratings the loser gave the winner, or the winner gave the loser. */
  await tx.execute(sql`
    delete from reputation
     where (given_by_user_id = ${fromUserId} and user_id = ${toUserId})
        or (given_by_user_id = ${toUserId} and user_id = ${fromUserId})
        or (given_by_user_id = ${fromUserId} and user_id = ${fromUserId})
  `)

  /*
   * Duplicate ratings: the loser rated something the winner already rated. One
   * rating per person per target is the rule (F51), and the winner's stands.
   */
  await tx.execute(sql`
    delete from reputation loser
     where loser.given_by_user_id = ${fromUserId}
       and exists (
         select 1 from reputation winner
          where winner.given_by_user_id = ${toUserId}
            and winner.post_id is not distinct from loser.post_id
            and winner.user_id is not distinct from loser.user_id
       )
  `)
  await tx.execute(sql`
    update reputation set given_by_user_id = ${toUserId}
     where given_by_user_id = ${fromUserId}
  `)
  /*
   * The receiving end needs the same duplicate check: two profile ratings from
   * the same person, one to each account, collide once both are the winner's.
   */
  await tx.execute(sql`
    delete from reputation loser
     where loser.user_id = ${fromUserId}
       and exists (
         select 1 from reputation winner
          where winner.user_id = ${toUserId}
            and winner.given_by_user_id = loser.given_by_user_id
            and winner.post_id is not distinct from loser.post_id
       )
  `)
  await tx.execute(sql`
    update reputation set user_id = ${toUserId} where user_id = ${fromUserId}
  `)

  /* Relations between the two accounts collapse to nothing. */
  await tx.execute(sql`
    delete from user_relations
     where (user_id = ${fromUserId} and other_user_id = ${toUserId})
        or (user_id = ${toUserId} and other_user_id = ${fromUserId})
        or (user_id = ${fromUserId} and other_user_id = ${fromUserId})
  `)

  await tx.execute(sql`
    delete from user_relations loser
     where loser.user_id = ${fromUserId}
       and exists (
         select 1 from user_relations winner
          where winner.user_id = ${toUserId}
            and winner.other_user_id = loser.other_user_id
       )
  `)
  await tx.execute(sql`
    update user_relations set user_id = ${toUserId} where user_id = ${fromUserId}
  `)

  await tx.execute(sql`
    delete from user_relations loser
     where loser.other_user_id = ${fromUserId}
       and exists (
         select 1 from user_relations winner
          where winner.other_user_id = ${toUserId}
            and winner.user_id = loser.user_id
       )
  `)
  await tx.execute(sql`
    update user_relations set other_user_id = ${toUserId} where other_user_id = ${fromUserId}
  `)
}
