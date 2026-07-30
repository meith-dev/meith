# Plan status

Feature-by-feature status against `forum-platform-build-plan.md`. This is the
tracking file: **one row per plan feature, always**. `progress.md` says what to do
next in prose, `deviations.md` records decisions and divergences, and this says
what is and is not built.

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

Last audited **2026-07-30** (re-audited after F27/F29 landed), against the working tree, not from memory:
`pnpm verify` (931 tests), `pnpm build`, plus direct inspection of the
migration's `CREATE TABLE` list, each package's `src/` contents, `.github/workflows/ci.yml`,
and the CLI's registered commands. Where a row says a thing is missing, the file
was looked for and was not there.

Counts below are features, not effort. Several `TODO` rows are days of work; a
couple of `PARTIAL` rows are an afternoon.

| Phase | Features | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| 0 — Skeleton | 14 | 11 | 3 | 0 |
| 1 — Identity, tree, permissions | 10 | 10 | 0 | 0 |
| 2 — Themes and reading | 11 | 6 | 3 | 2 |
| 3 — Posting | 11 | 0 | 0 | 11 |
| 4 — Moderation | 8 | 0 | 0 | 8 |
| 5 — Members and social | 8 | 0 | 0 | 8 |
| 6 — Admin CP | 9 | 0 | 0 | 9 |
| 7 — Search and discovery | 5 | 0 | 0 | 5 |
| 8 — Public APIs | 5 | 0 | 0 | 5 |
| 9 — Ship it | 8 | 0 | 0 | 8 |
| **Total** | **89** | **26** | **6** | **57** |

---

## Phase 0 — Skeleton you can deploy

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Monorepo and Next.js scaffold | `DONE` | Workspaces + Turborepo; `next` pinned exact `16.2.6`, `react` `19.2.0` — no caret. `strict` + `noUncheckedIndexedAccess` on in `tsconfig.base.json`. |
| F02 | Config and environment validation | `DONE` | Zod schema in `packages/core/src/env.ts`; lazy proxy (D1); build-phase vs runtime split (D18). `process.env` confined by guard + ESLint rule. 11 tests. |
| F03 | Database package | `DONE` | Drizzle + postgres.js (`prepare: false`, small pool), forward-only migrations, transaction helper with rollback-on-throw. **Contradiction resolved 2026-07-30:** F03's "up *and down*" is superseded by invariant 32 — forward-only governs, and recovery is by restore, not reversal (D28). Testcontainers is substituted by PGlite, which runs the real generated SQL. |
| F04 | Deploy on both targets | `PARTIAL` | Dockerfile (multi-stage, standalone) + `docker-compose.yml`; CI builds the app. **Gap:** CI never *boots* the standalone image, which is the stated acceptance criterion; `apps/worker` is an empty package, so the "same image runs the worker with a flag" path does not exist. |
| F05 | Driver interfaces | `DONE`* | Interfaces + env selection + every shipped implementation, all four families passing the shared contract suite — which exposed that `PostgresQueue` only worked with postgres.js's result shape (D27). `S3FileStore` lands per [ADR 0002](adr/0002-s3-filestore-dependency.md), passing the same contract with real presigning, key validation, and miss-is-undefined mapping. *Driven through a fake S3 client: that tests this code, not the SDK. An integration run against MinIO would be the remaining rigour, and belongs with F89. F42 is unblocked. |
| F06 | System tick and scheduled tasks | `PARTIAL` | **The tick now runs tasks.** `PostgresTaskRepository` (21 tests on real Postgres, concurrent-claim and lease-overrun both mutation-verified), app-tier workers, and `/api/system/tick` calling `tick()`. Five tasks registered; `reconcileCounters` (F38) and `relayOutbox` (no Postgres `OutboxReader` yet) are **omitted rather than stubbed**, and register themselves when their workers appear (D32). Fixture mode returns 503 rather than faking a run. **Gap:** a failing task logs but does not yet raise an admin notification (needs F55); `apps/worker` is still an empty package. |
| F07 | Outbox and event bus | `DONE` | `outbox` table, transactional write helper, drain-to-queue, retry/backoff/dead-letter. Rollback-suppresses-delivery covered. |
| F08 | Settings registry | `DONE` | `packages/settings` registry + `settings`/`setting_groups`; typed accessors; migration-seeded defaults. |
| F09 | Errors, logging, error pages | `DONE` | Pino + request-id context, error taxonomy, `error.tsx`/`not-found.tsx`. Redaction covers credentials — tightened in D20 after a token reached the logs via a URL string. |
| F10 | Caching policy harness | `DONE`* | `CacheTags` registry, both drivers, and `cachedGlobal` — read-through, tag-invalidated, driver injected. Guard now catches `getActor`/`getUserId` inside a cached region, and **every guard is probed** by `pnpm guards:probe` against a must-match and a must-not-match sample, so an inert or over-broad rule fails CI. *The "member then guest, guest never gets a cached body" test needs pages that do not exist until F29/F31; it is listed there, not silently skipped. |
| F11 | Boundary lint and testkit | `PARTIAL` | `dependency-cruiser` enforces R2 (127 modules, 0 violations), probe-verified. `@forum/testkit` now has the deterministic seeder (fixed-seed PRNG, batched inserts, genuinely nested tree) and the **query-budget helper**, which counts statements at the driver and names the repeated SQL so an N+1 is identifiable. Mutation-verified: an injected N+1 in `listAll` fails the budget. F16's "one query regardless of depth" is now measured rather than claimed. **Gap:** the harness is PGlite, not Testcontainers, and `FULL_SCALE` (2M posts) is defined but only runnable against real Postgres — PGlite holds the database in process memory. `SMOKE_SCALE` runs in CI. Factories beyond the seeder are not built. |
| F12 | CI pipeline | `DONE` | Three jobs: static checks (guards, lint, depcruise, both typechecks, tests), production build, migrations + drift + Postgres tests. Runtime not yet measured against the 12-minute budget. |
| F13 | Operator CLI (v0) | `PARTIAL` | Eight commands: `env:check`, `migrate`, `settings:list|get|set`, `user:create`, `user:promote`, `forum:create`. A board can now be set up end to end — migrate, create an admin, promote them, create forums, set settings. Passwords are read from stdin, not `argv`. **Gap:** `task:run` is now *unblocked* — `PostgresTaskRepository` exists — and simply not written yet; `cache:clear` needs a cross-process cache to clear (MemoryCache dies with its process, `revalidateTag` only works inside a Next request) and belongs with F70. |
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
| F22 | ⛔ GATE — Permission matrix suite | `GATE` — green | 388-cell table-driven cross product over actors × contexts × actions; fixture reviewed. Currently exercises the in-memory source; re-run against Postgres when F21's wiring lands. |
| F23 | Bans and ban filters | `DONE`* | `BanService` + Postgres repositories, glob ban filters applied at **both** registration and login, and `bans.expire` now genuinely runs on the tick. Both acceptance criteria met and mutation-verified: expiry restores the *captured* group, not the default (D29). *No ACP or CLI surface for creating a ban yet — that is F54/F67's screen, not a gap in the mechanism. |
| F24 | Group promotions | `DONE`* | `@forum/groups` (was an empty package): pure rule evaluation with three safety guards, `PromotionService` with preview/apply sharing one evaluation, `group_promotions` table (migration `0002`), Postgres repository with keyset paging, and `promotions.apply` now genuinely runs on the tick. Both acceptance criteria met and mutation-verified (D30). *No ACP surface for editing rules — that is F66's screen. |

> **Checkpoint 1** — substantially reached: register / activate / log in / log out
> / reset all work without JavaScript, the tree exists with per-group overrides,
> and F22 proves resolution. Outstanding: F23, F24, and F21's end-to-end wiring.

## Phase 2 — Themes and reading the board

F25 is done and F27 has started; the rest is `TODO`. `packages/theme-kit` holds
the slot registry, the view-model contract and `defineTheme`; `themes/default`
fills the five shell slots the auth screens render. `packages/ui` is still
effectively empty (one file). `threads`/`posts` tables exist in the migration; the
packages are empty.

| ID | Feature | Status | Note |
|---|---|---|---|
| F25 | theme-kit foundation | `DONE` | 25-slot registry, each declaring server or client kind; `SlotComponent<K>` resolves the kind to a *different* signature (an `async` client slot does not compile); `defineTheme` rejects a bundler-marked client reference in a server slot; `scripts/slot-kinds.mjs` catches the case neither can — a `"use client"` module behind a server slot — fails on a slot map it cannot statically read, and fails on **zero** manifests. Probed both ways and mutation-verified against the real theme. `defineTheme`/`resolveTheme` with `extends` (nearest-wins over a three-level chain, cycle and duplicate-key rejection), typed JSON-shaped view models with a two-sided compile-time proof (`view-models.type-test.ts`). Slots are flat by design — a slot never renders another slot; see **D35** for why and what it costs. Load-bearing: `themes/default` fills five slots and `app/(auth)/layout.tsx` renders through them. **The slot list is derived rather than transcribed from R6 — D35 records that R6 wins where it disagrees.** |
| F26 | Token pipeline and runtime overrides | `TODO` | `themes` table exists. Prerequisite closed: the typed token mirror had drifted from `globals.css` completely — four tokens that do not exist, fifteen missing, every value stale — which would have made override validation reject valid tokens and accept dead ones. Regenerated and now pinned by an exact-match test (**D36**). Still open for F26: nothing checks `BROWSER_THEME_COLOR` against the `background` token, which needs OKLCH → sRGB in code. |
| F27 | Default theme — shell | `PARTIAL` | Six shell slots — `Shell`, `Header`, `UserPanel`, `Navigation`, `Footer`, `Notice` — composed once in `PageShell` and rendered by both the board and auth route groups, so the auth screens are part of the board rather than a separate unstyled island. Skip link, header, breadcrumb, footer stating the timestamp zone; log out is a POST form the app renders into the panel slot (D38). Tailwind now scans `themes/` — it never did (D35). **Gap:** `BoardStats` and `WhoIsOnline` need F75; the ACP shell is F63. |
| F28 | Threads and posts schema | `PARTIAL` | Tables, `visibility` columns, and R3.5 partial indexes exist; a content seeder and writers do not. The board index reads `forums`' denormalised counters and last-post triplet, which nothing writes yet — F38 is what makes them true. |
| F29 | Board index | `DONE` | Category blocks, forum rows with counters, last post, subforum links, and the empty-forum and deleted-author paths. `listListing()` is one query regardless of forum count or depth, asserted by F11's budget helper across **two board sizes** and mutation-verified against an injected N+1; it is deliberately excluded from the forum-tree cache, pinned by two tests (D38). Visibility filters subtrees **whole** — answering open question 5 — with the orphan pass iterated to a fixed point so a grandchild cannot surface. Renders in fixture mode against `FixtureForumRepository`, whose writes throw rather than pretend. |
| F30 | Forum display | `DONE` | `/forum/[id]-[slug]` validates a visible forum before reading it, renders `ForumDisplay` + `ThreadRow`/`SubforumList`/`Pagination` slots, and uses an opaque keyset cursor over sticky / last-post time / id. `PostgresThreadRepository` makes one partial-index-backed statement per page; a real-PGlite budget test covers 3 and 50 threads, and the equal-timestamp tie-breaker is tested. Fixture mode has the same paged read. |
| F31 | Thread view | `DONE` | `/thread/[id]-[slug]` resolves the visible forum matrix before it reads posts, then composes `ThreadView`, `PostBit`, `PostActions`, and `Pagination`. `PostgresPostRepository` keyset-pages the R3.5 visible-post index in one statement while retaining absolute post numbers across pages; PGlite tests cover 3 and 50 posts, pagination numbering, and hidden-post exclusion. Until F36, raw text is escaped into the trusted plain-text HTML fallback. Fixture mode has the same read path. |
| F32 | Read tracking | `DONE` | `PostgresReadStateRepository` reads forum watermarks, thread markers, and unread forum ids in a constant three statements; a real-PGlite test proves the budget and prevents a slower tab from regressing the marker. Index and forum rows show unread state. POST-only routes mark all visible forums, one forum, or the last visible post in a thread; the post target is revalidated against the visible thread before it writes. Guests and fixture mode remain stateless. |
| F33 | Member profile | `DONE` | `/member/[id]` validates its numeric target, checks `profile.view`, and reads only public profile fields through the composition root. Deleted accounts return 404 while their historical author names remain plain text. The default `MemberProfile` slot renders identity and stats; profile links now work from the shell, listings, threads, and posts. Fixture mode supplies the same route with an admin profile; the Postgres adapter is covered on real PGlite. |
| F34 | Error and redirect pages | `PARTIAL` | Themed `error.tsx` / `not-found.tsx` exist (F09); the MyBB-style redirect interstitial does not. |
| F35 | No-JS and accessibility pass | `TODO` | **No Playwright suite exists.** "Works with JavaScript disabled" is currently a claim about F18/F19, not a measurement. |

## Phase 3 — Posting

All `TODO`. `posts`, `post_revisions`, `threads`, `thread_prefixes`,
`thread_subscriptions` tables exist; `packages/posts` and `packages/threads` are
empty; there is no `packages/bbcode`.

| ID | Feature | ID | Feature |
|---|---|---|---|
| F36 | BBCode package | F42 | Attachments |
| F37 | Smilies and custom BBCode | F43 | Polls and ratings |
| F38 | Counter maintenance and recount | F44 | Drafts |
| F39 | New thread | F45 | Editor islands |
| F40 | Reply and quote | F46 | Anti-spam and flood control |
| F41 | Edit and delete own posts | | |

## Phase 4 — Moderation

All `TODO`. F47 is a ⛔ gate (visibility model enforcement) and blocks the phase.

F47 gate · F48 moderation queue · F49 reports · F50 thread tools ·
F51 merge and split · F52 inline moderation · F53 warnings · F54 ModCP

## Phase 5 — Members and social

All `TODO`. No `notifications`, `private_messages`, `pm_recipients`,
`user_relations` or custom-field tables yet.

F55 notifications and email · F56 subscriptions and digests · F57 UserCP ·
F58 avatars and signatures · F59 custom profile fields · F60 private messaging ·
F61 buddy and ignore lists · F62 reputation

## Phase 6 — Admin control panel

All `TODO`. `admin_log` and `themes` tables exist; there is no `/admin` route group.

F63 ACP shell and auth · F64 settings UI · F65 forum management and permission
matrix editor · F66 group management · F67 user management · F68 theme manager ·
F69 plugin manager · F70 tools and system health · F71 content administration

## Phase 7 — Search, discovery, syndication

All `TODO`. No `tsvector` column, no `search_sessions` table, no
`packages/search` contents.

F72 Postgres FTS · F73 search UI · F74 discovery shortcuts · F75 who's online and
statistics · F76 feeds, sitemap, metadata

## Phase 8 — Public APIs

All `TODO`. `packages/plugin-kit` does not exist; `theme-kit` is empty.

F77 theme-kit v1 freeze · F78 second theme · F79 plugin-kit v1 ·
F80 reference plugin · F81 public REST API and webhooks

## Phase 9 — Ship it

All `TODO`.

F82 `create-forum` CLI · F83 install wizard · F84 upgrade path · F85 MyBB
importer · F86 legacy passwords and URLs · F87 BBCode parity pass ·
F88 documentation · F89 performance pass

---

## Open questions for a human

Per plan §"Stop and ask a human when" and rule 6 — these are not being
reinterpreted unilaterally.

1. **The plan says "84 features" but numbers them F01–F89 with no gaps.** Phase
   spans are 14 + 10 + 11 + 11 + 8 + 8 + 9 + 5 + 5 + 8 = **89**. Either the
   headline count or the numbering is off. This file tracks all 89.
2. ~~**F03 vs invariant 32.**~~ **Resolved 2026-07-30:** invariant 32 governs.
   Forward-only; F03's "up and down" acceptance is superseded. A down migration
   that drops a column is a data-loss button on a live board, and some
   migrations (a destructive backfill) cannot be reversed at all, so the
   guarantee would be partial and therefore misleading. Recovery is by restore —
   F88's backup runbook is the documented answer.
3. ~~**F06 route path.**~~ Resolved: renamed to `/api/system/tick`, with
   `vercel.json` and the compose tick loop updated.
4. ~~**`forum.config.ts`**~~ **Done 2026-07-30.** Minimal registry (themes +
   plugins), read by `layout.tsx` so it is load-bearing rather than decorative,
   plus guard `R1 no-runtime-filesystem-scan` enforcing the half of invariant 6
   that actually bites on serverless. See D33.
5. ~~**Orphan forums in `buildTree`**~~ **Resolved 2026-07-30 at F29:** subtrees
   are filtered **whole**. A forum the viewer cannot see takes its descendants
   with it, because promoting a visible child to top level leaks the existence
   and name of a hidden category's children and makes the board's shape depend on
   who is looking. `buildTree` still promotes orphans — that is correct for a
   genuinely orphaned row — so the view model drops unreachable subtrees before
   building, iterating to a fixed point. See D38.
