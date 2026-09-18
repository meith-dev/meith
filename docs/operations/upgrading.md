# Upgrade Meith

Update one board to a new release while keeping its packages, schema and plugins in step. You need the board repository or deployment controls, the release notes and a verified backup.

## 1. Check compatibility and back up

Read the release notes and [upgrade compatibility notes](upgrade-notes.md). Check installed plugin and theme compatibility. Take a fresh backup including uploads, and retain the original deployment environment.

> [!CAUTION]
> Migrations are forward-only. Downgrading code against a migrated schema is not rollback. Recovery requires restoring a known-good backup into a suitable destination.

The upgrade planner permits a jump of at most two major versions and refuses downgrades. If further behind, upgrade through supported intermediate releases, backing up and checking each stage. Use real published release versions; do not invent intermediate tags.

## 2. Update the board's source

In a generated board repository:

```sh
npx create-meith@latest update
npm install
```

The updater moves the Meith package pins and matching Next.js version together and refreshes scaffold-owned deployment files. Read its output for files it leaves unchanged because you customized them. Review the diff and lockfile before committing.

Do not independently bump only `@meith/web` or `next`. The board and framework versions must match. The generated update workflow can propose the same change in a PR; review it before merging.

## 3. Build and deploy

| Deployment | Action |
|---|---|
| Coolify, source build | Push the reviewed changes and redeploy the resource |
| Coolify, prebuilt image | Wait for the image build, select the intended image and redeploy |
| Docker Compose | Build or pull the selected image, then recreate services using the board's deployment files |
| Vercel | Deploy the reviewed board source with its intended database environment |

Core migrations run before the new web service is made available: the Compose migration service or the configured build/deploy command performs them. A preview must not accidentally migrate production.

Use a direct database connection for migrations when the runtime connection uses a transaction-mode pooler. The core migration lock does not serialize the later plugin migration phase; run one upgrade at a time.

## 4. Apply plugin migrations and record the version

Run the installed version of the CLI against the upgraded board:

```sh
meith upgrade --dry-run
meith upgrade
```

Use [Operator commands](operator-cli.md) for the container or board-checkout invocation. The upgrade applies missing core migrations, then enabled plugin migrations, then records plugin and core versions. `meith migrate` alone does not apply plugin migrations.

**Admin → System → Version & migrations** can apply plugin migrations after the deployment has applied core migrations. It will not replace the core deployment step.

Applied plugin migrations are recorded transactionally and can be resumed after interruption. Do not edit a migration that has already run; fix forward with a new one.

## 5. Verify and reopen

Check the displayed version, pending migrations, public pages, sign-in, writing, private-forum access, attachments, email and scheduled work. Review logs before reopening a board held for maintenance.

If verification fails, preserve logs and the backup. Use the recorded recovery plan rather than switching the application to an older version over the changed database.
