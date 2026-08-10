import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

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
               g.badge_image_dark
          from users u
          join usergroups g
            on g.id = coalesce(u.display_group_id, u.primary_group_id)
         where u.id in ${sql`(${sql.join(
           userIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
      `),
    ) as Array<Record<string, unknown>>

    return new Map(
      rows.map((row) => [
        Number(row.user_id),
        {
          groupId: Number(row.group_id),
          title: String(row.title),
          nameColorLight: row.name_color_light === null ? null : String(row.name_color_light),
          nameColorDark: row.name_color_dark === null ? null : String(row.name_color_dark),
          badgeImageLight: row.badge_image_light === null ? null : String(row.badge_image_light),
          badgeImageDark: row.badge_image_dark === null ? null : String(row.badge_image_dark),
          reputation: Number(row.reputation ?? 0),
        },
      ]),
    )
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

    return rows.map((row) => ({
      groupId: Number(row.group_id),
      title: String(row.title),
      nameColorLight: row.name_color_light === null ? null : String(row.name_color_light),
      nameColorDark: row.name_color_dark === null ? null : String(row.name_color_dark),
      badgeImageLight: row.badge_image_light === null ? null : String(row.badge_image_light),
      badgeImageDark: row.badge_image_dark === null ? null : String(row.badge_image_dark),
    }))
  }
}
