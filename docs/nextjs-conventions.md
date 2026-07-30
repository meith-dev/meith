# Next.js conventions

F14. The decisions that would otherwise be re-litigated in every PR. Link this
from your PR description; if you need to depart from it, say so in the PR and
add a `docs/deviations.md` entry rather than quietly doing something else.

Everything here is drawn from code that exists — the file paths are real, and
the failure each rule prevents has either happened in this repository or is one
the plan calls out explicitly.

---

## Where things live

```
apps/forum/
  app/                  Routes only: page.tsx, layout.tsx, route.ts
  src/server/           Server Actions, the container, request context
  src/view/             Typed page view models (the theme-facing contract)
  src/components/       App-specific components; theme slots live in themes/
  proxy.ts              Cookie triage. NOT authorization.
```

A file under `app/` should be short enough to read in one screen. If a page is
long, the length is domain logic that belongs in a package, or view-model
assembly that belongs in `src/view/`.

**`app/` never imports `@forum/db`.** Enforced by dependency-cruiser. Pages get
their data from the container in `src/server/container.ts`.

---

## Server Components by default

`"use client"` goes on **leaf interactive components only** — never a page,
never a layout.

The rule exists because of one number: a guest thread page must ship
near-zero JavaScript. Marking `PostBit` as a client component would send the
entire post list to the browser and give away the product's main advantage.
`theme-kit` declares a server/client kind per slot and the build fails if a
theme crosses it (F25).

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

**Never return a credential in `FormState`.** It is serialised into the client
payload. This is not hypothetical: the password-reset action returned a live
reset token to the browser and it was an account-takeover hole (D20).

---

## Forms and `useActionState`

Every page on the no-JS list (Reference §R5) must work with JavaScript disabled.
That is a hard requirement, not an aspiration, and it shapes how forms are
written:

- The `<form action={...}>` must work as a native submit. No `onSubmit`, no
  `preventDefault`, no client-side validation the server does not repeat.
- `useActionState` renders the error the action returned. With JS off the page
  re-renders server-side and shows the same message.
- Echo the user's input back in `FormState.values` so a failed submit does not
  blank the form — **except the password**.

**Islands enhance; they never enable.** If removing a client component breaks a
page, it was not an island. Write the server path first and the island second.

---

## Errors

Use the taxonomy in `@forum/core`: `ValidationError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`, `RateLimitedError`. Each maps to a status and
a rendered page.

Throwing a bare `Error` for a user-facing failure is a bug: callers key off the
taxonomy. `saveSettings` threw a plain `Error` on an invalid value, which meant
the ACP would have shown "Something went wrong" instead of the actual problem
(D24).

---

## Logging

`logger()` is called **where you log**, never bound at module scope:

```ts
// Wrong — guarded by `F02 no-module-scope-logger`.
const log = logger({ module: 'x' })

// Right.
logger({ module: 'x' }).warn({ err }, 'something')
```

A module-level instance captures the request context once at import time (i.e.
empty), so every line loses its `requestId` — and it builds pino eagerly, which
reads `env` and turns importing the module into an environment validation. That
broke `next build` (D19).

Never log a password, a token, or a full IP at default level. Pino's redaction
covers `token`-shaped keys but **not** a token interpolated into a URL string,
which is how one escaped (D20).

---

## Caching

Read `packages/core/src/cache.ts` before caching anything.

- **Every tag name is spelled once**, in `CacheTags`. Never write a tag as a
  literal: a writer invalidating `"forum-tree"` while a reader cached under
  `"forumTree"` is stale data that no test catches.
- **`cachedGlobal` is for global data only.** If a value varies by actor it must
  not go through it. A cached permission-filtered page is how private forums
  leak, and it is the reason the harness exists at all.
- **Invalidate after the write, never before.** Clearing first opens a window
  where a concurrent read repopulates from the pre-write state and nothing
  clears it again. `CachedForumRepository` pins this ordering with a test.
- A cached region may not read `cookies()`, `headers()`, `getActor()` or
  `getUserId()` — guarded by `F10 no-request-state-in-cache`.

---

## View models

Every page has a typed view model in `src/view/`. Pages resolve params, build a
view model, and hand it to components; they do not pass rows around.

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
  (`expectQueryBudget` in `@forum/testkit`). An N+1 does not fail a test — it
  passes, slowly, and only on an empty board.
- **Prove a new test can fail.** Break the code deliberately, watch it go red,
  put it back. A test that has never failed is not known to test anything; this
  is standing rule D10, and `pnpm guards:probe` applies the same idea to the
  textual guards.

---

## Before opening a PR

`pnpm verify` — guards, guard probes, lint, dependency-cruiser, both typechecks,
tests. `pnpm build` if you touched anything under `app/`.

Update `docs/plan-status.md` in the same PR as the feature. A feature is `DONE`
only when its acceptance criteria are met *and* the Definition of Done holds;
anything else is `PARTIAL` with the gap named. "Mostly done" is not a state.
