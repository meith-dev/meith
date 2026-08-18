# Performance

<!--
  GENERATED FILE — do not edit.

  Budgets come from packages/testkit/src/load/budgets.ts, which the load runner enforces.
  Measurements come from docs/perf-results.json, written by `pnpm perf measure --record`.
  Cohorts and the traffic mix come from packages/testkit/src/load/cohorts.ts.
  The load run comes from docs/perf-load.json, written by `pnpm perf load --record`.
  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.
-->

The p95 budgets for the pages a board’s traffic actually goes to, what the
last recorded run measured against a full-scale board one read at a time,
and what a board full of members reading at once measured on the same data.

## The board these numbers came from

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

The absolute numbers belong to that machine. What travels between machines
is the **shape**: which scenarios sit near their budget, and whether a deep
page costs more than a first page. Compare ratios, not milliseconds.

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

Every measurement above is one read at a time. This is the same board with
members on it: each one asks for a page every 10 seconds, drawn from the
mix below, through the single connection pool one process has —
**3 connections**, which is the shipped default and not a tuned number.

Arrival times are on a fixed schedule rather than a request-then-sleep loop.
That distinction is the whole measurement: a loop that sleeps *after* each
response slows its own arrivals down exactly when the board gets slow, so it
reports a queue as if it were an idle system. **Lateness** is what that loop
cannot see — how long a request sat before it even started, because every
connection was busy. It moves first, and it moves before the p95 does.

| Active members | Offered | Served | Budget | | p50 | p95 | p99 | Late p95 |
|---:|---:|---:|---:|---|---:|---:|---:|---:|
| 50 | 5/s | 5/s | 80 ms | target | 3.0 ms | 32.3 ms | 40.1 ms | 1.0 ms |
| 250 | 25/s | 25/s | 80 ms | target | 2.3 ms | 29.5 ms | 41.0 ms | 0.6 ms |
| 1,000 | 100/s | 99/s | 80 ms | target | 2.2 ms | 30.0 ms | 48.5 ms | 0.6 ms |
| 2,500 | 250/s | 250/s | 100 ms | target | 2.8 ms | 33.5 ms | 63.7 ms | 1.0 ms |
| 4,250 | 425/s | 425/s | 300 ms | target | 29.6 ms | 142.2 ms | 257.3 ms | 3.6 ms |
| 5,000 | 500/s | 501/s | 4000 ms | limit | 576.8 ms | 1570.1 ms | 1980.5 ms | 4.7 ms |

Each rung discards its first 10 seconds, then measures until it has both 400 requests and a steady window to put them in.

## The same pages, under that load

From 50 members to 2,500 the p95 of the mix barely moves — 32.3 ms to 33.5 ms, across 50× the traffic. That flatness is not the board being idle; it is what a mixed p95 measures. A p95 is set by the slowest one request in twenty, and search and discovery are about that share of the traffic, so until the pool runs out the mixed p95 mostly reports which pages are in the mix rather than how many members are on the board.

The per-page breakdown is where load shows earlier, and says which pages it
shows in first.

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

Every row is a p95 in milliseconds, and the column heading is how many members
were on the board. A row that climbs left to right is a page that costs more
when the board is busy; a row that does not is a page whose cost is its own.

The scoped reads —
*Latest threads*, *Search, near-universal term*, *Search, rare term* —
pay the permission filter first, in the same request, exactly as a page does.
Their numbers here are therefore the filter plus the read, and are not
comparable with the single-read measurement of the same id above.

### 5,000 active members

Over the shoulder, and here to say where the shoulder is. This is a limit, not a target: five hundred requests a second is past what one process at the default pool of three absorbs, the requests still start on time — lateness stays near zero — and then they queue inside the pool, which is why the p95 goes to seconds while every rung below it is in milliseconds. It is recorded so the shoulder cannot move down quietly. Where it should be is an open question for whoever sizes a deployment: more processes, a larger pool, or accepting that a board this busy has outgrown one of them.

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
| Forum listing, as a member | `threads_forum_listing_idx` | yes | 1.9 ms |
| Forum listing, as a moderator | `threads_forum_listing_all_idx` | yes | 1.8 ms |
| Thread page, as a member | `posts_thread_visible_idx` | yes | 0.0 ms |
| Thread page, as a moderator | `posts_thread_all_idx` | yes | 0.0 ms |
| Moderation queue | `posts_forum_visibility_idx` | yes | 1.4 ms |

Each partial index has an unfiltered twin, and the twins are checked too. A
moderator seeing unapproved and deleted content *cannot* use the partial
index — their predicate does not imply it — so without the twin their forum
view is a sequential scan. That failure is invisible to every test written
from a member’s point of view, which is most of them.

## What each scenario is and why it is measured

### Thread, page 1

`thread-page-first` — listThread(limit 20) on a long thread.

The single most requested page on any forum. Everything else is rounding.

### Thread, deep page

`thread-page-deep` — listThread(afterId) far into a long thread.

The keyset claim. Under OFFSET this degrades with depth; it must not.

### Forum, page 1

`forum-page-first` — listForum(limit 20) on the busiest forum.

Sticky-first ordering over the largest thread set on the board.

### Forum, deep page

`forum-page-deep` — listForum(after cursor) deep into the busiest forum.

Same keyset claim on the other axis, and the one an archive crawler hits.

### Board index

`board-index` — listListing() — every forum with its counters and last post.

One query for the whole tree, and the page every visitor lands on.

### Permission filter

`visible-forums` — forumIdsWhere(actor, thread.view).

Every list page pays this before it reads anything, so its cost multiplies.

### Latest threads

`discovery-latest` — Discovery page 1, scoped to visible forums.

Ordered across the whole board rather than within one forum — the widest scan, and the most run-to-run variance of anything here. It was budgeted at 80ms against a typical p95 near 50, which is 1.6× and breaks the 2–3× rule stated at the top of this file; it duly went red on a noisy run at 110ms with a 621ms outlier. Raised to 150ms — not to make it pass, but because the original number was set tighter than the methodology the rest of the table follows.

### Search, near-universal term

`search-common` — Relevance search for a term matching 96% of the board.

The worst query a member can trigger, and the one budget the first load run failed. Relevance ordering is not indexable: `ts_rank_cd` has to score every matching row before it can name the top twenty, so a term matching 2.26M of 2.34M posts cost a p95 of 5.5 seconds with the GIN index present and used. The fix was to bound the ranked set to the most recent 20,000 matches, which measured 98ms — and changes nothing for any term selective enough that the window holds the whole match set, which is every real query. Recorded in mybb-parity.md.

### Search, rare term

`search-rare` — Full-text search for a term with ~1,000 matches.

Separated because a fast rare-term search hides a slow common-term one, and here it did: before the window bound these two differed by a factor of 130, and only the pair made it visible that the cost was the match count rather than the code. They still differ, by about 5×, which is the residual and expected shape.

### Member profile

`member-profile` — Profile with counters for a prolific member.

A post count computed live is an aggregate over the member's whole history.
