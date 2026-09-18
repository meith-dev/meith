# Rendering, caching and view models

Keep data access, cache invalidation and theme view models consistent across pages and actions. Use this reference when a change crosses the request-to-presentation boundary.

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
