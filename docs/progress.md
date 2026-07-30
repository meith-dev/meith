# Progress

Running log of what is complete and what the next action is, per plan §6.

**Three files, three jobs — keep them in their lanes:**

| File | Answers | Shape |
|---|---|---|
| [`plan-status.md`](./plan-status.md) | "Is F29 done?" | One row per plan feature. The tracking table. |
| `progress.md` (this file) | "What do I do next?" | Prose. Narrative and the next action. |
| [`deviations.md`](./deviations.md) | "Why is it like that?" | Numbered decisions, D1–D22. |

Update `plan-status.md` in the same PR as the feature. If the two disagree,
`plan-status.md` is the one that gets audited against the tree — trust it and fix
this file.

## Gate state (all green)

`pnpm verify` → exit 0: textual invariants, dependency-cruiser (112 modules, 0
violations), typecheck (root **and** app — see below), 579 tests (28 against real
Postgres via PGlite). `pnpm build` → exit 0 from a zero-secret production
environment. Every gate is probe-verified per D10 — a gate that has never been
observed to fail is not trusted.

**Two gate holes closed.** The root `tsconfig.json` excludes `apps/forum`, so the
entire app tier — pages, actions, components — was type-checked by nothing but
`next build`, which was not in `verify` and had itself never passed. `verify` and
CI now both run `typecheck:app`. See D18/D19.

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

**Finish F16's remaining item, then F21 end-to-end.**

1. **Tree read cached and tagged (F16, blocked on F10).** `CacheTags.forumTree()`
   exists, but `cachedGlobal` is an *interface with no implementation* —
   `packages/core/src/cache.ts` declares `CachedGlobalOptions` and nothing in the
   workspace references it. The `MemoryCache`/`NextCache` drivers exist, so the
   missing piece is the seam between them and the tag registry. That is F10's
   harness, and it should be built as its own step rather than inlined here.
2. **Wire the authorizer to the repos end-to-end** — `visibleForumIds` and
   `forumMatrix` over Postgres, then re-run F22's matrix gate against real data
   rather than the in-memory source. This closes Phase 1.

Every known gap is now itemised per-feature in [`plan-status.md`](./plan-status.md),
which was audited against the working tree on 2026-07-30. The five that most
affect what can honestly be signed off next:

- **`packages/testkit` is an empty package — only `package.json`.** F11 was
  previously recorded complete here; the harness, the deterministic seeder and
  the **query-budget assertion helper** do not exist. The Definition of Done
  requires that helper on every list page, so F29's board index cannot be signed
  off until it lands.
- **F10's `cachedGlobal` is an interface with no implementation.** Blocks F16's
  tree caching and every later cached read.
- The tick route is `/api/tick`; F06 and R1 both say `/api/system/tick`, and
  there is no `vercel.json`, so nothing schedules it.
- No `forum.config.ts` (invariant 6 — the build-time registry).
- No Playwright/no-JS run (F35). The forms are written for it, but "works with
  JavaScript disabled" is a claim, not a measurement.

**Test harness note:** integration tests now use PGlite via `createTestDb()` in
`packages/db/src/pglite.fixture.ts` — boot once per suite, clear mutable tables
in `beforeEach`. Reuse this for any DB-touching test.

## Deviations index

Full detail in `docs/deviations.md` (D1–D22). Recurring themes: (a) inert or
wrong guards found and fixed (boundary lint, missing ESLint config, absent
`process.env` rule, untested ACP invariant); (b) runtime-only bugs a
compile/typecheck waved through but tests caught (reversed `verifyPassword` args,
unawaited async `hashToken` — D15; `awaiting_approval` mis-mapped to a null actor
— D16); (c) real Postgres (PGlite) over mocks for SQL-semantic tests (D16).
Standing rule D10 — prove every gate with a deliberate violation, prove every
test kills its mutant, and never read a gate's result through a pipe.
