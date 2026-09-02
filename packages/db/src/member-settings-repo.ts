import { sql } from 'drizzle-orm'

import type { MemberGroupChoice, MemberSettings, MemberSettingsRepository } from '@meith/accounts'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { isStaffGroupSql } from './staff-groups'

interface RawSettings {
  id: number
  email: string
  timezone: string
  locale: string
  posts_per_page: number | null
  threads_per_page: number | null
  invisible: boolean
  location: string | null
  website: string | null
  bio: string | null
  display_group_id: number | null
  mass_mail_opt_in_at: Date | string | null
  board_digest_cadence: string
}

interface RawGroupChoice {
  id: number
  title: string
  is_primary: boolean
  is_staff: boolean
}

export class PostgresMemberSettingsRepository implements MemberSettingsRepository {
  constructor(private readonly db: Database) {}

  async read(userId: number): Promise<MemberSettings | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, email, timezone, locale, posts_per_page, threads_per_page,
               invisible, location, website, bio, display_group_id,
               mass_mail_opt_in_at, board_digest_cadence
          from users
         where id = ${userId} and state <> 'deleted'
      `),
    ) as RawSettings[]

    const row = rows[0]
    if (row === undefined) return null

    return {
      userId: Number(row.id),
      email: row.email,
      timezone: row.timezone,
      locale: row.locale,
      postsPerPage: row.posts_per_page === null ? null : Number(row.posts_per_page),
      threadsPerPage: row.threads_per_page === null ? null : Number(row.threads_per_page),
      invisible: row.invisible === true,
      location: row.location,
      website: row.website,
      bio: row.bio,
      displayGroupId: row.display_group_id === null ? null : Number(row.display_group_id),
      massMailOptInAt: row.mass_mail_opt_in_at === null ? null : new Date(row.mass_mail_opt_in_at),
      boardDigestCadence: row.board_digest_cadence,
    }
  }

  async groupsHeldBy(userId: number): Promise<readonly MemberGroupChoice[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select g.id, g.title, (g.id = u.primary_group_id) as is_primary,
               (${isStaffGroupSql('g')}) as is_staff
          from users u
          join usergroups g
            on g.id = u.primary_group_id
            or g.id in (
              select m.group_id
                from user_group_memberships m
               where m.user_id = u.id
                 and (m.expires_at is null or m.expires_at > now())
            )
         where u.id = ${userId} and u.state <> 'deleted'
         order by is_primary desc, g.display_order, g.title
      `),
    ) as RawGroupChoice[]

    return rows.map((row) => ({
      groupId: Number(row.id),
      title: row.title,
      isPrimary: row.is_primary === true,
      isStaff: row.is_staff === true,
    }))
  }

  async saveDisplayGroup(input: {
    readonly userId: number
    readonly displayGroupId: number | null
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set display_group_id = ${input.displayGroupId},
             updated_at = now()
       where id = ${input.userId}
    `)
  }

  async saveProfile(input: {
    readonly userId: number
    readonly location: string | null
    readonly website: string | null
    readonly bio: string | null
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set location = ${input.location},
             website = ${input.website},
             bio = ${input.bio},
             updated_at = now()
       where id = ${input.userId}
    `)
  }

  async saveOptions(input: {
    readonly userId: number
    readonly timezone: string
    readonly locale: string
    readonly postsPerPage: number | null
    readonly threadsPerPage: number | null
    readonly invisible: boolean
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set timezone = ${input.timezone},
             locale = ${input.locale},
             posts_per_page = ${input.postsPerPage},
             threads_per_page = ${input.threadsPerPage},
             invisible = ${input.invisible},
             updated_at = now()
       where id = ${input.userId}
    `)
  }

  async saveMassMailOptIn(input: {
    readonly userId: number
    readonly optIn: boolean
  }): Promise<void> {
    const consent = input.optIn ? sql`coalesce(mass_mail_opt_in_at, now())` : sql`null`

    await this.db.execute(sql`
      update users
         set mass_mail_opt_in_at = ${consent},
             updated_at = now()
       where id = ${input.userId} and state <> 'deleted'
    `)
  }

  async saveBoardDigestCadence(input: {
    readonly userId: number
    readonly cadence: string
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set board_digest_cadence = ${input.cadence},
             updated_at = now()
       where id = ${input.userId} and state <> 'deleted'
    `)
  }

  async adoptEmail(input: {
    readonly userId: number
    readonly email: string
    readonly emailLower: string
  }): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        update users u
           set email = ${input.email},
               email_lower = ${input.emailLower},
               email_verified_at = now(),
               updated_at = now()
         where u.id = ${input.userId}
           and u.state <> 'deleted'
           and not exists (
             select 1 from users other
              where other.email_lower = ${input.emailLower} and other.id <> u.id
           )
        returning u.id
      `),
    ) as Array<{ id: number }>

    return rows.length > 0
  }
}
