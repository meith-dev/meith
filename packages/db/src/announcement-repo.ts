/**
 * F71 — announcements: the read the board does, and the four writes the panel
 * makes.
 *
 * ## The read is permission-filtered in SQL, like every other listing here
 *
 * `live()` takes the viewer's visible forum ids and puts them in the `where`.
 * The alternative — read them all and drop the ones the viewer cannot see —
 * would be a filter in application code over rows the database already handed
 * over, which is the shape R4 forbids and F47 exists to prevent. An
 * announcement on a private forum must not reach the process that renders a
 * guest's page.
 *
 * A board-wide announcement (`forum_id is null`) is visible to anybody who can
 * see the board. That is what board-wide means, and it is why the predicate is
 * an `or` rather than a lookup with a special case for null.
 *
 * ## "Live" is three conditions and all three are in the query
 *
 * Switched on, started, and not yet ended. Evaluating any of them in the caller
 * would mean a screen that forgot one — and the one that gets forgotten is
 * `ends_at`, because it is null on most rows and therefore right in every test
 * written from the happy path.
 */
import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface AnnouncementRow {
  readonly id: number
  /** `null` for a board-wide announcement. */
  readonly forumId: number | null
  readonly forumTitle: string | null
  readonly forumSlug: string | null
  readonly title: string
  /** BBCode source. Rendered by the caller — there is no stored render. */
  readonly message: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly enabled: boolean
  readonly createdAt: Date
}

export interface AnnouncementInput {
  readonly forumId: number | null
  readonly title: string
  readonly message: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly enabled: boolean
}

function toRow(row: Record<string, unknown>): AnnouncementRow {
  return {
    id: Number(row.id),
    forumId: row.forum_id === null ? null : Number(row.forum_id),
    forumTitle: row.forum_title === null || row.forum_title === undefined
      ? null
      : String(row.forum_title),
    forumSlug: row.forum_slug === null || row.forum_slug === undefined
      ? null
      : String(row.forum_slug),
    title: String(row.title),
    message: String(row.message),
    authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
    authorUsername: String(row.author_username),
    startsAt: new Date(String(row.starts_at)),
    endsAt: row.ends_at === null ? null : new Date(String(row.ends_at)),
    enabled: row.enabled === true,
    createdAt: new Date(String(row.created_at)),
  }
}

export class PostgresAnnouncementRepository {
  constructor(private readonly db: Database) {}

  /**
   * What this viewer should see right now, newest first.
   *
   * `scope` is the forum being looked at, or `null` on the board index. On a
   * forum page the viewer gets that forum's announcements **and** the
   * board-wide ones, which is what an announcement being board-wide means — the
   * alternative would hide the board's own notice on every page except the
   * index, which is the page fewest people arrive on.
   */
  async live(input: {
    readonly now: Date
    readonly visibleForumIds: readonly number[]
    readonly scope?: number | null
  }): Promise<readonly AnnouncementRow[]> {
    const scope = input.scope ?? null

    /*
     * An empty visible set still has to run: board-wide announcements do not
     * depend on it, and `= any('{}')` is false rather than an error, so the
     * query degrades to "board-wide only" without a branch.
     */
    const visible = sql`${sql.raw('ARRAY[')}${
      input.visibleForumIds.length === 0
        ? sql.raw('')
        : sql.join(input.visibleForumIds.map((id) => sql`${id}`), sql`, `)
    }${sql.raw(']::int[]')}`

    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         where a.enabled
           and a.starts_at <= ${input.now}
           and (a.ends_at is null or a.ends_at > ${input.now})
           and (
                 a.forum_id is null
                 or (a.forum_id = ${scope} and a.forum_id = any(${visible}))
               )
         order by a.starts_at desc, a.id desc
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRow)
  }

  /** Everything, for the panel. Expired and switched-off rows included. */
  async list(): Promise<readonly AnnouncementRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         order by a.starts_at desc, a.id desc
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRow)
  }

  async find(id: number): Promise<AnnouncementRow | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         where a.id = ${id}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toRow(row)
  }

  /**
   * Write one.
   *
   * The author's name is **captured in the insert**, from `users`, rather than
   * passed in by the caller. Two reasons and both are about the same failure:
   * the app would otherwise need a lookup it does not already have, and a
   * caller that got it wrong would put the wrong name on a board-wide notice
   * with nothing to check it against. Denormalised for the same reason
   * `posts.author_username` is — so a deleted administrator's announcement
   * still says who wrote it.
   */
  async create(
    input: AnnouncementInput & { readonly authorUserId: number | null },
  ): Promise<number> {
    assertValid(input)

    const rows = resultRows(
      await this.db.execute(sql`
        insert into announcements (forum_id, title, message, author_user_id,
                                   author_username, starts_at, ends_at, enabled)
        values (${input.forumId}, ${input.title}, ${input.message},
                ${input.authorUserId},
                coalesce((select username from users where id = ${input.authorUserId}), ''),
                ${input.startsAt}, ${input.endsAt}, ${input.enabled})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  /**
   * Edit one.
   *
   * The author is **not** rewritten. An announcement says who wrote it, and an
   * administrator fixing a typo in somebody else's notice should not become its
   * author — the same rule F50's post edit follows, where the editor is recorded
   * beside the author rather than replacing them.
   */
  async update(id: number, input: AnnouncementInput): Promise<void> {
    assertValid(input)

    const rows = resultRows(
      await this.db.execute(sql`
        update announcements
           set forum_id = ${input.forumId}, title = ${input.title},
               message = ${input.message}, starts_at = ${input.startsAt},
               ends_at = ${input.endsAt}, enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such announcement.')
  }

  /**
   * Delete one.
   *
   * A real delete, and safe for the reason the whole model exists: an
   * announcement is chrome rather than content, so nothing a member wrote hangs
   * off it. Deleting a sticky thread would take a conversation with it; this
   * takes a notice nobody replied to.
   */
  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from announcements where id = ${id}`)
  }
}

function assertValid(input: AnnouncementInput): void {
  if (input.title.trim() === '') throw new ValidationError('An announcement needs a title.')
  if (input.message.trim() === '') {
    throw new ValidationError('An announcement needs something in it.')
  }
  /*
   * Refused rather than silently swapped. A window that ends before it starts
   * is never live, so the alternative is an announcement an operator wrote,
   * saved successfully and never saw — with nothing anywhere saying why.
   */
  if (input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw new ValidationError('An announcement cannot finish before it starts.')
  }
}
