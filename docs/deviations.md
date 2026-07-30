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
