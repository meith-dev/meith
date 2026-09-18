# Board configuration

Meith has three configuration layers. Choose the layer before changing a value; it determines whether you need a rebuild, a restart or only a save in the admin panel.

## Choose the right layer

| Layer | Examples | How changes take effect |
|---|---|---|
| Board repository | Engine version, installed themes and plugins | Build and deploy the board |
| Environment | Database, infrastructure drivers, deployment secrets | Update the deployment environment and restart or redeploy affected services |
| Database-backed settings | Board name, registration, spam controls, appearance | Save through the admin panel; no code deployment |

Where a setting also supports an environment override, the explicit environment value wins. Setting a value in the panel cannot override a value pinned in the environment.

## Understand the board repository

| File | Purpose |
|---|---|
| `package.json` | Exact engine and dependency versions |
| `meith.config.ts` | Themes, default theme and static plugin registration |
| `board.plugins.json` | Plugin packages edited by `meith plugin:add` and `plugin:remove` |
| `meith.plugins.ts` | Generated imports and installed-plugin registry |

Installable code must be present at build time. Adding a package to a running container does not add it permanently to the board. Follow [Install plugins and themes](installing.md), then commit and deploy the board files.

## Set the runtime environment

Use your generated `.env.example` as the starting point. Keep credentials outside git and make sure web, worker and maintenance commands use the intended database and file store.

Run the check from the board checkout:

```sh
npm run meith -- env:check
```

For container and hosted invocations, see [Operator commands](operator-cli.md). The command reports the resolved data source and redacts known secrets. Without `DATABASE_URL`, the board may be running the read-only sample dataset.

Read [Environment variables](environment.md) for common settings and [Database connections](database-operations.md) for pooled/direct URLs.

## Configure the community

Use [Community administration](../administration/organiser-guide.md) for browser-managed settings. Forums, groups, posts, members and attachment metadata live in PostgreSQL; uploaded files live in the selected file store. Protect both with [backups](backups.md).
