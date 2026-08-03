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
 * The distinction exists because one scenario here is genuinely slow and cannot
 * be fixed without a decision nobody has taken yet (open question 6). The
 * alternatives were both worse: delete the scenario and the slowness becomes
 * undocumented, or leave the budget at its target and CI is permanently red —
 * and a build that is always red is a build nobody reads.
 *
 * A `limit` is a debt with a number on it, not a pass mark.
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
    why: 'The keyset claim (F31). Under OFFSET this degrades with depth; it must not.',
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
    why: 'One query for the whole tree (F16), and the page every visitor lands on.',
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
    p95Ms: 80,
    kind: 'target',
    why: 'Ordered across the whole board rather than within one forum — the widest scan.',
  },
  {
    id: 'search-common',
    page: 'Search, near-universal term',
    work: 'Relevance search for a term matching 96% of the board',
    p95Ms: 9_000,
    kind: 'limit',
    why:
      'A **measured limit, not a target** — see open question 6. Relevance ordering is ' +
      'not indexable: `order by ts_rank_cd(...)` has to score every matching row before ' +
      'it can name the top twenty, so a term matching 2.26M of 2.34M posts costs six ' +
      'seconds and no index changes that. The GIN index is present and used; the work is ' +
      'the ranking. `search-rare` is the same code path over 1,171 matches at 46ms, ' +
      'which localises the cost to the size of the match set rather than to the query. ' +
      'The fix is to bound the candidate set — ranking the most recent N matches instead ' +
      'of all of them measured 140ms — but that changes which results a member sees, ' +
      'which is a decision for a human rather than for this pass.',
  },
  {
    id: 'search-rare',
    page: 'Search, rare term',
    work: 'Full-text search for a term with ~1,000 matches',
    p95Ms: 200,
    kind: 'target',
    why:
      'Separated because a fast rare-term search can hide a slow common-term one — and ' +
      'here it does exactly that, by a factor of 130. Together the two scenarios say the ' +
      'cost is the match count, not the code.',
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
