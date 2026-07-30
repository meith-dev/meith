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
