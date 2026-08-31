import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { displayGroupIdSql } from './staff-groups'

export interface GroupIdentity {
  readonly groupId: number
  readonly title: string
  readonly nameColorLight: string | null
  readonly nameColorDark: string | null
  readonly badgeImageLight: string | null
  readonly badgeImageDark: string | null
}

export interface MemberStanding extends GroupIdentity {
  readonly reputation: number
  readonly groups: readonly GroupIdentity[]
}

function identityOf(row: Record<string, unknown>): GroupIdentity {
  return {
    groupId: Number(row.group_id),
    title: String(row.title),
    nameColorLight: row.name_color_light === null ? null : String(row.name_color_light),
    nameColorDark: row.name_color_dark === null ? null : String(row.name_color_dark),
    badgeImageLight: row.badge_image_light === null ? null : String(row.badge_image_light),
    badgeImageDark: row.badge_image_dark === null ? null : String(row.badge_image_dark),
  }
}

export class PostgresGroupIdentityRepository {
  constructor(private readonly db: Database) {}

  async forUsers(userIds: readonly number[]): Promise<ReadonlyMap<number, MemberStanding>> {
    if (userIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        select u.id as user_id,
               u.reputation,
               g.id as group_id,
               g.title,
               g.name_color_light,
               g.name_color_dark,
               g.badge_image_light,
               g.badge_image_dark,
               (g.id = ${displayGroupIdSql('u', 'p')}) as is_display
          from users u
          join usergroups p
            on p.id = u.primary_group_id
          join usergroups g
            on g.id = ${displayGroupIdSql('u', 'p')}
            or g.id = u.primary_group_id
            or g.id in (
              select m.group_id
                from user_group_memberships m
               where m.user_id = u.id
                 and (m.expires_at is null or m.expires_at > now())
            )
         where u.id in ${sql`(${sql.join(
           userIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
         order by u.id, is_display desc, g.display_order, g.title, g.id
      `),
    ) as Array<Record<string, unknown>>

    const byUser = new Map<number, { reputation: number; groups: GroupIdentity[] }>()

    for (const row of rows) {
      const userId = Number(row.user_id)
      let entry = byUser.get(userId)
      if (entry === undefined) {
        entry = { reputation: Number(row.reputation ?? 0), groups: [] }
        byUser.set(userId, entry)
      }
      entry.groups.push(identityOf(row))
    }

    const standings = new Map<number, MemberStanding>()
    for (const [userId, entry] of byUser) {
      const display = entry.groups[0]
      if (display === undefined) continue
      standings.set(userId, { ...display, reputation: entry.reputation, groups: entry.groups })
    }
    return standings
  }

  async styled(): Promise<readonly GroupIdentity[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id as group_id, title, name_color_light, name_color_dark,
               badge_image_light, badge_image_dark
          from usergroups
         where name_color_light is not null or name_color_dark is not null
         order by display_order, id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(identityOf)
  }
}
