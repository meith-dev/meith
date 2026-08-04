/**
 * F61 — buddy and ignore lists over Postgres.
 *
 * The reads split by *who is asking*, and the split is what the two indexes
 * exist for:
 *
 *  - `list`, `count` and `ignoredIds` are "my list", keyed by `user_id`;
 *  - `ignores` is the reverse question — "does this recipient ignore the person
 *    writing to them" — which F60's send path asks per recipient and which
 *    would otherwise scan the table.
 *
 * `set` is an upsert on the primary key, which is what makes moving somebody
 * from the ignore list to the buddy list a single write rather than a delete
 * and an insert that can half happen.
 */
import { sql } from 'drizzle-orm'

import type { RelationKind, RelationRepository, RelationRow } from '@meith/relations'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** PGlite hands raw templates timestamps as strings; postgres.js hands Dates. */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function toNullableDate(value: string | Date | null): Date | null {
  return value === null ? null : toDate(value)
}

export class PostgresRelationRepository implements RelationRepository {
  constructor(private readonly db: Database) {}

  async list(input: {
    readonly userId: number
    readonly kind: RelationKind
  }): Promise<readonly RelationRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select r.other_user_id, r.kind, r.created_at, u.username, u.last_active_at
          from user_relations r
          join users u on u.id = r.other_user_id
         where r.user_id = ${input.userId}
           and r.kind = ${input.kind}
           /*
            * A deleted account is not on anybody's list. The row survives by
            * design — deleted_at is a tombstone, not a removal — but showing
            * a name the board no longer recognises anywhere else would be a
            * list somebody cannot act on.
            */
           and u.deleted_at is null
         order by u.username
      `),
    ) as Array<{
      other_user_id: number
      kind: string
      created_at: string | Date
      username: string
      last_active_at: string | Date | null
    }>

    return rows.map((row) => ({
      userId: Number(row.other_user_id),
      username: row.username,
      kind: row.kind as RelationKind,
      lastActiveAt: toNullableDate(row.last_active_at),
      createdAt: toDate(row.created_at),
    }))
  }

  async count(userId: number): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n from user_relations where user_id = ${userId}
      `),
    ) as Array<{ n: number }>

    return Number(rows[0]?.n ?? 0)
  }

  /**
   * The ids this member ignores.
   *
   * The one read here that happens on an ordinary page rather than a screen
   * somebody opened deliberately — every thread render needs it — so it returns
   * ids and nothing else, and it does not join `users`. Bounded by
   * `MAX_RELATIONS` and cached per request by the caller.
   */
  async ignoredIds(userId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select other_user_id from user_relations
         where user_id = ${userId} and kind = 'ignore'
      `),
    ) as Array<{ other_user_id: number }>

    return rows.map((row) => Number(row.other_user_id))
  }

  async set(input: {
    readonly userId: number
    readonly otherUserId: number
    readonly kind: RelationKind
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into user_relations (user_id, other_user_id, kind, created_at)
      values (${input.userId}, ${input.otherUserId}, ${input.kind}, ${input.at})
          on conflict (user_id, other_user_id)
          /*
           * The kind is replaced; created_at is not. "On my list since" is a
           * property of the relationship, not of the last time somebody changed
           * their mind about which list it belongs on.
           */
          do update set kind = excluded.kind
    `)
  }

  async remove(input: {
    readonly userId: number
    readonly otherUserId: number
  }): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from user_relations
         where user_id = ${input.userId} and other_user_id = ${input.otherUserId}
        returning user_id
      `),
    ) as Array<{ user_id: number }>

    return rows.length > 0
  }

  async ignores(ownerUserId: number, otherUserId: number): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        select 1 as hit from user_relations
         where user_id = ${ownerUserId}
           and other_user_id = ${otherUserId}
           and kind = 'ignore'
      `),
    ) as Array<{ hit: number }>

    return rows.length > 0
  }
}
