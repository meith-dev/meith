# Operator commands

Commands act on the database selected by their environment. Check it before running maintenance.

## The operator CLI

| Context | Invocation |
|---|---|
| Board checkout | `npm run meith -- <command>` |
| Running Compose service | `docker compose exec web meith <command>` |
| One-shot Compose container | `docker compose run --rm web meith <command>` |
| Meith source checkout | `pnpm meith <command>` |

Use `meith --help` through the appropriate invocation to list installed commands. In Coolify, use the resource Terminal. For function hosting, use a local board checkout with the hosted-service environment.

Use `-T` for piped input. Run core migrations before serving new code; panel upgrades handle plugin migrations only.

## Account recovery

Verify the requester's identity before changing credentials. Create a user with a password on stdin:

```sh
read -r -s RECOVERY_PASSWORD
printf '%s' "$RECOVERY_PASSWORD" | docker compose run --rm -T web meith user:create --username ada --email ada@example.com
unset RECOVERY_PASSWORD
```

Promote an existing user or clear a lost second factor:

```sh
docker compose run --rm web meith user:promote --user ada --group administrators
docker compose run --rm web meith user:2fa-clear --user ada
```

Use the intended group key or ID. Clearing two-factor authentication revokes the user's sessions. Record the recovery request.

## Search and import

`meith search:reindex` rebuilds missing full-text records and can be repeated. After an [import](migrating.md), run:

```sh
npm run meith -- task:run counters.reconcile
npm run meith -- search:reindex
```

Supply source passwords through a protected `IMPORT_SOURCE_PASSWORD` environment variable; `MYBB_PASSWORD` is also accepted.

## Plugins

In a board checkout, `npm run meith -- plugin:add <package>` installs and registers a zero-argument `plugin` export. Commit `board.plugins.json`, `meith.plugins.ts`, package and lockfile changes, then deploy.

In the Meith monorepo, add the dependency to `@meith/web` and, when applicable, `@meith/board-stock` with `pnpm add --filter`, then register it. Plugins needing constructor arguments require manual configuration.

To permanently remove owned data, back up first and purge before removing code:

```sh
docker compose run --rm web meith plugin:purge <key> --yes
```

See [Extension installation](installing.md).
