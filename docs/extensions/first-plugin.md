# Write your first plugin

Create a plugin, run its tests and load it into a development board. You need Node.js 22 or newer, npm and a [writable local board](../operations/local-board.md).

## 1. Scaffold the plugin

From the directory that contains your board project:

```sh
npx create-meith --plugin first-light
cd first-light
npm install
npm test
npm run typecheck
```

The scaffold includes `src/plugin.tsx`, a test, an entry point and a marketplace listing. Its example declares hooks, a region, a setting, a migration, a scheduled task and an admin page. The entry point exports the `plugin` and `messages` names expected by the board.

## 2. Change a hook

Open `src/plugin.tsx` and find the `view.footer` filter. Change the label of its added link, then update the matching expectation in `src/plugin.test.ts`.

A filter returns a new value; it must not mutate the model passed to it. An event such as `post.created` reacts to an action and its return value is ignored. The [hook reference](../reference/plugin-hooks.md) lists the supported names and payloads.

Run `npm test` and `npm run typecheck` again. A successful module import also checks the plugin definition: invalid keys, namespace violations and invalid settings are rejected.

## 3. Register it in a board

Install the local plugin from the board directory:

```sh
cd ../my-board
npm install ../first-light
```

For this local tutorial, add the imports and entry to the board's `meith.plugins.ts`, preserving any existing plugins and the `installedPluginDefinitions` function:

```ts
import { messages as firstLightMessages, plugin as firstLightPlugin } from 'first-light'
```

Add this object inside `INSTALLED_PLUGINS`:

```ts
{ key: 'first-light', enabled: true, plugin: firstLightPlugin, messages: firstLightMessages }
```

Also add the package to the `plugins` array in `board.plugins.json` so future registry generation retains it:

```json
{ "key": "first-light", "package": "first-light", "enabled": true }
```

This is a local package installation. For published packages, use the [operator installation command](../operations/installing.md), which updates the manifest and registry together.

## 4. Apply migrations and run

With the board's development database configured, run from its directory:

```sh
npm run meith -- upgrade
npm run build
npm run start
```

`upgrade` applies core and registered plugin migrations. `migrate` alone applies core migrations and is not sufficient for the scaffold's plugin table.

Open the board and check the footer link. Sign in as administrator and find the plugin under **Admin → Plugins**. Verify its settings and admin page. Background tasks need a [running scheduler](../operations/scheduled-tasks.md).

## 5. Continue developing

npm links a local directory installation, so edit the plugin and rebuild the board to see the change. Keep plugin tables in their namespace and leave applied migrations unchanged.

Continue with [Plugin development](plugins.md) for routes, storage, settings and UI. Use [Publish to the marketplace](marketplace.md) when the plugin is tested and ready to share.
