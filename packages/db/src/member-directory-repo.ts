import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

export type MemberDirectorySort = 'name' | 'posts' | 'joined'

export interface MemberDirectoryRow {
  readonly id: number
  readonly username: string
  readonly postCount: number
  readonly createdAt: Date
}

export interface MemberDirectoryPage {
  readonly rows: readonly MemberDirectoryRow[]
  readonly total: number
}

export interface StaffGroupRow {
  readonly groupId: number
  readonly title: string
  readonly description: string | null
  readonly members: readonly { readonly id: number; readonly username: string }[]
}

const SORT_SQL: Readonly<Record<MemberDirectorySort, ReturnType<typeof sql.raw>>> = {
  name: sql.raw('u.username_lower asc, u.id asc'),
  posts: sql.raw('u.post_count desc, u.username_lower asc, u.id asc'),
  joined: sql.raw('u.created_at desc, u.id desc'),
}

export class PostgresMemberDirectoryRepository {
  constructor(private readonly db: Database) {}

  async page(input: {
    readonly offset: number
    readonly limit: number
    readonly sort: MemberDirectorySort
    readonly nameContains?: string
  }): Promise<MemberDirectoryPage> {
    const name = input.nameContains?.trim().toLowerCase() ?? ''
    const nameFilter =
      name === ''
        ? sql``
        : sql` and u.username_lower like ${`%${name.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`}`

    const counted = resultRows(
      await this.db.execute(sql`
        select count(*) as total
          from users u
         where u.state <> 'deleted'${nameFilter}
      `),
    ) as Array<Record<string, unknown>>

    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.post_count, u.created_at
          from users u
         where u.state <> 'deleted'${nameFilter}
         order by ${SORT_SQL[input.sort]}
         limit ${input.limit} offset ${input.offset}
      `),
    ) as Array<Record<string, unknown>>

    return {
      total: Number(counted[0]?.total ?? 0),
      rows: rows.map((row) => ({
        id: Number(row.id),
        username: String(row.username),
        postCount: Number(row.post_count ?? 0),
        createdAt: new Date(row.created_at as string),
      })),
    }
  }

  async staff(): Promise<readonly StaffGroupRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select g.id as group_id, g.title, g.description, u.id as user_id, u.username
          from usergroups g
          join users u
            on (u.primary_group_id = g.id
             or exists (
              select 1
                from user_group_memberships m
               where m.user_id = u.id
                 and m.group_id = g.id
                 and (m.expires_at is null or m.expires_at > now())
             ))
           and u.state <> 'deleted'
         where g.is_staff_group = true
         order by g.display_order, g.id, u.username_lower, u.id
      `),
    ) as Array<Record<string, unknown>>

    const groups = new Map<
      number,
      { title: string; description: string | null; members: { id: number; username: string }[] }
    >()

    for (const row of rows) {
      const groupId = Number(row.group_id)
      let entry = groups.get(groupId)
      if (entry === undefined) {
        entry = {
          title: String(row.title),
          description: row.description === null ? null : String(row.description),
          members: [],
        }
        groups.set(groupId, entry)
      }
      entry.members.push({ id: Number(row.user_id), username: String(row.username) })
    }

    return [...groups].map(([groupId, entry]) => ({ groupId, ...entry }))
  }
}
