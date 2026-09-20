# Rendering and data

## Server rendering

Pages and layouts are Server Components. Use small client islands for interaction; framework error boundaries are client components. Pass serialisable props, with rendered React regions where the slot contract permits them.

The server prepares error-notice markup through the theme slot. `CrashNoticeProvider` supplies it to the client boundary, with a null fallback when unavailable. A request ID captured in the layout can reflect the initial request after client navigation.

Call `logger()` where the event occurs, not at module scope. Module-level loggers lose request context and can trigger environment validation during imports. Never log passwords, tokens or full IP addresses at the default level. Redaction of structured keys does not redact a token embedded in a URL string.

## Caching

Use `CacheTags` from `packages/core/src/cache.ts`; do not invent literal tags at call sites.

- `cachedGlobal` is for actor-independent data only. Caching a permission-filtered result globally can expose private content.
- Cached regions must not read cookies, headers or actor/user helpers.
- Invalidate after a successful write. Invalidating before it can cache the old value again.

## Counters and events

Write counters and content in the same transaction. Emit outbox events in that transaction too. Every counter needs a bounded, resumable recount path.

Build event handlers per runtime container in `packages/runtime/src/event-handlers.ts`; do not register them on a module singleton. Delivery can repeat after a crash. Computed replacements must be safe to repeat; delta updates need an applied-event ledger.

## Theme slots

Resolve slots in the page or app shell, never inside another slot. Pass nested output through `regions`. Use literal slot maps with imported identifiers so static checks can inspect them.

Server slot modules must remain server modules. Client slot modules must declare `"use client"`; `QuickReply` and `EditorToolbar` are the client slots. Run `pnpm slots:check` and `pnpm slots:probe` when changing their wiring.

Panel location comes from `x-forum-path`/`x-forum-query`, set by the proxy and read through `currentLocation()`. Build active navigation on the server rather than making the panel a client component.

## View models

Define typed page models in `src/view/`. Use explicit public fields, never database rows. Models contain no dates, maps or functions. Supply timestamps as `TimeModel`, counts as `CountModel`, and links as resolved hrefs.

Use `<Page>ViewModel` for a page and plain model names for its parts. Model fields are public theme API: removals and renames require the [deprecation process](../extensions/theme-contract.md#versioning).

## Pagination

Screens use `?page=N`, `readPage`, `offsetOf` and `buildOffsetPager` from `src/view/pager.ts`. Invalid page values become page one. Never accept a raw offset from the URL.

List and count with the same filter. Reuse existing reliable counts where available. Pass the result to the `Pagination` slot; do not hand-build paging links.

REST endpoints retain cursor pagination. `pageCountIsExact` distinguishes counted offset pages from cursors without an exact total. Deep offsets cost database work; measure before adding an index or alternate paging strategy.

Do not generate links to routes that do not exist.
