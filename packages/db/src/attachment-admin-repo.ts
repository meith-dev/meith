/**
 * F71 — the attachment listing, and the one decision it was waiting on.
 *
 * ## What deleting somebody else's upload does to the post showing it
 *
 * Nothing, and that is a property of F42's design rather than a choice made
 * here. An attachment is **listed beside** a post, never embedded in its body:
 * there is no `[attachment]` tag, so no stored render mentions one and no
 * message text has to be rewritten. Deleting a row removes an entry from a
 * list. The post keeps its text, its author, its position and its edit history.
 *
 * That is what makes a delete button defensible on a screen an operator uses to
 * clear space. The version of this feature that had to patch member-written
 * text to remove a reference is the version that could not be built safely, and
 * it is why this listing waited for a design where it does not arise.
 *
 * ## The bytes are orphaned, not deleted
 *
 * The row goes and its object keys go onto `attachment_orphans`, in the same
 * transaction. F42's hourly sweep collects them behind a grace period.
 *
 * Deleting the object inline would be the obvious alternative and is wrong in
 * both failure directions: an object-store call that fails after the row is
 * gone leaks bytes nothing can ever find again, and one that succeeds before a
 * transaction that then rolls back removes the file out from under a live row.
 * The ledger turns "which objects does nothing own" back into an indexed query,
 * which is what it was built for.
 */
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { likeFragment } from './user-admin-repo'
import { resultRows } from './result-rows'

export interface AttachmentAdminRow {
  readonly id: number
  readonly postId: number
  readonly threadSlug: string | null
  readonly filename: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly status: string
  readonly failureReason: string | null
  readonly downloadCount: number
  readonly uploaderUserId: number | null
  readonly uploaderUsername: string | null
  readonly createdAt: Date
}

export interface AttachmentAdminFilter {
  /** Matched against the sanitised filename, case-insensitively. */
  readonly filename?: string | undefined
  /** `pending | ready | failed`. Anything else is ignored rather than refused. */
  readonly status?: string | undefined
  readonly uploaderUserId?: number | undefined
  /** Keyset cursor: the last id of the previous page. */
  readonly beforeId?: number | undefined
  readonly limit: number
}

export interface AttachmentAdminPage {
  readonly rows: readonly AttachmentAdminRow[]
  /** The cursor for the next page, or `null` at the end. */
  readonly nextBeforeId: number | null
}

/** What the board is storing, for the top of the screen. */
export interface AttachmentTotals {
  readonly count: number
  readonly bytes: number
  readonly pending: number
  readonly failed: number
}

const STATUSES = new Set(['pending', 'ready', 'failed'])

export class PostgresAttachmentAdminRepository {
  constructor(private readonly db: Database) {}

  /**
   * One page, newest first.
   *
   * Keyset rather than OFFSET, for F67's reason: this screen deletes the rows
   * it is paging, so an offset would skip exactly the ones just acted on — the
   * page after a delete would be missing an item nobody removed.
   */
  async list(filter: AttachmentAdminFilter): Promise<AttachmentAdminPage> {
    const conditions = [sql`true`]

    if (filter.filename !== undefined && filter.filename !== '') {
      /*
       * Escaped before it reaches `like`, or an operator searching for a file
       * called `100%` matches every attachment on the board — the same trap
       * F67's member search documents, and the same helper.
       */
      conditions.push(
        sql`a.filename ilike ${`%${likeFragment(filter.filename)}%`} escape '\\'`,
      )
    }
    if (filter.status !== undefined && STATUSES.has(filter.status)) {
      conditions.push(sql`a.status = ${filter.status}`)
    }
    if (filter.uploaderUserId !== undefined) {
      conditions.push(sql`a.uploader_user_id = ${filter.uploaderUserId}`)
    }
    if (filter.beforeId !== undefined) {
      conditions.push(sql`a.id < ${filter.beforeId}`)
    }

    const where = sql.join(conditions, sql` and `)

    /* One row over the page, so "is there a next page" costs no second query. */
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.post_id, a.filename, a.content_type, a.size_bytes, a.status,
               a.failure_reason, a.download_count, a.uploader_user_id, a.created_at,
               u.username as uploader_username, t.slug as thread_slug
          from attachments a
          left join users u on u.id = a.uploader_user_id
          left join posts p on p.id = a.post_id
          left join threads t on t.id = p.thread_id
         where ${where}
         order by a.id desc
         limit ${filter.limit + 1}
      `),
    ) as Array<Record<string, unknown>>

    const page = rows.slice(0, filter.limit).map(
      (row): AttachmentAdminRow => ({
        id: Number(row.id),
        postId: Number(row.post_id),
        threadSlug: row.thread_slug === null ? null : String(row.thread_slug),
        filename: String(row.filename),
        contentType: String(row.content_type),
        sizeBytes: Number(row.size_bytes),
        status: String(row.status),
        failureReason: row.failure_reason === null ? null : String(row.failure_reason),
        downloadCount: Number(row.download_count),
        uploaderUserId: row.uploader_user_id === null ? null : Number(row.uploader_user_id),
        uploaderUsername: row.uploader_username === null ? null : String(row.uploader_username),
        createdAt: new Date(String(row.created_at)),
      }),
    )

    return {
      rows: page,
      nextBeforeId: rows.length > filter.limit ? (page[page.length - 1]?.id ?? null) : null,
    }
  }

  /**
   * What the board is holding.
   *
   * `pending` and `failed` are counted separately because they are the two an
   * operator can act on: a `pending` count that never falls means the re-encode
   * queue has stopped, and `failed` rows are bytes still on the store that no
   * download will ever serve.
   */
  async totals(): Promise<AttachmentTotals> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as count,
               coalesce(sum(size_bytes), 0)::bigint as bytes,
               count(*) filter (where status = 'pending')::int as pending,
               count(*) filter (where status = 'failed')::int as failed
          from attachments
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return {
      count: Number(row?.count ?? 0),
      /* `sum` of a bigint comes back as text on a board past 2^31 bytes. */
      bytes: Number(row?.bytes ?? 0),
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
    }
  }

  /**
   * Delete one attachment and hand its objects to the sweep.
   *
   * All three keys, and `thumbnail_key` is the one that would be missed: an
   * attachment that has been re-encoded owns a source, a stored object *and* a
   * thumbnail, and forgetting any of them leaks bytes that nothing will ever
   * look for again — F42's ledger exists precisely because a bucket listing
   * cannot tell an orphan from an upload in flight.
   *
   * Returns `false` for an id that is not there, so a double submit is reported
   * as "already gone" rather than as a success that did nothing.
   */
  async delete(id: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          delete from attachments
           where id = ${id}
          returning storage_key, source_key, thumbnail_key
        `),
      ) as Array<Record<string, unknown>>

      const row = rows[0]
      if (row === undefined) return false

      const keys = [row.storage_key, row.source_key, row.thumbnail_key]
        .filter((key): key is string => typeof key === 'string' && key !== '')

      for (const key of keys) {
        await tx.execute(sql`
          insert into attachment_orphans (storage_key) values (${key})
          on conflict (storage_key) do nothing
        `)
      }

      return true
    })
  }
}
