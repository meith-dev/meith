/**
 * F76 — what the syndicated surfaces read.
 *
 * Feeds and a sitemap are the same query shape as every other listing on this
 * board, with one difference that runs through the whole feature: **the scope
 * is always the guest's.** Not because a feed cannot be personalised, but
 * because the things that fetch these URLs — aggregators, crawlers, link
 * unfurlers, CDNs — cache one response per URL and hand it to everybody. A feed
 * built for a member and cached under a shared URL is a private forum served to
 * whoever asks next. That decision lives at the call sites in the app; this file
 * simply takes a scope and never assumes one, exactly as F72 and F74 do.
 *
 * The sitemap reads are keyset-paged for the same reason as everything else: at
 * two million posts a sitemap is not one document, and the chunk boundary has to
 * be stable while a crawler works through it.
 */
import { sql } from 'drizzle-orm'

import type { ContentScope } from '@forum/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface FeedScope {
  /** Forums the feed's audience may read — for a public feed, the guest's. */
  readonly forumIds: readonly number[]
  readonly content: ContentScope
}

export interface FeedThread {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly authorUsername: string
  readonly createdAt: Date
  readonly lastPostAt: Date
  readonly replyCount: number
  /** The opening post's source text, for the entry summary. Null if it is gone. */
  readonly excerptSource: string | null
}

export interface FeedPost {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUsername: string
  readonly createdAt: Date
  readonly messageSource: string
}

export interface SitemapForum {
  readonly forumId: number
  readonly slug: string
  readonly lastPostAt: Date | null
}

export interface SitemapThread {
  readonly threadId: number
  readonly slug: string
  readonly lastPostAt: Date
}

/** How much of a post the feed carries. */
const EXCERPT_CHARS = 500

export class PostgresFeedRepository {
  constructor(private readonly db: Database) {}

  /**
   * The board's — or one forum's — most recently active threads.
   *
   * Ordered by last post rather than by creation, because a feed answers "what
   * is happening" and a thread revived after a year is news. The excerpt is the
   * **opening** post, not the latest: a feed entry keyed on the thread must say
   * what the thread is about, or every reply changes the entry's meaning under
   * a reader who has already seen it.
   */
  async recentThreads(
    limit: number,
    scope: FeedScope,
    forumId?: number,
  ): Promise<readonly FeedThread[]> {
    if (scope.forumIds.length === 0) return []

    const forums =
      forumId === undefined
        ? sql`t.forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : /*
           * A single forum still goes through the scope: asking for a forum the
           * audience may not read must produce nothing, not that forum's
           * threads. `and` rather than a replacement is what makes the narrowing
           * additive and impossible to widen by argument.
           */
          sql`t.forum_id = ${forumId} and t.forum_id in (${sql.join(
            scope.forumIds.map((id) => sql`${id}`),
            sql`, `,
          )})`

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.title, t.slug, t.forum_id, f.title as forum_title,
               t.author_username, t.created_at, t.last_post_at, t.reply_count,
               left(p.message, ${EXCERPT_CHARS}) as excerpt
          from threads t
          join forums f on f.id = t.forum_id
          /*
           * The opening post, and left-joined *through the scope*: a thread
           * whose first post was removed is still a thread, and it appears with
           * no summary rather than vanishing from the feed.
           */
          left join posts p
            on p.id = t.first_post_id
           and ${visibleIn(sql`p.visibility`, scope.content)}
         where ${forums}
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.last_post_at desc, t.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      lastPostAt: toDate(row.last_post_at),
      replyCount: Number(row.reply_count),
      excerptSource: row.excerpt === null ? null : String(row.excerpt),
    }))
  }

  /**
   * One thread's most recent posts, newest first.
   *
   * The thread's own visibility is checked here rather than trusted from the
   * caller: a feed URL is a bare id, and answering it with posts because the
   * *posts* are visible would publish a thread that is not.
   */
  async recentPosts(
    threadId: number,
    limit: number,
    scope: FeedScope,
  ): Promise<readonly FeedPost[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
               p.author_username, p.created_at, left(p.message, ${EXCERPT_CHARS}) as message
          from posts p
          join threads t on t.id = p.thread_id
         where p.thread_id = ${threadId}
           and t.forum_id in (${sql.join(
             scope.forumIds.map((id) => sql`${id}`),
             sql`, `,
           )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and ${visibleIn(sql`p.visibility`, scope.content)}
         order by p.created_at desc, p.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      postId: Number(row.id),
      threadId: Number(row.thread_id),
      threadTitle: String(row.thread_title),
      threadSlug: String(row.thread_slug),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      messageSource: String(row.message),
    }))
  }

  /**
   * The forums a crawler may index.
   *
   * `last_post_at` comes from the forum's own denormalised column (F38), so the
   * sitemap's `lastmod` costs no aggregate — and it is null for a forum nobody
   * has posted in, which the serialiser omits rather than inventing a date for.
   */
  async sitemapForums(scope: FeedScope): Promise<readonly SitemapForum[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select id, slug, last_post_at
          from forums
         where id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and type = 'forum'
         order by id
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      forumId: Number(row.id),
      slug: String(row.slug),
      lastPostAt: row.last_post_at === null ? null : toDate(row.last_post_at),
    }))
  }

  /**
   * How many threads a crawler may index.
   *
   * Needed for the sitemap *index*, which has to say how many chunks exist
   * before any of them is generated. It is the one count in this file, it runs
   * once per index request, and the alternative — walking the chunks to find
   * out where they stop — is the same scan done several times.
   */
  async sitemapThreadCount(scope: FeedScope): Promise<number> {
    if (scope.forumIds.length === 0) return 0

    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
      `),
    ) as Array<{ n: number }>

    return rows[0]?.n ?? 0
  }

  /**
   * The id a sitemap chunk starts after.
   *
   * The one OFFSET in this codebase, and it is here for a reason the rest of
   * the board does not have: the sitemap *index* names the chunks by number
   * before any chunk exists, so a chunk has to be able to find its own start
   * from that number alone. A cursor the index cannot compute would mean
   * generating every chunk to build the index.
   *
   * It returns **one row**, not a page — Postgres skips through the primary-key
   * index rather than materialising what it skips — and it is answered for a
   * crawler rather than a reader.
   *
   * Zero for the first chunk, which has no predecessor, and **null when the
   * skip runs off the end**. The two must not be the same value: answering zero
   * for a chunk beyond the last one would serve the *first* chunk's threads at
   * `/sitemap/threads-99.xml`, which is the same content under a second URL —
   * exactly what a canonical exists to prevent, published to crawlers by the
   * document that tells them what to crawl.
   */
  async sitemapBoundaryId(skip: number, scope: FeedScope): Promise<number | null> {
    if (skip <= 0) return 0
    if (scope.forumIds.length === 0) return null

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.id
         offset ${skip - 1}
         limit 1
      `),
    ) as Array<{ id: number }>

    return rows[0]?.id ?? null
  }

  /**
   * One chunk of the thread sitemap, keyset-paged on the id.
   *
   * **By id ascending, not by activity.** A crawler works through the chunks
   * over hours or days, and a boundary that moves whenever somebody posts would
   * make it skip threads and revisit others. Ids never move.
   */
  async sitemapThreads(
    afterId: number,
    limit: number,
    scope: FeedScope,
  ): Promise<readonly SitemapThread[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.slug, t.last_post_at
          from threads t
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and t.id > ${afterId}
         order by t.id
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      slug: String(row.slug),
      lastPostAt: toDate(row.last_post_at),
    }))
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
