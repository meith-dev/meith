import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { rewriteDenormalisedUsernames } from './denormalised-username'
import { withPermissionVersionBump, type Tx } from './permission-version'
import { resultRows } from './result-rows'
import { BANNED_PREDICATE } from './user-admin-repo'
import {
  MERGE_DEDUPE,
  MERGE_DISCARD,
  MERGE_REASSIGN,
  type DedupeColumn,
} from './user-merge-map'

export interface MergePreview {
  readonly fromUsername: string
  readonly toUsername: string
  readonly posts: number
  readonly threads: number
  readonly privateMessages: number
  readonly attachments: number
  readonly blockedByBan: boolean
}

export interface MergeChunkResult {
  readonly moved: number
  readonly remaining: number
}

export class PostgresUserMergeRepository {
  constructor(private readonly db: Database) {}

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

      const winner = resultRows(
        await tx.execute(sql`select username from users where id = ${toUserId}`),
      ) as Array<{ username: string }>
      const username = winner[0]?.username
      if (username === undefined) throw new ValidationError('No such member.')

      await rewriteDenormalisedUsernames(tx, toUserId, username)

      await tx.execute(sql`
        update users w
           set post_count = w.post_count + l.post_count,
               thread_count = w.thread_count + l.thread_count,
               reputation = w.reputation + l.reputation,
               updated_at = now()
          from users l
         where w.id = ${toUserId} and l.id = ${fromUserId}
      `)

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

async function mergeBespoke(tx: Tx, fromUserId: number, toUserId: number): Promise<void> {
  await tx.execute(sql`
    delete from reputation
     where (given_by_user_id = ${fromUserId} and user_id = ${toUserId})
        or (given_by_user_id = ${toUserId} and user_id = ${fromUserId})
        or (given_by_user_id = ${fromUserId} and user_id = ${fromUserId})
  `)

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
