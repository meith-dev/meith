# Progress

Running log of what is complete and what the next action is, per the roadmap.

**Three files, three jobs — keep them in their lanes:**

| File | Answers | Shape |
|---|---|---|
| [`roadmap.md`](./roadmap.md) | "What does F29 promise?" | Canonical scope, dependencies, and acceptance criteria. |
| [`plan-status.md`](./plan-status.md) | "Is F29 done?" | One row per roadmap feature. The tracking table. |
| `progress.md` (this file) | "What do I do next?" | Prose. Narrative and the next action. |
| [`deviations.md`](./deviations.md) | "Why is it like that?" | Numbered decisions, D1–D53. |

Update `plan-status.md` in the same PR as the feature. If the two disagree,
`plan-status.md` is the one that gets audited against the tree — trust it and fix
this file.

## Gate state (all green)

`pnpm verify` → exit 0: textual invariants (nine guards, F47's included)
+ **guard probes**, the **slot server/client boundary** check + its probe,
dependency-cruiser (421 modules, 0 violations), typecheck (root **and** app),
**1833 tests** (a large share against real Postgres via PGlite). `pnpm build` →
exit 0 from a zero-secret production environment, with `/modcp`, `/modcp/log`,
`/modcp/forums`, `/modcp/ip` and `/moderation/warn` in the route table. Three consecutive green runs after capping worker
concurrency — fifteen PGlite instances were saturating ten cores and failing
roughly one run in three (D34) — and after raising the *test* timeout, which
F38's four extra database suites pushed the Argon2id lockout test past (D41).

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
- **F33 member profile** — `/member/[id]` authorises `profile.view`, reads the
  public profile subset, and renders the existing `MemberProfile` slot. Deleted
  accounts 404 and remain plain author names; live authors now link consistently
  from the shell, listing, thread, and post views. Fixture and Postgres paths are
  both present, with the latter verified against PGlite.
- **F34 error and redirect pages** — the database-free 404 body renders through
  `ErrorNotice`; the required client error boundary uses the same token styling
  without exposing exception details. `/redirect` renders `RedirectNotice` with
  a two-second meta refresh and a real fallback link, rejecting off-board targets.
- **F35 no-JS and accessibility** — a Playwright CI suite now proves the fixture
  board’s thread link, registration, login, session, and profile link without
  JavaScript. It also caught and fixed the skip-link focus target and the
  insecure development `__Host-` cookie rejection.

- **F38 counter maintenance and recount** — complete. The direct write (D40) now
  has the other three parts around it: the `post.created` event reaches a
  consumer, ancestors are rolled up by path prefix and cannot be double-counted
  on replay, thread views are buffered out of the listing index and flushed by a
  task, and `PostgresCounterRecount` walks threads → forums → users in bounded
  batches from a stored cursor, writing computed truth. A deliberately corrupted
  board converges; a second sweep corrects nothing. See **D41**, including the
  one definition of "counts" the recount and the writer had to agree on, and the
  two things this turned up: the outbox had no Postgres reader at all, so the
  event was being written to nothing, and the CI schema-drift step inspects a
  directory that does not exist.

- **F39 new thread** — the board can be posted to. `ThreadComposer` owns the
  rules, `PostgresThreadWriteRepository` writes the thread, its opening post,
  its counters and its event in one transaction, and `createThreadAction`
  re-authorises both `thread.view` and `thread.post` before any of it. A held
  thread is written unapproved, counts nowhere, and redirects to its forum with
  a notice rather than to a page its author would 404 on. `posting.flood_seconds`
  and `posting.max_length` are the first settings the app has ever read. See
  **D42** for why the composer's `<form>` is a slot region rather than a set of
  view-model props, and for the gap: fixture mode has no writer, so the no-JS
  proof is `FormData`-driven action tests rather than the browser suite.

- **F36 BBCode** — post bodies are markup. `@forum/bbcode` is a scanner, not a
  pile of regular expressions, and its safety argument is that it *constructs*
  its output rather than sanitising one: every character comes from a tag
  literal, a validated attribute, or `escapeHtml`. The suite asserts that
  property directly — every `<` in the output is one the package wrote — over a
  35-payload corpus and 4,000 seeded-fuzz inputs, with a second fuzz pass
  proving no word is ever lost. Malformed input degrades and never throws: a
  crossed tag closes implicitly, an unclosed one is demoted to the text it looks
  like, and every limit turns markup into text rather than raising. The stored
  render lives on `posts` with the version that produced it, so bumping
  `RENDER_VERSION` invalidates every render on the board at once and an escaping
  fix ships without a migration; `posts.render_backfill` sweeps the stale rows
  behind it, cursor-free. F40's quote is a quote block as of this change. See
  **D44**, and `mybb-parity.md` for what is deliberately not supported.

- **F40 reply and quote** — a thread can be answered. `ReplyComposer` adds what
  F39's rules cannot see (locked threads, `allow_replies`, a thread that is no
  longer visible) and reports a race rather than enforcing one: the reply is
  written either way. Quoting is a link with a server-resolved prefill, so it
  works with scripting off, and the quoted post is re-read thread-scoped so
  `?quote=` cannot lift a post out of a forum the quoter may not read. See
  **D43**, including why the quote is BBCode (F36 renders it now) and why the
  redirect sometimes opens a page at the reply rather than in context.

- **F41 edit and delete own posts — the gate is green.** `PostEditor` owns both
  transitions and `PostgresPostWriteRepository` writes the revision, the post,
  its render and every counter in one transaction. The half F38 left explicitly
  to this feature is done, and it is not F38 negated: counts reverse
  arithmetically, but `last_post_id` is a *pointer*, so the whole ancestor chain
  is recomputed bottom-up in the same transaction. `unapproved → deleted` moves
  nothing — the silent drift a "delete always decrements" version causes — and
  F38's roll-up ledger, re-read as "currently counted in ancestors", makes
  delete and restore idempotent with no new table; the handler reads the row
  rather than the event, so an out-of-order delete/restore pair converges. A
  moderator sees hidden posts with a banner because the *query* includes them,
  not because the theme hides anything. See **D45**, including why the opening
  post cannot be deleted on its own and what the fixture board had wrong about
  its own permission ladder.

- **F47 visibility model enforcement — the second gate is green.** There was
  never a missing check; there were five hand-written answers to "which content
  may this reader see", with no way to tell from any one of them whether the
  other four agreed. Now there is one `ContentScope`, produced only by
  `Authorizer.contentScope` and turned into SQL only by `visibleIn`, and the
  scope is a **required, undefaulted argument** — so an unauthorised read is a
  compile error rather than an audit. Guard `R3 no-adhoc-content-visibility`
  bans any query-shaped mention of the column outside the counter and write
  paths, and found two real hits on its first run. The leak suite is a property
  (every path × every scope, every row inside the scope handed in) plus
  exact-set assertions so it cannot pass by returning nothing. See **D46**,
  including why numbering is a disclosure and why `locateForum` returns an id
  and never a row.

- **F48 the moderation queue** — the first moderator surface. `/moderation`
  lists held threads and held replies, oldest first, scoped by
  `moderatedForumIds`, and approves or rejects them in bounded batches. The
  transitions are F41's, reused rather than reimplemented. Two things came out
  of it worth knowing: **`forum_moderators` had never been read** — the table
  has existed since F21 and `Target.isForumModerator` has never once been set,
  so an appointed moderator was appointed to nothing — and approving turned out
  to need its own action, which cost the F22 matrix a thirteenth column exactly
  as the gate intends. The selection is never trusted: every submitted id is
  re-read for its real forum, and the moderated set is resolved per request
  rather than carried in the form. See **D47**.

- **F49 reports** — members can report a post, a thread or a member, and
  moderators work the results at `/moderation/reports`. Two tables, because a
  report has a current state *and* a history, and the history is the only place
  a private moderator note lives — "resolved because X" belongs to that
  resolution, not to a column the next one overwrites. The duplicate guard is a
  partial unique index rather than a prior read: two clicks arriving together
  would both pass a check, and a report button that adds a queue row every time
  is the cheapest denial-of-service on the board. Scoped by F48's
  `moderatedForumIds` for content and `modcp.access` for member reports, with
  "does not exist" and "not yours" giving the same answer. See **D48**.

- **F50 thread tools** — lock, pin, move and delete/restore, each logged. The
  four actions read an **appointment right and no usergroup field**, which is
  the first place the permission model diverges from its own pattern and is
  deliberate: "may lock threads everywhere" is something you are appointed to,
  not a checkbox on a group. So F48's debt came due — `moderatorApproves` became
  a full `ModeratorRights`, `forum_moderators` grew to seven rights in the
  reader, and `moderatorRightsIn` is the seam that answers *what* to
  `moderatedForumIds`' *where*. A move needs the right at **both ends**,
  resolved as two matrices. The counters take one tally and reuse it for the
  forum, the ancestors and every author, and the two chain updates cancel
  exactly at a shared ancestor. **Copy and the move redirect stub are not
  built** — see D49 and `mybb-parity.md` for why copy is a product question
  rather than a missing function. F50's row is `PARTIAL` and says so.


- **F51 merge and split** — the two operations that move posts *between*
  threads, and one arithmetic seen from either side. A split takes "from this
  post onwards" and lands the new thread in the **same forum**, always: splitting
  and moving are two acts, and doing both at once would hand a moderator a second
  forum to place content in. A merge absorbs the named source into the named
  target, which is never inferred from age or size — guessing it is how a merge
  destroys the thread somebody meant to keep. Post order survives by construction
  because F31 pages by id; `is_first_post` does not and is set and cleared
  explicitly, which is the thing that silently goes wrong. **The author-count
  question F50 deferred with copy is settled**: neither operation duplicates a
  post, so `users.post_count` never moves and only `thread_count` does, by one.
  `postsFrom` refuses a cut point that is not a visible post of *this* thread,
  and the merge box's raw thread number goes through `thread.view` before
  anything else — without that it is a thread-existence oracle. See **D50** and
  three `mybb-parity.md` entries.

- **F52 inline moderation** — the same power as the queue, exercised where the
  content is. Checkboxes down a forum listing and a thread page, one bar below,
  eight tools; every transition is F41's, F48's or F50's, and the arithmetic F50
  kept inline moved to `thread-counters.ts` so the bulk path cannot drift from
  the single-target one. Two things are worth carrying forward. **The checkboxes
  are not inside the form**, because `ForumDisplay` already renders a mark-read
  form and nested forms are not parsed — they are associated by HTML's `form`
  attribute, which is native, works with scripting off, and is what
  `new FormData(form)` reads after hydration. And **the re-read is scoped**:
  `Authorizer.forumIdsWhere(actor, action)` is new, keyed by action rather than
  by a rights field because `canSoftDeletePosts` means two different things
  depending on which action asks. Without that scope, "refused" and "no such
  thing" are different answers, and the outcome counts enumerate every private
  forum on the board. It chunks rather than refusing, which is safe only because
  every write is state-guarded. See **D51**.

- **F53 warnings** — the first moderator act aimed at a *person*.
  `users.warning_points` has existed since migration `0000` with nothing that
  writes it; what writes it now **derives it** rather than incrementing it,
  because an incremented total cannot survive a revocation — you would be
  subtracting from a number that two expiries and a later warning have already
  moved. Levels are thresholds re-evaluated after every change, which is the
  whole reason revoking a warning actually lifts a suspension instead of only
  lowering a number. The restriction reaches the posting path as two booleans
  and **outranks `bypassesModeration`**, so a moderator under a warning is not
  the one member it cannot reach. `warnings.expire` corrects the cache and
  re-evaluates the level; it never bans, because it has no actor to attribute a
  ban to. See **D52**, and four parity entries including why levels are points
  rather than MyBB's percentages.

- **F54 the moderator control panel — Phase 4 closes.** `/modcp` with an
  overview, *my forums*, the log, and the address lookup. Access is a group grant
  **or** an appointment, because F48's appointed moderator has work and no grant.
  *My forums* is the screen F50 made necessary: once locking became something you
  are appointed to per forum, a moderator's only way to find out what they had
  been appointed to was to press a button and be refused. The log is an
  **allow-list** of moderation actions rather than a deny-list, because
  `admin_log` is shared with the ACP and will keep growing row types. The address
  lookup is gated separately, audited on every call including the empty ones, and
  searches the truncated prefix F09 stores — and says so on screen, because
  "shares an address" is a certainty the data does not support. **F48's debt is
  paid**: `Target.isForumModerator` is now set on every per-page `can()` call.
  See **D53**.

## NEXT ACTION — resume here

**Phase 4 is closed: eight of eight.** Copy landed once the product question
behind it was answered — credit the authors, as MyBB does — and the move
redirect stub became a recorded parity divergence rather than an open gap. The
flagged leftovers from the last pass are paid down too: `forum task:run` and
`task:list`, the schema-drift CI step (which had inspected a directory that has
never existed), `installTestContainer()`, the board title from `board.name`,
`ViewerModel.username`, and F51's hand-picked split now that F52 supplies the
checkboxes.

### Fixed since: the Postgres path had never run anywhere

`TypeError: getDb is not a function`, from a synchronous `require('@forum/db')`
in three modules — `container.ts`, `theme-runtime.ts` and `settings.ts`.
Turbopack resolves that package as an **async module**, and a sync `require()`
of one yields the pending namespace, so every destructured binding was
`undefined`. All three are static imports now; guard
`R2 no-lazy-require-of-db` bans the pattern, and CI's `image` job boots the web
role against real Postgres so the regression has a test.

It survived because **CI only ever built and ran `DATA_SOURCE=fixture`**, which
takes none of those paths. The Postgres path had never been built, booted or
tested — which is also why the standalone image could not serve a Postgres
board.

### Also fixed: `Date` parameters did not work on real Postgres

`forum task:run` failed against a real server with *"Received an instance of
Date"*. The cause turned out to be `drizzle()` itself: constructing it
overwrites postgres.js's serialisers for every date and timestamp OID with a
passthrough, which is right for its *typed* columns (they convert to strings
first) and wrong for a raw `sql` template, where a bare `Date` reaches the
driver unconverted.

One function in `client.ts` reinstates a serialiser that converts a `Date` and
passes everything else through, so drizzle's own behaviour is unchanged and all
~50 raw-SQL call sites are fixed at once.

**1,800 passing tests missed it because every database suite runs against
PGlite**, which does not use those serialisers. That is F11's recorded
substitution gap costing something for the first time. `client.pg.test.ts` now
runs against a real server — skipped unless `TEST_DATABASE_URL` is set, so a
normal `pnpm test` needs no service, and switched on in CI's `migrations` job.
The whole scheduler now runs against real Postgres, which it never had.

### Then

**F55 · notification infrastructure** remains the right next feature. Three
finished features are waiting on it and each says so in its own row: a failing
task logs and raises nothing (ten tasks now), F49's reports notify nobody, and
F53's warnings notify nobody — a warned member finds out by trying to post.

### What the image job found

F04 asked CI to build **and boot** the image. Building it for the first time
found five things that had rotted invisibly, all now fixed:

1. **No `.dockerignore` at all**, so a developer's gitignored `apps/forum/.env`
   was copied into the build — and its `QUEUE_DRIVER=postgres` broke the
   fixture build. The patterns must be `**/.env`: dockerignore is anchored to
   the context root, so a bare `.env` matches only the repo root.
2. **The build stage copied two of the many pnpm `node_modules` trees.** It
   only ever worked because, with no `.dockerignore`, `COPY . .` was dragging
   the *host's* trees in behind it. Now it builds `FROM deps`.
3. **Three package manifests were missing** from a hand-maintained COPY list
   (`bbcode`, `moderation`, `runtime`) — replaced by a `--parents` glob so it
   cannot rot again.
4. **Three different pnpm versions**: the image took whatever was latest
   (11.18), dev used 10.6, CI pinned 9. One `packageManager` field now.
5. **compose's migrate service ran `drizzle-kit`**, which is a development tool
   and is not in the pruned standalone tree. It is `FORUM_ROLE=migrate` now,
   running the same `runMigrations()` the CLI does.

Also worth knowing: **do not add `sharp` to `onlyBuiltDependencies`.** Letting
its postinstall run makes `next build` fail at prerender; nothing uses image
optimisation yet (F42/F58 would).

Still outstanding and worth keeping visible:

- **The e2e board cannot post.** Playwright runs against fixture mode, which has
  no writer, so no browser test covers posting, moderating or warning without
  JavaScript — including F52's central claim that `form`-attribute-associated
  checkboxes submit with scripting off. Either the e2e harness gains a real
  database or the fixture gains a content store. D38's "fixture writes throw"
  rule was written for *structure*; this is the third time it has cost coverage.
- **`ViewerModel.canAccessModCp` is group-level only**, so the shell's ModCP
  link does not appear for a per-forum appointee even though `/modcp` admits
  them. Answering it properly costs the tree on every page render.
- Permission columns are generated into a `Record<string, …>`, so
  `usergroups.canView` is not statically typed anywhere (D23).
- **Deleting or renaming a route breaks `typecheck:app`** until `next build`
  runs, because `.next/types/validator.ts` still imports the removed page.
- **`apps/forum/tsconfig.json` hand-copies the workspace path aliases** from
  `tsconfig.base.json` — a new package must be added in both places.

**Test harness note:** integration tests use PGlite via `createTestDb()` in
`packages/db/src/pglite.fixture.ts` — boot once per suite, clear mutable tables
in `beforeEach`. Reuse this for any DB-touching test.

## Deviations index

Full detail in `docs/deviations.md` (D1–D53). Recurring themes: (a) inert or
wrong guards found and fixed (boundary lint, missing ESLint config, absent
`process.env` rule, untested ACP invariant, and now the schema-drift step
pointed at a directory that does not exist — D41); (b) runtime-only bugs a
compile/typecheck waved through but tests caught (reversed `verifyPassword` args,
unawaited async `hashToken` — D15; `awaiting_approval` mis-mapped to a null actor
— D16); (c) real Postgres (PGlite) over mocks for SQL-semantic tests (D16).
Standing rule D10 — prove every gate with a deliberate violation, prove every
test kills its mutant, and never read a gate's result through a pipe.
