/**
 * F72 — Postgres full-text search.
 *
 * Four things about this file are the feature.
 *
 * **The permission filter is in the query, not around it.** The visible community
 * ids go into the `where` clause. Fetching a page and filtering it afterwards
 * would be wrong twice over: the page would come back short — twenty hits
 * becoming three — and the *cursor* would be computed from rows the viewer
 * cannot see, so paging would skip or repeat. An empty scope means no results,
 * never all of them.
 *
 * **Ranking is weighted.** A thread whose subject contains the term is a better
 * hit than one that mentions it in passing, so the subject is indexed at weight
 * `A` and the body at `B`. Without weights, a two-word title loses to a
 * thousand-word post that says the word once. What that subject *is* — the
 * thread's title on the opening post, never `posts.subject` alone — is
 * `indexedSubjectSql`, and getting it wrong is what made searching for a thread
 * by its title return nothing at all.
 *
 * **Paging is keyset on (rank, id).** Ranks tie constantly — a hundred posts
 * can share a score — and an OFFSET page over ties silently repeats and skips.
 * The id breaks the tie and makes the order total.
 *
 * **The index is maintained explicitly, not by a generated column.** Postgres
 * would happily compute `search_vector` as `GENERATED ALWAYS AS … STORED`, and
 * on an empty database that is the better design — but adding one to a table
 * with two million posts rewrites the table under an exclusive lock, which on a
 * live board is an outage. So the column is written on insert and by a
 * resumable backfill, exactly as F38's counters are — and, because it is the
 * app's decision what the document holds, stamped with the version of that
 * decision so the day it changes is a constant bump rather than a migration
 * over the largest table there is.
 */
import { sql, type SQL } from 'drizzle-orm'

import type { SearchCursor, SearchHit, SearchQuery, SearchResults, SearchScope } from '@meith/search'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

/** How the two fields are weighted. Subject beats body. */
const SEARCH_CONFIG = 'english'

/**
 * How many matches a relevance search ranks (F89, open question 6).
 *
 * The most recent N, ordered by id. Chosen from measurement rather than taste:
 * on a 2.3M-post board, ranking every match of a near-universal term took 5.5
 * seconds and ranking 20,000 took 140ms. Larger windows buy accuracy nobody can
 * perceive — a term matching two million posts has no meaningful "best" result —
 * and cost linearly.
 *
 * Only relevance is bounded. See the comment at the query.
 */
const RELEVANCE_WINDOW = 20_000

/**
 * Which definition of the document produced a row's vector.
 *
 * Bump this whenever `searchVectorSql` or `indexedSubjectSql` changes what
 * belongs in the index. Every row on the board is then behind, `search.reindex`
 * rewrites them behind the read path, and nothing stops being findable in the
 * meantime — which is what this is for, and why it exists instead of a call to
 * `invalidateIndex()`.
 *
 * 1 — the thread's title is the weight-`A` field of its opening post.
 */
export const SEARCH_DOCUMENT_VERSION = 1

/**
 * Build the indexed document for one post.
 *
 * Exported so the writer and the backfill cannot drift: a post inserted today
 * and one reindexed tomorrow must produce the same vector, or search results
 * would depend on when a post happened to be written.
 */
export function searchVectorSql(subject: SQL | string, message: SQL | string): SQL {
  return sql`
    setweight(to_tsvector(${SEARCH_CONFIG}, coalesce(${subject}, '')), 'A') ||
    setweight(to_tsvector(${SEARCH_CONFIG}, coalesce(${message}, '')), 'B')
  `
}

/**
 * The weight-`A` field of a post already in the table.
 *
 * **A thread's subject is `threads.title`.** `posts.subject` exists because
 * MyBB gave every post one and the importer needs somewhere to put it; nothing
 * this board writes ever sets it. Reading the column alone — which is what the
 * edit path and the backfill did — therefore weighted an empty string on every
 * post ever written here, and the half of the index meant to hold the words
 * members actually search for was empty on every row.
 *
 * So: the post's own subject when it has one, and the thread's title when the
 * post *opens* the thread. Not for replies, deliberately. Folding the title
 * into every post would make one term match a whole thread, so a search for a
 * title would return forty hits that are all the same thread — and the opening
 * post is the one a reader wants to land on anyway.
 *
 * `post` names the posts table as the surrounding statement aliases it, because
 * the two callers alias it differently and a hard-coded `p.` would silently
 * resolve to the wrong table in one of them.
 */
export function indexedSubjectSql(post: SQL): SQL {
  return sql`coalesce(
    ${post}.subject,
    case when ${post}.is_first_post
      then (select t.title from threads t where t.id = ${post}.thread_id)
    end
  )`
}

/**
 * "This row's vector is missing or was built under an older rule."
 *
 * One predicate, used by the backfill and by the progress count, because an
 * operator screen that disagreed with the backfill about what is outstanding is
 * a screen that reports `0 pending` beside a task that keeps finding work.
 *
 * Parenthesised here rather than at each use. It is an `or`, `and` binds
 * tighter, and the backfill's `where … and id > $cursor` would otherwise parse
 * as "no vector at all, **or** stale and past the cursor" — which happens to
 * behave, because indexing a row takes it out of the set either way, and is one
 * edit away from not.
 */
const PENDING_INDEX: SQL = sql`(search_vector is null or search_version < ${SEARCH_DOCUMENT_VERSION})`

export interface ReindexResult {
  readonly indexed: number
  /** Pass back to continue. `null` when every post has been indexed. */
  readonly nextCursor: number | null
}

export class PostgresSearchRepository {
  constructor(private readonly db: Database) {}

  async search(query: SearchQuery, scope: SearchScope): Promise<SearchResults> {
    if (query.terms.trim() === '') return { hits: [], nextCursor: null }

    /* Narrowing only: a caller cannot widen its own scope by asking. */
    const allowed =
      query.communityIds === undefined
        ? scope.communityIds
        : scope.communityIds.filter((id) => query.communityIds!.includes(id))

    /*
     * The short-circuit that makes the permission model safe by construction:
     * no visible communities means no results, without a query running at all.
     *
     * One guard rather than two. An earlier version also checked
     * `scope.communityIds.length === 0` above, which reads as defensive and is
     * unprovable — this line already covers it, and no mutation of the first
     * check could fail a test. A guard that cannot be shown to matter is one
     * the next reader will trust for the wrong reason.
     */
    if (allowed.length === 0) return { hits: [], nextCursor: null }

    const conditions: SQL[] = [
      sql`p.community_id in (${sql.join(allowed.map((id) => sql`${id}`), sql`, `)})`,
      sql`p.search_vector @@ websearch_to_tsquery(${SEARCH_CONFIG}, ${query.terms})`,
    ]

    /*
     * Visibility, through the one helper allowed to compare the column (F47).
     * Comparing the column by hand here would be a read path deciding for
     * itself which states it may show — which is what `pnpm guards` fails the
     * build over, and it caught this file on its first run. (It caught the
     * comment that used to be here too, which is the guard being blunt in the
     * right direction: a pattern it cannot tell from code is one it should
     * flag.)
     *
     * Both sides matter: a post in a deleted thread must not surface, or search
     * becomes the way to read threads that were taken down.
     */
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

    /*
     * The keyset predicate has to match the ORDER BY exactly, including the tie
     * break, or a page boundary that lands inside a run of equal ranks loses
     * rows. Newest/oldest page on id alone, which is already total.
     */
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

    /*
     * `ts_headline` renders the excerpt, so the marked terms come from the same
     * engine that matched them — an excerpt built by string-searching the body
     * would highlight the wrong thing for any stemmed match ("running" matching
     * "run") and would have to re-implement the stemmer to avoid it.
     */
    /*
     * Relevance ranks within a bounded window of the most recent matches; the
     * date orders read the whole set.
     *
     * ## Why relevance needs a bound and the others do not
     *
     * `order by ts_rank_cd(...)` cannot use an index — a rank depends on the
     * query, so there is nothing to have indexed. Postgres must score **every
     * matching row** before it can name the top twenty. F89 measured that on a
     * 2.3M-post board: a term matching 96% of posts took a p95 of 5.5 seconds,
     * against 35ms for a term matching 1,171. The GIN index was present and used
     * throughout — the cost was the ranking, and no index removes it.
     *
     * `order by p.id` has none of this problem. The id is indexed, so the
     * planner walks it and stops after twenty rows however many match, which is
     * why `newest` and `oldest` read the whole corpus and only `relevance` is
     * bounded. Bounding all three would have been symmetry at the cost of
     * truthfulness: "oldest" that could not reach the oldest post is broken.
     *
     * ## What the bound changes, and for whom
     *
     * For any term matching fewer than `RELEVANCE_WINDOW` posts — which is
     * essentially every real query — the window contains the entire match set
     * and results are **identical**. For a near-universal term it becomes "the
     * most relevant of the most recent 20,000 matches", which is both what a
     * member wants from a word that appears everywhere and the only answer
     * obtainable in under a second.
     *
     * Recorded as a parity decision in `docs/mybb-parity.md`, because it is a
     * user-visible difference and one somebody will otherwise rediscover as a
     * bug. Measured at 140ms against the 5.5s it replaces.
     */
    const ranked = sql`
      select p.id as post_id, p.thread_id, p.community_id,
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
        select post_id, thread_id, community_id, thread_title, thread_slug,
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
      communityId: Number(row.community_id),
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

  /**
   * Index one batch of posts whose vector is missing or out of date.
   *
   * Keyed on the *row*, not on a cursor alone, so a run interrupted anywhere
   * resumes correctly and a re-run costs nothing — the set shrinks
   * monotonically as it goes. The id cursor is there to keep each batch a
   * forward scan rather than a repeated seek through the rows already done, and
   * a caller with no cursor to hand (the scheduled task) may pass 0 every time.
   */
  async reindexChunk(afterPostId: number, limit: number): Promise<ReindexResult> {
    const rows = resultRows(
      await this.db.execute(sql`
        update posts p
           set search_vector = ${searchVectorSql(indexedSubjectSql(sql`p`), sql`p.message`)},
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

  /** How much of the board is indexed, for the operator screen. */
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

  /**
   * Drop every vector, so the next reindex rebuilds from scratch.
   *
   * **Not the way to ship a change to the document.** Bumping
   * `SEARCH_DOCUMENT_VERSION` marks the same rows as needing a rebuild and
   * leaves them findable while it happens; this takes search away from the
   * whole board until the backfill catches up. What it is left for is the case
   * a version cannot express — an index believed to be *wrong* rather than
   * merely old, after a restore or a hand-edited row — where serving nothing is
   * better than serving something untrue.
   *
   * The version goes back with it, so a re-indexed row is stamped afresh rather
   * than keeping a number that says it is current while holding no vector.
   */
  async invalidateIndex(): Promise<void> {
    await this.db.execute(sql`update posts set search_vector = null, search_version = 0`)
  }
}
