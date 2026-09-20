export type BudgetKind = 'target' | 'limit'

export interface Budget {
  readonly id: string
  readonly page: string
  readonly work: string
  readonly p95Ms: number
  readonly kind: BudgetKind
  readonly why: string
}

export const BUDGETS: readonly Budget[] = [
  {
    id: 'thread-page-first',
    page: 'Thread, page 1',
    work: 'listThread(limit 20) on a long thread',
    p95Ms: 50,
    kind: 'target',
    why: 'Baseline first-page thread read.',
  },
  {
    id: 'thread-page-deep',
    page: 'Thread, deep page',
    work: 'listThread(afterId) far into a long thread',
    p95Ms: 60,
    kind: 'target',
    why: 'Checks cursor pagination deep into a thread.',
  },
  {
    id: 'forum-page-first',
    page: 'Forum, page 1',
    work: 'listForum(limit 20) on the busiest forum',
    p95Ms: 50,
    kind: 'target',
    why: 'Checks pinned-first ordering in the largest forum.',
  },
  {
    id: 'forum-page-deep',
    page: 'Forum, deep page',
    work: 'listForum(after cursor) deep into the busiest forum',
    p95Ms: 60,
    kind: 'target',
    why: 'Checks cursor pagination deep into a forum.',
  },
  {
    id: 'board-index',
    page: 'Board index',
    work: 'listListing() — every forum with its counters and last post',
    p95Ms: 80,
    kind: 'target',
    why: 'Checks the forum tree with stored counts and latest-post data.',
  },
  {
    id: 'visible-forums',
    page: 'Permission filter',
    work: 'forumIdsWhere(actor, thread.view)',
    p95Ms: 40,
    kind: 'target',
    why: 'Measures the authorisation scope used before content reads.',
  },
  {
    id: 'discovery-latest',
    page: 'Latest threads',
    work: 'Discovery page 1, scoped to visible forums',
    p95Ms: 150,
    kind: 'target',
    why: 'Checks cross-forum ordering with headroom for run-to-run variance.',
  },
  {
    id: 'search-common',
    page: 'Search, near-universal term',
    work: 'Relevance search for a term matching 96% of the board',
    p95Ms: 300,
    kind: 'target',
    why: 'Measures relevance ranking for a broad match set. Ranking is bounded to the most recent 20,000 matches.',
  },
  {
    id: 'search-rare',
    page: 'Search, rare term',
    work: 'Full-text search for a term with ~1,000 matches',
    p95Ms: 200,
    kind: 'target',
    why: 'Measures selective full-text search separately from common-term ranking.',
  },
  {
    id: 'member-profile',
    page: 'Member profile',
    work: 'Profile with counters for a prolific member',
    p95Ms: 60,
    kind: 'target',
    why: 'Checks profile reads using stored counters.',
  },
]

export function findBudget(id: string): Budget | null {
  return BUDGETS.find((budget) => budget.id === id) ?? null
}
