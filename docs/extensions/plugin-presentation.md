# Plugin UI and content rendering

Add interface content through the published regions and rendering APIs. Keep presentation accessible and translated, and use the host contracts instead of importing board internals.

## UI regions

Regions are not theme slots, and the distinction is deliberate. If a plugin
could fill a slot, an installed plugin would decide what a post looks like —
and two plugins filling the same slot would need resolving somehow.

A region is the other arrangement: an explicit "plugins may add something
here" point that a *theme* renders. The theme keeps control of **where**
plugin output appears; the plugin keeps control of **what** it is; several
plugins compose by concatenation, in the usual deterministic order.

There are eight: `header.notice`, `index.footer`, `thread.header`,
`postbit.badges`, `postbit.footer`, `threadrow.badges`, `profile.panel` and
`admin.dashboard` — described in [Plugin hooks](../reference/plugin-hooks.md).
The list is short on purpose, because every region is a commitment every theme
has to render or deliberately drop. `admin.dashboard` is the exception the theme
never sees: it is rendered by the control panel, on the admin overview below the
board's statistics. Each contribution there is wrapped in a plugin card.

**A contribution may be async, and may reach this plugin's runtime.** Its
`render` receives the same lazy `runtime` accessor a [hook
handler](plugin-hooks-guide.md#reaching-the-runtime-from-a-handler) does, and may return a
promise:

```ts
{
  region: 'thread.header',
  render: async ({ subjectId, runtime }) => {
    const { data } = await runtime()
    const row = await data.one('select title from plugin_example_event where thread_id = $1', [subjectId])
    return row === null ? null : <EventCard title={String(row.title)} />
  },
}
```

Mind **where** you do it. `thread.header` runs once per thread page, so a
query there costs one query. `postbit.badges` runs once per *post* — a
query there is fifty queries on a fifty-post page, and the region's own
entry in the reference says so. A contribution that rejects is contained,
counted and auto-disabled exactly like one that throws.

`threadrow.badges` is the exception to the shape above, and its own
contribution type says so. A forum page lists around twenty threads on a
50ms budget, so a per-row region there would be twenty calls before the
page had drawn a row. It runs **once per page** instead: its context carries
`threads`, every visible row as a `{ threadId, authorId }`, and its `render`
returns a `Map` keyed by thread id — a badge for the rows it wants to mark,
nothing for the rest. That lets a plugin answer the whole page in one query
of its own tables rather than twenty:

```ts
{
  region: 'threadrow.badges',
  render: async ({ threads, runtime }) => {
    const { data } = await runtime()
    const rows = await data.query(
      'select thread_id, kind from plugin_example_flag where thread_id = any($1)',
      [threads.map((thread) => thread.threadId)],
    )
    return new Map(rows.map((row) => [Number(row.thread_id), <Flag kind={String(row.kind)} />]))
  },
}
```

**A contribution's context also carries `locale` and `t`,** the reader's
resolved language tag and a translator, the same pair a page context gets. A
region contribution shows text the same way a page does — resolve a key through
`t`, falling back to the plugin's own bundled string when the catalogue has not
translated it — rather than rendering a fixed English literal that ignores the
reader's language:

```ts
{
  region: 'thread.header',
  render: ({ t, locale }) => (
    <p>{t.has('example.card.title') ? t.t('example.card.title') : en['example.card.title']}</p>
  ),
}
```

## Changing how content renders

Seven filters reach the render pipeline, and they divide on **when** they
run — which decides what a plugin can change and what it costs.

| Filter | When it runs | What it shapes |
|---|---|---|
| `markdown.parse.text` | Write | The source handed to the parser |
| `markdown.render.html` | Write | The HTML the renderer constructed |
| `markdown.directives` | Write | The `:::name` and `:name[…]` vocabulary |
| `smilies.list` | Write | The smilie set substituted at render |
| `post.body.html` | Read | One post's body, in the thread it is read in |
| `signature.html` | Read | A member's signature, wherever it appears |
| `word-filter.patterns` | Read | The render-time word filter's rules |

**Write** means the filter runs where a body becomes HTML — a new thread or
reply, an edit, a private message, a saved signature, the composer's
preview — and its output is what the board stores. That is why those four
carry no viewer: a stored render is shared by everybody who reads the post,
so a set of smilies or a rewrite that depended on who was looking would be
whichever reader happened to write the row first.

**Read** means the filter runs once per body per page view. Nothing is
stored, so a change takes effect immediately and disappearing when the
plugin is removed costs nothing.

Two things follow that are worth knowing before you write one.

**The source is never touched.** `markdown.parse.text` changes what the
parser is handed; the `message` column still holds exactly what the member
typed, which is what quoting, editing and the next re-render start from. A
plugin cannot rewrite somebody's post.

**Installing or removing a formatting plugin re-renders the board.** The
board records a *rendering signature* — the keys and versions of the
installed plugins that register any of the four write-time filters. When it
changes, the content revision is bumped, and `posts.render_backfill` walks
the board re-rendering every post through the new pipeline. That is what
makes a formatting plugin apply to the ten years of posts that were there
before it, and what makes removing one take its markup back out. On a large
board the sweep takes a while and reports its backlog in `/admin/system`;
nothing looks broken while it runs, because a row the sweep has not reached
is rendered in memory when somebody reads it.

> [!WARNING]
> What `markdown.render.html`, `post.body.html` and `signature.html` return
> is **trusted output**: it is inserted as markup and nothing escapes it
> afterwards. `post.body.html` runs after the board's word filter, so a
> plugin's own additions are not filtered either. This is the same trust an
> operator extends by installing the plugin at all — but it is the one
> place where a mistake becomes markup on every page.

### A directive with its own toolbar button

`markdown.directives` only names the syntax; it does not give the member a
button that writes it. A block directive with nothing to invoke it means
typing `:::name` by hand, so a plugin that wants an affordance in the
composer contributes to `view.editor-toolbar` too — the same filter the
built-in bold, link and table buttons flow through:

```ts
hooks: {
  'markdown.directives': (directives) => [...directives, { name: 'alert', block: true }],
  'view.editor-toolbar': (toolbar) => ({
    ...toolbar,
    buttons: [
      ...toolbar.buttons,
      {
        tag: null,
        insertion: { kind: 'block', text: ':::alert\n\n:::' },
        label: 'Alert',
        title: 'Alert',
        keyShortcut: null,
        icon: null,
        placeholder: null,
      },
    ],
  }),
},
```

A button carries either `tag` — one of the board's own commands — or
`insertion`, never both. `EditorTag` is a closed union of the board's own
formatting commands, so a plugin's own syntax has nothing to set `tag` to;
`insertion` is the escape hatch, a small serialisable edit a theme runs the
same way it runs a built-in one:

- `{ kind: 'wrap', before, after }` wraps the selection, or, with nothing
  selected, places the caret between `before` and `after` — for an inline
  span like `:name[…]`.
- `{ kind: 'block', text }` inserts a fixed snippet on its own lines,
  replacing whatever was selected — for a block like `:::name` above.

Both are plain data: a plugin hands the host a string to insert, never a
function to call, which is what lets the button cross the RSC boundary into
a client-rendered theme slot the same way every other view model does. A
theme runs it with `applyInsertion(field, insertion)`, exported from
`@meith/theme-kit` beside `applyEditorTag` — a theme that already reads a
button's `tag` opaquely and hands it straight to `applyEditorTag` needs the
same one-line addition to also try `insertion`, and the three bundled themes
show it.

**No extra escaping.** `:::alert\n\n:::` is Markdown typed on the member's
behalf; once inserted it sits in the textarea exactly like anything typed by
hand, and from there it flows through the ordinary parser and the ordinary
`markdown.directives` render path. The button only saves a member from
memorising the syntax — the directive still has to be registered for
anything to render from it.

## Asking for a place in the navigation

A plugin with a member-facing page usually wants a link to it. `navigation`
is how it asks:

```ts
navigation: [
  { key: 'plans', label: 'Supporters', path: '', audience: 'members' },
  { key: 'manage', label: 'Your membership', path: 'manage', audience: 'members', under: 'plans' },
]
```

Each entry names one of the plugin's **own** `pages` by path, so a
navigation item cannot point somewhere the plugin did not build. The host
writes it into the board's navigation table under `plugin.<key>.<item>` the
first time the board's menu is built after the plugin appears — no admin
visit required — and from that moment **the operator owns it**: they rename
it, reorder it, nest
it under another item, restrict it to groups, or switch it off on
`/admin/content/navigation`, exactly as they would a link they added
themselves. Redeploying does not undo any of that — only the address is
refreshed from the code, because that is the half the plugin knows better.

The rest follows from it being a real row:

- **`label` is a starting point, not a fixed string.** It is what the item
  is called until somebody renames it. Give `labelKey` too and the board
  translates it, until an operator types their own label — at which point
  theirs wins in every language, which is what they asked for.
- **`audience` is the default scope** (`all`, `guests`, `members`,
  `staff`), and the operator can narrow it further to specific groups. It
  is presentation, not permission: the page re-checks whoever arrives.
- **`under` is the default nesting.** Name another of the plugin's own
  items and this one is created as its sub-menu entry. The menu is one
  level deep, so the item named must itself be top-level. Like `audience`
  it only seeds the row: the operator re-nests or flattens it afterwards,
  and a redeploy leaves their arrangement alone.
- **The item disappears with the plugin.** Switch the plugin off and the
  link stops rendering; take the plugin out of the build and the row goes
  at the next `meith upgrade`. An operator's ordering is not lost in
  between.

Appending to `view.header` instead would put a link where no operator could
reach it — unnameable, unmovable, and impossible to switch off without
switching off the plugin.

## Words of its own

A plugin that shows text to a member ships a message catalog and is registered
with it in `meith.config.ts`:

```ts
plugins: [{ key: 'dues', plugin: dues, messages: duesMessages }]
```

where `duesMessages` is `{ [locale]: { [key]: pattern } }`. Plugin catalogs are
merged after the board's and after any theme's, so a plugin can reword either —
which is a feature when you mean it and a collision when you do not. Namespace
your keys with your plugin key, the way settings and tasks are namespaced, and
name a board key only when overriding it is the point.

A page context — and a [region contribution](#ui-regions)'s context — also
carries `locale`, the language tag the board resolved for this reader, and `t`,
the translator built from that language. A plugin renders arbitrary UI rather
than filling a slot, so unlike a theme it formats its own dates and numbers —
`new Intl.NumberFormat(context.locale)` rather than `toLocaleString()`, which the
`no-fixed-locale-format` guard refuses.

Nothing about a plugin's own text is required to be translatable; a plugin that
ships only `en` works, and its messages fall back to English for every reader.
[Languages](internationalisation.md) covers the message syntax, the plural
categories, and how a translator adds a language.

## The generated reference is a gate

[Plugin hooks](../reference/plugin-hooks.md) is written by
`scripts/plugin-hook-docs.mjs` from the registry. `pnpm verify` and CI run
`pnpm plugin:docs:check`, which fails when the file and the code disagree.
Hook documentation goes stale faster than most — a hook is added in the
feature that needs it and documented, if at all, afterwards — which is why
this one is a gate rather than a habit.

If the check fails, run `pnpm plugin:docs` and commit the result.

### Shared presentation recipes

Plugin pages can import `buttonVariants`, `controlVariants`, `surfaceVariants`
and `NavTabs` from `@meith/ui` to match the board's controls and surfaces.
Navigation links scroll horizontally on smaller screens. `NavTabs` marks the
strip for the shared enhancer to reveal its active link. Custom strips using
`PLUGIN_TAB_LIST` should add `data-nav-tabs` and mark their active link with
`aria-current="page"` for the same behavior.
Declare `@meith/ui` as a dependency when importing it. The kit's existing
`PLUGIN_CARD`, `PLUGIN_NOTE`, `PLUGIN_TAB_LIST` and `pluginTabClass` remain
available and now use those same recipes. These are server-safe exports.

The admin host provides the page heading and navigation. It gives the plugin
an unstyled content region, so a plugin using `PLUGIN_CARD` does not acquire
a second panel around its own cards. Calendar and Dues demonstrate shared
fields, actions and surfaces on public pages and in administration.
