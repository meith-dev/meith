/**
 * F89 — the p95 budgets, as data.
 *
 * ## Why these are numbers in a file rather than numbers in a document
 *
 * "Documented p95 budgets" could be a table in Markdown, and it would be worth
 * nothing: a budget nobody re-measures is a claim that was true once. So the
 * budgets are a value, the load runner compares against them, and the document
 * is generated from the same source the runner reads. A number that drifts fails
 * something.
 *
 * ## What a budget here covers, and what it does not
 *
 * Each budget is **data-layer time**: the repository calls a hot page makes,
 * against real Postgres, at the plan's full scale. It is not end-to-end HTTP.
 *
 * That is a deliberate boundary and worth being explicit about, because the
 * obvious complaint is fair — a reader wants to know what a *page* costs, and
 * this measures a part of one. The reason is that the part it measures is the
 * part that **scales with the corpus**. React rendering a twenty-post page costs
 * the same on a board with two thousand posts and one with two million;
 * `select … order by … limit 20` does not. A budget's job is to fail when a
 * change makes the board worse as it grows, and mixing in a large constant that
 * moves with the Next.js version would mask exactly that.
 *
 * The end-to-end number is measured too, separately and once, so the constant is
 * known rather than assumed — see `docs/performance.md`.
 *
 * ## Where the numbers came from
 *
 * Measured, then rounded **up** to somewhere between two and three times the
 * observed p95. A budget set at the observed value fails on the next run for
 * reasons that have nothing to do with the code — a noisy neighbour, a cold
 * cache, a checkpoint — and a budget that cries wolf is one that gets raised
 * without being read.
 *
 * The headroom is not generosity: the failures worth catching are order-of-
 * magnitude ones. A missing index does not make a query 40% slower, it makes it
 * 100× slower, and a 3× budget catches that on the first run while surviving an
 * ordinary bad afternoon on shared hardware.
 */

/**
 * A **target** is a number the page is expected to meet, set with headroom over
 * what was measured. A **limit** is a number that was measured, is *not*
 * considered good, and is written down anyway so it cannot get worse quietly.
 *
 * A `limit` is a debt with a number on it, not a pass mark.
 *
 * **Nothing is currently a limit.** The field was added for `search-common`,
 * which F89 measured at 5.5 seconds and could not fix without a decision the
 * working rules reserved for a human; once that decision was taken it became a
 * 98ms target and the debt was paid inside one pass.
 *
 * It is kept rather than deleted because the alternatives it displaced are both
 * bad and both tempting: delete the scenario and the slowness goes undocumented,
 * or leave the budget at its unmet target and CI is permanently red — and a
 * build that is always red is a build nobody reads. The next scenario in that
 * position should have somewhere honest to sit.
 */
export type BudgetKind = 'target' | 'limit'

export interface Budget {
  /** Stable id, used in the report and in the generated document. */
  readonly id: string
  /** The page an operator would recognise. */
  readonly page: string
  /** What the scenario actually calls, in one line. */
  readonly work: string
  /** p95 ceiling, milliseconds of data-layer time. */
  readonly p95Ms: number
  /** Target to meet, or measured limit recorded so it cannot regress. */
  readonly kind: BudgetKind
  /** Why this page is on the list. */
  readonly why: string
}

/**
 * The hot pages, in rough order of how much traffic a real board sends them.
 *
 * "Hot" is the roadmap's word and it means *this is what the traffic does*: a
 * forum's requests are overwhelmingly thread views and forum listings, and an
 * optimisation anywhere else is an optimisation of something nobody waits for.
 */
export const BUDGETS: readonly Budget[] = [
  {
    id: 'thread-page-first',
    page: 'Thread, page 1',
    work: 'listThread(limit 20) on a long thread',
    p95Ms: 50,
    kind: 'target',
    why: 'The single most requested page on any forum. Everything else is rounding.',
  },
  {
    id: 'thread-page-deep',
    page: 'Thread, deep page',
    work: 'listThread(afterId) far into a long thread',
    p95Ms: 60,
    kind: 'target',
    why: 'The keyset claim. Under OFFSET this degrades with depth; it must not.',
  },
  {
    id: 'forum-page-first',
    page: 'Forum, page 1',
    work: 'listForum(limit 20) on the busiest forum',
    p95Ms: 50,
    kind: 'target',
    why: 'Sticky-first ordering over the largest thread set on the board.',
  },
  {
    id: 'forum-page-deep',
    page: 'Forum, deep page',
    work: 'listForum(after cursor) deep into the busiest forum',
    p95Ms: 60,
    kind: 'target',
    why: 'Same keyset claim on the other axis, and the one an archive crawler hits.',
  },
  {
    id: 'board-index',
    page: 'Board index',
    work: 'listListing() — every forum with its counters and last post',
    p95Ms: 80,
    kind: 'target',
    why: 'One query for the whole tree, and the page every visitor lands on.',
  },
  {
    id: 'visible-forums',
    page: 'Permission filter',
    work: 'forumIdsWhere(actor, thread.view)',
    p95Ms: 40,
    kind: 'target',
    why: 'Every list page pays this before it reads anything, so its cost multiplies.',
  },
  {
    id: 'discovery-latest',
    page: 'Latest threads',
    work: 'Discovery page 1, scoped to visible forums',
    p95Ms: 150,
    kind: 'target',
    why:
      'Ordered across the whole board rather than within one forum — the widest scan, ' +
      'and the most run-to-run variance of anything here. It was budgeted at 80ms ' +
      'against a typical p95 near 50, which is 1.6× and breaks the 2–3× rule stated ' +
      'at the top of this file; it duly went red on a noisy run at 110ms with a 621ms ' +
      'outlier. Raised to 150ms — not to make it pass, but because the original number ' +
      'was set tighter than the methodology the rest of the table follows.',
  },
  {
    id: 'search-common',
    page: 'Search, near-universal term',
    work: 'Relevance search for a term matching 96% of the board',
    p95Ms: 300,
    kind: 'target',
    why:
      'The worst query a member can trigger, and the one budget the first load run failed. ' +
      'Relevance ordering is not indexable: `ts_rank_cd` has to score every matching ' +
      'row before it can name the top twenty, so a term matching 2.26M of 2.34M posts ' +
      'cost a p95 of 5.5 seconds with the GIN index present and used. The fix was to ' +
      'bound the ranked set to the most recent 20,000 matches, which measured 98ms — ' +
      'and changes nothing for any term selective enough that the window holds the ' +
      'whole match set, which is every real query. Recorded in mybb-parity.md.',
  },
  {
    id: 'search-rare',
    page: 'Search, rare term',
    work: 'Full-text search for a term with ~1,000 matches',
    p95Ms: 200,
    kind: 'target',
    why:
      'Separated because a fast rare-term search hides a slow common-term one, and here ' +
      'it did: before the window bound these two differed by a factor of 130, and only ' +
      'the pair made it visible that the cost was the match count rather than the code. ' +
      'They still differ, by about 5×, which is the residual and expected shape.',
  },
  {
    id: 'member-profile',
    page: 'Member profile',
    work: 'Profile with counters for a prolific member',
    p95Ms: 60,
    kind: 'target',
    why: "A post count computed live is an aggregate over the member's whole history.",
  },
]

export function findBudget(id: string): Budget | null {
  return BUDGETS.find((budget) => budget.id === id) ?? null
}
