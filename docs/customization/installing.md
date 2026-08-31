# Installing plugins and themes

A Meith board is a small code repository you own. Plugins and themes are npm
packages **built into that repository**, not uploaded into a running site — so
adding one is always the same three moves: install the package, register it,
redeploy. Nothing here needs to touch the server directly.

If you would rather build your own than install one, start with
[Write your first plugin](./first-plugin.md).

## Find one

Browse the reviewed catalog at
[meith.dev/marketplace](https://www.meith.dev/marketplace). Each listing shows
its package name, what it does, the board versions it is compatible with, and
the exact install steps below. You can read all of it before committing to
anything — a board of your own is never required to look.

## Install a plugin

One command, from your board's directory:

```sh
npm run meith -- plugin:add @meith/plugin-dues
```

Then **commit, push, and redeploy**. On Coolify that is one Redeploy; on any
host it is a rebuild, because a plugin is code and has to be in the build
before it can run.

`plugin:add` installs the package (`npm install --save-exact`), records it in
`board.plugins.json`, and regenerates `meith.plugins.ts` — you do not edit
either by hand. It reads the plugin's key from a `@scope/plugin-<key>` package
name; pass `--key <key>` if the name does not fit that shape, or `--disabled`
to install it switched off. `npm run meith -- plugin:remove <key>` is the
reverse.

If the new release also ships database changes, apply them once it is up from
**Admin → System** (**Version & migrations**), or run `meith upgrade` — see
[Operations](../guides/operations/operating.md#migrations).

## Install a theme

Install the package the same way:

```sh
npm install @meith/theme-midnight
```

Then register it in `meith.config.ts`, in the `themes` map, following the shape
of the `default` entry already there, and set `defaultTheme` to its key if it
should be the board's default. **Commit, push, and redeploy.**

A theme is chosen per member in their own control panel; `defaultTheme` only
decides the fallback for members who have not picked one. There is no
`theme:add` command — a theme brings tokens and a component tree that the
config wires up by hand, which is a single import and one map entry.

## Manage it from the panel

Once it is deployed, the browser admin panel takes over — no shell needed:

- **Admin → Plugins** lists every installed plugin, switches one on or off,
  and flags **Update available** when the marketplace has a newer compatible
  version. **Check for updates** refreshes that check on demand.
- **Admin → Themes** does the same for themes.

## Update one

Bump the package to the version you want, then redeploy:

```sh
npm install @meith/plugin-dues@latest
```

Commit, push, redeploy. The panel's update flags tell you when one is worth
doing.

## Remove one

A **plugin**: if it stored data, run `meith plugin:purge <key>` first, while
its code is still installed, so it can clean up after itself. Then take it out
and redeploy:

```sh
npm run meith -- plugin:remove <key>
npm uninstall @meith/plugin-dues
```

A **theme**: delete its entry from the `themes` map in `meith.config.ts`
(and repoint `defaultTheme` if it was the default), then
`npm uninstall @meith/theme-midnight`. Redeploy either way.

## Where these live

| File | What it is |
|---|---|
| `board.plugins.json` | The plugin list. `plugin:add`/`plugin:remove` edit it; you can too. |
| `meith.plugins.ts` | Generated from `board.plugins.json`. Leave it to the CLI. |
| `meith.config.ts` | The `themes` map and `defaultTheme`, edited by hand. |

Nothing is discovered by scanning a folder at runtime: a build contains only
what the config named, which is what lets the compiler check it and the board
start with a registry that already makes sense.

## Build your own

- [Write your first plugin](./first-plugin.md) — the walkthrough from an empty
  directory to a plugin running inside a board.
- [Plugins](./plugins.md) — the full plugin API: hooks, lifecycle, and what a
  plugin may and may not do.
- [Themes](./themes.md) — the theme API: slots, view models, and tokens.
- [The marketplace](./marketplace.md) — how a listing is reviewed and
  published.
