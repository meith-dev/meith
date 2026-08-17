import { sql } from 'drizzle-orm'

import type {
  AttachmentForDownload,
  AttachmentRecord,
  AttachmentRepository,
  AttachmentStatus,
  CreateAttachmentInput,
  ReadyInput,
} from '@meith/attachments'

import type { Database } from './client'
import { forgetOrphanKeys, rememberOrphanKey } from './orphan-keys'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

interface RawAttachment {
  id: number
  post_id: number
  forum_id: number
  uploader_user_id: number | null
  filename: string
  content_type: string
  size_bytes: number
  storage_key: string | null
  source_key: string | null
  thumbnail_key: string | null
  width: number | null
  height: number | null
  status: string
  failure_reason: string | null
  download_count: number
  created_at: string | Date
}

const COLUMNS = sql`
  id, post_id, forum_id, uploader_user_id, filename, content_type, size_bytes,
  storage_key, source_key, thumbnail_key, width, height, status,
  failure_reason, download_count, created_at
`

function toRecord(row: RawAttachment): AttachmentRecord {
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    forumId: Number(row.forum_id),
    uploaderUserId: row.uploader_user_id === null ? null : Number(row.uploader_user_id),
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    sourceKey: row.source_key,
    thumbnailKey: row.thumbnail_key,
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    status: (['pending', 'ready', 'failed'] as const).includes(row.status as AttachmentStatus)
      ? (row.status as AttachmentStatus)
      : 'failed',
    failureReason: row.failure_reason,
    downloadCount: Number(row.download_count),
    createdAt: toDate(row.created_at),
  }
}

export class PostgresAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateAttachmentInput): Promise<AttachmentRecord> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into attachments
               (post_id, forum_id, uploader_user_id, filename, content_type,
                size_bytes, storage_key, source_key, status, ready_at)
        values (${input.postId}, ${input.forumId}, ${input.uploaderUserId},
                ${input.filename}, ${input.contentType}, ${input.sizeBytes},
                ${input.storageKey}, ${input.sourceKey}, ${input.status},
                ${input.status === 'ready' ? sql`now()` : sql`null`})
        returning ${COLUMNS}
      `),
    ) as RawAttachment[]

    if (rows[0] === undefined) throw new Error('Attachment insert returned no row')
    return toRecord(rows[0])
  }

  async findById(id: number): Promise<AttachmentRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`select ${COLUMNS} from attachments where id = ${id}`),
    ) as RawAttachment[]
    return rows[0] === undefined ? null : toRecord(rows[0])
  }

  async findForDownload(id: number): Promise<AttachmentForDownload | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.post_id, a.forum_id, a.uploader_user_id, a.filename,
               a.content_type, a.size_bytes, a.storage_key, a.source_key,
               a.thumbnail_key, a.width, a.height, a.status, a.failure_reason,
               a.download_count, a.created_at,
               p.visibility as post_visibility, t.visibility as thread_visibility,
               t.author_user_id as thread_author_user_id
          from attachments a
          join posts p on p.id = a.post_id
          join threads t on t.id = p.thread_id
         where a.id = ${id}
      `),
    ) as Array<
      RawAttachment & {
        post_visibility: string
        thread_visibility: string
        thread_author_user_id: number | null
      }
    >

    const row = rows[0]
    if (row === undefined) return null
    return {
      record: toRecord(row),
      postVisibility: row.post_visibility,
      threadVisibility: row.thread_visibility,
      threadAuthorUserId:
        row.thread_author_user_id === null ? null : Number(row.thread_author_user_id),
    }
  }

  async listForPosts(postIds: readonly number[]): Promise<readonly AttachmentRecord[]> {
    if (postIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS} from attachments
         where post_id in ${sql`(${sql.join(
           postIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
         order by post_id, id
      `),
    ) as RawAttachment[]

    return rows.map(toRecord)
  }

  async countForPost(postId: number): Promise<number> {
    const rows = resultRows(
      await this.db.execute(
        sql`select count(*)::int as n from attachments where post_id = ${postId}`,
      ),
    ) as Array<{ n: number }>
    return Number(rows[0]?.n ?? 0)
  }

  async markReady(id: number, input: ReadyInput): Promise<void> {
    await this.db.execute(sql`
      update attachments
         set storage_key = ${input.storageKey},
             thumbnail_key = ${input.thumbnailKey},
             width = ${input.width},
             height = ${input.height},
             size_bytes = ${input.sizeBytes},
             source_key = null,
             status = 'ready',
             ready_at = now()
       where id = ${id} and status = 'pending'
    `)
  }

  async markFailed(id: number, reason: string): Promise<void> {
    await this.db.execute(sql`
      update attachments
         set status = 'failed', failure_reason = ${reason}, source_key = null
       where id = ${id} and status = 'pending'
    `)
  }

  async recordDownload(id: number): Promise<void> {
    await this.db.execute(sql`
      update attachments set download_count = download_count + 1 where id = ${id}
    `)
  }

  async stalled(before: Date, limit: number): Promise<readonly AttachmentRecord[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS} from attachments
         where status = 'pending' and created_at < ${before}
         order by created_at
         limit ${limit}
      `),
    ) as RawAttachment[]
    return rows.map(toRecord)
  }

  async rememberKey(key: string): Promise<void> {
    await rememberOrphanKey(this.db, key)
  }

  async forgetKeys(keys: readonly string[]): Promise<void> {
    await forgetOrphanKeys(this.db, keys)
  }

  async staleKeys(before: Date, limit: number): Promise<readonly string[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select storage_key from attachment_orphans
         where created_at < ${before}
         order by created_at
         limit ${limit}
      `),
    ) as Array<{ storage_key: string }>
    return rows.map((row) => row.storage_key)
  }
}
