import { sql } from 'drizzle-orm'

import { BodyFormat, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import type { NewPoll } from '@meith/polls'

import type {
  CreatedThread,
  ForumPostingTarget,
  NewReplyRecord,
  NewThreadRecord,
  ReplyTarget,
  ReplyWriteRepository,
  ThreadWriteRepository,
} from '@meith/threads'

import type { Database } from './client'
import { applyCreatedContentCounters } from './content-counters'
import { resultRows } from './result-rows'
import { SEARCH_DOCUMENT_VERSION, searchVectorSql } from './search-repo'
import { readBoardVocabulary } from './vocabulary-repo'

export class PostgresThreadWriteRepository
  implements ThreadWriteRepository, ReplyWriteRepository
{
  constructor(private readonly db: Database) {}

  async postingRules(forumId: number): Promise<ForumPostingTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, type, slug, is_open, allow_threads, allow_replies, allow_polls,
               requires_prefix, moderate_new_threads, moderate_new_posts
          from forums where id = ${forumId}
      `),
    ) as Array<{
      id: number
      type: 'category' | 'forum' | 'link'
      slug: string
      is_open: boolean
      allow_threads: boolean
      allow_replies: boolean
      allow_polls: boolean
      requires_prefix: boolean
      moderate_new_threads: boolean
      moderate_new_posts: boolean
    }>

    const row = rows[0]
    if (!row) return null

    return {
      id: Number(row.id),
      type: row.type,
      slug: row.slug,
      isOpen: row.is_open,
      allowThreads: row.allow_threads,
      allowReplies: row.allow_replies,
      allowPolls: row.allow_polls,
      requiresPrefix: row.requires_prefix,
      moderateNewThreads: row.moderate_new_threads,
      moderateNewPosts: row.moderate_new_posts,
    }
  }

  async create(record: NewThreadRecord): Promise<CreatedThread> {
    const vocabulary = await readBoardVocabulary(this.db)

    return this.db.transaction(async (tx) => {
      const threadRows = resultRows(
        await tx.execute(sql`
          insert into threads
            (forum_id, title, slug, prefix_id, author_user_id, author_username,
             visibility, last_post_at, created_at, updated_at)
          values
            (${record.forumId}, ${record.title}, ${record.slug}, ${record.prefixId},
             ${record.authorUserId}, ${record.authorUsername}, ${record.visibility},
             ${record.createdAt}, ${record.createdAt}, ${record.createdAt})
          returning id
        `),
      ) as Array<{ id: number }>
      const threadId = Number(threadRows[0]!.id)

      const body = renderMarkdown(record.message, vocabularyOptions(vocabulary))
      const postRows = resultRows(
        await tx.execute(sql`
          insert into posts
            (thread_id, forum_id, author_user_id, author_username, message,
             message_html, render_version, vocab_version, body_format, visibility,
             is_first_post, created_at, search_vector, search_version)
          values
            (${threadId}, ${record.forumId}, ${record.authorUserId},
             ${record.authorUsername}, ${record.message}, ${body.html},
             ${body.version}, ${vocabulary.revision}, ${BodyFormat.Markdown},
             ${record.visibility}, true,
             ${record.createdAt},
             /*
              * The **title** is the weight-A field, because this is the
              * thread's opening post and a thread's subject is its title. The
              * row cannot be read while it is being inserted, so the value is
              * passed rather than derived — and it is the same value
              * indexedSubjectSql would produce for this row (subject null,
              * is_first_post true), which search-repo.test.ts pins so the
              * writer and the backfill cannot drift apart.
              */
             ${searchVectorSql(sql`${record.title}`, sql`${record.message}`)},
             ${SEARCH_DOCUMENT_VERSION})
          returning id
        `),
      ) as Array<{ id: number }>
      const postId = Number(postRows[0]!.id)

      if (record.poll !== undefined)
        await createPoll(tx as Database, threadId, record.poll)

      if (record.visibility === 'visible') {
        await applyCreatedContentCounters(tx, {
          postId,
          threadId,
          forumId: record.forumId,
          authorId: record.authorUserId,
          authorUsername: record.authorUsername,
          threadTitle: record.title,
          createdAt: record.createdAt,
          isNewThread: true,
        })
      } else {
        await tx.execute(sql`
          update threads set first_post_id = ${postId} where id = ${threadId}
        `)
      }

      if (record.subscribe) {
        await tx.execute(sql`
          insert into thread_subscriptions (user_id, thread_id, mode, last_notified_post_id)
          values (${record.authorUserId}, ${threadId}, 'instant', ${postId})
          on conflict (user_id, thread_id) do nothing
        `)
      }

      return {
        threadId,
        postId,
        slug: record.slug,
        visibility: record.visibility,
      }
    })
  }

  async replyTarget(threadId: number): Promise<ReplyTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.slug, t.title, t.is_locked, t.visibility, t.last_post_id,
               t.reply_count,
               f.id as forum_id, f.type as forum_type, f.slug as forum_slug,
               f.is_open, f.allow_threads, f.allow_replies, f.allow_polls, f.requires_prefix,
               f.moderate_new_threads, f.moderate_new_posts
          from threads t
          join forums f on f.id = t.forum_id
         where t.id = ${threadId}
      `),
    ) as Array<{
      id: number
      slug: string
      title: string
      is_locked: boolean
      visibility: 'visible' | 'unapproved' | 'deleted'
      last_post_id: number | null
      reply_count: number
      forum_id: number
      forum_type: 'category' | 'forum' | 'link'
      forum_slug: string
      is_open: boolean
      allow_threads: boolean
      allow_replies: boolean
      allow_polls: boolean
      requires_prefix: boolean
      moderate_new_threads: boolean
      moderate_new_posts: boolean
    }>

    const row = rows[0]
    if (!row) return null

    return {
      threadId: Number(row.id),
      slug: row.slug,
      title: row.title,
      isLocked: row.is_locked,
      visibility: row.visibility,
      lastPostId: row.last_post_id === null ? null : Number(row.last_post_id),
      replyCount: Number(row.reply_count),
      forum: {
        id: Number(row.forum_id),
        type: row.forum_type,
        slug: row.forum_slug,
        isOpen: row.is_open,
        allowThreads: row.allow_threads,
        allowReplies: row.allow_replies,
        allowPolls: row.allow_polls,
        requiresPrefix: row.requires_prefix,
        moderateNewThreads: row.moderate_new_threads,
        moderateNewPosts: row.moderate_new_posts,
      },
    }
  }

  async createReply(record: NewReplyRecord): Promise<{ postId: number }> {
    const vocabulary = await readBoardVocabulary(this.db)

    return this.db.transaction(async (tx) => {
      const body = renderMarkdown(record.message, vocabularyOptions(vocabulary))
      const postRows = resultRows(
        await tx.execute(sql`
          insert into posts
            (thread_id, forum_id, author_user_id, author_username, message,
             message_html, render_version, vocab_version, body_format, visibility,
             is_first_post, created_at, search_vector, search_version)
          values
            (${record.threadId}, ${record.forumId}, ${record.authorUserId},
             ${record.authorUsername}, ${record.message}, ${body.html},
             ${body.version}, ${vocabulary.revision}, ${BodyFormat.Markdown},
             ${record.visibility}, false,
             ${record.createdAt},
             /*
              * No weight-A field, and that is the rule rather than an
              * omission: a reply has no subject of its own, and folding the
              * thread's title in here would make one title term match every
              * post in the thread — forty hits that are all the same thread,
              * where the opening post already stands for it.
              */
             ${searchVectorSql(sql`${null}`, sql`${record.message}`)},
             ${SEARCH_DOCUMENT_VERSION})
          returning id
        `),
      ) as Array<{ id: number }>
      const postId = Number(postRows[0]!.id)

      if (record.visibility === 'visible') {
        await applyCreatedContentCounters(tx, {
          postId,
          threadId: record.threadId,
          forumId: record.forumId,
          authorId: record.authorUserId,
          authorUsername: record.authorUsername,
          threadTitle: record.threadTitle,
          createdAt: record.createdAt,
          isNewThread: false,
        })
      }

      if (record.subscribe) {
        await tx.execute(sql`
          insert into thread_subscriptions (user_id, thread_id, mode, last_notified_post_id)
          values (${record.authorUserId}, ${record.threadId}, 'instant', ${postId})
          on conflict (user_id, thread_id) do nothing
        `)
      }

      return { postId }
    })
  }

  async lastPostAt(userId: number): Promise<Date | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select created_at from posts
         where author_user_id = ${userId} and visibility <> 'deleted'
         order by created_at desc
         limit 1
      `),
    ) as Array<{ created_at: Date }>

    const at = rows[0]?.created_at
    return at === undefined ? null : new Date(at)
  }

  async allowedPrefixIds(forumId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id
          from thread_prefixes p
          left join forums f on f.id = ${forumId}
         where p.forum_path_prefix is null
            or f.path = p.forum_path_prefix
            or f.path like p.forum_path_prefix || '.%'
         order by p.display_order, p.id
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }

  async listPrefixes(
    forumId: number,
  ): Promise<readonly { id: number; label: string; token: string | null }[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.label, p.token
          from thread_prefixes p
          left join forums f on f.id = ${forumId}
         where p.forum_path_prefix is null
            or f.path = p.forum_path_prefix
            or f.path like p.forum_path_prefix || '.%'
         order by p.display_order, p.id
      `),
    ) as Array<{ id: number; label: string; token: string | null }>

    return rows.map((row) => ({
      id: Number(row.id),
      label: row.label,
      token: row.token,
    }))
  }
}

async function createPoll(
  tx: Database,
  threadId: number,
  poll: NewPoll,
): Promise<void> {
  const rows = resultRows(
    await tx.execute(sql`
      insert into polls (thread_id, question, closes_at)
      values (${threadId}, ${poll.question}, ${poll.closesAt}) returning id
    `),
  ) as Array<{ id: number }>
  const pollId = rows[0]?.id
  if (pollId === undefined) throw new Error('Poll insert returned no row.')
  await tx.execute(sql`
    insert into poll_options (poll_id, label, display_order)
    values ${sql.join(
      poll.options.map((label, index) => sql`(${pollId}, ${label}, ${index})`),
      sql`, `,
    )}
  `)
}
