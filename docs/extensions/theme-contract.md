# Theme contracts and compatibility

Understand the theme boundary, slot compatibility, translation and versioning rules before changing a theme implementation.

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
everywhere, in every language you supply it for. [Languages](internationalisation.md)
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

The anchor is also the one hook a theme has for showing *which* post a link
landed on: the default theme paints the targeted card's border in `primary`
through the `:target` pseudo-class (Tailwind's `target:` variant), so a
reader arriving from a notification or a quote sees the post the link meant
rather than only the scroll position. `globals.css` already gives every
`:target` a `scroll-margin-block-start` of 5rem, so the highlighted card
clears the top of the viewport — and the default theme's header, which is
sticky and 3.5rem tall. A theme with a taller sticky header sets a larger
margin on its own posts; a theme whose header scrolls away inherits the
extra room and loses nothing.

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

`THEME_API_VERSION` (currently `0.24`) is `major.minor`, and both halves are
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
> buttons: an image by URL (`![alt](https://example.com/image.png)`), a task-list line (`- [ ]`), and a
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
>
> `0.24` is additive: [`ThreadViewModel`](../reference/theme-slots.md#threadview)
> gains `watch`, a one-tap subscribe/unsubscribe control for the thread
> header — following used to live only at the foot of the thread, a `<select>`
> and a button past fifty posts a reader had to find first. `watch` is
> `null` for a guest and on a board with no subscription service, and
> optional the same way the foot-of-thread cadence picker in
> `regions.afterContent` already was: a theme written against `0.23`
> compiles and renders no toggle. The two controls are not the same thing —
> `watch` is on/off only, always at the board's default cadence, and the
> cadence picker it sits beside is still where a member reaches daily or
> weekly digests.

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

## The generated reference is a gate

[Theme slots](../reference/theme-slots.md) is written by `scripts/theme-api-docs.mjs`
from the source files that *are* the contract. `pnpm verify` and CI run
`pnpm theme:docs:check`, which fails when the file and the code disagree —
so a change to the theme contract cannot land without the documentation
change appearing in the same diff, which is exactly when a reviewer should
be asked whether the change is allowed at all.

If the check fails, run `pnpm theme:docs` and commit the result.
