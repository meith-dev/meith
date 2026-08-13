import { sql } from 'drizzle-orm'

import type { MemberProfileRecord, MemberProfileRepository } from '@meith/accounts'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { displayGroupIdSql } from './staff-groups'

interface RawProfile {
  id: number
  username: string
  title: string | null
  post_count: number
  created_at: Date
  last_active_at: Date | null
  location: string | null
  website: string | null
  bio: string | null
}

export class PostgresMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly db: Database) {}

  async findPublicById(id: number): Promise<MemberProfileRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, g.title, u.post_count, u.created_at,
               u.last_active_at, u.location, u.website, u.bio
          from users u
          join usergroups p
            on p.id = u.primary_group_id
          left join usergroups g
            on g.id = ${displayGroupIdSql('u', 'p')}
         where u.id = ${id} and u.state <> 'deleted'
         limit 1
      `),
    ) as RawProfile[]

    const row = rows[0]
    if (row === undefined) return null

    return {
      id: Number(row.id),
      username: row.username,
      title: row.title,
      postCount: Number(row.post_count),
      createdAt: new Date(row.created_at),
      lastActiveAt: row.last_active_at === null ? null : new Date(row.last_active_at),
      location: row.location,
      website: row.website,
      bio: row.bio,
    }
  }
}
