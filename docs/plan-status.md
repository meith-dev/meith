# Plan status

Feature-by-feature status against [`roadmap.md`](./roadmap.md). This is the
tracking file: **one row per plan feature, always**. `progress.md` says what to do
next in prose, `deviations.md` records decisions and divergences, and the roadmap
defines scope, dependencies, and acceptance criteria.

## How to use it

- Update the row in the **same PR** as the feature. A green gate with a stale row
  here is worse than no row.
- A feature is `DONE` only when its plan acceptance criteria are met **and** the
  Definition of Done holds. Anything else is `PARTIAL`, with the gap named in the
  row — never "mostly done".
- `PARTIAL` rows must say what is missing, not what is present. The missing half
  is the useful information.

## Legend

| Mark | Meaning |
|---|---|
| `DONE` | Acceptance criteria met and verified. Evidence column says how. |
| `PARTIAL` | Some of it exists. The gap is named explicitly. |
| `TODO` | Not started. Schema may exist — that is noted, and is not the feature. |
| `GATE` | A ⛔ gate. Nothing downstream starts until it is green. |

## How this audit was done

Last audited **2026-07-31** (re-audited after F52–F54 closed Phase 4, and after the flagged leftovers were paid down), against the working tree, not from memory:
`pnpm verify` (1870 tests), `docker build` + a booted image, `pnpm test:e2e`, plus direct inspection of the
migration's `CREATE TABLE` list, each package's `src/` contents, `.github/workflows/ci.yml`,
and the CLI's registered commands. Where a row says a thing is missing, the file
was looked for and was not there.

**`pnpm test:e2e` is green (3 passed)** — and still covers *reading* only.
Fixture mode has no writer, so nothing in Phase 3 or Phase 4 has browser-level
proof: not posting, not the inline-moderation checkboxes whose whole claim is
that the HTML `form` attribute submits them with scripting off. See
`progress.md`, where that gap is the standing blocker.

Counts below are features, not effort. Several `TODO` rows are days of work; a
couple of `PARTIAL` rows are an afternoon.

| Phase | Features | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| 0 — Skeleton | 14 | 13 | 1 | 0 |
| 1 — Identity, tree, permissions | 10 | 10 | 0 | 0 |
| 2 — Themes and reading | 11 | 9 | 2 | 0 |
| 3 — Posting | 11 | 5 | 0 | 6 |
| 4 — Moderation | 8 | 8 | 0 | 0 |
| 5 — Members and social | 8 | 0 | 0 | 8 |
| 6 — Admin CP | 9 | 0 | 0 | 9 |
| 7 — Search and discovery | 5 | 0 | 0 | 5 |
| 8 — Public APIs | 5 | 0 | 0 | 5 |
| 9 — Ship it | 8 | 0 | 0 | 8 |
| **Total** | **89** | **41** | **3** | **45** |

---

## Phase 0 — Skeleton you can deploy

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Monorepo and Next.js scaffold | `DONE` | Workspaces + Turborepo; `next` pinned exact `16.2.6`, `react` `19.2.0` — no caret. `strict` + `noUncheckedIndexedAccess` on in `tsconfig.base.json`. |
| F02 | Config and environment validation | `DONE` | Zod schema in `packages/core/src/env.ts`; lazy proxy (D1); build-phase vs runtime split (D18). `process.env` confined by guard + ESLint rule. 11 tests. |
| F03 | Database package | `DONE` | Drizzle + postgres.js (`prepare: false`, small pool), forward-only migrations, transaction helper with rollback-on-throw. **Contradiction resolved 2026-07-30:** F03's "up *and down*" is superseded by invariant 32 — forward-only governs, and recovery is by restore, not reversal (D28). Testcontainers is substituted by PGlite, which runs the real generated SQL. |
| F04 | Deploy on both targets | `DONE`* | Dockerfile (multi-stage, standalone) + `docker-compose.yml`. **`apps/worker` is real**: an in-process loop calling `tick()` on the same task code the app runs, refusing fixture mode, finishing the tick in flight on SIGTERM. One image, three roles behind `FORUM_ROLE` (`web`/`worker`/`migrate`), so they cannot drift. CI's new `image` job **builds the image and boots every role**, and asserts the board renders against real Postgres rather than merely answering `/api/health`. Building and booting it for the first time found six things that had rotted unseen, all fixed: no `.dockerignore` at all (so a developer's gitignored `apps/forum/.env` was copied in — patterns must be `**/.env`, since dockerignore is anchored to the context root); the build stage copied two of the many pnpm workspace `node_modules` trees and only worked because the host's were dragged in behind it; three package manifests missing from a hand-maintained COPY list, now a `--parents` glob; three different pnpm versions (image took latest, dev 10.6, CI pinned 9), now one `packageManager`; compose's migrate service ran `drizzle-kit`, absent from the pruned standalone tree; and **`@forum/db` was loaded by synchronous `require()` in three modules**, which Turbopack resolves to the pending namespace of an async module — so the Postgres path threw `getDb is not a function` and the image could never serve a Postgres board (D54, guard `R2 no-lazy-require-of-db`). *The 12-minute CI budget is not measured, and the `image` job adds a Docker build to it. |
| F05 | Driver interfaces | `DONE`* | Interfaces + env selection + every shipped implementation, all four families passing the shared contract suite — which exposed that `PostgresQueue` only worked with postgres.js's result shape (D27). `S3FileStore` lands per [ADR 0002](adr/0002-s3-filestore-dependency.md), passing the same contract with real presigning, key validation, and miss-is-undefined mapping. *Driven through a fake S3 client: that tests this code, not the SDK. An integration run against MinIO would be the remaining rigour, and belongs with F89. F42 is unblocked. |
| F06 | System tick and scheduled tasks | `PARTIAL` | **The tick now runs tasks.** `PostgresTaskRepository` (21 tests on real Postgres, concurrent-claim and lease-overrun both mutation-verified), app-tier workers, and `/api/system/tick` calling `tick()`. **All nine built-in tasks are now registered**: F38 supplied `reconcileCounters` and `flushThreadViews`, F36 added `backfillPostRenders`, and `relayOutbox` gained its Postgres `OutboxReader`, so the omit-rather-than-stub rule (D32) currently omits nothing. Fixture mode returns 503 rather than faking a run. **Gap:** a failing task logs but does not yet raise an admin notification (needs F55); `apps/worker` is still an empty package. |
| F07 | Outbox and event bus | `DONE` | `outbox` table, transactional write helper, drain-to-queue, retry/backoff/dead-letter. Rollback-suppresses-delivery covered. The relay is no longer theoretical: `PostgresOutboxReader` claims with `FOR UPDATE SKIP LOCKED`, the queue drain dispatches a job's `kind` as a handler id, and F38's roll-up is its first consumer (D41). |
| F08 | Settings registry | `DONE` | `packages/settings` registry + `settings`/`setting_groups`; typed accessors; migration-seeded defaults. **Now actually read**: F39's `getSettings()` resolves overrides through the tagged global cache, so `posting.flood_seconds` and `posting.max_length` change board behaviour (D42). Before that, a `forum settings:set` wrote a row nothing consulted. |
| F09 | Errors, logging, error pages | `DONE` | Pino + request-id context, error taxonomy, `error.tsx`/`not-found.tsx`. Redaction covers credentials — tightened in D20 after a token reached the logs via a URL string. |
| F10 | Caching policy harness | `DONE`* | `CacheTags` registry, both drivers, and `cachedGlobal` — read-through, tag-invalidated, driver injected. Guard now catches `getActor`/`getUserId` inside a cached region, and **every guard is probed** by `pnpm guards:probe` against a must-match and a must-not-match sample, so an inert or over-broad rule fails CI. *The "member then guest, guest never gets a cached body" test needs pages that do not exist until F29/F31; it is listed there, not silently skipped. |
| F11 | Boundary lint and testkit | `PARTIAL` | `dependency-cruiser` enforces R2 (127 modules, 0 violations), probe-verified. `@forum/testkit` now has the deterministic seeder (fixed-seed PRNG, batched inserts, genuinely nested tree) and the **query-budget helper**, which counts statements at the driver and names the repeated SQL so an N+1 is identifiable. Mutation-verified: an injected N+1 in `listAll` fails the budget. F16's "one query regardless of depth" is now measured rather than claimed. **Gap:** the harness is PGlite, not Testcontainers, and `FULL_SCALE` (2M posts) is defined but only runnable against real Postgres — PGlite holds the database in process memory. `SMOKE_SCALE` runs in CI. Factories beyond the seeder are not built. |
| F12 | CI pipeline | `DONE` | Three jobs: static checks (guards, lint, depcruise, both typechecks, tests), production build, migrations + drift + Postgres tests. Runtime not yet measured against the 12-minute budget. |
| F13 | Operator CLI (v0) | `DONE`* | Ten commands: `env:check`, `migrate`, `settings:list|get|set`, `user:create`, `user:promote`, `forum:create`, **`task:list`**, **`task:run`**. A board can be set up end to end and its scheduler driven by hand. Passwords are read from stdin, not `argv`. `task:run` runs what is *due* and deliberately does not force: the obvious `--force` hands `tick()` an `intervalSeconds: 0` definition, and `ensureRegistered` writes that interval to the `tasks` row — so a one-off force would silently reschedule the task to run on every tick from then on. It shares `@forum/runtime`'s bundle with the app and the worker, so the CLI cannot drift from what the board actually registers. *`cache:clear` is still absent and still belongs with F70: MemoryCache dies with its process and `revalidateTag` only works inside a Next request, so the honest implementation bumps `cache_versions`. |
| F14 | Conventions document | `DONE` | `docs/nextjs-conventions.md`: where Server Actions live, the `"use client"` rule and why `PostBit` can never cross it, the action-to-command adapter shape, `redirect()` outside the `try`, cache-tag rules, view-model naming, and the testing conventions. Grounded in real file paths, and each rule names the failure it prevents. |

> **Checkpoint 0** — not fully reached. The app deploys and `pnpm build` is green
> from a zero-secret environment, but no cron drives the tick and the CLI cannot
> set up a board.

## Phase 1 — Identity, forum tree, permissions

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F15 | Users and usergroups schema | `DONE` | `users`, `usergroups`, `user_group_memberships`; primary/secondary groups with display flag. The group ladder is seeded by migration `0001_seed_usergroups` — **it was previously not seeded at all** (the initial migration contains zero INSERTs), so a fresh Postgres board had no groups and registration would have failed on a foreign key. 11 tests pin the ids, the ACP/bypass split, and the sequence advance. See D23. |
| F16 | Forum tree schema | `DONE` | Schema (materialised `path`, indexes) + `@forum/forums` (`buildTree`, `planMove`, `planCreate`, `CachedForumRepository`) + `PostgresForumRepository` (`listAll`/`findById`/`create`/`move`). Four-level reparent, one-query read, derived-path create, and tag-invalidated caching all proven; 48 tests, 18 on real Postgres (D22). |
| F17 | Password hashing, sessions, request context | `DONE` | Argon2id via hash-wasm (ADR 0001); opaque sessions, rotation on login, remember-me with reuse→family-burn; `proxy.ts` cookie-only; `getActor()` via `React.cache`. Fixation + location-throttle mutation-verified. |
| F18 | Registration and activation | `DONE` | Server Action + no-JS form; validation, reserved names, case-insensitive uniqueness (D21). All three activation modes covered in the domain suite. |
| F19 | Login, logout, password reset | `DONE` | Four flows as no-JS Server Actions; Postgres-backed lockout; single-use expiring reset tokens. D20 fixed a reset-token leak to the browser. |
| F20 | Permission engine — global layer | `DONE` | `@forum/authorization`: pure `Authorizer`, R4.2 combination (OR / max-with-0 / AND), logged bypasses, `permission_version`. Group-ID lint rule live (D13). |
| F21 | Forum permissions and moderator rights | `DONE` | Nullable-column inheritance, ancestor walk over `path`, `forum_moderators`, `visibleForumIds`. Four-level resolution with overrides at levels 2 and 4 now tested **over real Postgres**, including that a level-3 forum with no row inherits the denial rather than falling back to the group default. `visibleForumIds` was a 32-query N+1 and is now a constant 3, asserted by comparing two board sizes (D26). |
| F22 | ⛔ GATE — Permission matrix suite | `GATE` — green | 388-cell table-driven cross product over actors × contexts × actions; fixture reviewed. The matrix exercises the fixture source, while F21's matching repository/resolution cases are also proven against real Postgres. |
| F23 | Bans and ban filters | `DONE`* | `BanService` + Postgres repositories, glob ban filters applied at **both** registration and login, and `bans.expire` now genuinely runs on the tick. Both acceptance criteria met and mutation-verified: expiry restores the *captured* group, not the default (D29). *No ACP or CLI surface for creating a ban yet — that is F54/F67's screen, not a gap in the mechanism. |
| F24 | Group promotions | `DONE`* | `@forum/groups` (was an empty package): pure rule evaluation with three safety guards, `PromotionService` with preview/apply sharing one evaluation, `group_promotions` table (migration `0002`), Postgres repository with keyset paging, and `promotions.apply` now genuinely runs on the tick. Both acceptance criteria met and mutation-verified (D30). *No ACP surface for editing rules — that is F66's screen. |

> **Checkpoint 1** — reached: register / activate / log in / log out / reset all
> work without JavaScript, the tree exists with per-group overrides, and F22
> proves resolution.

## Phase 2 — Themes and reading the board

F25, F26, and F29–F35 are done; F27/F28 are partial.
`packages/theme-kit` holds the slot registry, the view-model contract and
`defineTheme`; `themes/default` renders the board and auth shell. The content
tables/indexes exist, while content writers and the BBCode package begin in F36.

| ID | Feature | Status | Note |
|---|---|---|---|
| F25 | theme-kit foundation | `DONE`* | 25-slot registry, each declaring server or client kind; `SlotComponent<K>` resolves the kind to a *different* signature (an `async` client slot does not compile); `defineTheme` rejects a bundler-marked client reference in a server slot; `scripts/slot-kinds.mjs` catches the case neither can — a `"use client"` module behind a server slot — fails on a slot map it cannot statically read, and fails on **zero** manifests. Probed both ways and mutation-verified against the real theme. `defineTheme`/`resolveTheme` with `extends` (nearest-wins over a three-level chain, cycle and duplicate-key rejection), typed JSON-shaped view models with a two-sided compile-time proof (`view-models.type-test.ts`). Slots are flat by design — a slot never renders another slot; see **D35** for why and what it costs. Load-bearing: `themes/default` fills five slots and `app/(auth)/layout.tsx` renders through them. **The slot list is derived rather than transcribed from R6 — D35 records that R6 wins where it disagrees.** *`PostFormModel` changed shape at F39: the form element is a region, because it carries a Server Action reference and those never cross the theme contract (D42). The contract freeze is F77. |
| F26 | Token pipeline and runtime overrides | `DONE` | `PostgresThemeRepository` reads only `token_overrides`/`custom_css`; `getThemeRuntimeStyle()` is tagged with `theme:<key>` through Next's distributed cache and injects one server-rendered cascade after compiled defaults. Token keys/values and custom CSS are validated when loaded; the reusable validators are the F68 write seam. Browser chrome colours are derived from effective `background` values by tested OKLCH→sRGB conversion, and the default-theme pair is now exact-match tested. |
| F27 | Default theme — shell | `PARTIAL` | Six shell slots — `Shell`, `Header`, `UserPanel`, `Navigation`, `Footer`, `Notice` — composed once in `PageShell` and rendered by both the board and auth route groups, so the auth screens are part of the board rather than a separate unstyled island. Skip link, header, breadcrumb, footer stating the timestamp zone; log out is a POST form the app renders into the panel slot (D38). Tailwind now scans `themes/` — it never did (D35). **Gap:** `BoardStats` and `WhoIsOnline` need F75; the ACP shell is F63. |
| F28 | Threads and posts schema | `PARTIAL` | Tables, `visibility` columns, and R3.5 partial indexes exist; a content seeder and writers do not. The `forums` counters and last-post triplet the board index reads now have both a maintainer and a repair path (F38); what is still missing is a route that creates content (F39) and the realistic 2M-post seed with `EXPLAIN` evidence this row promises. |
| F29 | Board index | `DONE` | Category blocks, forum rows with counters, last post, subforum links, and the empty-forum and deleted-author paths. `listListing()` is one query regardless of forum count or depth, asserted by F11's budget helper across **two board sizes** and mutation-verified against an injected N+1; it is deliberately excluded from the forum-tree cache, pinned by two tests (D38). Visibility filters subtrees **whole** — answering open question 5 — with the orphan pass iterated to a fixed point so a grandchild cannot surface. Renders in fixture mode against `FixtureForumRepository`, whose writes throw rather than pretend. |
| F30 | Forum display | `DONE` | `/forum/[id]-[slug]` validates a visible forum before reading it, renders `ForumDisplay` + `ThreadRow`/`SubforumList`/`Pagination` slots, and uses an opaque keyset cursor over sticky / last-post time / id. `PostgresThreadRepository` makes one partial-index-backed statement per page; a real-PGlite budget test covers 3 and 50 threads, and the equal-timestamp tie-breaker is tested. Fixture mode has the same paged read. |
| F31 | Thread view | `DONE` | `/thread/[id]-[slug]` resolves the visible forum matrix before it reads posts, then composes `ThreadView`, `PostBit`, `PostActions`, and `Pagination`. `PostgresPostRepository` keyset-pages the R3.5 visible-post index in one statement while retaining absolute post numbers across pages; PGlite tests cover 3 and 50 posts, pagination numbering, and hidden-post exclusion. Post bodies now render through `@forum/bbcode` (F36): the render stored with the post when it is current, a live render when it is not. Fixture mode has the same read path. |
| F32 | Read tracking | `DONE` | `PostgresReadStateRepository` reads forum watermarks, thread markers, and unread forum ids in a constant three statements; a real-PGlite test proves the budget and prevents a slower tab from regressing the marker. Index and forum rows show unread state. POST-only routes mark all visible forums, one forum, or the last visible post in a thread; the post target is revalidated against the visible thread before it writes. Guests and fixture mode remain stateless. |
| F33 | Member profile | `DONE` | `/member/[id]` validates its numeric target, checks `profile.view`, and reads only public profile fields through the composition root. Deleted accounts return 404 while their historical author names remain plain text. The default `MemberProfile` slot renders identity and stats; profile links now work from the shell, listings, threads, and posts. Fixture mode supplies the same route with an admin profile; the Postgres adapter is covered on real PGlite. |
| F34 | Error and redirect pages | `DONE` | Database-free `not-found.tsx` renders the `ErrorNotice` slot; the required client error boundary presents a generic token-styled fallback without leaking exception details. `/redirect` renders `RedirectNotice`, uses a two-second meta refresh, and includes a real link for no-JS clients. Its target is constrained to a same-origin path, with `/` as the safe fallback; focused tests cover the open-redirect boundary. |
| F35 | No-JS and accessibility pass | `DONE` | Playwright now runs in CI against an isolated fixture dev server. With JavaScript disabled it follows an index thread link, registers, logs in, receives a session cookie, and sees the profile link. A keyboard check proves the skip link is first, moves focus to `#board-content`, and exposed the missing `tabIndex`; every existing target now supports focus. Development uses non-`__Host-` cookie names because the browser rejects an insecure `__Host-` cookie, while production keeps the secure prefix. |

## Phase 3 — Posting

`posts`, `post_revisions`, `threads`, `thread_prefixes` and
`thread_subscriptions` all have writers now. A registered member can start a
thread, reply to one, see both rendered (F36), edit either, and take a reply
back; a moderator can restore it. `post_revisions` has its first row, and the
F41 gate is green, which unblocks Phase 4.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F36 | BBCode package | `DONE` | `@forum/bbcode`: scanner → AST → renderer for `b i u s color size url email img quote code list *`. **Safe by construction, not by sanitising** — output is assembled from tag literals, validated attributes and `escapeHtml`, so there is no step where attacker markup exists to be cleaned; the suite asserts that property (*every `<` in the output is one this package wrote*) across a 35-entry hand-written corpus and 4,000 seeded-fuzz inputs, plus a second fuzz pass proving no word is ever lost. Limits on input, depth and node count all **degrade rather than throw**, and nothing is dropped. Cached HTML lands per D44: `posts.message_html` + `posts.render_version` written in the same transaction as the post, `postBodyHtml` refusing any render not at `RENDER_VERSION` (mutation-verified with a stored `<script>` at an older version), and `posts.render_backfill` sweeping stale rows cursor-free in two statements per run (budget-asserted). 101 tests; eight mutants killed. Browser-level: the fixture board stores no renders, so Playwright asserts live-rendered tags. See **D44** and `mybb-parity.md#bbcode-coverage`. |
| F37 | Smilies and custom BBCode | `TODO` | F36 is done and left the seam: `parse`/`render` take a tag registry, so a custom tag is a declarative entry rather than an admin-supplied regex. No management surface, no smilies, and `font`/`align`/`video` are parked here by parity decision. |
| F38 | Counter maintenance and recount | `DONE`* | All four parts. `applyCreatedContentCounters()` writes direct forum, thread and author counters plus last-post pointers atomically with the `post.created` event (D40). The event now has a consumer: `PostgresOutboxReader` + handler dispatch in the queue drain deliver it to `counters.rollup`, which adds the post to every ancestor by path prefix — separator included, so a text-prefix sibling is not an ancestor (mutation-verified) — and is idempotent against replay through a ledger row written in the same transaction. Views are buffered in `thread_view_buffer` and folded in by `views.flush`. `PostgresCounterRecount` writes computed truth in bounded batches across threads → forums → users, resuming from a stored cursor; a deliberately corrupted board converges, a second sweep corrects nothing, and it converges at a batch size of one. 30 tests — 26 against real Postgres, plus four app-tier ones over a real queue that cover the seam no database test can see: that a relayed job's `kind` is the handler id the drain looks up. Four mutants killed (broadened path prefix, removed ledger gate, cursor that never advances, flush that replaces instead of adds). See **D41**. *No route creates content yet, so the write path is proven by tests rather than by use — F39 is the first caller. |
| F39 | New thread | `DONE`* | `ThreadComposer` in `@forum/threads` holds the rules (forum shape, title/message limits, prefix scope, flood interval, moderation decision, slug); `PostgresThreadWriteRepository` writes thread + opening post + counters + event in **one transaction**, proven by a rollback test on real PGlite. `createThreadAction` re-authorises `thread.view` **and** `thread.post` for itself — both mutation-verified, the second by a member who may read a forum and not post in it — reads a native `FormData` submit, keeps the draft on a rejected one, and redirects. A held thread lands on its forum with a notice instead of a 404 on its own post. `/forum/[id]-[slug]/new` renders the new `PostForm` slot; the link appears only where the actor may post. Settings are read for the first time (`posting.flood_seconds`, `posting.max_length`). 43 tests. See **D42**. *No browser-level no-JS proof: the Playwright suite runs against the fixture board, which has no writer, so posting is covered by `FormData`-driven action tests instead. F45's editor island and F36's BBCode are deliberately absent — the plain textarea is the whole path.|
| F40 | Reply and quote | `DONE`* | `ReplyComposer` refuses what F39's rules cannot see — a locked thread (moderators excepted, mutation-verified), a forum that takes threads but not replies, a thread that is not visible — and reports a race without enforcing it: the reply is written either way, and the comparison happens after the write so a same-moment reply cannot decide the answer. `createReply` reuses the one-transaction shape with `isNewThread: false`, asserted on real PGlite against the counter a reply must *not* move. Quoting is a link to the reply page with a server-resolved prefill, so it needs no JavaScript, and the quoted post is re-read thread-scoped so `?quote=` cannot paste a post out of a forum the quoter may not read. The redirect anchors to the new post, opening a page at it once the thread outgrows one. 32 tests. See **D43**. *Same gap as F39: fixture mode has no writer, so the browser suite cannot cover posting. `QuickReply` remains F45's island. |
| F41 | ⛔ GATE — Edit and delete own posts | `GATE` — green | `PostEditor` in `@forum/posts` owns both transitions; `PostgresPostWriteRepository` writes the revision (the body being *replaced*), the post, its render and every counter in one transaction. **The half F38 left here is done**: a deletion is not a creation negated — counts reverse arithmetically, but `last_post_id` is a *pointer*, so the whole ancestor chain is recomputed bottom-up in the same transaction while ancestor counts ride the event. `unapproved → deleted` moves nothing (the silent drift a "delete always decrements" version causes), and F38's ledger, re-read as "currently counted in ancestors", makes delete and restore idempotent with no new table — the handler reads the row rather than the event's flag, so an out-of-order delete/restore pair converges. Edit window is the numeric `editTimeLimitMinutes` (0 = unlimited, R4.2) and applies to your own post only. Hidden posts are filtered *in the query* by two flags, one per permission; a moderator sees a banner, everyone else's page has no row. `requiresApprovalOnEdit` reuses the same counter path. 70 tests, eleven mutants killed. See **D45**, plus two `mybb-parity.md` entries. |
| F42 | Attachments | `TODO` | FileStore exists; no attachment schema/handler/serving path. |
| F43 | Polls and ratings | `TODO` | No poll/rating schema or command. |
| F44 | Drafts | `TODO` | No draft schema or form. |
| F45 | Editor islands | `TODO` | No enhancement islands; server forms must land first. The server-rendered preview exists as of F41 and is the thing an island would enhance, not replace. |
| F46 | Anti-spam and flood control | `TODO` | No captcha/rate-limit commands beyond existing auth lockout. |

## Phase 4 — Moderation

**Phase 4 is complete: eight of eight `DONE`.** Both gates are green.
`/moderation` is a working queue, `/moderation/reports` a working report list,
the thread page carries the moderator bar, listings carry checkboxes and a bulk
bar, members have a warning record, and `/modcp` is the panel all of it hangs
off. Copy landed once the product question behind it was answered (credit the
authors, as MyBB does), and the move redirect stub became a recorded parity
divergence rather than an open gap.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F47 | ⛔ GATE — Visibility model enforcement | `GATE` — green | One `ContentScope`, produced only by `Authorizer.contentScope` and turned into SQL only by `visibleIn` (`packages/db/src/visibility.ts`). **The scope is a required, undefaulted argument**, so an unauthorised read is a compile error rather than an audit — which is what found every call site including the fixtures and the seed data. Guard `R3 no-adhoc-content-visibility` fires on any *query-shaped* mention of the column outside the counter/write modules, probed both ways with two `alsoClean` exemption samples; it found two real hits on its first run (the unread computation's own predicate, and the flood check's `<> 'deleted'`). The leak suite is a **property** — every read path × every scope, every returned row is in the scope handed in — plus exact-set assertions so it cannot pass by returning nothing; 20 tests, four mutants killed including a numbering subquery that counted the whole table (numbering is a disclosure: `#4` on a three-post page names hidden content). `locateForum` is the one deliberately unscoped lookup and returns an id, never a row. **Not covered by tests because they do not exist yet:** feeds (F76) and search (F72) — the guard is what will catch them. See **D46**. |
| F48 | Moderation queue | `DONE`* | `@forum/moderation`'s `ModerationQueue` over `PostgresModerationQueueRepository`: a keyset-paged union of held threads and held replies, oldest first, scoped to `Authorizer.moderatedForumIds`. **`forum_moderators` gets its first reader ever** — the table has existed since F21 and nothing consulted it, so "moderator" meant "member of a staff group"; appointments now resolve, cascade down the tree and carry granular rights. `content.approve` is a new action, so the F22 matrix grew a thirteenth column (416 cells). The selection is never trusted: every submitted id is re-read for its real forum and then checked, and the moderated set is resolved per request rather than carried in the form — both mutation-verified. A thread and its opening post move together; a reply held inside a held thread is not listed, because approving it would publish into a thread nobody can see. Rejecting moves no counter (D41's definition, from the other side). Bounded at `MAX_CHUNK` = 200, one transaction per batch, one audit row per batch. 82 tests, five mutants killed. See **D47**. *Attachments are absent because F42 is: the queue omits what does not exist rather than showing an empty section (D32). The screen is app-owned rather than a theme slot — see D47 for why, and F54 for where a moderator shell belongs. |
| F49 | Reports | `DONE`* | Migration `0005`: `reports` (current state) and `report_events` (history, and the only place a private moderator note lives). `ReportService` over `PostgresReportRepository`; `/report?kind=&id=` files one, `/moderation/reports` works them. **The duplicate guard is a partial unique index, not a prior read** — two clicks arriving together would both pass a check, and a report button that adds a queue row every time is the cheapest denial-of-service on the board; partial, so the same member may report again once a previous report closes. Assignment is a column rather than a status, so "everything outstanding" is one predicate. Two scopes in one query: forum reports go to `moderatedForumIds`, member reports to `modcp.access`, and "does not exist" and "not yours" give the same answer. Only *public* content is reportable (`PUBLIC_CONTENT`, not the reader's scope), and the target's forum is re-checked after it resolves — in the page *and* the action. `content.report` is global, so the F22 matrix is untouched. 37 tests, seven mutants killed. See **D48** and two `mybb-parity.md` entries. *Private messages are not a target (F60 has no tables) and nothing is notified (F55) — omitted rather than stubbed, per D32. Assignment has no "assign to somebody else" UI: a moderator takes a report or puts it back, which is what the screen needs before F54 gives it a staff list to choose from. |
| F50 | Thread tools | `DONE`* | Lock/unlock, pin/unpin, move, **copy** and delete/restore, each logged to `admin_log` with the affected ids. **The tools read an appointment right and no usergroup field** — the first divergence from the board's own permission pattern, and deliberate (see the parity entry): F48's debt came due here, `moderatorApproves` became a full `ModeratorRights`, `forum_moderators` grew to seven rights in the reader, and `Authorizer.moderatorRightsIn` is the seam. **A move needs the right at both ends**, resolved as two separate matrices — mutation-verified by copying the source rights to the destination. Counters: one tally reused for forum, ancestors and every author; the two chain updates cancel exactly at a shared ancestor; `posts.forum_id` is rewritten; the roll-up ledger stays in sync on delete/restore. **Copy is the one tool that creates content**, so it is the only one whose counters all go up with nothing going down — and it settles the author question F51 could not, by parity: each copied post credits its author again, matching MyBB, at the cost of `post_count` meaning "attributed to you" rather than "written by you". It is authorised by `thread.move` at both ends rather than by a right of its own, and copies only visible posts. 43 tests, twelve mutants killed. See **D49** and three `mybb-parity.md` entries. *The move **redirect stub** is not built and is now a recorded parity divergence rather than an open gap: it is a second row shape in the board's most performance-sensitive listing query, and the thread keeps its id, so a permalink still resolves. |
| F51 | Merge and split | `DONE` | `ThreadSurgery` over `PostgresThreadSurgeryRepository`, two Server Actions, two controls in F50's moderator bar. **Split takes "from this post onwards" and lands in the same forum**, always — splitting and moving are two acts, and doing both at once would give a moderator a second forum to place content in (D50). **Merge absorbs the source into the named target**, which is never inferred from age or size; it moves *every* post including held ones, because `posts.thread_id` cascades and the queue would lose them. Post order survives by construction (F31 pages by id); `is_first_post` does not and is set/cleared explicitly, with a killed mutant each way. Counters: the forum gains one thread and zero posts on a split, the two forum chains debit and credit on a cross-forum merge, and reply counts trade on both threads. **The author question F50's copy deferred is settled here: `post_count` never moves**, because neither operation duplicates a post; only `thread_count` does, by one. `postsFrom` refuses a cut point that is not a visible post *of this thread* — a post of an earlier thread or a held one in this thread would otherwise select the whole thread. The merge box takes a raw thread number, so the action puts it through `thread.view` before anything else; without that it is a thread-existence oracle. Rights resolved at both ends (D49's rule). F22 grew two columns, 608 cells. 51 tests, seven mutants killed. **Hand-picked post selection landed once F52 supplied the checkboxes** — `splitPosts` filters the selection through `visiblePostIdsIn` and enforces the same three rules `split` does (not the opening post, not the whole thread, all of *this* thread), dropping an ineligible tick rather than failing the batch. **Not built:** splitting into another forum (it is split-then-move) and multi-way merge (it has to pick a survivor among three). See **D50**. |
| F52 | Inline moderation | `DONE`* | `InlineModeration` over `PostgresInlineModerationRepository`: checkboxes down a forum listing and a thread page, one bar of buttons below, eight tools (approve / delete / restore / lock / unlock / pin / unpin / move). Every transition is F41's, F48's or F50's, reused rather than reimplemented — the arithmetic F50 had inline moved to `thread-counters.ts` so the bulk path cannot drift from the single-target one. **The checkboxes are not inside the form and cannot be**: `ForumDisplay` already renders a mark-read form and nested forms are not parsed, so association is by HTML's `form` attribute — native, no-JS, and honoured by `new FormData(form)` after hydration (new `SelectionModel` on `ThreadRowSlotModel`/`PostBitSlotModel`). **The re-read is scoped, and that is the security property**: `Authorizer.forumIdsWhere(actor, action)` is new, keyed by *action* rather than by a `ModeratorRights` field because one field means two things (`canSoftDeletePosts` grants `post.softDelete` through a group column and `thread.delete` through the appointment only), and it sets `Target.isForumModerator` — half of F48's debt. Without the scope, `refused` and `missing` are different answers and the outcome counts enumerate every private forum on the board. Four outcome numbers, rights checked before state so a refusal cannot leak a row's state. **Chunks rather than refusing** (25 per transaction, 500 ceiling), which is safe because every write is state-guarded and a half-finished bulk action is re-submittable. F22 needed **no new columns** — every action already existed. 79 tests, eight mutants killed. See **D51** and two `mybb-parity.md` entries. *Fixture mode has no writer, so the browser suite cannot cover it — the same gap F39/F40 have. |
| F53 | Warnings | `DONE`* | Migration `0006`: `warning_types`, `warning_levels`, `warnings`, two restriction columns on `users`, and `usergroups.can_warn_users` — plus a seeded ladder so the feature works on a board nobody has configured. `WarningService` over `PostgresWarningRepository`; `/moderation/warn?user=` is the record *and* the form on one screen, reachable from a post (`PostActionsModel.warnHref`) and from a profile. **`users.warning_points` has existed since `0000` with no writer; it now has one, and it is derived rather than incremented** — recomputed from the live rows in the same transaction as anything that changes them, because an incremented total cannot survive a revocation (two tests corrupt the column and watch it repair). "Live" is one `LIVE` fragment, not two hand-written predicates (D41's rule). Levels are **thresholds re-evaluated on every change**, which is what makes revoking lift a restriction rather than only lowering a number, and a level is applied only when *newly* reached so two warnings in a minute do not double a suspension. `warnings.expire` corrects the cache and re-evaluates the level — it never bans, having no actor to attribute one to. Restrictions reach `ThreadComposer`/`ReplyComposer` as booleans and **outrank `bypassesModeration`**. `user.warn` is global (like `content.report`), so the F22 matrix is untouched. 65 tests, six mutants killed. See **D52** and four `mybb-parity.md` entries. *Nothing notifies the warned member (F55), and there is no screen for editing types or levels (F66) — omitted rather than stubbed (D32). |
| F54 | Moderator CP | `DONE`* | `/modcp` with four sections — overview, my forums, moderator log, address lookup — plus the queue and reports in its nav. **Access is a grant *or* an appointment** (`modcp.access` or any moderated forum), because F48's appointed moderator has work and no group grant; the layout gates it and every page gates it again, since a layout is not a security boundary in the App Router. *My forums* is the screen F50 made necessary: once locking became a per-forum appointment, a moderator's only way to learn their own rights was to press a button and be refused. **The log is an allow-list of moderation actions**, not a deny-list — `admin_log` is shared with F63's ACP and will keep growing row types, so a new one is invisible here until named rather than disclosed by default; scoped in SQL, with a move visible to both ends (D49) and a forum-less entry visible only to its author. **The address lookup is gated separately from panel access, audited on every call including the empty ones, and searches the truncated prefix F09 stores — and says so**, because "shares an address" is a certainty the data does not support. **F48's debt is paid**: `moderatorTargetFor` sets `Target.isForumModerator`, so `post.editOthers` and `post.softDelete` now resolve the same way for an appointee everywhere. 32 tests, six mutants killed. See **D53** and two `mybb-parity.md` entries. *No announcements section (no announcement model exists at all) and no ban screen — F23's mechanism is complete and unsurfaced, but a create/lift screen needs F67's member search and half of one here would be a second place that knows how to ban. Both omitted rather than stubbed (D32). |

> **Checkpoint 4** — reached. Moderation is reversible (every transition has an
> inverse and every one is state-guarded), logged (`admin_log`, readable at
> `/modcp/log`), permission-correct (608 matrix cells, plus `forumIdsWhere`
> scoping every bulk act), and counter-correct (one arithmetic in
> `thread-counters.ts`, asserted on every affected row against real Postgres).
> The one thing the checkpoint cannot claim is browser-level proof of *writing*:
> fixture mode has no writer, so Playwright covers reading only. See
> `progress.md`.

## Phase 5 — Members and social

No `notifications`, `private_messages`, `pm_recipients`, `user_relations`, or
custom-field tables exist yet.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F55 | Notification infrastructure and email | `TODO` | Drivers/outbox exist; no notification/mail domain flow. |
| F56 | Subscriptions and digests | `TODO` | No subscriptions or digest tasks. |
| F57 | User CP | `TODO` | Auth settings exist; no member self-service route group. |
| F58 | Avatars and signatures | `TODO` | Depends on F42/F57; no profile media/signature support. |
| F59 | Custom profile fields | `TODO` | No field definitions/values/visibility logic. |
| F60 | Private messaging | `TODO` | No PM schema or route. |
| F61 | Buddy and ignore lists | `TODO` | No relation model or server-side suppression. |
| F62 | Reputation | `TODO` | No reputation model/log/recount. |

## Phase 6 — Admin control panel

`admin_log` and `themes` tables exist; there is no `/admin` route group.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F63 | ACP shell and authentication | `TODO` | No `/admin` routes or separate admin-auth step. |
| F64 | Settings UI | `TODO` | Typed registry exists; no registry-driven ACP UI. |
| F65 | Forum management and permission matrix editor | `TODO` | Repositories exist; no management/matrix screen. |
| F66 | Group management | `TODO` | Group/promotion mechanics exist; no ACP workflow. |
| F67 | User management | `TODO` | Account repositories exist; no management workflow. |
| F68 | Theme manager | `TODO` | Themes table exists; runtime overrides and ACP editor are absent. |
| F69 | Plugin manager | `TODO` | `forum.config.ts` exists; plugin kit/management absent. |
| F70 | Tools, maintenance and system health | `TODO` | Partial CLI/tick exists; no ACP maintenance/health surface. |
| F71 | Content administration | `TODO` | Depends on F37/F42; no content-management surfaces. |

## Phase 7 — Search, discovery, syndication

No `tsvector` column, `search_sessions` table, or `packages/search` contents.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F72 | Postgres full-text search | `TODO` | No FTS index/provider/reindex task. |
| F73 | Search UI | `TODO` | No query UI or stored result sessions. |
| F74 | Discovery shortcuts | `TODO` | No new/today/my/unanswered queries. |
| F75 | Who's online and statistics | `TODO` | No online presence/rollup screens or task. |
| F76 | Feeds, sitemap, and metadata | `TODO` | No feeds, sitemap, robots, or social metadata. |

## Phase 8 — Public APIs

`packages/theme-kit` is the active F25 foundation, but its public contract is
not frozen; `packages/plugin-kit` does not exist.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F77 | theme-kit v1 freeze | `TODO` | Slots exist; generated public docs and deprecation policy do not. |
| F78 | Second theme | `TODO` | Only the default theme exists. |
| F79 | plugin-kit v1 | `TODO` | No lifecycle/hook/UI extension package. |
| F80 | Reference plugin | `TODO` | Depends on F79; no reference plugin. |
| F81 | Public REST API and webhooks | `TODO` | No token API or outbound webhook path. |

## Phase 9 — Ship it

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F82 | `create-forum` CLI | `TODO` | Existing operator CLI is not a project scaffold. |
| F83 | Install wizard | `TODO` | No `/install` preflight/setup/self-disable flow. |
| F84 | Upgrade path | `TODO` | Migrator exists; no versioned core/plugin upgrade command. |
| F85 | MyBB importer | `TODO` | No importer or legacy-ID mapping. |
| F86 | Legacy passwords and URLs | `TODO` | No MyBB hash/URL compatibility layer. |
| F87 | BBCode parity pass | `TODO` | Depends on F36/F85 corpus/import work. |
| F88 | Documentation | `TODO` | Core docs exist; deploy/operator/theme/plugin/restore guide set is incomplete. |
| F89 | Performance pass | `TODO` | Query budgets exist; 2M-post load/p95 evidence does not. |

---

## Open questions for a human

Per [`roadmap.md`](./roadmap.md)'s working rules — these are not being
reinterpreted unilaterally.

1. ~~**F03 vs invariant 32.**~~ **Resolved 2026-07-30:** invariant 32 governs.
   Forward-only; F03's "up and down" acceptance is superseded. A down migration
   that drops a column is a data-loss button on a live board, and some
   migrations (a destructive backfill) cannot be reversed at all, so the
   guarantee would be partial and therefore misleading. Recovery is by restore —
   F88's backup runbook is the documented answer.
2. ~~**F06 route path.**~~ Resolved: renamed to `/api/system/tick`, with
   `vercel.json` and the compose tick loop updated.
3. ~~**`forum.config.ts`**~~ **Done 2026-07-30.** Minimal registry (themes +
   plugins), read by `layout.tsx` so it is load-bearing rather than decorative,
   plus guard `R1 no-runtime-filesystem-scan` enforcing the half of invariant 6
   that actually bites on serverless. See D33.
4. ~~**Orphan forums in `buildTree`**~~ **Resolved 2026-07-30 at F29:** subtrees
   are filtered **whole**. A forum the viewer cannot see takes its descendants
   with it, because promoting a visible child to top level leaks the existence
   and name of a hidden category's children and makes the board's shape depend on
   who is looking. `buildTree` still promotes orphans — that is correct for a
   genuinely orphaned row — so the view model drops unreachable subtrees before
   building, iterating to a fixed point. See D38.
