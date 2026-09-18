# Run operator commands

Run maintenance commands from your board repository or a deployed container. Use the command form for your deployment; commands act on the database selected by that environment.

## The operator CLI

`meith` is the operator CLI, and every maintenance command on this page is one of its subcommands. How you reach it depends on the deployment:

| Deployment | Invocation |
|---|---|
| Compose, into the running board | `docker compose exec web meith <command>` |
| Compose, as a fresh one-shot container | `docker compose run --rm web meith <command>` |
| A local checkout of the board | `npm run meith -- <command>` |
| A platform that only builds and serves | `meith <command>`, from a checkout of the board repository with the production environment in front of it — see [Running on Vercel](vercel.md) |

`meith` is on `PATH` inside the board image, so `exec`-ing into the running `web` container is the quick way — nothing to build, and it shares the board the container is already serving. `run --rm` starts a fresh container instead, which is what you want when `web` is not up (a broken migration, say); `--rm` stops those accumulating, and `-T` is needed when the command reads standard input, as creating a user does under [Account recovery](#account-recovery). On Coolify, both run from the resource's **Terminal** with no SSH — see [Running commands on Coolify](coolify.md).

On a platform that only builds and serves, there is no container to run a command inside, which is why it runs from a checkout instead; the one command that does not wait for an operator is `meith migrate`, which belongs in the build command ahead of the build — see [Migrations](database-operations.md#migrations).

The CLI reaches PostgreSQL directly and can recover administrator access when
the web interface is unavailable. **Admin → System** can apply pending plugin
migrations after core migrations have run during deployment. Core migrations
must run from the CLI; see [Migrations](database-operations.md#migrations).

`meith --help` lists what the installed release actually has. A command documented here that is missing there means the running image is older than the page — see [A documented command is unavailable](troubleshooting.md#a-documented-command-is-unavailable).

## Account recovery

Create a user with a password on standard input:

```sh
printf '%s' '<password>' | docker compose run --rm -T web meith user:create --username <name> --email <address>
```

Promote a user:

```sh
docker compose run --rm web meith user:promote --user <id-or-username> --group <key-or-id>
```

Clear a lost second factor and end that user's sessions:

```sh
docker compose run --rm web meith user:2fa-clear --user <id-or-username>
```

Record who requested any recovery change.

## Search maintenance

Rebuild missing full-text records with the resumable command:

```sh
docker compose run --rm web meith search:reindex
```

Use it after an import or when diagnostics show posts without search data. It is safe to repeat.

## Import a legacy board

Follow [Import MyBB or phpBB](migrating.md) before running an import. The guide covers credentials, mounting source uploads, the row budget, resuming and checking permissions before cutover.

From a board checkout configured for the destination database:

```sh
npm run meith -- import --help
```

Supply the source password through `IMPORT_SOURCE_PASSWORD`; `MYBB_PASSWORD` remains supported. Use a protected environment or secret store rather than typing the value into a command recorded by shell history.

After the import completes, reconcile counters and rebuild search with the destination environment:

```sh
npm run meith -- task:run counters.reconcile
npm run meith -- search:reindex
```

## Plugins

Installing a manifest-eligible plugin — one that ships a zero-argument `plugin` export, see
[Writing a plugin](../extensions/plugins.md) — is a change to the sources your
image is built from, not something run against the deployed image. On your own board — scaffolded by
`create-meith`, or graduated out of the stock image by `board:eject` — it is one command, which
installs the package and registers it:

```sh
meith plugin:add @meith/plugin-dues
```

In a checkout of *this* repository, where the board is one workspace among many, the package is added
by hand with `pnpm add @meith/plugin-dues --filter @meith/web` (and `--filter @meith/board-stock` for
the stock board) first, then `meith plugin:add @meith/plugin-dues` records it across both. See
[Installing plugins and themes](installing.md) for the board admin's walkthrough.

`plugin:add` and `plugin:remove` edit `board.plugins.json` and regenerate
`meith.plugins.ts`; commit both and rebuild and redeploy the image for the change to take
effect. A plugin that cannot yet satisfy the manifest's export convention stays a line in
`meith.plugins.ts` you write by hand, exactly as before.

Before removing plugin code, purge its owned data through the lifecycle hook — this one *does*
run against the deployed board, because it needs the live database:

```sh
docker compose run --rm web meith plugin:purge <key> --yes
```

Removing files first can leave data without the code required to clean it up.
