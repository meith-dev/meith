# Theme tokens and shared controls

Customize visual tokens and reuse the shared controls. Preserve readable contrast, touch targets and keyboard access across themes.

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
- **Body links are weight and an underline; `primary` marks the places a
  reader navigates by, not the words they read.** The default theme spends
  it on the board name and the bar above it, member names, post numbers,
  the current tab, category headings and the avatar placeholder, and on
  the hover state of every nav link and title. A thread title or a post
  body stays `foreground` so an operator's brand choice never sits between
  members and the words they are reading.

A theme is free to disagree — deliberately. `themes/clubhouse` is the
shipped disagreement: a club's colours are the point of a club's site, so
`primary` marks a dozen surfaces there rather than four, and each one reads
its text back as `primary-foreground`, the pair the contrast checks already
measure.

`themes/meith` is the other shipped example, and the opposite disagreement:
the theme meith.dev runs on its own forum, published as `@meith/theme-meith`
for a board to install like any third-party theme rather than bundled into the
stock image. It follows the marketing site's editorial direction. The ground
is the site's near-white and near-black at chroma zero, `primary` is the
site's one green in each scheme, `radius` is `0rem`, `elevation` is `none`,
and `card` equals `background`, so every inherited `Card` reads as a ruled
region rather than a lifted box. Its own slots draw with three rules — a 2px
`foreground` rule above a category, a post or a sidebar block, a 1px rule
of `foreground` at 15% between forums, and a 1px `border` rule between
threads — set headlines
light with negative tracking, run labels in the mono face in small caps, and
give the last word of a multi-word board name, category title or forum
title the italic serif accent the site uses in its own headlines. The green
is spent the way the rebuilt landing page spends it and nowhere else: the
board name carries the site's logomark, the one filled control on a screen
is a `primary` block with a `↗` arrow, every link that goes somewhere ends
in a `primary` arrow, the counts beside a listed item are `primary`, and a
forum row's rule turns `primary` under the pointer. The header's sign-in is
the site's `foreground` block that fills `primary` on hover. Nothing glows,
nothing is tinted and nothing is rounded. Semantic tokens keep the default
theme's values. The theme fills the 22 slots that carry the look and inherits the
panels, forms, search and authentication screens, which take the tokens.
In this repository it is registered only behind `SHOWCASE_THEMES`, so the
contract tests, the fixture gallery and the browser suites cover it.

## Components: `@meith/ui`

`@meith/ui` is shadcn/ui's component vocabulary implemented on Base UI
(`@base-ui/react`). It is available to themes, and the shipped default theme
is built from it.

The package is split by rendering cost, and the split is the thing to
understand before importing from it:

| Import | What it is |
|---|---|
| `@meith/ui` | Everything that renders on the **server**: `Card`, `Badge`, `Alert`, `Avatar`, `Field`, `Input`, `NativeSelect`, `Separator`, `Empty`, `Disclosure`, `PageHeader`, `PageTitle`, `NavTabs`, plus the `buttonVariants`, `controlVariants` and `badgeVariants` class recipes |
| `@meith/ui/nav-tabs-enhancer` | `NavTabsEnhancer` — keeps the current navigation link in view without moving the page |
| `@meith/ui/password-input` | `PasswordInput` — an optional client island with localized `showLabel` and `hideLabel` props |
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

### Shared design system

The default theme and app surfaces use the same foundation. New themes can
change colours, typefaces, radius and elevation through tokens while reusing
the layout and interaction components. Avoid copying a component's class
recipe into a slot when the shared primitive already expresses it.

| Foundation | Shared rule |
|---|---|
| Spacing | Use the 4px scale: 8px within a control or field, 16–20px inside cards, 24px between page sections, and 32px of desktop page padding. |
| Typography | `PageTitle` uses the heading token at 24px on small screens and 30px on larger screens. Card headings are 16px; body and form text are 14–16px; supporting metadata is 12px. |
| Surfaces | Page uses `background`, cards use `card`, and card headers use a quieter `surface` band. Cards share token-derived corners, borders and elevation. |
| Controls | Standard buttons, inputs and selects are at least 40px high; large actions are 44px. Compact controls are 32px on a fine pointer. Shared controls have a 44px minimum touch height. |
| States | Primary actions use `primary` and `primary-hover`; keyboard focus uses an explicit 2px `ring` outline; invalid fields use `destructive` for border and focus. Disabled controls retain their label and reduce emphasis. |
| Reading | Default post bodies fill the available content width inside the post padding, matching attachments and post actions. Long titles wrap without widening the page. |

`PageHeader`, `PageHeaderContent`, `PageTitle`, `PageDescription` and
`PageHeaderActions` compose a page introduction. Content and actions wrap
when they cannot fit alongside each other. Use them for listings, search,
composers and control panels; `className` overrides allow a theme's own
heading treatment. Authentication uses the same pieces with a smaller title.

```tsx
<PageHeader>
  <PageHeaderContent>
    <PageTitle>{title}</PageTitle>
    <PageDescription>{description}</PageDescription>
  </PageHeaderContent>
  <PageHeaderActions>{actions}</PageHeaderActions>
</PageHeader>
```

`NavTabs` renders ordinary navigation links with `aria-current="page"`,
optional counts and an optional aside. Its single row scrolls horizontally
when space is limited, with padding for keyboard focus. It is server-rendered navigation,
not an ARIA tab widget: links still navigate with JavaScript disabled.
The app's `ViewTabs` and the default discovery screen use this one component.
The root layout mounts `NavTabsEnhancer` once. It reveals the current link on
initial render, when the active link changes, and when the strip resizes; it
scrolls only the strip horizontally and leaves manual scrolling alone. This
also handles navigation that arrives after the initial page render. Custom
plugin strips opt in with `data-nav-tabs` and `aria-current` on the active link.
Without JavaScript, the same native links remain horizontally scrollable.

`controlVariants({ size: 'sm' })` supplies compact native controls, such as
the appearance selector. `Input`, `NativeSelect` and `Textarea` use its
standard recipe; native attributes and `className` remain available.
`NativeSelect` also accepts `controlSize="sm"` independently of the native
`size` attribute used by multiple-selection lists.

`PasswordInput` preserves native input attributes, password manager autocomplete
and the same field value when visibility changes. It starts masked; the localized
visibility button appears only after hydration, so JavaScript-free forms do not
show an inert control. Pair it with `Field` rather than placing the input and
button together inside a wrapping label. Login, registration, reset and account
password forms use this shared control.

Search refinements use the same navigation and field recipes, stacking labeled
filters on phones and using two columns when space allows. Poll composer inputs
also use the standard field geometry.

`surfaceVariants({ padded: true })` styles native forms and plugin sections
with the same surface, spacing and depth as cards. The plugin kit's existing
`PLUGIN_CARD`, `PLUGIN_NOTE`, `PLUGIN_TAB_LIST` and `pluginTabClass` exports
now delegate to these shared recipes. Calendar and Dues use the same control
and button recipes as the user, moderation and administration panels.

Every `Card` establishes the named `card` size container. The default and
Clubhouse forum and thread rows use `@3xl/card:` (48rem of card width),
including their figures and column headings, to reveal desktop columns.
A sidebar or narrow panel therefore retains the compact arrangement even
on a wide browser. Use the same named container when adding a listing,
and keep its title and metadata usable in the compact layout.

Bundled themes start the board index with its announcements and forum
listing, without a generic Community heading or introductory tagline. The
mark-all-read control remains available to signed-in members. In every bundled
theme it sits below the forum listing, aligned to its right edge, so it does
not reserve a row above the forums and activity sidebar. The default shell
shares a 1280px maximum width across its header, content, panels and
footer. Its footer separates forum navigation from appearance preferences.
Theme and scheme controls continue to submit native forms without scripting.

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

The same media query is the one to reach for on any other nav link or
button a theme wants at least 44px tall on a touch screen: a Tailwind
`pointer-coarse:h-11` (or `pointer-coarse:min-h-11`) alongside the desktop
size, exactly as `Header`'s own nav links do in every shipped theme.

### Panel navigation on phones

`NavigationDrawer` from `@meith/ui` is a server-rendered hamburger trigger and
drawer opening from the right (the inline end in RTL). `NavigationDrawerTrigger`
can live separately in the top navigation bar by targeting the drawer ID; set
`showTrigger={false}` on that drawer. Native `popover="auto"` controls open and close it, including an
outside tap and Escape, even with JavaScript disabled. The board stylesheet
keeps its header visible, scrolls the navigation independently, dims the page
and respects reduced motion. It uses the browser's top layer to avoid clipping
inside a panel or sticky header.

All six themes share `MobilePanelNav` from `@meith/theme-default` while keeping
their desktop rails. The drawer starts the current group expanded, highlights
the current page, and gives other groups native disclosure controls. Every
sub-section has a full-width touch target and wrapping text. Each expandable
group includes an Overview link to the group's own page. `mobilePanelNavCopy`
provides its localized labels when a theme supplies its own PanelNav copy.

`PanelNavSectionModel.children` includes destinations from closed sections so
readers can expand them without navigating to the parent. Record-specific
items remain limited to their current page. Desktop rails continue to show
children only when `isOpen` is true.

### Mobile header navigation

All six headers share `MobileHeaderNav` from `@meith/theme-default`, with
localized labels supplied by `mobileHeaderNavCopy`. Below `lg`, the hamburger
sits at the end of the top bar and opens the same right-side `NavigationDrawer`
as the panels. The desktop navigation keeps each theme's own layout.

On account and moderator pages, the header button targets the panel drawer.
The stylesheet selects this button from the presence of the panel drawer ID,
so there is one visible hamburger and no duplicate toolbar above the content.
The admin header uses `NavigationDrawerTrigger` directly, alongside a compact
sign-out icon on phones that retains its full accessible label. Custom headers should
include `MobileHeaderNav` even when the board navigation array is empty, so
panel navigation remains reachable.

Main navigation groups use native `<details>` with a full-width summary that
expands the group. An Overview link inside the group reaches its parent page;
child links wrap and have touch-sized targets. The drawer and its groups work
with JavaScript disabled. Outside taps, Escape and the close button dismiss
the drawer through native popover behavior. The scrollable body keeps the
close button available on short screens.

Both desktop and mobile blocks render the same destinations. Their
`data-nav-view="desktop"` and `data-nav-view="mobile"` markers let DOM-based
tests select the intended copy. Keep the desktop marker on the list whose
direct children contain the top-level links.

A theme may go further and tag any disclosure it wants dismissed by an
outside tap or <kbd>Escape</kbd> with `data-nav-disclosure`. `PageShell`
mounts `NavDisclosureEnhancer` — an app-level, `"use client"` component,
never a slot — once per page; it closes every open `[data-nav-disclosure]`
on a pointer down outside it or an <kbd>Escape</kbd> keypress. Escape returns
focus to the summary when focus was inside the closing disclosure. The admin
shell mounts the same enhancer for any themed disclosures that opt in. This is
strictly additive: a theme that never adds the attribute still has a working
disclosure, just without the tap-outside convenience, and a slot itself must
never become the client boundary — `Header` stays a plain, "use client"-free
module exactly as the rule above requires; the enhancement lives beside it in
the page shell, not inside it.

The same shape gives a sticky header a "peek": a header tagged
`data-header-peek` is watched by `HeaderPeekEnhancer`, which `PageShell`
also mounts once per page. Once the reader has scrolled past the header's
own height, scrolling down sets `data-peek` on it and scrolling up removes
the attribute; near the top of the page, and whenever focus lands inside
the header, it is always shown. The theme decides what a peeked-away header
looks like — the default theme pairs the attribute with
`data-peek:-translate-y-full` and a `motion-safe:` transition, so
the bar slides away to give the content the whole viewport and slides back
the moment the reader reverses. Without JavaScript the attribute is never
set and the header simply stays sticky.
