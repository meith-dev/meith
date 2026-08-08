/**
 * F39 — persisting a new thread.
 *
 * One transaction covers the thread, its opening post, every counter it moves
 * and the event that rolls those counters up the tree. That is the entire
 * reason `applyCreatedContentCounters` takes a transaction handle rather than
 * opening its own: a post that exists while the community still reports zero
 * threads is the failure this shape prevents (D40/D41).
 */
import { sql } from 'drizzle-orm'

import { BodyFormat, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import type { NewPoll } from '@meith/polls'

import type {
  CreatedThread,
  CommunityPostingTarget,
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

  /** The posting flags plus the slug the redirect needs, in one row. */
  async postingRules(communityId: number): Promise<CommunityPostingTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, type, slug, is_open, allow_threads, allow_replies, allow_polls,
               requires_prefix, moderate_new_threads, moderate_new_posts
          from communities where id = ${communityId}
      `),
    ) as Array<{
      id: number
      type: 'category' | 'community' | 'link'
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
    /*
     * Read before the transaction, not inside it (F71). The two halves of the
     * vocabulary are already consistent with each other — that read has its own
     * transaction — and holding this one open across an extra round trip would
     * lengthen the window on the busiest write on the board. A vocabulary edit
     * landing in between costs one stale stamp, which the backfill repairs.
     */
    const vocabulary = await readBoardVocabulary(this.db)

    return this.db.transaction(async (tx) => {
      const threadRows = resultRows(
        await tx.execute(sql`
          insert into threads
            (community_id, title, slug, prefix_id, author_user_id, author_username,
             visibility, last_post_at, created_at, updated_at)
          values
            (${record.communityId}, ${record.title}, ${record.slug}, ${record.prefixId},
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
            (thread_id, community_id, author_user_id, author_username, message,
             message_html, render_version, vocab_version, body_format, visibility,
             is_first_post, created_at, search_vector, search_version)
          values
            (${threadId}, ${record.communityId}, ${record.authorUserId},
             ${record.authorUsername}, ${record.message}, ${body.html},
             ${body.version}, ${vocabulary.revision}, ${BodyFormat.Markdown},
             ${record.visibility}, true,
             ${record.createdAt},
             /*
              * F72: the **title** is the weight-A field, because this is the
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
          communityId: record.communityId,
          authorId: record.authorUserId,
          authorUsername: record.authorUsername,
          threadTitle: record.title,
          createdAt: record.createdAt,
          isNewThread: true,
        })
      } else {
        /*
         * An unapproved thread moves no counter and emits no event, because
         * every counter on the board means "visible content" (D41). Approval is
         * F48's transition, and it is what applies them — deliberately not a
         * counter written now and corrected later, which would show the board a
         * thread count for content nobody can read.
         */
        await tx.execute(sql`
          update threads set first_post_id = ${postId} where id = ${threadId}
        `)
      }

      if (record.subscribe) {
        /*
         * Inside the same transaction: a subscription that survives a failed
         * post would notify people about a thread that does not exist.
         *
         * The watermark starts at the post just written (F56), so the author is
         * never notified about their own opening post — the notifier's "posts
         * newer than this" is then true from the first tick rather than after a
         * first pass that has to filter the subscriber out of their own thread.
         */
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

  /**
   * The thread's posting state (F40).
   *
   * `last_post_id` comes from the thread row rather than a `max(id)` over posts:
   * it is maintained by the same transaction that writes a post (D40), so it is
   * exactly as current as the listing that told the author what they had seen.
   */
  async replyTarget(threadId: number): Promise<ReplyTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.slug, t.title, t.is_locked, t.visibility, t.last_post_id,
               t.reply_count,
               f.id as community_id, f.type as community_type, f.slug as community_slug,
               f.is_open, f.allow_threads, f.allow_replies, f.allow_polls, f.requires_prefix,
               f.moderate_new_threads, f.moderate_new_posts
          from threads t
          join communities f on f.id = t.community_id
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
      community_id: number
      community_type: 'category' | 'community' | 'link'
      community_slug: string
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
      community: {
        id: Number(row.community_id),
        type: row.community_type,
        slug: row.community_slug,
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

  /** The reply write. Same transaction shape as `create`, one row shorter. */
  async createReply(record: NewReplyRecord): Promise<{ postId: number }> {
    const vocabulary = await readBoardVocabulary(this.db)

    return this.db.transaction(async (tx) => {
      const body = renderMarkdown(record.message, vocabularyOptions(vocabulary))
      const postRows = resultRows(
        await tx.execute(sql`
          insert into posts
            (thread_id, community_id, author_user_id, author_username, message,
             message_html, render_version, vocab_version, body_format, visibility,
             is_first_post, created_at, search_vector, search_version)
          values
            (${record.threadId}, ${record.communityId}, ${record.authorUserId},
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
          communityId: record.communityId,
          authorId: record.authorUserId,
          authorUsername: record.authorUsername,
          threadTitle: record.threadTitle,
          createdAt: record.createdAt,
          /*
           * The one difference that matters: a reply raises the thread's reply
           * count and the community's post count, and raises no thread count
           * anywhere. Getting this wrong inflates every ancestor's thread total
           * by one per reply, which no reader would ever question.
           */
          isNewThread: false,
        })
      }

      if (record.subscribe) {
        /*
         * Same watermark rule as a new thread: start at the reply just written.
         * `do nothing` on conflict deliberately leaves an existing subscription
         * alone — including its watermark, because a member who has not read
         * the last three replies has not been told about them either.
         */
        await tx.execute(sql`
          insert into thread_subscriptions (user_id, thread_id, mode, last_notified_post_id)
          values (${record.authorUserId}, ${record.threadId}, 'instant', ${postId})
          on conflict (user_id, thread_id) do nothing
        `)
      }

      return { postId }
    })
  }

  /**
   * When this author last posted anything, for the flood check.
   *
   * Counts unapproved posts too: a queue full of held posts is exactly the
   * pattern the interval exists to slow down, and exempting them would make
   * moderation the cheapest way to flood.
   */
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

  /**
   * Prefixes offered in this community.
   *
   * A prefix with no `community_path_prefix` is board-wide; one with a path is
   * scoped to that subtree, matched with the separator so `1.4` does not offer
   * `1.40`'s prefixes (D22's trap again, and the reason this is a query rather
   * than a filter in JavaScript).
   */
  async allowedPrefixIds(communityId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id
          from thread_prefixes p
          left join communities f on f.id = ${communityId}
         where p.community_path_prefix is null
            or f.path = p.community_path_prefix
            or f.path like p.community_path_prefix || '.%'
         order by p.display_order, p.id
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }

  /** The prefixes a composer form should offer, with their labels. */
  async listPrefixes(
    communityId: number,
  ): Promise<readonly { id: number; label: string; token: string | null }[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.label, p.token
          from thread_prefixes p
          left join communities f on f.id = ${communityId}
         where p.community_path_prefix is null
            or f.path = p.community_path_prefix
            or f.path like p.community_path_prefix || '.%'
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
