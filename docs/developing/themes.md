# The theme API

`@meith/theme-kit` is the frozen contract between the board and a theme.

This document is the policy: how to write a theme, what a theme may do, what
the freeze covers, and how something is removed from it. The reference,
every slot and every view model, is generated into
[Theme slots](../reference/theme-slots.md). To **install** an existing theme
on a board you run, see
[Installing plugins and themes](../getting-started/installing.md).

## Writing a theme

A theme is a module that calls `defineTheme` with a key, a title, and a map
from slot name to component. An optional `version`, semver like a plugin's,
names the release it ships as.

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
own `package.json` from source, so an installed theme needs no build step.

The `version` is what lets a board notice a newer release. With it declared,
the [marketplace](./marketplace.md#the-board-side-consumer-update-checks)
compares the version the board runs against the version the feed lists and
marks the theme **Update available** on **Admin → Themes** when a newer,
compatible one exists, the same check a plugin's `version` drives. A theme
without a `version` still works; it never reports an update.

Three shipped themes are worth reading before you write one:

- **[`examples/iris-theme`](https://github.com/meith-dev/meith/tree/main/examples/iris-theme)
  is the minimal one, and the one to copy first.** It recolours the default
  board by overriding one brand group of tokens, plus a single slot
  (`Footer`). It ships as reference code rather than registered;
  [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
  walks through installing it or your copy of it. `npx create-meith --theme
  my-theme` scaffolds a standalone workspace whose source and passing tests
  are generated from this example (`pnpm extension:gen` in this repository,
  so the two cannot drift), plus a README on registering it in a board and a
  pre-filled marketplace `listing.json`.
- **`themes/midnight` is a full replacement**: 22 slots overridden, the rest
  inherited, tables where the default theme has lists, and no change to any
  package to make it possible. The control panels and the search pages
  arrived as slots after it was written, and it renders all of them without
  a line changing.
- **`themes/clubhouse` is a theme built to be recoloured.** It keeps the
  default board's shape but dresses it as a sports club's site, and nothing
  in it names a colour: the club's own two colours are `primary` and
  `secondary`, so an operator repaints the whole board from the theme
  screen, without a deploy.

### Rules the tooling enforces

| Rule | Why |
|---|---|
| **Write the slot map inline, with bare identifiers.** | `scripts/slot-kinds.mjs` resolves each binding to its module to check the server/client boundary. A map assembled dynamically cannot be checked, so it fails rather than passing unchecked. |
| **A server slot must not be a `"use client"` module.** | For `PostBit` that would ship the whole post list to the browser. Checked statically, and again at `defineTheme` for anything the bundler marked. |
| **Colours come from tokens.** | An operator restyles a board by overriding tokens; a hardcoded colour is a region they cannot reach. The `no-hardcoded-colour` guard rejects hex, `rgb()` and `hsl()` literals in any `.tsx` file across the repository, themes included. |
| **View models are plain JSON data.** | No `Date`, no functions, no class instances. The same models cross to client slots and out through the REST API. `Serialisable<T>` proves it at compile time. |

## What a theme renders

Every page a member, moderator or administrator can open is rendered through
slots. The registry declares 36, all of them stable, in four groups:

| Group | Slots | What it is |
|---|---|---|
| The frame | `Shell`, `Header`, `UserPanel`, `Navigation`, `Footer`, `Notice`, `ForumJump`, `ErrorNotice`, `RedirectNotice` | Wraps every page, including the error pages |
| Reading | `BoardIndex`, `CategoryBlock`, `ForumRow`, `ForumDisplay`, `ThreadRow`, `ThreadView`, `PostBit`, `PostActions`, `QuickReply`, `Pagination`, `SubforumList`, `Announcement`, `BoardStats`, `WhoIsOnline`, `LatestThreads`, `LatestPosts`, `MemberProfile` | The board itself |
| Finding | `SearchForm`, `SearchResults`, `DiscoveryView` | Search, and the "new posts" listings |
| Doing | `PostForm`, `EditorToolbar`, `AuthPage`, `PanelShell`, `PanelNav`, `PanelPage`, `PanelSection` | Writing, signing in, and all three control panels |

**The three control panels are one set of slots, not three.** The member,
moderator and administrator panels share a shape, a rail of sections beside
a page with a heading, so they are `PanelShell` + `PanelNav` + `PanelPage` +
`PanelSection` between them. `PanelKind` (`usercp` / `modcp` / `admincp`)
says which panel a theme is rendering. The admin panel's forty-odd screens
fill `PanelPage`'s body with app-rendered forms, so a theme restyles every
one of them by overriding the frame once.

**`PanelPage` also frames three pages that are in no panel.** Who's online,
the board statistics and the report form are panel-shaped with no rail.
`PanelShell` centres the pages inside it, so a `PanelPage` rendered under
one must not centre itself; the three standalone pages have no shell, so
there it must. `PanelPageModel.frame` (`panel` / `standalone`) says which
case a theme is rendering.

**A theme does not own** the body of an individual settings screen. A form
posting to a Server Action never crosses the theme contract as data, so an
admin screen's controls arrive as `children`. A theme restyles them through
the tokens the `@meith/ui` primitives read, not by replacing their markup.

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
| Read the database, the request, cookies or the session | `@meith/theme-kit`'s only workspace dependency is `@meith/i18n`, for the `Translator` and `CatalogBundle` types it re-exports. dependency-cruiser makes a theme's import of `@meith/db`, a driver or a domain package a hard error |
| Decide anything about permissions | `ViewerModel.canAccessAdminCp` and its siblings are rendering hints the Authorizer has already resolved. Anything a viewer must not see is not in the model at all. CSS is not authorization |
| Build a URL | Every href arrives resolved, so the board can change its URL shape without breaking installed themes |
| Render another slot | Slots are flat. The page composes them and passes rendered output in `regions`; there is no way to reach the resolved theme from inside a slot |

## Words and numbers

A slot receives a view model and its own resolved words, nothing else. There
is no locale to reach for and no translator to call. **The app formats; the
theme renders.** A timestamp crosses as a `TimeModel`, a counter as a
`CountModel`.

```tsx
export function ForumRow({ forum }: { forum: ForumRowModel }) {
  return (
    <span>
      {forum.postCount.label} {forum.postCount.value === 1 ? 'post' : 'posts'}
    </span>
  )
}
```

`label` is the string, grouped by the reader's language: `1,204` on an
English board and `1.204` on a German one. `value` is the number, for the
work a string cannot do: pluralising a noun, hiding a zero, sizing a bar.
Rendering `value` directly is a bug, and so is `toLocaleString`: with a
locale it pins every board to one language, without one it follows the host,
so the server and the browser disagree. The `no-fixed-locale-format` guard
refuses both. A number your theme worked out for itself, "and 12 more" over
a list you sliced, is yours to render as plain digits; the app hands you a
`memberCount` rather than making you count `members.length`.

**Put your own words in a catalog, and read them through `copy`.** Every slot
component takes a second prop, `copy: SlotCopy` (`Readonly<Record<string,
string>>`), carrying whatever your theme registered for that slot, already
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
the app uses. The values come from your theme's own message catalog, a
`messages` bundle registered alongside `slots` and `copy` in
`meith.config.ts`:

```ts
export const clubhouseMessages = {
  en: { 'clubhouse.whoIsOnline.heading': 'In the clubhouse' },
  de: { 'clubhouse.whoIsOnline.heading': 'Im Klubhaus' },
}
```

A theme's catalog is merged over the board's, so the same mechanism lets a
theme reword the board itself: registering `nav.home` renames *Home*
everywhere, in every language you supply it for.
[Languages](../operating/internationalisation.md) has the message syntax and
the merge order.

**Namespace your own keys.** More than one theme can be registered on the
same board, a member picks between them in *Your control panel →
Appearance*, so every theme's catalog is merged into the same registry. A
bare key like `heading` collides the moment a second theme defines one;
`clubhouse.whoIsOnline.heading` cannot. The app resolves your copy with its
own translator, which holds every registered theme's messages, not only the
active one's, so your key names are what keep themes apart.

A slot your theme fills but has nothing of its own to say for gets `copy: {}`.

## Theme switching

**A member can switch the whole theme, components included.** Every
registered theme is in the bundle and resolved at module load, so an
`extends` chain cannot change between requests. Which resolved map a request
renders is a per-request choice, made by `currentTheme()` from a cookie. The
choice works with JavaScript off, and because the server reads it, the page
arrives already correct: no flash, no second paint.

**`?theme=<key>` on any page sets that cookie**, so a theme can be linked:
`https://board.example/f/3-general?theme=phasebook` opens that forum in
Phasebook and keeps it for the rest of the visit. The middleware writes the
cookie and redirects to the same URL without the parameter, so what a
reader shares is the page, not the paint. `currentThemeKey()` validates the
key: a theme that is not registered, or that the board has disabled, falls
back to the board default rather than erroring.

Consequences for a theme author:

- **`assertThemeContract` runs over every registered theme**, not only the
  board's default. An incomplete theme is a boot failure naming the missing
  slots, not a latent 500 on the page that reaches them.
- **A theme that fills no slots is a palette**, a supported shape: picking
  it repaints the board and leaves the markup to the default theme.
- **Pairing rules matter.** If a theme's `ForumRow` only makes sense inside
  its own `CategoryBlock`, both must be overridden together, because a
  member can switch to the theme and hit the combination an operator never
  would.

### The post anchor

Resolving every href leaves the other end of a link to the theme.
`PostBit` anchors each post at **`post-<post.number>`**, the number in its
corner, and that is the whole scheme: `permalink` points at it, and so does
every link the board writes once the thread page has resolved it.

Nothing links a post by its id in a fragment. A link that has to survive
deletions carries `?post=<id>` in the query instead, and the thread page
turns that into the page holding the post plus this anchor. A theme that
anchors a post by `post.id` leaves every such link at the top of the page.

The anchor is also the one hook a theme has for showing which post a link
landed on. The default theme paints the targeted card's border in `primary`
through the `:target` pseudo-class (Tailwind's `target:` variant).
`globals.css` gives every `:target` a `scroll-margin-block-start` of 5rem,
so the highlighted card clears the top of the viewport and the default
theme's sticky 3.5rem header. A theme with a taller sticky header sets a
larger margin on its own posts; a theme whose header scrolls away inherits
the extra room.

## What the freeze covers

| Covered | Not covered |
|---|---|
| The name and `kind` of every **stable** slot | A **provisional** slot's name and `kind` are stable, but nothing today is provisional. See below |
| The fields of the model a stable slot is handed | Fields of a provisional slot's model |
| `defineTheme`, `resolveTheme`, `requireSlot`, `slotCopy`, `hasSlot`, `assertComplete`, `assertThemeContract`, `checkThemeContract` | Anything not re-exported from `packages/theme-kit/src/index.ts` |
| `SLOTS`, `SLOT_NAMES`, `SLOT_STABILITY`, `isSlotName`, `slotKind` | The markup, class names and token *values* of the shipped themes |

> [!IMPORTANT]
> `themes/default` is a reference implementation, not an API. A theme that
> extends it inherits its markup and therefore its changes. Copying it is
> supported and inheriting is better, but neither makes its DOM a promise.

### Provisional slots

A slot is named in the registry as soon as it is designed, which can be
before any page renders it. A props contract nobody has rendered is a guess,
so a new slot ships `provisional` in `SLOT_STABILITY`, excluded from the
freeze and from `assertThemeContract`, until a page hands its model to a
component. It is then promoted to `stable` in the same change, with the
shape that turned out to render.

`QuickReply` and `EditorToolbar`, the registry's only client slots, carried
this status the longest: named early, rendered by no page until `0.17`.
Nothing is provisional today; every slot has been rendered at least once.

## Versioning

`THEME_API_VERSION` (currently `0.24`) is `major.minor`, and both halves are
promises:

| Bump | What may land | What it costs you |
|---|---|---|
| **minor** | Additive only: a new slot, a new optional model field, a new export | Nothing. Every existing theme keeps working; upgrading is a redeploy |
| **major** | Removals and renames, but only for things scheduled through `DEPRECATIONS` at least one major earlier | Work you were warned about |

There is no patch component. This is a type-level contract with no runtime
behaviour of its own, so a bug fixed in `resolveTheme` is a package version,
not an API version.

> [!NOTE]
> **The major is `0`, and the freeze is still real, with two exceptions so
> far.** Meith has not shipped 1.0, so the major these rules count toward is
> the one that ships with the product. Every minor up to `0.13` was additive:
> `0.10` added five slots and removed nothing, `0.11` through `0.13` added
> only optional model fields.
>
> `0.14` is the first exception. It retyped every counter a theme renders
> (`postCount`, `replyCount`, `total` and the rest) from `number` to
> [`CountModel`](../reference/theme-slots.md#countmodel), so a theme written
> against `0.13` fails to compile. That is a major's change landed in a
> minor, because Meith is pre-1.0 and no board runs on it; the alternative
> was a second field beside every counter until 1.0.
>
> `0.15`: every slot component receives a `copy` prop beside its view model,
> the theme's own words resolved server-side. An existing theme compiles
> unchanged, because it was never required to declare every prop it is
> handed. Only the app, the sole caller of `requireSlot`, changed: it now
> resolves `slotCopy()` for every slot it renders. See
> [Words and numbers](#words-and-numbers).
>
> `0.16` is additive. [`LinkModel`](../reference/theme-slots.md#linkmodel)
> gained `newTab` and `submenu`, both optional, because the board navigation
> is now a list an administrator edits: its links may leave the board and
> may have one level of links under them. The new `linkTarget(link)` helper,
> spread onto an anchor, writes the `target` and the `rel` that must
> accompany it. A theme that ignores both fields renders the top level as an
> ordinary row of links.
> [`UserPanelModel`](../reference/theme-slots.md#userpanel) also gained
> `regions.notifications`, the app-rendered notifications menu: one control
> that opens notifications, private messages and, for staff, the moderation
> queue in tabs. A theme places it where the two unread counts used to sit;
> a theme that ignores it falls back to `unreadNotifications` and
> `unreadMessages`, which keeps the field additive.
>
> `0.17` promotes [`QuickReply`](../reference/theme-slots.md#quickreply) and
> [`EditorToolbar`](../reference/theme-slots.md#editortoolbar) from
> provisional to stable. The thread page renders the quick-reply island
> through `QuickReply`; the composer's formatting toolbar (bold, italic,
> strikethrough, link, quote, code, spoiler, both list markers, heading, and
> the attachment picker) renders through `EditorToolbar` on the new-thread,
> reply and edit-post pages. Wiring them up found both models the wrong
> shape, so both changed as they froze, legitimate only because neither had
> ever been rendered (see [Provisional slots](#provisional-slots)).
> `QuickReplyModel` traded its unused `action` URL for `children`, the app's
> reply form (Server Action, drafts, quoting, attachments, unchanged), the
> reversal [`PostFormModel`](../reference/theme-slots.md#postform) went
> through earlier. `EditorToolbarModel` gained `groupLabel` and
> `attachment`, the picker's button, and its `buttons` are now
> [`EditorToolbarButtonModel`](../reference/theme-slots.md#editortoolbarbuttonmodel):
> a `tag` naming a formatting command from the new `EditorTag` export, plus
> a `title`, `keyShortcut` and `placeholder` a theme renders without
> inventing wording. `applyEditorTag` and `applyEditorEdit`, also new
> exports, are what a tag does to a textarea, so a theme's button and the
> composer's own keyboard shortcut run the same edit without either calling
> into the other's React tree.
>
> `0.18` is additive:
> [`ThreadRowModel`](../reference/theme-slots.md#threadrow) gained
> `visibility`: `'visible'`, `'unapproved'` or `'deleted'`. A forum listing
> only carries a held or removed thread for a viewer allowed to see one, so
> a theme that marks it (the built-ins add a badge and a faint tint) draws
> something only staff will meet. It is optional: a theme written against
> `0.17` treats every row as visible.
>
> `0.21` is additive: `EditorTag` gains `image`, `taskList` and `table`, so
> `EditorToolbar` renders three more buttons: an image by URL
> (`![alt](../customization/url)`), a task-list line (`- [ ]`), and a 2×2
> table skeleton. A theme that hands a button's `tag` opaquely to
> `applyEditorTag` needs no change; a theme that maps each tag to its own
> glyph adds three entries, as the bundled themes do.
>
> `0.22` is additive: `ThreadRowSlotModel` gained `regions.pluginBadges`,
> the `threadrow.badges` plugin region, so a plugin can mark threads in a
> forum listing the way `postbit.badges` marks a post's author. The bundled
> themes render it in the row's title line. It is optional: a theme written
> against `0.21` shows no plugin badges. The region runs once per page
> rather than once per row, so a listing of twenty threads costs one call.
>
> `0.23` grows a field rather than only adding one, as `0.14` did:
> `EditorToolbarButtonModel`'s `tag` becomes `EditorTag | null`, and the
> model gains `insertion`, an `EditorInsertion | null` carrying a plugin's
> own edit as data, for a directive registered through
> `markdown.directives`, which has no `EditorTag`. Exactly one of the two is
> ever set. Unlike `0.21`, a theme that treats `tag` opaquely cannot skip
> this one: `tag`'s new `null` case fails the `applyEditorTag` call at
> compile time. It cost the three bundled themes two changes: a branch that
> runs `insertion` through the new `applyInsertion` export when `tag` is
> `null`, and a `key` and fallback glyph no longer derived from `tag` alone.
> Neither reshapes anything the theme already draws, which is why it is a
> minor and not the major the table above would call for; as with `0.14`,
> the alternative was a second, still-required field beside `tag` until
> 1.0. `insertion` is **required**, so an existing third-party plugin that
> contributes a button through `view.editor-toolbar` fails to compile too
> until it adds `insertion: null` beside its `tag`. That is why the note
> below names plugins as well as the app.
>
> `0.24` is additive:
> [`ThreadViewModel`](../reference/theme-slots.md#threadview) gains `watch`,
> a one-tap subscribe/unsubscribe control for the thread header. Following
> used to live only at the foot of the thread, a `<select>` and a button
> past fifty posts. `watch` is `null` for a guest and on a board with no
> subscription service, and optional like the foot-of-thread cadence picker
> in `regions.afterContent`: a theme written against `0.23` renders no
> toggle. `watch` is on/off only, always at the board's default cadence; the
> cadence picker is still where a member reaches daily or weekly digests.

> [!NOTE]
> Adding a **required** field to an existing model is a breaking change even
> though nothing is removed. For every model but `EditorToolbarButtonModel`
> the app is the only producer, and a theme cannot fail to supply one; a
> plugin contributing through `view.editor-toolbar` is a second producer,
> and `0.23` above shows what a required field cost it. In practice new
> fields are added as optional, and themes, and for this one model plugins,
> ignore them until they want them.

## Deprecation

No slot is currently deprecated. One field is: `PostBitModel.quoteSource`,
deprecated in 0.5 and scheduled out at 1.0 in favour of
`PostBitModel.post.id`. It is the first entry through this machinery:

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
   visible in the type and the generated reference instead; no runtime
   report can tell whether a theme reads a prop.
4. **It is removed at the scheduled major, and if it is not, the build
   fails.** `assertDeprecationPolicy` throws once the current version
   reaches `removeIn`, so the deadline cannot pass quietly.

A field is scheduled the same way, as `Model.field`. A whole model is never
deprecated on its own: a model exists because a slot is handed it, so
removing the slot is the deprecation.

## Tokens

A theme ships `LIGHT_TOKENS` and `DARK_TOKENS` using the same **names** the
default theme declares. `globals.css` maps each name to a Tailwind utility,
so a renamed token is a utility pointing at nothing. The values are the
theme's own.

Only the default theme's values are compiled into the stylesheet. Any other
theme's palette is emitted into `<head>` as the difference from that
baseline, so a board on the default theme pays nothing for the mechanism,
and a board on any other theme gets its colours without redeploying CSS.

The cascade, in order:

```text
compiled defaults                       (globals.css)
  → the board default theme's values + its overrides + its custom CSS   :root / .dark
    → each other enabled theme's difference from that   [data-theme="<key>"]
```

The scoped blocks carry only what a theme disagrees with the *board
default* about, not its difference from the compiled stylesheet, because
the unscoped block is still in force when `data-theme` names another theme.
Diffing against the wrong side leaks one theme's brand colour into
another's palette with nothing failing anywhere.

Operator overrides (`themes.token_overrides`) are keyed by colour scheme:

```json
{ "light": { "primary": "#1d4ed8" }, "dark": { "primary": "#93c5fd" } }
```

A flat `{ "primary": "…" }` map is still read and means both schemes. That
is what rows written before per-scheme overrides existed hold, and what an
exported version-1 document carries.

`BROWSER_THEME_COLOR` is the one place a literal colour belongs in a theme:
`<meta name="theme-color">` is ignored by Safari and older Chrome when
given `oklch()`. Keep it equal to the two `background` tokens converted to
hex. A test enforces the pair, because a hand-written copy goes stale
silently.

### Converting a token to sRGB

`@meith/theme-kit` exports the colour maths the board itself uses on
tokens: `parseColour`, `oklchToRgb`, `rgbToOklch`, `rgbToHex`,
`formatOklch`, `relativeLuminance` and `colourToHex`, the last of which
takes either notation and answers a six-digit hex or `null`.

They are exported because more than one surface needs them and every copy
drifts: `<meta name="theme-color">`, the contrast readouts and the OKLCH
picker on the theme screen, and **outgoing mail**, which must be hex because
no mail client parses `oklch()`. A theme that computes a colour of its own
should use these rather than carry its own matrices. `colourToHex` answers
`null` for anything it cannot read (a named colour, an `rgb()` string, a
`color-mix()`), so a caller falls back to a value it chose rather than
emitting something a client will ignore.

### The default palette is neutral on purpose

Every greyscale token the default theme ships is at chroma zero. The one
colour in the palette is `primary`, so a board brands itself by overriding
one group, `primary`, `primary-hover`, `primary-foreground`, `ring`, or a
single press of a brand preset on the theme screen, and nothing else in the
palette carries a hue to clash with it.

Two conventions follow, and both are conventions rather than contract:

- **`accent` is a hover surface, not a highlight.** It carries shadcn/ui's
  meaning here. Anything that needs to shout uses a semantic token.
- **Body links are weight and an underline; `primary` marks the places a
  reader navigates by, not the words they read.** The default theme spends
  it on the board name and the bar above it, member names, post numbers,
  the current tab, category headings and the avatar placeholder, and on
  the hover state of every nav link and title. A thread title or a post
  body stays `foreground`, so an operator's brand choice never sits between
  members and the words they are reading.

A theme is free to disagree. `themes/clubhouse` does: a club's colours are
the point of a club's site, so `primary` marks a dozen surfaces there rather
than four, and each one reads its text back as `primary-foreground`, the
pair the contrast checks already measure.

## Components: `@meith/ui`

`@meith/ui` is shadcn/ui's component vocabulary implemented on Base UI
(`@base-ui/react`). It is available to themes, and the shipped default theme
is built from it.

The package is split by rendering cost. The barrel is server-safe; every
control that needs a client boundary is its own subpath:

| Import | What it is |
|---|---|
| `@meith/ui` | The server-safe barrel: `Alert`, `AlertTitle`, `AlertDescription`, `Avatar`, `Badge`, `Card` and its parts (`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`, `CardRows`), `Disclosure`, `Empty` and its parts, `Field`, `Input`, `Label`, `NativeSelect`, `Textarea`, `Separator`, `TextLink`, the `alertVariants`, `badgeVariants`, `buttonVariants` and `textLinkVariants` class recipes, and `cn` |
| `@meith/ui/button` | The Base UI `Button`, a `"use client"` island |
| `@meith/ui/input-otp` | The one-time-code input, a `"use client"` island |
| `@meith/ui/menu` | The Base UI `Menu`, a `"use client"` island |
| `@meith/ui/toast` | Toasts, a `"use client"` island |
| `@meith/ui/tooltip` | The Base UI `Tooltip`, a `"use client"` island |
| `@meith/ui/dialog`, `@meith/ui/popover`, `@meith/ui/tabs` | Base UI `Dialog`, `Popover` and `Tabs`, each on its own subpath so a server slot never pulls it in |
| `@meith/ui/utils`, `@meith/ui/variants` | `cn` and the class recipes on their own |

Nothing reachable from the main barrel declares `"use client"`, which is
what makes it safe in a server slot. `PostBit` renders fifty times on a
thread page; a client boundary behind a `<Card>` would give away the
property the slot registry exists to protect.

That is also why `buttonVariants` is a separate export from `Button`. Most
buttons on a forum are not buttons: "New thread" is a link, "Mark read" is
a native form submit, and both want the class recipe on a plain element:

```tsx
<a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
  New thread
</a>
```

Reach for `@meith/ui/button` only when the control lives in an island.

None of this is required. `@meith/theme-kit` is the only dependency a theme
needs, and a theme that builds its own markup from scratch, as
`themes/midnight` largely does, is supported.

### Form controls are 16px on a touch screen, whatever a theme asks for

`globals.css` ends with one rule, outside every Tailwind layer, that sets
`font-size: 1rem` on `input`, `select` and `textarea` under
`@media (pointer: coarse)`. Being unlayered, it beats a utility class:
`text-sm` on an input is honoured on a desktop and overruled on a phone.

The reason is iOS Safari, which zooms the page in when a control with text
smaller than 16px takes focus and does not zoom back out. Every form on the
board was built at `text-sm`, so every one of them jumped. The rule is
scoped to coarse pointers, so a theme's density on a desktop is untouched.
A theme can still have a larger control on a phone: the rule sets a size,
it does not lock it, and a selector of higher specificity, or another
unlayered rule loaded after, wins. Going below 16px brings the zoom back.

The same media query is the one to reach for on any nav link or button a
theme wants at least 44px tall on a touch screen: `pointer-coarse:h-11` (or
`pointer-coarse:min-h-11`) alongside the desktop size, as `Header`'s own nav
links do in every shipped theme.

### Mobile navigation is a disclosure, not an island

`Header`'s nav collapses behind the house `<details>`/`<summary>` disclosure
below the `lg` breakpoint, the same pattern `PanelNav` uses for the admin
rail (`themes/default/src/slots/panel-nav.tsx`). A theme that renders
`navigation` for a reader on a phone renders two things:

- The existing hover/`:focus-within` dropdown strip, now `hidden lg:flex` (or
  `lg:block`) so it only reaches a pointer wide enough to hover with.
- A second, `lg:hidden` block: the nav items in a `<details>` a reader taps
  open, with any item carrying a `submenu` as its own nested `<details>`
  rather than a hover panel. The default theme puts that `<details>` in the
  header's top row as a menu button beside the account controls, and lays
  the open list over the page as an absolutely positioned panel under the
  sticky header; `PanelNav`'s own phone-size disclosure sticks just below it
  at the same `top-14` offset. A theme may instead render it as a row that
  pushes the page down, as `themes/midnight` does. Either way the
  `<summary>` must carry the nav's label, visibly or in an `sr-only` span
  beside an icon, because it is the only name the control has. Give every
  submenu `<details>` in one `Header` the same `name` attribute: same-named
  `<details>` siblings are mutually exclusive, so opening one closes another
  without script. The attribute is recent (Chrome 120, Firefox 124, Safari
  17.4) and degrades gracefully: on an older browser each submenu keeps
  opening and closing independently. It is a tidiness concern, never a
  no-JS-safety one.

Both blocks render the same links at once and only CSS decides which one a
reader sees, so anything that inspects the DOM directly finds every link
twice. Mark the two blocks with `data-nav-view="desktop"` and
`data-nav-view="mobile"` so a test can say which copy it means. Put the
desktop marker on the `<ul>` whose direct children are the top-level items,
since the admin navigation spec walks `> li > a` from it. An
accessibility-tree query (`getByRole`) only sees the one CSS is showing; a
raw CSS locator (`page.locator(...)`, `toHaveCount`) does not know about
`display: none` and must be scoped to one block explicitly.

This is no-JS-safe by construction: a `<details>` opens and closes on tap
with no script. Nothing about it may become the only way to reach a page;
the desktop dropdown and the collapsed one must expose the same links.

An item's own link still belongs inside its `<summary>`, next to the
disclosure triangle, so a reader can tap its label directly rather than
opening the submenu first. A `<summary>` may not validly contain another
link, but every browser tolerates it: a tap on the label runs the link, and
a tap anywhere else on the row, the triangle included, toggles the
disclosure. Give the triangle a dedicated, non-overlapping `size-11` box so
that "anywhere else" is a real 44px target and not the sliver of padding a
`flex-1` label leaves beside it.

A theme may tag any disclosure it wants dismissed by an outside tap or
<kbd>Escape</kbd> with `data-nav-disclosure`. `PageShell` mounts
`NavDisclosureEnhancer`, an app-level `"use client"` component and never a
slot, once per page; it closes every open `[data-nav-disclosure]` on a
pointer down outside it or an <kbd>Escape</kbd> keypress. This is strictly
additive: a theme without the attribute still has a working disclosure. A
slot must never become the client boundary; `Header` stays a `"use
client"`-free module and the enhancement lives beside it in the page shell.

The same shape gives a sticky header a "peek". A header tagged
`data-header-peek` is watched by `HeaderPeekEnhancer`, which `PageShell`
also mounts once per page. Once the reader has scrolled past the header's
own height, scrolling down sets `data-peek` on it and scrolling up removes
it; near the top of the page, and whenever focus lands inside the header,
it is always shown. The theme decides what a peeked-away header looks like:
the default theme pairs the attribute with `data-peek:-translate-y-full`
and a `motion-safe:` transition. Without JavaScript the attribute is never
set and the header stays sticky.

## Testing a theme

`apps/community/src/theme/contract.test.ts` renders every theme registered
in `meith.config.ts` through every stable slot with the same fixture
models, and asserts the properties that are true of any theme:

- Required slots are filled.
- Each one renders.
- The values a reader is owed appear in the output.
- Nothing renders `[object Object]`, `undefined`, or an empty `href`.
- No server slot emits a script.

Registering a theme enrols it; there is no list to add yourself to. The
suite deliberately does not assert appearance: a theme is free to be a
table, a card grid or a wall of text.

## The generated reference is a gate

[Theme slots](../reference/theme-slots.md) is written by `scripts/theme-api-docs.mjs`
from the source files that are the contract. `pnpm verify` and CI run
`pnpm theme:docs:check`, which fails when the file and the code disagree, so
a change to the theme contract cannot land without the documentation change
in the same diff. If the check fails, run `pnpm theme:docs` and commit the
result.
