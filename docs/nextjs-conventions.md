# Next.js conventions

The decisions that would otherwise be re-litigated in every pull request. Link
this from your PR description.

> [!NOTE]
> Everything here is drawn from code that exists. The file paths are real, and
> the failure each rule prevents has actually happened in this repository.
>
> If you need to depart from a rule, say so in the PR description rather than
> quietly doing something else.

## The rules, in one table

If you read nothing else on this page, read this.

| Rule | Where it is enforced |
|---|---|
| `app/` reads through the container, not `@meith/db` | Review — two admin pages currently break it |
| `"use client"` on leaf components only — never a page, never a layout | Review, and `pnpm slots:check` for themes |
| Every Server Action re-checks authorization itself | Review |
| `redirect()` goes **outside** the `try` | Review |
| Never return a credential in `FormState` | Review — this shipped once, as an account-takeover hole |
| `logger()` is called where you log, never bound at module scope | Guard `no-module-scope-logger` |
| Cache tags are spelled once, in `CacheTags` | Review |
| A cached region never reads `cookies()`, `headers()`, `getActor()` or `getUserId()` | Guard `no-request-state-in-cache` |
| Every counter has a recount | Review |
| Event handlers are idempotent | Review |
| A slot never renders another slot | Review |
| View models are JSON-shaped | The compiler, via `Serialisable<T>` |

---

## Where things live

```
apps/community/
  app/                  Routes only: page.tsx, layout.tsx, route.ts
  src/server/           Server Actions, the container, request context
  src/view/             Typed page view models (the theme-facing contract)
  src/components/       App-specific components; theme slots live in themes/
  proxy.ts              Cookie triage. NOT authorization.

themes/default/
  src/theme.ts          The manifest: defineTheme({ slots: { … } })
  src/slots/            One file per slot. Its "use client" status is checked.
  src/tokens.ts         The typed mirror of globals.css. Kept in sync by a test.
```

A file under `app/` should be short enough to read in one screen. If a page is
long, the length is domain logic that belongs in a package, or view-model
assembly that belongs in `src/view/`.

**`app/` reads through the container in `src/server/container.ts`, not
`@meith/db`.** Held by review rather than a tool — dependency-cruiser has no
rule for it — and two admin pages (`admin/users/[id]/merge`,
`admin/forums/[id]`) currently import `@meith/db` directly. Do not add a third;
the rule is the direction of travel.

---

## Server Components by default

`"use client"` goes on **leaf interactive components only** — never a page,
never a layout.

The rule exists because of one number: a guest thread page must ship
near-zero JavaScript. Marking `PostBit` as a client component would send the
entire post list to the browser and give away the product's main advantage.
`theme-kit` declares a server/client kind per slot and the build fails if a
theme crosses it.

In practice the split looks like the auth forms:

- `src/components/auth/login-form.tsx` — `"use client"`, because it calls
  `useActionState`.
- `app/(auth)/login/page.tsx` — a Server Component that resolves
  `searchParams` and renders the form.

The page stays a Server Component even though its child is not. That is the
shape to copy.

**Anything crossing into a client component must be plain serializable data.**
No class instances, no `Date` inside a deeply nested object you have not
checked, no functions other than Server Actions.

---

## Server Actions

Live in `src/server/*-actions.ts`, marked `'use server'` at the top of the file.

### The adapter shape

An action is a **thin adapter**. Parse `FormData`, validate, call a command in a
domain package, redirect. All five auth actions follow this and new ones should
look boring next to them:

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
authorization — an action is a public HTTP endpoint, and nothing stops someone
POSTing to it directly. `proxy.ts` is not a boundary either; it only decides
whether to bounce a cookie-less request to `/login`.

**`redirect()` goes outside the `try`.** It works by throwing, so a `catch` that
swallows it turns a successful action into a silent no-op. Look at
`auth-actions.ts`: every `redirect` is after the `try/catch`, never inside.

**Return a serialisable `FormState`, never throw to the client.** Domain errors
(`ValidationError`, `ConflictError`, `ForbiddenError`) are the expected failure
channel and become a message on the form. Anything unrecognised is logged and
becomes a generic message — see `toFormState`.

> [!CAUTION]
> **Never return a credential in `FormState`.** It is serialised into the client
> payload.
>
> This is not hypothetical: the password-reset action returned a live reset token
> to the browser, and it was an account-takeover hole.

---

## Forms and `useActionState`

Every page on the no-JavaScript list must work with JavaScript disabled.
That is a hard requirement, not an aspiration, and it shapes how forms are
written:

- The `<form action={...}>` must work as a native submit. No `onSubmit`, no
  `preventDefault`, no client-side validation the server does not repeat.
- `useActionState` renders the error the action returned. With JS off the page
  re-renders server-side and shows the same message.
- Echo the user's input back in `FormState.values` so a failed submit does not
  blank the form — **except the password**.

> [!IMPORTANT]
> **Islands enhance; they never enable.** If removing a client component breaks a
> page, it was not an island. Write the server path first and the island second.

### Forms that live in a theme slot

A page whose whole content is a form — the composer, and every editor after it —
splits in two: the **theme** renders the page around it, the **app** renders the
`<form>` into a region. The reason is mechanical rather than stylistic: the form
element carries a Server Action reference, and those are not plain data, so they
never cross the theme contract. Controls are built from the shared
token-styled primitives in `src/components/auth/form-controls.tsx`, which is
what keeps an app-owned form looking like part of the theme.

A slot model should not carry a prop no theme can fill. If a value only exists
after a submit — a preview of what was typed, a per-field error — it belongs
inside the form region, not in the view model.

---

## Errors

Use the taxonomy in `@meith/core`: `ValidationError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`, `RateLimitedError`. Each maps to a status and
a rendered page.

Throwing a bare `Error` for a user-facing failure is a bug: callers key off the
taxonomy. `saveSettings` threw a plain `Error` on an invalid value, which meant
the admin panel would have shown "Something went wrong" instead of the actual
problem.

---

## Logging

`logger()` is called **where you log**, never bound at module scope:

```ts
// Wrong — guarded by `no-module-scope-logger`.
const log = logger({ module: 'x' })

// Right.
logger({ module: 'x' }).warn({ err }, 'something')
```

A module-level instance captures the request context once at import time (i.e.
empty), so every line loses its `requestId` — and it builds pino eagerly, which
reads `env` and turns importing the module into an environment validation. That
broke `next build` once.

Never log a password, a token, or a full IP at default level. Pino's redaction
covers `token`-shaped keys but **not** a token interpolated into a URL string,
which is how one escaped.

---

## Caching

Read `packages/core/src/cache.ts` before caching anything.

- **Every tag name is spelled once**, in `CacheTags`. Never write a tag as a
  literal: a writer invalidating `"forum-tree"` while a reader cached under
  `"forumTree"` is stale data that no test catches.
- **`cachedGlobal` is for global data only.** If a value varies by actor it must
  not go through it.

  > [!CAUTION]
  > A cached permission-filtered page is how private forums leak. This is the
  > reason the caching harness exists at all.

- **Invalidate after the write, never before.** Clearing first opens a window
  where a concurrent read repopulates from the pre-write state and nothing
  clears it again. `CachedForumRepository` pins this ordering with a test.
- A cached region may not read `cookies()`, `headers()`, `getActor()` or
  `getUserId()` — guarded by `no-request-state-in-cache`.

---

## Counters and event handlers

A denormalised counter has three obligations, and a change that adds one has to
satisfy all three — the thread and forum counters are the worked example:

- **Write it in the transaction that writes the content.** Counters and the row
  they describe move together or not at all. `applyCreatedContentCounters()`
  takes the caller's transaction handle for exactly this reason — it has no
  ambient database handle to reach for.
- **Emit the event in the same transaction.** Anything that cannot be afforded
  inside the request — an ancestor walk, a fan-out — goes through the outbox, so
  a rolled-back write emits nothing.
- **Give it a recount.** Incremental maintenance drifts. Every counter needs a
  path back to a computed truth, batched and resumable (`PostgresCounterRecount`).
  A counter with no recount is a number that is wrong forever after one crash.

Event handlers live in `packages/runtime/src/event-handlers.ts` and are built
per container, never registered onto a module-level singleton — registration throws
on a duplicate id, and a dev server re-evaluating the module would hit that on
its second pass.

**Handlers are idempotent, without exception.** The relay marks an outbox row
dispatched after the enqueue returns and the queue re-runs a job whose worker
died mid-handler, so every handler is delivered at least once and sometimes
twice. A handler that writes a *computed* value gets this for free; one that
applies a **delta** must record what it has applied — the counter roll-up ledger is
the pattern to copy.

---

## Theme slots

Read `packages/theme-kit/src/slots.ts` before adding a page.

**Every slot declares `server` or `client`, and there are two client slots.** Both
are editor islands. Adding a third means editing a test that argues against it
(`slots.test.ts`) — deliberate friction, because a client slot is bytes shipped to
every viewer of the page it appears on.

`pnpm slots:check` fails the build if a server slot's module starts with
`"use client"`, *and* if a client slot's module does not. The second direction
matters: such an island renders once and never becomes interactive, which looks
correct in a screenshot and does nothing when clicked.

**A slot never renders another slot.** The page resolves both and passes the
rendered one in:

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

If `ThreadView` imported `PostBit` itself, a child theme overriding `PostBit`
would be ignored inside the parent's `ThreadView`. One place resolves slots, so an
override applies everywhere.

**Write the slot map literally in the manifest**, one bare imported identifier per
slot. A map built by spreading cannot be statically checked, and `slots:check`
fails rather than skipping it.

---

## View models

Every page has a typed view model in `src/view/`. Pages resolve params, build a
view model, and hand it to components; they do not pass rows around.

**View models are JSON-shaped**: no `Date`, no `Map`, no functions. `theme-kit`
proves this at compile time for every slot model. The reason is not React — it is
that a view model is also the REST API's payload, and that a `Date` pushes formatting
into every theme, where it becomes a timezone-dependent hydration mismatch. A
timestamp crosses as `TimeModel` (`iso` + a preformatted `label`); paging crosses
as resolved hrefs, never a function that builds them.

**Never link to a route that does not exist.** The user-panel builder earned
this rule by example: while the profile and control-panel screens were unbuilt,
`buildUserPanelModel` returned an empty link list rather than advertising pages
that 404. The screens exist now and the list is populated — the rule outlives
the example, so when a view model covers a page that is not built yet, render
the absence.

**Never expose a database row to a component or an API response.** Row shapes
change with migrations, and a component reading `row.password_hash` because it
was in scope is exactly the accident the rule prevents.

Naming: `<Page>ViewModel` for the page's model (`ThreadViewModel`), and plain
nouns for the pieces (`PostBitModel`). These are a **public API** for themes —
adding a field is minor, renaming or removing one needs a deprecation cycle.

---

## Testing

- Domain logic is unit-tested without a database.
- Anything whose behaviour is SQL semantics gets a **real** Postgres via PGlite
  (`createTestDb`), not a mock. Mocks agree with whatever you assumed.
- **Boot once per suite, clear tables in `beforeEach`.** Creating a database per
  test applies every migration per test and starts tripping timeouts.
- Any list page needs a **query-budget assertion** against the seeded board
  (`expectQueryBudget` in `@meith/testkit`). An N+1 does not fail a test — it
  passes, slowly, and only on an empty board.
- **Prove a new test can fail.** Break the code deliberately, watch it go red,
  put it back.

  > [!TIP]
  > A test that has never failed is not known to test anything. `pnpm
  > guards:probe` applies the same idea to the textual guards.


---

## Before opening a PR

`pnpm verify` — guards, guard probes, the slot boundary check and its probe,
lint, dependency-cruiser, all three typechecks, tests. `pnpm build` if you touched
anything under `app/` — and if you touched a theme, check the class you used is
actually in the built CSS: Tailwind scans `themes/` only because `globals.css`
says so, and a missing `@source` is a green build that renders unstyled.
