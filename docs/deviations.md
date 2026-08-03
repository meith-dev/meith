# Deviations & decisions

Every entry records a place where the implementation departs from the plan text,
or where the plan was ambiguous and a choice had to be made. Additions go at the
bottom of the relevant phase.

## Phase 0

### D1 — `env` is a lazy Proxy, not a validated constant (F02)

**Plan:** "validated once at boot; a missing variable is a startup crash."

**Implemented:** `assertEnv()` validates and memoises; the exported `env` is a
Proxy that calls it on first property *access*. `apps/forum/instrumentation.ts`
calls `assertEnv()` at boot, so the startup-crash guarantee is preserved for the
running app.

**Why:** validating at module load means importing *any* `@forum/core` symbol —
an error class, a type — detonates in processes that legitimately have no app
environment. This was not theoretical: `drizzle-kit generate` imports the schema,
which imports the permission registry from core, purely to diff DDL. With eager
validation, generating a migration failed demanding `DATABASE_URL`, a variable
the operator had deliberately not set. Fail-fast is kept where it has value
(app boot) and dropped where it only breaks tooling.

**Consequence:** `isProduction` / `isTest` became functions rather than
constants, since a constant would re-introduce load-time validation.

### D2 — Driver defaults are derived from `DATA_SOURCE` (F02)

`DATA_SOURCE` defaults to `postgres` when `DATABASE_URL` is present and
`fixture` otherwise. `QUEUE_DRIVER` and `CACHE_DRIVER` then default to
`memory` in fixture mode and `postgres`/`next` in Postgres mode.

Plain zod `.default()` could not express this: defaults are applied before
`superRefine` runs, so a checkout with no database failed validation demanding a
`DATABASE_URL` *for the queue* — a variable the operator never configured.
Resolved in `withDerivedDefaults()` before parsing.

`QUEUE_DRIVER=memory` is rejected outright in production: queued jobs live in
the heap, so every cold start would silently discard pending e-mail, search
indexing and notifications with no error anywhere.

### D3 — `searchFloodSeconds` permission removed (F19, R4.2)

MyBB has a per-group `searchfloodtime`. It is deliberately **absent** from the
permission registry.

R4.2 combines numeric permissions with `MAX`, treating `0` as unlimited. A flood
*interval* is most permissive at its **smallest** non-zero value, so it cannot
obey the rule without inverting it for exactly one field — and a combination
engine with a per-field exception is a bug waiting to happen.

Modelled instead as the board setting `search.flood_seconds` plus the existing
`canBypassFloodCheck` boolean, which combines correctly under OR. See
`docs/mybb-parity.md#flood-intervals`.

### D4 — Boundary lint was silently inert; now probe-verified (F10)

The R2 rules reported a clean run while enforcing **nothing**. Two compounding
causes:

1. `tsConfig` pointed at the root `tsconfig.json`, which contains only
   `references` — no `paths`. Every `@forum/*` import was therefore
   unresolvable, and dependency-cruiser recorded `couldNotResolve: true` with
   the bare specifier as the `resolved` value. Rules matching a *path* could
   never match. Fixed by pointing at `tsconfig.base.json`, where the aliases
   live.
2. Even resolving correctly, the only infra rule matched `^packages/drivers/`.
   Nothing covered `@forum/db`.

A probe module importing `getDb()` into `packages/forums` passed silently under
both faults. The merged `domain-no-infra-impl` rule now matches all three shapes
a workspace import can take (real path, `node_modules` symlink, bare specifier)
and is verified by probe.

**Standing practice:** a guard that has never been observed to fail is not a
guard. Before trusting a green boundary-lint run, add a violating probe module,
confirm the error, then delete it.

### D5 — Path aliases require the target file to exist

Related to D4: an alias pointing at `packages/<name>/src/index.ts` cannot
resolve until that barrel exists. A package whose barrel is missing looks
dependency-free to the linter. Each package therefore gets its `src/index.ts`
when it is created, even if nearly empty.

### D6 — Two partial unique indexes for forum slugs (F16)

Root-level slug uniqueness and sibling slug uniqueness are enforced by *two*
partial unique indexes (`WHERE parent_id IS NULL` and `WHERE parent_id IS NOT
NULL`) rather than one composite index on `(parent_id, slug)`.

In Postgres `NULL != NULL`, so a plain unique constraint on `(parent_id, slug)`
permits unlimited duplicate root-level slugs — the exact collision the
constraint exists to prevent.

### D7 — `exactOptionalPropertyTypes` shaped several signatures

With this flag an optional property must be *absent*, not
present-and-undefined. Two consequences worth knowing before adding code:

- Conditional spreads (`...(x ? { k: x } : {})`) widen the inferred type and are
  rejected. `withRequestContext` builds its context imperatively instead.
- A field that is genuinely assigned `undefined` to reset it (the
  `globalThis` database handles) must be typed `T | undefined`, not `T?`.

### D8 — pino `base: null`, not `base: undefined`

`undefined` leaves pino's default `pid`/`hostname` bindings in place; `null` is
the documented way to drop them. They are noise in a serverless log stream. The
logger is also built lazily, for the D1 reason.

### D9 — `pnpm lint` had no config and had never run (F01, F12)

`lint` was in the `verify` chain from the start, but no `eslint.config.*` existed.
ESLint exited non-zero with a config-not-found error which read, in a long chain,
much like an ordinary lint failure. **Third** inert gate of the same family as D4.

Writing the config surfaced a fourth: the sanctioned
`eslint-disable-next-line no-restricted-properties` in `packages/core/src/env.ts`
was reported as an *unused directive*, proving no rule had ever banned
`process.env` at the AST level. `no-restricted-properties` is now configured, and
a probe confirms it fires in a domain package.

Both the grep guard and the ESLint rule are kept deliberately. They fail in
opposite directions:

- `scripts/guards.mjs` flagged `eslint.config.mjs` itself, because that file
  *mentions* `process.env` as the string subject of the rule banning it. A regex
  cannot distinguish a property read from a description of one.
- ESLint only sees files it parses, and a per-line disable comment is reviewable
  where a regex exemption is not.

`reportUnusedDisableDirectives` is enabled so a suppression that stops being
necessary becomes a warning rather than lingering as false reassurance.

### D10 — Standing verification practice

D4 and D9 were both "green gate, zero enforcement". Every gate added from here is
proven by a deliberate violation before it is trusted:

| Gate | Probe used | Observed |
| --- | --- | --- |
| `depcruise` R2 | domain module importing `@forum/db` + `next/navigation` | 2 errors |
| `eslint` F02 | `process.env` read in `packages/forums` | 1 error |
| `guards` F02 | `process.env` read in `apps/forum/src` | 1 violation |
| `vitest` outbox crash-safety | `markRelayed` moved before `enqueue` | correct test failed |
| tick auth | wrong-length and wrong-value secrets | all rejected, no throw |

The outbox mutation is the important one: it failed *exactly* the
crash-recovery test and no others, which is what distinguishes a real assertion
from a tautological one.

### D11 — Composition root deferred; CLI trimmed to match (F13)

`tick()`, `relayOutbox()` and `SettingsSnapshot.fromOverrides()` all take their
repository as a parameter — that is what makes them testable without a database,
and it is why the 15 passing tests need no Postgres. The corollary is that
*something* must construct those repositories from either the fixture or
Postgres. That composition root does not exist yet.

`forum` therefore ships three commands (`env:check`, `migrate`,
`settings:list`) rather than the six first drafted. `tick`, `queue:drain` and
`settings:get` are omitted, not stubbed: a `--help` that advertises a command
which throws is worse than one that omits it. They land with the composition
root in Phase 1, alongside the account and forum repositories that need the same
wiring.

`runMigrations()` was genuinely missing from `@forum/db` and has been added. It
uses `DIRECT_DATABASE_URL` (new, optional, falls back to `DATABASE_URL`) with
`max: 1`, because drizzle's advisory lock only serialises concurrent deploys if
every statement runs on one connection — a transaction-mode pooler defeats it.

**Phase 0 gate status:** `guards`, `lint`, `depcruise`, `typecheck`, `test` all
pass; 59 modules cruised, 15 tests. Each gate probe-verified per D10.

### D12 — ACP access is never emergent from the admin bypass (F20/F21)

A bypass must be explicit, never a side effect of a column (plan F20). The
control panel is the sharpest instance: the administrator bypass grants every
action in `ADMIN_ALWAYS`, and `admincp.access` is deliberately **not** in that
set. It is decided in exactly one place — `canGlobal`, via the
`canAccessAdminCp` column — so a full administrator whose group lacks that column
is denied the ACP. In practice an admin group carries it; the point is the
*mechanism* cannot be reached by a bypass, a super-mod, or a future god-mode flag.

This was found the honest way. Mutation M3 (deleting a special-case
`admincp.access` early-return) left all 388 matrix cells green, because the
matrix's eight actors are each either a full admin or a non-staffer — none is a
delegated ACP staffer, the only actor the deleted line distinguished. Two
lessons:

1. The early-return was **redundant** with `canGlobal` and was removed. Two code
   paths deciding the same thing is drift waiting to happen.
2. The real invariant is "`admincp.access ∉ ADMIN_ALWAYS`". The mutation that
   *matters* — adding it back — now fails two focused tests in `authorizer.test.ts`
   (verified). The 388-cell matrix was the wrong instrument for this one property;
   a four-assertion unit test is the right one.

Writing the first version of that test also caught a latent bug in my own code:
I had expected the admin bypass to grant the ACP, which would have let an
administrator lock every non-admin out of a panel they themselves could not
reach. The test failing against correct code is what surfaced the design
question at all.

### D13 — F20 group-ID lint rule, and its two false positives

F20 requires a lint rule that fires when a group ID escapes the authorization
package. Group IDs are bare numbers, so the enforceable proxy is access to the
two Actor fields that carry them: `no-restricted-properties` bans reads of
`groupIds` and `primaryGroupId` everywhere, re-enabled only inside
`packages/authorization/**`. A probe in a domain package fires two errors; the
same code inside authorization is silent (both verified).

Enabling it immediately flagged `packages/db/src/schema/identity.ts` —
`index('users_primary_group_idx').on(t.primaryGroupId)`. Naming and indexing a
persisted column is not branching on a group ID, so schema files are exempt
(env ban retained). Query/repo code under `packages/db/src` outside `schema/`
stays covered, so the eventual actor-construction read will need its promised
per-line disable. Flat config cannot disable one entry of a multi-entry rule, so
both exemptions re-declare the rule with only the `process.env` restriction
rather than turning it fully off.

**Phase 1 critical-path status (F20/F21/F22):** authorization package complete;
425 tests pass (388-cell matrix + 37 focused/unit); combination, tree
resolution, bypass isolation and the F20 lint rule each probe-verified. Repos,
sessions and the composition root (D11) remain.

### D14 — Composition root: where the Postgres adapter lives, and lazy loading

The authorizer defines its data needs as a port (`AuthorizationSource`);
something must supply a Postgres implementation without making the domain depend
on the database. Two placement decisions:

- **The SQL adapter lives in `@forum/db`, not `@forum/authorization`.**
  authorization is a domain package (core-only). Implementing a domain port with
  SQL is exactly the database layer's job, and the edge `db → authorization →
  core` is acyclic (verified: 72 modules, no cycle). The forum tree uses a
  dot-path (`parentPath`) inclusive of self, so `ancestorChain` is a single row
  read plus a parse — no recursive CTE — and both dimensions of the
  forum-override lookup are filtered in SQL, not post-filtered in JS.

- **The container lives in `apps/forum/src/server`, the app tier.** Only the app
  may import both `@forum/db` and the domain, so composition belongs there. It
  selects the source from `env.DATA_SOURCE` and builds the `Authorizer` once. The
  Postgres branch is loaded through a **synchronous, single-line, twice-disabled
  `require`** so fixture mode (dev, tests, DB-less preview) never pulls in
  postgres.js. Building the container in fixture mode opens no socket — that is
  the whole point of the branch, and the container test asserts it.

The row mappers carry the two subtle rules from D-nothing-yet into code and pin
them with mutation tests: a group row missing a column falls back to the
*registry default* (not `undefined`), while a forum-override column that is null
means **inherit** (dropped from the override), not deny. Mutating null→false
fails three tests including both inherit cases (verified).

**Process note.** The first full-verify run after this work was **red** and I
nearly missed it: an `eslint-disable` directive had drifted one line off its
`require` (the destructuring wrapped), leaving the directive unused *and* the
require unguarded. Worse, I had piped `pnpm verify` into `grep`, so `$?` reported
grep's exit, not verify's. Re-running as `pnpm verify > log; echo exit=$?` showed
the truth. Lesson folded into the D10 practice: **never read a gate's result
through a pipe** — capture the real exit code.

### D15 — Identity service: ports, in-memory repos, register/login/reset

The `IdentityService` is pure orchestration over four injected repository ports
(`Account`, `Session`, `CredentialToken`, `LoginAttempt`) plus an injected
`Clock` and `AuthConfig`, so every rule is testable here with no database. The
in-memory store is the fixture; the Postgres adapters (next) implement the same
ports. Security behaviours pinned by 39 tests, two of them mutation-verified
(neutering the lockout throw, and skipping session-revocation-on-reset, each kill
a test):

- **Login lockout** is checked *before* any hash work, so a locked bucket costs
  nothing; the window is driven by the injected clock.
- **User-enumeration defence**: a missing account still runs a real
  `verifyPassword` against a genuine throwaway hash (see the bug below), so the
  timing of "no such user" matches "wrong password".
- **Rehash-on-login** upgrades an under-policy-but-valid hash to current policy
  and leaves a current one untouched (tested by minting a real weak argon2id hash
  via hash-wasm and asserting the stored hash changes, then doesn't).
- **Reset tokens** are single-use (redemption is a consume, enforced in the
  repo), TTL-bounded by the clock, and a successful reset **revokes all
  sessions**. Requesting a new token revokes prior ones.

**Two real bugs the tests caught before they could ship.** Both came from me
mis-remembering my *own* crypto API written the previous turn:

1. `verifyPassword(password, hash)` was called with the arguments **reversed**
   (`verifyPassword(encoded, password)`) — every login would have failed to
   verify. A reversed-argument bug that a "does login succeed?" test caught
   immediately.
2. `hashToken` is **async** (SHA-256 via `crypto.subtle.digest`) but I called it
   synchronously, so the in-memory store keyed sessions and tokens on unresolved
   `Promise` objects that never compared equal — silently breaking every session
   lookup and token redemption. The reset tests surfaced it as "invalid or
   expired" on a freshly-issued token.

   Both are the exact class of error that a "compiles + types pass" check waves
   through (the second only failed at runtime), and the argument-order one is why
   the D10 "prove the test has teeth" habit matters: a tautological login test
   would have masked it.

A third near-bug: my first `dummyHash` for the enumeration defence was a
hand-fabricated PHC string. It would have been rejected cheaply by the verifier,
spending *no* time and defeating the whole point. Replaced with a real,
memoised argon2id hash of a random value.

**F20 disable landed as promised (D13).** Exactly one member-access read —
`input.primaryGroupId` copying a persisted column into the stored record — trips
the group-id lint rule. It is transport into the record the actor builder reads,
not an authorization decision, so it carries the sanctioned per-line
`eslint-disable-next-line no-restricted-properties` with justification, not a
package-wide override.

**Identity remaining:** actor construction (user + groups → `Actor`, the read the
authorizer consumes), the four Postgres repository adapters, and the F18/F19
no-JS web layer (register/login/reset).

### D16 — Actor construction + Postgres adapters, tested on real Postgres

The actor builder (`packages/db/src/actor-builder.ts`) turns a user id into the
resolved `Actor` the authorizer consumes: it loads the account row, unions the
primary group with the secondary memberships (deduped), OR/max-combines their
permission sets via `combinePermissionSets`, maps DB state → `ActorState`, and
stamps the `cache_versions[permissions]` counter. The four Postgres repository
adapters (`account-repos.ts`) implement the `@forum/accounts` ports so the same
`IdentityService` runs over Postgres in production and the in-memory store in
unit tests.

**Testing against a real database, not a mock.** These adapters are almost
entirely SQL semantics — a conditional single-use `UPDATE`, partial-index
uniqueness, `timestamptz` comparisons, group-union dedup — so a hand-rolled mock
would "pass" while proving nothing. Instead the tests boot **PGlite** (Postgres
compiled to WASM) and apply the *actual generated migration SQL* verbatim via a
`pglite.fixture.ts` helper (a `.fixture.ts`, so the orphan rule ignores it, per
the D-series precedent). Added `@electric-sql/pglite` as a dev dependency. 16 new
tests (6 actor + 10 repo). The crown-jewel invariant — single-use `consume` —
is mutation-verified two ways: dropping the `consumed_at IS NULL` guard makes a
token redeemable twice (kills "exactly once"), and dropping the expiry guard
lets an expired token through (kills "refuses expired"). Both mutants die.

**A real behavioural fix reading the schema:** the DB has *two* pre-active
states, `awaiting_activation` (email) and `awaiting_approval` (admin), but the
authorizer models only one read-mostly `awaiting_activation`. My first `mapState`
silently dropped `awaiting_approval` into the `default` → `deleted` bucket, which
would have made every admin-approval-pending account a null actor (no access at
all, instead of restricted access). Now both pre-active states collapse to
`awaiting_activation`.

**F20 firing semantics, pinned precisely (extends D13/D15).** Chasing three
rounds of red verify taught the exact rule behaviour, now documented at each
site: `no-restricted-properties` fires on a **value read** (`user.primaryGroupId`)
and on a **Drizzle column reference** (`users.primaryGroupId` in a select/insert
map), but **not** on an object-literal key or shorthand property. So the
transport sites (select column, map row, insert value, read own group to build
the ladder) each carry a justified per-line disable; object keys don't and must
not (an over-applied disable trips the "unused directive" error and fails the
gate — the tooling actively rejects cargo-culted suppressions, which is the
behaviour we want). Still no package-wide override: authz decisions have no
business in an infra adapter, and keeping the disables per-line keeps that honest.

### D17 — Session & remember-me core (F17), the security decisions isolated

F17's session logic splits into a *decision* (what to do when a remember-me
token is replayed) and *plumbing* (cookies, Set-Cookie flags). The decision is
security-critical and pure, so it lives in a new `SessionService`
(`packages/accounts/src/session-service.ts`) with its own focused tests; the
plumbing stays in the app layer (still to come). Ports grew three
concurrency-shaped operations — `SessionRepository.supersede` (fixation
defence), `SessionRepository.touchLocation` (the R3.1 location triplet, throttled),
and a whole `RememberTokenRepository` (issue / rotate / revokeFamily) — each
implemented twice: reference semantics in `memory-repos.ts`, real SQL in
`account-repos.ts`, both pinned by the same tests.

**Three invariants, each a conditional write, each mutation-verified:**
- *Remember-me single-use.* `rotate` is a two-step atomic claim: an `UPDATE ...
  SET used_at WHERE used_at IS NULL AND revoked_at IS NULL AND not-expired
  RETURNING`, and only the winner inserts the next token in the family. Dropping
  the `used_at IS NULL` guard makes a replayed token rotate again — kills the
  reuse test.
- *Reuse ⇒ burn the family.* When the claim fails but the row exists and is
  unexpired, that is a replay of a spent/revoked token — the signature of a
  stolen cookie. `SessionService.resume` responds by revoking the entire token
  family *and* every live session for the user: we cannot tell thief from
  victim, so both re-authenticate. A revoked token re-presented keeps returning
  `reuse` (not `invalid`), so the breach response is idempotent — the test was
  wrong here first (asserted `invalid`); the code was right.
- *Location throttle is the WHERE clause.* `touchLocation` rewrites the row only
  `WHERE last_seen_at < now - windowSeconds`, so a burst of page views collapses
  to one write and `RETURNING id` tells the caller whether it happened. The
  throttle is a property of the method, never the caller. Dropping the predicate
  makes every call write — kills the throttle test.

**Session fixation.** `supersede(old, new)` points the old row at its
replacement and revokes it in one `UPDATE`, so a concurrent request never sees a
superseded-but-live session; login mints a fresh session id rather than reusing
one, which the rotation test asserts (`sessionToken !== previous`).

16 new tests (4 SessionService over the in-memory store with a fixed clock, 12
Postgres repo tests over PGlite). Same discipline as D16: real Postgres for the
SQL-semantic parts, mutation-verified guards, and the `SessionRecord` widened
(`supersededBySessionId`, `lastSeenAt`) via a shared `SESSION_COLUMNS`/
`toSessionRecord` pair so select and insert-returning cannot drift.

**Identity remaining:** only the app-layer wiring is left — `context.ts` (lazy
per-request `Actor` via `React.cache`), `proxy.ts` (cookie resolution, no DB),
and the F18/F19 no-JS Server-Action web layer (register / login / logout /
reset). All the domain services and both store implementations they need now
exist and are tested.

### D18 — The build phase is not the production runtime (F02)

**Plan:** F02 — "the app refuses to boot misconfigured"; `AUTH_SECRET` and
`TICK_SECRET` "required in production".

**Problem.** `next build` forces `NODE_ENV=production`, so the production-only
rules fired while *compiling*. A build machine legitimately holds no runtime
secrets, so `pnpm build` could not succeed without them. Both CI and the
Dockerfile had quietly grown a fake one (`AUTH_SECRET=...-not-used-at-runtime-0`)
to get past it — and neither actually worked, because each set `AUTH_SECRET` but
not `TICK_SECRET`, and `DATA_SOURCE=fixture` derives `QUEUE_DRIVER=memory`, which
the same block rejects. The production build had never passed.

**Decision.** The schema now distinguishes compiling from serving via
`NEXT_PHASE` (set by `next build` and nothing else). The production rules stand
down for the build phase only.

**Why this gives up no safety.** The rules are about how the app behaves *in
service*, and a build produces no behaviour. They are enforced unconditionally
where it matters: `instrumentation.ts` calls `assertRuntimeEnv()`, which strips
the build-phase exemption, so a stray `NEXT_PHASE` in a runtime environment
cannot wave the checks through — a fail-open that would otherwise be silent.
Verified end-to-end, not just asserted: booting the built server with no secrets
fails with the full F02 message on both `next start` and the standalone
entrypoint. The placeholder secrets are gone from CI and the Dockerfile.

### D19 — `logger()` must never be bound at module scope (F02/F09)

`logger()` reads the ambient request context at call time and builds pino
eagerly. A module-level `const log = logger(...)` therefore did two bad things at
once: bound an empty context for the process lifetime (so every line it wrote
lost its `requestId`), and turned *importing* the module into a full environment
validation — defeating the point of D1's lazy proxy and breaking `next build`,
whose page-data collection imports server modules with no production secrets.

Fixed at the two call sites, documented on `logger()` itself so the rule reaches
future ones, and enforced by guard `F02 no-module-scope-logger`. Binding inside a
function body stays legal; only module scope is banned. Mutation-verified.

## Phase 1

### D20 — The password-reset dev affordance was an account-takeover hole (F19)

**Found while writing the app-layer tests the web layer shipped without.**

`requestResetAction` returned the live reset token to the browser *whenever one
was issued*, rendered by `ResetRequestForm` as a "Continue to reset your
password" link. The comment above it read "a real deployment emails it and never
renders this" — but nothing enforced that. Any visitor who typed a known address
into the public reset form got back a working single-use token for that account:
unauthenticated takeover of any user whose email address is known.

**Decision.** The token crosses to the client only when `NODE_ENV` is
`development`. Gated on `NODE_ENV` rather than on the mail driver or data source
deliberately — a production board with mail misconfigured must still never hand a
reset token to whoever typed the address in.

The accompanying `log.info({ resetPath: '/reset/confirm?token=...' })` is gone
too. Pino's redaction covers `token` keys, but a token interpolated into a URL
string sails straight past it, and §40 forbids credentials in logs at default
level.

Both directions are pinned by test, and the mutant (restoring the unconditional
return) was verified to fail the suite.

### D21 — Identifier case-folding is locale-independent (F17/F18)

`register`, `login`, `requestPasswordReset` and the login lockout bucket all
folded case with `toLocaleLowerCase()`. With no locale argument that uses the
*host's* default locale, making a stored `username_lower` a property of the
machine that wrote it. Under `tr_TR`, `'IVAN'` folds to `'ıvan'` (dotless), so:

- F18's "duplicate username differing only by case is rejected" stops holding —
  `IVAN` and `Ivan` become two accounts;
- a row written on one host stops matching on another, and the user cannot log
  in;
- the lockout bucket splits, so alternating case doubles the allowed attempts.

**Decision.** One `foldIdentifier()` helper (`packages/accounts/src/case-fold.ts`)
using locale-independent `toLowerCase()`, used everywhere.

**Enforcement is textual, and that is the point.** A unit test cannot catch this
— it passes in every locale except Turkish and Azeri, so it would be green on
every developer machine and in CI. Guard `F17 no-locale-case-fold` bans
`toLocaleLowerCase()`/`toLocaleUpperCase()` outright; mutation-verified by
restoring the old call and watching the guard fire.

### D22 — Forum tree: the subtree predicate is the whole feature (F16)

**Plan:** F16 — "Reordering and reparenting must update every descendant's
`path` in one transaction. Test with a four-level tree."

The schema (materialised `path`, indexes) already existed; `packages/forums` was
an empty package. The operations half now lives there: `path.ts` (path
arithmetic), `tree.ts` (`buildTree`), `move.ts` (`planMove`), plus
`PostgresForumRepository` in `@forum/db`.

**The one thing worth writing down.** A materialised-path implementation is
almost entirely correct if you get one predicate right and catastrophically
wrong if you do not. `'1.4'` is a string prefix of `'1.40'`, but `1.40` is a
*sibling*, not a descendant. Two ways to get this wrong, both natural:

- `path LIKE '1.4%'` as the subtree predicate — drags unrelated siblings into
  every move, and rejects legal destinations as cycles.
- `replace(path, oldRoot, newRoot)` to rehang descendants — substitutes every
  occurrence anywhere in the string, not just the prefix.

So the codebase has exactly one subtree test (`isInSubtree`, comparing on the
separator) and one rehang (`rehang`, slicing by length), and the SQL uses a
`VALUES` join over ids computed by the planner rather than any string surgery.
A prefix-sharing sibling (`1.40` beside `1.4`) is in both the unit fixture and
the PGlite fixture; the naive-prefix mutant fails four tests across both layers.

**Concurrency.** `move()` re-reads the tree *inside* the transaction and takes
`pg_advisory_xact_lock` first. Planning against a caller's snapshot is how two
concurrent moves slip a cycle past validation — each validates against a tree
that the other is about to change. The lock is transaction-scoped, so it is
released on rollback too and a failed move cannot wedge the ACP.

**Split into planner + applier** so the entire failure surface (cycles, link
parents, slug collisions, sibling renumbering, descendant rewrites) is pure and
testable without a database; the repository only applies a validated plan.

**Orphans are promoted to roots, not dropped** (`buildTree`). Once F21 filters
the input by visibility, a child the actor may view can outlive a parent they may
not. Dropping it would make a permission grant vanish silently. Noted as a
divergence to revisit at F21, which may prefer to filter subtrees whole.

**Deliberately not done in F16** — see progress.md: the tree read is not yet
cached and tagged. `CacheTags.forumTree()` exists, but `cachedGlobal` is an
interface in `packages/core/src/cache.ts` with no implementation anywhere, so
there is no seam to wire it to. Building F10's caching harness is its own
feature, not a rider on this one.

### D23 — The group ladder was never seeded (F15)

**Found while wiring the CLI's `user:create`.** F15's acceptance is "default
groups present after migration with documented permission defaults". They were
not: `0000_initial_schema.sql` contains **zero INSERT statements**. The seven
groups existed only in `apps/forum/src/server/seed-board.ts`, which is the
in-memory fixture board — so a fresh Postgres deployment had an empty
`usergroups` table, and the first registration would have failed on the
`users.primary_group_id` foreign key.

The schema had always anticipated this: `usergroups.key` is commented "stable
machine name, migrations and seeds key off this", and `permission-columns.ts`
says in as many words that "the seed migration then sets the real per-group
values". The migration was simply never written.

**Decision.** `0001_seed_usergroups.sql`, hand-written because this is *data*
and drizzle-kit only diffs structure. Every permission column is NOT NULL with a
deny-by-default fallback, so each group lists only what it **grants** — meaning a
permission added in a later release lands denied everywhere until a migration
grants it deliberately, which is the safe direction.

Ids are explicit and pinned by test: `ActorBuilder` is constructed with
`guestGroupId: 1` and `AUTH_CONFIG.defaultMemberGroupId` is the registered
group, and the fixture board uses the same numbering. If they drift, a fixture
actor and a Postgres actor stop resolving identically and every parity
assumption in the test suite quietly stops meaning anything.

**Two traps this surfaced, both now covered:**

- **Explicit ids do not advance the identity sequence.** Without a `setval`, the
  first group an administrator creates collides on id 1. The same applies to any
  seed or import preserving upstream ids (F85) — it bit the forum-tree test
  fixture in the same session, from the same cause.
- **The PGlite fixture only applied `0000`.** It named one file, so a second
  migration would have been invisible to every integration test. It now reads
  the journal — the same list the real runner applies — so a migration that is
  checked in but never registered fails in tests exactly as it would in
  production, rather than being silently picked up by a glob.

**Not typed, deliberately noted:** the permission columns are generated into a
`Record<string, …>`, so drizzle's inferred row type does not carry them and
`usergroups.canView` is not statically checked anywhere. `permissions-map.ts`
already exists to convert a loose row into a validated `PermissionSet`, and the
seed test asserts through that mapper rather than around it. Making the columns
statically typed would need a mapped type over the registry — worth doing, but
it is a change to F20's foundation and not a rider on a seed migration.

### D24 — The CLI's composition root, and why it is a second one (F13)

`apps/cli` deliberately does not import `apps/forum/src/server/container.ts`.
That module is `server-only` and reaches for `next/headers`, which has no
meaning in a plain Node process.

What the two must share is **policy**, not wiring. `DEFAULT_AUTH_POLICY` moved
into `@forum/accounts` so a user created by `forum user:create` satisfies exactly
the rules the registration form enforces — otherwise the CLI becomes a way to
mint accounts the app then rejects, which is the failure the CLI's "thin layer"
rule exists to prevent. Only the two genuinely board-level decisions
(`activationMethod`, `defaultMemberGroupId`) are supplied per caller.

**Postgres only.** The fixture store lives in the heap of whichever process is
running, so `forum user:create` against it would report success and change
nothing — worse than refusing.

**No SQL in the CLI.** The commands first composed drizzle queries directly,
which put schema knowledge outside `@forum/db` in violation of R2. They now go
through `PostgresAdminRepository`, which the ACP's user and group screens
(F66/F67) will want anyway.

**Passwords come from stdin.** Anything in `argv` is visible in shell history and
to every user on the box via `ps`. `--password` still works for scripting but
warns, because a silent insecure default is worse than a noisy one.

**Arguments are validated before the database is opened**, so a missing
`--title` is reported as a missing `--title` rather than as whatever the
connection error happens to say.

**Two things this surfaced:**

- The dispatcher printed a full stack trace for every failure, including expected
  ones. A stack for "you have not set DATABASE_URL" buries the one line that says
  how to fix it, and trains people to ignore stack traces so the real ones stop
  being read. Known `AppError`s now print their message alone.
- `saveSettings` threw a bare `Error` on an invalid value. Both callers key off
  the error taxonomy — the Server Action turns a `ValidationError` into an inline
  field message rather than a 500, and the CLI prints it without a stack — so a
  plain `Error` reached neither and would have surfaced in the ACP (F64) as
  "Something went wrong". It now throws `ValidationError`.

`task:run` and `cache:clear` are still absent, and deliberately: registering
commands that throw would make `forum --help` advertise capabilities the binary
does not have.

### D25 — Query budgets are measured at the driver; the seeder's scale is a parameter (F11)

**The budget helper.** Counting is done by wrapping PGlite's `query`, not
drizzle's logger. The budget a list page must meet is *round trips*; drizzle's
logger reports what it intended to run, and would miss a raw `execute`, a
lazily-awaited builder, or a query drizzle issues on your behalf. The counter is
installed after the migration so schema setup does not count against a test.

Failures print the SQL grouped and counted (`3× select …`), because "expected 41
to be <= 3" says there is a problem but not where. The first version truncated
each statement to 160 characters — and drizzle selects every column explicitly,
so the table name sits *after* a 900-character column list and was always cut
off, reporting forty repetitions of an indistinguishable `select "id", "key",
…`. It now elides from the middle.

Mutation-verified: an N+1 injected into `PostgresForumRepository.listAll` fails
the budget assertion. F16's "tree read is one query regardless of depth" is now
a measurement against a genuinely nested seeded board rather than a claim about
the code.

**The seeder's scale is a parameter, and that is the honest part.** F11's target
is 50 forums / 100k threads / 2M posts / 20k users. That is a real-Postgres
workload: PGlite is Postgres compiled to WASM holding the database in process
memory, and 2M posts would exhaust the heap long before finishing. So
`SMOKE_SCALE` (12 forums / 120 threads) runs in every test run and `FULL_SCALE`
is the plan's number, pointed at a real database for F89's performance pass.
Recording this rather than quietly shipping a small seeder under the plan's
heading — the difference matters, because an index that looks fine at 120
threads is exactly what F11 exists to catch.

Determinism is the seeder's contract: a fixed-seed PRNG, asserted by rebuilding
a second database and comparing every thread title and sticky flag. A seeded
board that varied per run would make every budget assertion a coin flip, and
three green runs would teach everyone to re-run a failure rather than read it.

Per-row cost is avoided deliberately — one shared precomputed Argon2id hash
(hashing 20k passwords at the real cost factor proves nothing the crypto suite
does not already cover), batched multi-row inserts, and forum paths accumulated
in memory rather than read back per forum.

### D26 — `visibleForumIds` was an N+1; it is now three queries, not one (F21)

**Found by the query-budget helper within an hour of building it.** F21's
acceptance says "`visibleForumIds` is one query". It was **32** on a 15-forum
board: the implementation looped over every forum asking for that forum's
ancestor chain and its overrides — two round trips each.

This is the worst possible place for an N+1. Every list page on the board
filters by the visible set (invariant 25), so the cost multiplies across the
entire product, and it grows with the number of forums — the one dimension a
busy board keeps increasing.

**Fix.** `AuthorizationSource` grew `allAncestorChains()`, which the materialised
path makes free: the chain is a parse of a string already on the row, so reading
`(id, path)` for the whole board is one statement at any depth or width.
Resolution is now three queries — chains, group defaults, all overrides for
those groups — and then pure in-memory work.

**Why three and not the literal one the plan asks for.** The combination rules
(R4.2's OR/max/AND across groups, and first-non-null up the ancestor chain) are
domain logic. Expressing them in SQL would move the permission model into the
database, where F20's "nothing outside `@forum/authorization` knows what a group
id is" stops being enforceable, and where the F22 matrix could no longer drive
it. The property that actually matters is that the cost is **constant**, and
that is asserted directly by comparing a 15-forum board against a 65-forum one —
a bare budget of 3 would still pass on a tiny fixture with a per-forum walk.

**Also closed here:** F21's "four-level tree with overrides at levels 2 and 4"
had only ever been exercised through the in-memory fixture, which proves the
rules but not the wiring. There is now a Postgres test over a real four-level
tree, including the case that separates a correct resolver from one that merely
works — a level-3 forum with no row of its own must inherit level 2's denial
rather than fall back to the group default, because falling back silently
exposes the child of a private forum. It also asserts that `visibleForumIds` and
`forumMatrix` agree, since a disagreement shows up as a forum you can see in a
listing but cannot open.

### D27 — The queue only worked with one driver's result shape (F05)

**Found by the driver contract suite on its first run.** F05 asks for "a contract
test suite every implementation must pass"; there was none, so `PostgresQueue` —
the *default* queue driver — had never been executed against a real database at
all. Pointing the new suite at PGlite failed immediately with `rows.map is not a
function`.

Drizzle's raw `execute()` returns whatever the underlying driver returns, and
they disagree: `postgres.js` (what the app runs) yields an array-like of rows,
while `node-postgres`, PGlite and **Neon's serverless driver** yield
`{ rows: [...] }`. `PostgresQueue` read the first shape behind an
`as unknown as ReadonlyArray<…>` cast.

That cast is the real defect. It *asserts* a shape rather than checking one, so
the compiler could not warn about the exact thing that would break — and F03
built the `DbDriver` seam specifically so Neon could slot in later. The queue
would have failed on that swap, at runtime, in production, on the code path that
delivers email and notifications.

Fixed with `resultRows()` in `@forum/db`, which accepts either shape and is now
the sanctioned way to read rows from `execute()`. The query builder is
unaffected — it normalises internally.

**The wider point:** every implementation passed its own tests before this. The
contract suite is what makes "no conditional feature code downstream" true
rather than aspirational, because it is the only thing that checks the
implementations actually agree.

Also set `LOG_LEVEL=fatal` for the test run. Several suites deliberately drive
failure paths, and their expected error-level output made a fully passing run
print error JSON — which teaches everyone to skim past CI output, and is how a
real error goes unnoticed.

### D28 — Migrations are forward-only; F03's "up and down" is superseded (F03)

F03's acceptance asks that "migrations run up **and down** against a
Testcontainers Postgres". Invariant 32 says "migrations are forward-only and
checked in". Both are normative and they contradict each other; this was flagged
rather than guessed, and **decided on 2026-07-30: invariant 32 governs.**

Reasoning, recorded so it is not relitigated:

- A down migration that drops a column is a data-loss button pointed at a live
  board, run by an operator who is already having a bad day.
- Some migrations genuinely cannot be reversed — a destructive backfill has
  nothing to restore from — so a "reversible migrations" guarantee would be
  partial, and a partial guarantee is worse than none because people rely on it.
- Recovery from a bad migration is a restore, which F88's backup-and-restore
  runbook owns.

Testcontainers is also substituted, by PGlite: it runs the actual generated
migration SQL in a real Postgres (compiled to WASM), which is what the
requirement was protecting — that migrations are exercised against Postgres
semantics rather than a mock — without needing Docker in every test run.

### D29 — Bans: what gets captured, and when filters are checked (F23)

**Restore-on-expiry.** F23 requires that an expired ban restores the *prior*
group, not the default. The group is therefore captured at ban time and written
back verbatim — a moderator banned for a week returns a moderator. Restoring the
default instead is a silent demotion that nobody notices until that person tries
to do their job. Mutation-verified: restoring a hardcoded default fails both
restore tests.

The capture and the move are in one transaction with the session revocation,
because the four writes only mean something together. A ban that records the row
but leaves the session alive is a label; one that moves the group without
capturing the previous value strands the user permanently.

`previous_primary_group_id` is `ON DELETE SET NULL`, so a group deleted mid-ban
leaves nothing to restore. Writing null back would violate
`users.primary_group_id`'s NOT NULL, so the ban lifts and the group is left
alone — safer than guessing a group and silently granting it.

`expireDue` also bumps `permission_version`. Without it a lifted ban leaves the
user holding banned-group permissions for the cache's lifetime, so the ban
silently outlives its own expiry.

**Filter ordering is a security decision, not an implementation detail.** IP
filters run first, before any hashing: there is no enumeration risk (the address
is the caller's own) and an abusive network should not get to spend the board's
Argon2 budget. Username and email filters run only *after* the password has
verified — checking them up front would answer "is this account filtered?" to
anyone who can type a username, which is exactly the enumeration oracle that
login's dummy-hash path exists to prevent. There is a test asserting a wrong
password yields the generic credential error rather than the filter message.

**Patterns are globs, not regexes** — the same call F37 makes about custom
BBCode, for the same reason: accepting a regex from an ACP form hands whoever
holds that screen a denial of service via catastrophic backtracking. Every
non-wildcard character is escaped (so `*@spam.example` cannot also match
`*@spamXexample`) and patterns are anchored (so `spam` does not match
`notspammer`). A bare `*` is rejected: it would lock out the administrator who
typed it.

**Messages leak nothing.** Ban messages surface `publicReason` and never
`reason`, which is staff-facing and routinely holds notes about linked accounts.
Filter messages name neither the pattern nor the field, which would be a map for
evading them.

**Still open:** `bans.expire` is registered in the task registry but nothing runs
it — F06's tick returns `ran: []` and no `TaskRepository` exists. F23 stays
PARTIAL for that reason rather than being marked done on a task that cannot fire.

### D30 — Promotions: the guards are the feature (F24)

An automatic group move is a privilege change nobody approves individually — it
runs on a timer, against every user, forever. So the interesting question is not
"who qualifies" but "who must this never touch". Three guards, all in the pure
evaluator and all mutation-verified:

1. **Never lift a ban.** A banned user with 100 posts and a "100 posts →
   Veteran" rule would otherwise be silently un-banned by a cron job.
   Un-banning belongs to a moderator, via F23.
2. **Never demote.** A rule is a floor, not an assignment. An administrator who
   satisfies "10 posts → Registered" must not be moved *down* into it, which is
   exactly what a naive matches-then-set does.
3. **Never re-apply.** Someone already in the target group yields no outcome,
   which is what makes the task idempotent rather than merely harmless to
   repeat.

**Mutation testing corrected a test that was lying.** Removing guard 2 initially
failed only one assertion — the Postgres test named "never demotes an
administrator" still passed, because administrators are in `protectedGroupIds`
and guard 1 was catching them. The test proved nothing about ranking. It now
uses a non-protected but higher-ranked group, and removing guard 2 fails at both
layers. A test whose name describes a guard it does not exercise is worse than
no test, because it is counted as coverage.

**Keyset paging, not OFFSET.** Applying a promotion changes the rows being
paged: with OFFSET, moving a user shifts every later row up one and the next
page silently skips somebody. It presents as "some people never get promoted"
and is near-impossible to reproduce by hand.

**Preview and apply share one evaluation** and differ only in whether outcomes
are written. An ACP preview computed by separate code would eventually disagree
with what applying actually does, which is the one thing a dry run must never do.

**F20 lint scope.** `@forum/groups` is exempted from the group-ID rule, like
`@forum/authorization`. The rule bans deciding what someone may *do* by
comparing group ids; this package decides which group a user *belongs to*, which
cannot be expressed without naming groups. The boundary it must not cross is
stated in the config: it may move a user between groups, never conclude anything
about what a group is permitted to do. Probed both ways — the rule still errors
in a non-exempt package and is silent inside.

### D31 — The task lease, and a mutant that survived (F06)

`PostgresTaskRepository` lands, so the scheduler finally has storage. `claim` is
one conditional UPDATE: a read-then-write would reintroduce the race it exists
to close, and serverless instances share no memory so a JavaScript mutex
protects nothing.

**The finding worth recording is a mutation that survived.** Removing the lease
guard (`locked_until is null or locked_until <= now`) from the WHERE clause
failed *no test* — including the two named after F06's "concurrent ticks don't
double-run a task" criterion. Both were passing on the *due* check instead:
`claim` sets `last_run_at = now`, so a second immediate claim is refused for
being not-yet-due, with or without a lease.

The lease actually matters in a case neither test covered: **a task whose
runtime exceeds its own interval**. The first claim sets `last_run_at`, so by
the time the next cron fires the task looks due again, and only a live lease
says "someone is still running this". Without it a 10-minute task on a
1-minute interval is re-entered every minute until the instance falls over —
which is exactly the "slow run plus the next cron fire" F06 calls out. There is
now a test for it, and the mutant dies.

Third time this session that mutation testing has caught a test whose name
described a guarantee it did not exercise (see also D30). The pattern is
consistent: a test written alongside the code tends to assert the path the
author had in mind, and the *other* reason it passes goes unnoticed.

Two smaller decisions:

- `next_run_at` is computed from `finishedAt`, not from when the task became
  due. Anchoring to the due time makes an overrunning task fire again
  immediately and keep doing so — one slow run becomes a busy loop.
- `ensureRegistered` updates `interval_seconds` on conflict but leaves
  `last_run_at`, `locked_until` and `consecutive_failures` alone: cadence is
  code-owned, but a deploy must not reset a task's history or steal a live lease
  from a tick that is still running.

### D32 — A task that cannot run is not registered (F06)

The tick now executes. `PostgresTaskRepository` supplies the storage,
`task-workers.ts` supplies the work, and `/api/system/tick` calls `tick()`
instead of returning `ran: []`.

**Two workers still have no implementation, and are omitted rather than
stubbed.** `reconcileCounters` needs F38 — there are no maintained counters to
reconcile — and `relayOutbox` needs an `OutboxReader`/`RelayTarget` over
Postgres that `@forum/db` does not have yet.

`builtinTasks` therefore takes a *partial* worker set and registers only the
tasks whose workers exist. The alternatives are both worse:

- a stub returning 0 pretends work happened, and the tick reports a healthy run
  of a task that does nothing — which is precisely how this endpoint looked
  healthy while executing nothing at all;
- a stub that throws makes every tick log a failure and eventually raises an
  admin notification for a task nobody asked for.

Not registering means `tasks` holds no row for it, F70's System Health will not
list it, and the day the worker appears the task registers itself. Same rule the
operator CLI follows by omitting `task:run`: never advertise a capability that
is not there.

**Fixture mode has no scheduler at all**, and the route returns 503 saying so.
The tick's guarantee is that a task is not run twice, which needs durable
cross-instance state; an in-memory task table would let two instances each
believe they held the claim. Returning `ran: []` would have been
indistinguishable from "ran, nothing to do" — the exact ambiguity that let this
endpoint look fine for weeks.

**The tick returns 200 even when a task failed.** The tick itself succeeded; a
non-2xx would make the platform retry the whole drain, re-running every healthy
task to chase one broken one. The failure is in the body and in the log.

### D33 — `forum.config.ts`, and why the scan ban is the substance (invariant 6)

Invariant 6 says everything installable is registered in `forum.config.ts` and
nothing is discovered by filesystem scan at runtime. The file did not exist;
themes were imported directly by the layout and drivers resolved from env.

Built now, before F25, on the reasoning that a registry retrofitted over
finished pages does not work — the same argument the plan makes about slot APIs.

**The scan ban is the part that matters**, and it is not a style preference:

- a serverless bundle contains only what the bundler could see statically, so a
  `readdir` over `themes/` is empty in production while working perfectly on the
  machine that wrote it;
- it makes the installed set unknowable at build time, so nothing can be
  type-checked against it and a broken plugin is a 500 rather than a compile
  error;
- it makes "what is installed" a property of the filesystem, which differs
  between a developer's machine, CI and production.

Guard `R1 no-runtime-filesystem-scan` now bans `readdir`/`globSync`/`opendir` in
app and package code, allowing `scripts/`, the CLI, the testkit and the
migration runner — all of which legitimately read a real filesystem outside the
request path. Probed both ways.

**The registry is load-bearing, not decorative.** `layout.tsx` reads its
theme-colour through `forumConfig` rather than importing `@forum/theme-default`,
so installing a second theme does not mean editing the layout. Verified in the
built output: the tokens in the registry are the values in the rendered
`<meta name="theme-color">`.

`defineForumConfig` validates the two things that would otherwise fail far from
their cause — a `defaultTheme` naming a theme that is not installed (a blank
board with no error), and a theme registered under a key that disagrees with its
own (`themes[key].key !== key`, which breaks every lookup that round-trips
through one or the other).

Deliberately thin: the theme entry widens at F25 when theme-kit defines the slot
contract, and `plugins` gains a real element type at F79. Both are additive.

### D34 — The lazy-require pattern does not do what it claims (F05, ADR 0002)

`S3FileStore` lands, and building it disproved the condition ADR 0002 accepted
the dependency on. Recorded here because the same pattern is used elsewhere in
this codebase and is equally ineffective there.

**A lazy `require()` with a literal specifier keeps nothing out of a bundle.**
The bundler resolves it statically and includes the module; `require` defers
*execution*, not *inclusion*. Measured on a `FILESTORE_DRIVER=local` build: the
AWS client was referenced across server chunks, and so was postgres.js — which
means `container.ts`'s Postgres branch (D14) never achieved this either.

**And `require()` in an ESM package throws in plain Node.** It works inside
Next, whose bundler polyfills it, which is why nothing caught it. But
`@forum/drivers` is used by the CLI and worker too, so `FILESTORE_DRIVER=s3`
would have failed there at runtime — found by actually running the resolver
outside Next rather than trusting the unit tests.

Replaced with a static import plus `serverExternalPackages` in `next.config`
(`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `postgres`). Works in
every runtime, and output tracing still ships the packages into the standalone
image.

**What is honestly claimable:** ~370 KB off the server chunks and no SDK
implementation symbols inlined. "Zero bytes in a local-storage bundle" is not
something grep can establish; a bundle analyser is F89's job.

**Two other things this feature surfaced:**

- Guard R0 caught *me* writing a raw control-character range into the key
  validator — the guard added an hour earlier, working on its author.
- The suite now boots fifteen PGlite instances. Unbounded, vitest starts one
  worker per core and fifteen WASM databases fight over ten, so boot hooks
  missed even a 30s timeout about one run in three. `maxWorkers: 4` trades a
  little wall-clock for a gate that can be trusted — a suite failing one run in
  three teaches people to re-run it, and then real failures get re-run too.

## Phase 2

### D35 — theme-kit: three enforcement layers, and what each one cannot catch (F25)

`@forum/theme-kit` was an empty package with a `package.json`. It now holds the
slot registry, the view-model contract, and `defineTheme`/`resolveTheme`.

**The R6 slot list is derived, not transcribed.** This repository does not carry
the plan text, so the 25 slots in `packages/theme-kit/src/slots.ts` were derived
from the pages Phases 2–3 actually build (F27–F35, F39–F45) and cross-checked
against MyBB's template names. Recorded here because it is a genuine divergence
risk rather than a decision: **where R6 disagrees, R6 wins and the registry
changes.** Adding or renaming a slot is a small, mechanical edit — the registry
is one object, and `tsc` names every consequence.

#### The server/client boundary is checked three times, because one check is not enough

The failure being defended against is specific: `PostBit` renders once per post,
and as a client component the entire post list is serialised into the page
payload and hydrated. It compiles, it renders identically, and it is invisible in
review.

| Layer | Catches | Blind to |
|---|---|---|
| `SlotComponent<K>` resolving kind to a different signature | an `async` client slot (a server-only construct) | a synchronous component in a `"use client"` file — it satisfies both signatures |
| `defineTheme` rejecting a client reference in a server slot | anything the bundler marked `$$typeof: react.client.reference` | everything outside an RSC build: under vitest and in the CLI nothing carries a marker |
| `scripts/slot-kinds.mjs` | the actual case — a `"use client"` directive at the top of a server slot's module | a slot map it cannot statically read, which is why that is an error |

The third is the one that matters, and it **refuses to guess**: if a slot's value
is not a bare imported identifier, the check fails and asks for that form. A
checker that skips what it cannot parse is how a boundary erodes — one clever
manifest and the rule is off for that theme forever, while still reporting green.
Both directions are errors: a *client* slot implemented by a server module never
becomes interactive, which looks correct in a screenshot and does nothing when
clicked.

It also fails when it finds **zero** manifests. Its first hour of life it
reported "0 theme manifests, every slot matches its declared kind" — a green tick
for having checked nothing, which is the same class of bug as the inert guards in
D10 and the unresolvable depcruise paths in `.dependency-cruiser.cjs`.

Probed both ways, per D10: crossing caught, inert island caught, unreadable map
caught, unregistered slot name caught, clean theme spared, `'use client'` inside
a comment not mistaken for a directive.

#### Slots are flat: a slot never renders another slot

`ThreadView` does not call `PostBit`; the page does, and hands `ThreadView` the
rendered list as `regions.posts`. Two reasons, one mechanical and one about
inheritance:

- rendering a slot needs the *resolved theme*, and there is no way to obtain one
  inside a slot — React Context is not available to Server Components, and
  threading the theme through props would put a map of functions inside a
  contract whose entire point is that it holds none;
- if `ThreadView` imported `PostBit` directly, a child theme overriding `PostBit`
  would be ignored inside its parent's `ThreadView` — inheritance that works for
  some slots and silently not others is worse than none.

So exactly one place resolves slots (the page or layout), and an override applies
everywhere. **The cost, stated:** a theme can restyle within a region and reorder
the regions it is handed, but cannot invent a new relationship between two slots
without overriding the container. F77 revisits it if a real theme needs more.

#### View models are JSON-shaped, and the constraint is a compile-time proof

`Serialisable<T>` rejects anything that is not JSON-shaped, and
`_PlainDataCheck` applies it to every slot model. The reason is not that React
cannot serialise a `Date` — React 19 can — but that a view model has three
consumers and only the JSON subset survives all three: a server slot, a client
slot across the RSC boundary, and F81's REST API, which returns view models as
JSON. A `Date` additionally pushes formatting into every theme, and formatting is
timezone-dependent, so a theme calling `toLocaleString()` renders one string on
the server and another in the browser — a hydration mismatch visible only to
users outside the server's zone. Timestamps therefore cross as `TimeModel`: the
machine value for `<time datetime>` plus the label the app already formatted.

`PaginationModel` is where this bites first. The obvious API — a page count and a
function to build an href — is impossible, so the app resolves the window and
hands over links. Which also means paging is plain anchors and works with
JavaScript disabled (R5).

**A clause was deleted for being unkillable.** `Serialisable` originally named
`Date | RegExp | Promise | Map | Set` in a branch of its own. No mutation could
make that branch matter: every one of those types exposes its API as *methods*,
so the function clause already rejects them. A clause no test can kill is a
clause that will quietly stop being true, so it went, and the reasoning is in the
type's doc comment instead. `view-models.type-test.ts` proves the remaining
constraint has teeth in both directions — `@ts-expect-error` fails loudly as an
"unused directive" if the check ever stops firing, and it does: flipping the
function clause from `never` to `T` fails `pnpm typecheck` immediately.

#### The registry entry is generic, not `unknown`

A registered theme now carries its `ThemeDefinition`, whose type lives in
`@forum/theme-kit` — and `@forum/core` may not import a sibling
(`core-depends-on-nothing`, or the graph has no floor). `InstalledTheme<TTheme>`
takes it as a type parameter, inferred from `forum.config.ts` so no call site
spells it out. The alternatives were `Record<string, unknown>` plus a cast at
every reader — casts being what `defineForumConfig` exists to avoid — or moving
React component types into the package the CLI and worker import.

#### Two things that would have shipped broken, and were only found by rendering

- **Tailwind never scanned the theme package.** Tailwind v4's automatic source
  detection covers the directory it is invoked from — `apps/forum` — and
  `themes/` is a separate workspace package outside it. Every class a theme slot
  used was dropped from the generated stylesheet, with a green build and no
  warning: the page simply renders unstyled. Fixed with `@source` directives in
  `globals.css`, and **measured both ways** — with them, `border-l-4`,
  `max-w-5xl` and `border-moderation-approved` are in the built CSS; with them
  removed, all three are absent and the build is still green.
- **vitest could not import a `.tsx` at all.** `tsconfig.base.json` sets
  `jsx: "preserve"` (correct — Next does the transform), which left oxc handing
  vitest raw JSX: "content contains invalid JS syntax". Note the option is `oxc`,
  not `esbuild`: Vite 8 transforms with oxc and silently ignores the `esbuild`
  key, which was set first and changed nothing.

#### Deliberately incomplete, and honest about it

`themes/default` fills five slots — the shell the auth screens render — and
leaves twenty unimplemented because the pages they belong to are not built.
`resolveTheme` reports `missing` rather than throwing, and `requireSlot` names the
slot and the inheritance chain if a page asks for one that is absent. The
alternative, twenty placeholder components, is D32's rule broken: never advertise
a capability that is not there. `assertComplete` exists for F77's freeze.

The same rule shaped `src/view/shell.ts`: `profileHref` is `null` (F33 builds
`/member/[id]`), the member link list is empty (profile F33, UserCP F57, admin
F63, and log out is a POST to a Server Action, not a link), and unread counts are
`0` (F55). An empty user panel is the accurate rendering of a board with no member
pages; a link to a 404 in the header of every page is not.

### D36 — The typed token mirror had drifted completely (F25/F26)

`themes/default/src/tokens.ts` carried a comment promising "keeping both in sync
is checked by a test in Phase 2 (theme-kit), which parses globals.css and asserts
the key sets match exactly". Writing that test (`apps/forum/src/styles/tokens.test.ts`)
found the two had drifted past recognition:

- the mirror named **four tokens the CSS does not define** — `popover`,
  `popover-foreground`, `forum-pinned`, `forum-staff`;
- it **omitted fifteen the CSS does** define, including every `thread-*`,
  `post-*`, `moderation-*` and `group-*` token;
- **every single value differed.** `--background` was `oklch(0.985 0.002 250)` in
  the mirror and `oklch(0.976 0.002 265)` in the CSS.

Nothing failed, because nothing compared them. The consequence is not cosmetic:
F26 validates `themes.token_overrides` against `TOKEN_NAMES`, so a board
overriding `thread-pinned` would have been told the token does not exist, while
an override of `forum-pinned` would have been accepted and applied to a variable
no stylesheet reads. `BROWSER_THEME_COLOR` was two hex values from an older
palette, which is what a phone renders around the page.

Fixed by regenerating the mirror from `globals.css` verbatim — the CSS is what
paints, so it is the source of truth — and by writing the promised test as an
**exact string** comparison. A tolerant comparison ("both oklch, close enough")
is the same drift taking longer.

Three tokens (`radius`, `density-unit`, `font-mono-stack`) are legitimately absent
from the `.dark` block: geometry and the font stack are not scheme-dependent.
They are listed in `SCHEME_INDEPENDENT_TOKENS`, and the test asserts that the set
of tokens missing from `.dark` is *exactly* that list — so any other omission
fails, because a token silently keeping its light value in dark mode (a pale
`--border` on a dark background) is a visual bug rather than a choice.

**One gap left open deliberately.** Nothing checks `BROWSER_THEME_COLOR` against
the `background` token; the test only enforces the format (`#rrggbb`, because
Safari ignores `oklch()` there). An exact assertion needs OKLCH → sRGB conversion
in code, which belongs with F26 since an *overridden* background has to be
converted too. Until then, changing `background` means recomputing those two
values by hand.

### D37 — `register()` was never running in the Edge runtime (F02)

`proxy.ts` means Next compiles `instrumentation.ts` twice, once per runtime. The
Edge copy imported `@forum/core`'s barrel, which reaches `node:crypto` (the
constant-time compare) and `node:async_hooks` + pino (logging) — none of which
exist on Edge. The Edge compilation therefore failed, **as a warning**:

```
A Node.js module is loaded ('node:crypto') which is not supported in the Edge Runtime.
  Import trace: Edge Instrumentation: core/src/crypto.ts → core/src/index.ts → instrumentation.ts
```

So F02's fail-fast check simply did not run in one of the two runtimes, and the
dev log looked identical either way — the exact failure mode D10 exists for, in
the file whose whole job is to make a misconfigured deploy die loudly.

Fixed with the per-runtime branch Next documents:

```ts
if (process.env.NEXT_RUNTIME !== 'nodejs') return
```

**`process.env` is read literally here on purpose**, and it is the one place that
is correct. Next replaces `NEXT_RUNTIME` with a string literal during each
compilation, so the Edge build evaluates `'edge' !== 'nodejs'` and drops the
dynamic import as unreachable. Reading it through `env` in `@forum/core` — what
F02 requires for everything else — would make it a runtime value, leave the
import reachable, and bring the warning straight back.

Guard `F02 single-env-reader` therefore exempts **this variable only**
(`/process\.env(?!\.NEXT_RUNTIME\b)/`) rather than exempting the file, which is
what the guard's own comment had deliberately avoided doing. Every other read
stays banned, including elsewhere in this same file.

That exemption needed a second clean sample to be worth anything: one `clean`
cannot prove both that a rule still fires and that its carve-out holds. Guards now
support `alsoClean`, and the probe checks every sample. Mutation-verified —
widening the pattern back to `/process\.env/` fails the probe by name.

**Nothing is lost on Edge.** `proxy.ts` reads cookie names and nothing else (F17),
so there is no configuration for the Edge runtime to validate. Verified by running
`next dev`: no warnings, and the fixture-mode boot line still prints, which is
proof the Node branch ran.

### D38 — The board index, and the open question it closes (F27/F29)

Phase 2's first real page. Three decisions worth recording.

#### Open question 5 is answered: subtrees are filtered whole

`plan-status.md` asked whether a visible child of a hidden parent should surface
at top level (D22 noted `buildTree` promotes orphans to roots) or whether F21
should filter subtrees whole. **Whole.** A forum the viewer cannot see takes its
descendants with it.

Promoting the child leaks structure — a private category's children appearing as
top-level blocks tells a guest both that they exist and roughly what they are
called — and it renders a board whose *shape* depends on who is looking, which no
administrator can reason about or test.

The filter is iterated to a fixed point rather than applied once: a grandchild
whose parent was dropped *for being orphaned* (not by the visibility filter) has
to go too, and one pass leaves it behind as a top-level block. That is the same
leak one level deeper and much easier to miss, so it has its own test.

The cost, stated: a visible forum under a hidden parent is unreachable from the
index. That is the correct reading of "the parent is hidden"; F65's ACP should
surface such a forum as misconfigured rather than the index papering over it.

#### The listing read is deliberately uncached, and a test says so

`forums` carries denormalised counters and a last-post triplet, so the index is
one query with no join — the alternative, a correlated subquery per forum against
`posts`, puts the largest table on the board in the path of the page every
visitor loads first. The budget test asserts one statement across **two board
sizes**, because with a single fixture "one query" and "one query per forum" are
the same number. Mutation-verified: an injected per-row `findById` fails it and
the helper names the repeated SQL.

But `ForumRepository` now has two reads, and only `listAll` is cached.
`CachedForumRepository.listListing` passes straight through, with two tests
pinning it. Counters change on every post: caching them under the forum-tree tag
would mean invalidating the tree on every reply — making the tag worthless for
the structural read it exists to serve — and caching them under a tag of their own
means an entry stale within seconds plus a second thing the posting path must
remember to clear. Both are two lines away in the decorator, which is exactly why
the decision is a test rather than a comment.

**The page itself is not cached at all.** Every row depends on who is asking
(`visibleForumIds` per actor, F32's unread marks per user). A cached
permission-filtered index is precisely the leak F10's harness exists to prevent.

#### Timestamps are formatted once, server-side, in a zone the page names

A theme calling `toLocaleString()` renders one string on the server and another
in the browser, because they are in different timezones — a hydration mismatch
visible only to users outside the server's zone, which means it survives review,
CI, and the author's machine. So `formatTime` produces both halves of `TimeModel`
and the footer states the zone.

That zone is **UTC** until F57 gives members a timezone setting — chosen over the
server's local zone, which is an accident of where the board is deployed and
would silently change what every timestamp says after a region migration.

`now` is a parameter, not `Date.now()`: "Today" is relative, so a formatter that
reads the clock cannot be tested without freezing time globally and changes its
answer at midnight. The page passes one clock for the whole render, so a page
straddling midnight cannot print "Today" above "Yesterday" for posts a second
apart.

#### Smaller things this turned up

- **Log out had no home.** It lived on the placeholder page this feature deleted,
  and it cannot be a `LinkModel`: a GET that ends a session is fired by every
  prefetcher and link scanner that touches the page, and a Server Action
  reference is not plain data so it can never cross the theme contract. The panel
  slot gained `children`, and the app renders the form into it.
- **The fixture board grew a category.** The two forums were roots with no
  heading, so the index had to invent one. `type: 'category'` carries no
  overrides and changes no resolution — every ancestor walk through it finds no
  row and inherits, which is F21's nullable-column inheritance.
- **Fixture writes throw.** `FixtureForumRepository` serves real reads so the
  board renders with no database, and refuses `create`/`move` — a fixture that
  accepted them would let someone build a board in the dev UI and lose it on
  restart. Same rule as the scheduler in fixture mode (D32).
- **`typecheck:app` breaks after deleting a route** until `next build` runs:
  `.next/types/validator.ts` still imports the removed page. Known trade-off (the
  tsconfig comment covers the dev-types half of it); the fix is to rebuild.
- **`apps/forum/tsconfig.json` hand-copies the path aliases** and was missing
  `@forum/testkit`, which surfaced the moment a package test imported it — that
  config compiles `packages/**`, tests included. Added, with a note that the list
  is duplicated and both copies need editing.

### D39 — Theme overrides are one map for both schemes (F26)

`themes.token_overrides` was already a flat token-to-value JSON object. It is
therefore applied after both the light and dark defaults, including the
system-dark fallback selector. This preserves the existing schema and means a
`background` override also produces one browser-chrome colour for both schemes.

Per-scheme administrator overrides would require a migration to a shape such as
`{ light: { … }, dark: { … } }`, a migration/import decision, and an ACP editor.
Nothing currently writes this table — that belongs to F68 — so inventing a
second JSON format now would create migration work without a user-facing use.

The runtime still validates the raw database record. Unknown keys, non-string
values, declaration injection, style-block escapes, and external CSS fetches
fail loudly rather than becoming stored XSS. The validation functions are the
same narrow seam F68 will call before saving.

### D40 — Opening posts must override a thread's default last-post timestamp (F38)

`threads.last_post_at` is non-null and defaults to insertion time so F30 can
sort a newly created thread before the opening post exists. The transaction that
inserts the opening post may carry an earlier application timestamp (imports and
deterministic tests do), so treating it like an ordinary "newer post wins"
comparison can leave `last_post_id` null forever.

The shared counter primitive therefore always writes the opening post's
`first_post_id` and last-post fields. Replies still use timestamp/id ordering,
which prevents a late-arriving older reply from moving a thread or forum
backwards. This was caught by the real Postgres test using equal timestamps;
the initial implementation left the thread pointer null while the forum pointer
looked correct.

### D41 — Where each counter becomes true, and how it gets back (F38)

F38 promised four things: atomic counters, an outbox ancestor roll-up, buffered
views, and a batched resumable recount. The first landed with D40. The other
three each forced a decision.

#### Forum counters are subtree-inclusive, and only the posting forum is exact

A category with no threads of its own must still show totals, so a forum's
counters cover its whole subtree. That leaves the question of *when* each row
becomes true, and the answer differs by distance:

- the **posting forum** is updated inside the content transaction, because the
  page the author is redirected to must already agree with what they just did;
- **ancestors** are updated from the `post.created` event, because a post four
  levels deep would otherwise make every reply write four more rows inside the
  request, and the depth is unbounded.

So a category can lag its children by one tick. That is visible only as a count
being briefly low, never as a wrong tree — and the alternative, computing the
totals at read time, is the aggregate over the whole board that the denormalised
columns exist to avoid.

#### The roll-up carries a ledger because delivery is at-least-once

The relay marks an outbox row dispatched *after* the enqueue returns, and the
queue re-runs a job whose worker died mid-handler. Both are deliberate: a
duplicate is recoverable and a lost event is not. But a roll-up is a delta, and
replaying `+1` against five ancestors is exactly the drift the recount exists to
repair.

`content_counter_rollups` holds one row per post whose ancestors have been
counted, inserted in the same transaction as the update. A redelivered event
finds it and does nothing. This is deliberately not a boolean on `posts`: that
would make every roll-up a second write to the hottest table on the board, and
the ledger is also the natural place for F41 to record a visibility transition
that has already been applied.

#### Views are buffered, and losing them is the accepted trade

`threads` carries the R3.5 listing index. Incrementing `view_count` in place
makes every page view a write to the row the busiest read path sorts on. Views
are therefore counted in `thread_view_buffer` and folded in by a task every five
minutes.

An unflushed buffer lost to a restore loses those views. That is acceptable for
this counter and no other, for a reason worth stating: `view_count` is the only
counter on the board that **cannot be recomputed from source rows**. Nothing
records who viewed what, so the recount below has nothing to say about it — which
is also why it is the one number nobody can audit and nothing depends on.

#### The recount writes truth, in phases, from a stored cursor

It runs threads → forums → users, bounded by batch size, resuming from
`counter_recount_state`. Two consequences are load-bearing:

- it writes a **computed value, never a delta**, so interrupting it mid-sweep is
  harmless and a second sweep over a healthy board corrects nothing — which is
  what makes a rising `corrected` total a real signal of drift rather than noise;
- it advances the phase on a *short* batch rather than an empty one, saving one
  wasted run per phase per sweep at no cost, because re-reading rows has no
  side effects by construction.

Threads run before forums because forum totals aggregate the same post rows, so
one sweep leaves the two consistent instead of one sweep apart.

**One definition of "counts" throughout:** a post counts when the post is visible
*and its thread is*. A visible post inside a soft-deleted thread counts nowhere —
not for its forum, not for its author. The incremental writer never sees that
case (new content is always visible), so the two only had to be reconciled here.
The per-user aggregate needed a `FILTER` rather than a `WHERE` to say it: with a
`WHERE`, an author whose every post sits in a deleted thread drops out of the
aggregate entirely and the update leaves exactly the stale count it was meant to
fix. That is now a test.

#### Smaller things this turned up

- **`post.created` was being written to nothing.** The outbox had no Postgres
  reader, so the relay could not run, so nothing consumed the event D40's
  primitive commits. `PostgresOutboxReader` plus handler dispatch in the queue
  drain closes it, and `outbox.relay` registers itself as a result. A claim bumps
  `attempts` and gives up after ten, so a poison event stops blocking the backlog
  behind it while staying visible to an operator.
- **The schema-drift CI step checks a directory that does not exist.** It runs
  `drizzle-kit generate` and then inspects `packages/db/drizzle`, but migrations
  live in `packages/db/migrations`, so the step has always passed vacuously.
  Pointing it at the real directory would fail today for a real reason: the meta
  snapshot has been stale since `0002`, which was hand-written like `0003`, so
  `generate` wants to re-create tables that already exist. Recorded rather than
  patched — repairing the snapshot is its own change, and a guard that fails for
  the wrong reason is no better than one that never fires (D10).
- **The default 5s test timeout stopped being enough.** Four more PGlite suites
  pushed `loginAction`'s lockout test — which hashes a password per attempt at
  the configured Argon2id cost — past it under a full run while passing alone.
  Raised to 20s with the reasoning D34 used for the worker cap: a gate that
  fails one run in a few teaches people to re-run, and then a real failure gets
  re-run too.

### D42 — The composer's form belongs to the app, not the theme (F39)

`PostFormModel` was registered in F25 with value props — `action`, `subject`,
`message`, `prefixes`, `submitLabel` — on the assumption that a theme would
render the whole form from data. Building it showed that shape cannot work.

A composer submits to a Server Action, and a Server Action reference is **not
plain data**. D38 already settled what follows: such references never cross the
theme contract, which is why logging out is a form the app renders into the user
panel slot rather than a `LinkModel`. The alternative — posting to a Route
Handler so `action` could stay a string — costs the author their draft on every
validation error, because a handler can only redirect and a redirect cannot
carry a post body back.

So the model now carries the page (heading, cancel target, route-level error)
and `regions.form` carries the app-rendered `<form>`. The theme still owns
everything visible around it, and the auth screens already establish the
pattern: app-owned forms, built from token-styled controls, framed by theme
slots.

`previewHtml` was dropped rather than kept as a field no theme could fill.
Preview state is what the author just typed and it comes back through the
action's result, so it renders inside the form region; when F36 can turn BBCode
into sanitised HTML on the server, rendering the preview becomes a slot concern
and the field returns. Until then the preview escapes its input and shows plain
text — the same fallback F31 uses for post bodies, and for the same reason.

This is a public-contract change, which F77 is the freeze for. Nothing outside
`themes/default` implements the slot yet, so the cost is a documented decision
rather than a migration.

#### What else F39 settled

- **Moderation is a visibility, not a queue.** A held thread is written with
  `visibility: 'unapproved'`, moves no counter and emits no event. Approval
  (F48) is the transition that applies them. Writing the counters now and
  correcting them at approval would show the board a thread count for content
  nobody can read.
- **A held thread redirects to its forum, not to itself.** Sending the author to
  a thread that is invisible to them is a 404 on their own post. The forum says
  what happened, and the notice's dismiss link is the same URL without the
  parameter — no JavaScript, no state.
- **Flood control is measured from the author's last post**, including posts
  awaiting approval. A serverless instance holds no memory between requests, so
  an in-process counter would let one post through per instance; the database
  already knows when they last posted. Counting held posts matters because
  otherwise moderation is the cheapest way to flood.
- **Preview never writes and never reads.** It returns only what was submitted,
  before authorisation, because previewing your own draft asks nothing of the
  board.
- **Settings are finally read.** `posting.flood_seconds` and
  `posting.max_length` are the first settings any request path consults: the
  registry, its migration and its CLI commands all existed, but an operator
  changing a value changed nothing. `getSettings()` reads them through F10's
  tagged global cache with a short TTL — a CLI write happens in another process
  and cannot invalidate the tag, so the entry has to expire on its own.

#### Smaller things this turned up

- **The posting flags were not in any read model.** `is_open`, `allow_threads`,
  `requires_prefix` and `moderate_new_threads` exist as columns that no read
  path selects. Rather than widening `ForumRow` — which the index, the listing
  and the thread view all use, and none of which care — the posting port reads
  them itself. A read model that grows a column per screen ends up a table dump.
- **Fixture mode has no composer at all.** `threadWrites` is null there, the
  route 404s and the "New thread" link is absent, following D38's rule for
  forum writes and D32's for tasks: never advertise a capability that is not
  there. The cost is real and is recorded as F39's gap — the no-JS Playwright
  suite runs against the fixture board, so it can prove reading and
  registration without JavaScript but cannot yet prove posting. The action's
  own tests drive it with `FormData`, which is exactly what a native submit
  sends, so the no-JS path is covered by test rather than by browser.

### D43 — Replying, quoting, and where a reply lands (F40)

A reply reuses everything F39 built — length limits, flood interval, moderation
decision, one transaction for post plus counters — so `ReplyComposer` differs
from `ThreadComposer` only in what can refuse it and in one counter. Three
things needed deciding.

#### The race is reported, never enforced

The reply form carries the newest post the author had seen. On submit the
composer compares it with the thread's current one and reports the difference;
it does not block the write. Refusing would cost somebody their reply to protect
them from an overlap that is usually harmless, and the alternative flow — hold
the text, show what arrived, ask them to confirm — is a second round trip that
still cannot promise nobody replies during it.

The comparison happens *after* the write on purpose. Checking first makes a
reply that lands in the same moment decide the answer, which is the race it is
supposed to be describing.

#### A quote is a prefilled textarea, resolved on the server

Quoting is a link to the reply page with `?quote=<id>`, so it works with
scripting off — no button that edits a textarea, no island. The quoted post is
re-read through a thread-scoped visible-post lookup rather than trusted from the
query string: without the thread in the lookup, `?quote=<id>` is a way to paste
any post on the board — including one from a forum the quoter cannot read — into
a forum where everyone can.

It emits BBCode (`[quote='ada' pid='12']…[/quote]`) even though nothing renders
it yet. Bodies are stored raw and rendered at read time, so a quote written
today shows its own markup until F36 lands and becomes a real quote block the
moment it does. A plain-text convention would be wrong forever and would need
migrating. The attributes match MyBB's, so F85's importer and F87's corpus pass
see one format. The quoted body goes in verbatim — escaping it here would
corrupt the quote of a post that itself contains markup, and rendering is where
escaping belongs.

#### Landing the author on their own reply

Posts page forward by id (F31), so "which page is post N on" has no cheap
answer — getting it exactly right needs the count query the keyset design exists
to avoid. Two cases cover it honestly: while the reply fits on the first page,
the anchor alone lands on it in context; past that, a cursor one below the reply
opens a page beginning with it. The second loses the posts above, and that is
the stated price of not counting.

#### Smaller things

- **`moderate_new_posts`, not `moderate_new_threads`.** A forum can hold replies
  while letting threads through, and the columns have existed since F16 with
  nothing reading them. Both are now read, and the reply path uses the one that
  is about replies.
- **A locked thread is a moderator's to answer.** The bypass is the same "deals
  with the queue" permission the moderation bypass uses, tested by a mutant that
  hands it to everyone.
- **Replies raise no thread count anywhere.** `applyCreatedContentCounters`
  takes `isNewThread: false`, and the PGlite test asserts the counter that must
  *not* move: getting it wrong inflates every ancestor's thread total by one per
  reply, which no reader would ever question.
- **`POSTS_PER_PAGE` moved out of its route.** The reply redirect needs the page
  size from outside the page, and two files disagreeing about it would send
  people to the wrong page.
- **The flood bypass was reading the wrong permission.** F39 shipped with
  `content.viewUnapproved` standing in for it, which is a silent divergence from
  a decision already on record: `docs/mybb-parity.md#flood-intervals` says the
  interval is a board setting plus the `canBypassFloodCheck` boolean. That
  boolean had no way to be asked for, so the posting path could not use it. It
  now has a global `flood.bypass` action — outside the F22 forum matrix, because
  the interval is not a per-forum grant — and administrators are in
  `ADMIN_ALWAYS` for it, since an administrator waiting fifteen seconds while
  clearing a spam wave is obstructed by a defence aimed at somebody else.

### D44 — Rendering BBCode, and where the rendered HTML lives (F36)

Post bodies were stored raw and rendered by `plainTextHtml` in
`src/view/thread-view.ts` — a deliberate placeholder, and the only place raw
text became markup. `@forum/bbcode` replaces it. Four decisions are worth
recording, and one of them is the reason the package is a scanner rather than
the obvious pile of regular expressions.

#### The renderer never sanitises, because it never parses HTML

There is no sanitising step. The pipeline is `tokenise → parse → render`, and
the output string is assembled from three sources only: literals in
`tags.ts`, values that passed a validator (`safeUrl`, the colour pattern, the
size enum), and strings that went through `escapeHtml`. Attacker-controlled
markup never exists in the output to be cleaned, so there is no "did the
sanitiser miss a vector" question — a vector would have to survive escaping.

This is why `[color]` is safe to support at all. Its value lands inside a
`style` attribute, the one attribute where escaping alone would not be enough
(`;` opens a second declaration), so the pattern admits no punctuation
whatsoever: `#rgb`, `#rrggbb`, or a bare keyword. `red;background:url(…)`
renders as unstyled text, and `[size]` avoids the question entirely by emitting
a class from a fixed set of seven rather than a length.

`security.test.ts` asserts the property rather than a blocklist: **every `<` in
the output is one this package wrote.** It scans the output, matches each tag
against the complete set of markup the renderer may emit, and rejects anything
else — then does the same for 4,000 generated inputs built from tag fragments,
brackets, quotes and scheme-shaped strings, from a fixed seed so a failure
reproduces. "No `<script>` appears" is the check that lets the next unlisted
vector through.

#### A scanner, not regular expressions

MyBB renders BBCode with successive regex passes, which is why `[b]` inside
`[code]` bolds, why nesting has no bound, and why several of its historical
security reports read "the pattern matched something it should not have". A
scanner puts the decision "does this `[` start a tag" in one function that can
be tested on its own — and it is not obvious: `[oh no [b]bold[/b]` must bold,
which only happens if the scanner gives up on the outer bracket instead of
swallowing to the first `]`.

The tokeniser knows exactly one thing about the tag set — which tags take a raw
body — because `[code][/b][/code]` cannot be tokenised correctly without it.
Finding that closing tag uses a case-insensitive regex rather than `indexOf`
over a lowercased copy, because lowercasing can change a string's *length*
(`İ`.toLowerCase() is two code units) and every index is then used to slice the
original. One Turkish capital earlier in a post would have split a body
mid-character; there is a test with that character in it.

#### Malformed input degrades, and never throws or disappears

Two rules, both lossless:

- **Never emit unbalanced output.** `[b][i]x[/b]` closes `[i]` implicitly, as an
  HTML parser would, so the renderer cannot produce a `<strong>` that escapes
  its post and bolds the rest of the page.
- **Never let an unclosed tag swallow the thread.** A tag still open at the end
  is *demoted*: its opening tag becomes the literal text it looks like and its
  children stay where they were written. Someone who types `[b]` and forgets the
  close sees `[b]`, not a post where every word after it is bold.

The limits follow the same rule. Past the depth limit a tag stays text; past the
node budget the remaining source becomes one text node; past the input limit the
tail is text. Nothing in the package throws and nothing is dropped, because a
body that fails to render is a thread page that 500s for everyone who opens it,
and a body that renders half of itself is a data-loss bug reported as "my post
is cut off".

#### The stored render, and why the version column is the important half

Rendering fifty posts on every load of every thread is work worth avoiding, so
`posts.message_html` holds the HTML and `posts.render_version` holds the
renderer version that produced it. The version is what makes the cache safe:

- **Reads never trust an old render.** `postBodyHtml` uses the stored HTML only
  when its version matches `RENDER_VERSION`, and otherwise renders live. A test
  pins this with a stored `<script>` tag at an older version, which must not
  reach the page.
- **Invalidation is a constant.** Bumping `RENDER_VERSION` invalidates every
  stored render on the board at once. An escaping fix therefore takes effect on
  deploy, everywhere, with no migration over the largest table on the board and
  no waiting for a sweep.
- **The sweep is the cheapest component in the family.** Unlike F38's recount,
  `posts.render_backfill` needs no cursor: "what is left" is a predicate on the
  row (`render_version <> current`), so a run that dies leaves the rest exactly
  as stale as it was and the next run finds it by asking again. Two concurrent
  runs write the same bytes. It is one `select` and one `update` per run
  whatever the batch holds — asserted with F11's budget helper, because the
  obvious per-post update turns a 200-post batch into 201 round trips.

The write path renders inside the same transaction as the insert, in
`@forum/db` rather than in the composer. That is a small purity cost — the
package that owns SQL now calls a renderer — bought for a structural guarantee:
`posts` is only written from one module, so no post can exist without its
render, and no future writer (F41's edit, F85's importer) can forget to supply
one.

#### Smaller things

- **The fixture board stores no renders.** Every `SEED_POST_ROWS` entry carries
  `messageHtml: null`, so the e2e board exercises the live path — and the
  Playwright suite now asserts the *tags*, not the words, which is the first
  browser-level proof of any Phase 3 feature (the composer still has no fixture
  writer; see F39/F40's standing gap).
- **A quote's `pid` is parsed and dropped.** Turning it into a link needs the
  thread the post lives in, and a post id alone can address a post in a forum
  the reader cannot see. A quote header that 404s for half the board is worse
  than one without a link.
- **Bare URLs are not auto-linked.** MyBB linkifies loose `http://…` in post
  text. Recorded as a parity decision rather than done quietly — see
  `mybb-parity.md#bbcode-coverage`.

### D45 — Editing, deleting, and the counters that have to come back (F41)

The ⛔ gate for content mutation. Everything downstream of it — the moderation
queue, thread tools, merge and split — is a different actor performing one of
the two transitions defined here, so both are written once, in
`@forum/posts`, with their counter consequences attached rather than left to
each caller.

#### A deletion is not a creation with a minus sign

F38 wrote the counters a created post moves, and F41 was always going to have to
reverse them. It is not the same code negated, for one reason: some of what F38
writes is not a counter. `post_count` is a delta and reverses arithmetically;
`last_post_id` is a **pointer**, and the reverse of "this post is now the
newest" is not "subtract one" — it is "find what the newest is now".

So counts are adjusted and pointers are recomputed, and the two get different
guarantees. Counts on the direct forum, thread and author are written in the
caller's transaction; ancestor counts ride the event, as F38's do. Pointers on
the **whole path** are recomputed synchronously, because a board index linking
to a post that no longer exists is worse than a count being a minute late.

The repair walks deepest-first and takes each forum's pointer to be the newest
of (its own visible threads) and (its children's already-correct pointers) —
subtree-inclusive by induction, two indexed reads and one update per level. It
runs on *every* visibility change rather than only when the changed post
happened to be a pointer, because deciding that costs about as much as doing it
and getting it subtly wrong is silent. A mutant that repairs only the posting
forum, and one that walks the chain top-down, are both killed by tests.

#### The ledger already answered the idempotency question

`content_counter_rollups` was F38's replay guard for creation. Read as **"this
post is currently counted in its ancestors"** it answers delete and restore too,
with no new table and no sequence number: a redelivered delete finds no ledger
row and does nothing, a redelivered restore finds one and does nothing.

The handler reads the post's *current* visibility rather than trusting the
event's `visible` flag, which makes it convergent rather than merely idempotent:
delivery is at-least-once and unordered, and a delete/restore pair arriving
backwards would otherwise leave the ancestors permanently one out. There is a
test that delivers exactly that pair in the wrong order.

#### `unapproved → deleted` moves nothing

The case a "deleting always decrements" implementation gets wrong. Every counter
on the board means *visible* content (D41), so a post in the queue was never
counted and rejecting it must not subtract. Getting this wrong walks every total
down by one per rejected post — invisible until a recount, and indistinguishable
from ordinary drift. It is its own test, and its own killed mutant.

The same definition decides the edit path: `requiresApprovalOnEdit` sending a
visible post back to the queue is a `visible → unapproved` transition, so it
goes through exactly the same counter code as a deletion. There is only one
place where a post stops counting.

#### The opening post is the thread

Soft-deleting the first post of a thread is refused, with a message saying to
delete the thread instead. Both alternatives are worse: deleting only the post
leaves a thread with a title, a reply count and nothing to read, and silently
deleting the thread means a member clicking "delete my post" removes everybody
else's replies. Deleting a thread is F50's tool, which can move the thread's
counters as one act.

#### Where the edit window applies, and where it does not

`editTimeLimitMinutes` is a numeric permission, so R4.2's rule holds: **0 is
unlimited and beats every other value across groups.** It applies to your own
post only. Someone editing another member's post is doing so under
`post.editOthers`, which is a moderation power — and a moderator who cannot fix
a two-year-old post because its author's window closed is a rule aimed at the
wrong person. Both spellings of "not mine" are tested: the explicit bypass, and
simply not being the author.

The view model re-checks the window, and only to decide whether to *offer* the
link. Enforcement is `PostEditor`'s; this is the difference between hiding a
control and granting one.

#### An unchanged body writes nothing

No revision, no edit notice, no counter. A revision recording no change is noise
in the history the next moderator has to read, and an edit notice on a post
nobody edited is a false accusation in public.

#### Two forms, not two buttons

Delete is a separate `<form>` from the edit form rather than a second submit
button on it, and both matter with scripting off: a submit inside the edit form
would carry the whole draft, so "delete" would mean "save my unsaved changes,
then delete" — and a form's default submission (Enter in the textarea) picks its
*first* submit button, which must never be the destructive one. Both are POST
Server Actions: a GET that deletes a post is one prefetch away from deleting the
board.

#### Hidden posts are filtered in the query, not in the theme

A moderator sees deleted and unapproved posts with a banner; everyone else's
page never contains the row. Two `include` flags rather than one, because
`content.viewDeleted` and `content.viewUnapproved` are two permissions — a role
that reviews the queue is not automatically one that reads what was removed.
Filtering in the theme would put the body in the HTML and hide it with CSS,
which F33 already refused to do for profile fields.

Post numbering follows whichever set the reader is shown, so a moderator's "#4"
can differ from a member's. The alternative is gaps in the numbering, which
reads as a bug on every thread that has ever been moderated.

#### Smaller things

- **The fixture board's Registered group did not match the seeded one.** Three
  negative permission fields (`requiresThreadApproval`, `requiresPostApproval`,
  `requiresApprovalOnEdit`) were absent from `seed-board.ts`, so the fixture
  inherited `emptyPermissionSet()`'s fallback — which for a negative field is
  the *restrictive* value (R4.2) — while migration `0001` seeds all three
  `false`. Nothing read them until F41, at which point every edit on the fixture
  board went silently to a queue that has no screen. Found by a test that
  expected a redirect to the post and got one to `?posted=moderated`.
- **`resolvePostScope` is not a Server Action.** It lives in its own
  `server-only` module because a `'use server'` file publishes every export as a
  callable endpoint, and this one returns a post's stored body with the
  permissions around it.
- **Restoring always returns a post to `visible`**, even one that was
  `unapproved` when it was deleted — the prior state is not stored. It requires
  `post.softDelete` *and* `content.viewDeleted`, both moderation powers, so the
  restore is a review decision rather than an accident. F48's queue is where a
  post's approval state becomes something to move deliberately.
- **The edit rewrites `message_html` in the same statement as `message`.** F36's
  backfill would eventually repair a miss, which is exactly why it cannot be
  relied on: a current-version render is *trusted*, so until the sweep ran every
  reader would be served the pre-edit body.
- **Previews now render.** F36 shipped without wiring the composer preview to
  the renderer; all three forms now show `@forum/bbcode`'s own output, produced
  on the server by the same function that renders the post, so the preview
  cannot drift from the result.

### D46 — One scope, produced once and consumed once (F47)

The second ⛔ gate, and the one that had to be built *after* enough read paths
existed to show what the problem actually is. It is not that a check was
missing anywhere — it is that by F41 there were five separate hand-written
answers to "which content may this reader see", in five queries, with no way to
tell from any one of them whether the other four agreed.

#### The rule is about queries, not comparisons

`visibility` is compared in plenty of legitimate places: a domain rule refusing
to edit a deleted post, a view model deciding whether to offer Restore, the
recount defining what "counts" means (D41). None of those is a leak risk,
because each acts on a row that has already been filtered — or, in the recount's
case, is not showing anything to anybody.

So the enforceable rule is narrower and exact: **no query may name a visibility
state.** Every viewer-facing read takes a `ContentScope`, produced in exactly
one place (`Authorizer.contentScope`) and turned into SQL in exactly one place
(`visibleIn`). `pnpm guards` fires on any query-shaped mention of the column
outside the counter and write modules, and it is probed both ways like every
other guard — including two `alsoClean` samples for the exemptions, because an
exemption nobody probes is one that quietly widens.

The guard found two real hits on its first run: the unread computation in
`read-state-repo.ts` was filtering with its own `eq(threads.visibility,
'visible')`, and the flood check's "when did this author last post" was using
`<> 'deleted'`. The first is now a scope; the second is a write-path rule and is
exempt by name.

#### The scope is required and undefaulted

`listThread(id, { limit, scope })` — no default, no optional. That is the design
decision the whole gate rests on: a caller that has not decided what this viewer
may see has not finished authorising, and a default would make the omission
invisible. Making it required turned an audit into a compile error, and the
compiler then found every call site including the ones in the fixture
repositories and the seed data.

The fixture repositories apply the same predicate rather than assuming their
sample rows are all visible, so a fixture-mode leak would be a fixture-mode bug
rather than an untested path.

#### Locate, authorise, read

The thread page had a genuine ordering problem: the scope cannot be built before
the forum is known, the forum cannot be known before the thread is found, and
reading the thread unscoped to find out is exactly what the gate forbids.

Three options, and only one is honest. Reading the thread with an all-states
scope makes the escape hatch a supported feature. Reading it publicly first and
retrying wider means two reads and a subtle bug when they disagree. What it does
instead is `locateForum(threadId)` — a deliberately unscoped lookup that returns
a **forum id and nothing else**. A forum id is not content: it confirms nothing
a reader could not learn by being refused, and the `thread.view` check that
immediately follows decides whether they learn even that. The thread itself is
then read exactly once, in the scope this actor turns out to have.

#### Numbering is a disclosure

`#4` on a page where the reader can see three posts tells them content exists
that they are not allowed to know about — the same fact the filter exists to
withhold, arriving as an integer instead of a body. So "how many came before"
uses the reader's scope, not the table, and the leak suite pins it with a cursor
placed *past* the hidden posts, because with the cursor before them the correct
and incorrect answers are the same number. That subtlety is why the first
version of the test passed against a deliberately broken query.

#### The leak suite is a property, not a list of expectations

The central assertion is: for every read path × every scope, every row that
comes back is in the scope that was handed in. That is satisfiable by a path
that returns nothing, so each scope is *also* pinned to the exact set it should
see — together they say "no more" and "no less".

It is a table because the next read path should be a row rather than a new file,
and because a path that cannot be expressed as "takes a scope, returns rows" is
a path that does not take a scope — which is the thing the guard refuses to let
exist. Four mutants killed: a `visibleIn` that stops filtering, an unread
computation that counts hidden threads, a quote lookup that follows the reader's
scope, and a numbering subquery that counts the whole table.

#### Smaller things

- **`visibleIn` emits `=` for the single-state case, not `in (…)`.** An `in`
  list of one is a correct query that stops matching the R3.5 partial indexes
  (`… WHERE visibility = 'visible'`) that every listing on the board depends on.
- **It is an allowlist, never `<> 'deleted'`.** A negative predicate is one new
  state away from letting that state through, and R3.3 reserves the right to add
  one.
- **Three paths are public whoever is asking**, and each says so by naming
  `PUBLIC_CONTENT` rather than by writing a literal: the quote lookup (quoting
  republishes a body, so a moderator quoting removed content would put it back
  in front of everybody, with their name on it), the mark-read target (a
  watermark set to a hidden post moves backwards the moment it is removed), and
  the unread computation.
- **`ContentVisibility` was declared twice** — once in `@forum/core` and once in
  `@forum/authorization`. The second is now a re-export; two structurally
  identical declarations is how a shared vocabulary drifts.
- **`ThreadListingRow` gained `visibility`.** A listing that can contain hidden
  rows has to say which ones they are, or the theme cannot mark them and the
  leak suite cannot check itself.

### D47 — The queue, and the table nobody had ever read (F48)

Approving was already built: it is F41's `unapproved → visible`, counter-correct
in both directions and idempotent against replay. What F48 adds is the part F41
could not have — a *list* of what is waiting, and a bulk decision over it.

#### `forum_moderators` had no reader

F21 created the table. Nothing has consulted it since, and
`Target.isForumModerator` — the flag the Authorizer branches on for four
different actions — has never once been set by the app. So in practice
"moderator" has meant "member of a staff group", and a board that appointed
somebody to moderate one forum appointed them to nothing.

F48 is the first feature where that gap is load-bearing: "the forums I
moderate" is the queue's entire scope. So the port gained
`moderatorAppointments`, `@forum/db` gained the query, and
`Authorizer.moderatedForumIds` unions two sources — a group-level
`canApproveContent`, and an appointment, expanded down the tree when it
cascades. It is constant-query for the same reason `visibleForumIds` is (D26).

Threading `isForumModerator` through every per-page `can()` call is *not* part
of this feature and remains a real gap: outside the queue, a per-forum
appointee still has only their group's rights. That is F54's, where granular
moderator rights become the subject rather than a dependency.

#### Approving needed its own action, and the F22 matrix grew a column

`content.viewUnapproved` means "this actor deals with the queue" and is already
the moderation bypass. Approving is a stronger power — MyBB has had
`canviewunapprove` and `canapproveunapprove` as separate columns for twenty
years — so `content.approve` is a new `Action`, which by design forces a
thirteenth column in F22's fixture. That cost is the point of the gate, and it
was small: the sets are named constants, so `ALL` picked it up and only the
read-only-subforum row needed a decision (a moderator approves there; the
override takes away *posting*, and a closed forum is exactly the kind that still
has a queue from before it closed).

`content.approve` reads `moderatorApproves` rather than `isForumModerator`,
because an appointment's rights are granular: being a moderator here does not by
itself mean being trusted to empty the queue.

#### The selection is never trusted

A form submits `kind:id` checkbox values. Every one is re-read to find out which
forum it is *actually* in, and only then checked against the moderated set. An
id in a POST body is a request, not a fact — and the moderated set is resolved
per request from the actor, never carried in a hidden field, because a hidden
field holding it is the whole permission check sitting in the browser. Both are
mutation-verified.

Refusals are reported, not dropped. A moderator who selects twelve items and
moves eleven is told how many were in forums they do not moderate and how many
somebody else had already handled — otherwise the screen and the board disagree
about what just happened and only one of them is right.

#### A thread and its opening post move together; a held reply inside a held thread does not appear

F39 writes a held thread and its opening post held together, so approving the
thread without the post yields a visible thread with nothing to read. Nothing
*else* in the thread moves — a reply held separately is its own queue item.

The converse is why the listing excludes replies whose thread is itself waiting:
approving such a reply would publish a post into a thread nobody can see, and
approving the *thread* is what actually puts it in front of anybody. Killed by a
mutant that drops the condition.

#### Rejecting moves no counter

The same silent case F41 documents, from the other side. Held content was never
counted (D41), so `unapproved → deleted` is a state change and nothing else. A
"deleting always decrements" implementation walks every total down one rejected
post at a time, and no recount would attribute the drift to anything.

#### Bounded, and all-or-nothing within the bound

`MAX_CHUNK` is 200 and the screen offers 25, so the cap is not something anybody
meets by clicking — it is the ceiling on a hand-crafted POST. Each item costs a
transaction's worth of counter updates and a last-post repair up the tree, so an
unbounded selection is a request that runs until the platform kills it, halfway
through, with no record of where it stopped. Within the bound the batch is one
transaction: a half-applied bulk approval would leave a moderator with no way to
tell which half.

#### The screen is app-owned, not a theme slot

The 25-slot registry is R6's list and freezes at F77. A moderator tool is an
operator surface, like the ACP (F63), which also has no slot — and committing the
public theme contract to a screen whose shape F54's ModCP has not designed yet
would be the wrong order. The route sits inside the board route group, so the
theme still supplies everything around it.

The queue shows each body as **plain text**. This is the one screen that
displays content nobody has approved, and rendering it would give a spammer's
markup its first audience in the browser of the person deciding whether it
should exist.

#### Smaller things

- **`= any($1::int[])` does not work.** Drizzle expands a JavaScript array in a
  template into a comma-separated *placeholder list*, so `any(${ids})` compiles
  to `any(($1, $2))` — a syntax error, and `any(())` for an empty array. Both
  new queries use an `in (…)` list built with `sql.join`, with `(null)` for the
  empty case. The appointment query had the same bug and no test; it has one
  now, on real Postgres, because that is what would have caught it.
- **The queue's cursor is a keyset, not an offset.** The queue changes
  underneath a moderator working through it, and an offset skips an item every
  time somebody else approves one above. A corrupt cursor is treated as no
  cursor rather than as a failed page.
- **One audit row per batch.** A moderator clearing a queue performed one act;
  twenty rows saying so would bury the next one.
- **The user-panel link is group-level only.** `canAccessModCp` is read off the
  already-resolved actor, so the shell costs no extra query — but a per-forum
  appointee does not get the link, only the working page behind it. Resolving
  the tree on every page render to fix that is F54's trade to make.

### D48 — Reports have two audiences, and almost every decision keeps them apart (F49)

A report is a member saying "a moderator should look at this". The mechanism is
small; what makes it worth a decision record is that it serves two people with
opposite needs.

The **reporter** needs to know their report was filed and nothing else — not who
is handling it, not what was decided, and above all not the note. The
**moderator** needs the history: who assigned it, when, and why the last person
closed one like it.

So the design puts them in different tables. `reports` is the current state;
`report_events` is the history, and it is the only place a private note lives.
Nothing that returns a report to a reporter carries an event at all.

#### The note belongs to the event, not the report

"Resolved because X" belongs to *that* resolution. On the report it would be
overwritten by the next one, leaving a history that says a decision was made for
a reason nobody gave. The note is also optional on purpose: requiring one on
every dismissal produces a column full of "spam" and "n/a", which is worse than
an empty one because it looks like a record.

#### One open report per person per target, enforced by the index

Not by a prior `select`. Two clicks arriving together would both pass a check
and both insert, and a report button that adds a queue row every time is the
cheapest denial-of-service on the board. `on conflict do nothing` makes the
database the arbiter, and an empty `returning` is the friendly answer rather
than an error.

The index is **partial** — `where status = 'open'` — so the same person may
report the same post again once a previous report is closed. Circumstances
change, and a permanent bar would mean one dismissed report protects a post
forever.

A duplicate is reported to the member as *success*. They did what they meant to
do, and "you already reported this" is only useful to somebody probing what is
in the queue.

#### Assignment is a column, not a status

An assigned report is still open. Modelling it as a state means "show me
everything outstanding" has to ask for two of them, and every future query grows
the same `or`.

#### Two scopes, because reports have two

A report about a post or a thread belongs to that forum's moderators —
`moderatedForumIds`, the set F48 built. A report about a **member** belongs to no
forum, so it is board staff's (`modcp.access`) or it is nobody's. They are one
predicate rather than two queries, so a moderator who is also staff sees both in
one ordered page.

`modcp.access` rather than a new permission field: the board already has a
switch for "this person is staff", and inventing a second would give an
administrator two ways to express one decision.

"Does not exist" and "not yours" give the same answer, so a moderator of one
forum cannot learn by probing ids that a report exists in another.

#### Only public content is reportable

`resolveTarget` uses `PUBLIC_CONTENT` for every actor rather than the reader's
own scope (F47). A member cannot report what they could not have seen, and a
moderator has better tools than the report button for content that is already
held or removed. The forum check then happens *after* the target resolves, in
both the page and the action: a form says which row, and whether this member
could see it is a question only the row's forum can answer.

Reporting your own post is not offered. It is a button that files a complaint
about yourself, and the only person it helps is somebody flooding the queue.
Reporting is *not* forbidden for a self-target in the domain, though — people do
it by accident and moderators can simply close it.

#### What is deliberately absent

- **Private messages as a target.** F60 has no tables. A `pm` kind nothing can
  produce is a column that lies about what the board supports (D32's rule).
- **Notifications on state changes.** F55 does not exist. The report appears in
  the moderator list; telling somebody about it is a different feature, and
  stubbing it would mean a "notified" flag nothing sets.

#### Smaller things

- **`content.report` is global**, so it costs the F22 matrix nothing — the
  matrix is forum-scoped actions, and reporting is a board-wide capability. What
  *is* per-forum is whether the member could see the target, and that is
  `thread.view`, which the matrix already covers.
- **The moderator screens are app-owned**, for the reason D47 records for the
  queue: the slot registry freezes at F77 and an operator surface does not
  belong in the public theme contract.
- **The reporter's words are rendered as text**, like the queue's excerpts. A
  report is unapproved content of a kind, and the screen that shows it is the one
  deciding what to do about it.
- **`visibleIn` needs the aliased column.** `visibleIn(posts.visibility, …)`
  emits `"posts"."visibility"`, which does not resolve in a query that aliases
  the table `p`. Passing `sql\`p.visibility\`` is the fix, and the failure was
  loud rather than silent — the query did not parse.

### D49 — Thread tools, and the two ends of a move (F50)

Post-level transitions were F41's and thread *approval* was F48's. What was left
is everything that acts on a thread as a unit. Three are flag flips; two move
every counter the thread's posts contribute.

#### The thread tools have no usergroup permission, on purpose

Every action before F50 reads a field off the resolved forum matrix.
`thread.lock`, `thread.stick`, `thread.move` and `thread.delete` read an
**appointment right** and nothing else. MyBB has never had a usergroup column
for these either, and it is right not to: "may lock threads everywhere on the
board" is a thing you are appointed to or a thing you bypass into as staff, not
a checkbox on a group.

That made F48's debt come due immediately. `moderatorApproves` became a full
`ModeratorRights` on the Target, `forum_moderators` grew from four rights to
seven in the reader, and `Authorizer.moderatorRightsIn` is the new seam:
`moderatedForumIds` answers *where* somebody moderates, this answers *what* they
may do there. Rights from several appointments covering the same forum are
**unioned** — two grants are two grants.

Four new actions means four new columns in the F22 matrix, now 544 cells. The
decision per cell was uniform (moderators everywhere, members nowhere) with one
judgement: a moderator keeps the tools in the read-only subforum, because the
override takes away *posting*, and a forum nobody may post in is exactly the
kind that still has a backlog from before it was closed.

#### A move has two ends, and both need the right

The rule a "can this actor moderate here" check gets wrong. Rights in the source
alone would let a moderator move a thread out from under the people watching it
and into a forum where they have no standing at all — which is how a private
forum acquires content its own moderators never approved. So the action resolves
rights **twice**, once per forum, and the command refuses unless both hold.
Mutation-verified by copying the source rights into the destination.

#### Where the ancestors are updated, and why it differs from F38/F41

F38's roll-up and F41's reversal are per-post deltas made idempotent by the
`content_counter_rollups` ledger — "this post is currently counted in its
ancestors". A **move** cannot use that ledger: the post is still counted, just
somewhere else, and a row saying "counted" cannot express *which chain*.

Rather than have one thread-level operation follow a different rule from its
neighbour, both do their ancestors in the caller's transaction. They are bounded
by tree depth and they are rare — a board moves a thread far less often than it
gains a reply. The two chain updates cancel exactly at a shared ancestor, which
is the assertion a naive implementation fails: a thread moved between two
subforums of one category has not left the category.

Thread delete and restore *do* keep the ledger in sync, because their posts stop
and start being counted. Without it, deleting one post of a deleted thread would
decrement ancestors that the thread had already decremented.

#### The tally is taken once

A thread's contribution is counted once and reused for the forum, the ancestors
and every author. Three separate counts of the same thing is how a move leaves a
forum and its category disagreeing by one. It is also per-author: Ada wrote the
opening post and Bob the reply, so a single subtraction applied to "the thread's
author" would leave Bob credited for a post nobody can read.

A move leaves author counts alone. It changes where somebody wrote, never how
much.

#### `posts.forum_id` is denormalised and has to be rewritten

R3.3 carries the forum on the post so permission filtering and the moderation
queue can scope without joining `threads`. A move that updated only the thread
leaves every post claiming to be somewhere it is not — and the queue, F47's
scope and the recount all read that column. Its own killed mutant.

#### `<>` in the WHERE, so a doubled click writes no audit row

A log that records acts that did not happen is worse than no log. Locking an
already-locked thread updates nothing, reports `false`, and writes nothing.

#### What is deliberately not here

- **Copy.** It is the only one of the eight that *creates* content, so it needs
  the render, flood and approval path F39 owns rather than a counter move — and
  it asks a real product question nobody has answered: MyBB credits the copies
  to their original authors, which counts one piece of writing twice. Better
  unbuilt than built on a guess.
- **The move redirect stub.** `threads.moved_to_thread_id` exists and
  `ThreadListingRow.isMoved` reads it, but a stub needs the *thread view* to
  follow the pointer, which is F30/F31's surface rather than a moderation tool.
- **Thread approval**, which is F48's and already counter-correct. Duplicating
  it here would be a second path to one transition.

F50's row says `PARTIAL` for exactly these, rather than `DONE` with a footnote.

### D50 — Merge and split are one arithmetic seen from either side (F51)

**Plan:** "Test-first merge/split across forums, preserving post order and all
pointers/counters/authors."

**Implemented:** `ThreadSurgery` in `@forum/moderation` with
`PostgresThreadSurgeryRepository` behind it, two Server Actions rather than one,
and the two controls in the same moderator bar as F50's.

#### Why one file, and why two actions

The two operations are one file because they keep the same list of things true:
post order, the opening-post flag, the reply counts on both threads, both forum
chains, and who is credited with what. Splitting them across packages would mean
maintaining that list twice.

They are two *actions* because they take different arguments and authorise
different pairs of forums. F50 has one action for four tools precisely because
those four differ only in a verb; forcing merge and split into that shape would
mean a parser that ignores half its input depending on a hidden field, which is
how the wrong end gets authorised.

#### Post order survives by construction; the opening-post flag does not

Posts page by id (F31) and neither operation renumbers anything, so order needs
no work. `is_first_post` is a *flag* rather than a computation, so it is the
thing that silently goes wrong: a split has to set it on the new thread's
earliest post and a merge has to clear it on the absorbed thread's. A new thread
whose earliest post is not marked has no opening post, and every read that
trusts the flag stops working. Both directions have their own killed mutant.

#### The author question F50 deferred, settled

Neither operation duplicates a post, so `users.post_count` **never moves**: the
same people wrote the same words. Only `thread_count` moves, and only by one — a
split creates a thread, a merge destroys one. This is why split was a cheaper
place to settle the question than copy: there is no second copy of anything to
argue about, so the answer falls out rather than being chosen.

The new thread is credited to the author of the post it now *opens with*, not to
whoever started the conversation it came out of. A split exists because that post
began something different.

#### A split lands in the same forum, always

Splitting and moving are two acts. Doing both at once would mean one operation
with a second forum to authorise, and a moderator who may split here but not
post there could place content in a forum they have no standing in. `thread.move`
is right there afterwards. It also keeps the forum arithmetic trivial and
correct: the forum gains **one thread and zero posts**, because the posts never
left it. Moving the post count too is the mistake that makes a forum's total drop
every time somebody tidies a thread.

#### A merge moves every post, including the held ones

Only the visible posts are *counted*, but all of them are *moved*. A held or
removed post left behind would belong to a thread that is about to stop
existing, and `posts.thread_id` cascades — the moderation queue would lose it.
The source row itself is deleted rather than soft-deleted: its posts have already
gone, and an empty deleted thread is a row in the moderator's restore list that
restores nothing.

#### Which thread survives is never inferred

The source is absorbed; the target survives. Not the older one, not the bigger
one. Guessing it is how a merge silently destroys the thread somebody meant to
keep, and no amount of arithmetic correctness makes that recoverable.

#### The cut point is a post *of this thread*, not a bigger id

`postsFrom` returns nothing unless the id it was given is itself in the result.
"Everything from here" and "everything with a bigger id" are different questions,
and the difference is only visible for a post that is on the screen but not
eligible — a post of an *earlier* thread, or a held post in this one. Both are
tested; without the check the second selects the whole thread and splits it from
a post that is not in it.

#### The merge box takes a raw number, so the target is authorised like a page

Split names its cut point with a `<select>` of the posts on screen, which cannot
name a post that is not one of them. Merge cannot do that — the thread to merge
into is by definition not on this screen — so it asks for a number, and the
action puts that number through `thread.view` before anything else. Without it,
the box is a working thread-existence oracle for every id on the board. It
answers "that thread does not exist" in exactly the words an id nobody has used
gets.

Rights are resolved at **both** ends, for D49's reason: a merge pushes content
into the target's forum.

#### What is deliberately not here

- **Splitting into another forum.** See above; it is split-then-move.
- **Splitting a hand-picked set of posts.** The cut is "from this post onwards",
  which is what MyBB's split-from does and what the thread page can express with
  a `<select>`. Arbitrary selection needs the per-post checkbox surface F52 is
  building for inline moderation, and building half of it here would mean two
  selection mechanisms.
- **Merging more than two threads at once.** Repeating the operation is the same
  thing, and a multi-way merge has to pick a survivor among three, which is the
  decision this feature refuses to guess even between two.

### D51 — Inline moderation, and the two questions a bulk selection asks (F52)

F52 adds no mechanism. Every transition it performs is F41's, F48's or F50's,
already counter-correct and already state-guarded. What it adds is a *selection*
— checkboxes down a listing rather than a queue you visit — and a selection asks
two questions the single-target tools never had to.

#### The checkboxes are not inside the form, and cannot be

`ForumDisplay` already renders a mark-read `<form>`, and nested forms are not
something a browser will parse — the inner one is discarded, silently. So the
moderation bar cannot wrap the listing.

The answer is HTML's `form` attribute: `<input form="inline-moderation">`
associates a control with a form **by id, anywhere in the document**. The
browser honours that natively with scripting off, and `new FormData(form)` picks
it up after hydration, because both are reading the same form-owner
relationship. So the theme renders a checkbox in each row, the app renders the
bar below the listing, and neither has to contain the other.

This is why `SelectionModel` carries a `formId` and why it is plain data. The
form itself carries a Server Action reference, and D38 settled that those never
cross the theme contract; a slot that received the form element instead would
put the theme in charge of where the bar goes, which is the page's decision.

`ThreadRowSlotModel` and `PostBitSlotModel` both gained `select`. A theme that
ignores it renders a listing with no bulk moderation and nothing else missing.

#### The scope is the security boundary, not the rights

F48 established that the selection is never trusted: every id is re-read to find
the forum it is really in, and only then checked. That is necessary and, on its
own, not sufficient here — because F48 had one right (`content.approve`) and F52
has six, so it has to report *refusals*.

A refusal is an answer. "You may not lock that" and "there is no such thing" are
different observations, and the difference over a whole board is a
content-existence oracle: tick an id, read the counts, learn whether it exists.
F51 named the same trap for its merge box and closed it by putting the raw
thread number through `thread.view`.

So the re-read itself is scoped. `Authorizer.forumIdsWhere(actor, action)` — new
in this feature — answers "every forum where this actor may perform this
action", and `resolve` never looks outside it. An id in any other forum comes
back absent, exactly like an id nobody has used. Within the scope, refusals are
free to be specific: those are forums the actor already moderates.

#### `forumIdsWhere` exists because one rights field means two things

`moderatedForumIds` is keyed by a `ModeratorRights` field. That is the right
question for a queue and the wrong one for a tool, because `canSoftDeletePosts`
grants `post.softDelete` through a group column *or* an appointment, and grants
`thread.delete` through the appointment only — F50 gave the thread tools no
group column on purpose. A scope keyed by the right cannot express both.

Keyed by the **action** it can, because `can()` already knows. The new method
builds the Target a page would build — resolved matrix, resolved appointment
rights — and asks `can()` once per forum, over the same constant set of source
reads `visibleForumIds` uses (D26).

It also **sets `Target.isForumModerator`**, which F48 introduced and then
recorded as debt because no per-page `can()` call ever set it. That is half of
F54's debt paid in passing: an appointee's `post.softDelete` now resolves the
same way in bulk as it does on the post's own page.

Staff short-circuit before the loop, and it is not an optimisation. It logs one
bypass instead of one per forum — fifty audit lines for a page load buries the
bypasses that describe a decision — and it *agrees with `can()`*, which grants a
super-moderator every forum-scoped action before it looks at the matrix at all.
A scope narrower than the action it authorises is a screen disagreeing with its
own decision.

#### Deleting is scoped by the union of two actions

Following from the above: `INLINE_TOOL_ACTIONS.delete` is
`['thread.delete', 'post.softDelete']`, and the scope is the union. Scoping by
either one alone breaks something — by the narrower, a group-level post deleter
sees every selection report "gone"; by the wider, a thread id in a forum where
only `post.softDelete` holds comes back as a refusal, which is the oracle again.
Union scope, per-row right: every forum in the scope is one the actor already
moderates with this tool, so a refusal there discloses nothing.

#### Four numbers, not one

`applied`, `refused`, `missing`, `skipped`. A moderator who ticked twelve boxes
and changed nine has to be told which three did not move, and the three causes
are genuinely different: you may not, it is gone, there was nothing to do.

**Rights are checked before state**, and the order is the disclosure argument
again — asking "is it already locked?" first would let somebody who may not act
here read the answer out of the difference between `skipped` and `refused`.

A row that passed every check and still did not move lost a race with another
moderator between the re-read and the write. That is a `skip`: the state it was
being moved to is the state it is in.

#### It chunks, where the queue refuses

F48 refuses a selection over `MAX_CHUNK` and tells the moderator to work a page
at a time, which is right for a queue nobody hand-selects two hundred items
from. A listing has a "select all", and a moderator clearing a spam run
genuinely has hundreds. So F52 splits the work into transactions of
`INLINE_CHUNK` (25) instead of refusing it, with `MAX_INLINE_SELECTION` (500) as
the ceiling on one request.

**Leaving it half-done is safe, and that is what makes chunking the right
answer.** Every transition is a conditional update — `where visibility =
'visible'`, `where is_locked <> true` — so re-submitting the same selection
re-applies only what did not take. A bulk delete killed at chunk four is fixed
by pressing the button again; the first three chunks report `skipped`. One audit
row per chunk rather than per row, for F48's reason.

#### What is deliberately not here

- **Rejecting.** That is the queue's word for `unapproved → deleted` and it
  belongs on the queue, where the thing being rejected is visible in full. A
  listing shows a title.
- **Hand-picked split.** F51 deferred it here and it is still not built: the
  per-post checkboxes now exist, but `ThreadSurgeryRepository.split` takes a
  contiguous run from `postsFrom`, and making it take an arbitrary set is a
  change to F51's validation (no opening post, not the whole thread, all of
  *this* thread) rather than a change to this bar. It is named in F51's and
  F52's rows rather than half-built.
- **Copy.** Still F50's open product question, and still unanswered.

### D52 — A warning is aimed at a person, and that changes the arithmetic (F53)

Every moderator act before this one is aimed at *content*, which has one current
state. A warning is aimed at a member, and a member has a history that
accumulates, ages out, and can be corrected. Almost every decision here follows
from that.

#### The points total is derived, never incremented

`users.warning_points` has existed since migration `0000` with nothing that
writes it. What writes it now recomputes it from `warnings` rather than adding
to it, and the reason is revocation.

Withdrawing a three-point warning issued four months ago means subtracting three
from a number that has since been decremented by two expiries and incremented by
a fourth warning. If any one of those steps was ever missed the total is wrong,
and there is nothing to compare it against. So `warnings` is the record and the
column is a cache: one `update … set warning_points = (select sum …)` runs in
the same transaction as anything that changes a row. It is F38's recount
argument applied to a counter small enough to recompute every time.

Two tests corrupt the column deliberately and show the next recalculation
repairing it rather than compounding the error.

**"Live" is defined once** — not revoked, and not past its expiry — in one `LIVE`
fragment. Two hand-written copies of that predicate is how a total and its
source drift apart while both look right (D41's rule about "counted", again).

#### The expiry task corrects a cache; it does not create truth

`warnings.expire` finds members whose *cached* total still counts a warning that
has passed its date. The live predicate already excludes an expired row, so a
board whose tick has been down for a week still reports honest totals the moment
anything recalculates. What the sweep adds is re-evaluating the **level**, which
is how a suspension ends when the warning behind it ages out.

The "cache is still stale" condition is load-bearing rather than an
optimisation: without it, every past expiry on the board is rediscovered on
every tick and the sweep never reaches the newest ones.

#### Levels are thresholds, and the level is re-evaluated on every change

The applicable level is the highest-pointed one the member has reached, resolved
from the recomputed total. Issuing, revoking and expiring all run the same
evaluation, and that is what makes a revocation actually *lift* a restriction
rather than lowering a number while the suspension stays where it was.

Two consequences that are easy to get wrong and are each pinned by a test:

- **A level is applied only when it is *newly* reached.** Two warnings in a
  minute that both leave the member at the suspend level must not turn fourteen
  days into twenty-eight.
- **The sweep never bans.** It has no actor to attribute a ban to, and F23 owns
  the ban lifecycle including the group a ban captured. Banning is one-way here:
  a revocation lowers the points and leaves the ban for a moderator to lift,
  which is also the point at which somebody looks.

#### Restrictions are two columns on `users`, and the posting path reads them

`suspended_posting_until` and `moderated_posting_until`. Columns rather than a
`user_restrictions` table because there is at most one of each per member and
the posting path needs both on every post — a join for a row that is almost
always absent, on the board's hottest write. A timestamp in the past is a lapsed
restriction, so nothing has to be swept for these to be correct.

They arrive at `ThreadComposer` and `ReplyComposer` as two booleans, like
`bypassesModeration` beside them, and **a warning outranks that bypass**. The
bypass says "this forum's queue does not apply to you"; a warning level says
"your posts are reviewed", and a moderator whose own bypass cancelled their
sanction would be the one person on the board it could not reach.

#### The permission is global

`user.warn` is a usergroup column with no per-forum counterpart, matching MyBB's
`canwarnusers`. A warning's points follow the member across the whole board, so
a per-forum grant would have to answer "warned where?" about a total that has no
forum. It is therefore **not** in the F22 matrix — the same reasoning
`content.report` records — so the gate needed no new column.

#### Smaller decisions worth knowing

- **The type's points and expiry are read from the type row, never from the
  form.** A submitted `points` on a typed warning would let a moderator with
  one-point authority issue ten.
- **A warning's title and points are copied at issue time.** Editing a type from
  three points to one next year must not silently rewrite every warning ever
  issued under it: a member's history is a record of what they were told, not a
  view over current configuration.
- **Revocation is a column pair, not a deletion.** "This was withdrawn" is
  information a member is entitled to, and a deleted row cannot say a mistake
  was corrected.
- **You cannot warn yourself.** The level actions include a ban, so it is a way
  to lock yourself out with a restriction only somebody else can lift.
- **A deleted account cannot be warned.** There is nobody to receive it.
- **The cited post is re-read for its author** — in the page *and* the action.
  `?post=` is a URL parameter, and a warning citing somebody else's post is a
  record that says the wrong thing about what happened.
- **A level whose action this build does not recognise is dropped, not guessed
  at.** Configuration outlives code.

#### What is deliberately not here

- **Notifying the warned member.** F55 has no notification path; a warning
  currently appears on their record and nowhere else. Omitted rather than
  stubbed (D32).
- **Any screen for editing types or levels.** That is F66's, and the migration
  seeds a usable ladder so the feature works on a board nobody has configured.
- **Per-group warning limits** (MyBB's "maximum warning points per day"). It is
  F46's rate-limiting shape, not this feature's.

### D53 — The ModCP is rights-aware, and its one dangerous feature is gated twice (F54)

Phase 4 built the *acts*. What none of them built is the place a moderator goes
when nobody has handed them a link — and, more importantly, the place they find
out **what they have been appointed to**. Once F50 made "may lock threads" a
per-forum appointment rather than a checkbox on a group, a moderator's only way
to discover their own rights was to press a button and be refused.

#### Access is a grant *or* an appointment

`modcp.access` is a usergroup column and it is not the only route in: an
appointed moderator of one forum has work to do and no group grant. So the gate
is "holds `modcp.access` **or** moderates at least one forum", and the sections
inside are filtered by what that resolves to. A member with neither gets
`notFound()` rather than a 403 — the existence of the panel is not something to
confirm to somebody who may not open it, which is F48's answer for the queue.

The layout runs the gate and **every page runs it again**. A layout is not a
security boundary in the App Router: a page can be requested directly as an RSC
payload, and "the layout checked it" is exactly the assumption that turns into a
hole.

#### The log is an allow-list

`admin_log` is shared with the ACP (F63) and will grow rows for settings changes,
group edits and user merges. The moderator log therefore filters by a **named
list of moderation actions** rather than by excluding the administrative ones. A
row type added next year is invisible here until somebody names it — a
build-time omission that gets noticed, rather than a disclosure that does not.
The same applies to the `detail` JSON: only keys with a declared label are
rendered.

Scoping is in SQL, not in the rendering. A moderator of one forum sees that
forum's entries plus their own; filtering a board-wide feed afterwards is how a
count or a paging boundary leaks what it hid. Three cases fall out of that and
each is tested:

- **A move appears in both forums' logs**, because it happened at both ends
  (D49's rule, applied to the record of it).
- **A forum-less entry — a warning, an address lookup — is its author's business
  only.** Showing every warning on the board through the log would be a wider
  grant than the warn screen itself gives.
- **Your own acts stay visible in a forum you have since left.**

The forum an entry belongs to is read out of the detail JSON rather than from a
new column, because every moderation action already records the ids it touched
and a column on `admin_log` would mean the ACP's rows carrying a forum id that
means nothing.

#### The address lookup: gated separately, audited always, and honest about prefixes

It is the panel's only feature that reads personal data about somebody who has
done nothing wrong, and it is treated accordingly.

- **Its own permission**, not `modcp.access`. Seeing the queue and asking "who
  else posts from this address" are different powers; MyBB separates them too.
  It is held by staff groups only, because there is no per-group column for it
  and inventing one would mean a migration granting a power nobody has asked
  for.
- **Every lookup is logged, including the ones that find nothing.** A log that
  records only the productive lookups cannot answer "who has been going through
  the membership". The audit row is written *before* the caller sees the result,
  so no arrangement of failures returns matches without recording the request.
- **It searches prefixes and says so on screen.** F09 truncates every address
  before it is written, so there is no full address stored anywhere and no query
  that could match one. A moderator told "these accounts share an address" would
  act on a certainty the data does not support; told "these accounts share a
  range", they go and check. A `null` prefix matches nothing rather than
  matching every other `null` — a board that has not recorded an address for two
  accounts has not established that they share one.

**It is a GET that writes**, which is ordinarily wrong on this board (F32's
mark-read is a POST for exactly this reason). What is written is the audit row
*for having asked*, and a prefetcher firing it records a true fact: this
moderator's session requested this member's associations. Auditing only on POST
would leave a lookup you can perform without a trace by typing a URL.

#### F48's debt, paid

`Target.isForumModerator` has existed since F48 and was never set on a per-page
`can()` call, so outside the queue a per-forum appointee had only their group's
rights — `post.editOthers`, `post.softDelete` and both content-visibility
actions all read the flag and all saw `undefined`. F52 paid half of it inside
`Authorizer.forumIdsWhere`; `moderatorTargetFor` pays the rest, and the thread
page now builds every affordance on an appointment-aware target.

#### What is deliberately not here

- **Announcements.** There is no announcement model on the board at all — F30's
  row mentions them and nothing implements them. A ModCP section for editing
  something that does not exist is the stub D32 refuses.
- **A ban screen.** F23's mechanism is complete and has no surface; the roadmap
  puts bans in the ModCP, but a create/lift screen needs a member search that is
  F67's, and half of one here would be a second place that knows how to ban.
  Named in F54's row rather than half-built.
- **A separate ModCP password.** F63 gives the *admin* panel its own
  authentication step because an administrator can change the board. A moderator
  is already logged in as themselves and their powers are the ones the board
  grants them; a second password would protect nothing the first one does not.

### D54 — `@forum/db` is imported, not required (F04)

Three modules loaded `@forum/db` with a synchronous `require()` inside the
function that needed it — `container.ts`'s Postgres branch, `theme-runtime.ts`
and `settings.ts` — on the reasoning that fixture mode should never pull in
postgres.js. All three are now plain static imports.

**The reasoning was wrong, and the code was broken.**

Wrong, because importing the module opens nothing. `getDb()` creates its client
lazily and throws in fixture mode, so "building the container in fixture mode
must not open a socket" is a property of `getDb`, not of the import. What the
require actually bought was bundle size in a *server* bundle nobody downloads.

Broken, because Turbopack resolves `@forum/db` as an **async module** — its
graph reaches postgres.js — and a synchronous `require()` of an async module
yields the pending namespace rather than the exports. Every destructured binding
came back `undefined`, so the first call failed:

    TypeError: getDb is not a function

It was intermittent at build time (it depended on whether the chunk had been
awaited elsewhere first, which is why it read as flaky) and reliable at runtime.

#### Why it survived so long

**CI only ever built and ran `DATA_SOURCE=fixture`.** The fixture branch takes
none of the three paths, so none of them had ever executed anywhere — not in a
build, not in a test, not in a deploy. The Postgres path had never been booted.
That is also why the standalone image could not serve a Postgres board, and why
F04's "CI must boot the image" was the acceptance criterion that would have
caught it.

Guard `R2 no-lazy-require-of-db` now bans the pattern outright, probed both
ways, and the `image` job boots the web role against real Postgres — so the
regression has a test rather than a promise.

#### The thing this uncovered — now fixed

Running the operator CLI against a real server for the first time found a
second failure with the same shape: a path only PGlite had ever exercised.

    forum task:run counters.reconcile
    → The "string" argument must be of type string or an instance of Buffer.
      Received an instance of Date

**The cause is `drizzle()` itself.** Constructing a drizzle instance overwrites
postgres.js's serialisers for every date and timestamp OID — 1184, 1114, 1082
and friends — with a transparent passthrough, `(v) => v`. That is deliberate
and correct for the query builder: a *typed* column runs its value through
`mapToDriverValue` first, so postgres.js only ever receives a string.

It is wrong for a **raw `sql` template**, which is what most of `@forum/db`
writes. A bare value in a template gets drizzle's noop encoder, so a `Date`
arrives at the passthrough still a `Date`, and postgres.js calls
`Buffer.byteLength()` on it. Isolated with a probe: postgres.js accepts a
`Date` in every mode on its own, and stops the moment a drizzle instance exists
over the same client.

The fix is one function, `restoreDateSerialisers` in `client.ts`, applied after
each `drizzle()` call: it reinstates a serialiser that converts a `Date` to an
ISO string and passes everything else through untouched. That keeps drizzle's
intent exactly — a string still goes straight through, so the query builder is
unchanged — and repairs the ~50 raw-SQL call sites at once. Converting at each
call site was the alternative and was rejected: it is a sweep that the next
query silently opts out of.

#### Why 1,800 passing tests did not catch it

**Every database test in this repository runs against PGlite**, which does not
go through those serialisers and accepts a `Date` happily. F11's row has always
recorded PGlite as a substitution for real Postgres; this is the first time the
substitution actually cost something, and it cost the entire write path against
every real server.

So the fix comes with `client.pg.test.ts`: a suite that runs against a **real**
server, skipped unless `TEST_DATABASE_URL` is set — so an ordinary `pnpm test`
still needs no service — and switched on in CI's `migrations` job, which already
runs a Postgres. It is mutation-verified: removing `restoreDateSerialisers`
fails three of its five tests.

---

### D55 — Somebody needs to be told, and where that record lives (F55)

Three finished features were waiting on this one and each said so in its own
row: a failing scheduled task logged and raised nothing (F06), a report was
filed and closed with nobody told (F49), and a warned member found out by trying
to post and being refused (F53). What they were all waiting for was somewhere to
put "somebody needs to be told something" that outlives the request that noticed
it.

Five decisions shape what landed.

#### The record is the row, and the e-mail is a transport

`notifications` is written first, always, and the e-mail is a queued
consequence. That ordering is the feature: a notification exists on the board
whether or not a message was sent, whether or not it bounced, and whether or not
the member wanted one.

It also settles what a *preference* is allowed to turn off. The centre is the
board's evidence that a member was told, and a member who can erase that
evidence can later say they were never warned with the board's own data
agreeing — which is worse for the member too, because a moderator reviewing an
appeal has nothing to look at. So `notification_preferences` has one column,
`email`, and there is no on-site switch. Declining e-mail costs nothing, because
the record survives.

#### A notification stores captured facts, not pointers

`data` is a small JSON object written at raise time — a title, a points total,
a task id — and the *sentence* around it is applied on read by
`@forum/notifications`. The obvious alternative, storing a post id and reading
the post back when the centre renders, fails in exactly the case notifications
exist for: the post that caused the notification is frequently the post a
moderator has since deleted, and the warning behind one may have been revoked.
A record that changes when its subject changes is not a record.

Rendering late keeps the other half: wording can be reworded — or one day
translated — without a migration, and yesterday's notifications get the new
wording too.

The consequence is that **nothing in `render.ts` may throw.** Every input was
written by a *previous* deploy: a kind this build has removed, a `data` object
missing the field the current template reads, a number where a string is now
expected. All of it is reachable without anybody doing anything wrong, so the
readers fall back and the unknown-kind case has a defined output. A notification
centre that 500s on one strange row is worse in every way than one that renders
it flat.

#### Coalescing is a partial unique index over *unread* rows

The first notification this board raises with no human behind it is
`system.task_failed`, and a task failing on every tick would write 1,440 rows a
day per administrator with an e-mail behind each. So a raise may carry a dedupe
key, and while the row it produced is unread a second raise increments
`occurrences` and replaces the captured facts instead of inserting.

Three things follow, and each is deliberate:

- **It is an index, not a prior read.** Two raises arriving together would both
  pass a check — F49's argument for the duplicate-report guard (D48), reused.
- **A coalesced raise queues no e-mail.** The surviving row already carries the
  count, and one message per minute is the outcome coalescing exists to stop.
- **Reading the row starts a new one.** The index is partial on `read_at is
  null`, so an administrator who reads and clears an alert is told again the
  next time it happens rather than never again.

Warnings deliberately carry **no** dedupe key. Two warnings in a day are two
things that happened, and collapsing them would hide the second — which is
precisely the one that crossed a threshold.

#### The notification is a consequence of the act, not part of it

`WarningService` and `ReportService` each gained a one-verb port
(`WarningNotifierPort`, `ReportNotifierPort`), optional, whose failure is caught
and dropped. By the time either is called the warning or the closure is
committed, so a throw would unwind nothing and would report a successful
moderator action as a failed one.

The ports are narrow for D52's reason: handing either service the whole
`NotificationService` would let a later change reach `markAllRead` from inside a
moderation command. `ReportNotifierPort` earns its narrowness twice — D48's
private moderator note is not a field it can carry, so there is no version of
that call which leaks one.

The atomicity that *does* matter is inside the raise: the notification row and
its outbox row are written in one transaction, which makes "the board e-mailed
me about something my notification centre does not show" unreachable.

#### Mail is queued, and "themed" means what mail can actually carry

Nothing on a request path touches the mail driver. The raise writes
`notification.created` to the outbox, F07's relay turns it into a job, and the
`notifications.email` handler renders and sends inside the tick — where a
provider hanging for ten seconds costs a task's budget rather than a moderator's
action.

Delivery re-reads everything: the notification, the recipient, and the
preference. At-least-once delivery means the job may run long after the raise,
and somebody who switched e-mail off in between has said no more recently than
the raise said yes. `email_sent_at` is written *after* a successful send and
checked before one, which removes every duplicate except the one inside a crash
window — claiming before sending would turn a rare duplicate into a lost
message, which is the wrong trade for something a member is meant to read.

The HTML is assembled from tag literals plus `escapeHtml`/`escapeAttribute`
imported from `@forum/bbcode` — F36's safety argument and F36's actual
functions, not a second copy. The test asserts the same property F36 does: every
`<` in the output is one this package wrote.

"Themed" is the board's branding — its name, its links, and the accent colour it
actually runs, read from `themes.token_overrides` and validated a second time on
the way out, because `url(...)` inside a `style` attribute is why CSS in mail
has its own history. It is **not** the theme's stylesheet, and that is a limit
of e-mail rather than a shortcut: clients strip `<style>` and do not implement
custom properties, so a token cascade arrives as no styling at all. One resolved
colour travels; a cascade does not.

#### What is deliberately not here

- **A notification when a report is *filed*.** The recipient set is "everybody
  who moderates that forum", which is `moderatedForumIds` inverted — and
  inverting it correctly means resolving the forum matrix per *group*, not per
  actor, because a group-level approver who cannot view the forum must not be
  notified about it. That is a real piece of work and it is not this feature's;
  the reporter-facing half (`report.actioned`) is here because its recipient is
  one exact person. F49's row still names the gap.
- **Digests and subscriptions** (F56), **a no-login unsubscribe link** (F56
  again — it needs a signed token and a route, and a half-built one is worse
  than none), and **private-message notifications** (F60 has no tables). A kind
  named in the registry before it has a producer is a row on the preferences
  screen that can never fire, which is D32's rule about tasks applied to
  notifications.
- **Fixture mode has no notification store**, like every other writer since
  D38. The centre 404s there rather than showing an empty list that could never
  fill.

---

### D56 — Following something, and being told about it later (F56)

`thread_subscriptions` and `forum_subscriptions` have both existed since
migration `0000`. F39's composer has been *writing* thread subscriptions since
Phase 3 — the "subscribe to this thread" checkbox inserts a row — and nothing
has ever read one. This is the reader, plus the screen a member needs to see
what that checkbox has been doing on their behalf.

Five decisions.

#### `notify_via` was a channel; F55 settled channels, so it becomes a cadence

The column held `'none' | 'email' | 'notification'` — *how* to tell somebody.
F55 answered that board-wide and better: everything is recorded on-site, and
`notification_preferences` decides per kind whether an e-mail follows. A
per-subscription channel on top of that is a second answer to a settled
question, and the two would disagree the first time anybody changed one.

So the column is renamed and remapped to a **cadence** — `instant | daily |
weekly | none`, which is MyBB's own subscription type. Renamed rather than added
beside, because the alternative is a vestigial column that nothing reads and
everybody has to reason about. `'none'` survives unchanged: "I am following
this and do not want to hear about it" is a real thing to want, and it is what a
muted row on the management screen will mean.

#### Progress is a watermark, not a queue of pending rows

Each subscription carries the id of the last post its owner was told about.
"What is outstanding" is then a range query rather than a table to insert into,
drain, deduplicate and eventually sweep.

That is F06's catch-up rule applied to notification: a tick that never ran, or
ran twice, changes *when* somebody is told and never *whether*. A missed week is
one larger digest rather than a lost one. It also removes the worst version of
this feature: a pending-rows table has to be written inside the posting
transaction, one row per subscriber, on the board's hottest write.

Two details are load-bearing and both are mutation-verified:

- **The watermark is seeded on subscribe** from the target's current last post.
  Without it, following a 400-post thread produces a digest of 400 posts.
- **It is not reset when the cadence changes.** The upsert's `do update` touches
  `mode` and nothing else — a reset would mark three unread replies as told
  because somebody switched from daily to weekly, which is a notification lost
  to a settings change.

It is written with `greatest(...)`, so two runs racing cannot move it
*backwards* and re-deliver everything in between.

#### One runner, three cadences — and "instant" means "within a tick"

Instant, daily and weekly differ in how often the task fires and in how the
result is grouped. The work is identical, so it is one runner: three code paths
would be three places to advance a watermark wrongly, and advancing one without
telling anybody loses a notification permanently and invisibly.

Nothing fans out inside the posting request. A reply that notified its
subscribers inline would put an unbounded loop — one permission check per
subscriber — on the board's hottest write, and couple posting to the mail
provider being up. So "instant" is a task on the scheduler's shortest interval,
and the honest description is "at most a tick behind", which
`mybb-parity.md` records rather than glossing.

Instant mode raises **one notification per thread**, carrying F55's dedupe key.
Five replies to one thread while the member has not read the notification are
one row with a count and one e-mail — which is exactly what F55 built coalescing
for. Digests carry **no** dedupe key: two digests are two periods, and
collapsing this week's into last week's unread one would silently drop a week.

#### Permission is re-checked per member, at notify time

A subscription is not a standing grant. A forum can be made private, a group can
lose `canView`, a thread can be moved somewhere its subscriber cannot read — all
after the subscription was created, and all of them mean the member must not be
told what happened there.

So the notifier resolves the member's visible set through the Authorizer
(`VisibleForumSource` over `ActorBuilder` + `visibleForumIds`) and hands it to
the query. That costs an actor build plus F21's constant three reads per member
(D26), paid once per member per run. The alternative is a second answer to the
visibility question living inside a task, and F47's whole argument is that there
is one answer and one place it comes from. The pending read also goes through
`visibleIn(..., PUBLIC_CONTENT)` on both the post and its thread, so a held or
soft-deleted post can never reach a digest.

**The watermark still advances for content the member may no longer see.**
Deliberate: otherwise a subscription accumulates a backlog nobody will ever be
shown, and re-granting access a year later delivers all of it at once.

#### The unsubscribe link is stateless, and the GET does nothing

A digest arrives in a mail client, read by somebody who may not be signed in.
Requiring a login first is how a member who wants out clicks "this is spam"
instead — which costs the whole board's deliverability, not just their own mail.

So the link carries an HMAC over (who, what scope, which one), keyed by
`AUTH_SECRET`. No table, nothing to sweep, no window where a valid link exists
for a subscription that has gone. It cannot be revoked individually, which is
acceptable because of how little it grants: one act against one subscription,
no session, no read access. Somebody who intercepts one can stop a member being
notified about one thread — the same thing they could do by deleting the mail.

**The GET only shows a page with a button; the POST acts.** Mail clients,
security scanners and link previewers fetch every URL in a message, so a GET
that unsubscribed would mean members are unsubscribed by their own spam filter.

The digest's link uses a third scope, `email`, and that is a different act on
purpose: a digest covers many subscriptions, so "unsubscribe" cannot mean one of
them, and ending all of them would delete a member's follow list because they
wanted fewer messages. It switches subscription **e-mail** off and leaves every
subscription and its on-site notification standing — the distinction F55's
preferences screen already draws. The scope is inside the signed payload, so a
`thread` token cannot be edited into an `email` one (tested).

#### What is deliberately not here

- **A "notify me when somebody quotes me" kind** and the rest of MyBB's
  notification list: they need producers that do not exist yet, and a kind on
  the preferences screen that can never fire is the thing D32 forbids.
- **Per-forum digest cadence defaults** and a UserCP home for the screen —
  `/subscriptions` stands alone until F57 gives it one.
- **Fixture mode has no subscription store**, like every writer since D38, so
  the follow control and the management screen are absent there rather than
  broken. That is also why the browser suite still cannot cover any of this.

---

### D57 — The member's own settings, and making two constants real (F57)

The UserCP is two features wearing one name. There are the screens — profile,
options, security — and there is the *plumbing that makes what they save
matter*, which is the larger half and the one worth recording.

#### Two constants became settings, and that is the feature

`view/time.ts` has formatted every timestamp on this board in UTC since F29,
and the footer has said so out loud. `view/paging.ts` has held two numbers since
F40. Both said "F57" in their own comments. Shipping a timezone dropdown that
wrote a column nobody read would have been the hollow version of this feature —
the kind D32 refuses for tasks and F53 refused for an unsurfaced ban mechanism.

So `formatTime(at, now)` became `formatTime(at, now, zone)`, and the zone is
threaded through all eight view builders to the pages. The signature keeps a
UTC default, which is not laziness: a guest has no zone, the error pages have no
database, and the previous behaviour is exactly what those should keep.

Two things fell out of doing it properly:

- **`Intl.DateTimeFormat`, never an offset.** An offset cannot express summer
  time, so a stored `+01:00` is an hour wrong for half the year in most of
  Europe — and wrong in a way that reads as a broken *timestamp* rather than a
  broken setting. `isKnownTimezone` therefore refuses offsets **even though
  `Intl` accepts them**: ECMA-402 permits `+01:00` as a time zone and the
  constructor takes it happily, which the test suite pins.
- **"Yesterday" is computed in the viewer's calendar**, not by subtracting 24
  hours. On a day when the clocks change, a fixed 24 hours lands on the wrong
  date and the label says "Yesterday" about something two days old.

The page sizes are resolved *before* the read they bound, because the size is
the query's `limit` — a preference applied after the query would be a setting
that does nothing.

#### Preferences are read once per request, and are not on the Actor

`getViewerPreferences()` is `React.cache`d, like `getActor()`. A thread page
formats a timestamp per post, per breadcrumb and per page link; without the
cache the row would be read a dozen times.

They are deliberately **not** part of `Actor`. That object carries permissions
and group ids (F20), it is built by the authorization source, and it is cached
against `permission_version` — a member changing their timezone must not
invalidate a permission cache. Preferences change often and decide nothing.

Every failure path returns the board defaults. This is rendering: the worst
outcome of getting it wrong is a timestamp in the wrong zone, and taking a page
down for that would be absurd.

#### Six columns on `users`, not a preferences table

The same argument F53 made for its two restriction columns. Every one of these
is read on the page-render path for the signed-in member, there is exactly one
of each per account, and a join for a row that always exists is a join on every
page of the board.

The page sizes are **override-only** (`null` = follow the board), which is the
shape `settings` and `notification_preferences` already use: storing the board's
current number would freeze a member at whatever it happened to be on the day
they visited.

#### The password and the address re-authenticate; the address is two-step

Both are the account rather than a display preference. A session left open on a
shared machine is otherwise a full takeover: change the address, request a
reset, and the real owner is locked out of their own board.

A password change **revokes every session, including the current one**, and the
action then starts a fresh session for the device that made the change. That
combination is what everybody expects and nobody says out loud: signed in where
you are, signed out everywhere else. A change that left the attacker's session
alive would have done nothing at all.

The e-mail change writes nothing to `users`. The new address travels in the
`email_change` credential token's `payload` — a column F19 created and nothing
has used until now — and is adopted only when the link sent *to that address* is
followed, which is what proves somebody can read mail there. `adoptEmail` lets
the unique index arbitrate rather than checking first: an hour can pass between
asking and confirming, and a prior read answers a question about the past.

#### The confirm link acts on GET, and F56's unsubscribe link does not

These two look like the same thing and are governed by opposite rules, so the
difference is worth stating.

F56's unsubscribe link is a **bearer credential that arrives in an inbox**: a
scanner, a preview fetcher or a spam filter following it must not unsubscribe
anybody, so the GET only renders a button.

F57's confirmation link completes a change *the signed-in member initiated
minutes ago*, its token is single-use, and a guest who follows it is sent to
sign in rather than having somebody else's address confirmed by their browser.
Requiring a second click after they already clicked one buys nothing.

#### What is deliberately not here

- **A per-member theme picker.** The board ships one theme; a `<select>` with
  one option is a control that cannot do anything. It needs F78's second theme
  (and F68's manager) to mean something.
- **Invisible mode.** F75 owns the online list, and there is nothing for a
  member to be invisible *on* — a toggle whose only effect is a column nobody
  reads is the "never advertise a capability that is not there" rule D32 states
  for tasks.
- **Drafts** (F44 has no table) and **avatars/signatures** (F58, and a signature
  is BBCode, group-limited and moderated, which makes it a different feature
  from these three plain-text fields).
- **F55's and F56's screens are linked, not moved.** Both keep their URLs — an
  e-mail footer points at the preferences screen — and a member who bookmarked
  one should not find it gone. The UserCP is where they are *findable*, which is
  what F57 owed them.

### D58 — A field the operator invents, and the four places it has to be safe (F59)

**Plan:** "Typed custom fields with per-group visibility/edit/registration
requirements and themed profile/postbit slots."

F57 gave a member three fields the *board* decided on. F59 hands the same idea
to the operator, and the moment the field is operator-defined four questions
that F57 could answer in its own code become data: what type is it, who may see
it, who may change it, and is it asked at registration.

#### The per-group half is F21's shape, deliberately

`profile_field_groups` is a row per (field, group) with **nullable** `can_view`
and `can_edit`, where NULL means "inherit the field's default" — the same shape
`forum_permissions` has carried since F21, resolved by the same R4.2 rule that
any group granting is a grant.

That is not convenience. It is the model this board already resolves everywhere
else, so "who can see this" has one mental shape rather than two. It is also
what makes a single row useful: "staff may edit this" is one row saying
`canEdit: true` for the staff group, not a row per group with `false` copied
into every other one.

Viewing and editing are two booleans rather than one visibility word because
they are genuinely independent. A board can show a member's "how did you find
us" to everyone while letting only staff write it, and a board can collect
something only staff read — `editableFields` therefore does **not** require
`canView`, which is the one asymmetry in the resolver and is mutation-verified.

#### `Authorizer.applicableGroupRows` returns rows, never ids

The resolver needs to know which of a field's per-group rows apply to the
viewer, and F20/D13's lint rule says only `@forum/authorization` may reason
about group IDs. The obvious escape hatch — hand the caller `actor.groupIds` —
would end the rule in practice: every caller would then be free to invent its
own combination semantics, and one of them would eventually get "any grant is a
grant" backwards.

So the Authorizer gained a generic narrowing instead. It takes the caller's own
configuration rows, returns the subset this actor's groups matched, and hands
back no ids at all. `@forum/profile-fields` combines those rows by R4.2 without
ever learning who is in what.

Registration is the one caller with no actor to narrow by — an applicant is not
a member of anything, they are *about to become* a member of the board's
configured default group. `applicableGroupRowsForGroups` takes explicit ids for
exactly that case, and its ids must come from `AuthConfig`, never from an actor.
The lint rule still refuses the read that would make it an escape hatch.

#### A value is attacker-controlled text on a page other members read

Four rules in `service.ts`, each of which exists because of what a field value
*is*:

- **A submitted field id is never trusted.** The save path resolves what this
  actor may edit and writes only that, so posting somebody else's staff-only
  field writes nothing — and is *dropped silently* rather than refused, because
  an error naming the field would confirm the field exists.
- **A `select` value must be one of the configured options.** Otherwise the
  field is a free-text box wearing a dropdown.
- **A `url` is normalised to http(s) or refused.** A profile field rendered as
  a link is an attacker-controlled `href`; `javascript:` in one is the oldest
  stored-XSS vector there is. Same argument F36 makes about `[url]` and F57
  makes about the website field. A bare `example.com` gets `https://` rather
  than a refusal, because nobody types the scheme.
- **A value reaches the theme as plain text.** `PostAuthorModel.fields` and
  `MemberProfileModel.fields` are `{label, value}` strings; no theme inserts a
  member-supplied value as markup, which is F33's rule applied to a new source.

An **unknown type validates and renders as text** rather than failing. The field
was written by a deploy that knew a type this build does not, and refusing every
save until somebody upgrades would let a downgrade lock members out of their own
profile. Same reasoning as F55's rule about rows written by a previous deploy.

#### An emptied field deletes its row

`profile_field_values` stores an answer only once somebody gives one, and
clearing one deletes the row rather than writing `''`. Otherwise every read on
the board would have to treat "empty string" and "no row" as the same thing, and
one of them would eventually forget. Both halves happen in one transaction, and
the write is an upsert, so pressing Save twice after a slow response is the same
as pressing it once.

#### Registration validates before the account exists, and writes after

`validateRegistration` returns the values to write without touching the
repository; `applyRegistration` writes them once `identity.register` has
returned an id. The split is what lets the form refuse a registration before it
creates anything — refusing *after* would leave a member the board considers
incomplete, with no screen that insists on it.

The two are not in one transaction, because there is not one to join:
`register` owns its own. The failure that remains is a usable account with an
unanswered required field, recoverable from the UserCP. The reverse — an answer
with no account — is recoverable by nobody.

#### Reads are unfiltered SQL, and the filtering is a pure function

`listFields` and `listGroupRules` return *everything*; resolution happens over
rows the Authorizer has already narrowed. Filtering visibility in the query
would mean the repository deciding who may see what — a second answer to a
question F20 and F21 already own, expressed in a different language, in a place
the permission tests cannot reach. Both tables are configuration-sized, so
reading them whole costs one small query each.

The rules are read once per request (`React.cache`), because a thread page
resolves fields for every distinct post author's postbit and board configuration
cannot change mid-render.

#### What is deliberately not here

- **No ACP screen.** F71 owns it. Until then `profile-field:list|add|remove` is
  the operator surface, built over the same `ProfileFieldService` the screen
  will use — F13's thin-layer rule, so the CLI cannot write a field the ACP
  would reject.
- **No per-group editor at all**, in either surface. The CLI creates a field
  with its defaults; `profile_field_groups` rows are the ACP's job, and a flag
  soup for expressing "staff may view but not edit" on a command line would be
  a worse UI than waiting for F71. The `profile-field:add` output says so
  rather than leaving it to be discovered.
- **No search or sort by field.** F62 owns search, and a field is not indexed
  for it.
- **No file or date types.** A file is F42's problem (and its runtime
  dependency); a date needs a timezone answer per field, and F57's board-wide
  one is not obviously right for "when did you join the clan".

### D59 — A message stored once, and the four things that follow (F60)

**Plan:** "No-JS private messages: multiple recipients, folders/tracking/
receipts/quota/forward/reply/mass actions/reporting."

#### The message is stored once; each participant owns a copy

MyBB stores a row *per copy*: the sender's Sent Items and every recipient's
Inbox each hold the full subject and body, so a message to twenty people is
twenty copies of the text and re-rendering one is twenty writes.

Here `private_messages` holds the content and `private_message_copies` holds a
small row per person — folder, role, read time. Four things follow from that
single decision, and they are the feature:

- **Quota counts copies**, which is the thing a member can actually delete. A
  quota over duplicated bodies counts something the member never sees.
- **F36's render cache works unchanged.** The body carries `message_html` and
  `render_version` exactly as `posts` does, so bumping `RENDER_VERSION` for a
  renderer security fix invalidates private messages too, on the next page
  load, with no migration and no second code path anybody has to remember.
- **Deleting your copy cannot reach into somebody else's mailbox.** The message
  row is deliberately left behind while anybody still holds a copy; a message
  nobody holds is an orphan, and pruning orphans is F70's job rather than a
  cascade nobody can see coming.
- **A unique index on (message, owner)** makes one person holding two copies
  impossible — which is what lets the service dedupe recipients rather than
  handle a duplicate, and why sending to yourself is *refused* rather than
  modelled as a second row.

The cost is a join on every listing, which the two indexes exist for.

#### Ownership is part of the query, never a check on the result

Every read and write in `PostgresMessageRepository` carries the acting member's
id in its `where` clause. There is no shape in the file that fetches a message
and then decides whether the caller should have it — that works until somebody
moves the filter, and the failure is silent and total.

It is what makes the bulk actions safe: the ids in the form are copy ids anybody
can post, and a copy id from another mailbox matches nothing rather than being
caught. Mutation-verified in both directions — dropping `owner_user_id` from the
update, and treating an empty selection as "all of them".

`forReport` is the single exception and is discussed below.

#### Staff cannot browse private messages; a report opens exactly one

Reporting is the only way a moderator ever reads a private message, and F60 adds
`private_message` to F49's target kinds to say so in the type system.

Three things make it narrow. `resolveTarget` gained a `reporterUserId`
parameter, used by exactly this one branch: **a private message "exists" only
for somebody who holds a copy of it**, so reporting a message you were not sent
gives the same answer as reporting one that is not there. The report carries no
forum, so it routes to `modcp.access` like a member report rather than to some
forum's staff. And the queue screen fetches the reported bodies *by id*, for the
reports on that page only — there is no listing, no search, and no way to reach
the message beside it.

The body is shown as **source, as plain text**, not as rendered HTML: a
moderator deciding what somebody sent should see what they typed, and a staff
screen gains nothing from a second rendering surface for attacker-controlled
markup.

#### Bcc is enforced in SQL, not in the caller

A bcc recipient is visible to the author and to themselves, and to nobody else.
The folder listing does that filtering **inside the lateral aggregate** that
builds the counterparty column, so no listing path can forget it; `detail`
returns every participant unfiltered and the *service* applies the same rule,
because who the viewer may see is a domain decision rather than a query one.

Both are mutation-verified, because this is the kind of leak that is invisible
until somebody notices they were named.

Reply therefore addresses **the author only**, never the other recipients.
"Reply all" would let somebody who was bcc'd reveal themselves by accident, and
a reply that quietly grows its audience is not what the button promises.

#### Quota is storage; the existing permission was a rate

`maxPrivateMessagesPerDay` has existed since F22 and caps *sends per day*.
`privateMessageQuota` is new and caps how many a member may **keep** — which is
what a full inbox means. Both are global numerics, so the F22 forum matrix is
untouched.

The check runs for the sender and for every recipient before anything is
written, and the send is **all-or-nothing**: a message to five people where one
is full sends to nobody. Partial delivery would leave the sender with a Sent
copy claiming it went somewhere it did not.

A full recipient is **named**. Their full box is not a secret worth keeping
against the alternative — a sender who believes a message was delivered and a
recipient who never sees it.

Trash counts toward the quota. That is what makes "empty your trash" the actual
remedy rather than a gesture, and it stops the trash being an unbounded second
mailbox.

#### `Authorizer.globalLimit`, because a limit is still a permission

`@forum/messages` knows nothing about groups (F20), so "may they receive" and
"how many may they keep" are asked in the app's `MessagePolicy` — through
`can(actor, 'pm.use')` and a new `globalLimit(actor, 'privateMessageQuota')`.

The accessor exists for the same reason `flood.bypass` is an *action* rather
than a permission field read at the call site: group and permission reasoning
does not leave that package (R4), and a caller that reaches into `actor.global`
for one number will reach in for a boolean next. It returns the value already
combined by R4.2's rule for numerics — MAX, with 0 meaning unlimited — and its
key type is *derived* from the registry, so a field that stops being numeric
stops compiling at its call sites.

Administrators are deliberately not special-cased: a limit is not a gate, and
the seeded ladder already gives staff groups 0.

#### What is deliberately not here

- **Custom folders.** Three system folders (inbox, sent, trash). MyBB's
  user-defined ones need a management screen and a move-to picker over an
  unbounded list; the three below are what makes the feature work.
- **Drafts.** F44 owns them and has no table. A drafts folder here would need
  the recipient list stored before a message has one — a different shape, for a
  different feature.
- **Message search.** F62 owns search.
- **"Reply all"**, for the bcc reason above.
- **Attachments on a message.** F42, and its runtime dependency.
- **An ignore list.** F61 depends on this feature and owns the PM block.

### D60 — Ignoring hides a body, it does not remove a post (F61)

**Plan:** "Server-side ignore (reveal link, PM block, stable pagination/counts)
and online buddy state."

#### One table with a `kind`, because the two lists are exclusive

You cannot both follow somebody and refuse to read them. Two tables would make
that a cross-table check nothing enforces; one row per ordered pair with a
`kind` makes it the **primary key**, so moving somebody between the lists is an
upsert rather than a delete-then-insert that can half happen.

The pair is ordered and asymmetric. `(me, them)` is my opinion of them and says
nothing about theirs of me — a board where ignoring were mutual would let
anybody silence themselves in somebody else's eyes by ignoring them first.

#### Why the post stays in the page

The obvious implementation filters ignored authors out of the post query. Doing
that gives every viewer a different page size, makes "#12" mean different posts
to different people, lands permalinks on the wrong page, and leaves the thread's
reply count disagreeing with what is on screen. F61's acceptance names *stable
pagination and counts* for exactly this reason.

So the post keeps its place and its number, and the **body is withheld
server-side**: `bodyHtml` is empty, the signature and custom fields are gone,
and the quote link is not offered. A theme renders a placeholder and a reveal
link. "Ignored" that ships the text to the browser and hides it with CSS is a
preference, not a feature.

Reveal is **per post and additive**, carried in the query string. Per post,
because revealing one reply should not undo the whole feature for that thread;
additive, because working down a thread should not re-hide what you just chose
to read. It is a GET because revealing changes nothing.

Your own post is never hidden: you can end up ignoring somebody you have quoted,
and hiding your own words back at you is nonsense.

#### Staff cannot be ignored

A moderator's post is often the one that says why a thread was locked, and a
member who has hidden it will read the lock as arbitrary. The refusal is
explicit rather than silent — somebody who believes they have hidden a moderator
and has not is worse off than somebody who was told.

Whether somebody is staff is `modcp.access`, resolved by the Authorizer in the
app and handed to `@forum/relations` as a boolean (F20). It is asked only when
somebody is about to be *ignored*, so an ordinary page render never pays for it.

#### The PM block gives the same answer as a permission refusal

A recipient who ignores the sender refuses the message with the **same wording**
as "your group cannot receive private messages". Naming the ignore would make
F60's send path an oracle for somebody's list, and a list that announces itself
is one people stop using.

MyBB's alternative — accept the message and deliver it nowhere — is worse than
either, because the sender believes they were heard.

The block is asked in the app's `MessagePolicy`, and a *failed* read answers
**true**: an ignore that could not be checked must not be a message that gets
through, because the member cannot see that it happened. A board with no
relation store answers false, which is the right direction for a permissive
answer whose source is missing.

#### `users.last_active_at` had no writer until now

The column has been in the schema since `0000`, read by the ModCP and by the
profile and **set by nothing**. F61's online buddy state is the first feature
that needs it to be true, so `touchLastActive` gives it one — a conditional
UPDATE whose throttle is the WHERE clause, exactly as `touchLocation` does it,
so a burst of page views is one write and no caller can forget to throttle.

It is called from the page shell, which means a *prefetch* counts as activity.
Accepted: a prefetch means the member has the board open, which is what "online"
is meant to convey.

The throttle (5 minutes) is deliberately shorter than the online window (15).
With the two equal, somebody who kept the board open would flicker offline for
the last moments of every interval.

#### What is deliberately not here

- **A board-wide online list.** F75 owns it. `ONLINE_WINDOW_MINUTES` lives in
  `@forum/relations` because that is the only consumer today; when F75 arrives
  it should take the constant, not declare a second one.
- **`PostAuthorModel.isOnline`.** Still `false` for every post: filling it needs
  `last_active_at` per author in the post query, and the buddy list is what F61
  actually promised.
- **Ignoring a thread or a forum.** F56 is where "stop telling me about this"
  lives, and it is a different verb from "I would rather not read this person".

### D61 — F58 ships its signature half; the avatar half is F42's (F58)

**Plan:** "Safe avatar upload/remote URL and group-limited, moderated signature
BBCode; no SSRF/tracking vector."

**Implemented:** the signature half in full. The avatar half is **not built**,
and the reason is the acceptance criterion itself.

An avatar is one of two things. An **upload** needs the route-handler FileStore
path, magic-byte validation, re-encoding and quota — which is F42, and F42 is
blocked on a runtime-dependency decision (`sharp` breaks `next build` at
prerender; see `progress.md`). A **remote URL** looks like the cheap way round
that, and it is not:

- Rendered directly, it is a **tracking vector**: every member who loads a
  thread page reports their IP address and user agent to whoever hosts the
  image, chosen by another member. F58's own acceptance forbids this.
- Fetched and cached server-side, it is **SSRF**: a URL controlled by a member,
  fetched by the board, is a request to `169.254.169.254` or to an internal
  host away from being a serious problem.

Both mitigations end in the same place — validate, fetch, re-encode, store —
which *is* F42. So the honest position is that the avatar half has one
dependency and it is not built yet, rather than a remote-URL field that quietly
fails the acceptance criterion it was written against. Omitted rather than
half-built (D32). `MemberProfileModel.avatarUrl` and `PostAuthorModel.avatarUrl`
stay `null`, as they have been since F27.

#### The signature half, and the one decision in it

**A restricted tag registry, not a validator.** The obvious implementation
refuses a signature containing `[img]`. This one renders it with a registry that
has no `img` in it, so the tag comes out as literal text. Better twice over: it
cannot be bypassed by a tag this build does not know about, and it degrades — a
member pasting an old signature gets most of it rather than an error.

F37 built `ParseOptions.tags` for custom tags; this is that seam used as
designed rather than a special case cut into the renderer.

What is left out is `img`, `quote`, `size`, `code` and `list`, and every
omission is the same argument: **a signature repeats under every post its author
has ever made.** A remote image there is the tracking vector D61 opens with,
multiplied by the length of the thread.

**The limit applies to the raw source**, not the rendered HTML: a member types
BBCode, and a limit they cannot count against is one they cannot work with. It
also means a renderer change can never retroactively push somebody over.
`maxSignatureLength` (a group permission since F22, with nothing reading it
until now) is capped by a hard ceiling, because 0 meaning "unlimited" for a
string that renders under every post still needs a bound.

**Moderation is a lock, not a delete.** An emptied signature can be retyped the
next minute and says nothing about why. A locked one keeps the text — so an
appeal can see what was actually there — stops it rendering, and stops the
member editing it, with a reason the member is shown on their own screen. The
lock is enforced in the UPDATE's `where` clause rather than by a prior read,
which closes the race where a moderator locks a signature while the member has
the form open.

It is gated on `user.warn` rather than a new permission: both are aimed at a
*person* rather than a forum's content, and a board that trusts somebody to warn
a member trusts them to stop that member's signature.

### D62 — Two rate limits, two mechanisms (F62)

**Plan:** "PostgreSQL rate-limited reputation with comments, settings/per-group
limits, history, and recomputable total."

#### The uniqueness is an index; the rate is a count

They are different shapes and get different mechanisms, and saying so is the
point of this entry.

*One rating per person per target* is **uniqueness**, so it is a partial unique
index — two clicks arriving together both pass a check-then-insert, and a
reputation button that adds a row per click is the cheapest way to inflate a
total. There are two indexes rather than one, because rating somebody's *post*
is a different statement from rating *them*: a board that collapsed the two
would silently overwrite one with the other. Re-rating **updates** the row, so
changing your mind is supported rather than being a way to stack points.

*At most N a day* is a **window**, which no index expresses. It is a count
inside the writing transaction, and its residual race is stated rather than
hidden: two concurrent inserts can both see N−1 and both commit, so the real
ceiling is N+1 for somebody scripting it. That is a rate limit, not a
permission, and being one over is not a security event.

Revising an existing rating does **not** spend an allowance. Making a correction
cost one would push people to leave a wrong rating alone, which is the opposite
of what a cap is for.

#### The total is derived, never incremented

`users.reputation` has existed since `0000` with no writer. It gets one here,
and it is recomputed from the live rows inside the same transaction as anything
that changes them — the same decision F53 made for `warning_points`, for the
same reason: an incremented total cannot survive a rating being revised or
withdrawn, and drifts silently when it does. A test corrupts the column and
watches the next write repair it.

`recount` is exposed on the repository rather than kept internal, because F70's
Recount & Rebuild needs it.

#### A refused negative is not a silent positive

On a board with negative ratings off, a submitted `-1` is **refused**. Clamping
it to `+1` would turn a criticism into praise, which is the worst possible
reading of somebody's intent.

Related, and found by a test: `parseRating('')` was returning `0`, because
`Number('')` is zero and zero is a *valid* rating. A form posted with no value
would have recorded a neutral rating. The empty-string guard is not decoration.

#### `reputationPower` is deliberately absent

MyBB has a per-group multiplier: a moderator's vote is worth more. It cannot
obey R4.2's numeric combination rule — MAX with 0 meaning unlimited — because
"unlimited power" is meaningless and a multiplier is most permissive at its
*largest* value with no unlimited state at all. Same shape as the
`searchfloodtime` problem already recorded in `mybb-parity.md#flood-intervals`,
and the same answer: leave it out rather than invert the rule for one field.

#### What is deliberately not here

- **A reputation leaderboard.** F75 owns board statistics.
- **Reputation-gated permissions.** A permission model with two sources of
  truth — groups and a number members award each other — is one nobody can
  reason about.
- **Notifications on being rated.** A producer exists, but the kind would fire
  on every rating on a busy board; it belongs with a per-kind digest, which
  F55's registry has no shape for yet.

### D63 — The ACP is a separate surface, not a page with a permission check (F63)

**Plan:** "Separate `/admin` auth/layout, optional IP allowlist, re-auth for
destructive operations, and actor/IP/payload admin log."

#### A second session, not a second account

Entering `/admin` asks for the password again and mints a session in
`admin_sessions`, separate from the board session and much shorter.

The threat is not an attacker guessing a password — they would need the board
password anyway. It is **an administrator's own browser being used by somebody
else**, or their board session being stolen. A board session lasts days by
design (F17's remember-me is thirty), and an ACP session that inherited that
would make a laptop left open in a café a board takeover rather than an
embarrassment.

The separation is what lets the ACP's idle timeout be thirty minutes: expiring
it signs somebody out of `/admin` and nothing else, so the cost of being wrong
is one password entry rather than a lost draft. There is also an **absolute
eight-hour ceiling**, because an idle timeout alone is defeated by a page that
polls.

A password change revokes ACP sessions too. F57's `changePassword` revokes every
*board* session; the ACP ones live in a different table and would otherwise
survive — which would mean a password change failed to close the one session
that matters most. Done in the app rather than in `@forum/accounts`, which has
no idea the control panel exists.

#### Two clocks, and only one of them moves with activity

`last_seen_at` is extended by activity; `authenticated_at` is moved **only** by
re-entering the password. `requireFreshAdmin()` reads the second.

That separation is the entire re-authentication mechanism. Browsing the panel
for an hour keeps the session alive and does *not* keep the proof fresh, so
"delete every post by this member" asks again even though nothing expired. A
single timestamp would make the two indistinguishable, and the natural
implementation — extend it on every request — would mean the proof was never
stale for anybody actually using the panel.

Mutation-verified in both directions: a `touch` that also writes
`authenticated_at`, and a service that drops the freshness check.

#### The allowlist is env, and is checked first

**Env rather than a board setting.** The allowlist defends against a stolen
administrator credential; storing it somewhere that credential could edit would
defeat it. It is also the one control an operator wants to survive a database
restore.

**Prefixes, not CIDR.** A mask is a thing operators get wrong by one bit,
silently, and the failure mode is being locked out of your own board.
`203.0.113.` is something you can read back and be sure about. A whole address
with no trailing dot matches exactly — mutation-verified, because treating every
entry as a prefix would make `198.51.100.7` admit `.70` through `.79`.

**Empty allows everything**, because the feature is optional by acceptance and
"unset means nothing is allowed" turns forgetting to configure it into a board
nobody can administer. But a *missing* address with a non-empty allowlist is
**refused**: if the deployment cannot say where a request came from, an
allowlist cannot do its job, and ignoring it would make the whole feature
theatre.

The address is read from the **left-most** `x-forwarded-for` entry — everything
after it is the proxy chain, and taking the last one would match the proxy's own
address and admit the internet. Mutation-verified.

**It is consulted before anything else**, including before the board session is
read and before the store is resolved. A request from outside the allowlist must
not learn whether there is a control panel here, who is signed in, or whether
they would have been admitted. The ordering is pinned by a test in which a
*guest* from a blocked address gets `address` rather than `permission` — an
administrator would report `address` either way, so only the guest case pins it.
That test was written *after* mutation testing showed the first version did not.

The full address is used for the comparison and never stored. F09's rule is
about what is written down; an allowlist matched on a truncated prefix would
admit a whole /24 nobody configured.

#### Two denials answer with a 404

`address` and `permission` render as not-found rather than as a message. The
whole value of an allowlist is that the panel is invisible from outside it, and
a member without `admincp.access` learning that `/admin` exists gains nothing
but a target. `signin` and `unavailable` are answered honestly, because by then
the requester has already been admitted by both earlier gates.

#### `admincp.access` is still the one door no bypass opens

Unchanged from F20/D12, and now load-bearing: `ADMIN_ALWAYS` omits it, so an
administrator's bypass cannot force-grant it and the explicit `canAccessAdminCp`
column decides alone. A super-moderator's bypass is forum-scoped, and
`admincp.access` is not in `FORUM_SCOPED` either. Both are tested here as well
as in the authorization package, because this is where it now matters.

#### The log had writers and no reader

`admin_log` has existed since `0000` and has had *writers* since F48 — every
moderation action records a row. What it never had was a **reader outside the
ModCP's forum-scoped view**. F63 supplies the unscoped one: an administrator
reading the audit log is reading everything, which is the point of there being
one. The forum filtering in `modcp-repo.ts` exists because a moderator may only
see their own forums; that constraint has no analogue here.

Three details. The detail column is rendered as **plain text**, flattened to
`key value, key value` rather than JSON, because an audit row is read by a
person under time pressure. A row whose `detail` is not an object — written by a
previous deploy, or by a plugin (F69) — degrades to empty rather than failing
the page, since an audit log that will not open is absent exactly when it is
needed. And `assertLogAction` refuses free text, because the log is read by
grouping on `action` and a value with a member's name in it makes the column
useless.

`recordAdminAction` **never throws**. An action that succeeded and failed to log
is worse reported as a failed action — the caller would retry, and the second
attempt is the one that does damage. The failure goes to the process log, which
is where an operator looks when the audit log has a hole in it.

#### The cookie has its own name, path and SameSite

`fs_admin`, `Path=/admin`, `SameSite=Strict`. The path means the browser does
not send it with ordinary board requests at all. Strict means a cross-site
request cannot carry ACP authority — there is no legitimate reason to arrive in
the control panel by following a link from another site, which is exactly why
the board's cookie is `Lax` and this one is not.

`__Host-` requires `Path=/`, so the ACP cookie deliberately forgoes the prefix
and takes path scoping instead. That is the better trade for this cookie: the
prefix defends against subdomain injection, the path defends against the whole
board's attack surface.

#### What is deliberately not here

- **Every other ACP screen.** F64–F71 each bring their own; the index lists only
  what exists, and names the rest without linking. A panel advertising nine
  links to nine 404s would be worse than one that admits it is new (D32).
- **A separate admin account model.** MyBB has none either, and a second
  credential to forget is a second credential to reset.
- **Rate limiting the ACP password form.** Reaching it already requires a valid
  board session *and* `admincp.access`, so the attacker is already inside; the
  failed attempt is logged instead, which is the more useful signal. F19's
  lockout still governs the board login that gets them there.

---

### D64 — Every gate resolved `@forum/*` without a package.json (F01)

`packages/admin` shipped in F63 **without its manifest**. A `cat >` heredoc ran
with the working directory left at `packages/db`, so the file landed at
`packages/db/packages/admin/package.json` and was committed there.

What makes this worth an entry is not the typo. It is that **the entire verify
pipeline passed**: 2,457 tests, both typechecks, ESLint, dependency-cruiser and
a production `next build`. The defect would first appear on the next clean
`pnpm install --frozen-lockfile` — which is CI, and every new checkout, and
nowhere a person working in an already-installed tree would look.

The reason is one line in `tsconfig.base.json`:

```json
"@forum/admin": ["packages/admin/src/index.ts"]
```

Every gate this project runs resolves `@forum/*` through the path aliases,
which point at `src/index.ts` directly. **None of them consults a
`package.json`.** Vitest resolves through the same aliases, dependency-cruiser
reads the same tsconfig, and Turbopack is given the same paths. The manifest's
only reader is pnpm, at install time, and install had already run before the
directory existed.

So the tree had two disagreeing definitions of "what packages exist" — the
tsconfig aliases and the pnpm workspace — and nothing compared them.

#### The check compares them

`scripts/workspace-check.mjs`, first in `verify`:

1. every `apps|packages|themes` directory that has a `src/` must have a
   `package.json` (a directory with neither is somebody's scratch space, not
   our business);
2. every `workspace:` dependency must name a package that actually declares
   that name;
3. every non-wildcard `@forum/*` alias in `tsconfig.base.json` must point into
   a directory that is a real workspace package.

Removing the restored manifest fails all four ways at once — the missing
package, both dependents that name it, and the dangling alias — which is the
mutation proof (D10). It does not shell out to pnpm: it runs on every change,
so it has to be milliseconds.

#### Why it runs first

`verify` is ordered cheapest-and-most-fundamental first. A tree whose package
graph is wrong should not spend four minutes proving its tests pass; the tests
are being resolved by the very mechanism that is hiding the fault.

#### What it deliberately does not check

Version ranges, licence fields, or whether a `dependencies` entry is actually
imported. dependency-cruiser owns the import graph and already fails on an
undeclared cross-package import. This check owns exactly one question: **do the
two definitions of the workspace agree?**

---

### D65 — An upload is made safe by being re-encoded, not by being validated (F42)

The single idea F42 is built around, and the reason its lifecycle looks the way
it does.

**Validation establishes what a file claims to be.** Magic bytes say the first
eight bytes look like a PNG. They say nothing about the ZIP appended after the
`IEND` chunk, the payload in an EXIF block aimed at whichever decoder opens the
file next, or the GIF/JavaScript polyglot that is simultaneously a valid image
and a valid script. Every one of those passes every check, because the file
genuinely *is* a valid image.

**Re-encoding establishes what a file is.** Decode to raw pixels, encode from
those pixels, store the encoder's output. Nothing of the original survives —
`codec.test.ts` appends a payload to a real PNG and proves it is absent
afterwards. ADR 0003 is where the codec choice is argued; this is what it is
for.

#### The lifecycle follows from that

An upload lands as `pending` with its bytes under `source_key`. A queued job
decodes, re-encodes, writes the result under `storage_key`, and only then is the
row `ready`. `markReady` swaps both keys in one statement, so **no row ever
points at both the uploaded bytes and the safe ones**, and the download path
refuses anything that is not `ready` — which means what a member uploaded is
never served, in any state, to anybody.

A file the board cannot re-encode has no source phase: a PDF or a ZIP is stored
once and is `ready` immediately, because there is no transformation to wait for.
What is promised about those is narrower and is stated as such — served with
`Content-Disposition: attachment`, `nosniff`, and a sandboxing CSP, never
rendered inline.

#### Why the decode is not on the request path

A condition of ADR 0003, not an implementation detail. The request reads
*headers* — magic bytes and declared dimensions — which is bounded work on a
bounded prefix. It never allocates a bitmap.

That distinction is what `dimensions.ts` exists for, and it is not a
micro-optimisation. **A 30,000 × 30,000 PNG is about 90 KB on the wire and 3.6
GB decoded.** The ratio between file size and decoded size is unbounded, so no
size limit catches it; the defence is to read the dimensions out of the header —
which both formats put near the front and neither compresses — and refuse before
allocating anything. An image whose header cannot be *read* is refused too,
rather than handed to the decoder to find out.

#### The order of writes, and why there is an orphan table

`remember key → put object → create post → insert row → forget key`.

Every step can be the last one. The invariant that has to survive a process
dying anywhere in that sequence is **no object in the store without something
that knows about it**. Inserting the row first would leave a row pointing at
bytes that were never written; putting the object first without recording the
key leaves bytes nobody can name.

So `attachment_orphans` records a key *before* its object exists and drops it
when a row takes ownership. What remains after the grace period is garbage by
construction rather than by inference — and "which objects does nothing own" is
an indexed query on a small table instead of a full bucket listing that is wrong
the moment an upload is in flight.

The grace period is what makes the sweep safe at all: without it, the sweep
would race every upload in flight and delete the bytes out from under it.

#### Two permissions, and the visibility check that is easy to miss

`attachment.upload` and `attachment.download` are separate — a board may let
everybody read a thread and only members fetch its files — so F22's matrix grew
a twentieth column (640 cells). The download path additionally refuses an
attachment on an unapproved or deleted post to anybody who cannot see the
content itself. That check lives in the download route and not in the postbit,
**because a direct URL never goes through the postbit**, which is exactly how
this class of check gets missed.

Every refusal is the same 404 with no reason. The id is a small integer anybody
can enumerate, and distinguishing "no such attachment" from "not for you" would
make the route an oracle for what exists in forums the caller cannot see.

#### What is deliberately not here

- **No avatars.** F58's other half, and next — the machinery it was waiting for
  now exists.
- **No attachment administration.** F71 owns it. Until then the type list is a
  constant, which is the honest state: an operator cannot be given a switch for
  a format nothing can process.
- **No re-encode of GIF or WebP.** Each is another codec and another ~200 KB of
  WebAssembly, and an animated GIF flattened to one frame is worse than a
  refusal.
- **No attachment on a private message.** F60's tables have no join to
  `attachments`, and a quota that counts copies would have to count bytes too.
- **No progress, no drag-and-drop, no per-file removal before posting.** All
  three are F45's islands, and all three must be enhancements over the one-form
  path rather than replacements for it.

---

### D66 — The browser suite brings its own Postgres (F11/F39)

Since F39 the browser suite has covered **reading only**. `plan-status.md` said
so on every feature row that followed — posting, inline moderation, private
messages, reputation, the UserCP, attachments — and the number of features
behind that sentence reached ten before it moved.

It did not move for a specific reason, and it is worth naming because it is the
reason a lot of test gaps stay open: the obvious fix was "run the suite against
Postgres", and that meant a service somebody has to install. **A test path that
only exists in CI is one nobody runs before pushing**, so it would have been
written once, gone red on a Tuesday, and been marked `continue-on-error` by
Friday.

#### What it runs against

`e2e/support/database.ts` starts PGlite — the same Postgres-compiled-to-WASM
build the integration suite has trusted for a hundred-odd files — and puts
`@electric-sql/pglite-socket` in front of it, which speaks the Postgres wire
protocol on a TCP port. `next dev` connects with an ordinary `DATABASE_URL` and
cannot tell the difference. Nothing to install, and CI runs exactly what a
developer runs.

It is a **devDependency for test infrastructure**, in the class `@playwright/test`
and `@electric-sql/pglite` are already in, and not a runtime dependency: nothing
under `apps/` or `packages/` imports it, and no shipped artefact contains it.
Invariant 2's ADR requirement is about what the board runs in production.

#### One connection, and why that is not tuning

`maxConnections: 1`, and `DATABASE_POOL_MAX=1` on the app.

A real Postgres gives every connection its own backend process and with it its
own *unnamed prepared statement* — which is what `prepare: false` (the setting
`client.ts` uses, and must, for transaction-mode poolers) makes every query go
through. PGlite is one backend behind however many sockets, so two connections
using the unnamed statement overwrite each other's parameter lists. What comes
back is `bind message supplies 1 parameters, but prepared statement "" requires
2`, which reads like a driver bug and is really two clients sharing a backend.

A second connection is queued instead. The suite runs one worker, so this costs
nothing.

#### The seeded board is the fixture board

The same `SEED_FORUM_ROWS`, `SEED_THREAD_ROWS` and `SEED_POST_ROWS`, inserted
into real tables. One board definition, two stores — which means the specs
written against fixture mode kept passing unchanged, and a divergence between
what the fixture serves and what the schema can hold now fails at startup here
rather than as a mystery later. Seeding `forums.last_post_*` was the first thing
that difference surfaced: the fixture carries it as a nested object and Postgres
as six denormalised columns, and without them the index renders with no
latest-post link.

Accounts are seeded with a password hash nothing can match. A spec that needs a
session **registers through the form**, which is the path worth exercising
anyway.

#### The honest limit

**PGlite is not the driver production uses.** D54 is in this repository
precisely because a write path PGlite accepted was rejected by every real
Postgres. This narrows the gap by an enormous amount and does not close it,
which is why `client.pg.test.ts` still exists, why CI still has jobs against a
real server, and why the Docker `image` job still boots the web role against
one.

#### What it proved immediately

`e2e/writing-no-js.spec.ts`, all with scripting disabled: a thread and a reply
written through native forms and read back with their counters moved; an image
attachment that is **absent from the page until the queue is drained** and then
downloadable with the right headers and different bytes from what was uploaded;
a file whose name says `.png` and whose bytes say otherwise refused **without
creating the thread**.

The last two are claims no unit test can reach. Both were mutation-verified
against the real suite: rendering unprocessed attachments makes the image appear
before the tick, and moving the file staging to after the post is created leaves
a thread behind that the refusal test then finds.

---

### D67 — F58's avatar half, on F42's machinery (F58)

The half `0014` named as waiting, and D61 named as blocked rather than
half-built. F42 built what it was waiting for, so this is mostly *reuse* — and
what is worth recording is the three places it could not be.

**The lifecycle is F42's exactly.** Two keys on the row, the uploaded bytes
under one and the encoder's output under the other, swapped in a single
statement; `pending` until the queued job succeeds; nothing served before that.
D65 is the argument and none of it is repeated here.

#### An avatar is replaced, and an attachment never is

The difference that shaped the repository. An attachment is created once and
deleted with its post; an avatar is overwritten, so **something has to collect
what it replaced**. `beginUpload` and `clear` therefore `RETURNING` the *old*
key values in the statement that stops pointing at them, and hand them back to
the caller to sweep.

Reading first and then writing would leave a window in which two concurrent
uploads both believe they own the previous object, and one of them deletes it
out from under the other — which is exactly the sort of race that shows up as
"an avatar sometimes goes blank" and is never reproduced.

The ledger it hands them to is `attachment_orphans`. The name is F42's because
that is where it started; what it *holds* is object keys nothing owns, and a
replaced avatar is the second thing to need precisely that. A second identical
table would be worse than a name one feature out of date.

#### The lock is in the `where`, not in a prior read

`beginUpload` and `clear` both carry `and avatar_locked = false`. A service-level
check alone loses the race where a moderator locks an avatar while the member
has the form open — and it is the *member's* write that would win, which is the
wrong way round.

When the guard refuses, the statement reports the caller's own freshly stored
object as the thing to collect. That is not a special case bolted on: the object
was written before the row was touched (the write order D65 sets out), so if the
row was not touched then nothing owns it and it is garbage by the same rule as
everything else in the ledger.

#### The permission is global, and the visibility question is `profile.view`

`avatar.upload` joins F22's global actions rather than the forum matrix, for
`user.warn`'s reason: an avatar follows a member everywhere they appear, so a
per-forum grant would have to answer "an avatar where?" about an image that has
no forum. Serving one asks `profile.view` for the same reason — it is shown in a
member list and on a profile, not only under a post, so the forum a thread
happens to be in cannot be what decides it.

#### The URL carries a version and never a key

`/avatar/<id>?v=<updated_at>`. Two things follow. A key in a URL is a
capability, and one that would outlive a moderator's lock. And because a
replacement changes the URL, the response can carry a long `max-age` — which
matters, since a thread page fetches one of these per distinct author and a
board's regulars appear on every page. It stays `private`, because who may see a
member is still a permission question and a shared cache must not answer it.

#### What is deliberately not here

- **No remote URL and no Gravatar.** See `mybb-parity.md`: rendered it is a
  tracking beacon, fetched it is SSRF, and the safe version is the upload path
  with an SSRF problem in front of it.
- **No crop.** Scaled to fit, aspect preserved. Cropping decides which part of
  somebody's picture matters and a board cannot know; a theme wanting circles
  can have them in CSS, which is reversible.
- **No animated avatars.** GIF is not an accepted type anywhere on this board
  (D65), and an animated one under every post is the reason many forums ban them
  even when they can store them.
- **No default silhouette.** A board where nobody has set one would render a
  column of identical grey squares. Absent is more honest and costs less.
- **No per-group size limits.** `canUploadAvatar` is a boolean and the ceiling
  is a constant. MyBB has `maxavatarsize`; giving it a home means F71's group
  administration, and inventing a second place to configure it first would be
  the thing to undo.

---

### D68 — The settings screen is generated, and the hidden field is load-bearing (F64)

F08 promised that adding a setting means "one entry — not an entry plus a form
field plus a migration plus a parser, each of which could disagree with the
others". F64 is the half that makes the form, and it keeps the promise: neither
`admin-settings.ts` nor `settings-form.tsx` names a single setting.

#### The control kind is derived, not declared

`typeof definition.default` already says string, number or boolean, and it says
so as a *value* — which is the one form of the statement that cannot disagree
with itself. Adding a `kind:` field would be a second statement of the same
fact, free to drift from the schema that actually validates. The CLI's `coerce`
reads the default for the same reason.

Only what a type cannot say is declared, in `ui`: whether a string wants a
textarea, what an enum's choices are *called*, what bounds a number input should
advertise, and whether a setting is advanced.

#### The bounds are a duplicate, and a test says so

`z.number().int().min(0).max(3600)` knows the range, and zod is not
introspectable for it without unwrapping every wrapper type. So `ui.min`/`ui.max`
restate it — and `fields.test.ts` probes every numeric schema *at* each declared
bound and one step outside it. A hint that disagrees with its validator fails
there rather than shipping a spinner that offers values the save refuses.

The same test asserts the set is **exhaustive**: a numeric setting with no `ui`
hint renders an unbounded box, which is a silent downgrade rather than a visible
one, so adding one without bounds fails.

#### The hidden `keys` field is the whole safety of a filtered save

The screen shows one group at a time, filtered further by a search. **An
unchecked checkbox submits nothing at all**, and a form cannot tell "off" from
"not on this screen". An action that iterated the registry would therefore read
every boolean the operator could not see as `false` — and a save of the board
name would switch off search, reputation and registration.

So the form declares exactly what it is showing and the action touches nothing
else. Unknown keys in that field are dropped rather than passed on: it is form
data and therefore attacker-supplied, and `saveSettings` rejects a whole batch
containing an unknown key, so one forged entry would otherwise be a way to stop
an administrator saving anything at all.

Mutation-verified: replacing `submittedKeys` with the registry fails six tests.

#### The audit log gets keys, never values

A settings value can be a secret (`secret: true`), and the admin log is read by
more people than can edit settings. A log that recorded `board.name = X` would
be a log that eventually recorded a token. The row answers *who changed which
settings, and when*, which is what an audit log is for; the value is in the
settings table for anybody entitled to read it.

For the same reason a secret's current value never reaches the view model at
all — it would otherwise be in the page source of every administrator's browser,
their history, and any proxy that logged it.

#### Invalidation, and two tags that name nothing yet

`invalidates` has been on every definition since F08 with **nothing ever calling
it**: `settings.ts` reads through `cachedGlobal` with a sixty-second TTL
precisely because the CLI writes out of process and cannot invalidate. This is
the writer that closes it, so an operator changing the board name sees it
immediately rather than concluding the save failed.

`CacheTags.settings()` always goes, because the snapshot itself is what was
cached. The declared tags go too — and `layout` and `theme` name regions that
have no cached entry yet, because F08 wrote them ahead of the caches they
describe. Passing an unknown tag to a driver is a no-op, and passing it is what
makes those caches correct on the day somebody adds them rather than on the day
somebody remembers.

#### The filters are links, and the state is in the URL

A group tab is an anchor and the search is a GET form, so an operator can
bookmark "the posting settings", send a colleague the URL of the one they are
arguing about, and use the back button. A client-side filter would have none of
that and would need JavaScript on a screen that otherwise does not.

A **search spans every group and selects none**. Filtering to a group *and* a
term would mean somebody who typed a word and saw nothing had to work out that
they were also filtered — which is exactly how a search box gets reported as
broken.

#### "Advanced" is about danger, not about frequency

Hidden by default, and **counted while hidden** so the screen says what it is
not showing. What earns the flag is a setting where a wrong value locks somebody
out or stops the board serving — `board.offline`, the lockout window, the
session lifetime — not merely one that is rarely changed. A screen that hides
half of itself by default teaches people to click "advanced" first, which
defeats the point of having it.

#### What is deliberately not here

- **No per-setting revert.** "Changed" is shown against anything that is not its
  default, and clearing an override is what saving the default value already
  does — the store deletes rather than writes it. A separate button would be a
  second path to the same write.
- **No setting history.** The log records that the key changed and who did it.
  A before/after would be the values problem again.
- **No new settings.** F64 is the screen; the registry is F08's, and every entry
  in it already had a reader.

---

### D69 — A permission cell is three states, and the copy is previewed (F65)

The forum administration screen, and the two decisions in it that are not
cosmetic.

#### Inherit is a value, not an unset checkbox

`forum_permissions` columns are nullable and **null means inherit** (R4.1 layer
2). A two-state checkbox cannot represent that. A screen built from checkboxes
has to render an inherited-false cell as "off" — and saving the form then writes
an explicit `false` into it, pinning the forum forever and making a later change
at the parent do nothing at all.

That is not a hypothetical failure; it is the single commonest way a forum's
permissions end up wrong, and every board where "I changed it at the top and
nothing happened" is true has this bug. So a cell is `inherit | grant | deny`,
inherit is listed first and is the default, and a numeric cell's empty box means
inherit rather than zero.

**`readMatrixCell` refuses to coerce.** An unparseable number reads as
`inherit`, never as `0` — because 0 is *unlimited* under R4.2, so a typo
coerced to zero would silently grant the opposite of what was typed.

#### Every cell says what it resolves to, and from where

"Inherit" alone tells an operator nothing: inherit *what*? So each cell carries
its effective value and, when that came from an ancestor, which forum supplied
it. `inheritedFrom: null` on an inherited cell is a *different* explanation —
nothing in the chain set it and the group's own default applies — and the screen
words it differently.

#### A row resolves for its own group, not for the combination

`Authorizer.forumMatrix` combines across an actor's groups (R4.2: booleans OR,
numerics MAX). The **editor must not**: the operator is editing the Registered
row, and showing them `allowed` because Staff has it would make the cell a lie
about the thing they are about to change. Each row therefore resolves as if that
group were the actor's only one, which is exactly what the stored row means.

Mutation-verified: passing every group to the resolver at once fails.

#### Copy-to-subforums is previewed, re-authenticated, and means *identical*

It is the only operation in the panel that rewrites forums the operator is not
looking at, across a subtree of any size, with no undo. Three things follow.

**It is previewed in full** — every cell, on every forum, from what to what —
before the button appears. `planCopyToDescendants` is a pure function that
answers exactly that, so what the screen promises and what the SQL does come
from the same description of the change.

**It asks for the password again.** F63 built `requireFreshAdmin` for
destructive operations; this is the first one outside F63 itself to use it.

**It copies nulls, and clears rows the source does not have.** The
cautious-sounding alternative — copy only the non-null values — is wrong: a
descendant that explicitly denies something the source inherits would keep
denying it, and the operator who pressed "copy" would be looking at two forums
that are not the same. *Identical* is the only meaning of the word an operator
can predict, so the SQL deletes the target rows and re-inserts from the source
inside one transaction.

#### Two caches that had never been cleared

`CacheTags.forumTree()` has had `CachedForumRepository` behind it since F16 and
**no writer had ever invalidated it** — `forum:create` runs out of process, like
the settings CLI before F64. Renaming a forum in the panel and still seeing the
old name is how an operator concludes a save failed, so every write here clears
it. Permission edits clear `CacheTags.permissions()` instead, which is F20's
en-masse actor invalidation: a rename is a tree change and a grant is not.

#### A row of all nulls is deleted

Saving a group's row with every cell on inherit removes the row rather than
storing one full of nulls. A row that says nothing still costs the resolver a
lookup on every permission check on every page — and an operator who cleared a
forum's overrides would otherwise have no way to tell it had worked.

#### The subtree is a prefix match, and the dot matters

`forums.path` is the materialised dot-path F16 maintains, so "everything under
this" is one index scan rather than a recursive CTE per level. The prefix is
`path || '.%'` and **not** `path || '%'`: without the dot, forum `10.2` matches
`10.20`, and a copy reaches into a sibling subtree silently. There is a fixture
forum in the test whose whole job is to be `10.200`.

#### Moderator appointments: the table's first writer

`forum_moderators` gained its first *reader* in F48 — appointments resolve into
`Target.isForumModerator` and carry twelve granular rights — and had no writer
at all, so "moderator" could only be configured with SQL.

Three things about the write.

**Exactly one of member or group.** The table permits a row with both columns
set, and F48 would resolve such a row as two appointments that cannot be edited
apart. The screen offers one field or the other and the repository *asserts* it
rather than trusting the caller, because the assertion is what makes the
resolver's assumption true.

**Appointing twice is a rights change, not a second row.** The partial unique
indexes on (forum, user) and (forum, group) make it an upsert, so two
administrators doing it at once cannot leave two rows that disagree.

**A removal is scoped to the forum in the statement.** The appointment id is a
form value; scoping the `delete` means an id from another forum matches nothing
rather than being caught by a check somebody could forget — the same shape F60's
mailbox ownership uses.

All twelve rights are editable, including the three (`canHardDeletePosts`,
`canManagePolls`, `canViewIps`) that no action reads yet. A right that exists in
the schema and not in the screen is one an operator will believe they granted.

Appointing is `requireAdmin`, not a moderator permission: it is how moderation
is *granted*, and a moderator who could appoint moderators could grant
themselves everything F48 resolves.

#### Moving a forum is re-authenticated, like the copy

`move` rewrites every descendant's path in one transaction and changes what all
of them inherit — moving a busy forum under a private category hides its whole
subtree. That is a large effect from one dropdown, so it asks for the password
again. The cycle check stays inside F16's `move`, which re-reads the tree under
the forest lock; the screen simply does not *offer* the forum's own subtree as a
destination, because offering an option that will be refused is not a check, it
is a trap.

A move invalidates the permission version as well as the tree: what a subtree
inherits has changed, and resolved actors carry that.

#### What is deliberately not here

- **Forum passwords.** `forums.password_hash` exists and is F21's; setting one
  from the panel needs the same care as any credential write and belongs with
  whatever screen owns forum access as a whole.
- **Reordering by drag.** `MoveTarget.position` exists and clamps, and `move`
  applies it — but a drag handle is an island, and F45 is where islands are
  proven removable. Display order is a number on the options form until then.
- **Deleting a forum.** Not an oversight: a forum holds threads, and what
  happens to them is a decision (move them? delete them? refuse while any
  remain?) that belongs with F71's content administration rather than being
  guessed at here.

### D70 — A group permission is two states, and a mass change is a run (F66)

Group administration, and the three decisions in it that are not CRUD.

#### Two states here, three on a forum — and that is not an inconsistency

D69 argued at length that a forum permission cell must be `inherit | grant |
deny`, because `forum_permissions` is nullable and null means inherit. It would
be easy to reuse that control here out of symmetry, and it would be wrong.

A group's global permissions are **R4.1 layer 1** — the bottom of the
resolution. There is nothing above them. A third state would be an "inherit"
that resolves to nothing, which is worse than no control at all: it is a control
that looks like it defers to something and does not.

So the group editor is checkboxes and number boxes, and that is honest. The
corollary is the thing the app-layer test exists for: **an unticked box is a
revocation, not an absence.** An off checkbox submits nothing, so an action that
read only the fields that arrived could never turn a permission off — the
operator would untick it, press save, and watch it come back. Every field in
`PERMISSION_FIELDS` is therefore read whether it arrived or not, and the write is
a whole set rather than a patch.

The forum-scoped fields are on this screen too. They are the group's *default*
for every forum that does not override them, so leaving them off would hide the
value most forums actually resolve to — an operator would set `canPostThreads`
nowhere and wonder why nobody can post.

#### Every write bumps the permission version, inside the same transaction

F20 resolves an Actor once and caches it against `permission_version`. A group
write whose bump is lost leaves everybody holding their old permissions for the
cache's lifetime: a grant that appears not to have worked, and — the direction
that matters — **a revocation that silently did not take effect**.

So the bump is not a call the caller could forget. `withVersionBump` wraps every
write in one transaction with the increment, which also means a refused write
rolls the bump back with everything else. Mutation-verified in both directions:
dropping the bump fails three tests, and moving it outside the transaction fails
the one that checks a refusal leaves the number alone. Bumping *before* the work
rather than after is an equivalent mutant — same transaction either way — and the
test says so rather than pretending to kill it.

A rename bumps too. The badge and the staff flag ride on the same resolved
actor, so the invalidation is unconditional rather than a judgement about which
columns are "really" permissions.

#### A mass membership change is a resumable run, not a button

Moving every member of a group in one UPDATE holds row locks on `users` — the
table every request on the board reads — for as long as it takes. On a board
with five figures of members that is indistinguishable from an outage.

So it is chunked: bounded batches on a keyset cursor over `users.id`, 500 to a
press, exactly as F24's promotion loop pages for the same reason. **A short
chunk reports `nextCursor: null`**, which is what lets a caller stop without a
second query that finds nothing — mutation-verified, because a sequential run
still totals correctly with that mutant in place and only an explicit assertion
catches it.

The cursor travels in a hidden form field, so the run continues across presses
**with no JavaScript** (D06). That is also why the screen has no progress bar: a
bar would be an island, and this works without one.

#### The promotion screen is a caller, not a second implementation

`PromotionService.preview()` has existed since F24 with no caller outside the
scheduler. The ACP screen calls it. It does not compute the affected list
itself, because `preview()` and `apply()` are the same evaluation differing only
in whether outcomes are written — and a screen with its own copy of the
evaluation would eventually disagree with the run it was previewing, about who
is being moved between groups.

The dry run is unconditional: opening the page runs it. It writes nothing, and a
promotions screen that showed rules without their consequences would be asking
an operator to evaluate the rules in their head.

#### Deleting a group asks where its members go

`users.primary_group_id` is NOT NULL, so a delete without a destination either
fails on the constraint or — with a cascade — takes the members with it. Asking
is the only version of the operation that is not a trap.

System groups are refused. `is_system` marks the ones the board's own code
resolves by key, and deleting one breaks registration rather than a screen.
Their *permissions* stay editable, which is most of what this panel is for; the
screen says which of those two it is rather than hiding the group.

#### Three operations are re-authenticated

Deleting a group, moving members en masse, and applying promotions. Each changes
what a population of members may do, with no undo, and none of them has a blast
radius visible from the button — which is what F63 built `requireFreshAdmin`
for. The freshness window means an operator confirms once and can then work
through a long chunked run without retyping a password on every press.

#### What is deliberately not here

- **Editing promotion rules.** `promotion_rules` has a repository and an
  evaluator; a rule *editor* is a screen over criteria whose natural home is
  beside the user administration F67 brings, and half of it — a screen that runs
  rules it cannot show you — would be worse than the honest link.
- **Secondary groups.** `users.primary_group_id` is what this screen moves.
  Additional-group membership is a join table F67 owns, and a mass-move screen
  that silently only understood one of the two would be a screen that lies about
  what a member is in.
- **A per-member group picker.** That is F67's, and putting it here would mean
  two screens that both claim to own membership.

### D71 — A ban is a mechanism, not a state; a search term is not a pattern (F67)

User administration. This half is search, the member screen, activation and
bans; merge, prune and mass mail follow.

#### `%` in a search box is a character, not a wildcard

`like` treats `%`, `_` and `\` as syntax. A member called `100%` typed into the
username box would otherwise match **every member on the board** — and this is
the screen from which people are banned, so a filter that quietly returns
everybody is not a cosmetic bug.

Every user-supplied fragment therefore goes through `likeFragment` before it
reaches a pattern. This is not defence against injection — the value was always
a bound parameter — it is about the query meaning what the operator typed.
Mutation-verified twice: escaping only `%` leaves `_` matching any single
character, which is quieter and just as wrong.

The IP search is anchored at the start for a related reason. Only a *prefix* is
stored (F19 drops the last octet at write time), so a contains would match the
middle of an address: searching `198.51` would return a member on `10.198.51.0`,
who shares no network at all. That list is the one an operator reads as "these
accounts are the same person".

#### Search is keyset-paged because the pages mutate the set

The set being paged is `users`, and the actions on these very pages change
whether a row still matches — banning somebody changes their state. An OFFSET
page over a set being modified skips rows, and the rows it skips are precisely
the ones just acted on. So paging is a cursor on `id`, and a short page reports
`null` rather than a cursor that would fetch nothing.

#### The filter lives in the address bar

The search form is a plain **GET form**. No Server Action, no JavaScript, no
POST: the browser does all of it, the filter survives a reload, and the URL can
be pasted to another administrator. `parseUserFilter` is therefore the boundary
where anything a person can type into an address bar becomes a query, and it has
two rules.

**An unparseable criterion is dropped, not refused.** A filter is a question;
answering a slightly wrong one with the members it does match is more use than
an error page, and an operator who mistypes a date should not lose the username
they also typed.

**An absent criterion is absent, not a default.** A blank field is what a GET
form submits for every input the operator left alone, so reading `''` as a
criterion would make the first search after "Clear" match nobody.

#### Banning goes through `BanService`, never through the state column

`users.state` has a `banned` value and it is tempting to write it. F23 captures
the group the member held **at ban time** — that capture is the entire mechanism
behind "an expired ban restores the prior group", so that a banned moderator
comes back a moderator rather than being silently demoted to Registered.

A ban applied as a state write produces a member whose column says banned with
no ban row behind it: nothing expires, and nothing can lift it correctly. So
`setState` refuses to write `banned`, and refuses to move a member *out* of it
as well — lifting is F23's, and flipping the column would leave the ban record
active while the member walked around.

The refusal exists twice on purpose, in the repository and in the action. They
protect different things: one keeps the column honest against any future caller,
the other keeps the *screen* from offering an operation that would look like a
ban and not be one.

This screen is also what F54 was waiting for. F23's mechanism has been complete
since Phase 2 with no surface at all; F54 considered a ModCP ban screen and
named the absence instead, because a create/lift screen needs a member search
and half of one would have been a second place that knew how to ban.

#### Two ban reasons, and only one of them is ever shown

`reason` is the staff note — it routinely says things like "linked to the
account we banned last week" — and `publicReason` is what F23 shows on a login
attempt. Collapsing them into one field is exactly how an internal note ends up
in front of the person it is about. The audit log records the *length* of a ban
and never either reason, on F64's rule: the log is read by more people than can
issue one.

#### A shared IP prefix is a network, and the screen says so

The member page lists other accounts seen on the same prefix, and words it as a
network every time. A household, an office and a campus all look identical here,
and only a prefix is stored, so the data cannot support "same machine" — an
operator acting on this list as proof of a second account would be acting on
something it does not say. An empty prefix returns nothing rather than
everybody, which is the mutant most worth killing in this file: `like '%'`
matches every row, and this is the list read as "these are the same person".

#### F20's group-id rule needed six justified exemptions

The lint rule that bans reading `primaryGroupId` outside `@forum/authorization`
fired on a screen whose entire job is editing that column. Each site got a
per-line disable with a reason, following the convention `account-repos.ts` and
`ban-repos.ts` set: transporting a column into a row, rendering it as the
selected option, filtering on it as a search criterion, writing it back. None of
them concludes anything from the value, which is what the rule is actually
about — and keeping the exemptions per-line rather than per-file means the next
one has to argue for itself too.

#### What is deliberately not here — F67 is PARTIAL

- **Merge, prune and mass mail.** All three are in F67's acceptance and all
  three are the same shape: bounded, resumable work over a large table. They
  need the search and the member screen underneath them, which is what this
  half is.
- **Secondary groups.** *Corrected in the second half — see D72.* This said the
  table did not exist. It does: `user_group_memberships` has been read since F20
  and had no writer, which is the opposite problem and a worse one.
- **Password reset from the panel.** An administrator setting somebody's
  password is an account takeover with a paper trail. F19's reset flow already
  exists and mails the member; the panel should trigger *that*, which is a
  different feature from editing a row.

### D72 — A merge is a map, and the map is checked against the schema (F67)

The second half of user administration: merging accounts, and the writer
`user_group_memberships` never had.

#### The dangerous failure of a merge is a column nobody remembered

Not a wrong update — a **missed** one. A column left pointing at an account that
has been merged away produces posts with no author, a warning attached to
nobody, a subscription that never fires again. None of it raises an error, none
of it is caught by a test that checks the tables somebody thought of, and it
surfaces months later as "why does this thread say a deleted member posted it".

So the reassignment is a **declaration** — `user-merge-map.ts` — and a test
holds it against `information_schema`. Every column in the schema whose name
looks like a user reference must appear in exactly one of five lists, and a
migration that adds one fails the suite until somebody *decides* which list it
belongs to. That is the only version of this that survives twenty more features.

**It earned its place immediately.** The first version of the map had all forty
id columns and the test failed anyway: there are five denormalised **username**
columns — `posts.author_username`, `threads.author_username`,
`threads.last_post_username`, `forums.last_post_username`,
`private_messages.author_username` — which carry a *name* rather than an id.
Reassigning `author_user_id` and stopping there leaves every post displaying the
merged-away account forever, with no foreign key and nothing to notice. The test
found them; nobody reading the code did.

#### Credentials are destroyed, never moved

`sessions`, `remember_tokens`, `credential_tokens` and `admin_sessions` all have
a `user_id`, and every one of them is a credential rather than content. Moving
the losing account's session row to the winner hands the winner's account to
whoever holds that cookie. **A merge is not an authentication event** — it is
housekeeping — and this is the one line in the file where treating a pointer
like every other pointer turns a tidy-up into a takeover.

#### A merge can create rows that were never possible to create

`reputation` and `user_relations` each have two user-shaped ends. Bring the ends
together and you get a member who has rated themselves, or who has put
themselves on their own ignore list. Neither is reachable through any screen,
neither is representable in the UI, and no reader expects them — so those rows
are deleted rather than moved.

Order matters: collapse the self-references first, then drop the duplicates
against the winner's existing rows, then move the remainder. The other order
moves a row *into* a self-reference and then fails to notice it.

The plain duplicates get the ordinary treatment: where both accounts hold a row
under a uniqueness rule — both subscribed to a thread, both in a group, both
with a preference for the same notification kind — the loser's row is dropped
and the winner's stands. That is the choice that loses nothing the winner did
not already have.

#### A banned account cannot be merged

`bans.user_id` is reassigned like any other pointer, which means merging a
banned account carries its **active ban onto the winner** and locks out an
account nobody decided to ban. Refused, with an explanation that says to lift
the ban first. This is a case where the generic machinery is right and the
*situation* is wrong.

#### Only `posts` is chunked, and the finish refuses to be skipped

`posts` is the one table whose size is a function of how old the board is rather
than of one member's settings, so authorship moves 500 to a press and the count
remaining travels in the form — the same shape as F66's mass membership move,
working with no JavaScript for the same reason. Everything else is bounded by a
member's own activity and goes in one finishing transaction, because a
half-applied merge is the worst of the three states: the loser would own some of
their history and not the rest, with no record of where the boundary was.

`finish` refuses while posts remain, so a caller who forgot to loop gets an
error rather than a partial merge.

#### The losing account is closed, not deleted

Soft-deleted, deliberately. Its row is what any column the map missed still
points at — a deleted account renders as "a former member" where a dangling id
renders as a crash — and it is the only evidence afterwards that the merge
happened. **Cost:** its username stays taken. Freeing it would mean renaming the
row, which destroys the one record of which account was folded into which.

#### The direction is stated in words, everywhere

"Merge A into B" is ambiguous in ordinary speech and unrecoverable if you get it
backwards. The account in the URL is the one that disappears, the page says so
in those words three times, and the button names the account being *kept*. The
screen also lists what a merge does in full — including the session destruction
and the collapsed ratings — because every one of those is something somebody
asks about afterwards.

#### `user_group_memberships` gets its first writer, four features late

The fourth table this project has found with a reader and no writer. F20's
`actor-builder` has folded it into `Actor.groupIds` since Phase 2 — so a
secondary group grants under R4.2 exactly as the primary one does — and there
has never been any way to grant one. **F67's first half claimed the table did
not exist**, which was wrong in the direction that matters: not a missing
feature but a resolved input nobody could set.

The editor is checkboxes over every group and the write **replaces the set**
rather than adding to it, because the form submits the whole set — an add-only
write would make unticking a box do nothing, which is the direction that leaves
somebody holding a permission they were meant to lose. The primary group is
shown but not offered: it is already on `users`, and a row for it here would be
a second place saying the same thing that could disagree after a primary change.

### D73 — The prune's exclusions are not options, and mass mail is verified-only (F67)

The last of user administration, and the two rules in it that an operator
cannot switch off.

#### A prune cannot reach an account whose loss is unrecoverable

Four exclusions, all unconditional, none of them a checkbox:

- **anybody who has posted.** Their account is attached to content, and what
  should happen to that content is a decision — F71's — rather than something a
  date filter guesses at;
- **staff, by primary *or* additional group.** A quiet administrator who
  registered years ago and reads more than they write is the likeliest person to
  match a naive inactivity filter and the least acceptable to remove. Checking
  only the primary group is the obvious version and the incomplete one, now that
  F67 has given `user_group_memberships` a writer;
- **forum moderators**, whatever group they are in. An appointment is a job
  somebody was given; a sweep must not undo it;
- **banned accounts.** The ban record is the reason they are quiet, and removing
  the account removes the evidence of the decision.

Each has its own test, because each is a different way for a maintenance sweep
to do real damage.

Two more shapes matter. **`last_active_at` is null for somebody who registered
and never came back** — which is most of what a prune is for — so the inactivity
filter has to say `is null or <`; a plain comparison silently excludes exactly
the group being swept. And **the preview and the write share one predicate**: a
prune that removed something the dry run did not list would make every future
dry run worthless.

The screen refuses to do anything at all without a registration boundary,
because a prune without one matches the entire membership. Defaulting it to
today would be a screen that offers to close every account by pressing Search.

Pruning **closes** rather than deletes, like a merge's losing account: ten
thousand `deleted_at` values can be cleared, ten thousand deleted rows cannot.

#### Mass mail goes only to verified addresses, and that is not a preference

An unverified address is as likely to be a typo — or somebody else's mailbox —
as it is to be the member's. A board that mails thousands of them is a board
whose domain stops being delivered anywhere, which costs every *other* thing the
board sends: password resets, notifications, activation. So the rule is in the
query rather than in a checkbox an operator can clear on a bad day.

**One job per recipient, and nothing sent from the request.** The body lives on
`mass_mails` and the job carries `{ massMailId, userId, email }`, because a
payload holding the body would put a copy of it in the queue for every member on
the board. One job per member also means a provider rejecting one address costs
that member's message a retry rather than the whole batch's, and the queue's own
dead-letter list becomes the record of who could not be reached. The driver is
touched only inside the tick — F55's rule — so a provider hanging for ten
seconds is a task's budget rather than a ten-second button press.

**The cursor advances in the same transaction as the read.** Two presses of the
button, or one double-submitted form, would otherwise both start from the same
point and mail those members twice; a duplicate mass mail is the one mistake in
this panel that cannot be taken back. A finished campaign also refuses to claim
anything more, so pressing the button on an old one does nothing rather than
starting it over.

There is no unsubscribe link and no per-member opt-out, and the screen says so:
this is for things every member needs to know, not for anything promotional.
Naming that is the honest version — a link that unsubscribed somebody from
*nothing in particular* would be worse.

#### The coverage guard caught the table this feature added

`mass_mails` has two columns ending in `user_id`, and the merge map's
schema-driven test failed the moment the migration landed. That is the guard
working exactly as intended — but one of the two is interesting.

`created_by_user_id` is an ordinary pointer and joins the reassign list.
**`last_user_id` is a cursor**: the position a campaign's send reached in an
ordering of recipients, not a reference to a member. Reassigning it would fix
nothing and would corrupt the resume point of a run in progress, mailing part of
the board twice.

The tempting fix was to rename the column until the test stopped noticing it.
That is precisely how a guard becomes useless — renaming to dodge a check
teaches the next person that the check is an obstacle — so there is now a fifth
list, `MERGE_NOT_A_REFERENCE`, holding one entry and an argument. Because the
test also asserts the lists are disjoint, a column parked there is a decision on
the record rather than an omission.

### D74 — There is no "switch theme" button, and the editor validates with the renderer's own code (F68)

The theme manager, and the two things about it that are decisions rather than
implementation.

#### Selecting a theme is a redeploy, and the screen says so

The roadmap line begins "theme selection", and the honest answer is that this
panel cannot do it. `forum.config.ts` is the build-time registry (invariant 6):
a serverless bundle contains only what the bundler saw, nothing is discovered by
scanning a directory at request time, and `activeTheme` is a module-level
constant because a theme's `extends` chain cannot change between requests.

A control that appeared to switch themes would therefore either not work, or
would buy the illusion by making every render wait on a database read that first
paint currently does not need. So the listing marks the theme in use and spends
a paragraph on what installing actually involves — `pnpm add`, a line in
`forum.config.ts`, redeploy — in the same words F69 will use about plugins. A
panel that admits a limit is worth more than one that hides it behind a control
that does nothing.

What *is* runtime is everything `theme-runtime.ts` reads per request: the token
overrides and the custom CSS. That is the editor, and it is the whole of what a
board can restyle without a deploy.

#### The editor validates with the functions that paint

`validateTokenOverrides` and `validateCustomCss` are F26's, and they run on
**every page render** against the stored row. The editor calls the same two
before writing.

That is not tidiness. A second validator would drift, and the direction it would
drift in is the dangerous one: a value the editor accepts and the renderer
rejects is a board that goes blank on the next request — from an
administrator's own save, with the panel reporting success. Running the
renderer's own code is what makes "saved" mean "will render".

It follows that the submitted fields are read from the *form* rather than from
the theme's declared token list. Walking the declared names would silently drop
a field naming a token the theme does not have, which is the one case where the
editor and the renderer would disagree about the same input — and disagreeing
quietly is worse than either answer. F26 refuses it with a message; the screen
shows the message.

A blank field is "use the theme's value", not an empty override. Most fields are
blank on any real board, and storing them would write `--primary:;` into the
cascade: a token that overrides the theme with nothing.

#### The preview is a post-back, and it is scoped

No island. The form has two submits — save, and preview — which is what a
browser does with two buttons and needs no JavaScript at all (D06). The preview
action runs the *same* validation and the *same* declaration rendering a save
would, so it shows what a save would paint rather than an approximation of it,
and a value the renderer would reject fails in the preview too.

The style block it produces is scoped to `[data-theme-preview]` rather than
`:root`. An operator previewing an unreadable colour combination must still be
able to read the form that changes it back — a preview that could break the
panel around it is a trap, and the mutant that emits `:root` is one of the
fourteen this feature kills.

The sample is real board chrome — a forum row, three buttons, body text and a
link — rather than colour swatches, because the question being answered is "is
this readable", and a row of squares cannot answer it.

#### A reset deletes the row, and is deliberately not re-authenticated

"No overrides" and "no row" are indistinguishable to every reader, and deleting
is the one that leaves the board in the state a fresh install is in — which is
what an operator pressing reset means, and what keeps "has this board been
customised?" answerable.

Reset is also the only destructive-looking operation in this panel that does
*not* ask for a password again, and that is on purpose: **reset is the undo.**
Everything it can destroy is recoverable by pasting back an export, and putting
a password prompt in front of the recovery path is how somebody ends up staring
at a board they have broken and cannot fix. The destructive direction here is
`save`, and that one is always undoable by resetting.

#### Export is exact, and import ignores the key in the file

The export carries no timestamp and no board identity — only the overrides —
because `updated_at` is when *this* board saved, and carrying it across would
make an import claim a history it does not have. A `version` field is there so a
document from a later shape is refused rather than silently mis-read: an import
is a file somebody has been emailed.

The key inside the document is **ignored** in favour of the theme being edited.
Copying a look from one board to another is the case import exists for, and
refusing a document whose key differs would make the feature useless for exactly
that. Both checks are needed and they check different things: the envelope
(`parseThemeExport`) and the values (F26's validator, because a file that
arrived by email is exactly as untrusted as a hand-edited row).

#### `themes` gets its first writer, and two columns are named rather than used

The fifth reader-with-no-writer this project has found. `themes` has been read
on every page render since F26 and could only be changed with SQL.

Two of its columns stay unread, deliberately:

- **`layout_options`.** There is nothing to put in it. The default theme
  expresses layout through Tailwind classes, which are compile-time, and through
  CSS custom properties, which *are* tokens — so anything an operator can change
  at runtime is already the token editor. A free-text JSON blob that no theme
  declares and no component reads would be the stub D32 refuses. Making it real
  means a theme-side declaration of the options it has, which belongs with the
  second theme (F78) — the first one with a layout choice to declare.
- **`branding`.** F55's mail branding reads the board name from settings and the
  accent from `token_overrides`; there is no third thing it wants. A logo upload
  is the obvious candidate and is F42's attachment pipeline plus a decision about
  where it renders, which is a feature rather than a column.

### D75 — F69 is blocked by F79, and the roadmap has them in the wrong order

The plugin manager's line asks for six things: enable/disable, migrations,
settings, ACP pages, hook health, and honest install instructions. **Five of
them describe the plugin lifecycle**, which is F79's — and none of it exists.
`InstalledPlugin` is `{ key, enabled? }` and deliberately opaque; there is no
hook registry, no plugin migration runner, no plugin settings namespace, and no
way for a plugin to contribute a page.

So the dependency in the roadmap is wrong. F69 is listed as depending on F63,
and it genuinely depends on F79 — two phases later. That is a roadmap error
rather than an implementation shortfall, and it is recorded here rather than
worked around.

What F69 delivers is the half that is true today: the inventory, the install
story (`pnpm add`, a line in `forum.config.ts`, redeploy — the same three steps
a theme takes, for the same bundler reason), and a precise statement of what
each missing control is waiting on. Building the other five would mean a
migrations screen for plugins with no migrations, a settings editor for plugins
with no settings, and a hook-health dashboard for a hook system that does not
exist. Four stubs, which is what D32 refuses and what F68 argued against one
feature earlier.

One thing in it is a real trap worth the test it has: **`enabled` is optional
and absent means enabled.** A plugin somebody added to the config is one they
want; reading `undefined` as "off" would make every plugin registered without
the flag silently inert, and the symptom — installs cleanly, does nothing — is
one nobody would think to look for in an accessor.

### D76 — Staleness is measured per task, and a stopped scheduler is its own alarm (F70)

System health, and the two judgements that make it worth having.

#### Every catch-up operation is invisible when it stops

Bans expire, digests send, counters reconcile, orphaned uploads are swept and
queued mail is delivered — all on the tick. When the tick stops, **none of that
fails**. It simply does not happen, and the board looks completely normal until
somebody notices that a member banned for a week is still banned a month later.
There is no error anywhere to find. That is why this screen exists and why its
warning is loud.

#### One threshold cannot judge two cadences

Staleness is measured against **each task's own interval**. A five-minute task
that last ran an hour ago is broken; a daily task that last ran an hour ago is
fine, and a single global threshold says the wrong thing about one of them.

The threshold is three intervals rather than one, because serverless cron
legitimately drifts — a deploy, a cold start or a platform hiccup skips a tick,
and F06 wrote every task to catch up precisely so that a single miss is a
non-event. Warning on the first miss trains an operator to ignore the warning,
which is worse than not having one.

Four other states are distinguished for the same reason: `disabled` is a
decision and must never read as a fault, `failing` is a task that *is* running
and losing (different problem, different fix), and `never-run` is "it has not
started" rather than "it stopped".

#### A stopped scheduler is not the same as a stale task

The screen raises a separate, louder alarm when **every enabled task** is
overdue, because that is a tick that is not firing at all — one cause, breaking
bans and digests and counters together — rather than a bug in one task. An
empty registry is explicitly not that alarm: a board with no tasks registered
has a different problem and must not be told this one. (`every` on an empty
array is vacuously true, which is exactly the mutant that test kills.)

The verdict is a pure function in `@forum/tasks`, not in the repository, so the
screen, the CLI and any future alerting reach the same answer from the same
code.

#### The maintenance actions are bounded, and deliberately not re-authenticated

Bounded because this panel runs inside a request: a sweep that ran to completion
over a large table would be killed by the platform's execution limit somewhere
in the middle, leaving an operator with no idea how far it got. Each reports its
count, because "removed 0" and "removed 4,812" are different answers to the same
press.

Not re-authenticated because there is nothing here to destroy: expired sessions
no longer authenticate anybody, expired tokens can no longer be used, and a
cleared cache is a copy of data that still exists. A password prompt on
operations that do not need one is what makes the prompt meaningless on the
operations that do.

Two smaller choices: clearing a cache is **tag-scoped**, never a blanket flush
(on a busy board that is a stampede, and the reason somebody reaches for it is
almost always one stale thing they can name); and dead-lettered jobs are retried
**one at a time by id**, because a job dead-letters after exhausting its
attempts, so the reason is usually still true — retrying the lot puts the same
failures straight back and buries the one that was actually fixed.

### D77 — The word filter is applied at render, which is what makes it reversible (F71)

Content administration. The word filter is the whole of the interesting part.

#### Filtering on save destroys the original; filtering on render does not

MyBB and most boards rewrite the stored text when a post is saved. Three things
follow, and all three are bad: turning a filter off does not bring the word
back, a badly chosen pattern cannot be undone across three years of posts, and a
filter added today never touches anything written yesterday.

Applying at render costs a pass over the rendered HTML and buys all three back.
A filter becomes a **view** of the board — changeable and removable with no
consequence at all — which is also why `delete` here is a real delete rather
than a soft one, and why the delete is not re-authenticated. There is nothing to
lose.

#### Only text is substituted, never markup

This runs on rendered HTML, so a naive `replace` rewrites the inside of
`<a href="…">` and `<img src="…">` — a filtered word inside a URL becomes a
broken link, silently, with nothing about the post looking wrong. The scanner
walks tag by tag and substitutes only in the spans between them.

That is sound *because the input is the renderer's own output*: `@forum/bbcode`
emits a fixed sanitised tag set and escapes `<` in text to `&lt;`, so a bare
angle bracket in a post cannot desynchronise the scan. An unterminated tag —
which cannot arise from that renderer — is copied through rather than filtered,
because leaving it alone is the failure that does not also corrupt it.

#### A pattern is literal text, never a pattern language

Patterns are escaped before compiling. A regular expression typed into an admin
form runs on every post body the board renders, and a catastrophically
backtracking one is a board that stops rendering. The feature is "replace this
word", not "run this program on every post".

**Whole-word is the default**, for the reason the Scunthorpe problem is named
after: a substring filter on an inoffensive fragment silently mangles place
names and surnames, and the member it happens to has no idea why their post
looks wrong.

An empty pattern is refused on the way in *and* dropped on the way out, because
it compiles to a matcher that hits at every position — which would insert the
replacement between every character of every post.

#### The filter applies to what the board publishes, not to private mail

It is wired at the thread view's render site rather than inside `postBodyHtml`,
even though that would have been fewer lines. The same renderer serves private
messages, and filtering private correspondence between two members is a
different decision from filtering what the board publishes — one this feature
does not make on a board owner's behalf.

#### An equivalent mutant, named rather than hidden

The first version reset `lastIndex` on each matcher before use, with a comment
about global regexes being stateful across a render pass. No test could kill
removing it: `String#replace` with a `/g` pattern scans from the start and
resets `lastIndex` itself. The line was deleted and the comment rewritten to say
what is actually true — including that anything added later using `exec` or
`test` on those matchers *does* need one. A line that cannot be proven by a test
is a line that will be believed for the wrong reason.

#### `thread_prefixes` gets its first writer

Read by the thread composer since F33, populated only by SQL until now — the
sixth reader-with-no-writer this project has found. Deleting a prefix leaves the
threads that used it and simply removes the label (`on delete set null`):
refusing to delete one in use would make a mistyped prefix permanent, and
deleting the threads would be absurd.

#### What content administration does not administer

- **Smilies and custom BBCode.** Both extend the *renderer's vocabulary* rather
  than adding rows an operator edits. The renderer has a fixed, sanitised tag
  set on purpose, and letting a panel extend it is a change to what a post can
  contain — a decision about safety, not a CRUD screen.
- **Attachment administration.** The lifecycle, the orphan ledger and the sweep
  all exist; what is missing is a listing an operator can act on, which needs an
  answer to what deleting somebody else's upload does to the post displaying it.
- **Announcements.** There is no announcement model on this board at all. A
  screen for editing something that does not exist is the emptiest kind of stub.

### D78 — The permission filter is in the query, and the guard caught the search (F72)

Postgres full-text search, and the four decisions that make it safe rather than
merely fast.

#### Filtering after the query is a leak *and* a bug

The visible forum ids go into the `where` clause. Fetching a page and dropping
what the viewer may not see would be wrong twice over: the page comes back short
— twenty hits becoming three — and the **cursor** is computed from rows the
viewer cannot see, so paging skips and repeats. An empty scope therefore returns
nothing rather than everything, and the scope is a *required* argument rather
than an optional filter, so no call shape accidentally searches the whole board.

#### R3's guard caught this file on its first run

The first version hand-wrote its visibility predicate — `p.visibility` compared
to a literal, plus an own-post clause I had invented. `pnpm guards` failed the
build: F47 allows exactly one module to compare that column, and every read path
takes a `ContentScope` and turns it into SQL through `visibleIn`.

That was the guard doing its job, and the fix was better than the code it
replaced. `SearchScope` now carries a `ContentScope` rather than a "staff?"
boolean, the provider decides nothing, and the own-post rule went away — it was
an invention, and no other read path on this board has it.

It then caught the *comment* explaining the fix, because the comment contained
the pattern. That is the guard being blunt in the right direction: a string it
cannot distinguish from code is one it should flag, and rewording a comment
costs nothing next to the class of bug it exists for.

**Both sides of the join are filtered.** A `visible` post inside a `deleted`
thread must not surface, or search becomes the way to read threads that were
taken down.

#### Ranking is weighted, and paging breaks ties

The subject is indexed at weight `A` and the body at `B`, because without
weights a two-word subject loses to a thousand-word post that says the term once.

Ranks tie constantly — identical posts score identically — so the cursor is
`(rank, id)` and the `order by` matches it exactly. Paging on rank alone silently
skips and repeats across any page boundary that lands inside a run of equal
ranks, which is most of them.

#### `websearch_to_tsquery`, not `to_tsquery`

A search box is not a query language. People type apostrophes, brackets and
stray ampersands without meaning anything by them, and `to_tsquery` answers
those with a syntax error — a board whose search looks broken. `websearch_to_tsquery`
accepts arbitrary text and understands the two conventions members actually use:
`"quoted phrases"` and a leading `-` for exclusion.

`@forum/search`'s parser therefore does **not** build a query. It normalises
whitespace, strips control characters, and answers one question the engine
cannot: is there anything here worth running? Length is measured on the *words*
rather than the raw string, because `"a"` and `-a` are one-character searches
dressed up, and running one scans the index to return everything. "Empty" and
"too short" are different refusals, because they lead to different next actions.

#### The index is maintained explicitly, not by a generated column

Postgres would compute `search_vector` as `GENERATED ALWAYS AS … STORED`, and on
an empty database that is the better design. Adding one to a table with two
million posts rewrites the table under an exclusive lock — an outage on a live
board. So the column is written when a post is created or edited, and existing
rows are filled by a **resumable backfill**: the batch is "posts with no vector",
a set that only shrinks, so an interrupted run resumes from anywhere and a
repeated one does nothing. `searchVectorSql` is shared between the writer and
the backfill, because a post indexed today and one reindexed tomorrow must
produce the same document or results would depend on when a post was written.

#### The provider seam is narrow on purpose

Everything above `SearchProvider` speaks in queries and hits; nothing outside
`@forum/db` knows what a `tsquery` is. Replacing Postgres search with a hosted
index is a new implementation of one interface. Ranking internals, stemming
configuration and index maintenance stay behind the seam, because no two
providers would agree on them.

#### A mutation-testing note

Two guards overlapped: an explicit `scope.forumIds.length === 0` check and the
`allowed.length === 0` check below it. No mutation of the first could fail a
test, because the second already covered it. It was removed rather than kept —
the same call F71 made about a defensive `lastIndex` reset. A guard that cannot
be shown to matter is one the next reader will trust for the wrong reason.

### D79 — A stored search holds the query, not the hits (F73)

The search screens, and the decision everything else follows from.

#### Freezing a result list is faster and wrong

The obvious implementation of "stored result sets" is a frozen list of post
ids: page two is then a cheap `where id in (…)`. It is wrong in two ways that
matter and one that is merely untidy.

**It goes stale.** A post deleted, moved to a private forum, or hidden by a
moderator after the search was run would still be offered on page two.

**It is a permission snapshot.** A member who loses access to a forum would go
on seeing its hits for as long as the stored set lived — the permission model
frozen at the instant somebody pressed a button.

So the row holds the **query**, and every page re-resolves it through the
current viewer's scope. Re-running costs one indexed query, because F72's GiN
index is doing the work; storing the answer would trade that for a correctness
problem.

The third benefit is the one an operator notices: "search within results" stops
being a set intersection and becomes another query. With the terms stored rather
than a list of ids, *within* is simply *and*, which is what full-text search
does natively and what a member means.

#### The row is owned, and the reason is the terms rather than the results

A stored search cannot leak results — they are re-resolved against whoever is
asking, so another member opening the URL would see only what they are entitled
to. What ownership protects is **what somebody searched for**, which is
frequently more revealing than what they found.

Two mechanisms, neither sufficient alone: the token is random, so searches
cannot be enumerated; and ownership is checked, so a forwarded link does not
work. A search that is not yours is a **404 rather than a 403**, because "this
exists but is not yours" confirms that somebody ran it — the fact being
protected.

A guest's search belongs to their session, and **only while they are still that
guest**. Somebody who signs in afterwards is a different subject; inheriting the
session's searches would attach a stranger's terms to an account, and on a
shared computer that stranger is a real person.

#### The flood check is the insert

`search.flood_seconds` and `flood.bypass` were specified in
`docs/mybb-parity.md#flood-intervals` long before this feature existed — an
interval cannot obey R4.2's numeric rule, because the most permissive value is
the smallest non-zero one and MAX gets that exactly backwards. F73 is the first
consumer.

The check runs **inside the insert** as a `not exists`, so the check and the
write are one statement. A read-then-write check has a window between them, and
search flooding is precisely the traffic that arrives twenty requests at once —
the race is the attack, not a footnote.

Guests are throttled by a **hash of their session token**, never the token. They
need an identity here for two things, paging and rate limiting, and both work on
an opaque key — while `searches` is a table that exists to be pruned, listed and
read by operators, so a live credential in it would make every one of those a
credential disclosure. Throttling all guests as one bucket was the alternative,
and it is a denial of service wearing a rate limit's clothes: one visitor
searching locks out the rest.

#### A third unprovable guard, removed

The insert originally short-circuited on `floodSeconds <= 0` as well as running
the interval check. No mutation of that clause could fail a test: subtracting
nothing from `now()` leaves `now()`, no existing row was created after it, and
the insert proceeds anyway. Removed — the third time this session, after F71's
`lastIndex` reset and F72's duplicate scope check. The pattern is worth naming:
a guard added because it *reads* as careful, covered by arithmetic that already
says the same thing.

#### The merge map caught this feature's table

`searches.user_id` failed F67's schema-driven coverage test the moment the
migration landed — the second time that guard has caught a later feature. It is
**discarded** on merge rather than reassigned: not a credential like the rest of
that list, but a record of what somebody typed, pruned on a schedule anyway, and
costing the winner nothing to lose. Reassigning would hand one person's search
terms to another account, and a merge is routinely used on a duplicate somebody
else created.

### D80 — The discovery views are one query and one shape, and the header finally has something true to say (F74)

Five screens — New, Today, My threads, My posts, Unanswered — that a member
uses more than any other page except the board index. They share a repository
with one private `page` helper, which is the whole design decision.

#### Four questions, one statement

Every view differs from the others by exactly one predicate: `last_post_at >=`
an instant, `reply_count = 0`, `author_user_id =` somebody, or an `exists` over
their posts. Everything else — the permission filter, the content-scope filter,
the keyset predicate, the ordering, the forum join — is identical, and five
copies of that would be five places for it to drift. The one that drifts is
never the one somebody is looking at.

The permission filter is F72's rule and F47's `visibleIn`, and for the reason
D78 states: filtering a fetched page returns twenty threads as three and
computes the cursor from rows the viewer cannot see. **An empty scope returns
nothing without a query running** — the mutant that omits the `in (…)` clause
for an empty list shows a member with no visible forums the entire board, and
that is the first test in the file.

#### They are thread listings, not post listings

"What is new" is a question about conversations. A thread with forty new
replies is one row a member wants to see, not forty — MyBB's own search-based
"new posts" answers it the other way and buries the rest of the board under one
busy thread. The row carries its forum's title *and slug*, because these lists
cross the whole board and two identically named threads in two forums are
otherwise indistinguishable; both come off the join that was already there,
because fetching them per row is the N+1 the budget test exists to catch.

#### "New" is a day, and that is a named limit rather than an oversight

"Since your last visit" is what a member reads into the label, and it is not
what this ships. A real one needs the per-thread read state F32 keeps, which
would mean either a join per row or a second query per page — and the budget
this feature is specified against (`packages/testkit/src/discovery-budget.test.ts`)
is one query, measured on two board sizes so a per-row walk cannot pass on a
small fixture. The day window is what MyBB's "today's posts" effectively is,
it is honest about what it shows, and the limitation is written in the code at
the line that implements it rather than only here.

#### "Today" is the viewer's today

F57 gave members a timezone and this is the first feature whose *results*
depend on one rather than its labels. A member in Auckland asking at 9am must
not be shown the previous day because the server is in London. The boundary is
computed by **measuring the zone's offset at that instant**, not by string
arithmetic, so the clocks-change day is right — an hour is exactly enough to
drop the morning's threads, and the failure looks like a quiet board rather
than a bug. An unrecognised zone falls back to a day window: a stored
preference is not a reason to 500 one member's page and nobody else's.

#### `unanswered` trusts the board's own counter

`reply_count = 0`, not a count of posts. A thread whose only reply was deleted
is unanswered again, and `reply_count` is the answer every other screen already
shows — F38 maintains it and its recount repairs it. Counting posts here would
be a second opinion, and the drift would appear only after a deletion, which is
exactly when somebody is looking.

#### "Threads I posted in" is an `exists`, not a join

A join returns one row per post, so a member with two hundred posts in one
thread fills the page with one conversation — and the `limit` applies *before*
any de-duplication, so the page is also short. The `exists` is inside the same
statement, which is what keeps it one query; the version that fetches the
member's post ids first is two, and the first of those grows with how much they
have written.

The subquery carries the viewer's content scope too. A member whose only post in
a thread was removed should not find it under "threads I posted in" — the post
they are looking for is not there.

#### A refusal, not an empty list

The two personal views need a signed-in member, and the page says so and offers
the sign-in link. "No threads" and "you are not signed in" render identically
and lead to opposite next actions. The tab strip still shows all five to a
guest, deliberately: somebody already on the page is looking for the list, and
being told how to reach it beats the tab not existing.

#### The header's navigation was empty for fourteen features

`HeaderModel.navigation` has been part of the theme contract since F27 and
every caller passed `[]` — correctly, per `buildHeaderModel`'s own comment: a
builder that guessed would advertise pages that 404. F74 is the first phase
where enough of them exist *and* the first feature that needs one, because a
discovery view nothing links to is a page only its author knows about. The
personal entry is omitted for a guest rather than shown and refused; a
permanent header entry that always refuses teaches people to ignore the header.

Fourteen mutants killed: the empty-scope filter dropped, the keyset tie-break
dropped, the thread visibility filter dropped, the post visibility filter
dropped from the `exists`, the `exists` replaced by a join, `>=` narrowed to
`>`, `reply_count` replaced by a post count, the zone offset dropped, its sign
flipped, the view guard made prefix-matching, `mine` and `participated`
swapped, `today` collapsed into `new`, a guest given an empty list instead of a
refusal, and the navigation made identical for guests and members.

### D81 — Presence is a session, invisibility is subtraction-proof, and statistics are a rollup (F75)

Who is online, what the board is worth in numbers, and the ability to browse
without appearing in either.

#### The columns F17 built and nothing read

`sessions.location_path`, `location_forum_id` and `location_thread_id` have been
in the schema since `0000`, and `touchLocation` — a conditional UPDATE whose
throttle *is* its `where` clause — since F17. Neither had a caller until now.
The writer goes in the page shell beside `touchActivity` for the same reason:
the shell is the one place every reading page passes through, so no page can
forget.

The path arrives from the proxy as a header rather than being threaded through
every page. A Server Component cannot ask for its own URL, and a page that
forgot to pass one would silently record the wrong location. The **path only** —
the query string is dropped, and dropped again in `parseLocation` rather than
trusted: a stored search's token (F73), a moderation filter and a page number
all live there, and none of them belong in a table that an online list reads.

#### Sessions, not `users.last_active_at`

Both exist and they answer different questions. `last_active_at` is *when this
account was last seen*, which is what a profile shows. A session row is *a
visitor who is here now* — and it is the only one of the two that can count
guests at all, or say what anybody is looking at. Guests are most of a real
board's traffic, and a list that counted only members would report a fraction of
it.

One row per visitor, not per session: somebody on a phone and a laptop is one
person, and `distinct on` keeps their most recent session, which is also the one
whose location is current.

#### The location is resolved against the reader, in the repository

This is the privacy claim and it is easy to build backwards. The session records
where its owner is; what a reader is *told* is decided against that reader's
permissions — in SQL, with the forum ids and titles replaced by null when they
are out of scope. The view builder receives nulls and renders "Viewing a forum";
it has no title to leak because it was never given one.

Putting that decision in the view instead would mean every theme that rendered
the panel, and F76's feeds, and any future API, would each have to make the same
choice again. One of them would get it wrong.

The thread needs **both** checks: its forum must be nameable *and* the thread
itself must be in the reader's content scope. A moderator reading a soft-deleted
thread in a public forum must not put its title on the front page.

#### Invisible means absent from the count, not just the list

Hiding somebody from the list while still counting them leaves invisibility as a
puzzle solved by subtraction — "eleven online, ten listed" names them as surely
as printing their name. So the drop happens *before* the count is taken. Staff
see them, marked with text rather than a colour, because moderating requires
knowing who is present.

The **record** counts everybody, invisible included. "Most ever online" is a
fact about the board's traffic, not about who anybody may see; deriving it from
a filtered list would make the record depend on how many members had a
preference set. It is a separate, cheaper query for that reason.

#### The record is written by its own `where`

`recordIfHigher` compares in the `where` clause, so two peaks arriving together
keep the higher — the only case where this differs from reading the record and
writing it back, which is to say the only case worth writing code for. Equal is
not higher: a record that moved on equality would rewrite its timestamp every
quiet afternoon, and "most ever online: 5, an hour ago" would stop meaning
anything.

#### The totals are a rollup, and the page says when it ran

`member_count` is a count of `users`, and the board index is the most-requested
page there is. Computing it per view is a sequential scan on the front page of a
board with two hundred thousand accounts. So a task recomputes it every five
minutes — the same interval as `views.flush`, because the two numbers most
visible to a member are a thread's view count and the board's post count, and
having them drift by different amounts is worse than both being five minutes
old.

The interval is also the **resolution of the record**, which is why it is not
slower: an hourly task would miss any peak that did not last an hour, which is
every peak worth recording.

Thread and post totals are summed from the **root forums**, where F38's ancestor
rollup has already accumulated the whole tree. Counting `threads` and `posts`
directly would be a second opinion that drifts from the number every forum row
already shows — and the drift appears after a deletion, which is when somebody
looks. Summing *every* forum instead of the roots double-counts the tree: eight
threads reported as twelve.

`computed_at` is null until the first run, and the panel says "not counted yet"
rather than showing three convincing zeroes. Zeroes on a board with content are
the worst of the three possible outputs, because nobody doubts them.

#### `board_stats` is one row, and the database enforces it

`id` is a smallint that is always 1, with a check constraint. "There is exactly
one row of board statistics" becomes something the database holds rather than
something every reader hopes for, and a second row inserted by a well-meaning
script cannot silently become the one a query reads first. A key/value table was
the alternative: it makes reading six numbers six rows and makes updating all
six atomically impossible — which matters, because a page showing last hour's
thread count beside this minute's post count is worse than one that is uniformly
ten minutes old.

#### Top posters is not permission-filtered, and that is deliberate

A post count is on every profile and beside every post already. Filtering the
leaderboard by which forums a reader can see would mean recomputing every
member's count per reader — an aggregate over `posts` per page view — to hide a
number that is public everywhere else. The two *thread* leaderboards are
filtered, because a "most viewed threads" table that included the staff forum
would be a leak with a ranking on it.

#### `HeaderModel.navigation` and two theme slots stop being empty

`BoardStats` and `WhoIsOnline` were declared in `slots.ts` at F25 with the note
"named now; F75 supplies the data", and the board index passed `null` for both
regions with a comment saying a "0 members online" panel is a lie with a number
in it. Both are filled here, and both still render nothing when there is no
store — the distinction between "no panel" and "zero" is kept, not collapsed.

#### Two duplicates removed rather than kept

Mutation verification found two places where the same fact was stored twice.
`locationOf` checked `forumId !== null && forumTitle !== null` when the
repository gates both on one predicate and the title column is NOT NULL, so no
mutation of the first half could fail a test. And the view model carried the
repository's `total` when it is exactly `members.length + guestCount` by
construction. Both were reduced to one source. This is the same finding as F71's
`lastIndex` reset and F73's `floodSeconds` guard, in a new shape: not a guard
that reads as careful, but a *number carried twice* — and a second copy that no
test can distinguish is a second copy that will diverge silently.

Twenty-two mutants killed across the four modules: invisible members counted
after being filtered, the forum title returned regardless of scope, the thread
named on the forum check alone, an empty forum list read as "no filter", one row
per session instead of per member, a record that moves on equality, revoked
sessions counted as present, the record derived from the visible list, the tree
double-counted, inactive accounts counted as members, a pending registration
announced as the newest member, the thread leaderboards' permission filter
dropped, the two orderings collapsed, `computed_at` never stamped, the location
falling back to a path, the thread branch removed, the invisible marker dropped,
the query string kept, the route pattern loosened at both ends, the record given
the member count instead of the online count, and the two writes given separate
clocks.

### D82 — Everything syndicated is rendered as a guest, and the canonical points at the page you are on (F76)

Feeds, a sitemap, `robots.txt`, canonical URLs and social metadata. Five
surfaces, one rule, and one bug this feature's own tests found.

#### The rule: a syndicated surface is rendered as a guest, always

Not "as whoever asked". Every URL in this feature is fetched by something that
**caches one response and hands it to everybody**: aggregators, crawlers, link
unfurlers, corporate proxies, the CDN in front of the board. A feed built for a
signed-in member and cached under a shared URL is a private forum served to
whoever asks next — and the leak happens in somebody else's cache, where nothing
about the request that caused it is visible.

So `publicScope()` builds its scope from `actorSource.buildGuest()`, explicitly,
even when a member's cookie is on the request. The cost is real and small: a
feed shows what a signed-out visitor would see. The alternative is a response
that must never be cached, which is not a feed.

That decision is also what makes the caching headers safe to write down. A
response marked `public, max-age=300` and a body containing nothing
viewer-specific are the same claim stated twice; getting them consistent is the
whole safety argument.

#### F47's guard finally has a feed to fire on

The F47 row has said since Phase 4 that feeds and search were the two read paths
its guard had nothing to check. Search arrived with F72 — and the guard caught
it on the first run. Feeds arrive here, and the leak suite is written as the
guard's counterpart: seed a private forum *and* a hidden thread in a public
forum, then assert the private title, slug and body appear nowhere in the
output. Not "the ids are absent" — a leak through a feed is a leak of text.

The second half of that pair is the one a forum-id filter alone misses, and it
is why the suite has two fixtures rather than one: a thread awaiting moderation
sits in a forum a guest may read, and every content check has to be asked
separately from the forum check.

#### A thread feed checks the thread, not just its posts

`recentPosts` filters on the thread's visibility *and* the post's. A feed URL is
a bare id, so answering it because the posts are visible would publish a thread
that is not — at an address anybody can guess. The mutant that drops the thread
check survived the first version of the leak suite, which had only a private
*forum* to test against; closing it needed a hidden thread with a visible post
in it.

#### A private forum's feed is a 404, and so is a nonexistent one

The same answer, deliberately. Distinguishing them turns the route into an
oracle for which forum ids are private, answered without a cookie, cheaply, in a
loop. An empty feed was the other option and is worse: a reader subscribed to a
feed that quietly starts returning zero entries shows nothing for as long as the
condition lasts, while a 404 appears in the reader's own error list.

#### The canonical points at the page you are on

Not at page 1. A thread's page 4 is a distinct document with distinct content,
and a canonical naming page 1 asks a crawler to drop three quarters of the
thread — the single most common way a forum ends up with only its first pages
searchable. What the canonical *does* collapse is the surplus: `?post=812`,
`?after=…` and `?reveal=…` are three URLs for one document, and only the page
number survives.

Page 1 is the bare path rather than `?page=1`. Both work; one of them is what
every link on the board already points at, and a canonical that disagrees with
the site's own links is one the crawler has to arbitrate.

#### `JSON.stringify` is not enough for JSON-LD, and a test found it

The first version of the thread page's structured data used
`JSON.stringify(record)` inside a `<script type="application/ld+json">`, with a
comment saying that was safe because `stringify` escapes what needs escaping.
**It does not escape the forward slash.** A thread titled
`</script><script>alert(1)</script>` serialises to exactly that text, the HTML
parser ends the block at the first `</script`, and the rest of the title becomes
markup in the document. The JSON is well formed the whole time; the injection is
in the layer underneath it.

The test asserting "no `</script>` in the output" failed on the first run, which
is the only reason this is a paragraph in a decisions file rather than a
vulnerability. The fix is `jsonLdScript`, which escapes `<`, `>` and `&` as JSON
`\uXXXX` escapes — valid JSON with the same value — plus U+2028 and U+2029,
which are legal inside a JSON string and are literal line terminators to a
JavaScript parser. It is a function rather than a note in a comment because a
note is something the next page to add JSON-LD has to remember.

#### The sitemap is an index from the first thread

Even on a small board. At the target volume a single document is hundreds of
thousands of URLs, and switching shapes later means every crawler that cached
the old one has to rediscover the new. Chunks are keyset-paged **on the id,
ascending** — not by activity, because a crawler works through them over hours
and a boundary that moved whenever somebody posted would make the crawl skip
threads and revisit others.

`sitemapBoundaryId` is the one OFFSET in this codebase, and it earns it: the
index names the chunks by number before any chunk exists, so a chunk has to find
its own start from that number alone. It returns a single id, and it answers
**null rather than zero** past the end — zero means "start at the beginning", so
collapsing the two would serve the first chunk's threads at
`/sitemap/threads-99.xml`: the same content under a second URL, published to
crawlers by the document whose whole job is telling them what to crawl.

#### `robots.txt` is not a security boundary and is not treated as one

It disallows the *computed* views — search, discovery, the online list, the
statistics page — because each is a per-request computation over content that is
already indexed at its own URL, and `/discover/new` is a different page every
hour, which is the definition of something a crawler never settles on.

No content path is listed. A `Disallow: /forum/9-secret` would be a map of the
board's private forums served to the whole internet. Every private route named
in that file is one anybody can already find from the header, and every one is
refused server-side regardless.

An offline board (F08's `board.offline`) refuses everything, and the sitemap
404s with it. A crawler does not know a maintenance page from a board — it will
index it, and the board's search results become its downtime notice for as long
as the recrawl takes.

#### The dependency guard was half-blind, and this feature is what showed it

`no-orphans` fired on the two new view modules. They are not orphans: they are
imported by route handlers under `app/`. The cause is that dependency-cruiser
reads path aliases from `tsconfig.base.json`, which holds the `@forum/<name>`
workspace aliases and deliberately **not** `@/*` — that one belongs to the app
alone, and putting it in the base config would let any package resolve `@/…`
into the app.

The consequence was never a loud failure. Every `@/…` edge from `app/` was
invisible, so any module under `src/` imported *only* by a page or a route
handler looked like dead code, and every rule matching a path silently never
fired on those edges. That is the same failure mode the config's own `tsConfig`
note describes from the other direction: a guard reporting a clean run because
it cannot see the graph. F76's two modules are the first in this repo imported
from `app/` and nowhere else, which is why it took this long to surface.

Fixed by giving the tool the alias through a `webpackConfig` — its schema does
not accept `enhancedResolveOptions.alias` — and the file repeats the extension
list, because supplying a webpack config *replaces* the resolver defaults rather
than adding to them; without that the module count drops by a fifth. Verified
with a probe: a domain package importing `@forum/db` still errors.

Adding the two files to the orphan exemption list would have made the warning go
away and left the blindness in place. That is the fourth time this session a
check has been the thing to fix rather than the thing to satisfy.

Seventeen mutants killed: the forum feed's scope replaced by the requested id,
the thread scope dropped from the board feed, the thread scope dropped from a
thread's post feed, the opening-post join made inner, the join keyed on the
thread so one conversation fills the feed, the sitemap boundary's scope dropped,
the sitemap chunk ordered by activity, the boundary's null collapsed to zero,
XML escaping reordered so output is double-escaped, control-character stripping
removed, Atom given RSS's date format, the summary always broken on the last
space, `lastmod` defaulted to now, the sitemap index rendered as a sitemap, the
canonical pinned to page 1, `prev` pinned to page 1, and the JSON-LD escape
removed.
