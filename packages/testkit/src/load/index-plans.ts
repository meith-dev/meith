export interface IndexPlan {
  readonly id: string
  readonly page: string
  readonly index: string
  readonly why: string
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
  readonly used: boolean
  readonly chosen: string
  readonly ms: number
  readonly rows: number
}

export function readPlan(planText: string, expected: string): { used: boolean; chosen: string } {
  const used = planText.includes(expected)

  const chosen =
    /(Seq Scan on \w+|Index Only Scan using \w+|Index Scan using \w+|Bitmap Index Scan on \w+)/.exec(
      planText,
    )?.[1] ?? 'unknown'

  return { used, chosen }
}
