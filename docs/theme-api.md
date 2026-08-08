# The theme API

`@meith/theme-kit` is the contract between the board and a theme, frozen since
**0.1** and currently at **0.9**.

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

`themes/midnight` is the worked example: twenty-two slots overridden, five
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
| Read the database, the request, cookies or the session | `@meith/theme-kit` depends on `@meith/core` alone — no database, no request, no domain package — and dependency-cruiser makes a theme's import of `@meith/db`, a driver or a domain package an error rather than a review comment |
| Decide anything about permissions | `ViewerModel.canAccessAdminCp` and its siblings are *rendering hints* the Authorizer has already resolved. CSS is not authorization — anything a viewer must not see is not in the model at all |
| Build a URL | Every href arrives resolved, so the board can change its URL shape without breaking installed themes |
| Render another slot | Slots are flat. The page composes them and passes rendered output in `regions` — rendering a slot needs the resolved theme, and there is no way to reach one from inside a slot |

> [!IMPORTANT]
> **A member can switch the whole theme, components included.** Every registered
> theme is in the bundle and is resolved at module load — an `extends` chain
> genuinely cannot change between requests — but *which* resolved map a request
> renders is a per-request choice, made by `currentTheme()` from a cookie.
>
> This document used to say the opposite, on the argument that a switcher "would
> cost every first paint a database read". That had quietly expired: 91 of the
> board's 92 routes were already `ƒ (Dynamic)`, because the shell resolves the
> viewer from a cookie. There was no static rendering left to protect.
>
> Consequences for a theme author:
>
> - **`assertThemeContract` now runs over every registered theme**, not only the
>   board's. An incomplete alternate used to be a latent 500 on whatever page
>   reached its missing slot; now that a member can pick it, it is a boot
>   failure naming the slots.
> - **A theme that fills no slots is a palette**, and that is a supported shape
>   rather than a broken one: picking it repaints the board and leaves the
>   markup to the build's theme. It is how a board offers three looks without
>   maintaining three sets of components.
> - **Pairing rules matter more.** `midnight`'s note about overriding
>   `ForumRow` and `CategoryBlock` together is now a rule a *member* can trip
>   over, not only an operator.

## What the freeze covers

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
> **The major is `0`, and the freeze is still real.** Meith has not been
> released, so nothing here has ever been somebody else's dependency and there is
> no installed board for a rename to break. Every rule in this document is
> enforced by code in `packages/theme-kit/src/api.ts` and has been since the
> freeze — but the major those rules count toward is `1.0`, which ships with the
> product rather than ahead of it. Practically: write a theme against `0.9` and a
> later `0.10` will not break it, because a minor is additive whatever the major
> says.

> [!NOTE]
> Adding a **required** field to an existing model is a breaking change even
> though nothing is removed — the app is the only producer of these models, and a
> theme cannot fail to supply one. In practice new fields are added as optional
> and themes ignore them until they want them.

## Deprecation

No *slot* is deprecated. One field is: `PostBitModel.quoteSource`, deprecated in
0.5 and scheduled out at 1.0 in favour of `PostBitModel.post.id` — the first
entry through the machinery below, which is machinery rather than prose.

1. **Mark and schedule.** The slot is marked `deprecated` in `SLOT_STABILITY`,
   and an entry is added to `DEPRECATIONS` naming when it was deprecated, which
   major removes it, what replaces it, and why. Both halves are required:
   `assertDeprecationPolicy` refuses a mark with no schedule and a schedule with
   no mark.
2. **It keeps working.** A deprecated slot is still *required* of a theme,
   because a page still renders it in this version. A theme that drops it early
   has a hole in it.
3. **It is reported.** `checkThemeContract` lists a deprecated *slot* a theme
   still fills in `deprecatedInUse`, so the admin theme screen and a theme's own
   CI test can both see it coming. A deprecated field is visible in the type and
   the generated reference instead — no runtime report can tell whether a theme
   reads a prop.
4. **It is removed at the scheduled major** — and if it is not, the build fails.
   `assertDeprecationPolicy` throws once the current version reaches `removeIn`.

Step 4 is the reason to trust the schedule: a deadline that can pass quietly is
how a deprecation becomes permanent.

A field is scheduled the same way, as `Model.field` — `quoteSource` above is the
live example. A whole model is never deprecated on its own — a model exists
because a slot is handed it, so removing the slot *is* the deprecation.

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
compiled defaults                       (globals.css)
  → the board default theme's values + its overrides + its custom CSS   :root / .dark
    → each other enabled theme's difference from that   [data-theme="<key>"]
```

A board with one enabled theme emits exactly the first two lines, byte for byte
what it emitted before members could switch. The scoped blocks carry only what a
theme *disagrees with the board default about* — not its difference from the
stylesheet — because the unscoped block is still in force when `data-theme` names
another theme. Diffing against the wrong side is the bug that leaks one theme's
brand colour into another's palette with nothing failing anywhere.

`themes.token_overrides` is keyed by colour scheme:

```json
{ "light": { "primary": "#1d4ed8" }, "dark": { "primary": "#93c5fd" } }
```

A flat `{ "primary": "…" }` map is still read, and means both schemes — that is
what every row written before this shape existed holds, and what an exported
version 1 document carries.

`BROWSER_THEME_COLOR` is the one place a literal colour belongs in a theme:
`<meta name="theme-color">` is ignored by Safari and older Chrome when given
`oklch()`. Keep it equal to the two `background` tokens converted — there is a
test for that, because a hand-written pair goes stale silently.

### The default theme's palette is neutral on purpose

Every greyscale token the default theme ships is at **chroma zero** — the one
colour in the palette is `primary`, the green the project's own site uses. A
board brands itself by overriding one group — `primary`, `primary-hover`,
`primary-foreground`, `ring`, or a single press of a brand preset on the theme
screen — and nothing else fights the result, because nothing else in the
palette carries a hue to clash with.

Two consequences worth knowing before you write a theme or a plugin:

- **`accent` is a hover surface, not a highlight.** It carries shadcn/ui's
  meaning here. Anything that needs to shout uses a semantic token, which has a
  meaning to justify the volume.
- **Link text is weight and an underline; only the underline takes `primary`.**
  Colouring the text itself would put every operator's brand choice between
  their members and the words — a pale yellow `primary` should cost a pale
  yellow underline, not a page nobody can read.

Neither is a rule the contract enforces. A theme is free to disagree; it should
disagree deliberately.

## Components: `@meith/ui`

`@meith/ui` is shadcn/ui's component vocabulary implemented on **Base UI**
(`@base-ui/react`), and it is available to a theme — the shipped default theme
is built out of it.

The package is split by rendering cost rather than by category, and that split is
the thing to understand before importing from it:

| Import | What it is |
|---|---|
| `@meith/ui` | Everything that renders on the **server**: `Card`, `Badge`, `Alert`, `Avatar`, `Field`, `Input`, `NativeSelect`, `Separator`, `Empty`, `Disclosure`, plus the `buttonVariants` and `badgeVariants` class recipes |
| `@meith/ui/button` | The Base UI `Button` — a `"use client"` island |
| `@meith/ui/menu` | The Base UI `Menu` — the other `"use client"` island |

Nothing reachable from the barrel declares `"use client"`, which is what makes it
safe in a server slot. `PostBit` is rendered fifty times on a thread page, and a
design system that pulled a client boundary in behind a `<Card>` would cost the
board the property the slot registry exists to protect.

That is also why `buttonVariants` is a separate module from `Button`. Almost
every button on a forum is not a button: "New thread" is a link, "Mark read" is a
native form submit. Both want the class recipe on a plain element —

```tsx
<a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
  New thread
</a>
```

— and get the same appearance for no bytes. Reach for `@meith/ui/button` when the
control genuinely lives in an island.

A theme is not required to use any of this. `@meith/theme-kit` remains the only
dependency a theme *needs*, and a theme that wants its own markup from scratch
(as `themes/midnight` largely does) is a supported thing to be.

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
