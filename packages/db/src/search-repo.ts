import { type SQL, sql } from 'drizzle-orm'

import type {
  AuthorFacet,
  ForumFacet,
  SearchCursor,
  SearchHit,
  SearchQuery,
  SearchResults,
  SearchScope,
  SearchSummary,
} from '@meith/search'
import { DEFAULT_SEARCH_LANGUAGE, SEARCH_LANGUAGES } from '@meith/settings'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { inAudience } from './thread-audience'
import { visibleIn } from './visibility'

const SEARCH_LANGUAGE_SET: ReadonlySet<string> = new Set(SEARCH_LANGUAGES)

export const DEFAULT_SEARCH_CONFIG: string = DEFAULT_SEARCH_LANGUAGE

export function resolveSearchConfig(value: string | null | undefined): string {
  return typeof value === 'string' && SEARCH_LANGUAGE_SET.has(value) ? value : DEFAULT_SEARCH_CONFIG
}

export async function readSearchConfig(db: Database): Promise<string> {
  const rows = resultRows(
    await db.execute(sql`select value from settings where key = 'search.language'`),
  ) as Array<{ value: string }>
  return resolveSearchConfig(rows[0]?.value)
}

export const SEARCH_WINDOW = 20_000

const TOP_AUTHORS = 24

export const SEARCH_DOCUMENT_VERSION = 1

const EXCERPT_HIGHLIGHT_START = String.fromCharCode(0xe000)
const EXCERPT_HIGHLIGHT_STOP = String.fromCharCode(0xe001)

const HEADLINE_OPTIONS =
  `StartSel=${EXCERPT_HIGHLIGHT_START}, StopSel=${EXCERPT_HIGHLIGHT_STOP}, ` +
  `MaxFragments=1, MaxWords=40, MinWords=15`

const EXCERPT_HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function renderExcerptHtml(headline: string): string {
  const escaped = headline.replace(
    /[&<>"']/g,
    (character) => EXCERPT_HTML_ESCAPES[character] ?? character,
  )
  return escaped
    .split(EXCERPT_HIGHLIGHT_START)
    .join('<b>')
    .split(EXCERPT_HIGHLIGHT_STOP)
    .join('</b>')
}

export function searchVectorSql(config: string, subject: SQL | string, message: SQL | string): SQL {
  return sql`
    setweight(to_tsvector(${config}, coalesce(${subject}, '')), 'A') ||
    setweight(to_tsvector(${config}, coalesce(${message}, '')), 'B')
  `
}

export function indexedSubjectSql(post: SQL): SQL {
  return sql`coalesce(
    ${post}.subject,
    case when ${post}.is_first_post
      then (select t.title from threads t where t.id = ${post}.thread_id)
    end
  )`
}

const PENDING_INDEX: SQL = sql`(search_vector is null or search_version < ${SEARCH_DOCUMENT_VERSION})`

const NOTHING: SearchSummary = { total: 0, isCapped: false, forums: [], authors: [] }

export interface ReindexResult {
  readonly indexed: number
  readonly nextCursor: number | null
}

export class PostgresSearchRepository {
  private readonly config: string

  constructor(
    private readonly db: Database,
    config: string = DEFAULT_SEARCH_CONFIG,
  ) {
    this.config = resolveSearchConfig(config)
  }

  async search(query: SearchQuery, scope: SearchScope): Promise<SearchResults> {
    const conditions = matchConditions(this.config, query, scope)
    if (conditions === null) return { hits: [], nextCursor: null }

    const rank = rankSql(this.config, query.terms)
    const finalOrder = orderSql(query.sort)

    const selection = sql`
      select p.id as post_id, p.thread_id, p.forum_id,
             t.title as thread_title, t.slug as thread_slug,
             p.author_user_id, p.author_username, p.created_at,
             ${excerptSourceSql(query.match)} as excerpt_source,
             ${rank} as rank
        from posts p
        join threads t on t.id = p.thread_id`

    const candidates =
      query.grouping === 'threads'
        ? groupedCandidates(query, selection, conditions)
        : flatCandidates(query, selection, conditions, rank)

    const rows = resultRows(
      await this.db.execute(sql`
        select post_id, thread_id, forum_id, thread_title, thread_slug,
               author_user_id, author_username, created_at, rank,
               ts_headline(${this.config}, excerpt_source,
                           websearch_to_tsquery(${this.config}, ${query.terms}),
                           ${HEADLINE_OPTIONS}) as excerpt
          from ${candidates}
         order by ${finalOrder}
         limit ${query.limit} offset ${query.after === null ? (query.offset ?? 0) : 0}
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
      excerpt: renderExcerptHtml(String(row.excerpt ?? '')),
      rank: Number(row.rank),
    }))

    const last = hits.at(-1)
    const nextCursor: SearchCursor | null =
      hits.length < query.limit || last === undefined
        ? null
        : { rank: last.rank, postId: last.postId }

    return { hits, nextCursor }
  }

  async summarize(query: SearchQuery, scope: SearchScope): Promise<SearchSummary> {
    const conditions = matchConditions(this.config, query, scope)
    if (conditions === null) return NOTHING

    const rows = resultRows(
      await this.db.execute(sql`
        with candidates as (
          select p.forum_id, p.thread_id, p.author_user_id, p.author_username
            from posts p
            join threads t on t.id = p.thread_id
           where ${sql.join(conditions, sql` and `)}
           limit ${SEARCH_WINDOW + 1}
        )
        select 'total' as facet, null::int as id, ''::text as username,
               count(*)::int as posts, count(distinct thread_id)::int as threads
          from candidates
        union all
        select 'forum', forum_id, '', count(*)::int, count(distinct thread_id)::int
          from candidates
         group by forum_id
        union all
        select * from (
          select 'author' as facet, author_user_id as id,
                 coalesce(max(author_username), '') as username,
                 count(*)::int as posts, count(distinct thread_id)::int as threads
            from candidates
           where author_user_id is not null
           group by author_user_id
           order by count(*) desc
           limit ${TOP_AUTHORS}
        ) as top_authors
      `),
    ) as Array<Record<string, unknown>>

    const scanned = rows.find((row) => row.facet === 'total')
    if (scanned === undefined) return NOTHING

    const isCapped = Number(scanned.posts) > SEARCH_WINDOW
    const count = (row: Record<string, unknown>): number =>
      query.grouping === 'threads'
        ? Number(row.threads)
        : Math.min(Number(row.posts), SEARCH_WINDOW)

    const forums: ForumFacet[] = []
    const authors: AuthorFacet[] = []

    for (const row of rows) {
      if (row.facet === 'forum') {
        forums.push({ forumId: Number(row.id), hits: count(row) })
      } else if (row.facet === 'author') {
        authors.push({
          userId: Number(row.id),
          username: String(row.username),
          hits: count(row),
        })
      }
    }

    const byHits = <T extends { readonly hits: number }>(a: T, b: T): number => b.hits - a.hits

    return {
      total: count(scanned),
      isCapped,
      forums: forums.sort(byHits),
      authors: authors.sort(byHits),
    }
  }

  async reindexChunk(afterPostId: number, limit: number): Promise<ReindexResult> {
    const config = await readSearchConfig(this.db)
    const rows = resultRows(
      await this.db.execute(sql`
        update posts p
           set search_vector = ${searchVectorSql(config, indexedSubjectSql(sql`p`), sql`p.message`)},
               search_version = ${SEARCH_DOCUMENT_VERSION}
         where p.id in (
           select id from posts
            where ${PENDING_INDEX} and id > ${afterPostId}
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
        select count(*) filter (where not ${PENDING_INDEX})::int as indexed,
               count(*) filter (where ${PENDING_INDEX})::int as pending
          from posts
      `),
    ) as Array<{ indexed: number; pending: number }>

    return {
      indexed: Number(rows[0]?.indexed ?? 0),
      pending: Number(rows[0]?.pending ?? 0),
    }
  }

  async invalidateIndex(): Promise<void> {
    await this.db.execute(sql`update posts set search_vector = null, search_version = 0`)
  }

  async markForReindex(): Promise<number> {
    const rows = resultRows(
      await this.db.execute(
        sql`update posts set search_version = 0 where search_version <> 0 returning id`,
      ),
    ) as Array<{ id: number }>
    return rows.length
  }
}

function rankSql(config: string, terms: string): SQL {
  return sql`ts_rank_cd(p.search_vector, websearch_to_tsquery(${config}, ${terms}))`
}

function excerptSourceSql(match: SearchQuery['match']): SQL {
  return match === 'titles' ? sql`coalesce(p.subject, t.title)` : sql`p.message`
}

function orderSql(sort: SearchQuery['sort']): SQL {
  return sort === 'relevance'
    ? sql`rank desc, post_id desc`
    : sort === 'newest'
      ? sql`post_id desc`
      : sql`post_id asc`
}

function matchConditions(config: string, query: SearchQuery, scope: SearchScope): SQL[] | null {
  if (query.terms.trim() === '') return null

  const allowed =
    query.forumIds === undefined
      ? scope.forumIds
      : scope.forumIds.filter((id) => query.forumIds!.includes(id))

  if (allowed.length === 0) return null
  if (query.authorUserIds !== undefined && query.authorUserIds.length === 0) return null

  const conditions: SQL[] = [
    inAudience(sql`p.forum_id`, sql`t.author_user_id`, {
      ...scope,
      forumIds: allowed,
    }),
    sql`p.search_vector @@ websearch_to_tsquery(${config}, ${query.terms})`,
  ]

  conditions.push(visibleIn(sql`p.visibility`, scope.content))
  conditions.push(visibleIn(sql`t.visibility`, scope.content))

  if (query.match === 'titles') {
    conditions.push(
      sql`to_tsvector(${config}, coalesce(${indexedSubjectSql(sql`p`)}, ''))
          @@ websearch_to_tsquery(${config}, ${query.terms})`,
    )
  }

  if (query.authorUserIds !== undefined) {
    conditions.push(
      sql`p.author_user_id in (${sql.join(
        query.authorUserIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
  }

  if (query.postedAfter !== undefined) conditions.push(sql`p.created_at >= ${query.postedAfter}`)
  if (query.postedBefore !== undefined) conditions.push(sql`p.created_at < ${query.postedBefore}`)

  return conditions
}

function cursorSql(query: SearchQuery, rank: SQL, postId: SQL): SQL | null {
  if (query.after === null) return null

  return query.sort === 'relevance'
    ? sql`(${rank} < ${query.after.rank}
           or (${rank} = ${query.after.rank} and ${postId} < ${query.after.postId}))`
    : query.sort === 'newest'
      ? sql`${postId} < ${query.after.postId}`
      : sql`${postId} > ${query.after.postId}`
}

function flatCandidates(
  query: SearchQuery,
  selection: SQL,
  conditions: readonly SQL[],
  rank: SQL,
): SQL {
  const cursor = cursorSql(query, rank, sql`p.id`)
  const all = cursor === null ? [...conditions] : [...conditions, cursor]
  const scan = sql`${selection} where ${sql.join(all, sql` and `)}`

  return query.sort === 'relevance'
    ? sql`(${scan} order by p.id desc limit ${SEARCH_WINDOW}) as candidates`
    : sql`(${scan} order by ${query.sort === 'newest' ? sql`p.id desc` : sql`p.id asc`}
           limit ${query.limit}) as candidates`
}

function groupedCandidates(query: SearchQuery, selection: SQL, conditions: readonly SQL[]): SQL {
  const scan = sql`${selection} where ${sql.join([...conditions], sql` and `)}
                   order by ${query.sort === 'oldest' ? sql`p.id asc` : sql`p.id desc`}
                   limit ${SEARCH_WINDOW}`

  const representative =
    query.sort === 'relevance'
      ? sql`thread_id, rank desc, post_id desc`
      : query.sort === 'newest'
        ? sql`thread_id, post_id desc`
        : sql`thread_id, post_id asc`

  const grouped = sql`
    select distinct on (thread_id) * from (${scan}) as scanned order by ${representative}`

  const cursor = cursorSql(query, sql`rank`, sql`post_id`)

  return cursor === null
    ? sql`(select * from (${grouped}) as grouped
            order by ${orderSql(query.sort)} limit ${query.limit}) as candidates`
    : sql`(select * from (${grouped}) as grouped where ${cursor}
            order by ${orderSql(query.sort)} limit ${query.limit}) as candidates`
}
