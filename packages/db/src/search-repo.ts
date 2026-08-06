import { sql, type SQL } from 'drizzle-orm'

import type { SearchCursor, SearchHit, SearchQuery, SearchResults, SearchScope } from '@meith/search'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

const SEARCH_CONFIG = 'english'

const RELEVANCE_WINDOW = 20_000

export function searchVectorSql(subject: SQL | string, message: SQL | string): SQL {
  return sql`
    setweight(to_tsvector(${SEARCH_CONFIG}, coalesce(${subject}, '')), 'A') ||
    setweight(to_tsvector(${SEARCH_CONFIG}, coalesce(${message}, '')), 'B')
  `
}

export interface ReindexResult {
  readonly indexed: number
  readonly nextCursor: number | null
}

export class PostgresSearchRepository {
  constructor(private readonly db: Database) {}

  async search(query: SearchQuery, scope: SearchScope): Promise<SearchResults> {
    if (query.terms.trim() === '') return { hits: [], nextCursor: null }

    const allowed =
      query.forumIds === undefined
        ? scope.forumIds
        : scope.forumIds.filter((id) => query.forumIds!.includes(id))

    if (allowed.length === 0) return { hits: [], nextCursor: null }

    const conditions: SQL[] = [
      sql`p.forum_id in (${sql.join(allowed.map((id) => sql`${id}`), sql`, `)})`,
      sql`p.search_vector @@ websearch_to_tsquery(${SEARCH_CONFIG}, ${query.terms})`,
    ]

    conditions.push(visibleIn(sql`p.visibility`, scope.content))
    conditions.push(visibleIn(sql`t.visibility`, scope.content))

    if (query.authorUserIds !== undefined && query.authorUserIds.length > 0) {
      conditions.push(
        sql`p.author_user_id in (${sql.join(
          query.authorUserIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
    }
    if (query.postedAfter !== undefined) conditions.push(sql`p.created_at >= ${query.postedAfter}`)
    if (query.postedBefore !== undefined) conditions.push(sql`p.created_at < ${query.postedBefore}`)

    const rank = sql`ts_rank_cd(p.search_vector, websearch_to_tsquery(${SEARCH_CONFIG}, ${query.terms}))`

    if (query.after !== null) {
      conditions.push(
        query.sort === 'relevance'
          ? sql`(${rank} < ${query.after.rank}
                 or (${rank} = ${query.after.rank} and p.id < ${query.after.postId}))`
          : query.sort === 'newest'
            ? sql`p.id < ${query.after.postId}`
            : sql`p.id > ${query.after.postId}`,
      )
    }

    const order =
      query.sort === 'relevance'
        ? sql`${rank} desc, p.id desc`
        : query.sort === 'newest'
          ? sql`p.id desc`
          : sql`p.id asc`

    const ranked = sql`
      select p.id as post_id, p.thread_id, p.forum_id,
             t.title as thread_title, t.slug as thread_slug,
             p.author_user_id, p.author_username, p.created_at, p.message,
             ${rank} as rank
        from posts p
        join threads t on t.id = p.thread_id
       where ${sql.join(conditions, sql` and `)}`

    const windowed =
      query.sort === 'relevance'
        ? sql`(${ranked} order by p.id desc limit ${RELEVANCE_WINDOW}) as candidates`
        : sql`(${ranked} order by ${order} limit ${query.limit}) as candidates`

    const rows = resultRows(
      await this.db.execute(sql`
        select post_id, thread_id, forum_id, thread_title, thread_slug,
               author_user_id, author_username, created_at, rank,
               ts_headline(${SEARCH_CONFIG}, message,
                           websearch_to_tsquery(${SEARCH_CONFIG}, ${query.terms}),
                           'MaxFragments=1, MaxWords=40, MinWords=15') as excerpt
          from ${windowed}
         order by ${query.sort === 'relevance' ? sql`rank desc, post_id desc` : sql`post_id ${query.sort === 'oldest' ? sql`asc` : sql`desc`}`}
         limit ${query.limit}
      `),
    ) as Array<Record<string, unknown>>

    const hits: SearchHit[] = rows.map((row) => ({
      postId: Number(row.post_id),
      threadId: Number(row.thread_id),
      forumId: Number(row.forum_id),
      threadTitle: String(row.thread_title),
      threadSlug: String(row.thread_slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      postedAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      excerpt: String(row.excerpt ?? ''),
      rank: Number(row.rank),
    }))

    const last = hits.at(-1)
    const nextCursor: SearchCursor | null =
      hits.length < query.limit || last === undefined
        ? null
        : { rank: last.rank, postId: last.postId }

    return { hits, nextCursor }
  }

  async reindexChunk(afterPostId: number, limit: number): Promise<ReindexResult> {
    const rows = resultRows(
      await this.db.execute(sql`
        update posts p
           set search_vector = ${searchVectorSql(sql`p.subject`, sql`p.message`)}
         where p.id in (
           select id from posts
            where search_vector is null and id > ${afterPostId}
            order by id
            limit ${limit}
         )
        returning p.id
      `),
    ) as Array<{ id: number }>

    const ids = rows.map((row) => Number(row.id)).sort((a, b) => a - b)

    return {
      indexed: ids.length,
      nextCursor: ids.length < limit ? null : (ids.at(-1) ?? null),
    }
  }

  async indexProgress(): Promise<{ readonly indexed: number; readonly pending: number }> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*) filter (where search_vector is not null)::int as indexed,
               count(*) filter (where search_vector is null)::int as pending
          from posts
      `),
    ) as Array<{ indexed: number; pending: number }>

    return {
      indexed: Number(rows[0]?.indexed ?? 0),
      pending: Number(rows[0]?.pending ?? 0),
    }
  }

  async invalidateIndex(): Promise<void> {
    await this.db.execute(sql`update posts set search_vector = null`)
  }
}
