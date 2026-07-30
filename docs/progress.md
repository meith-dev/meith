# Progress

Running log of what is complete and what the next action is, per plan §6.

**Three files, three jobs — keep them in their lanes:**

| File | Answers | Shape |
|---|---|---|
| [`plan-status.md`](./plan-status.md) | "Is F29 done?" | One row per plan feature. The tracking table. |
| `progress.md` (this file) | "What do I do next?" | Prose. Narrative and the next action. |
| [`deviations.md`](./deviations.md) | "Why is it like that?" | Numbered decisions, D1–D38. |

Update `plan-status.md` in the same PR as the feature. If the two disagree,
`plan-status.md` is the one that gets audited against the tree — trust it and fix
this file.

## Gate state (all green)

`pnpm verify` → exit 0: textual invariants + **guard probes**, the **slot
server/client boundary** check + its probe, dependency-cruiser (172 modules, 0
violations), typecheck (root **and** app), **931 tests** (a large share against
real Postgres via PGlite). `pnpm build` → exit 0 from a zero-secret
production environment. Three consecutive green runs after capping worker
concurrency — fifteen PGlite instances were saturating ten cores and failing
roughly one run in three (D34).

**Gate holes closed this pass:**

- The root `tsconfig.json` excludes `apps/forum`, so the whole app tier was
  type-checked by nothing but `next build` — which was not in `verify` and had
  itself never passed. Both now run `typecheck:app` (D18/D19).
- `pnpm guards` passing proved nothing: a rule whose pattern stopped matching
  passes as loudly as one that works. `pnpm guards:probe` now runs every guard
  against a must-match and a must-not-match sample, so both an inert rule and one
  broadened into uselessness fail CI (D10 made permanent).
- The PGlite fixture applied only `0000`, so a second migration would have been
  invisible to every integration test. It now reads the journal (D23).

## Complete

- **Phase 0 (F01–F14)** — workspace, env, db package + migrator, drivers, tick,
  outbox, settings, logging/errors, cache tags + boundary lint, CI, CLI
  (3 real commands), docs. Checkpoint 0 reached. See D1–D11.
  **Two of these are thinner than this line previously claimed:** F11's testkit
  is an empty package, and F10 has tag names but no cache implementation. Both
  are itemised under NEXT ACTION rather than left implied here.
- **Phase 1 permission core (F20/F21/F22)** — `@forum/authorization`: pure
  `Authorizer`, R4.2 combination, ancestor-chain resolution, logged bypasses,
  388-cell matrix gate + focused unit/mutation tests, F20 group-ID lint rule.
  See D12/D13.
- **Composition root (D11 resolved)** — `apps/forum/src/server/container.ts`
  selects the `AuthorizationSource` from `env.DATA_SOURCE`; Postgres adapter in
  `@forum/db` (acyclic), fixture adapter in-memory; wiring proven end-to-end. The
  Postgres branch is lazily required so fixture mode opens no socket. See D14.
- **Identity crypto (F17)** — `@forum/accounts/crypto`:
  - `password.ts` — Argon2id via hash-wasm (m=19456,t=2,p=1), self-describing
    PHC hashes, timing-safe verify, `needsRehash` upgrade seam.
  - `tokens.ts` — 256-bit opaque tokens, SHA-256 at rest (async), constant-time
    compare. ADR 0001 recorded. 21 tests; two mutation-verified.
- **Identity service + ports (F18/F19 domain logic)** — `@forum/accounts`:
  - `ports.ts` — the four repository interfaces + `Clock`/`AuthConfig`.
  - `memory-repos.ts` — in-memory fixture store implementing all four.
  - `service.ts` — `IdentityService`: register (validation, activation modes),
    login (lockout-before-hash, enumeration defence, rehash-on-login), logout,
    reset request/redeem (single-use TTL tokens, revoke-all-sessions).
  - 39 tests; lockout + reset-revocation mutation-verified. Two real bugs caught
    (reversed `verifyPassword` args, unawaited async `hashToken`). See D15.
- **Actor construction + Postgres adapters** — `@forum/db`:
  - `actor-builder.ts` — user id → resolved `Actor` (primary ∪ secondary groups
    deduped, `combinePermissionSets`, state map, `cache_versions[permissions]`).
    Guest path + `awaiting_approval`→`awaiting_activation` fix (D16).
  - `account-repos.ts` — the four `@forum/accounts` ports over Postgres;
    single-use `consume` as a conditional `UPDATE ... RETURNING`.
  - `pglite.fixture.ts` — real Postgres (WASM) with the actual migration applied.
  - 16 tests on real Postgres; single-use + expiry mutation-verified. See D16.
- **Session & remember-me core (F17 logic)** — `@forum/accounts` + `@forum/db`:
  - `session-service.ts` — `SessionService`: `startRemembered` and `resume`
    (rotate on use; on replay, burn the family + all sessions).
  - Ports grew `SessionRepository.supersede` (fixation), `.touchLocation`
    (throttled location triplet), and `RememberTokenRepository`; both stores
    implement them.
  - 16 tests; remember single-use, reuse→burn, and the location throttle all
    mutation-verified. See D17.

- **Identity app layer (F17 wiring, F18/F19 web layer)** — `context.ts`
  (`getActor()` via `React.cache`, guest fallback), `proxy.ts` (cookie triage
  only, no DB), `/auth/resume` (remember-me rotation in the Node runtime),
  Server Actions + no-JS forms for register / login / logout / reset.
  15 app-layer tests covering the acceptance criteria the domain suites cannot
  see: session fixation, open-redirect (`//evil` included), lockout refusing the
  *correct* password, single-use reset, case-insensitive login. Two real
  security bugs found and fixed in the process — see **D20** (reset token
  returned to the browser: account takeover) and **D21** (locale-dependent
  identifier folding). Both mutation-verified.

- **Forum tree operations (F16)** — `@forum/forums`: path arithmetic,
  `buildTree`, `planMove`/`planCreate`, `CachedForumRepository`, plus
  `PostgresForumRepository`. One-query tree read (now *measured*), four-level
  reparent, derived-path create, tag-invalidated caching. See **D22** — the
  prefix-sharing-sibling trap (`1.40` vs `1.4`) is the whole feature.
- **F10 caching harness** — `cachedGlobal` implemented (it was an interface with
  no implementation), and **every textual guard is now probed** by
  `pnpm guards:probe` against a must-match and a must-not-match sample, so an
  inert *or* an over-broad rule fails CI. See D25.
- **F11 testkit** — deterministic seeder + the **query-budget helper**. It found
  a 32-query N+1 in `visibleForumIds` within an hour (**D26**).
- **F13 operator CLI** — eight commands; a board can be set up end to end.
  Passwords read from stdin, never `argv`. See D24.
- **F14** — `docs/nextjs-conventions.md`, the deliverable that did not exist.
- **F15 group ladder** — seeded by migration `0001`. It **had never been seeded
  at all**: the initial migration contains zero INSERTs, so a fresh Postgres
  board had no groups and registration would have failed on a foreign key (D23).
- **F21 forum permissions** — four-level resolution now tested over real
  Postgres, and `visibleForumIds` reduced from 32 queries to a constant 3 (D26).
- **F05 driver contract suite** — all four driver families pass a shared
  contract. It immediately exposed that `PostgresQueue` only worked with
  postgres.js's result shape and would have broken on the Neon driver F03's seam
  exists for (**D27**).
- **F23 bans and ban filters** — expiry restores the *captured* group, filters
  apply at both registration and login, and filter ordering avoids a
  user-enumeration oracle (**D29**).
- **F24 group promotions** — `@forum/groups` (was empty): rule evaluation with
  three safety guards (never lift a ban, never demote, never re-apply),
  preview/apply sharing one evaluation, keyset paging (**D30**).
- **F06 the tick actually runs** — `PostgresTaskRepository` plus app-tier
  workers; `/api/system/tick` calls `tick()` instead of returning `ran: []`.
  Tasks whose workers do not exist are **omitted rather than stubbed** (**D32**).
- **`forum.config.ts`** — the build-time registry, read by `layout.tsx` so it is
  load-bearing, plus a guard banning runtime filesystem scans (**D33**).
- **F05 `S3FileStore`** — per ADR 0002, passing the shared contract with real
  presigning. Measuring it disproved the ADR's own lazy-require condition, which
  was amended rather than quietly dropped (**D34**).

**Phase 1 is complete: 10 of 10.**

- **F25 theme-kit** — the 25-slot registry (each slot declaring server or client
  kind), JSON-shaped view models with a two-sided compile-time proof, and
  `defineTheme`/`resolveTheme` with `extends`. The kind rule is enforced three
  times because no single layer catches the real case; `pnpm slots:check` is the
  one that does, and it fails on a slot map it cannot read *and* on finding zero
  manifests. `themes/default` fills the shell slots and the auth layout renders
  through them, so the machinery is load-bearing rather than declared.
  See **D35** — including why slots are flat (a slot never renders another slot)
  and the two things that would have shipped broken: Tailwind never scanned
  `themes/`, and vitest could not import a `.tsx` at all.
- **The token mirror was entirely stale (D36)** — `tokens.ts` promised a sync
  test "in Phase 2"; writing it found four tokens that do not exist in the CSS,
  fifteen missing, and every value from an older palette. F26 would have
  validated database overrides against it.

- **F27 board shell + F29 board index** — the first real page. `PageShell`
  composes six slots once and both route groups render through it, so the auth
  screens are part of the board. The index reads counters and last post in one
  query (budget-asserted across two board sizes, mutation-verified), filters
  invisible **subtrees whole** — closing open question 5 — and is cached nowhere,
  because every row depends on who is asking. See **D38**.
- **F30 forum display** — `/forum/[id]-[slug]` resolves a visible forum, then
  renders `ForumDisplay`, `SubforumList`, `ThreadRow`, and `Pagination` through
  the theme. The first thread read is an opaque-cursor keyset query over sticky,
  last-post time, and id; it is one statement at both 3 and 50 rows, and the
  equal-timestamp tie-breaker is tested against real Postgres.
- **F31 thread view** — `/thread/[id]-[slug]` checks `thread.view` against the
  resolved forum matrix before rendering. Posts keyset-page by id in one
  statement while retaining their absolute thread number; the plain-text
  fallback escapes raw content before the theme inserts it as HTML. BBCode,
  replies, and post actions remain unadvertised until their owning features.
- **F32 read tracking** — member read state is stored as forum timestamps plus
  per-thread last-post markers. The index receives computed unread forum ids;
  forum rows compare their last post against both watermarks. Native POST forms
  mark all, one forum, or the last post on a thread page, and all targets are
  re-authorised at the route before writing. The state read is a constant three
  statements and a late tab cannot move a marker backwards.

## NEXT ACTION — resume here

**F33 · member profile** is next: profile links are still intentionally null,
because the theme has no route to send them to. It needs one profile read and a
`MemberProfile` slot; keep deleted authors as plain names rather than linking a
dead account.

The counters the index renders are still never written: `forums.thread_count`,
`post_count`, and the last-post triplet are read by F29 and maintained by nobody
until **F38**. On a real board they stay at zero; the fixture board fakes them.

Still worth settling (unchanged from F25):

- **`ViewerModel.username` is always `null`.** `Actor` carries permissions, not
  profile data. The board index reads no user row, so nothing here forced the
  issue; F33's profile page will.
- **The board title is a constant** (`BOARD_TITLE` in `src/view/shell.ts`). F08's
  settings registry exists; wiring `board.name` through is a few lines.

Smaller things still unblocked, in rough order of value:

1. **`forum task:run`** — the CLI command was blocked on `TaskRepository`, which
   now exists. Small, and gives operators a way to force a tick.
2. **F04** — CI never boots the standalone image, and `apps/worker` is empty, so
   the self-hosting path is unverified and rots quietly while everyone develops
   on Vercel. This is F04's stated acceptance criterion.
3. **A Postgres `OutboxReader`** — the last missing task worker besides F38's
   counters; `outbox.relay` registers itself the moment it exists.

Still outstanding and worth keeping visible:

- **F35's no-JS Playwright run does not exist.** The auth forms are written for
  it, but "works with JavaScript disabled" is a claim, not a measurement.
- A failing task logs but does not raise an admin notification (needs F55).
- Permission columns are generated into a `Record<string, …>`, so
  `usergroups.canView` is not statically typed anywhere (D23) — four casts so far.
- **Deleting or renaming a route breaks `typecheck:app`** until `next build`
  runs, because `.next/types/validator.ts` still imports the removed page.
- **`apps/forum/tsconfig.json` hand-copies the workspace path aliases** from
  `tsconfig.base.json` — TypeScript replaces `paths` rather than merging, so a
  new package must be added in both places.
- **`BROWSER_THEME_COLOR` is not checked against the `background` token** (D36).
  Only its format is. An exact check needs OKLCH → sRGB conversion in code, which
  belongs with F26; until then, changing `background` means recomputing two hex
  values by hand.

**Test harness note:** integration tests now use PGlite via `createTestDb()` in
`packages/db/src/pglite.fixture.ts` — boot once per suite, clear mutable tables
in `beforeEach`. Reuse this for any DB-touching test.

## Deviations index

Full detail in `docs/deviations.md` (D1–D38). Recurring themes: (a) inert or
wrong guards found and fixed (boundary lint, missing ESLint config, absent
`process.env` rule, untested ACP invariant); (b) runtime-only bugs a
compile/typecheck waved through but tests caught (reversed `verifyPassword` args,
unawaited async `hashToken` — D15; `awaiting_approval` mis-mapped to a null actor
— D16); (c) real Postgres (PGlite) over mocks for SQL-semantic tests (D16).
Standing rule D10 — prove every gate with a deliberate violation, prove every
test kills its mutant, and never read a gate's result through a pipe.
