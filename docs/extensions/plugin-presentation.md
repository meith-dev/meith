# Plugin UI and Markdown

## Regions

Return React content from a declared region's `render` handler. Runtime, locale and translator access are provided by the host.

| Region | Placement |
|---|---|
| `header.notice` | Board header notice |
| `index.footer` | Forum index footer |
| `thread.header` | Thread header |
| `postbit.badges` | Post author badges |
| `postbit.footer` | Post footer |
| `threadrow.badges` | Thread-list badges |
| `profile.panel` | Member profile |
| `admin.dashboard` | Admin dashboard |

Post regions run per post. Avoid repeated queries. `threadrow.badges` receives the page's thread references once and returns a `Map` from thread ID to content. See the [region reference](../reference/plugin-hooks.md).

## Markdown

| Filter | When applied |
|---|---|
| `markdown.parse.text` | Before parsing |
| `markdown.render.html` | During rendering |
| `markdown.directives` | Builds the directive registry |
| `smilies.list` | Builds the smilie registry |
| `post.body.html`, `signature.html` | When reading rendered content |
| `word-filter.patterns` | Builds word-filter patterns |

Stored source remains unchanged. Changes to the rendering plugin signature schedule a backfill; stale content can be rendered on read until it completes.

HTML added by a plugin is trusted. Escape untrusted content yourself. Word filtering has already run before later HTML filters; inserted text does not receive another pass.

## Editor buttons

Provide exactly one of a wrapping `tag` or an `insertion`. For a directive button, set `tag: null` and supply a block insertion such as `:::alert

:::`. Include the required label, title, shortcut, icon and placeholder fields, using `null` where permitted.

Use the kit's `applyInsertion` helper for wrap/block behaviour. Keep the ordinary textarea and form usable without JavaScript.

## Navigation

Declare entries that link to the plugin's own pages. Give each a stable key, label and audience; one submenu level is supported.

Initial entries are seeded into board navigation. Administrators then control labels, order and visibility. Later code updates can change destinations without overwriting those choices. Disabled plugins are hidden; upgrade removes obsolete entries.

## Copy and controls

Namespace message keys by plugin. Catalogues merge in this order: core, themes, plugins, board overrides. Use the supplied translator and locale; pass that locale to `Intl` formatters.

Use server-safe exports from `@meith/ui` for static UI. `NavTabs` renders native links; `data-nav-tabs` and `aria-current` enable optional horizontal-tab behaviour. Use the shared plugin card styles for panel content. Import interactive controls from their explicit client subpaths.

See [Translations](internationalisation.md) and [Tokens and controls](theme-design.md).
