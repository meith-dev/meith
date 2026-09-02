# The theme API

`@meith/theme-kit` is the frozen contract between the board and a theme.

This document is the policy: how to write a theme, what a theme may do, what
the freeze covers, and how something is removed from it. The reference —
every slot and every view model — is generated into
[Theme slots](../reference/theme-slots.md). To **install** an existing theme
on a board you run, rather than write one, see
[Installing plugins and themes](./installing.md).

## Writing a theme

A theme is a module that calls `defineTheme` with a key, a title, and a map
from slot name to component. An optional `version` — semver, like a
plugin's — names the release it ships as.

```ts
// themes/acme/src/theme.ts
import { defineTheme } from "@meith/theme-kit"
import { defaultTheme } from "@meith/theme-default"

import { PostBit } from "./slots/post-bit"

export const acmeTheme = defineTheme({
  key: "acme",
  title: "Acme",
  version: "1.0.0",
  extends: defaultTheme,
  slots: { PostBit },
})
```

Register it in `meith.config.ts`, and set `defaultTheme` to its key if it
should be the board's default. A theme ships TypeScript source like every
`@meith/*` package: a board build compiles every dependency in the board's
own `package.json` from source, so an installed theme needs no build step of
its own.

The `version` is what lets a board notice a newer release: with it declared,
the [marketplace](./marketplace.md#the-board-side-consumer-update-checks)
compares the version the board runs against the version the feed lists and
marks the theme **Update available** on **Admin → Themes** when a newer,
compatible one exists — the same check a plugin's `version` drives. A theme
without a `version` still works; it simply never reports an update.

Three shipped themes are worth reading before you write one:

- **[`examples/iris-theme`](https://github.com/meith-dev/meith/tree/main/examples/iris-theme)
  is the minimal one, and the one to copy first.** It recolours the default
  board by overriding one brand group of tokens, plus a single slot
  (`Footer`) where its markup genuinely disagrees. It ships as reference
  code rather than registered;
  [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
  walks through installing it or your copy of it. You do not have to copy it
  by hand: `npx create-meith --theme my-theme` scaffolds a standalone
  workspace whose source and passing tests are generated from this example
  (`pnpm extension:gen` in this repository, so the two cannot drift), plus a
  README that walks through registering it in a board and a pre-filled
  marketplace `listing.json`.
- **`themes/midnight` is a full replacement**: 22 slots overridden, the rest
  inherited, tables where the default theme has lists — and no change to any
  package to make it possible. What it inherits matters as much as what it
  overrides: the control panels and the search pages arrived as slots after
  it was written, and it renders all of them without a line changing.
- **`themes/clubhouse` is the one to read for a theme built to be
  recoloured.** It keeps the default board's shape but dresses it as a
  sports club's site, and nothing in it names a colour: the club's own two
  colours are `primary` and `secondary`, so an operator repaints the whole
  board from the theme screen, without a deploy.

### Rules the tooling enforces

| Rule | Why |
|---|---|
| **Write the slot map inline, with bare identifiers.** | `scripts/slot-kinds.mjs` resolves each binding to its module to check the server/client boundary. A map assembled dynamically cannot be checked, so it fails rather than passing unchecked. |
| **A server slot must not be a `"use client"` module.** | For `PostBit` that would ship the whole post list to the browser. Checked statically, and again at `defineTheme` for anything the bundler marked. |
| **Colours come from tokens.** | An operator restyles a board by overriding tokens; a hardcoded colour is a region they cannot reach. The `no-hardcoded-colour` guard rejects hex, `rgb()` and `hsl()` literals in any `.tsx` file across the repository, themes included. |
| **View models are plain JSON data.** | No `Date`, no functions, no class instances — the same models cross to client slots and out through the REST API. `Serialisable<T>` proves it at compile time. |

## What a theme renders

Every page a member, moderator or administrator can open is rendered through
slots. The registry declares 36, all of them stable. They fall into four
groups:

| Group | Slots | What it is |
|---|---|---|
| The frame | `Shell`, `Header`, `UserPanel`, `Navigation`, `Footer`, `Notice`, `ForumJump`, `ErrorNotice`, `RedirectNotice` | Wraps every page, including the error pages |
| Reading | `BoardIndex`, `CategoryBlock`, `ForumRow`, `ForumDisplay`, `ThreadRow`, `ThreadView`, `PostBit`, `PostActions`, `QuickReply`, `Pagination`, `SubforumList`, `Announcement`, `BoardStats`, `WhoIsOnline`, `LatestThreads`, `LatestPosts`, `MemberProfile` | The board itself |
| Finding | `SearchForm`, `SearchResults`, `DiscoveryView` | Search, and the "new posts" listings |
| Doing | `PostForm`, `EditorToolbar`, `AuthPage`, `PanelShell`, `PanelNav`, `PanelPage`, `PanelSection` | Writing, signing in, and all three control panels |

**The three control panels are one set of slots, not three.** The member,
moderator and administrator panels share a shape — a rail of sections beside
a page with a heading — so they are `PanelShell` + `PanelNav` + `PanelPage` +
`PanelSection` between them, and `PanelKind` (`usercp` / `modcp` /
`admincp`) tells a theme which panel it is rendering. This is what makes the
admin panel themeable at all: its forty-odd screens fill `PanelPage`'s body
with app-rendered forms, and a theme restyles every one of them by
overriding the frame once.

**`PanelPage` also frames three pages that are in no panel** — who's online,
the board statistics and the report form are panel-shaped with no rail
beside them. `PanelShell` centres the pages inside it, so a `PanelPage`
rendered under one must not centre itself; the three standalone pages have
no shell, so there it must. `PanelPageModel.frame` (`panel` /
`standalone`) says which case a theme is rendering.

**What a theme does not own** is the body of an individual settings screen.
A form posting to a Server Action never crosses the theme contract as data,
so an admin screen's controls arrive as `children`, and a theme restyles
them through the tokens the `@meith/ui` primitives read rather than by
replacing their markup.

## What a theme can and cannot do

**A theme may:**

- Fill any slot in the registry with a component.
- Inherit from another theme with `extends` and override only the slots it
  cares about. Resolution is shallowest-wins per slot, and an override is
  total.
- Ship its own token values, which an operator can then override without
  touching the theme.
- Ship its own message catalog, and reword the board's messages with it.

**A theme cannot:**

| It cannot | Because |
|---|---|
| Read the database, the request, cookies or the session | `@meith/theme-kit` depends on no workspace package at all, and dependency-cruiser makes a theme's import of `@meith/db`, a driver or a domain package a hard error |
| Decide anything about permissions | `ViewerModel.canAccessAdminCp` and its siblings are rendering hints the Authorizer has already resolved. Anything a viewer must not see is not in the model at all — CSS is not authorization |
| Build a URL | Every href arrives resolved, so the board can change its URL shape without breaking installed themes |
| Render another slot | Slots are flat. The page composes them and passes rendered output in `regions`; there is no way to reach the resolved theme from inside a slot |

## Words and numbers

A slot receives a view model and its own resolved words — nothing else. There
is still no locale to reach for and no translator to call, in the same way
there is no database. **The app formats; the theme renders.** Anything the app
already knows arrives pre-written: a timestamp crosses as a `TimeModel`, and a
counter as a `CountModel`.

```tsx
export function ForumRow({ forum }: { forum: ForumRowModel }) {
  return (
    <span>
      {forum.postCount.label} {forum.postCount.value === 1 ? 'post' : 'posts'}
    </span>
  )
}
```

`label` is the string — grouped by the reader's language, so `1,204` on an
English board and `1.204` on a German one. `value` is the number, for the work
a string cannot do: pluralising a noun, hiding a zero, sizing a bar. Rendering
`value` directly is the bug this shape exists to prevent, and so is reaching
for `toLocaleString` — with a locale it pins every board to one language,
without one it follows the *host*, so the server and the browser disagree. The
`no-fixed-locale-format` guard refuses both.

A number your theme worked out for itself — "and 12 more" over a list you
sliced — is yours to render as plain digits. The rule covers what the app hands
you, and the app hands you a `memberCount` rather than making you count
`members.length`.

**Put your own words in a catalog, and read them through `copy`.** Every slot
component takes a second prop, `copy: SlotCopy` — `Readonly<Record<string,
string>>` — carrying whatever your theme registered for that slot, already
resolved for the viewer:

```tsx
import { defineTheme } from '@meith/theme-kit'

function whoIsOnlineCopy(t: Translator): SlotCopy {
  return {
    'clubhouse.whoIsOnline.heading': t.t('clubhouse.whoIsOnline.heading'),
    'clubhouse.whoIsOnline.empty': t.t('clubhouse.whoIsOnline.empty'),
  }
}

export const clubhouseTheme = defineTheme({
  key: 'clubhouse',
  title: 'Clubhouse',
  slots: { WhoIsOnline },
  copy: { WhoIsOnline: whoIsOnlineCopy },
})
```

```tsx
function WhoIsOnline({ total, copy }: WhoIsOnlineModel & { copy: SlotCopy }) {
  return <h2>{copy['clubhouse.whoIsOnline.heading'] ?? 'clubhouse.whoIsOnline.heading'}</h2>
}
```

A missing key renders as itself, the same fallback every other copy record in
the app uses. The values themselves come from your theme's own message
catalog — a `messages` bundle registered alongside `slots` and `copy` in
`meith.config.ts`:

```ts
export const clubhouseMessages = {
  en: { 'clubhouse.whoIsOnline.heading': 'In the clubhouse' },
  de: { 'clubhouse.whoIsOnline.heading': 'Im Klubhaus' },
}
```

Because a theme's catalog is merged over the board's, the same mechanism lets a
theme reword the board itself — registering `nav.home` renames *Home*
everywhere, in every language you supply it for. [Languages](../guides/operations/internationalisation.md)
has the message syntax and the merge order.

**Namespace your own keys.** More than one theme can be registered on the same
board — a member picks between them in *Your control panel → Appearance* — so
two themes' catalogs are merged into the same registry at once. A bare key
like `heading` collides the moment a second theme defines one; `clubhouse.
whoIsOnline.heading` cannot, because no other theme owns the `clubhouse.`
prefix. The app resolves your copy with its own translator — which already
holds every registered theme's messages, not only the active one's — so it is
your key names, not the merge, that keep themes apart.

A slot your theme fills but has nothing of its own to say for gets `copy: {}`.
There is nothing to register for it, and nothing to read.

## Theme switching

**A member can switch the whole theme, components included.** Every
registered theme is in the bundle and resolved at module load — an `extends`
chain cannot change between requests — but *which* resolved map a request
renders is a per-request choice, made by `currentTheme()` from a cookie. The
choice works with JavaScript off, and because the server reads it, the page
arrives already correct: no flash, no second paint.

**`?theme=<key>` on any page sets that cookie**, so a theme can be linked
rather than described: `https://board.example/f/3-general?theme=phasebook`
opens that forum in Phasebook and keeps it for the rest of the visit. The
middleware writes the cookie and redirects to the same URL without the
parameter, so what a reader shares is the page, not the paint. The key is
validated in `currentThemeKey()`: a theme that is not registered, or that
the board has disabled, falls back to the board default rather than
erroring.

Consequences for a theme author:

- **`assertThemeContract` runs over every registered theme**, not only the
  board's default. An incomplete theme used to be a latent 500 on whatever
  page reached its missing slot; now that members can pick any enabled
  theme, it is a boot failure naming the slots.
- **A theme that fills no slots is a palette**, and that is a supported
  shape: picking it repaints the board and leaves the markup to the default
  theme. It is how a board offers three looks without maintaining three
  sets of components.
- **Pairing rules matter.** If a theme's `ForumRow` only makes sense inside
  its own `CategoryBlock`, both must be overridden together — a member can
  now switch to the theme and hit the combination an operator never would.

### The post anchor

Resolving every href leaves the *other* end of a link to the theme.
`PostBit` anchors each post at **`post-<post.number>`** — the number in its
corner — and that is the whole scheme: `permalink` points at it, and so does
every link the board writes once the thread page has resolved it.

Nothing links a post by its id in a fragment. A link that has to survive
deletions carries `?post=<id>` in the query instead, and the thread page
turns that into the page holding the post plus this anchor. A theme that
anchors a post by `post.id` leaves every such link at the top of the page.

## What the freeze covers

| Covered | Not covered |
|---|---|
| The name and `kind` of every **stable** slot | A **provisional** slot's name and `kind` are stable, but nothing today is provisional — see below |
| The fields of the model a stable slot is handed | Fields of a provisional slot's model |
| `defineTheme`, `resolveTheme`, `requireSlot`, `slotCopy`, `hasSlot`, `assertComplete`, `assertThemeContract`, `checkThemeContract` | Anything not re-exported from `packages/theme-kit/src/index.ts` |
| `SLOTS`, `SLOT_NAMES`, `SLOT_STABILITY`, `isSlotName`, `slotKind` | The markup, class names and token *values* of the shipped themes |

> [!IMPORTANT]
> The last row is worth reading twice. `themes/default` is a reference
> implementation, not an API. A theme that extends it inherits its markup
> and therefore its changes. Copying it is supported and inheriting is
> better — but neither makes its DOM a promise.

### Provisional slots

A slot is named in the registry as soon as it is designed, which can be
before any page renders it. Naming it early keeps the slot list from being
retrofitted onto a finished page later, but a props contract nobody has
rendered yet is a guess — so a new slot ships `provisional` in
`SLOT_STABILITY`, excluded from the freeze and from `assertThemeContract`,
until a page actually hands its model to a component. Once that happens the
slot is promoted to `stable` in the same change, per the shape that turned
out to render rather than the one guessed at the outset.

`QuickReply` and `EditorToolbar` — the registry's only client slots — carried
this status the longest: named from early on, rendered by no page until
`0.17`. Nothing is provisional today; every slot in the registry has been
rendered at least once.

## Versioning

`THEME_API_VERSION` (currently `0.23`) is `major.minor`, and both halves are
promises:

| Bump | What may land | What it costs you |
|---|---|---|
| **minor** | Additive only: a new slot, a new optional model field, a new export | Nothing. Every existing theme keeps working; upgrading is a redeploy |
| **major** | Removals and renames — but only for things scheduled through `DEPRECATIONS` at least one major earlier | Work you were warned about |

There is no patch component: this is a type-level contract with no runtime
behaviour of its own, so a bug fixed in `resolveTheme` is a package version,
not an API version.

> [!NOTE]
> **The major is `0`, and the freeze is still real — with one exception, so
> far.** Meith has not shipped 1.0, so the major these rules count toward is
> the one that ships with the product. Every minor up to `0.13` was additive
> whatever the major said: `0.10` added five slots and removed nothing, `0.11`
> through `0.13` added only optional model fields.
>
> `0.14` is the exception and is recorded here rather than glossed. It retyped
> every counter a theme renders — `postCount`, `replyCount`, `total` and the
> rest — from `number` to [`CountModel`](../reference/theme-slots.md#countmodel), so a
> theme written against `0.13` fails to compile against it. That is a major's
> change landed in a minor, and it was landed that way because Meith is
> pre-1.0 and no board runs on it: the alternative was carrying a second field
> beside every counter until 1.0 to avoid breaking themes that do not exist.
>
> `0.15` is back to ordinary: every slot component now receives a `copy` prop
> beside its view model — the theme's own words, resolved server-side — but a
> theme's existing implementation still compiles unchanged, because it was
> never required to declare every prop it is handed. Only the app, which is
> the sole caller of `requireSlot`, had to change: it now resolves `slotCopy()`
> for every slot it renders. See [Words and numbers](#words-and-numbers).
>
> `0.16` is additive again: [`LinkModel`](../reference/theme-slots.md#linkmodel) gained
> `newTab` and `submenu`, both optional, because the board navigation is now a
> list an administrator edits — its links may leave the board, and they may
> have one level of links under them. A `linkTarget(link)` helper is exported
> beside them: spread onto an anchor it writes the `target` and the `rel` that
> has to accompany it. A theme that ignores both fields still compiles, and
> renders the top level as an ordinary row of links.
> [`UserPanelModel`](../reference/theme-slots.md#userpanel) also gained
> `regions.notifications`, the app-rendered notifications menu — one control
> that opens notifications, private messages and, for staff, the moderation
> queue in tabs. A theme places it where the two unread counts used to sit; a
> theme that ignores it falls back to `unreadNotifications` and
> `unreadMessages`, which is what keeps the field additive.
>
> `0.17` promotes [`QuickReply`](../reference/theme-slots.md#quickreply) and
> [`EditorToolbar`](../reference/theme-slots.md#editortoolbar) from provisional to
> stable: the thread page now renders the quick-reply island through
> `QuickReply`, and the composer's formatting toolbar — bold, italic,
> strikethrough, link, quote, code, spoiler, both list markers, heading, and
> the attachment picker — renders through `EditorToolbar` on the new-thread,
> reply and edit-post pages. Wiring them up found both models the wrong
> shape, so both changed at the same time they froze — legitimate only
> because neither had ever been rendered (see
> [Provisional slots](#provisional-slots)):
> [`QuickReplyModel`](../reference/theme-slots.md#quickreply) traded its unused `action`
> URL for `children`, the app's reply form (Server Action, drafts, quoting,
> attachments, unchanged) — the same reversal
> [`PostFormModel`](../reference/theme-slots.md#postform) went through earlier.
> [`EditorToolbarModel`](../reference/theme-slots.md#editortoolbar) gained `groupLabel`
> and `attachment`, the picker's button, and its `buttons` are now
> [`EditorToolbarButtonModel`](../reference/theme-slots.md#editortoolbarbuttonmodel) —
> each one a `tag` naming a formatting command from the new `EditorTag`
> export, plus a `title`, `keyShortcut` and `placeholder` a theme renders
> without inventing any wording of its own. `applyEditorTag` and
> `applyEditorEdit`, also new exports, are what a tag *does* to a textarea —
> the other half of the boundary a client slot draws, since a theme's button
> and the composer's own keyboard shortcut both have to run the same edit
> without either one calling into the other's React tree.
>
> `0.18` is additive: [`ThreadRowModel`](../reference/theme-slots.md#threadrow) gained
> `visibility` — `'visible'`, `'unapproved'` or `'deleted'`. A forum listing only
> ever carries a held or removed thread for a viewer allowed to see one, so a
> theme that marks it — the built-ins add a badge and a faint tint — is drawing
> something only staff will meet. The field is optional: a theme written against
> `0.17` treats every row as visible, which is what its reader saw anyway.
>
> `0.21` is additive: the `EditorTag` export gains three commands — `image`,
> `taskList` and `table` — so the composer's `EditorToolbar` renders three more
> buttons: an image by URL (`![alt](url)`), a task-list line (`- [ ]`), and a
> 2×2 table skeleton. A theme reads a button's `tag` and hands it to
> `applyEditorTag`, so a theme that treats the tag opaquely needs no change; a
> theme that maps each tag to its own glyph adds three entries to render the new
> buttons, the way the bundled themes do.
>
> `0.22` is additive: [`ThreadRowSlotModel`](../reference/theme-slots.md#threadrow)
> gained `regions.pluginBadges`, the `threadrow.badges` plugin region, so a
> plugin can mark threads in a forum listing the way `postbit.badges` marks a
> post's author. A theme places it beside the thread's own flags — the bundled
> themes render it in the row's title line. It is optional: a theme written
> against `0.21` compiles and simply shows no plugin badges. The region runs
> once per page rather than once per row, so a listing of twenty threads costs
> one call — a plugin detail the theme never sees, but the reason the field is
> safe to render on the board's tightest listing.
>
> `0.23` grows a field rather than only adding one, in the way `0.14` did, and
> is recorded rather than glossed for the same reason:
> [`EditorToolbarButtonModel`](../reference/theme-slots.md#editortoolbarbuttonmodel)'s
> `tag` becomes `EditorTag | null`, and the model gains `insertion`, an
> `EditorInsertion | null` carrying a plugin's own edit as data — for a
> directive registered through `markdown.directives`, which has no
> `EditorTag` to squat on. Exactly one of the two is ever set. Unlike `0.21`,
> a theme that treats `tag` opaquely does **not** get to skip this one: every
> theme renders `EditorToolbar` by handing a button's `tag` straight to
> `applyEditorTag`, so `tag`'s new `null` case fails that call at compile
> time regardless. It costs the three bundled themes two changes, not one: a
> branch that tries `insertion` — run with the new `applyInsertion` export
> the same way — when `tag` is `null`, and, because a plugin's button keys
> and glyphs off no `EditorTag` at all, a `key` and a fallback glyph no
> longer derived from `tag` alone. Neither is a reshaping of anything the
> theme already draws, which is why it is a minor and not the major the
> field-typing table above would otherwise call for: Meith is pre-1.0, so as
> with `0.14`, the alternative was carrying a second, still-required field
> beside `tag` until 1.0 for boards that do not exist yet.
>
> The cost is not only the consumer's. `insertion` is **required**, so an
> existing third-party plugin that already contributes a button through
> `view.editor-toolbar` fails to compile too, until it adds `insertion: null`
> beside the `tag` it was already setting — the producer side of the same
> break, and the reason the standing note below now names plugins as well as
> the app.

> [!NOTE]
> Adding a **required** field to an existing model is a breaking change even
> though nothing is removed. For every model but `EditorToolbarButtonModel`
> the app is the only producer, and a theme cannot fail to supply one; a
> plugin contributing through `view.editor-toolbar` is a second producer; see
> `0.23` above for what a required field cost that one when it landed. In
> practice new fields are added as optional, and themes — and, for this one
> model, plugins — ignore them until they want them.

## Deprecation

No slot is currently deprecated. One field is: `PostBitModel.quoteSource`,
deprecated in 0.5 and scheduled out at 1.0 in favour of
`PostBitModel.post.id`. It is the first entry through this machinery — and
it is machinery, not prose:

1. **Mark and schedule.** The slot is marked `deprecated` in
   `SLOT_STABILITY`, and an entry is added to `DEPRECATIONS` naming when it
   was deprecated, which major removes it, what replaces it, and why.
   `assertDeprecationPolicy` refuses a mark with no schedule and a schedule
   with no mark.
2. **It keeps working.** A deprecated slot is still required of a theme,
   because a page still renders it in this version.
3. **It is reported.** `checkThemeContract` lists deprecated slots a theme
   still fills in `deprecatedInUse`, so the admin theme screen and a
   theme's own CI can both see the removal coming. A deprecated *field* is
   visible in the type and the generated reference instead — no runtime
   report can tell whether a theme reads a prop.
4. **It is removed at the scheduled major — and if it is not, the build
   fails.** `assertDeprecationPolicy` throws once the current version
   reaches `removeIn`. A deadline that can pass quietly is how a
   deprecation becomes permanent, so this one cannot.

A field is scheduled the same way, as `Model.field`. A whole model is never
deprecated on its own: a model exists because a slot is handed it, so
removing the slot *is* the deprecation.

## Tokens

A theme ships `LIGHT_TOKENS` and `DARK_TOKENS` using the same **names** the
default theme declares. `globals.css` maps each name to a Tailwind utility,
so a renamed token is a utility pointing at nothing. The values are the
theme's own.

Only the default theme's values are compiled into the stylesheet. Any other
theme's palette is emitted into `<head>` as the *difference* from that
baseline, so a board on the default theme pays nothing for the mechanism,
and a board on any other theme gets its colours without redeploying CSS.

The cascade, in order:

```text
compiled defaults                       (globals.css)
  → the board default theme's values + its overrides + its custom CSS   :root / .dark
    → each other enabled theme's difference from that   [data-theme="<key>"]
```

The scoped blocks carry only what a theme disagrees with the *board
default* about — not its difference from the compiled stylesheet — because
the unscoped block is still in force when `data-theme` names another theme.
Diffing against the wrong side is the bug that leaks one theme's brand
colour into another's palette with nothing failing anywhere.

Operator overrides (`themes.token_overrides`) are keyed by colour scheme:

```json
{ "light": { "primary": "#1d4ed8" }, "dark": { "primary": "#93c5fd" } }
```

A flat `{ "primary": "…" }` map is still read and means both schemes —
that is what rows written before per-scheme overrides existed hold, and
what an exported version-1 document carries.

`BROWSER_THEME_COLOR` is the one place a literal colour belongs in a theme:
`<meta name="theme-color">` is ignored by Safari and older Chrome when
given `oklch()`. Keep it equal to the two `background` tokens converted to
hex — a test enforces the pair, because a hand-written copy goes stale
silently.

### Converting a token to sRGB

`@meith/theme-kit` exports the colour maths the board itself uses on
tokens — `parseColour`, `oklchToRgb`, `rgbToOklch`, `rgbToHex`,
`formatOklch`, `relativeLuminance` and `colourToHex`, the last of which
takes either notation and answers a six-digit hex or `null`.

They are exported because more than one surface needs them and every copy
is a copy that drifts: `<meta name="theme-color">`, the contrast readouts
and the OKLCH picker on the theme screen, and **outgoing mail**, which
must be hex because no mail client parses `oklch()`. A theme that computes
a colour of its own should reach for these rather than carry its own
matrices.

`colourToHex` answers `null` for anything it cannot read — a named colour,
an `rgb()` string, a `color-mix()` — so a caller falls back to a value it
chose rather than emitting something a client will ignore.

### The default palette is neutral on purpose

Every greyscale token the default theme ships is at chroma zero. The one
colour in the palette is `primary`, so a board brands itself by overriding
one group — `primary`, `primary-hover`, `primary-foreground`, `ring`, or a
single press of a brand preset on the theme screen — and nothing else in
the palette carries a hue to clash with it.

Two conventions follow, and both are conventions rather than contract:

- **`accent` is a hover surface, not a highlight.** It carries shadcn/ui's
  meaning here. Anything that needs to shout uses a semantic token.
- **Link text is weight and an underline; only the underline takes
  `primary`.** Colouring the text itself would put the operator's brand
  choice between members and the words they are reading.

A theme is free to disagree — deliberately. `themes/clubhouse` is the
shipped disagreement: a club's colours are the point of a club's site, so
`primary` marks a dozen surfaces there rather than four, and each one reads
its text back as `primary-foreground`, the pair the contrast checks already
measure.

## Components: `@meith/ui`

`@meith/ui` is shadcn/ui's component vocabulary implemented on Base UI
(`@base-ui/react`). It is available to themes, and the shipped default theme
is built from it.

The package is split by rendering cost, and the split is the thing to
understand before importing from it:

| Import | What it is |
|---|---|
| `@meith/ui` | Everything that renders on the **server**: `Card`, `Badge`, `Alert`, `Avatar`, `Field`, `Input`, `NativeSelect`, `Separator`, `Empty`, `Disclosure`, plus the `buttonVariants` and `badgeVariants` class recipes |
| `@meith/ui/button` | The Base UI `Button` — a `"use client"` island |
| `@meith/ui/menu` | The Base UI `Menu` — the other `"use client"` island |

Nothing reachable from the main barrel declares `"use client"`, which is
what makes it safe in a server slot. `PostBit` renders fifty times on a
thread page; a design system that pulled a client boundary in behind a
`<Card>` would give away the property the slot registry exists to protect.

That is also why `buttonVariants` is a separate export from `Button`. Most
buttons on a forum are not buttons — "New thread" is a link, "Mark read" is
a native form submit — and both want the class recipe on a plain element:

```tsx
<a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
  New thread
</a>
```

Reach for `@meith/ui/button` only when the control genuinely lives in an
island.

None of this is required. `@meith/theme-kit` is the only dependency a theme
*needs*, and a theme that builds its own markup from scratch (as
`themes/midnight` largely does) is a supported thing to be.

### Form controls are 16px on a touch screen, whatever a theme asks for

`globals.css` ends with one rule, outside every Tailwind layer, that sets
`font-size: 1rem` on `input`, `select` and `textarea` under
`@media (pointer: coarse)`. Being unlayered, it beats a utility class:
`text-sm` on an input is honoured on a desktop and overruled on a phone.

It is there because iOS Safari zooms the page in when a control with text
smaller than 16px takes focus, and does not zoom back out afterwards. Every
form on the board — signing in, registering, the reply box, search — was
built at `text-sm`, so every one of them jumped on the way in and left the
member on a page wider than their screen. The rule is scoped to coarse
pointers, so a theme's density on a desktop is untouched.

A theme that wants a larger control on a phone can still have one: the rule
sets a size, it does not lock it, and a selector of higher specificity (or
another unlayered rule loaded after) wins. Going *below* 16px is the thing
that brings the zoom back.

## Testing a theme

`apps/community/src/theme/contract.test.ts` renders every theme registered
in `meith.config.ts` through every stable slot with the same fixture
models, and asserts the properties that are true of any theme:

- Required slots are filled.
- Each one renders.
- The values a reader is owed appear in the output.
- Nothing renders `[object Object]`, `undefined`, or an empty `href`.
- No server slot emits a script.

Registering a theme enrols it — there is no list to add yourself to.

The suite deliberately does not assert appearance. A theme is free to be a
table, a card grid or a wall of text; a suite that required matching the
default theme's markup would make the second theme's job "look like the
first", which is the opposite of the point.

## The generated reference is a gate

[Theme slots](../reference/theme-slots.md) is written by `scripts/theme-api-docs.mjs`
from the source files that *are* the contract. `pnpm verify` and CI run
`pnpm theme:docs:check`, which fails when the file and the code disagree —
so a change to the theme contract cannot land without the documentation
change appearing in the same diff, which is exactly when a reviewer should
be asked whether the change is allowed at all.

If the check fails, run `pnpm theme:docs` and commit the result.
