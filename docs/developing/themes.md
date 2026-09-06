# The theme API

`@meith/theme-kit` is the frozen contract between the board and a theme.
This document is the policy: how to write a theme, what it may do, what the
freeze covers, and how something is removed from it. The reference for every
slot and view model is generated into
[Theme slots](../reference/theme-slots.md). To install an existing theme,
see [Installing plugins and themes](../getting-started/installing.md).

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
`@meith/*` package; a board build compiles every dependency in the board's
own `package.json` from source, so an installed theme needs no build step.

With `version` declared, the
[marketplace](./marketplace.md#the-board-side-consumer-update-checks)
compares it against the feed and marks the theme **Update available** on
**Admin → Themes** when a newer, compatible one exists, as a plugin's
`version` does. A theme without one still works and never reports an update.

Three shipped themes are worth reading first:

- **[`examples/iris-theme`](https://github.com/meith-dev/meith/tree/main/examples/iris-theme)
  is the minimal one, and the one to copy.** It recolours the default board
  by overriding one brand group of tokens plus a single slot, `Footer`. It
  ships as reference code rather than registered;
  [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
  walks through installing it. `npx create-meith --theme my-theme` scaffolds
  a standalone workspace whose source and passing tests are generated from
  this example by `pnpm extension:gen`, plus a README on registering it and
  a pre-filled marketplace `listing.json`.
- **`themes/midnight` is a full replacement**: 22 slots overridden, the rest
  inherited, tables where the default theme has lists. It renders the
  control panels and search pages, slots added after it was written,
  without a line changing.
- **`themes/clubhouse` is built to be recoloured.** It keeps the default
  board's shape, dressed as a sports club's site, and nothing in it names a
  colour: the club's two colours are `primary` and `secondary`, so an
  operator repaints the board from the theme screen without a deploy.

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

**The three control panels are one set of slots.** The member, moderator
and administrator panels share a shape, a rail of sections beside a page
with a heading, so all three are `PanelShell` + `PanelNav` + `PanelPage` +
`PanelSection`. `PanelKind` (`usercp` / `modcp` / `admincp`) says which
panel a theme is rendering. The admin panel's forty-odd screens fill
`PanelPage`'s body with app-rendered forms, so overriding the frame once
restyles them all.

**`PanelPage` also frames three pages in no panel.** Who's online, the
board statistics and the report form are panel-shaped with no rail.
`PanelShell` centres the pages inside it, so a `PanelPage` rendered under
one must not centre itself; the three standalone pages have no shell, so
there it must. `PanelPageModel.frame` (`panel` / `standalone`) says which.

**A theme does not own** the body of a settings screen. A form posting to a
Server Action never crosses the theme contract as data, so an admin
screen's controls arrive as `children`. A theme restyles them through the
tokens the `@meith/ui` primitives read, not by replacing their markup.

## What a theme can and cannot do

**A theme may:**

- Fill any slot in the registry with a component.
- Inherit from another theme with `extends`; resolution is shallowest-wins
  per slot, and an override is total.
- Ship its own token values, which an operator can override.
- Ship its own message catalog, and reword the board's messages with it.

**A theme cannot:**

| It cannot | Because |
|---|---|
| Read the database, the request, cookies or the session | `@meith/theme-kit`'s only workspace dependency is `@meith/i18n`, for the `Translator` and `CatalogBundle` types it re-exports. dependency-cruiser makes a theme's import of `@meith/db`, a driver or a domain package a hard error |
| Decide anything about permissions | `ViewerModel.canAccessAdminCp` and its siblings are rendering hints the Authorizer has already resolved. Anything a viewer must not see is not in the model at all. CSS is not authorization |
| Build a URL | Every href arrives resolved, so the board can change its URL shape without breaking installed themes |
| Render another slot | Slots are flat. The page composes them and passes rendered output in `regions`; there is no way to reach the resolved theme from inside a slot |

## Words and numbers

A slot receives a view model and its own resolved words, nothing else: no
locale, no translator. **The app formats; the theme renders.** A timestamp
crosses as a `TimeModel`, a counter as a `CountModel`.

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
locale it pins every board to one language, without one the server and the
browser disagree. The `no-fixed-locale-format` guard refuses both. A number
your theme worked out for itself, "and 12 more" over a list you sliced, is
yours to render as plain digits.

**Put your own words in a catalog, and read them through `copy`.** Every slot
component takes a second prop, `copy: SlotCopy`, a
`Readonly<Record<string, string>>` of what your theme registered for that
slot, resolved for the viewer:

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

A missing key renders as itself, the fallback every copy record in the app
uses. The values come from your theme's message catalog, a `messages`
bundle registered alongside `slots` and `copy` in `meith.config.ts`:

```ts
export const clubhouseMessages = {
  en: { 'clubhouse.whoIsOnline.heading': 'In the clubhouse' },
  de: { 'clubhouse.whoIsOnline.heading': 'Im Klubhaus' },
}
```

A theme's catalog is merged over the board's, so registering `nav.home`
renames *Home* everywhere, in every language you supply it for.
[Languages](../operating/internationalisation.md) has the message syntax and
the merge order.

**Namespace your own keys.** Every registered theme's catalog is merged into
the same registry, because a member picks between themes in *Your control
panel → Appearance*, and the app resolves your copy with a translator
holding every theme's messages. A bare key like `heading` collides the
moment a second theme defines one; `clubhouse.whoIsOnline.heading` cannot.
A slot your theme fills but has no words for gets `copy: {}`.

## Theme switching

**A member can switch the whole theme, components included.** Every
registered theme is in the bundle and resolved at module load, so an
`extends` chain cannot change between requests. `currentTheme()` picks the
resolved map per request from a cookie. The choice works with JavaScript
off, and the server reads it, so the page arrives already correct.

**`?theme=<key>` on any page sets that cookie**, so a theme can be linked:
`https://board.example/f/3-general?theme=phasebook` opens that forum in
Phasebook and keeps it for the rest of the visit. The middleware writes the
cookie and redirects to the same URL without the parameter.
`currentThemeKey()` validates the key: a theme that is not registered, or
that the board has disabled, falls back to the board default.

Consequences for a theme author:

- **`assertThemeContract` runs over every registered theme**, not only the
  board's default. An incomplete theme is a boot failure naming the missing
  slots.
- **A theme that fills no slots is a palette**: picking it repaints the
  board and leaves the markup to the default theme.
- **Pairing rules matter.** If a theme's `ForumRow` only makes sense inside
  its own `CategoryBlock`, both must be overridden together, because a
  member can switch to the theme and hit a combination an operator never
  would.

### The post anchor

Resolving every href leaves the other end of a link to the theme.
`PostBit` anchors each post at **`post-<post.number>`**, the number in its
corner. `permalink` points at it, and so does every link the board writes
once the thread page has resolved it. Nothing links a post by its id in a
fragment: a link that has to survive deletions carries `?post=<id>` in the
query, and the thread page turns that into the page holding the post plus
this anchor. A theme that anchors a post by `post.id` leaves every such
link at the top of the page.

The anchor is also the hook for showing which post a link landed on. The
default theme paints the targeted card's border in `primary` through
`:target` (Tailwind's `target:` variant). `globals.css` gives every
`:target` a `scroll-margin-block-start` of 5rem, so the highlighted card
clears the default theme's sticky 3.5rem header. A theme with a taller
sticky header sets a larger margin on its own posts.

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
before any page renders it. A new slot ships `provisional` in
`SLOT_STABILITY`, excluded from the freeze and from `assertThemeContract`,
until a page hands its model to a component. It is then promoted to
`stable` in the same change, with the shape that turned out to render.
`QuickReply` and `EditorToolbar`, the registry's only client slots, carried
this status the longest, rendered by no page until `0.17`. Nothing is
provisional today.

## Versioning

`THEME_API_VERSION` (currently `0.24`) is `major.minor`, and both halves are
promises:

| Bump | What may land | What it costs you |
|---|---|---|
| **minor** | Additive only: a new slot, a new optional model field, a new export | Nothing. Every existing theme keeps working; upgrading is a redeploy |
| **major** | Removals and renames, but only for things scheduled through `DEPRECATIONS` at least one major earlier | Work you were warned about |

There is no patch component: a bug fixed in `resolveTheme` is a package
version, not an API version.

> [!NOTE]
> **The major is `0`, and the freeze is still real, with two exceptions so
> far.** The major these rules count toward is the one that ships with 1.0.
> Every minor up to `0.13` was additive: `0.10` added five slots, `0.11`
> through `0.13` only optional model fields.
>
> `0.14` is the first exception. It retyped every counter a theme renders
> (`postCount`, `replyCount`, `total` and the rest) from `number` to
> [`CountModel`](../reference/theme-slots.md#countmodel), so a theme written
> against `0.13` fails to compile; the alternative was a second field
> beside every counter until 1.0.
>
> `0.15`: every slot component receives a `copy` prop beside its view model,
> see [Words and numbers](#words-and-numbers). An existing theme compiles
> unchanged, since it was never required to declare every prop it is
> handed; only the app, the sole caller of `requireSlot`, now resolves
> `slotCopy()` for every slot it renders.
>
> `0.16` is additive. [`LinkModel`](../reference/theme-slots.md#linkmodel)
> gained `newTab` and `submenu`, both optional: an administrator edits the
> navigation, whose links may leave the board and may have one level of
> links under them. The new `linkTarget(link)` helper, spread onto an
> anchor, writes the `target` and the `rel` that must accompany it. A theme
> that ignores both fields renders the top level as a row of links.
> [`UserPanelModel`](../reference/theme-slots.md#userpanel) gained
> `regions.notifications`, the app-rendered menu of notifications, private
> messages and, for staff, the moderation queue. A theme places it where
> the unread counts sat; one that ignores it falls back to
> `unreadNotifications` and `unreadMessages`.
>
> `0.17` promotes [`QuickReply`](../reference/theme-slots.md#quickreply) and
> [`EditorToolbar`](../reference/theme-slots.md#editortoolbar) from
> provisional to stable: the thread page renders the quick-reply island
> through `QuickReply`, and the composer's toolbar (bold, italic,
> strikethrough, link, quote, code, spoiler, both list markers, heading, and
> the attachment picker) renders through `EditorToolbar` on the new-thread,
> reply and edit-post pages. Both models changed as they froze, as
> [Provisional slots](#provisional-slots) allows. `QuickReplyModel` traded
> its unused `action` URL for `children`, the app's reply form, as
> [`PostFormModel`](../reference/theme-slots.md#postform) had earlier.
> `EditorToolbarModel` gained `groupLabel` and `attachment`, and its
> `buttons` are now
> [`EditorToolbarButtonModel`](../reference/theme-slots.md#editortoolbarbuttonmodel):
> a `tag` from the new `EditorTag` export, plus a `title`, `keyShortcut`
> and `placeholder`. The new `applyEditorTag` and `applyEditorEdit` exports
> are what a tag does to a textarea, shared by a theme's button and the
> composer's keyboard shortcut.
>
> `0.18` is additive:
> [`ThreadRowModel`](../reference/theme-slots.md#threadrow) gained
> `visibility`: `'visible'`, `'unapproved'` or `'deleted'`. A listing only
> carries a held or removed thread for a viewer allowed to see one; the
> built-ins add a badge and a faint tint. A theme written against `0.17`
> treats every row as visible.
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
> listing the way `postbit.badges` marks a post's author. The bundled
> themes render it in the row's title line; a theme written against `0.21`
> shows no plugin badges. The region runs once per page, not once per row.
>
> `0.23` grows a field, as `0.14` did: `EditorToolbarButtonModel`'s `tag`
> becomes `EditorTag | null`, and the model gains `insertion`, an
> `EditorInsertion | null` carrying a plugin's own edit as data, for a
> directive registered through `markdown.directives`, which has no
> `EditorTag`. Exactly one of the two is ever set. A theme that treats `tag`
> opaquely cannot skip this one: the new `null` case fails the
> `applyEditorTag` call at compile time. It cost the bundled themes a branch
> that runs `insertion` through the new `applyInsertion` export when `tag`
> is `null`, and a `key` and fallback glyph no longer derived from `tag`
> alone. Neither reshapes anything the theme already draws, which is why it
> is a minor; as with `0.14`, the alternative was a second required field
> until 1.0. `insertion` is **required**, so a third-party plugin that
> contributes a button through `view.editor-toolbar` also fails to compile
> until it adds `insertion: null` beside its `tag`.
>
> `0.24` is additive:
> [`ThreadViewModel`](../reference/theme-slots.md#threadview) gains `watch`,
> a one-tap subscribe/unsubscribe control for the thread header. `watch` is
> `null` for a guest and on a board with no subscription service, and
> optional like the foot-of-thread cadence picker in
> `regions.afterContent`: a theme written against `0.23` renders no toggle.
> `watch` is on/off only, at the board's default cadence; the cadence
> picker is still where a member reaches daily or weekly digests.

> [!NOTE]
> Adding a **required** field to an existing model is a breaking change even
> though nothing is removed. For every model but `EditorToolbarButtonModel`
> the app is the only producer; a plugin contributing through
> `view.editor-toolbar` is a second producer, and `0.23` shows what a
> required field cost it. New fields are added as optional, and themes and
> plugins ignore them until they want them.

## Deprecation

No slot is currently deprecated. One field is: `PostBitModel.quoteSource`,
deprecated in 0.5 and scheduled out at 1.0 in favour of
`PostBitModel.post.id`. The machinery:

1. **Mark and schedule.** The slot is marked `deprecated` in
   `SLOT_STABILITY`, and an entry in `DEPRECATIONS` names when it was
   deprecated, which major removes it, what replaces it, and why.
   `assertDeprecationPolicy` refuses a mark with no schedule and a schedule
   with no mark.
2. **It keeps working.** A deprecated slot is still required of a theme,
   because a page still renders it.
3. **It is reported.** `checkThemeContract` lists deprecated slots a theme
   still fills in `deprecatedInUse`, for the admin theme screen and a
   theme's own CI. A deprecated *field* is visible in the type and the
   generated reference instead; no runtime report can tell whether a theme
   reads a prop.
4. **It is removed at the scheduled major.** `assertDeprecationPolicy`
   throws once the current version reaches `removeIn`, so the deadline
   cannot pass quietly.

A field is scheduled the same way, as `Model.field`. A whole model is never
deprecated on its own; removing the slot it belongs to is the deprecation.

## Tokens

A theme ships `LIGHT_TOKENS` and `DARK_TOKENS` using the same **names** the
default theme declares; `globals.css` maps each name to a Tailwind utility,
so a renamed token is a utility pointing at nothing. The values are the
theme's own. Only the default theme's values are compiled into the
stylesheet. Any other theme's palette is emitted into `<head>` as the
difference from that baseline, so no theme needs a CSS redeploy. The
cascade, in order:

```text
compiled defaults                       (globals.css)
  → the board default theme's values + its overrides + its custom CSS   :root / .dark
    → each other enabled theme's difference from that   [data-theme="<key>"]
```

The scoped blocks carry only what a theme disagrees with the *board
default* about, not its difference from the compiled stylesheet, because
the unscoped block is still in force when `data-theme` names another theme.
Diffing against the wrong side leaks one theme's brand colour into another.

Operator overrides (`themes.token_overrides`) are keyed by colour scheme:

```json
{ "light": { "primary": "#1d4ed8" }, "dark": { "primary": "#93c5fd" } }
```

A flat `{ "primary": "…" }` map is still read and means both schemes; rows
written before per-scheme overrides existed and exported version-1
documents carry that shape.

`BROWSER_THEME_COLOR` is the one place a literal colour belongs in a theme:
`<meta name="theme-color">` is ignored by Safari and older Chrome when
given `oklch()`. Keep it equal to the two `background` tokens converted to
hex; a test enforces the pair.

### Converting a token to sRGB

`@meith/theme-kit` exports the colour maths the board itself uses on
tokens: `parseColour`, `oklchToRgb`, `rgbToOklch`, `rgbToHex`,
`formatOklch`, `relativeLuminance` and `colourToHex`, the last of which
takes either notation and answers a six-digit hex or `null`. They serve
`<meta name="theme-color">`, the theme screen's contrast readouts and OKLCH
picker, and outgoing mail, which must be hex because no mail client parses
`oklch()`. A theme that computes a colour should use these rather than its
own matrices. `colourToHex` answers `null` for anything it cannot read, such
as a named colour, an `rgb()` string or a `color-mix()`, so a caller falls
back to a value it chose.

### The default palette is neutral on purpose

Every greyscale token the default theme ships is at chroma zero; the one
colour is `primary`, so a board brands itself by overriding one group,
`primary`, `primary-hover`, `primary-foreground` and `ring`, or by pressing
a brand preset on the theme screen. Two conventions follow, neither of them
contract:

- **`accent` is a hover surface, not a highlight**, shadcn/ui's meaning.
  Anything that needs to shout uses a semantic token.
- **Body links are weight and an underline; `primary` marks the places a
  reader navigates by, not the words they read**: the board name and the
  bar above it, member names, post numbers, the current tab, category
  headings, the avatar placeholder, and the hover state of every nav link
  and title. A thread title or a post body stays `foreground`.

A theme is free to disagree. `themes/clubhouse` marks a dozen surfaces in
`primary`, each reading its text back as `primary-foreground`.

## Components: `@meith/ui`

`@meith/ui` is shadcn/ui's component vocabulary implemented on Base UI
(`@base-ui/react`). The shipped default theme is built from it. The barrel
is server-safe; every control that needs a client boundary is its own
subpath:

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

Nothing reachable from the main barrel declares `"use client"`, so it is
safe in a server slot such as `PostBit`, which renders fifty times on a
thread page. That is why `buttonVariants` is a separate export from
`Button`: "New thread" is a link, "Mark read" is a native form submit, and
both want the class recipe on a plain element:

```tsx
<a href={newThreadHref} className={buttonVariants({ variant: 'primary' })}>
  New thread
</a>
```

Reach for `@meith/ui/button` only when the control lives in an island. None
of this is required: `@meith/theme-kit` is the only dependency a theme
needs, and a theme that builds its own markup, as `themes/midnight` largely
does, is supported.

### Form controls are 16px on a touch screen, whatever a theme asks for

`globals.css` ends with one unlayered rule that sets `font-size: 1rem` on
`input`, `select` and `textarea` under `@media (pointer: coarse)`, so
`text-sm` on an input is honoured on a desktop and overruled on a phone.
The reason is iOS Safari, which zooms the page in when a control with text
smaller than 16px takes focus and does not zoom back out. A larger control
on a phone is still possible: a selector of higher specificity, or another
unlayered rule loaded after, wins. Going below 16px brings the zoom back.
The same media query serves any nav link or button a theme wants at least
44px tall on a touch screen: `pointer-coarse:h-11` or
`pointer-coarse:min-h-11` alongside the desktop size, as `Header`'s nav
links do in every shipped theme.

### Mobile navigation is a disclosure, not an island

`Header`'s nav collapses behind the house `<details>`/`<summary>` disclosure
below the `lg` breakpoint, the pattern `PanelNav` uses for the admin rail
in `themes/default/src/slots/panel-nav.tsx`. A theme that renders
`navigation` renders two blocks:

- The hover/`:focus-within` dropdown strip, `hidden lg:flex` or `lg:block`,
  so it only reaches a pointer that can hover.
- A second, `lg:hidden` block: the nav items in a `<details>` a reader taps
  open, with any item carrying a `submenu` as its own nested `<details>`.
  The default theme renders it as a menu button beside the account controls
  whose open list lays over the page under the sticky header, where
  `PanelNav`'s phone-size disclosure sticks at the same `top-14` offset;
  `themes/midnight` renders a row that pushes the page down. Either way the
  `<summary>` must carry the nav's label, visibly or in an `sr-only` span,
  because it is the only name the control has. Give every submenu
  `<details>` in one `Header` the same `name` attribute, so opening one
  closes another without script. The attribute is recent (Chrome 120,
  Firefox 124, Safari 17.4); an older browser opens each independently.

Both blocks render the same links and only CSS decides which a reader sees.
Mark them `data-nav-view="desktop"` and `data-nav-view="mobile"` so a test
can say which copy it means, with the desktop marker on the `<ul>` whose
direct children are the top-level items, since the admin navigation spec
walks `> li > a` from it. `getByRole` only sees the copy CSS is showing; a
raw CSS locator (`page.locator(...)`, `toHaveCount`) does not know about
`display: none` and must be scoped to one block.

This is no-JS-safe by construction: a `<details>` opens on tap with no
script. The desktop dropdown and the collapsed one must expose the same
links; neither may become the only way to reach a page.

An item's own link belongs inside its `<summary>`, next to the disclosure
triangle, so a reader can tap its label directly. A `<summary>` may not
validly contain a link, but every browser tolerates it: a tap on the label
runs the link, and a tap anywhere else on the row toggles the disclosure.
Give the triangle a dedicated, non-overlapping `size-11` box so that
"anywhere else" is a real 44px target.

A theme may tag any disclosure it wants dismissed by an outside tap or
<kbd>Escape</kbd> with `data-nav-disclosure`: `PageShell` mounts
`NavDisclosureEnhancer`, an app-level `"use client"` component and never a
slot, once per page, and it closes every open `[data-nav-disclosure]` on a
pointer down outside it or an <kbd>Escape</kbd> keypress. This is strictly
additive; `Header` stays a `"use client"`-free module, and a slot must
never become the client boundary.

The same shape gives a sticky header a "peek". A header tagged
`data-header-peek` is watched by `HeaderPeekEnhancer`, also mounted once per
page. Once the reader has scrolled past the header's own height, scrolling
down sets `data-peek` on it and scrolling up removes it; near the top of
the page, and whenever focus lands inside the header, it is always shown.
The default theme pairs the attribute with `data-peek:-translate-y-full`
and a `motion-safe:` transition. Without JavaScript the header stays sticky.

## Testing a theme

`apps/community/src/theme/contract.test.ts` renders every theme registered
in `meith.config.ts` through every stable slot with the same fixture
models, and asserts what is true of any theme: required slots are filled,
each one renders, the values a reader is owed appear in the output, nothing
renders `[object Object]`, `undefined` or an empty `href`, and no server
slot emits a script. Registering a theme enrols it. The suite does not
assert appearance: a theme is free to be a table, a card grid or a wall of
text.

## The generated reference is a gate

[Theme slots](../reference/theme-slots.md) is written by
`scripts/theme-api-docs.mjs` from the source files that are the contract.
`pnpm verify` and CI run `pnpm theme:docs:check`, which fails when the file
and the code disagree. If the check fails, run `pnpm theme:docs` and commit
the result.
