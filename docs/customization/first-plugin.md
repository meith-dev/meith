# Write your first plugin

This is the walkthrough: from an empty directory to a plugin running inside
a board and submitted to the marketplace, with a working extension at every
step. The policy — what a plugin may and may not do, and what the
guarantees cover — lives in [Plugins](./plugins.md); every hook and payload
is in the generated [Plugin hooks](../reference/plugin-hooks.md) reference.
This page assumes both exist and shows the path through them.

## Scaffold it

```sh
npx create-meith --plugin first-light
cd first-light
npm install
npm test
```

That is already a complete, passing extension. The scaffold's source is
generated from the meith repository's `examples/hello-plugin` — reviewed,
CI-covered code, renamed for you — so what you start from is the worked
example, not a boilerplate that drifted from it. It contains:

- `src/plugin.tsx` — the plugin: one `definePlugin` call declaring a
  setting, a migration, a task, an admin page, a region contribution and
  two hooks.
- `src/plugin.test.ts` — a passing test driving the `view.footer` hook the
  way the board will.
- `src/index.ts` — the entry point, exporting the plugin under the two
  fixed names (`plugin`, `messages`) the board's install path expects.
- `listing.json` — a pre-filled marketplace listing for later.
- `README.md` — a shorter copy of this walkthrough, kept with the code.

`definePlugin` validates the whole manifest at import time — a bad key, a
migration touching a table outside the plugin's namespace, a secret setting
with a shipped default all throw before anything registers. The first test
in `src/plugin.test.ts` exists to catch exactly that: if the module
imports, the manifest is valid.

## Change what it does

Open `src/plugin.tsx`. The plugin already handles two hooks:

- `view.footer` is a **filter**: what the handler returns replaces the
  value, so the scaffold appends a footer link by returning a copy of the
  model with one more entry.
- `post.created` is an **event**: the return value is discarded, and a
  throw is isolated and logged rather than taking the page down.

Make it react to new threads instead. Replace the `post.created` entry
with:

```ts
'thread.created': (thread, context) => {
  console.log(`thread ${thread.threadId} by user ${context.userId ?? 'guest'}`)
},
```

Both names come from the generated reference — if a hook is not listed
there, it does not fire. The value and context types are enforced: your
editor autocompletes `thread.threadId` because `definePlugin` knows the
payload for every hook name.

## Test it

The scaffold's test file shows the pattern: call the handler directly with
a model shaped like the reference says, and assert on what comes back.
Handlers are plain functions — no board, no database, no mocking layer:

```ts
it('appends its link without disturbing the board’s own', () => {
  const filter = firstLightPlugin.hooks?.['view.footer'] as FilterHandler<'view.footer'>
  const footer = {
    boardTitle: 'A board',
    links: [{ label: 'Contact', href: '/contact' }],
    timezoneLabel: 'Europe/Dublin',
  }

  const filtered = filter(footer, { userId: null, isGuest: true, requestId: null })

  expect(filtered.links).toHaveLength(2)
  expect(footer.links).toHaveLength(1)
})
```

That last assertion is the one worth copying. A filter must return a new
value rather than mutating the one it was handed: the same model is passed
to every plugin in the chain, and one that edits in place changes what the
others see.

`npm test` runs vitest; `npm run typecheck` runs `tsc` over the same
source, and catches a payload field that does not exist before the board
would.

## Run it inside a board

Scaffold a board next to the plugin if you do not have one, then install
the plugin into it by path:

```sh
cd ..
npx create-meith my-board
cd my-board
npm install ../first-light
```

Register it in the board's `community.plugins.ts` — the comment at the top
of that file shows the shape:

```ts
import { messages as firstLightMessages, plugin as firstLightPlugin } from 'first-light'

export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [
  { key: 'first-light', enabled: true, plugin: firstLightPlugin, messages: firstLightMessages },
]
```

and mirror it in `board.plugins.json`:

```json
{ "plugins": [{ "key": "first-light", "package": "first-light", "enabled": true }] }
```

Then build, migrate and start:

```sh
npm run build
npx community migrate
npm run start
```

The scaffold ships one migration, which is why `community migrate` is in
the list — it creates the plugin's own `plugin_first_light_wave` table,
inside the namespace the host enforces. The plugin now appears under
**Admin → Plugins**: its setting is editable there, its admin page renders
under it, and its footer line is on the board index. Registration is
static on purpose — nothing scans a directory at runtime, so what the
bundler saw at build time is exactly what runs
([Plugins](./plugins.md#writing-a-plugin) explains why).

While iterating, npm installs a local directory as a symlink: edit the
plugin, rebuild the board, and the change is there — no reinstalling.

## Publish it

```sh
npm publish
```

The scaffold publishes `src/` as TypeScript source, the way every
`@meith/*` package ships. A board that installs your published package gets
the same files a path install gets. Version it honestly: the `version` in
`package.json` is what the admin panel shows and what your migration
history is recorded against.

## Submit it to the marketplace

The marketplace is a curated feed, not an open index — a listing is a pull
request against the meith repository, reviewed against the bar described in
[The marketplace](./marketplace.md). The scaffold pre-filled
`listing.json` with your plugin's key, package name and a compatibility
range; before submitting:

1. Set `repository` to your real repository URL (it starts as a
   placeholder).
2. Take the screenshot the listing names and add it to
   `marketplace/screenshots/`.
3. Copy `listing.json` into `marketplace/listings/<key>.json` in your pull
   request and run `pnpm marketplace:gen`.

[The marketplace](./marketplace.md) documents the review checklist — what
reviewers read, what gets a listing declined, and how removal works.

## Themes take the same path

`npx create-meith --theme <name>` scaffolds the equivalent starting point
for a theme — the default board recoloured plus one slot override,
generated from `examples/iris-theme` the same way. From there,
[Themes](./themes.md) is the policy and [Theme slots](../reference/theme-slots.md)
the reference.
