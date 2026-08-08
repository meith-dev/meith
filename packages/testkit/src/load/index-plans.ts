/**
 * F28 — the partial visible indexes, and proof the planner uses them.
 *
 * ## Why this is a check and not a paragraph
 *
 * R3.5 asks for "`EXPLAIN` evidence for partial visible indexes". Evidence
 * pasted into a document is evidence about a database that existed once. The
 * indexes are still declared in `schema.ts` either way, so the thing that
 * actually goes wrong is not that somebody deletes one — it is that a query
 * drifts until the planner **stops choosing it**, and nothing anywhere says so.
 *
 * A partial index is unusually easy to lose this way. `where visibility =
 * 'visible'` only matches a query whose predicate the planner can prove implies
 * it, so a read path that starts passing a *variable* visibility scope, or an
 * `in ('visible')` where there used to be an `=`, silently falls off the index
 * and onto a sequential scan of the largest table on the board. Nothing errors.
 * The page just becomes slow, at a scale nobody develops against.
 *
 * So each entry below is a query, the index it must use, and why that index
 * exists. The runner executes `explain (analyze, buffers)` and fails when the
 * name is absent from the plan.
 *
 * ## The twins matter as much as the partials
 *
 * Each partial index has an unfiltered twin for moderator views, and the twins
 * are checked too. A moderator seeing unapproved and deleted content *cannot*
 * use the partial index — their predicate does not imply it — so without the
 * twin their forum view degrades to a sequential scan. That failure is invisible
 * to every test written from a member's point of view, which is most of them.
 */

export interface IndexPlan {
  readonly id: string
  /** The screen this query is behind. */
  readonly page: string
  /** The index the planner must choose. */
  readonly index: string
  /** Why the index exists, in one sentence. */
  readonly why: string
  /** `$1` is a forum id, `$2` a thread id — supplied by the runner. */
  readonly sql: string
}

export const INDEX_PLANS: readonly IndexPlan[] = [
  {
    id: 'forum-listing-visible',
    page: 'Forum listing, as a member',
    index: 'threads_forum_listing_idx',
    why: 'The index behind forum display. Sticky first, then most recent, visible only.',
    sql: `
      select id from threads
       where forum_id = $1 and visibility = 'visible'
       order by is_sticky desc, last_post_at desc
       limit 20`,
  },
  {
    id: 'forum-listing-moderator',
    page: 'Forum listing, as a moderator',
    index: 'threads_forum_listing_all_idx',
    why:
      'The unfiltered twin. A moderator’s predicate does not imply the partial ' +
      'index, so without this their forum view is a sequential scan.',
    sql: `
      select id from threads
       where forum_id = $1 and visibility in ('visible', 'unapproved', 'deleted')
       order by is_sticky desc, last_post_at desc
       limit 20`,
  },
  {
    id: 'thread-page-visible',
    page: 'Thread page, as a member',
    index: 'posts_thread_visible_idx',
    why: 'Pages by post id within a thread; makes both the slice and the position lookup index-only.',
    sql: `
      select id from posts
       where thread_id = $2 and visibility = 'visible'
       order by id
       limit 20`,
  },
  {
    id: 'thread-page-moderator',
    page: 'Thread page, as a moderator',
    index: 'posts_thread_all_idx',
    why: 'The unfiltered twin, for the same reason as the forum listing’s.',
    sql: `
      select id from posts
       where thread_id = $2 and visibility in ('visible', 'unapproved', 'deleted')
       order by id
       limit 20`,
  },
  {
    id: 'moderation-queue',
    page: 'Moderation queue',
    index: 'posts_forum_visibility_idx',
    why:
      'The inverse partial: unapproved and deleted posts only. Small on a healthy ' +
      'board, which is exactly why a scan to find them would go unnoticed.',
    sql: `
      select id from posts
       where forum_id = $1 and visibility <> 'visible'
       order by created_at desc
       limit 20`,
  },
]

export interface PlanResult {
  readonly id: string
  readonly index: string
  /** Whether the expected index appeared in the plan. */
  readonly used: boolean
  /** The scan node the planner actually chose, for the failure message. */
  readonly chosen: string
  readonly ms: number
  /** Rows the plan touched — a scan gives itself away here even when it is fast. */
  readonly rows: number
}

/**
 * Which index the plan used, and how.
 *
 * The plan text is searched for the index name rather than parsed structurally.
 * A structural walk would be more precise and is not worth it: the question is
 * "does this name appear as a scan node", and a name appearing anywhere in a
 * plan means the planner reached for it.
 */
export function readPlan(planText: string, expected: string): { used: boolean; chosen: string } {
  const used = planText.includes(expected)

  /*
   * The first scan node, which is what the reader wants to see when the answer
   * is no. "Seq Scan on posts" is a complete diagnosis; "the index was not used"
   * is the start of an investigation.
   */
  const chosen =
    /(Seq Scan on \w+|Index Only Scan using \w+|Index Scan using \w+|Bitmap Index Scan on \w+)/.exec(
      planText,
    )?.[1] ?? 'unknown'

  return { used, chosen }
}
