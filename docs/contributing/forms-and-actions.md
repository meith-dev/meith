# Forms and Server Actions

Build validated, permission-checked mutation flows that work with and without JavaScript. These conventions apply to Meith application code, not external themes or plugins.

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
- `FormError` (and the install wizard's error summary) is a JS-on
  enhancement: `useFocusOnFail`, in `form-controls.tsx`, moves focus to the
  error region when a pending submit settles into a failure, so a keyboard
  or screen-reader user lands on what went wrong instead of hunting for it.
  With JS off the same message renders in place, unfocused, from the
  server round-trip.
- A submit is disabled while its action is in flight, so a double-click or an
  impatient second press never fires the action twice. This too is a JS-on
  enhancement built on `useFormStatus`, and every board action button carries
  it: `SubmitButton` is the primary control — it disables and swaps to the
  `form.working` label — and `PendingButton` is the same guard for every other
  submit, from the composer's preview/save-draft/delete and the thanks toggle
  to the account, admin, and moderation forms. Both disable *every* submit in
  their form while any one of them is pending, so a reply, post, message, or
  moderation command runs once and no sibling button races it. `PendingButton`
  takes `showWorking` to swap a text button to `form.working` (omit it for
  icon or compact command buttons); it reads that label from the board-wide
  `CopyProvider`, so it works in a server-rendered form as a client island.
  A form that already tracks `useActionState`'s `pending` itself (the install
  wizard, the notification menu, the forum and navigation trees) keeps its own
  handling. With JS off no button is ever disabled — the enhancement layers on
  top of the native submit, it does not replace it.

> [!IMPORTANT]
> **Islands enhance; they never enable.** If removing a client component
> breaks a page, it was not an island. Write the server path first and the
> island second.

### One-tap actions: the enhancement island

Thanks, a poll vote, following a thread, and the dark-mode toggle share a
shape: a single `<form action={serverAction}>` whose no-JS baseline is a
POST, a redirect, and a full-page repaint. That baseline is correct and
stays — the enhancement is a thin layer that, when JavaScript has loaded,
swaps in the action's own return value instead of navigating, so pressing
the star or the poll's radio button updates in place.

**`ProgressiveMarker`** (`src/components/content/progressive-marker.tsx`) is
the whole mechanism, and it is deliberately not a form wrapper — it renders
one hidden field, mirroring the interception style of `quote-in-place.tsx`
rather than replacing the form the way that file replaces a link:

```tsx
export function ProgressiveMarker() {
  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => setEnhanced(true), [])
  return enhanced ? <input type="hidden" name={PROGRESSIVE_FIELD} value="1" /> : null
}
```

It renders nothing on the server and on first client paint — the same
`enhanced` flip used by `LiveRegion` — so there is no hydration mismatch,
and it adds the field to the DOM only once an effect has actually run,
which is the one fact a native submit can never produce on its own. Drop it
inside the existing `<form>`; nothing else about the form's markup or
action changes.

The action reads the field with `isEnhancedSubmit(form)`
(`src/view/progressive-enhancement.ts`) and **branches on it**, not on
whether the request looks like a fetch:

```ts
if (isEnhancedSubmit(form)) return { thanks: { thanked, count } }

redirect(postLink(returnTo, postId))
```

A plain browser submit never carries the field, so the branch is unreachable
without JavaScript and the redirect fires exactly as before — this is why
the `*-no-js.spec.ts` suite needs no changes for an enhanced action. With
JavaScript, `useActionState`'s own submit handling (never a hand-rolled
`onSubmit`) invokes the action over fetch, the field is present, and the
action returns fresh state instead of throwing a redirect — a
`useActionState` action that redirects on success will navigate the
enhanced path too, so the branch has to come before it, not around it.

**The returned state is the only thing the island may render.** `thanks`,
`pollVote`, and `subscribed` are additive fields on the same `FormState` (or
a small dedicated type, for the poll) the action already returned on
failure — extending a return type, never a parallel API route. The
component reads `state.thanks?.count ?? count`, falling back to the
server-rendered prop until an action actually runs. It never recomputes
`mayCast`, `canVote`, or any other permission-shaped fact itself: the poll's
results block versus its voting inputs is decided by `mayCast` inside
`PollVoteView` (`src/view/poll-vote.ts`), computed identically on the
initial server render and inside the action after a vote, so the same
authorization decision that gated the no-JS page also gates what the
island is allowed to show next. This is the same reasoning as
`quote-in-place.tsx` fetching quoted markup from the server rather than
reading it out of the DOM.

The theme toggle is the one variant that does not wait on the round trip at
all: its `onClick` sets `document.documentElement`'s class immediately —
`SchemeToggle` in `src/components/shell/scheme-toggle.tsx` — and the form
submit that follows only persists the cookie in the background. The
server-decided class from `schemeClass()` stays the source of truth on the
next full load; the click only avoids the one visible flash a full repaint
would otherwise cost.

A new one-tap action follows the same three steps: extend the action's
`FormState` (or its own return type) with the minimal facts the island
needs, branch on `isEnhancedSubmit` before any `redirect`, and drop a
`<ProgressiveMarker />` in the form.

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
