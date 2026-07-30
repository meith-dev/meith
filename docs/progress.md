# Progress

Running log of what is complete and what the next action is, per plan §6.

**Three files, three jobs — keep them in their lanes:**

| File | Answers | Shape |
|---|---|---|
| [`plan-status.md`](./plan-status.md) | "Is F29 done?" | One row per plan feature. The tracking table. |
| `progress.md` (this file) | "What do I do next?" | Prose. Narrative and the next action. |
| [`deviations.md`](./deviations.md) | "Why is it like that?" | Numbered decisions, D1–D23. |

Update `plan-status.md` in the same PR as the feature. If the two disagree,
`plan-status.md` is the one that gets audited against the tree — trust it and fix
this file.

## Gate state (all green)

`pnpm verify` → exit 0: textual invariants + **guard probes**, dependency-cruiser
(122 modules, 0 violations), typecheck (root **and** app), 614 tests (against
real Postgres via PGlite). `pnpm build` → exit 0 from a zero-secret production
environment.

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

- **Forum tree operations (F16)** — `@forum/forums` (was an empty package; the
  schema already existed): `path.ts` arithmetic, `buildTree`, and `planMove`
  (cycles, link-parents, slug collisions, dense sibling renumbering), plus
  `PostgresForumRepository` in `@forum/db` — one-query tree read, and moves
  applied in one transaction under `pg_advisory_xact_lock` with the tree
  re-read inside it. 34 tests, 10 of them on real Postgres. Both stated
  acceptance criteria met: a four-level reparent rewrites every descendant, and
  the tree read is one query regardless of depth. See **D22** — the
  prefix-sharing-sibling trap (`1.40` vs `1.4`) is the whole feature, and the
  naive-prefix mutant fails four tests across both layers.

## NEXT ACTION — resume here

**Close Phase 1, then unblock Phase 2.**

1. **F21 end-to-end** — wire `visibleForumIds` and `forumMatrix` through the
   container over Postgres, then re-run F22's matrix gate against real data
   instead of the in-memory source. The Postgres adapter exists and is tested;
   what is missing is the wiring. This closes Phase 1 alongside F23/F24.
2. **F11's testkit** — `packages/testkit` still contains only a `package.json`.
   The deterministic seeder and the **query-budget assertion helper** do not
   exist, and the Definition of Done requires that helper on every list page, so
   **F29's board index cannot be signed off without it**. This is the single
   biggest blocker to starting Phase 2 honestly.
3. **F13's CLI** — `user:create`, `user:promote`, `forum:create`,
   `settings:get|set`. The repositories they need now all exist
   (`createPostgresAccountStore`, `PostgresForumRepository.create`,
   `PostgresSettingsRepository`) and the group ladder is seeded, so this is
   assembly rather than design. `task:run` stays blocked on F06.

Per-feature status for everything else lives in
[`plan-status.md`](./plan-status.md), re-audited 2026-07-30. Still outstanding
and worth keeping visible:

- **F06's tick route does not run anything** — it returns `ran: []`. Needs a
  `TaskRepository` implementation, and its `TaskWorkers` are partly blocked on
  F38 (`reconcileCounters`) and F24 (`applyPromotions`).
- No `forum.config.ts` (invariant 6 — the build-time registry).
- No Playwright/no-JS run (F35). The auth forms are written for it, but "works
  with JavaScript disabled" is a claim, not a measurement.
- Permission columns are generated into a `Record<string, …>`, so
  `usergroups.canView` is not statically typed anywhere (D23).

**Test harness note:** integration tests now use PGlite via `createTestDb()` in
`packages/db/src/pglite.fixture.ts` — boot once per suite, clear mutable tables
in `beforeEach`. Reuse this for any DB-touching test.

## Deviations index

Full detail in `docs/deviations.md` (D1–D23). Recurring themes: (a) inert or
wrong guards found and fixed (boundary lint, missing ESLint config, absent
`process.env` rule, untested ACP invariant); (b) runtime-only bugs a
compile/typecheck waved through but tests caught (reversed `verifyPassword` args,
unawaited async `hashToken` — D15; `awaiting_approval` mis-mapped to a null actor
— D16); (c) real Postgres (PGlite) over mocks for SQL-semantic tests (D16).
Standing rule D10 — prove every gate with a deliberate violation, prove every
test kills its mutant, and never read a gate's result through a pipe.
