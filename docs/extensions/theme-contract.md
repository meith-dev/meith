# Theme contract

A theme supplies React components for named slots. The app authorizes the request, builds models, resolves slots and passes rendered regions into them. See the [generated reference](../reference/theme-slots.md) for every slot and model.

## Slots and inheritance

Declare the slot map literally, with imported component identifiers. Child overrides take precedence; omitted slots come from the nearest ancestor.

Slots must not read the database, request state or permissions, build destination URLs, or resolve other slots. The app resolves nested slots and passes their rendered output through `regions`, so child overrides apply consistently.

`PanelPage` receives the panel kind (`user`, `mod` or `admin`) and a `panel` or `standalone` frame. Online, statistics and report pages can use the standalone frame. Forms are app-owned children; themes do not receive server actions as model fields.

## Server and client slots

Slots declare their execution mode. `QuickReply` and `EditorToolbar` are client slots; the remaining slots are server-rendered. Client slot modules need `"use client"`.

Use `QuickReply`'s provided form children and `EditorToolbar`'s prepared model. Preserve native submission and textarea behaviour when JavaScript is unavailable.

## Models and copy

Models are serialisable values, without database rows, `Date` objects or functions. Use supplied `CountModel` and `TimeModel` labels; do not reformat them in the theme.

The app resolves theme copy before calling a slot. Use prepared labels instead of translator lookups inside components. Namespace theme message keys. Configured theme catalogues are merged even when a different theme is selected.

## Selection and tokens

The board's default theme is the fallback. Selecting a theme through the query parameter stores the choice in a cookie and redirects to remove the parameter. All registered themes must satisfy the slot contract.

Tokens inherit from the parent theme. Override matching containers and rows together when changing their structure. See [Tokens and controls](theme-design.md).

## Post links

Set each post's anchor to `post-${post.number}`. Durable links use the post ID in `?post=`, so they survive pagination changes. Keep `:target` visible below the header; the default scroll margin is 5rem. Adjust it if the header height changes.

## Versioning

The theme API is separate from the package release version. Additive optional fields use a minor API version. Required fields, removals and renames are breaking changes. Deprecated fields remain available through the documented deprecation cycle; use their replacement in new code.

| API version | Contract change |
|---|---|
| 0.14 | Counts changed from numbers to `CountModel` |
| 0.15 | Prepared copy fields |
| 0.16 | Link `newTab`/submenu fields and user-panel notifications |
| 0.17 | Stable `QuickReply` children and `EditorToolbar` model |
| 0.18 | Thread visibility |
| 0.21 | Image, task-list and table formatting |
| 0.22 | Thread-row plugin badges |
| 0.23 | Nullable toolbar `tag` and required `insertion`; plugin button producers must also update |
| 0.24 | Watch controls |

`PostBitModel.quoteSource` is deprecated since 0.5 and scheduled for removal in 1.0. Use `post.id` instead.

Run the contract and deprecation checks when changing the API. Regenerate the reference with `pnpm theme:docs`; do not edit it directly.
