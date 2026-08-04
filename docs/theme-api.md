# The theme API, v1

`@meith/theme-kit` is the contract between the board and a theme, frozen as
**v1.0**.

This document is the policy — what the freeze covers, what it does not, and how
something is removed from it. The reference (every slot, every field) is
generated into [Theme slots](./theme-slots.md).

## Writing a theme

A theme is a module that calls `defineTheme` with a key, a title, and a map from
slot name to component. Nothing else.

```ts
// themes/acme/src/theme.ts
import { defineTheme } from "@meith/theme-kit"
import { defaultTheme } from "@meith/theme-default"

import { PostBit } from "./slots/post-bit"

export const acmeTheme = defineTheme({
  key: "acme",
  title: "Acme",
  extends: defaultTheme,
  slots: { PostBit },
})
```

Register it in `forum.config.ts` and set `defaultTheme` to its key.

`themes/midnight` is the worked example: nineteen slots overridden, four
inherited, tables where the default theme has lists, and no change to any package
to make it possible.

### Four rules the tooling enforces

Worth knowing before they fire.

| Rule | Why |
|---|---|
| **Write the slot map inline, with bare identifiers.** | `scripts/slot-kinds.mjs` resolves each binding to its module to check the server/client boundary. A map assembled dynamically cannot be checked, so it fails rather than passing unchecked. |
| **A server slot must not be a `"use client"` module.** | For `PostBit` that ships the whole post list to the browser. Checked statically, and again at `defineTheme` for anything the bundler marked. |
| **Colours come from tokens.** | A board's operator restyles by overriding tokens; a hardcoded colour is a region they cannot reach. Guard `no-hardcoded-colour` rejects hex literals in a theme. |
| **View models are plain JSON data.** | No `Date`, no functions, no class instances — the same models cross to client slots and out through the REST API. `Serialisable<T>` proves it at compile time. |

## What a theme can and cannot do

**A theme may:**

- Fill any slot in the registry with a component.
- Inherit from another theme with `extends` and override only the slots it cares
  about. Resolution is shallowest-wins-per-slot, and overriding is total.
- Ship its own token values, which a board's operator can then override without
  touching the theme.

**A theme may not, and cannot:**

| It cannot | Because |
|---|---|
| Read the database, the request, cookies or the session | `@meith/theme-kit` depends on nothing, and dependency-cruiser makes an import of `@meith/db`, `next/headers` or a domain package an error rather than a review comment |
| Decide anything about permissions | `ViewerModel.canAccessAdminCp` and its siblings are *rendering hints* the Authorizer has already resolved. CSS is not authorization — anything a viewer must not see is not in the model at all |
| Build a URL | Every href arrives resolved, so the board can change its URL shape without breaking installed themes |
| Render another slot | Slots are flat. The page composes them and passes rendered output in `regions` — rendering a slot needs the resolved theme, and there is no way to reach one from inside a slot |

> [!NOTE]
> There is no theme switcher. `activeTheme` resolves once at module load, because
> an `extends` chain cannot change between requests — and a control that appeared
> to switch would either not work or cost every first paint a database read.

## What v1 covers

| Covered | Not covered |
|---|---|
| The name and `kind` of every **stable** slot | The two **provisional** slots (`QuickReply`, `EditorToolbar`) |
| The fields of the model a stable slot is handed | Fields of a provisional slot's model |
| `defineTheme`, `resolveTheme`, `requireSlot`, `hasSlot`, `assertComplete`, `assertThemeContract`, `checkThemeContract` | Anything not re-exported from `packages/theme-kit/src/index.ts` |
| `SLOTS`, `SLOT_NAMES`, `SLOT_STABILITY`, `isSlotName`, `slotKind` | The markup, class names and token *values* of the shipped themes |

> [!IMPORTANT]
> The last row is worth reading twice. `themes/default` is a reference
> implementation, not an API. A theme that extends it inherits its markup and
> therefore its changes. Copying it is supported and inheriting is better, but
> neither makes its DOM a promise.

### Provisional slots

`QuickReply` and `EditorToolbar` are the editor islands. They are named in the
registry so the slot list is not retrofitted onto finished pages later, and they
are excluded from the freeze because no page has ever handed their models to a
component — freezing a props contract that has never been rendered is guessing
with a version number attached.

A theme is not required to fill them. `assertThemeContract` does not ask for
them, and `resolveTheme(...).missing` reporting both is the normal state of a
complete theme today.

## Versioning

`THEME_API_VERSION` is `major.minor`, and both halves are promises.

| Bump | What may land | What it costs you |
|---|---|---|
| **minor** | Additive only: a new slot, a new optional model field, a new export | Nothing. Every existing theme keeps working; upgrading is a redeploy |
| **major** | Removals and renames — but only for things scheduled through `DEPRECATIONS` at least one major earlier | Work you were warned about |

There is no patch component. This is a type-level contract with no runtime
behaviour of its own; a bug fixed in `resolveTheme` is a package version.

> [!NOTE]
> Adding a **required** field to an existing model is a breaking change even
> though nothing is removed — the app is the only producer of these models, and a
> theme cannot fail to supply one. In practice new fields are added as optional
> and themes ignore them until they want them.

## Deprecation

Nothing is deprecated in v1.0; there is no earlier promise to withdraw. The
mechanism exists anyway, and it is machinery rather than prose.

1. **Mark and schedule.** The slot is marked `deprecated` in `SLOT_STABILITY`,
   and an entry is added to `DEPRECATIONS` naming when it was deprecated, which
   major removes it, what replaces it, and why. Both halves are required:
   `assertDeprecationPolicy` refuses a mark with no schedule and a schedule with
   no mark.
2. **It keeps working.** A deprecated slot is still *required* of a theme,
   because a page still renders it in this version. A theme that drops it early
   has a hole in it.
3. **It is reported.** `checkThemeContract` lists it in `deprecatedInUse`, so the
   admin theme screen and a theme's own CI test can both see it coming.
4. **It is removed at the scheduled major** — and if it is not, the build fails.
   `assertDeprecationPolicy` throws once the current version reaches `removeIn`.

Step 4 is the reason to trust the schedule: a deadline that can pass quietly is
how a deprecation becomes permanent.

The same applies to a model field, scheduled as `Model.field`. A whole model is
never deprecated on its own — a model exists because a slot is handed it, so
removing the slot *is* the deprecation.

## Tokens

A theme ships `LIGHT_TOKENS` and `DARK_TOKENS` using the same **names** the
default theme declares. `globals.css` maps each name to a Tailwind utility, so a
renamed token is a utility pointing at nothing. The values are the theme's own.

Only the default theme's values are compiled into the stylesheet. Any other
theme's palette is emitted into `<head>` as the *difference* from that baseline —
so a board on the default theme pays nothing for the mechanism, and a board on
any other theme gets its colours without redeploying the CSS.

The cascade, in order:

```text
compiled defaults
  → the active theme's differences
    → the board's themes.token_overrides
      → custom CSS
```

`BROWSER_THEME_COLOR` is the one place a literal colour belongs in a theme:
`<meta name="theme-color">` is ignored by Safari and older Chrome when given
`oklch()`. Keep it equal to the two `background` tokens converted — there is a
test for that, because a hand-written pair goes stale silently.

## Testing a theme

`apps/forum/src/theme/contract.test.ts` renders **every theme registered in
`forum.config.ts`** through every stable slot with the same fixture models, and
asserts the properties that are true of any theme:

- Required slots are filled.
- Each one renders.
- The values a reader is owed appear in the output.
- Nothing renders `[object Object]`, `undefined`, or an empty `href`.
- No server slot emits a script.

Registering a theme enrols it. There is no list to add yourself to, and none to
forget.

**It deliberately does not assert appearance.** A theme is free to be a table, a
card grid or a wall of text. A suite that required matching the default theme's
markup would make the second theme's job "look like the first", which is the
opposite of the point.

## The generated reference is a gate

[Theme slots](./theme-slots.md) is written by `scripts/theme-api-docs.mjs` from
the three source files that *are* the contract. `pnpm verify` and CI run
`pnpm theme:docs:check`, which fails when the file and the code disagree.

The consequence is deliberate: you cannot change the theme contract without the
documentation change appearing in the same diff — which is exactly when a
reviewer should be asked whether the change is allowed at all.

If the check fails, run `pnpm theme:docs` and commit the result.
