/**
 * F42 — attachments, over Postgres.
 *
 * Three things are worth reading.
 *
 * **`markReady` clears `source_key` in the same statement that sets
 * `storage_key`.** The two are the before and after of the re-encode, and a row
 * that briefly held both would be a row whose "which bytes does this serve"
 * answer depends on when you asked.
 *
 * **Every state transition is guarded in its `where`.** `markReady` only
 * touches a `pending` row; so does `markFailed`. The queue is at-least-once, so
 * a second delivery is expected rather than exceptional, and putting the guard
 * in the statement means no caller can forget it — the same argument as
 * `findLive` in `admin-session-repo.ts`.
 *
 * **`listForPosts` is one query for a whole page of posts.** The postbit asks
 * per post; answering per post would be an N+1 on the board's heaviest page.
 */
import { sql } from 'drizzle-orm'

import type {
  AttachmentForDownload,
  AttachmentRecord,
  AttachmentRepository,
  AttachmentStatus,
  CreateAttachmentInput,
  ReadyInput,
} from '@forum/attachments'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** PGlite hands raw templates timestamps as strings; postgres.js hands Dates. */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

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
    /*
     * Narrowed rather than asserted. The column is text and a row written by a
     * previous deploy could hold anything; an unknown status reads as `failed`,
     * which is the only safe default — it is the one value that serves nothing.
     */
    status: (['pending', 'ready', 'failed'] as const).includes(
      row.status as AttachmentStatus,
    )
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

    /* Unreachable: the insert returns a row or throws on a key index. */
    if (rows[0] === undefined) throw new Error('Attachment insert returned no row')
    return toRecord(rows[0])
  }

  async findById(id: number): Promise<AttachmentRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`select ${COLUMNS} from attachments where id = ${id}`),
    ) as RawAttachment[]
    return rows[0] === undefined ? null : toRecord(rows[0])
  }

  /**
   * A row and the visibility of the content it hangs from, in one read.
   *
   * Both are needed to authorise a download, and fetching them separately would
   * leave a window in which the post was deleted between the two checks. The
   * joins are inner: an attachment whose post or thread has gone is not
   * downloadable, and returning nothing is the same answer as "no such
   * attachment" — which is also what it should look like from outside.
   */
  async findForDownload(id: number): Promise<AttachmentForDownload | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.post_id, a.forum_id, a.uploader_user_id, a.filename,
               a.content_type, a.size_bytes, a.storage_key, a.source_key,
               a.thumbnail_key, a.width, a.height, a.status, a.failure_reason,
               a.download_count, a.created_at,
               p.visibility as post_visibility, t.visibility as thread_visibility
          from attachments a
          join posts p on p.id = a.post_id
          join threads t on t.id = p.thread_id
         where a.id = ${id}
      `),
    ) as Array<RawAttachment & { post_visibility: string; thread_visibility: string }>

    const row = rows[0]
    if (row === undefined) return null
    return {
      record: toRecord(row),
      postVisibility: row.post_visibility,
      threadVisibility: row.thread_visibility,
    }
  }

  /**
   * Every attachment on a page of posts, in one query.
   *
   * Ordered by post and then by id so the postbit renders them in the order
   * they were uploaded without sorting in JavaScript.
   */
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

  /**
   * Publish the re-encoded object.
   *
   * `source_key` goes to NULL here and nowhere else: the row stops pointing at
   * the uploaded bytes at the same instant it starts pointing at the safe ones.
   * The `status = 'pending'` guard makes a duplicate delivery a no-op.
   */
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

  /**
   * One more download.
   *
   * Deliberately not read-then-write: the counter is incremented in the
   * statement, so two concurrent downloads of the same file both count.
   */
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

  /**
   * Note a key before its object exists.
   *
   * `on conflict do nothing` because a retried upload may reuse a key it
   * already remembered, and a crash there would be a failed upload for a reason
   * that has nothing to do with the file.
   */
  async rememberKey(key: string): Promise<void> {
    await this.db.execute(sql`
      insert into attachment_orphans (storage_key) values (${key})
      on conflict (storage_key) do nothing
    `)
  }

  async forgetKeys(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    await this.db.execute(sql`
      delete from attachment_orphans
       where storage_key in ${sql`(${sql.join(
         keys.map((key) => sql`${key}`),
         sql`, `,
       )})`}
    `)
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
