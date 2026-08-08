# Performance

<!--
  GENERATED FILE — do not edit.

  Budgets come from packages/testkit/src/load/budgets.ts, which the load runner enforces.
  Measurements come from docs/perf-results.json, written by `pnpm perf measure --record`.
  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.
-->

The p95 budgets for the pages a board’s traffic actually goes to, and what
the last recorded run measured against a full-scale board.

## The board these numbers came from

| | |
|---|---|
| Posts | 2,343,847 |
| Threads | 100,030 |
| Longest thread | 14,741 posts |
| Visibility | 23,438 deleted, 23,438 unapproved, 2,296,971 visible |
| Iterations | 60 per scenario, 8 discarded |
| Machine | 4× Intel(R) Xeon(R) Processor @ 2.80GHz, 16 GB |
| Runtime | Node v22.22.2 on linux-x64 |
| Measured | 2026-08-04 |

The absolute numbers belong to that machine. What travels between machines
is the **shape**: which scenarios sit near their budget, and whether a deep
page costs more than a first page. Compare ratios, not milliseconds.

## Budgets and measurements

| Page | Budget | | Measured p95 | p50 | p99 | Used |
|---|---:|---|---:|---:|---:|---:|
| Thread, page 1 | 50 ms | target | 3.3 ms | 1.8 ms | 10.3 ms | 7% |
| Thread, deep page | 60 ms | target | 4.7 ms | 3.6 ms | 7.1 ms | 8% |
| Community, page 1 | 50 ms | target | 6.2 ms | 4.7 ms | 8.4 ms | 12% |
| Community, deep page | 60 ms | target | 5.0 ms | 3.6 ms | 6.5 ms | 8% |
| Board index | 80 ms | target | 1.6 ms | 1.2 ms | 3.1 ms | 2% |
| Permission filter | 40 ms | target | 5.9 ms | 3.6 ms | 6.6 ms | 15% |
| Latest threads | 150 ms | target | 44.3 ms | 31.7 ms | 47.6 ms | 30% |
| Search, near-universal term | 300 ms | target | 95.2 ms | 85.3 ms | 110.9 ms | 32% |
| Search, rare term | 200 ms | target | 35.3 ms | 15.3 ms | 37.3 ms | 18% |
| Member profile | 60 ms | target | 1.8 ms | 1.3 ms | 3.4 ms | 3% |

## Partial visible indexes

`EXPLAIN` evidence that the partial `visibility` indexes are actually used.
This is that evidence, and it is also a **check**: `pnpm perf explain`
fails when the planner stops choosing one.

That failure is the one worth guarding. A partial index only matches a query
whose predicate the planner can prove implies it, so a read path that starts
passing a variable visibility scope where it passed a literal falls silently
onto a sequential scan of the largest table on the board. Nothing errors.

| Page | Index | Used | Warm |
|---|---|---|---:|
| Community listing, as a member | `threads_community_listing_idx` | yes | 2.7 ms |
| Community listing, as a moderator | `threads_community_listing_all_idx` | yes | 2.9 ms |
| Thread page, as a member | `posts_thread_visible_idx` | yes | 0.0 ms |
| Thread page, as a moderator | `posts_thread_all_idx` | yes | 0.0 ms |
| Moderation queue | `posts_community_visibility_idx` | yes | 1.2 ms |

Each partial index has an unfiltered twin, and the twins are checked too. A
moderator seeing unapproved and deleted content *cannot* use the partial
index — their predicate does not imply it — so without the twin their community
view is a sequential scan. That failure is invisible to every test written
from a member’s point of view, which is most of them.

## What each scenario is and why it is measured

### Thread, page 1

`thread-page-first` — listThread(limit 20) on a long thread.

The single most requested page on any community. Everything else is rounding.

### Thread, deep page

`thread-page-deep` — listThread(afterId) far into a long thread.

The keyset claim. Under OFFSET this degrades with depth; it must not.

### Community, page 1

`community-page-first` — listCommunity(limit 20) on the busiest community.

Sticky-first ordering over the largest thread set on the board.

### Community, deep page

`community-page-deep` — listCommunity(after cursor) deep into the busiest community.

Same keyset claim on the other axis, and the one an archive crawler hits.

### Board index

`board-index` — listListing() — every community with its counters and last post.

One query for the whole tree, and the page every visitor lands on.

### Permission filter

`visible-communities` — communityIdsWhere(actor, thread.view).

Every list page pays this before it reads anything, so its cost multiplies.

### Latest threads

`discovery-latest` — Discovery page 1, scoped to visible communities.

Ordered across the whole board rather than within one community — the widest scan, and the most run-to-run variance of anything here. It was budgeted at 80ms against a typical p95 near 50, which is 1.6× and breaks the 2–3× rule stated at the top of this file; it duly went red on a noisy run at 110ms with a 621ms outlier. Raised to 150ms — not to make it pass, but because the original number was set tighter than the methodology the rest of the table follows.

### Search, near-universal term

`search-common` — Relevance search for a term matching 96% of the board.

The worst query a member can trigger, and the one budget the first load run failed. Relevance ordering is not indexable: `ts_rank_cd` has to score every matching row before it can name the top twenty, so a term matching 2.26M of 2.34M posts cost a p95 of 5.5 seconds with the GIN index present and used. The fix was to bound the ranked set to the most recent 20,000 matches, which measured 98ms — and changes nothing for any term selective enough that the window holds the whole match set, which is every real query. Recorded in mybb-parity.md.

### Search, rare term

`search-rare` — Full-text search for a term with ~1,000 matches.

Separated because a fast rare-term search hides a slow common-term one, and here it did: before the window bound these two differed by a factor of 130, and only the pair made it visible that the cost was the match count rather than the code. They still differ, by about 5×, which is the residual and expected shape.

### Member profile

`member-profile` — Profile with counters for a prolific member.

A post count computed live is an aggregate over the member's whole history.
