# Performance

<!--
  GENERATED FILE — do not edit.

  Budgets come from packages/testkit/src/load/budgets.ts, which the load runner enforces.
  Measurements come from docs/perf-results.json, written by `pnpm perf measure --record`.
  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.
-->

The p95 budgets for the pages a forum’s traffic actually goes to, and what
the last recorded run measured against a full-scale board.

## The board these numbers came from

| | |
|---|---|
| Posts | 2,343,847 |
| Threads | 100,030 |
| Longest thread | 14,741 posts |
| Iterations | 60 per scenario, 8 discarded |
| Machine | 4× Intel(R) Xeon(R) Processor @ 2.80GHz, 16 GB |
| Runtime | Node v22.22.2 on linux-x64 |
| Measured | 2026-08-03 |

The absolute numbers belong to that machine. What travels between machines
is the **shape**: which scenarios sit near their budget, and whether a deep
page costs more than a first page. Compare ratios, not milliseconds.

## Budgets and measurements

| Page | Budget | | Measured p95 | p50 | p99 | Used |
|---|---:|---|---:|---:|---:|---:|
| Thread, page 1 | 50 ms | target | 3.2 ms | 2.4 ms | 5.6 ms | 6% |
| Thread, deep page | 60 ms | target | 15.8 ms | 12.5 ms | 16.9 ms | 26% |
| Forum, page 1 | 50 ms | target | 6.6 ms | 5.8 ms | 9.7 ms | 13% |
| Forum, deep page | 60 ms | target | 6.4 ms | 4.3 ms | 7.1 ms | 11% |
| Board index | 80 ms | target | 1.7 ms | 1.3 ms | 4.0 ms | 2% |
| Permission filter | 40 ms | target | 5.7 ms | 3.9 ms | 7.5 ms | 14% |
| Latest threads | 80 ms | target | 51.9 ms | 38.9 ms | 54.6 ms | 65% |
| Search, near-universal term | 9000 ms | limit | 5412.0 ms | 5091.8 ms | 5472.8 ms | 60% |
| Search, rare term | 200 ms | target | 33.9 ms | 31.1 ms | 54.3 ms | 17% |
| Member profile | 60 ms | target | 2.1 ms | 1.3 ms | 6.2 ms | 4% |

A **target** is a number the page is expected to meet, set with headroom over
what was measured. A **limit** is a number that was measured, is not considered
good, and is recorded anyway so it cannot get worse quietly — a debt with a
number on it, not a pass mark. One entry is a limit:

- **Search, near-universal term** — Relevance search for a term matching 96% of the board.

## What each scenario is and why it is measured

### Thread, page 1

`thread-page-first` — listThread(limit 20) on a long thread.

The single most requested page on any forum. Everything else is rounding.

### Thread, deep page

`thread-page-deep` — listThread(afterId) far into a long thread.

The keyset claim (F31). Under OFFSET this degrades with depth; it must not.

### Forum, page 1

`forum-page-first` — listForum(limit 20) on the busiest forum.

Sticky-first ordering over the largest thread set on the board.

### Forum, deep page

`forum-page-deep` — listForum(after cursor) deep into the busiest forum.

Same keyset claim on the other axis, and the one an archive crawler hits.

### Board index

`board-index` — listListing() — every forum with its counters and last post.

One query for the whole tree (F16), and the page every visitor lands on.

### Permission filter

`visible-forums` — forumIdsWhere(actor, thread.view).

Every list page pays this before it reads anything, so its cost multiplies.

### Latest threads

`discovery-latest` — Discovery page 1, scoped to visible forums.

Ordered across the whole board rather than within one forum — the widest scan.

### Search, near-universal term

`search-common` — Relevance search for a term matching 96% of the board.

A **measured limit, not a target** — see open question 6. Relevance ordering is not indexable: `order by ts_rank_cd(...)` has to score every matching row before it can name the top twenty, so a term matching 2.26M of 2.34M posts costs six seconds and no index changes that. The GIN index is present and used; the work is the ranking. `search-rare` is the same code path over 1,171 matches at 46ms, which localises the cost to the size of the match set rather than to the query. The fix is to bound the candidate set — ranking the most recent N matches instead of all of them measured 140ms — but that changes which results a member sees, which is a decision for a human rather than for this pass.

### Search, rare term

`search-rare` — Full-text search for a term with ~1,000 matches.

Separated because a fast rare-term search can hide a slow common-term one — and here it does exactly that, by a factor of 130. Together the two scenarios say the cost is the match count, not the code.

### Member profile

`member-profile` — Profile with counters for a prolific member.

A post count computed live is an aggregate over the member's whole history.
