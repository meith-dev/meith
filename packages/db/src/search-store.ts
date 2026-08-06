import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface StoredSearch {
  readonly id: number
  readonly token: string
  readonly userId: number | null
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: Readonly<Record<string, unknown>>
  readonly hitCount: number
  readonly createdAt: Date
}

export interface CreateSearchInput {
  readonly token: string
  readonly userId: number | null
  readonly sessionKey: string | null
  readonly terms: string
  readonly filters: Readonly<Record<string, unknown>>
  readonly floodSeconds: number
}

export class PostgresSearchStore {
  constructor(private readonly db: Database) {}

  async create(input: CreateSearchInput): Promise<StoredSearch | null> {
    const owner =
      input.userId !== null
        ? sql`user_id = ${input.userId}`
        : input.sessionKey !== null
          ? sql`session_key = ${input.sessionKey}`
          : sql`false`

    const rows = resultRows(
      await this.db.execute(sql`
        insert into searches (token, user_id, session_key, terms, filters)
        select ${input.token}, ${input.userId}, ${input.sessionKey}, ${input.terms},
               ${JSON.stringify(input.filters)}::jsonb
         where not exists (
              select 1 from searches
               where ${owner}
                 and created_at > now() - make_interval(secs => ${input.floodSeconds})
            )
        returning id, token, user_id, session_key, terms, filters, hit_count, created_at
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toStored(row)
  }

  async recordHitCount(id: number, hitCount: number): Promise<void> {
    await this.db.execute(sql`update searches set hit_count = ${hitCount} where id = ${id}`)
  }

  async findByToken(token: string): Promise<StoredSearch | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, token, user_id, session_key, terms, filters, hit_count, created_at
          from searches where token = ${token}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toStored(row)
  }

  async prune(olderThan: Date, limit = 5_000): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from searches
         where id in (
           select id from searches where created_at < ${olderThan} order by id limit ${limit}
         )
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }
}

export function ownsSearch(
  search: Pick<StoredSearch, 'userId' | 'sessionKey'>,
  viewer: { readonly userId: number | null; readonly sessionKey: string | null },
): boolean {
  if (search.userId !== null) return search.userId === viewer.userId
  if (search.sessionKey !== null) {
    return viewer.userId === null && search.sessionKey === viewer.sessionKey
  }
  return false
}

function toStored(row: Record<string, unknown>): StoredSearch {
  const filters = row.filters
  return {
    id: Number(row.id),
    token: String(row.token),
    userId: row.user_id === null ? null : Number(row.user_id),
    sessionKey: row.session_key === null ? null : String(row.session_key),
    terms: String(row.terms),
    filters:
      typeof filters === 'object' && filters !== null && !Array.isArray(filters)
        ? (filters as Record<string, unknown>)
        : {},
    hitCount: Number(row.hit_count),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }
}
