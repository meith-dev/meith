/**
 * F41 — persisting an edit, a soft delete, and a restore.
 *
 * One transaction each, for the reason F39 established: a revision that exists
 * without the edit it describes, or a post marked deleted whose counters still
 * count it, is a board that needs a human to reconcile it. The revision, the
 * post, every counter and the event all commit together or none of them do.
 */
import { sql } from 'drizzle-orm'

import { renderBBCode, vocabularyOptions } from '@meith/bbcode'
import type {
  PostEditRecord,
  PostEditTarget,
  PostVisibilityRecord,
  PostWriteRepository,
} from '@meith/posts'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { searchVectorSql } from './search-repo'
import { readBoardVocabulary } from './vocabulary-repo'
import { applyVisibilityChangeCounters } from './visibility-counters'

/**
 * Whether a state counts towards the board's totals.
 *
 * The single definition D41 insisted on: every counter on the board means
 * *visible* content. Both `unapproved` and `deleted` are outside it, which is
 * why moving between those two moves nothing.
 */
function isCounted(visibility: string): boolean {
  return visibility === 'visible'
}

export class PostgresPostWriteRepository implements PostWriteRepository {
  constructor(private readonly db: Database) {}

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
    /* F71. Read outside the transaction; see `thread-writes.ts` for why. */
    const vocabulary = await readBoardVocabulary(this.db)

    await this.db.transaction(async (tx) => {
      /*
       * The revision stores the body being *replaced*, so the current text
       * always lives on `posts` and reading a post never joins into history
       * (F28's shape). The unique key on (post_id, revision) is what turns a
       * doubled submit into a constraint failure rather than two rows claiming
       * to be revision 3.
       */
      await tx.execute(sql`
        insert into post_revisions
          (post_id, revision, message, subject, edited_by_user_id, edit_reason, created_at)
        values
          (${record.postId}, ${record.revision}, ${record.previousMessage},
           ${record.previousSubject}, ${record.editedByUserId}, ${record.reason},
           ${record.editedAt})
      `)

      /*
       * The render is rewritten with the message, in the same statement. F36's
       * backfill would eventually repair a miss, which is exactly why it must
       * not be relied on here: between the edit and the sweep every reader sees
       * the *old* body, because a current-version render is trusted.
       */
      const body = renderBBCode(record.message, vocabularyOptions(vocabulary))
      await tx.execute(sql`
        update posts
           set message = ${record.message},
               message_html = ${body.html},
               /*
                * F72: the indexed document is rewritten with the text, in the
                * same statement. An edit that changed the body and left the
                * vector alone would make the post findable by words it no
                * longer contains — and unfindable by the ones it does.
                */
               search_vector = ${searchVectorSql(sql`subject`, sql`${record.message}`)},
               render_version = ${body.version},
               vocab_version = ${vocabulary.revision},
               visibility = ${record.toVisibility},
               edited_at = ${record.editedAt},
               edited_by_user_id = ${record.editedByUserId},
               edit_reason = ${record.reason},
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
    })
  }

  async applyVisibility(record: PostVisibilityRecord): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      /*
       * The `where visibility = from` is the whole concurrency story. A double
       * submit, a stale form, or a second moderator acting at the same moment
       * updates no row — and because the counters hang off this result rather
       * than off the caller's intent, none of them can run twice.
       */
      const moved = await tx.execute(sql`
        update posts set visibility = ${record.to}
         where id = ${record.postId} and visibility = ${record.from}
         returning id
      `)
      if (resultRows(moved).length === 0) return false

      const delta = (isCounted(record.to) ? 1 : 0) - (isCounted(record.from) ? 1 : 0)
      /*
       * `unapproved → deleted` moves nothing: the post was never counted, so
       * subtracting would take a post off the board that was never on it. This
       * is the case a "deleting always decrements" implementation gets wrong,
       * and it is silent — the totals simply drift down over a busy queue.
       */
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

      return true
    })
  }
}
