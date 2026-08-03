# The theme API, v1

`@forum/theme-kit` is the contract between the board and a theme. F77 freezes it
as **v1.0**. This document is the policy: what the freeze covers, what it does
not, and how something is removed from it. The reference — every slot, every
field — is generated into [`theme-slots.md`](./theme-slots.md).

## What a theme is

A module that calls `defineTheme` with a key, a title, and a map from slot name
to component. Nothing else. It is registered in `forum.config.ts` and imported
statically, because a serverless bundle contains only what the bundler saw
(invariant 6): there is no themes directory scanned at runtime, on any profile.

A theme may:

- fill any slot in the registry with a component;
- inherit from another theme with `extends` and override the slots it cares
  about — resolution is shallowest-wins-per-slot, and overriding is total;
- ship its own token values, which the board's operator can then override per
  board (F26) without touching the theme.

A theme may not, and cannot:

- read the database, the request, cookies or the session. `@forum/theme-kit`
  depends on nothing, and dependency-cruiser's `themes-are-presentation-only`
  rule makes an import of `@forum/db`, `next/headers` or a domain package an
  error rather than a review comment;
- decide anything about permissions. `ViewerModel.canAccessAdminCp` and its
  siblings are *rendering hints* the Authorizer has already resolved. CSS is not
  authorization, and anything a viewer must not see is not in the model at all;
- build a URL. Every href arrives resolved, so the board can change its URL
  shape without breaking installed themes;
- render another slot. Slots are flat: the page composes them and passes
  rendered output in `regions`. See the note in `view-models.ts` for why —
  rendering a slot needs the resolved theme, and there is no way to reach one
  from inside a slot.

## What v1 covers

| Covered | Not covered |
|---|---|
| The name and `kind` of every **stable** slot | The two **provisional** slots (`QuickReply`, `EditorToolbar`) |
| The fields of the model a stable slot is handed | Fields of a provisional slot's model |
| `defineTheme`, `resolveTheme`, `requireSlot`, `hasSlot`, `assertComplete`, `assertThemeContract`, `checkThemeContract` | Anything not re-exported from `packages/theme-kit/src/index.ts` |
| `SLOTS`, `SLOT_NAMES`, `SLOT_STABILITY`, `isSlotName`, `slotKind` | The markup, class names and token *values* of the shipped themes |

The last row is worth reading twice. `themes/default` is a reference
implementation, not an API: a theme that extends it inherits its markup and
therefore its changes. Copying it is supported and inheriting is better, but
neither makes its DOM a promise.

### Provisional slots

`QuickReply` and `EditorToolbar` are the F45 editor islands, and F45 is not
built. They are named in the registry so the slot list is not retrofitted onto
finished pages later, and they are excluded from the freeze because no page has
ever handed their models to a component — freezing a props contract that has
never been rendered is guessing with a version number attached.

A theme is not required to fill them. `assertThemeContract` does not ask for
them, and `resolveTheme(...).missing` reporting both is the normal, correct
state of a complete theme today.

## Versioning

`THEME_API_VERSION` is `major.minor`, and the two halves are promises:

- **minor** — additive only. A new slot, a new optional field on a model, a new
  export. Every existing theme keeps working; upgrading is a redeploy.
- **major** — removals and renames may land, and only for things scheduled
  through `DEPRECATIONS` at least one major earlier.

There is no patch component. This is a type-level contract with no runtime
behaviour of its own; a bug fixed in `resolveTheme` is a package version.

Adding a **required** field to an existing model is a breaking change even
though nothing is removed, because the app is the only producer of these models
and a theme cannot fail to supply one — so in practice new fields are added and
themes ignore them until they want them.

## Deprecation

Nothing is deprecated in v1.0; there is no earlier promise to withdraw. The
mechanism exists anyway, and it is machinery rather than prose:

1. The slot is marked `deprecated` in `SLOT_STABILITY`, and an entry is added to
   `DEPRECATIONS` naming when it was deprecated, which major removes it, what
   replaces it, and why. Both halves are required: `assertDeprecationPolicy`
   refuses a mark with no schedule and a schedule with no mark.
2. It keeps working. A deprecated slot is still *required* of a theme, because a
   page still renders it in this version — a theme that drops it early has a
   hole in it.
3. `checkThemeContract` reports it in `deprecatedInUse`, so the admin theme
   screen and a theme's own CI test can see it coming.
4. At the scheduled major it is removed. **If it is not, the build fails** —
   `assertDeprecationPolicy` throws once the current version reaches `removeIn`.
   That check is the reason to trust the schedule: a deadline that can pass
   quietly is how a deprecation becomes permanent.

The same applies to a model field, scheduled as `Model.field`. A whole model is
never deprecated on its own; a model exists because a slot is handed it, so
removing the slot is the deprecation.

## The generated reference, and why it is a gate

[`theme-slots.md`](./theme-slots.md) is written by `scripts/theme-api-docs.mjs`
from the three source files that *are* the contract. `pnpm verify` and CI run
`pnpm theme:docs:check`, which fails when the file and the code disagree.

The consequence is deliberate: you cannot change the theme contract without the
documentation change appearing in the same diff — which is exactly when a
reviewer should be asked whether the change is allowed at all.

If the check fails, run `pnpm theme:docs` and commit the result.

## Writing a theme

```ts
// themes/acme/src/theme.ts
import { defineTheme } from '@forum/theme-kit'
import { defaultTheme } from '@forum/theme-default'

import { PostBit } from './slots/post-bit'

export const acmeTheme = defineTheme({
  key: 'acme',
  title: 'Acme',
  extends: defaultTheme,
  slots: { PostBit },
})
```

Then register it in `forum.config.ts` and set `defaultTheme` to its key. There
is no theme switcher: `activeTheme` is resolved once at module load because an
`extends` chain cannot change between requests, and a control that appeared to
switch would either not work or cost first paint a database read (see F68).

Four rules the tooling enforces, so that they are worth knowing before they fire:

- **The slot map must be written inline, with bare identifiers.**
  `scripts/slot-kinds.mjs` resolves each binding to its module to check the
  server/client boundary, and a map assembled dynamically cannot be checked — so
  it fails rather than passing unchecked.
- **A server slot must not be a `"use client"` module.** For `PostBit` that
  ships the whole post list to the browser, which is the one number this product
  is built around. Checked statically, and again at `defineTheme` for anything
  the bundler marked.
- **Colours come from tokens.** Guard `R7 no-hardcoded-colour` rejects a hex
  literal in a theme; a board's operator restyles by overriding tokens, and a
  hardcoded colour is a region they cannot reach.
- **View models are plain JSON data.** No `Date`, no functions, no class
  instances — the same models cross to client slots and out through F81's REST
  API. `Serialisable<T>` proves it at compile time.

## Testing a theme

`tests/theme-contract.test.ts` renders **every registered theme** through every
stable slot with the same fixture models and asserts the contract properties
that are true of any theme — that required slots are filled, that each renders
without throwing, that server slots emit no client-component marker, and that
what a model says is a link comes out as one. A new theme is added to the list
there and inherits the whole suite.
