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

Last audited **2026-07-30**, against the working tree, not from memory:
`pnpm verify` (579 tests, 22 files), `pnpm build`, plus direct inspection of the
migration's `CREATE TABLE` list, each package's `src/` contents, `.github/workflows/ci.yml`,
and the CLI's registered commands. Where a row says a thing is missing, the file
was looked for and was not there.

Counts below are features, not effort. Several `TODO` rows are days of work; a
couple of `PARTIAL` rows are an afternoon.

| Phase | Features | DONE | PARTIAL | TODO |
|---|---|---|---|---|
| 0 — Skeleton | 14 | 6 | 8 | 0 |
| 1 — Identity, tree, permissions | 10 | 6 | 2 | 2 |
| 2 — Themes and reading | 11 | 0 | 2 | 9 |
| 3 — Posting | 11 | 0 | 0 | 11 |
| 4 — Moderation | 8 | 0 | 0 | 8 |
| 5 — Members and social | 8 | 0 | 0 | 8 |
| 6 — Admin CP | 9 | 0 | 0 | 9 |
| 7 — Search and discovery | 5 | 0 | 0 | 5 |
| 8 — Public APIs | 5 | 0 | 0 | 5 |
| 9 — Ship it | 8 | 0 | 0 | 8 |
| **Total** | **89** | **12** | **12** | **65** |

---

## Phase 0 — Skeleton you can deploy

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Monorepo and Next.js scaffold | `DONE` | Workspaces + Turborepo; `next` pinned exact `16.2.6`, `react` `19.2.0` — no caret. `strict` + `noUncheckedIndexedAccess` on in `tsconfig.base.json`. |
| F02 | Config and environment validation | `DONE` | Zod schema in `packages/core/src/env.ts`; lazy proxy (D1); build-phase vs runtime split (D18). `process.env` confined by guard + ESLint rule. 11 tests. |
| F03 | Database package | `PARTIAL` | Drizzle + postgres.js, forward-only migration, transaction helper. **Gap:** acceptance asks for "migrations run up *and down*", which contradicts invariant 32 (forward-only) — see Open questions. No Testcontainers; PGlite is used instead. |
| F04 | Deploy on both targets | `PARTIAL` | Dockerfile (multi-stage, standalone) + `docker-compose.yml`; CI builds the app. **Gap:** CI never *boots* the standalone image, which is the stated acceptance criterion; `apps/worker` is an empty package, so the "same image runs the worker with a flag" path does not exist. |
| F05 | Driver interfaces | `PARTIAL` | `QueueDriver`/`CacheDriver`/`FileStore`/`MailDriver` + `resolve.ts` from env. `MemoryQueue`, `PostgresQueue` (`FOR UPDATE SKIP LOCKED`), `MemoryCache`, `NextCache`, `LocalFileStore`. **Gap:** no `S3FileStore` and no `HttpMailDriver` — both named as *defaults* in the plan. No contract test suite. |
| F06 | System tick and scheduled tasks | `PARTIAL` | `packages/tasks` registry + scheduler, secret-guarded route, `tasks`/`task_log` tables. **Gap:** route is `/api/tick`; F06 and R1 both specify `/api/system/tick`. No `vercel.json`, so nothing schedules it. No worker loop. |
| F07 | Outbox and event bus | `DONE` | `outbox` table, transactional write helper, drain-to-queue, retry/backoff/dead-letter. Rollback-suppresses-delivery covered. |
| F08 | Settings registry | `DONE` | `packages/settings` registry + `settings`/`setting_groups`; typed accessors; migration-seeded defaults. |
| F09 | Errors, logging, error pages | `DONE` | Pino + request-id context, error taxonomy, `error.tsx`/`not-found.tsx`. Redaction covers credentials — tightened in D20 after a token reached the logs via a URL string. |
| F10 | Caching policy harness | `PARTIAL` | `CacheTags` registry (every tag spelled once) and both cache drivers exist. **Gap:** `cachedGlobal` is an *interface with no implementation* — `CachedGlobalOptions` is referenced nowhere in the workspace. No "no actor in a cached route" lint rule. This blocks F16's tree caching. |
| F11 | Boundary lint and testkit | `PARTIAL` | `dependency-cruiser` enforces R2 (119 modules, 0 violations) and is probe-verified. **Gap:** `packages/testkit` contains **only `package.json`** — no harness, no factories, no deterministic seeder (50 forums / 100k threads / 2M posts / 20k users), **no query-budget assertion helper**. The Definition of Done requires that helper on every list page. |
| F12 | CI pipeline | `DONE` | Three jobs: static checks (guards, lint, depcruise, both typechecks, tests), production build, migrations + drift + Postgres tests. Runtime not yet measured against the 12-minute budget. |
| F13 | Operator CLI (v0) | `PARTIAL` | `apps/cli` dispatcher with `env:check`, `migrate`, `settings:list`. **Gap:** plan asks for `user create`, `user promote`, `forum create`, `settings set`, `task run`, `cache clear`. Acceptance ("a usable board can be set up entirely from the CLI") does not hold. |
| F14 | Conventions document | `PARTIAL` | `docs/deviations.md`, `docs/mybb-parity.md`, `docs/adr/` exist and are maintained. **Gap:** `docs/nextjs-conventions.md` — the actual deliverable — does not exist. |

> **Checkpoint 0** — not fully reached. The app deploys and `pnpm build` is green
> from a zero-secret environment, but no cron drives the tick and the CLI cannot
> set up a board.

## Phase 1 — Identity, forum tree, permissions

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F15 | Users and usergroups schema | `DONE` | `users`, `usergroups`, `user_group_memberships` + seeded group ladder; primary/secondary groups with display flag. |
| F16 | Forum tree schema | `PARTIAL` | Schema (materialised `path`, indexes) + `@forum/forums` (`buildTree`, `planMove`) + `PostgresForumRepository`. Four-level reparent and one-query read both proven, 34 tests, 10 on real Postgres (D22). **Gap:** tree read is not cached/tagged — blocked on F10's missing `cachedGlobal`. |
| F17 | Password hashing, sessions, request context | `DONE` | Argon2id via hash-wasm (ADR 0001); opaque sessions, rotation on login, remember-me with reuse→family-burn; `proxy.ts` cookie-only; `getActor()` via `React.cache`. Fixation + location-throttle mutation-verified. |
| F18 | Registration and activation | `DONE` | Server Action + no-JS form; validation, reserved names, case-insensitive uniqueness (D21). All three activation modes covered in the domain suite. |
| F19 | Login, logout, password reset | `DONE` | Four flows as no-JS Server Actions; Postgres-backed lockout; single-use expiring reset tokens. D20 fixed a reset-token leak to the browser. |
| F20 | Permission engine — global layer | `DONE` | `@forum/authorization`: pure `Authorizer`, R4.2 combination (OR / max-with-0 / AND), logged bypasses, `permission_version`. Group-ID lint rule live (D13). |
| F21 | Forum permissions and moderator rights | `PARTIAL`→`DONE`* | Nullable-column inheritance, ancestor walk over `path`, `forum_moderators`, `visibleForumIds`. *Postgres adapter exists and is tested; the end-to-end wiring through the container still runs against the in-memory source. |
| F22 | ⛔ GATE — Permission matrix suite | `GATE` — green | 388-cell table-driven cross product over actors × contexts × actions; fixture reviewed. Currently exercises the in-memory source; re-run against Postgres when F21's wiring lands. |
| F23 | Bans and ban filters | `TODO` | `bans` and `ban_filters` tables exist in the migration. No expiry task, no filter application at registration/login. |
| F24 | Group promotions | `TODO` | No `group_promotions` table, no rule evaluation, no task. |

> **Checkpoint 1** — substantially reached: register / activate / log in / log out
> / reset all work without JavaScript, the tree exists with per-group overrides,
> and F22 proves resolution. Outstanding: F23, F24, and F21's end-to-end wiring.

## Phase 2 — Themes and reading the board

All `TODO`. `packages/theme-kit` and `packages/ui` are effectively empty (one
file in `ui`); `themes/default` exists as a token source consumed by the auth
pages. `threads`/`posts` tables exist in the migration; the packages are empty.

| ID | Feature | Status | Note |
|---|---|---|---|
| F25 | theme-kit foundation | `TODO` | Slot registry + server/client kind lint. Build **before** any page — the plan is explicit that retrofitting fails. |
| F26 | Token pipeline and runtime overrides | `TODO` | `themes` table exists. |
| F27 | Default theme — shell | `TODO` | |
| F28 | Threads and posts schema | `PARTIAL` | Tables and `visibility` columns exist; partial indexes and the seeder do not. |
| F29 | Board index | `TODO` | Needs F11's query-budget helper to be signed off. |
| F30 | Forum display | `TODO` | |
| F31 | Thread view | `TODO` | |
| F32 | Read tracking | `TODO` | `forums_read` / `threads_read` tables exist. |
| F33 | Member profile | `TODO` | |
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
2. **F03 vs invariant 32.** F03's acceptance asks that "migrations run up **and
   down**"; invariant 32 says "migrations are forward-only and checked in". Down
   migrations are currently not written. Assumed the invariant wins — confirm.
3. **F06 route path.** Built as `/api/tick`; F06 and R1 both say
   `/api/system/tick`. Worth renaming now, before `vercel.json` and any docs
   reference it.
4. **`forum.config.ts` does not exist** (invariant 6 — "everything installable is
   registered in `forum.config.ts`; nothing discovered by filesystem scan"). It
   has no consumers until F69/F79, but themes and drivers are already selected in
   code and would need to move.
5. **Orphan forums in `buildTree`** are promoted to roots rather than dropped
   (D22). Once F21 filters by visibility, a visible child of a hidden parent
   surfaces at top level. Confirm at F21 whether subtrees should instead be
   filtered whole.
