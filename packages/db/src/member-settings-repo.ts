/**
 * F57 — a member's own settings over Postgres.
 *
 * Six columns on `users`, so every method here is one statement against one row
 * by primary key. The only decision worth stating is in `adoptEmail`.
 */
import { sql } from 'drizzle-orm'

import type { MemberSettings, MemberSettingsRepository } from '@meith/accounts'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface RawSettings {
  id: number
  email: string
  timezone: string
  posts_per_page: number | null
  threads_per_page: number | null
  invisible: boolean
  location: string | null
  website: string | null
  bio: string | null
}

export class PostgresMemberSettingsRepository implements MemberSettingsRepository {
  constructor(private readonly db: Database) {}

  /**
   * The settings row.
   *
   * A deleted account resolves to `null` rather than to its stored values: the
   * UserCP is a screen for somebody who exists, and every other read on this
   * board makes the same distinction (F33).
   */
  async read(userId: number): Promise<MemberSettings | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, email, timezone, posts_per_page, threads_per_page,
               invisible, location, website, bio
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
      postsPerPage: row.posts_per_page === null ? null : Number(row.posts_per_page),
      threadsPerPage: row.threads_per_page === null ? null : Number(row.threads_per_page),
      invisible: row.invisible === true,
      location: row.location,
      website: row.website,
      bio: row.bio,
    }
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
    readonly postsPerPage: number | null
    readonly threadsPerPage: number | null
    readonly invisible: boolean
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set timezone = ${input.timezone},
             posts_per_page = ${input.postsPerPage},
             threads_per_page = ${input.threadsPerPage},
             invisible = ${input.invisible},
             updated_at = now()
       where id = ${input.userId}
    `)
  }

  /**
   * Adopt a verified address, letting the unique index decide.
   *
   * An hour can pass between requesting the change and confirming it, so a
   * prior "is this taken" read answers a question about the past. The write is
   * guarded by `not exists` *and* by `users_email_lower_key` behind it: the
   * predicate gives a clean `false` in the ordinary case, and the index is what
   * makes two confirmations arriving together impossible to both satisfy.
   *
   * `email_verified_at` is stamped in the same statement. The address is
   * verified *by this very act* — the member followed a link sent to it — and
   * leaving the column behind would make a confirmed address look unconfirmed
   * to F18's activation logic.
   */
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
