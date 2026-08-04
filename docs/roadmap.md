# Forum Platform roadmap

The canonical delivery plan for a MyBB-grade, five-minute-deployable Next.js
forum. It reconciles the supplied build plan (F01–F89) and engineering plan.
`plan-status.md` records completion; this document records the promised scope,
dependencies, and acceptance criteria. Do not mark a feature complete by
reading this file—use the evidence in `plan-status.md`.

## Working rules

- Work in feature order unless a dependency explicitly permits otherwise. One
  feature per change; propose a split when it will take more than a day.
- Stop for a human decision before adding a runtime dependency, requiring an
  always-on process/Redis, weakening an invariant, or choosing a user-visible
  MyBB divergence. Record accepted divergences in
  [`mybb-parity.md`](./mybb-parity.md).
- F17, F22, F41, and F47 are gates. F22 blocks browsing work; F47 blocks all
  moderation work. The F17 and F41 gates protect identity and content mutation.
- The plan contains **89** features. The older “84 features” label was a
  counting error; the numbered list F01–F89 is authoritative.

### Non-negotiable architecture

- App Router, Server Components by default, and client components only for
  leaf enhancements. Pages/layouts compose typed view models; domain packages
  contain commands and interfaces, never Next, React, or SQL.
- Only `@meith/db` opens the database. Installable themes/plugins are explicit
  `forum.config.ts` entries; no runtime filesystem discovery.
- Permission-sensitive output is never cached. Global data is tagged and
  invalidated after mutation. `proxy.ts` is cookie triage, never authorization.
- No-JS forms and server routes come before islands. Every Server Action parses
  and validates input, calls a domain command, independently re-authorizes, and
  redirects/revalidates. Uploads use Route Handlers.
- Vercel + Supabase is the baseline: no in-process scheduler, filesystem write,
  memory rate-limit/lock, Redis dependency, long-lived connection, or unbounded
  request operation. Tick/jobs must be idempotent and catch-up capable.
- `authorization.can()` / `require()` make all access decisions. SQL list
  queries filter by `visibleForumIds()` in-query; group IDs and admin checks do
  not escape `@meith/authorization`.
- Components and API responses receive typed view models, never database rows.
  Migrations are forward-only. Counter changes are atomic and every counter has
  an outbox path plus a recount tool.
- Theme slots, hook payloads, and view models are public API. Use semantic
  tokens only; runtime admin changes belong in tokens/branding/layout options.
  Plugins cannot crash a request.
- Share Zod schemas across forms, actions, handlers, and CLI. Sanitize every
  HTML insertion, log no credentials/tokens/full IPs by default, and never copy
  MyBB source artefacts.

### Definition of done

Each feature needs passing tests (including permissions), no boundary or N+1
regression, no-JS coverage where applicable, accessibility coverage for changed
pages, Vercel-safe behaviour, token-only colours, and matching docs. Add a
query-budget assertion for a touched list page; add an ADR, hook/slot docs, or a
parity decision when the feature changes one of those public contracts.

## Delivery profiles and cross-cutting requirements

| Area | Required outcome |
|---|---|
| Serverless default | `DATABASE_URL` + deploy to Vercel; `/install` creates the board/admin. Postgres queue/cache/files/mail drivers support this profile without Redis. |
| Self-hosted | Standalone Docker image plus worker loop runs the same task code; CI boots the image so this path remains real. |
| Rendering | Server-rendered board, form-first mutations, serializable client props, conservative tagged cache policy. Cache Components adoption remains an explicit human decision. |
| Security | Argon2id, opaque rotating sessions/remember tokens, Postgres-backed rate limits, permission checks in every route/action, sanitised BBCode, attachment magic-byte validation, and audit logs. |
| Data scale | Schema/indexes and deterministic seeding support a target of 50 forums, 100k threads, 2M posts, and 20k users; hot lists have measured query budgets. |
| Themes/plugins | Default plus materially different second theme; runtime override cascade; typed hook registry, generated slot/hook docs, reference plugin, and safe hook isolation. |
| Ship promise | Scaffold → deploy → install in five minutes; upgrades, MyBB import, legacy passwords/URLs, backup/restore docs, and published p95s. |

## Feature backlog

The short criteria below are intentionally executable. Detailed implementation
choices live in the package tests, ADRs, conventions, and parity record rather
than being duplicated in the tracker.

### Phase 0 — Skeleton you can deploy

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F01 | — | pnpm/Turborepo workspace, strict App Router app, action and route-handler smoke paths; pinned patched Next version; build/lint/typecheck scripts. |
| F02 | F01 | Typed Zod environment boundary, documented pooler configuration, clear invalid-env failures, and no stray `process.env`. |
| F03 | F02 | Pooler-safe Drizzle/Postgres package with forward migrations, rollback-on-throw transaction helper, and a driver seam. |
| F04 | F03 | Vercel and standalone Docker deployments; CI builds **and boots** the image and validates worker mode. |
| F05 | F03 | Queue/cache/files/mail interfaces selected by environment; shared contracts for each shipped implementation; safe concurrent queue drain. |
| F06 | F05 | Secret-authenticated, time-boxed concurrent-safe tick plus cron/worker entry points; failures are logged and notify admins. |
| F07 | F05 | Transactional typed outbox, retry/backoff/dead letter, at-least-once delivery; rollback never emits. |
| F08 | F03 | Typed, migration-registered settings registry with cached defaults and type-safe keys. |
| F09 | F01 | Structured request-correlated logging, safe error taxonomy, status mapping, and themed error/not-found rendering. |
| F10 | F05/F09 | Tagged global cache helpers and tested guard against caching actor-dependent output. |
| F11 | F01/F03 | Enforced dependency boundaries, deterministic large-data seeder, DB reset/factories, and query-budget helper. |
| F12 | F11 | Required CI: install, lint, typecheck, unit/integration, build, preview; target under 12 minutes. |
| F13 | F03/F08 | Operator CLI: migrations, users/groups, forums, settings, tasks, cache; an operator can establish a board without ACP. |
| F14 | F01–F13 | Next.js conventions document governs actions, client boundary, tags, error form shape, and view-model names. |

**Checkpoint 0:** deployment, a queued/ticked task, and CLI setup work on a
fresh board.

### Phase 1 — Identity, forum tree, permissions

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F15 | F03 | Identity/group schema and seeded Guests, Registered, Activation, Moderator, Super Moderator, Administrator, and Banned ladders; primary + secondary memberships. |
| F16 | F03 | Category/forum/link hierarchy with materialised paths, counter columns, cached one-query tree, and transactionally correct subtree reparenting. |
| F17 | F15 | Argon2id, opaque rotated sessions, remembered-token reuse detection, request actor, and throttled location updates; fixation and reuse tests. |
| F18 | F17/F08 | No-JS registration with validation, case-insensitive uniqueness, reserved names, activation modes, captcha seam, and optional DOB gate. |
| F19 | F17 | No-JS login/logout/reset, PostgreSQL rate limit/lockout, and replay-proof expiring reset tokens. |
| F20 | F15/F17 | Global Authorizer with documented combination semantics, explicit/logged bypasses, actor versioning, and guard against external group-ID checks. |
| F21 | F16/F20 | Ancestor-inherited forum matrix, granular moderator rights, one-source `visibleForumIds`, and tested invalidation. |
| F22 | F21 | **Gate:** matrix for all representative actors/contexts/actions; regression test for every new permission-sensitive path. |
| F23 | F17/F20 | Temporary/permanent bans and username/email/IP filters at registration and login; captured prior group restored at expiry. |
| F24 | F15/F06 | Idempotent, paged group-promotion preview/apply task that never promotes bans or demotes users. |

**Checkpoint 1:** identity flows work with JS disabled, and a four-level tree’s
permission resolution is demonstrably correct.

### Phase 2 — Themes and reading the board

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F25 | F14 | Versioned theme-kit with declared server/client slots, serializable view models, inheritance, and compile-time boundary enforcement. |
| F26 | F25/F08 | CSS token cascade (theme defaults → DB overrides → custom CSS), cached/tagged runtime `<style>` injection, and token validation including browser theme colour. |
| F27 | F26 | Responsive light/dark shell: app/header/nav/user bar/breadcrumb/footer/mobile/jump box/skip link; keyboard and no-JS jump-box coverage. |
| F28 | F16 | Thread/post/revision schema, visible/moderator indexes, realistic 2M-post seed, and `EXPLAIN` evidence for partial visible indexes. |
| F29 | F27/F28/F21 | Permission-filtered, no-JS board index with categories/subforums/last post/unread/stats/online/newest member; budgeted against seeded data. |
| F30 | F29 | No-JS, budgeted thread listing: stickies, pagination, prefixes, announcements, controls, rules, and scoped password-forum grant. |
| F31 | F30 | Zero-guest-JS thread view with paged postbits, author panels, signature/edit notices, post deep links, browsing/print views, and strict visibility. |
| F32 | F31 | Forum/thread read markers, cutoff and mark controls; no-JS and without per-thread list queries. |
| F33 | F31 | Public profile, permitted activity/contact data, and fields omitted—not CSS-hidden—when invisible. |
| F34 | F27 | Themed, distinct 403/404/error and no-JS redirect/interstitial. |
| F35 | F29–F34 | Playwright JS-on/off flow for every required reading surface plus axe clean board-wide, wired to CI. |

**Checkpoint 2:** index → forum → thread → profile is themed, paginated,
permission-correct, accessible, fast at target data volume, and works without
JavaScript. Theme database changes take effect on refresh.

### Phase 3 — Posting

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F36 | F11 | Tokeniser/AST/renderer/sanitizer BBCode with limits, fuzz corpus, safe cached HTML, and lazy render invalidation/backfill. |
| F37 | F36 | Smilies plus declarative custom BBCode, per-forum capability toggles and code exclusion; never admin-supplied regex or unsanitized output. |
| F38 | F28/F07 | Atomic content counters, outbox ancestor roll-up, buffered views, and batched resumable recount for every counter. |
| F39 | F38/F36/F21 | No-JS new-thread form with auth recheck, prefixes/subscription/preview/flood/moderation, and correct author/forum/ancestor counters. |
| F40 | F39 | No-JS reply and quote with attribution, race notice, and F39 counter guarantees. |
| F41 | F40 | **Gate:** server-enforced edit limit/reason/revisions, soft-delete/restore and permission-aware notices with correct counters. |
| F42 | F39/F05 | Route-handler FileStore upload, magic-byte/type/quota checks, re-encoded images, async thumbnails, protected downloads, and orphan cleanup. |
| F43 | F39 | No-JS polls and database-enforced single vote; configurable rating with one-per-user running aggregate/sort. |
| F44 | F40 | Explicit no-JS draft save; autosave only as an enhancement and later UserCP list. |
| F45 | F40/F42 | Toolbar/preview/quick reply/edit/multiquote/drag-drop islands, each proven removable without losing the server path. |
| F46 | F18/F39 | Swappable captcha, honeypots/questions, first-post moderation, and multi-instance PostgreSQL limits for post/search/PM/report/upload. |

**Checkpoint 3:** a registered user can post, quote, edit, attach, poll, and
rate with or without JS; recount converges deliberately corrupted counters.

### Phase 4 — Moderation

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F47 | F38/F41 | **Gate:** central visibility filter for every read/count/feed/search path and lint ban on ad-hoc visibility checks. |
| F48 | F47 | Chunked approval queue for threads/posts/attachments with every transition counter-correct. |
| F49 | F47 | No-JS reports for post/thread/user/PM with assignment/history/notifications and private moderator resolution notes. |
| F50 | F48 | Logged open/close/stick/move/copy/delete/restore/approve tools with full affected-row counter assertions. |
| F51 | F50 | Test-first merge/split across forums, preserving post order and all pointers/counters/authors. |
| F52 | F50 | No-JS inline bulk moderation, chunked for 200+ items. |
| F53 | F49/F23 | Warnings with expiry/revocation/threshold actions/history and recalculation. |
| F54 | F48–F53 | Rights-aware ModCP: queues/logs/announcements/bans/forums and audited, permission-gated IP lookup. |

**Checkpoint 4:** moderation is reversible, logged, permission-correct, and
counter-correct.

### Phase 5 — Members and social

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F55 | F05/F07 | Queued, themed mail and no-JS notification centre/preferences; failures become admin notifications. |
| F56 | F55 | Thread/forum subscriptions, instant/daily/weekly catch-up digests, management, and no-login/no-JS unsubscribe. |
| F57 | F19/F55 | No-JS UserCP: profile/options/theme/timezone/paging/invisible mode, re-auth email/password changes, drafts/subscriptions. |
| F58 | F42/F57 | Safe avatar upload/remote URL and group-limited, moderated signature BBCode; no SSRF/tracking vector. |
| F59 | F57 | Typed custom fields with per-group visibility/edit/registration requirements and themed profile/postbit slots. |
| F60 | F55/F36 | No-JS private messages: multiple recipients, folders/tracking/receipts/quota/forward/reply/mass actions/reporting. |
| F61 | F60 | Server-side ignore (reveal link, PM block, stable pagination/counts) and online buddy state. |
| F62 | F31 | PostgreSQL rate-limited reputation with comments, settings/per-group limits, history, and recomputable total. |

**Checkpoint 5:** members can manage identity, messages, subscriptions,
notifications, reputation, and social controls without JavaScript.

### Phase 6 — Admin control panel

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F63 | F20 | Separate `/admin` auth/layout, optional IP allowlist, re-auth for destructive operations, and actor/IP/payload admin log. |
| F64 | F63/F08 | Registry-driven grouped/searchable settings UI with advanced fields, audit log, and immediate cache invalidation. |
| F65 | F63/F21 | Forum tree/options/moderators plus visual permission matrix with clear inherit/grant/deny and previewed copy-to-subforums. |
| F66 | F65 | Group grid/promotions dry run and chunked mass memberships; permission-version invalidation. |
| F67 | F63 | User search/filter/edit/merge/prune/ban/IP/activation/mass mail; chunked long work and correct reassignment on merge. |
| F68 | F63/F26 | Theme selection and approachable token/layout/custom-CSS editor with live preview, reset, exact JSON export/import. |
| F69 | F63 **+ F79** | Configured plugin enable/disable/migrations/settings/ACP pages, hook health, and honest install/redeploy instructions. *Corrected during Phase 6: only the inventory and the install instructions are buildable before F79 defines the plugin lifecycle — the other five deliverables have nothing to operate on. See D75.* |
| F70 | F63/F38 | Cache/tasks/logs/prune, resumable Recount & Rebuild, and System Health including loud stale-tick warning. |
| F71 | F63/F37/F42 | Attachment/smilie/custom BBCode/word-filter/prefix/announcement administration; reversible render-time word filter. |

**Checkpoint 6:** an admin can configure, re-skin, moderate, repair, and
observe the board without shell access or redeploy.

### Phase 7 — Search, discovery, syndication

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F72 | F47 | Permission-filtered-in-SQL PostgreSQL FTS (weighted/stemmed/GiN), provider seam, and resumable 2M-post reindex. |
| F73 | F72 | No-JS advanced search with protected stored result sets, paging/search-within-results, and Postgres flood control. |
| F74 | F72/F32 | Budgeted, permission-filtered/paged New/Today/My/Unanswered discovery views. |
| F75 | F17 | Privacy-safe online locations/invisible handling/most-ever plus stats rollups/top posters/views/replies. |
| F76 | F72 | Guest-filtered RSS/Atom, sitemap/robots, correct canonical paginated URLs, OG/Twitter/JSON-LD; explicit private-content leak tests. |

**Checkpoint 7:** discovery, search, feeds, and metadata are useful without
leaking private forums.

### Phase 8 — Public APIs: themes and plugins

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F77 | F25–F34 | Freeze/document slot/view-model APIs; generated stale-checked slot docs and deprecation policy. |
| F78 | F77 | Materially different `midnight` theme with no core/theme-kit changes and CI rendering-contract coverage. |
| F79 | F77 | Plugin lifecycle/migrations/settings/pages/tasks, typed deterministic hooks (60+), UI slots, safe failure isolation/auto-disable/timing, and generated hook docs. |
| F80 | F79 | CI reference plugin exercises every documented extension point. |
| F81 | F79 | Permission-scoped, rate-limited documented REST API plus signed, queued/retried/dead-lettered webhooks. |

**Checkpoint 8:** a third party can build a theme and plugin from published
contracts without reading core source.

### Phase 9 — Ship it

| ID | Depends on | Deliverable and acceptance |
|---|---|---|
| F82 | F04 | `npx create-meith` scaffold with config/env/README/Deploy-to-Vercel; push-to-deploy works without manual build configuration. |
| F83 | F82/F63 | One-time `/install`: safe preflight, migrations/setup/admin/default forum, pooler warning, then irreversible self-disable. |
| F84 | F83 | Core/plugin upgrade command, dependency order, version/ACP notice, documented two-version no-data-loss upgrade. |
| F85 | F83 | Chunked, resumable, idempotent MyBB import preserving legacy IDs across all supported content; fixture round trip/report/counter proof. |
| F86 | F85 | Legacy hash verify-and-upgrade plus toggleable, table-tested 301s for every MyBB URL form. |
| F87 | F85 | Real MyBB BBCode corpus parity pass; every difference becomes a documented parity decision. |
| F88 | F82–F87 | Install/config/permissions/theme/plugin/migration/backup/restore/pooling troubleshooting documentation usable by a new operator. |
| F89 | F88 | Hot-page 2M-post load tests, documented p95 budgets, and remediation of budget violations. |

**Checkpoint 9:** a new operator can deploy and import a MyBB board in five
minutes while retaining links and member passwords.

## Decisions still requiring a human

1. Confirm the practical board-scale target. The current roadmap retains the
   million-post design and its counter/recount discipline.
2. Decide whether calendar/events, a portal page, localisation beyond
   i18n-ready English, and OAuth are v1 scope or plugins/out of scope.
3. Set the minimum Vercel plan/cron frequency assumed by digest and tick docs.
4. Decide whether themes are npm-only or also supported as source folders in a
   self-hosted fork.
5. Decide whether Next 16 Cache Components replace the conservative tagged
   cache approach; until then the current policy stays in force.
