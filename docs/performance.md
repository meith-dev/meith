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
| Thread, page 1 | 50 ms | target | 3.2 ms | 2.5 ms | 4.8 ms | 6% |
| Thread, deep page | 60 ms | target | 18.8 ms | 9.0 ms | 21.7 ms | 31% |
| Forum, page 1 | 50 ms | target | 8.6 ms | 7.5 ms | 9.8 ms | 17% |
| Forum, deep page | 60 ms | target | 7.0 ms | 3.9 ms | 8.3 ms | 12% |
| Board index | 80 ms | target | 1.9 ms | 1.2 ms | 3.4 ms | 2% |
| Permission filter | 40 ms | target | 5.5 ms | 3.6 ms | 6.1 ms | 14% |
| Latest threads | 80 ms | target | 50.7 ms | 35.4 ms | 56.1 ms | 63% |
| Search, near-universal term | 300 ms | target | 100.5 ms | 91.6 ms | 145.6 ms | 33% |
| Search, rare term | 200 ms | target | 35.9 ms | 19.7 ms | 96.9 ms | 18% |
| Member profile | 60 ms | target | 1.9 ms | 1.2 ms | 2.6 ms | 3% |

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

The worst query a member can trigger, and it was the one budget F89 failed. Relevance ordering is not indexable: `ts_rank_cd` has to score every matching row before it can name the top twenty, so a term matching 2.26M of 2.34M posts cost a p95 of 5.5 seconds with the GIN index present and used. The fix was to bound the ranked set to the most recent 20,000 matches, which measured 98ms — and changes nothing for any term selective enough that the window holds the whole match set, which is every real query. Recorded in mybb-parity.md.

### Search, rare term

`search-rare` — Full-text search for a term with ~1,000 matches.

Separated because a fast rare-term search hides a slow common-term one, and here it did: before the window bound these two differed by a factor of 130, and only the pair made it visible that the cost was the match count rather than the code. They still differ, by about 5×, which is the residual and expected shape.

### Member profile

`member-profile` — Profile with counters for a prolific member.

A post count computed live is an aggregate over the member's whole history.
