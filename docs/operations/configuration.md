# Board configuration

| Layer | Values | Apply changes |
|---|---|---|
| Repository | Engine, themes, plugins | Build and deploy |
| Environment | Infrastructure and secrets | Restart/redeploy affected services |
| Admin settings | Name, registration, permissions, appearance | Save in the panel |

Supported explicit environment overrides take precedence over saved settings.

## Board files

| File | Purpose |
|---|---|
| `package.json` | Exact engine and dependency versions |
| `meith.config.ts` | Themes, default theme and static plugins |
| `board.plugins.json` | Packages managed by `plugin:add`/`plugin:remove` |
| `meith.plugins.ts` | Generated plugin imports and registry |

Use pnpm for the Meith source workspace. Generated boards use npm: their build requires a hoisted dependency layout, and the updater, plugin installer and Docker builds use npm. Keep the generated `.npmrc` and commit `package-lock.json`.

Install code in the repository, not a running container. See [Install extensions](installing.md).

## Runtime

Start from the generated `.env.example`, keep secrets out of git and use matching database/store configuration for web, worker and CLI.

```sh
npm run meith -- env:check
```

Run from the board directory. The check reports the resolved data source and redacts known secrets. Without `DATABASE_URL`, development normally uses fixtures. See [Environment](environment.md), [Database connections](database-operations.md) and [Administration](../administration/organiser-guide.md).
