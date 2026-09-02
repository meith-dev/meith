import { sql } from 'drizzle-orm'

import {
  authorRef,
  BodyFormat,
  CORE_RENDERING,
  type MarkdownPipeline,
  renderThrough,
  vocabularyOptions,
} from '@meith/markdown'
import type {
  PostEditRecord,
  PostEditTarget,
  PostVisibilityRecord,
  PostWriteRepository,
} from '@meith/posts'

import type { Database } from './client'
import { resultRows } from './result-rows'
import {
  indexedSubjectSql,
  readSearchConfig,
  SEARCH_DOCUMENT_VERSION,
  searchVectorSql,
} from './search-repo'
import { logModeratorAction } from './thread-counters'
import { applyVisibilityChangeCounters } from './visibility-counters'
import { readBoardVocabulary } from './vocabulary-repo'

function isCounted(visibility: string): boolean {
  return visibility === 'visible'
}

function actedOnAnother(actorUserId: number, authorUserId: number | null): boolean {
  return authorUserId === null || actorUserId !== authorUserId
}

function scopedDetail(record: {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
}): Record<string, unknown> {
  return {
    postId: record.postId,
    threadId: record.threadId,
    forumId: record.forumId,
    forumIds: [record.forumId],
  }
}

export class PostgresPostWriteRepository implements PostWriteRepository {
  constructor(
    private readonly db: Database,
    private readonly rendering: MarkdownPipeline = CORE_RENDERING,
  ) {}

  async findEditTarget(threadId: number, postId: number): Promise<PostEditTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.thread_id, p.forum_id, p.author_user_id, p.subject, p.message,
               p.visibility, p.is_first_post, p.revision_count, p.created_at,
               t.slug as thread_slug, t.title as thread_title, t.is_locked,
               t.visibility as thread_visibility,
               f.slug as forum_slug, f.is_open
          from posts p
          join threads t on t.id = p.thread_id
          join forums f on f.id = p.forum_id
         where p.id = ${postId} and p.thread_id = ${threadId}
      `),
    ) as Array<{
      id: number
      thread_id: number
      forum_id: number
      author_user_id: number | null
      subject: string | null
      message: string
      visibility: 'visible' | 'unapproved' | 'deleted'
      is_first_post: boolean
      revision_count: number
      created_at: Date
      thread_slug: string
      thread_title: string
      is_locked: boolean
      thread_visibility: 'visible' | 'unapproved' | 'deleted'
      forum_slug: string
      is_open: boolean
    }>

    const row = rows[0]
    if (!row) return null

    return {
      post: {
        id: Number(row.id),
        threadId: Number(row.thread_id),
        forumId: Number(row.forum_id),
        authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
        subject: row.subject,
        message: row.message,
        visibility: row.visibility,
        isFirstPost: row.is_first_post,
        revisionCount: Number(row.revision_count),
        createdAt: new Date(row.created_at),
      },
      thread: {
        id: Number(row.thread_id),
        slug: row.thread_slug,
        title: row.thread_title,
        isLocked: row.is_locked,
        visibility: row.thread_visibility,
      },
      forum: { id: Number(row.forum_id), slug: row.forum_slug, isOpen: row.is_open },
    }
  }

  async applyEdit(record: PostEditRecord): Promise<void> {
    const vocabulary = await readBoardVocabulary(this.db, this.rendering)
    const body = await renderThrough(
      this.rendering,
      record.message,
      { source: 'post', viewer: authorRef(record.editedByUserId), postId: record.postId },
      vocabularyOptions(vocabulary),
    )
    const searchConfig = await readSearchConfig(this.db)

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into post_revisions
          (post_id, revision, message, subject, edited_by_user_id, edit_reason, created_at)
        values
          (${record.postId}, ${record.revision}, ${record.previousMessage},
           ${record.previousSubject}, ${record.editedByUserId}, ${record.reason},
           ${record.editedAt})
      `)

      const notice = record.silent
        ? sql``
        : sql`edited_at = ${record.editedAt},
              edited_by_user_id = ${record.editedByUserId},
              edit_reason = ${record.reason},`
      await tx.execute(sql`
        update posts p
           set message = ${record.message},
               message_html = ${body.html},
               /*
                * The indexed document is rewritten with the text, in the
                * same statement. An edit that changed the body and left the
                * vector alone would make the post findable by words it no
                * longer contains — and unfindable by the ones it does.
                *
                * Through indexedSubjectSql rather than off subject, which is
                * null for everything this board writes: reading the column
                * alone left the weight-A half of the document empty, so an
                * edited opening post lost the title an edit is supposed to
                * preserve. The alias is why the statement names "posts p".
                */
               search_vector = ${searchVectorSql(searchConfig, indexedSubjectSql(sql`p`), sql`${record.message}`)},
               search_version = ${SEARCH_DOCUMENT_VERSION},
               render_version = ${body.version},
               vocab_version = ${vocabulary.revision},
               /*
                * Named rather than left to the column default: an edit is the
                * one path that can turn a legacy row into a current one, and a
                * row whose text is now Markdown while its stamp still says
                * BBCode would be converted a second time by the backfill.
                */
               body_format = ${BodyFormat.Markdown},
               visibility = ${record.toVisibility},
               ${notice}
               revision_count = revision_count + 1
         where id = ${record.postId}
      `)

      const delta =
        (isCounted(record.toVisibility) ? 1 : 0) - (isCounted(record.fromVisibility) ? 1 : 0)
      if (delta !== 0) {
        await applyVisibilityChangeCounters(tx, {
          postId: record.postId,
          threadId: record.threadId,
          forumId: record.forumId,
          authorId: record.authorUserId,
          isFirstPost: record.isFirstPost,
          delta: delta as 1 | -1,
        })
      }

      if (actedOnAnother(record.editedByUserId, record.authorUserId)) {
        await logModeratorAction(
          tx,
          'post.edit',
          record.editedByUserId,
          scopedDetail(record),
          record.editedAt,
        )
      }

      if (record.toVisibility === 'visible') {
        await tx.execute(sql`
          insert into outbox (topic, payload)
          values (
            'post.edited',
            ${JSON.stringify({ postId: record.postId, threadId: record.threadId })}::jsonb
          )
        `)
      }
    })
  }

  async applyVisibility(record: PostVisibilityRecord): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const moved = await tx.execute(sql`
        update posts set visibility = ${record.to}
         where id = ${record.postId} and visibility = ${record.from}
         returning id
      `)
      if (resultRows(moved).length === 0) return false

      const delta = (isCounted(record.to) ? 1 : 0) - (isCounted(record.from) ? 1 : 0)
      if (delta !== 0) {
        await applyVisibilityChangeCounters(tx, {
          postId: record.postId,
          threadId: record.threadId,
          forumId: record.forumId,
          authorId: record.authorUserId,
          isFirstPost: record.isFirstPost,
          delta: delta as 1 | -1,
        })
      }

      if (actedOnAnother(record.actedByUserId, record.authorUserId)) {
        await logModeratorAction(
          tx,
          record.to === 'deleted' ? 'post.delete' : 'post.restore',
          record.actedByUserId,
          scopedDetail(record),
          record.at,
        )
      }

      if (record.to === 'deleted' && record.from === 'visible') {
        await tx.execute(sql`
          insert into outbox (topic, payload)
          values (
            'post.deleted',
            ${JSON.stringify({
              postId: record.postId,
              threadId: record.threadId,
              forumId: record.forumId,
            })}::jsonb
          )
        `)
      }

      return true
    })
  }
}
