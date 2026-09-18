# Run and debug tests

Choose the test layer for the behavior you are changing. This guide covers isolated databases, coverage, browser fixtures and the screenshots used by the website.

## The database in tests

`pnpm test` needs no database. Repository tests, migrations, anything
asserting on real SQL — all of it runs against PGlite, a real Postgres
compiled to WebAssembly, booted in-process per suite with the checked-in
migration SQL applied.

The `*.pg.test.ts` files are the exception — they need a real Postgres
*server*, because the thing under test is behavior PGlite cannot
reproduce: `packages/db/src/client.pg.test.ts` exercises the client driver
PGlite bypasses, the migrate and install-repo tests need two connections
contending for a session-level lock, and
`packages/testkit/src/postgres-queue-pooled.pg.test.ts` needs each
connection to own its own backend — a wire server in front of one PGlite
funnels every client into a single backend whose one unnamed prepared
statement the connections then overwrite for each other.

They all skip unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything
except those seams — and CI covers them.

## Coverage

`pnpm test:coverage` runs the unit and integration suite with V8 coverage
and writes the HTML report to `coverage/index.html`. CI's `static` job runs
that command as its only pass over the suite — `--coverage` decides what is
measured, never what is collected, so it is `pnpm test` plus the
thresholds, not a second run.

The global thresholds prevent repository-wide regressions, and separate
floors for the worker, polls, attachments, and UI packages keep well-tested
packages from hiding a decline in those areas. Thresholds are a ratchet:
raise them when the measured baseline improves, and do not lower them
without documenting the reason in the same change. (`packages/drafts` is
interfaces only — erased at runtime, checked by `index.type-test.ts`, and
due a floor when it grows runtime behavior.)

## The browser suite

`pnpm test:e2e` starts everything it needs: a PGlite serving the Postgres
wire protocol, a built server running the standalone output against it, and
a second database and server for `/install`. There is nothing to install
and nothing to leave running.

The build comes first (`e2e/support/board-build.ts`; `pnpm test:e2e:build`
runs it alone) and needs no database — every route is dynamic, nothing is
prerendered. A cold build takes about a minute and an unchanged rebuild a
few seconds. Both servers run the same `server.js` from the same
`.next-e2e/standalone` tree, staged with `static` and `public/` the same
way `forum-web build` stages them, and differ only in `PORT`,
`DATABASE_URL` and `UPLOADS_DIR`. Running `npx playwright test` directly
skips the build and serves whatever was built last.

The suite used to drive `next dev`, whose per-route compilation made late
tests slow and CI shards fail under memory pressure; the built server
removed that mechanism rather than containing it, and the CI retry went
with it. **A browser test that fails intermittently now is a signal** —
usually a real race in the test or the product — and should be read rather
than retried. `e2e/support/flaky-notice.ts` stays wired so that if anyone
runs with `--retries` during triage, a test that failed and then passed
prints a warning instead of counting as plain green.

Navigation ordering specs create their own neighbouring menu items and
assert relative order and the intended submenu parent. They must not assume
a fixed number of arrow clicks relative to a bundled plugin link: enabling
another plugin legitimately adds a sibling to the navigation.

The `/install` database carries the schema and no rows, which is the state
a real board is in when someone opens `/install`: migrations run before the
board serves anything, and the installer checks the schema rather than
applying it.

**Most specs run with JavaScript disabled** — two-thirds of the suite. That
is the point rather than a flourish: the board's claim is that a native
`<form>` does the work and the islands are optional, so a suite that tested
only the enhanced path would prove the opposite. The JS-on specs are the
ones whose subject needs scripting — accessibility, passkeys, the content
security policy, the API, syndication, the screenshot tours — plus
`admin-panel-live.spec.ts`, an exception the rule needs: with scripting off
a form post is a full navigation, so a no-JS suite is blind to a panel
screen that does not refresh its own cached list.

A spec that needs a member **registers through the form**: the seeded
accounts carry a hash nothing can match, so the only way in is the way a
member takes. A spec that needs *staff* cannot do that, because a
registration always lands in the Registered group, so two accounts are
seeded with a real password, both named in `e2e/support/config.ts`:

| Account | Group | For |
|---|---|---|
| `admin` | Administrators | The control panel. Bypasses forum permissions. |
| `e2e_moderator` | Super Moderators | Moderation. Deliberately **not** an administrator, so the specs prove the moderator's own path rather than the bypass — and prove the panel is shut to them. |

Use `signUp`, `signInAsModerator` and `enterAdminPanel` from
`e2e/support/session.ts` rather than repeating the forms. `signUp` also
asserts the username fits the board's 30-character maximum — the
registration input silently truncates a longer one, and the sign-in that
follows fails inexplicably.

The two-factor specs read both halves of the no-JS contract at once: every
authenticator-code field renders `OtpField`, a native text input that takes
a six-digit or recovery code with scripting off and upgrades to the
`@meith/ui` `InputOTP` boxes once scripting confirms.
`two-factor-no-js.spec.ts` signs in through the fallback,
`two-factor.spec.ts` through the widget, so the enhanced path is proven
without the fallback being torn out from under it.

**The suite shares one database across every spec, in file order** —
`workers: 1`, `fullyParallel: false`. A spec that changes something every
page shows (an announcement, a board setting, a pinned thread) must put it
back, or a later file fails for a reason nothing in that file can explain.
It shares the **scheduler** too: a spec that drives background work through
`/api/system/tick` can find a task not yet due if an earlier spec ticked,
so give such a spec its own `test.setTimeout` longer than the wait it asks
for. And `DATABASE_POOL_MAX` is `1` for the suite, so queries made
concurrent with `Promise.all` still serialise on the single connection.

**Passing is not enough — the run also fails on what the board logged.**
`e2e/support/server-errors.ts` reads the server's output and fails the run
on any unhandled server error, however many tests passed. It exists because
a green run once hid fifty-six of them.

The specs are typechecked by `pnpm typecheck` along with everything else —
Playwright transpiles without checking, so an uncompiled support file would
otherwise never fail at all. **CI shards the suite across four runners**,
each with its own databases and servers; every spec seeds what it needs, so
the split is safe in any order. `.next-e2e` is deliberately not cached
between CI runs — a restored build is the stale-cache problem, and a cold
build is cheap.

A built server is production, and three harness details follow from that:

- Password-reset tokens are not readable off the page outside development,
  so `account-security-no-js.spec.ts` reads the token out of the **e-mail**
  instead: `MAIL_DRIVER=http` points the board at
  `e2e/support/fake-mail.ts`, and `e2e/support/mailbox.ts` reads the inbox
  back — exercising the reset mail end to end.
- The e2e board deliberately does not know its own address:
  `admin-panel-live.spec.ts` asserts the warning about that, and
  `passkeys.spec.ts` needs to reach the board as `localhost`. The one test
  that needs an address sets it through the panel and puts it back.
- Production session cookies are `__Host-` prefixed and `Secure`. Chromium
  sends them over `http://127.0.0.1`, but Playwright's `page.request` will
  not — `signedHeaders()` in `e2e/support/session.ts` attaches the
  context's cookies to those calls. To drop one cookie, prefer
  `clearCookies({ name })` over rebuilding the jar.

**A known pre-existing order dependency.** Run serially in one process,
`admin-tabs-no-js.spec.ts` leaves something behind that makes
`formatting-no-js.spec.ts`'s server-side highlighting and
`formatting.spec.ts`'s attachment rendering fail. CI does not see it —
those specs land in different shards — and it is recorded here rather than
fixed because it is a separate bug.

## The site's screenshots

Every image on meith.dev is a screenshot of a real board, and
`pnpm site:shots` is what takes them. They land in `apps/web/public/shots`,
and the site references them by name, so a rename there is a broken image
on the page.

It photographs the populated fixture board as a guest on port 3003, using
`e2e/screenshot-site.config.ts`. Theme previews and mobile thread captures use
the same deterministic content as local development and hosted fixture previews.
Search, Calendar and Dues need PostgreSQL and retain their existing screenshots;
recapture those separately against the database-backed browser test board when
those surfaces change.

The capture does not run on CI. Re-take images when the board's appearance
changes and commit only the images that differ. The script updates the captures
it owns without deleting screenshots of other surfaces.

For the marketplace's five theme previews, run
`pnpm site:shots --grep marketplace`, then `pnpm marketplace:gen`.
This writes light-mode captures at 1440 × 900 to `marketplace/screenshots`.
Each capture checks for populated forums and keeps the board header visible.

The Awards marketplace screenshot is captured by
`pnpm test:e2e:build && pnpm exec playwright test e2e/awards-no-js.spec.ts`.
The award workflow runs with JavaScript disabled; the screenshot uses a
separate JavaScript-enabled context with the same session and checks that
the account dropdown opens and closes. This captures the normal header
instead of the intentional plain-link account navigation used without
JavaScript. Copy the resulting `awards-light.png` from `test-results` to
`marketplace/screenshots/awards-light.png`, then run `pnpm marketplace:gen`
to update the published copy.
