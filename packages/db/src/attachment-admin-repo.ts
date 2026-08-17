import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { likeFragment } from './user-admin-repo'

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
  readonly filename?: string | undefined
  readonly status?: string | undefined
  readonly uploaderUserId?: number | undefined
  readonly beforeId?: number | undefined
  readonly offset?: number | undefined
  readonly limit: number
}

export interface AttachmentAdminPage {
  readonly rows: readonly AttachmentAdminRow[]
  readonly nextBeforeId: number | null
  /** How many attachments the filter matches, whichever page was asked for. */
  readonly total: number
}

export interface AttachmentTotals {
  readonly count: number
  readonly bytes: number
  readonly pending: number
  readonly failed: number
}

const STATUSES = new Set(['pending', 'ready', 'failed'])

export class PostgresAttachmentAdminRepository {
  constructor(private readonly db: Database) {}

  async list(filter: AttachmentAdminFilter): Promise<AttachmentAdminPage> {
    const conditions = [sql`true`]

    if (filter.filename !== undefined && filter.filename !== '') {
      conditions.push(sql`a.filename ilike ${`%${likeFragment(filter.filename)}%`} escape '\\'`)
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

    const [listed, counted] = await Promise.all([
      this.db.execute(sql`
        select a.id, a.post_id, a.filename, a.content_type, a.size_bytes, a.status,
               a.failure_reason, a.download_count, a.uploader_user_id, a.created_at,
               u.username as uploader_username, t.slug as thread_slug
          from attachments a
          left join users u on u.id = a.uploader_user_id
          left join posts p on p.id = a.post_id
          left join threads t on t.id = p.thread_id
         where ${where}
         order by a.id desc
         limit ${filter.limit + 1} offset ${filter.offset ?? 0}
      `),
      this.db.execute(sql`
        select count(*)::int as total from attachments a where ${where}
      `),
    ])

    const rows = resultRows(listed) as Array<Record<string, unknown>>

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

    const total = Number((resultRows(counted) as Array<Record<string, unknown>>)[0]?.total ?? 0)

    return {
      rows: page,
      nextBeforeId: rows.length > filter.limit ? (page[page.length - 1]?.id ?? null) : null,
      total,
    }
  }

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
      bytes: Number(row?.bytes ?? 0),
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
    }
  }

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

      const keys = [row.storage_key, row.source_key, row.thumbnail_key].filter(
        (key): key is string => typeof key === 'string' && key !== '',
      )

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
