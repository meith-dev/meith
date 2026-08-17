import { sql } from 'drizzle-orm'

import type { RelationKind, RelationRepository, RelationRow } from '@meith/relations'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate, toNullableDate } from './row-values'

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

  async remove(input: { readonly userId: number; readonly otherUserId: number }): Promise<boolean> {
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
