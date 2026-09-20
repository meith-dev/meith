# Create a plugin

Requires Node.js 22+, npm and a [local board with PostgreSQL](../operations/local-board.md).

## 1. Create the package

Run beside your board directory:

```sh
npx create-meith --plugin first-light
cd first-light
npm install
npm test
npm run typecheck
```

The package exports `plugin` and `messages`. Its example includes a hook, region, setting, migration, task and admin page.

## 2. Edit a hook

In `src/plugin.tsx`, change the link label returned by `view.footer`. Update its expectation in `src/plugin.test.ts`, then rerun the tests and typecheck.

Filters return a new value without mutating their input. Event return values are ignored. See the [hook reference](../reference/plugin-hooks.md).

## 3. Register the plugin

Run from the board directory:

```sh
cd ../my-board
npm install ../first-light
```

In `meith.plugins.ts`, add the import:

```ts
import { messages as firstLightMessages, plugin as firstLightPlugin } from 'first-light'
```

Add this entry to `INSTALLED_PLUGINS`, preserving existing entries and `installedPluginDefinitions`:

```ts
{ key: 'first-light', enabled: true, plugin: firstLightPlugin, messages: firstLightMessages }
```

Add the corresponding entry to the `plugins` array in `board.plugins.json`:

```json
{ "key": "first-light", "package": "first-light", "enabled": true }
```

For published packages, [use `plugin:add`](../operations/installing.md) to update both files automatically.

## 4. Build and check

From the board directory, with its development database configured:

```sh
npm run meith -- upgrade
npm run build
npm run start
```

`upgrade` applies core and plugin migrations; `migrate` alone does not apply plugin migrations. Check the footer and **Admin → Plugins**, including the example settings and page. Tasks require the [scheduler](../operations/scheduled-tasks.md).

npm links the local package directory. Edit the plugin and rebuild the board to test changes. Do not modify applied migrations.
