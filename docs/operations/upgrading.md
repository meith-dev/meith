# Upgrade a board

## Prepare

Read release notes and [compatibility notes](upgrade-notes.md), check extension compatibility and take a verified backup including uploads and secrets.

> [!CAUTION]
> Migrations are forward-only. Downgrading code does not roll back the schema. Recovery requires restoring a known-good backup.

The planner rejects downgrades and jumps over more than two major versions. Use published intermediate releases where required.

## Update source

In the generated board directory:

```sh
npx create-meith@latest update
npm install
```

The updater changes Meith pins and the matching Next.js version together and refreshes scaffold-owned files. Review customized files it skips and commit the source and lockfile. Do not independently bump only `@meith/web` or `next`.

## Deploy and migrate

Push and redeploy through the chosen host. For prebuilt images, wait for the build and select its intended tag. Core migrations must finish before web serves; previews must not accidentally migrate production.

Use a direct migration connection. Run one upgrade at a time because the core lock does not cover plugin migrations. Through the [deployed CLI](operator-cli.md):

```sh
meith upgrade --dry-run
meith upgrade
```

This applies missing core and enabled-plugin migrations, then records versions. `meith migrate` alone is core-only. The admin system page can apply plugin migrations after core migration completes. Applied migrations are transactional and resumable; fix forward instead of editing an applied migration.

## PostgreSQL major versions

Do not point a new PostgreSQL major at an old data volume. Restore a dump into a separate database using the new major and matching client tools, verify it, then switch the board connection. Keep the old volume and backup until verified.

## Verify

Check version, pending migrations, sign-in, posting, private forums, attachments, mail, scheduled work and logs before reopening. If checks fail, use the restore plan rather than older code against the changed schema.
