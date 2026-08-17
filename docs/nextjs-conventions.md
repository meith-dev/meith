# Next.js conventions

The decisions that would otherwise be re-litigated in every pull request.
Link this from your PR description.

> [!NOTE]
> Everything here is drawn from code that exists. The file paths are real,
> and the failure each rule prevents has actually happened in this
> repository. If you need to depart from a rule, say so in the PR
> description rather than quietly doing something else.

## The rules, in one table

If you read nothing else on this page, read this.

| Rule | Where it is enforced |
|---|---|
| `app/` reads through the container, not `@meith/db` | Guard `no-db-in-app-routes` — two admin pages are exempted by name |
| `"use client"` on leaf components only — never a page, never a layout | Review, and `pnpm slots:check` for themes |
| Every Server Action re-checks authorization itself | Review |
| `redirect()` goes **outside** the `try` | Review |
| Never return a credential in `FormState` | Review — this shipped once, as an account-takeover hole |
| `logger()` is called where you log, never bound at module scope | Guard `no-module-scope-logger` |
| Cache tags are spelled once, in `CacheTags` | Guard `no-literal-cache-tag` |
| A cached region never reads `cookies()`, `headers()`, `getActor()` or `getUserId()` | Guard `no-request-state-in-cache` |
| Every counter has a recount | Review |
| Event handlers are idempotent | Review |
| A slot never renders another slot | Guard `no-slot-rendering-slot` |
| View models are JSON-shaped | The compiler, via `Serialisable<T>` |

A rule enforced by a guard is one you hear about from `pnpm verify`; a rule
enforced by review is one where nobody has found a pattern that separates
the violation from legitimate code that resembles it. The sections below
explain what each review rule is actually asking for, because for those the
reviewer is the enforcement.

The guards themselves live in `scripts/guards.config.mjs` — fourteen in
all. The table above names the five that encode conventions from this page;
the others hold invariants documented elsewhere (a single environment
reader, no `next` imports in domain packages, no ad-hoc visibility queries,
no hardcoded colours in `.tsx`, no locale-dependent case folding, and so
on). `pnpm guards:probe` holds every guard to three conditions: it must
fire on a violating sample, spare a legal one, and match at least one real
file. The third condition catches rot — a guard whose paths stop resolving
matches nothing and reports success forever, which is worse than no guard,
because this table says the rule is covered.

---

## Where things live

```
apps/community/
  app/                  Routes only: page.tsx, layout.tsx, route.ts
  src/server/           Server Actions, the container, request context
  src/view/             Typed page view models (the theme-facing contract)
  src/components/       App-specific components; theme slots live in themes/
  proxy.ts              Cookie triage and the CSP nonce. NOT authorization.

themes/default/
  src/theme.ts          The manifest: defineTheme({ slots: { … } })
  src/slots/            One file per slot. Its "use client" status is checked.
  src/tokens.ts         The typed mirror of globals.css. Kept in sync by a test.
```

A file under `app/` should be short enough to read in one screen. If a page
is long, the length is either domain logic that belongs in a package, or
view-model assembly that belongs in `src/view/`.

**`app/` reads through the container in `src/server/container.ts`, not
`@meith/db`.** The container is what keeps a route testable without
Postgres and what lets `DATA_SOURCE=fixture` serve a whole board from
memory; a route that reaches past it works on a machine with a database and
500s on the demo.

Guard `no-db-in-app-routes` holds this. Two admin pages
(`admin/users/[id]/merge`, `admin/forums/[id]`) predate it and are exempted
by name in `scripts/guards.config.mjs`. Adding a third means adding your
own path to that list in the same commit — which is the point: the
exemption is visible in review instead of indistinguishable from a file
nobody checked.

---

## Panel surfaces

The control panel is a stack of panels on a page, and the page is a light
grey so that `card` — plain white — reads as something sitting on it. A
section that draws a border and leaves its fill to the page is invisible as
a panel: the border is doing work the surface should do, and on a long
screen the eye has nothing to group by.

Four constants in `src/components/shell/panel-list.tsx` are the whole
vocabulary, and a panel screen should reach for one rather than write the
classes out:

| Constant | What it is |
|---|---|
| `PANEL_CARD` | A section of the page: bordered, filled with `card`, raised by `shadow-elevation`. |
| `PANEL_LIST` | The same surface as a list of rows, divided rather than padded. Rows use `PANEL_ROW`. |
| `PANEL_NOTE` | The empty state or aside that stands in for a card — same surface, muted text. |

Vary one with `cn(PANEL_CARD, 'gap-2 text-sm')`; `cn` merges through
tailwind-merge, so the later class wins. **Do not nest one inside
another** — two `card` surfaces stacked are indistinguishable. A subsection
inside a card keeps its border and drops its fill, and content the panel
does not own (a plugin's rendered page) sits on `surface`, the band cut
into the page, so the cards a plugin brings still read as raised.

---

## Server Components by default

`"use client"` goes on **leaf interactive components only** — never a page,
never a layout.

The rule exists because of one number: a guest thread page must ship
near-zero JavaScript. Marking `PostBit` as a client component would send
the entire post list to the browser and give away the product's main
advantage. `theme-kit` declares a server/client kind per slot, and the
build fails if a theme crosses it.

In practice the split looks like the auth forms:

- `src/components/auth/login-form.tsx` — `"use client"`, because it calls
  `useActionState`.
- `app/(auth)/login/page.tsx` — a Server Component that resolves
  `searchParams` and renders the form.

The page stays a Server Component even though its child is not. That is the
shape to copy.

The one file under `app/` that carries `"use client"` is `app/error.tsx`,
and that is the framework's requirement rather than a judgement call: an
error boundary has to be a client component to catch anything. It is
neither a page nor a layout, so it is not the exception it looks like —
but it is the only `"use client"` in the whole of `app/`, and a second one
wants explaining.

**Anything crossing into a client component must be plain serialisable
data.** No class instances, no `Date` inside a nested object you have not
checked, no functions other than Server Actions. Already-rendered markup is
the exception the framework itself makes: a `ReactNode` produced by a
Server Component travels as a prop, which is what lets a client boundary
show server-rendered output it could never have built.

### The error page renders through the theme

`app/error.tsx` is a client component and therefore cannot resolve a theme:
no `cookies()`, no `await`, no slot lookup. It gets the themed markup handed
to it instead.

`renderErrorNotice()` in `src/server/error-notice.tsx` resolves the active
theme's `ErrorNotice` slot, runs the model through `view.error-notice`, and
returns the rendered node. `not-found.tsx` calls it directly, because a
Server Component can. The crash page cannot, so the root layout calls
`crashNotice()` — the same work with the crash copy, swallowing a failure
instead of throwing — and wraps the tree in `CrashNoticeProvider`, which
sits above the error boundary. When the boundary catches, it reads markup a
Server Component already produced and puts it on the page. Two error pages,
one slot, same copy path.

Three things follow:

- **The notice is prepared on every request**, because by the time the
  boundary runs, the request that needs it has already failed. The cost is
  one slot render and one filter pass over a plain model — `ErrorNotice` is
  specified to need no database read of its own, which is what keeps paying
  it on every page affordable.
- **A theme that cannot render its own error does not take the page with
  it.** `crashNotice()` returns `null` rather than throwing, and
  `CrashNotice` falls back to a plain bordered notice carrying the same copy
  and the same request id. A crash page that crashes is worse than a plain
  one.
- **The request id belongs to the render that prepared the notice.** On a
  full page load that is the request that failed. After a client-side
  navigation the layout is not re-rendered, so the id is the one from the
  load that put the frame there.

The crash page has no "try again" button. Recovery is a client-only
affordance, the slot is what the theme owns, and a themed page with one
unthemed control on it is the problem this arrangement exists to solve.

---

## Server Actions

Server Actions live in `src/server/*-actions.ts`, marked `'use server'` at
the top of the file.

### The adapter shape

An action is a **thin adapter**: parse `FormData`, validate, call a command
in a domain package, redirect. The actions in `auth-actions.ts` all follow
this shape, and new ones should look boring next to them:

```ts
export async function createThreadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const title = field(form, 'title')          // 1. read FormData
  const actor = await getActor()              // 2. who is asking

  const { threads, authorizer } = getContainer()
  try {
    authorizer.require(actor, 'thread.post', target)   // 3. re-check authz
    await threads.create({ ... })                      // 4. call the command
  } catch (err) {
    return toFormState(err, { title })                 // 5. domain error → state
  }

  redirect(`/thread/${id}`)                            // 6. redirect on success
}
```

### Rules that are not negotiable

**Every action re-checks authorization itself.** Rendering the form is not
authorization — an action is a public HTTP endpoint, and nothing stops
someone POSTing to it directly. `proxy.ts` is not a boundary either; it
only decides whether to bounce a cookie-less request on a protected prefix
to `/login`.

In practice the check is a `require*()` call — `requireAdmin()`,
`requireUserAdmin()` and their kin — that throws a `ForbiddenError` the
`catch` turns into a `FormState`. It is often one hop down, in a helper the
action delegates to rather than in the exported function itself, which is
why this stays a review rule: no textual pattern separates an action that
delegates its check from one that never had it. When you review an action,
follow the hop. The actions that legitimately have no check are the
pre-auth ones — login, register, password reset, install — and
`unsubscribeByTokenAction`, where the token in the URL is the credential.

**`redirect()` goes outside the `try`.** It works by throwing, so a `catch`
that swallows it turns a successful action into a silent no-op. Look at
`auth-actions.ts`: every `redirect` is after the `try/catch`, never inside.

**Return a serialisable `FormState`, never throw to the client.** Domain
errors (`ValidationError`, `ConflictError`, `ForbiddenError`) are the
expected failure channel and become a message on the form. Anything
unrecognised is logged and becomes a generic message — see the
`toFormState` helpers each action file builds with `formStateReporter`.

> [!CAUTION]
> **Never return a credential in `FormState`.** It is serialised into the
> client payload. This is not hypothetical: the password-reset action once
> returned a live reset token to the browser, and it was an
> account-takeover hole.

The rule has exactly one exception in the codebase, and it is worth knowing
about because it looks like the bug above. `requestResetAction` returns the
reset token as `values.devToken` when `env.NODE_ENV === 'development'`, so
a board run locally without a mailer can still finish the flow;
`reset-request-form.tsx` renders it as a link. Two tests in
`auth-actions.test.ts` pin both directions — the token is returned in
development and withheld everywhere else.

What makes it safe is the environment gate, so treat that gate as
load-bearing. `NODE_ENV` defaults to `development` in
`packages/core/src/env.ts` when unset; the shipped `Dockerfile` sets
`production` explicitly. A deployment that runs the app some other way and
leaves `NODE_ENV` unset serves reset tokens to anyone who submits the
form. Nothing else in `FormState` gets this exception, and a second one
should be argued for in the PR rather than copied from here.

---

## Forms and `useActionState`

Every page on the no-JavaScript list must work with JavaScript disabled.
That is a hard requirement, not an aspiration, and it shapes how forms are
written. The list is not prose: it is the `e2e/*-no-js.spec.ts` suite,
which drives the real pages with scripting turned off. Adding a page to the
list means adding a spec there.

- The `<form action={...}>` must work as a native submit. No `onSubmit`, no
  `preventDefault`, no client-side validation the server does not repeat.
- `useActionState` renders the error the action returned. With JS off the
  page re-renders server-side and shows the same message.
- Echo the user's input back in `FormState.values` so a failed submit does
  not blank the form — **except the password**.

> [!IMPORTANT]
> **Islands enhance; they never enable.** If removing a client component
> breaks a page, it was not an island. Write the server path first and the
> island second.

### Forms that live in a theme slot

A page whose whole content is a form — the composer, and every editor after
it — splits in two: the **theme** renders the page around it, and the
**app** renders the `<form>` into a region. The reason is mechanical rather
than stylistic: the form element carries a Server Action reference, and
those are not plain data, so they never cross the theme contract. Controls
are built from the shared token-styled primitives in
`src/components/auth/form-controls.tsx`, which is what keeps an app-owned
form looking like part of the theme.

A slot model should not carry a prop no theme can fill. If a value only
exists after a submit — a preview of what was typed, a per-field error — it
belongs inside the form region, not in the view model.

---

## Errors

Use the taxonomy in `@meith/core`: `ValidationError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`, `RateLimitedError`. Each maps to a
status and a rendered page.

Throwing a bare `Error` for a user-facing failure is a bug: callers key off
the taxonomy. `saveSettings` once threw a plain `Error` on an invalid
value, which would have shown "Something went wrong" in the admin panel
instead of the actual problem.

---

## Logging

`logger()` is called **where you log**, never bound at module scope:

```ts
// Wrong — guarded by `no-module-scope-logger`.
const log = logger({ module: 'x' })

// Right.
logger({ module: 'x' }).warn({ err }, 'something')
```

A module-level instance captures the request context once at import time
(that is, empty), so every line loses its `requestId` — and it builds pino
eagerly, which reads `env` and turns importing the module into an
environment validation. That broke `next build` once.

Never log a password, a token, or a full IP at default level. Pino's
redaction covers `token`-shaped keys but **not** a token interpolated into
a URL string, which is how one escaped.

---

## Caching

Read `packages/core/src/cache.ts` before caching anything.

- **Every tag name is spelled once**, in `CacheTags` — guarded by
  `no-literal-cache-tag`. Never write a tag as a literal: a writer
  invalidating `"forum-tree"` while a reader cached under `"forumTree"` is
  stale data no test catches, because both sides pass in isolation and only
  disagree in production.
- **`cachedGlobal` is for global data only.** If a value varies by actor it
  must not go through it.

  > [!CAUTION]
  > A cached permission-filtered page is how private forums leak. This is
  > the reason the caching harness exists at all.

- **Invalidate after the write, never before.** Clearing first opens a
  window where a concurrent read repopulates from the pre-write state and
  nothing clears it again. `CachedForumRepository` pins this ordering with
  a test.
- A cached region may not read `cookies()`, `headers()`, `getActor()` or
  `getUserId()` — guarded by `no-request-state-in-cache`.

---

## Counters and event handlers

A denormalised counter has three obligations, and a change that adds one
has to satisfy all three — the thread and forum counters are the worked
example:

- **Write it in the transaction that writes the content.** Counters and
  the row they describe move together or not at all.
  `applyCreatedContentCounters()` takes the caller's transaction handle for
  exactly this reason — it has no ambient database handle to reach for.
- **Emit the event in the same transaction.** Anything that cannot be
  afforded inside the request — an ancestor walk, a fan-out — goes through
  the outbox, so a rolled-back write emits nothing.
- **Give it a recount.** Incremental maintenance drifts. Every counter
  needs a path back to a computed truth, batched and resumable
  (`PostgresCounterRecount`). A counter with no recount is a number that is
  wrong forever after one crash.

Event handlers live in `packages/runtime/src/event-handlers.ts` and are
built per container, never registered onto a module-level singleton —
registration throws on a duplicate id, and a dev server re-evaluating the
module would hit that on its second pass.

**Handlers are idempotent, without exception.** The relay marks an outbox
row dispatched after the enqueue returns, and the queue re-runs a job whose
worker died mid-handler, so every handler is delivered at least once and
sometimes twice. A handler that writes a *computed* value gets idempotency
for free; one that applies a **delta** must record what it has applied —
the counter roll-up ledger is the pattern to copy.

---

## Theme slots

Read `packages/theme-kit/src/slots.ts` before adding a page.

**Every slot declares `server` or `client`, and there are two client
slots.** Both are editor islands. Adding a third means editing the test
that pins the set (`slots.test.ts`) — deliberate friction, because a client
slot is bytes shipped to every viewer of the page it appears on.

`pnpm slots:check` fails the build if a server slot's module starts with
`"use client"` — *and* if a client slot's module does not. The second
direction matters: such an island renders once and never becomes
interactive, which looks correct in a screenshot and does nothing when
clicked. Neither client slot is filled by a shipped theme today, so that
second direction is currently exercised by `pnpm slots:probe` against a
synthetic theme; the first theme to fill one is the first to test it for
real.

**A slot never renders another slot** — guarded by
`no-slot-rendering-slot`, which refuses `requireSlot` and `hasSlot` inside
a slot module. The page resolves both and passes the rendered one in:

```tsx
const ThreadView = requireSlot(theme, 'ThreadView')
const PostBit = requireSlot(theme, 'PostBit')

<ThreadView
  thread={vm.thread}
  forum={vm.forum}
  replyHref={vm.replyHref}
  regions={{
    posts: vm.posts.map((post) => <PostBit key={post.id} post={post} regions={{ actions: … }} />),
    pagination: <Pagination {...vm.pagination} />,
    quickReply: null,
  }}
/>
```

If `ThreadView` imported `PostBit` itself, a child theme overriding
`PostBit` would be ignored inside the parent's `ThreadView`. One place
resolves slots, so an override applies everywhere.

**Write the slot map literally in the manifest**, one bare imported
identifier per slot. A map built by spreading cannot be statically checked,
and `slots:check` fails rather than skipping it.

**A component in `src/components/` may resolve a slot; a slot may not.**
The guard is about slot modules, not the app — `PanelPage`, `PanelShell`
and `AuthPage` in `src/components/shell/` are app components that resolve
one slot each and hand it their props, which is what lets forty admin
screens render through a themed frame without forty `requireSlot` calls.
What they must not do is resolve a *second* slot to nest inside the first:
that is the page's job, through `regions`.

**Where the reader is comes from the request, not the router.** The panel
rail needs the current path to say which section is open, and reading it
with `usePathname` would make the whole rail a client component. `proxy.ts`
sets `x-forum-path` and `x-forum-query` on every request,
`currentLocation()` puts them back together, and `buildPanelNavModel`
resolves the flags before anything renders. The rail is correct in the
first response and costs no JavaScript.

---

## View models

Every page has a typed view model in `src/view/`. Pages resolve params,
build a view model, and hand it to components; they do not pass rows
around.

**View models are JSON-shaped**: no `Date`, no `Map`, no functions.
`theme-kit` proves this at compile time for every slot model. The reason is
not React — it is that a view model is also the REST API's payload, and
that a `Date` pushes formatting into every theme, where it becomes a
timezone-dependent hydration mismatch. A timestamp crosses as `TimeModel`
(`iso` plus a preformatted `label`); paging crosses as resolved hrefs,
never a function that builds them.

### Paging: one builder, and one page parameter

Every paged list — the members list, the logs, the queues, the inbox, a
forum's threads, a thread's posts, a search — pages by number. The page is
`?page=N`, the rows come from `limit … offset`, and the pager is built by
`buildOffsetPager` in `src/view/pager.ts` and handed to the `Pagination`
slot. Pages do not hand-roll a "Next" link; that is how the board once
ended up with eight of them, each with its own idea of which query
parameters survive a page turn.

Two helpers keep the arithmetic in one place: `readPage` reads the
parameter and treats anything that is not a page (a zero, a negative, a
word) as page one, and `offsetOf(page, size)` is what the repository is
given. **The offset never comes from the URL** — only the page number
does, so no address can ask a repository to skip an arbitrary number of
rows.

Every list's repository therefore answers two questions, and the count is
of *the filter*, not of the table:

```ts
const [rows, total] = await Promise.all([
  repository.list({ ...filter, limit: PAGE, offset: offsetOf(page, PAGE) }),
  repository.count(filter),
])
```

Some counts are already denormalised and need no query: a forum knows its
`threadCount`, a thread its `replyCount`, and the queue and the report desk
already count what is open for the badge in the rail. Use those rather
than adding a second `count(*)` to a hot page.

**Keyset paging is still there, and is still the right answer for an
API.** The cursors did not go away: `after` on a forum's thread listing, a
thread's posts and the search results. The REST API pages with them,
because a cursor cannot skip or repeat a row when the set changes
underneath a client walking it. The screens page by number because a
reader wants to jump to page 9 and hand somebody the address, and because
"of 12" is a fact a reader can act on. `pageCountIsExact` tells a theme
which of the two it has: `true` from `buildOffsetPager`, `false` from the
cursor pager that remains for anything paging without a total.

The cost is the usual one: a deep offset makes Postgres walk the rows it
is skipping. That is a real limit at page 900 of a hot table and not one
this board's screens reach; when it is, the fix is a covering index or a
hybrid that seeds the offset from a cursor — not a return to next-only
links.

**Never link to a route that does not exist.** The user-panel builder
earned this rule: while the profile and control-panel screens were
unbuilt, `buildUserPanelModel` returned an empty link list rather than
advertising pages that 404. The screens exist now and the list is
populated — the rule outlives the example, so when a view model covers a
page that is not built yet, render the absence.

**Never expose a database row to a component or an API response.** Row
shapes change with migrations, and a component reading `row.password_hash`
because it was in scope is exactly the accident the rule prevents.

Naming: `<Page>ViewModel` for the page's model (`ThreadViewModel`), plain
nouns for the pieces (`PostBitModel`). These are a **public API** for
themes — adding a field is minor; renaming or removing one needs a
deprecation cycle.

---

## Testing

- Domain logic is unit-tested without a database.
- Anything whose behaviour is SQL semantics gets a **real** Postgres via
  PGlite (`createTestDb`), not a mock. Mocks agree with whatever you
  assumed.
- **Boot once per suite, clear tables in `beforeEach`.** Creating a
  database per test applies every migration per test and starts tripping
  timeouts.
- Any list page needs a **query-budget assertion** against the seeded
  board (`expectQueryBudget` in `@meith/testkit`). An N+1 does not fail a
  test — it passes, slowly, and only on an empty board.
- **Prove a new test can fail.** Break the code deliberately, watch it go
  red, put it back.

  > [!TIP]
  > A test that has never failed is not known to test anything.
  > `pnpm guards:probe` applies the same idea to the textual guards.

---

## Before opening a PR

`pnpm verify` runs, in order: the workspace and root checks,
`release:check`, the guards and their probes, the slot checks, the
generated-document checks (`theme:docs`, `plugin:docs`, `hooks:wired`,
`api:docs`, `perf:docs`, `docs:index`, `site:docs`), lint,
dependency-cruiser, all three typechecks, and the tests.

The docs checks matter more than their position in that list suggests.
`theme-slots.md`, `plugin-hooks.md`, `rest-api.md` and `performance.md`
are generated from the code they describe, so when one of those checks
fails, regenerate with the matching `pnpm <name>` rather than editing the
page by hand — a hand-edit is overwritten by the next run.

Run `pnpm build` as well if you touched anything under `app/` — and if you
touched a theme or a plugin, check that the classes you used are actually
in the built CSS. Tailwind scans `themes/`, `plugins/`, `examples/` and
`packages/ui/src` only because `apps/community/src/styles/globals.css`
names them with `@source` lines; a path it does not scan is a green build
that renders unstyled.
