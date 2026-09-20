# Performance

<!--
  GENERATED FILE — do not edit.

  Budgets come from packages/testkit/src/load/budgets.ts, which the load runner enforces.
  Measurements come from docs/reference/perf-results.json, written by `pnpm perf measure --record`.
  Cohorts and the traffic mix come from packages/testkit/src/load/cohorts.ts.
  The load run comes from docs/reference/perf-load.json, written by `pnpm perf load --record`.
  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.
-->

Recorded database-read timings, budgets and concurrent-load results. These are single-process measurements with an in-process cache and no Redis. Measure your own deployment; shared-cache results can differ.

## Test environment

| | |
|---|---|
| Posts | 2,343,847 |
| Threads | 100,030 |
| Longest thread | 14,741 posts |
| Visibility | 21,012 deleted, 21,012 unapproved, 2,301,823 visible |
| Iterations | 60 per scenario, 8 discarded |
| Machine | 4× Intel(R) Xeon(R) Processor @ 2.10GHz, 16 GB |
| Runtime | Node v22.22.2 on linux-x64 |
| Measured | 2026-08-18 |

Results apply to the recorded machine and workload; they are not a capacity guarantee.

## Budgets and measurements

| Page | Budget | | Measured p95 | p50 | p99 | Used |
|---|---:|---|---:|---:|---:|---:|
| Thread, page 1 | 50 ms | target | 2.9 ms | 2.1 ms | 4.1 ms | 6% |
| Thread, deep page | 60 ms | target | 9.8 ms | 6.3 ms | 11.1 ms | 16% |
| Forum, page 1 | 50 ms | target | 6.3 ms | 4.4 ms | 7.0 ms | 13% |
| Forum, deep page | 60 ms | target | 4.6 ms | 3.2 ms | 5.4 ms | 8% |
| Board index | 80 ms | target | 1.5 ms | 1.1 ms | 2.7 ms | 2% |
| Permission filter | 40 ms | target | 4.6 ms | 3.2 ms | 7.6 ms | 11% |
| Latest threads | 150 ms | target | 36.3 ms | 27.5 ms | 60.1 ms | 24% |
| Search, near-universal term | 300 ms | target | 57.0 ms | 49.9 ms | 78.6 ms | 19% |
| Search, rare term | 200 ms | target | 43.1 ms | 26.3 ms | 53.5 ms | 22% |
| Member profile | 60 ms | target | 1.4 ms | 1.1 ms | 2.8 ms | 2% |

## Under concurrent load

Fixed-schedule traffic: one page per member every 10 seconds, using 3 database connections.

Late p95 measures the delay before a scheduled request starts. Fixed arrivals expose queueing that a response-then-sleep loop would hide.

| Active members | Offered | Served | Budget | | p50 | p95 | p99 | Late p95 |
|---:|---:|---:|---:|---|---:|---:|---:|---:|
| 50 | 5/s | 5/s | 80 ms | target | 3.0 ms | 32.3 ms | 40.1 ms | 1.0 ms |
| 250 | 25/s | 25/s | 80 ms | target | 2.3 ms | 29.5 ms | 41.0 ms | 0.6 ms |
| 1,000 | 100/s | 99/s | 80 ms | target | 2.2 ms | 30.0 ms | 48.5 ms | 0.6 ms |
| 2,500 | 250/s | 250/s | 100 ms | target | 2.8 ms | 33.5 ms | 63.7 ms | 1.0 ms |
| 4,250 | 425/s | 425/s | 300 ms | target | 29.6 ms | 142.2 ms | 257.3 ms | 3.6 ms |
| 5,000 | 500/s | 501/s | 4000 ms | limit | 576.8 ms | 1570.1 ms | 1980.5 ms | 4.7 ms |

Each rung discards its first 10 seconds, then measures until it has both 400 requests and a steady window to put them in.

## Per-page load results

Mixed p95: 32.3 ms at 50 members to 33.5 ms at 2,500 members (50× traffic). The traffic mix affects this aggregate; inspect per-page timings too.

Per-page p95 by active-member count:

| Page | Share | 50 | 250 | 1,000 | 2,500 | 4,250 | 5,000 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Thread, page 1 | 38% | 3.7 ms | 2.9 ms | 4.4 ms | 9.9 ms | 115.9 ms | 712.6 ms |
| Thread, deep page | 10% | 4.7 ms | 3.4 ms | 5.0 ms | 10.3 ms | 117.8 ms | 707.8 ms |
| Forum, page 1 | 20% | 7.7 ms | 6.0 ms | 7.7 ms | 13.8 ms | 115.6 ms | 711.9 ms |
| Forum, deep page | 4% | 5.6 ms | 5.3 ms | 6.2 ms | 12.3 ms | 105.3 ms | 701.3 ms |
| Board index | 15% | 2.3 ms | 1.8 ms | 2.5 ms | 9.9 ms | 107.5 ms | 708.1 ms |
| Latest threads | 5% | 36.6 ms | 43.1 ms | 45.9 ms | 67.2 ms | 328.2 ms | 2065.5 ms |
| Search, near-universal term | 1% | 73.9 ms | 61.1 ms | 74.0 ms | 91.1 ms | 371.0 ms | 2090.2 ms |
| Search, rare term | 2% | 42.1 ms | 40.2 ms | 47.6 ms | 64.4 ms | 355.9 ms | 2072.3 ms |
| Member profile | 5% | 2.6 ms | 1.9 ms | 5.2 ms | 10.6 ms | 107.3 ms | 691.1 ms |

Scoped reads (Latest threads, Search, near-universal term, Search, rare term) include permission filtering. They are not directly comparable to single-read timings.

### 5,000 active members

At 500 requests per second, the recorded run queues inside the three-connection pool. This ceiling detects regressions; it is not a recommended operating load. Measure additional processes or pool capacity before deploying at this rate.

## Partial visible indexes

`pnpm perf explain` checks that the planner uses the expected indexes.

| Page | Index | Used | Warm |
|---|---|---|---:|
| Forum listing, as a member | `threads_forum_listing_idx` | yes | 1.9 ms |
| Forum listing, as a moderator | `threads_forum_listing_all_idx` | yes | 1.8 ms |
| Thread page, as a member | `posts_thread_visible_idx` | yes | 0.0 ms |
| Thread page, as a moderator | `posts_thread_all_idx` | yes | 0.0 ms |
| Moderation queue | `posts_forum_visibility_idx` | yes | 1.4 ms |

Both visible-content partial indexes and their unfiltered counterparts are checked. Moderator queries need the unfiltered indexes when their scope includes hidden content.

## Scenarios

### Thread, page 1

`thread-page-first` — listThread(limit 20) on a long thread.

Baseline first-page thread read.

### Thread, deep page

`thread-page-deep` — listThread(afterId) far into a long thread.

Checks cursor pagination deep into a thread.

### Forum, page 1

`forum-page-first` — listForum(limit 20) on the busiest forum.

Checks pinned-first ordering in the largest forum.

### Forum, deep page

`forum-page-deep` — listForum(after cursor) deep into the busiest forum.

Checks cursor pagination deep into a forum.

### Board index

`board-index` — listListing() — every forum with its counters and last post.

Checks the forum tree with stored counts and latest-post data.

### Permission filter

`visible-forums` — forumIdsWhere(actor, thread.view).

Measures the authorisation scope used before content reads.

### Latest threads

`discovery-latest` — Discovery page 1, scoped to visible forums.

Checks cross-forum ordering with headroom for run-to-run variance.

### Search, near-universal term

`search-common` — Relevance search for a term matching 96% of the board.

Measures relevance ranking for a broad match set. Ranking is bounded to the most recent 20,000 matches.

### Search, rare term

`search-rare` — Full-text search for a term with ~1,000 matches.

Measures selective full-text search separately from common-term ranking.

### Member profile

`member-profile` — Profile with counters for a prolific member.

Checks profile reads using stored counters.
