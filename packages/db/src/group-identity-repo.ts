/**
 * Which group a member is *shown* as, and what that group looks like.
 *
 * ## The column this finally reads
 *
 * `users.display_group_id` has been in the schema since the initial migration,
 * documented as "the group whose badge/title is shown. Separate from primary
 * because a user may be promoted for permissions while keeping a cosmetic
 * title." The admin panel writes it, the importer writes it, the seeds write
 * it, and until now nothing read it — so every board's cosmetic titles were
 * stored and invisible.
 *
 * The fallback is the primary group, which is `not null`, so every member
 * resolves to exactly one group and no caller has to handle a hole.
 *
 * ## Why it is a batch
 *
 * A thread page shows twenty posts by up to twenty people, a community listing
 * shows a last-poster per row, and the online list shows everyone. Resolving
 * this per name would be the classic N+1 on the board's two hottest pages. One
 * query per render, keyed by the ids the page already has.
 *
 * It deliberately returns *presentation*, not permissions. Nothing here decides
 * what anybody may do — `@meith/authorization` owns that, and a group's colour
 * has no business being read on the same path as its rights (R4).
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** One group's visual identity, as a page needs it. */
export interface GroupIdentity {
  readonly groupId: number
  readonly title: string
  /** CSS colours as stored, or null for "no colour in that scheme". */
  readonly nameColorLight: string | null
  readonly nameColorDark: string | null
  /** File-store keys, or null. Turned into URLs by the app. */
  readonly badgeImageLight: string | null
  readonly badgeImageDark: string | null
}

/** A member's group, plus the counter that sits beside it in a postbit. */
export interface MemberStanding extends GroupIdentity {
  /**
   * `users.reputation`, the denormalised counter F62 maintains.
   *
   * Carried here because this query already joins `users` for the group — the
   * alternative is a second read for a number that is sitting in the row.
   */
  readonly reputation: number
}

export class PostgresGroupIdentityRepository {
  constructor(private readonly db: Database) {}

  /**
   * The display group for each of these members.
   *
   * Ids absent from the result are members who do not exist — a deleted account
   * whose posts remain, which every caller already handles by falling back to
   * the username alone.
   */
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

  /**
   * Every group that has a colour or a badge.
   *
   * For the stylesheet, which needs one rule per coloured group and nothing at
   * all for the rest — most boards colour two or three groups out of seven, and
   * a rule per group regardless would put six dead declarations in every page.
   */
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
