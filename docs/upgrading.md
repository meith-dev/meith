# Upgrading a board

## The short version

```sh
npm install @forum/web@latest @forum/cli@latest
npm run forum -- upgrade --dry-run   # read what it will do
npm run forum -- upgrade
```

Deploy the new code first, then run the upgrade. The admin panel shows a notice
until you do.

## Take a backup first

Migrations are **forward-only** (invariant 32) and this is not a preference. A
down migration that drops a column is a data-loss button on a live board, and
some migrations — a destructive backfill, a column collapsed into another —
cannot be reversed at all. A "roll back" button that worked for some migrations
and silently did nothing for others would be worse than its absence.

So recovery is by restore, which means the backup is the rollback plan rather
than a precaution. Take one before every upgrade, and take one you have actually
restored at least once.

## The order, and why it is that order

`forum upgrade` does four things:

1. **Core migrations.** Everything else assumes the schema they create.
2. **Plugin migrations**, per plugin, in **dependency order** — a plugin's table
   nearly always references one of core's, and often one of another plugin's.
3. **Plugin versions recorded**, one per plugin.
4. **The core version recorded**, last.

The last one is last deliberately. A version written before the work means a
failed upgrade leaves a board claiming to be something it is not, and the next
run finds nothing to do — the same reasoning as the installer's seal.

### Dependency order is declared, not guessed

A plugin says what it needs:

```ts
export const badges = definePlugin({
  key: 'badges',
  name: 'Badges',
  version: '1.2.0',
  dependsOn: ['points'],
  // …
})
```

Declared rather than inferred, because the dependency that matters is a
*schema* one and nothing in an import graph reveals it. The planner sorts
topologically and **breaks ties on the plugin key**, so the sequence is the same
on your staging board as on production — which is the only thing that makes
rehearsing an upgrade worth anything.

A cycle is refused with the tangled keys named. A plugin depending on something
that is not installed is refused by name, rather than quietly running against a
table that does not exist.

### Each plugin migration is applied and recorded in one transaction

The record is part of the migration, which is the only arrangement that survives
a crash between the two. Applied-and-unrecorded means the next run applies it
again; recorded-and-unapplied means a column that never exists and a plugin that
fails on every request.

That is also what makes "try the upgrade again" a safe instruction: an
interrupted run re-applies nothing it already did.

## How far you can jump

**Two majors.** A board at 1.x can upgrade directly to 3.x; 1.x to 4.x is
refused.

The limit is honesty rather than caution. Supporting an arbitrary jump means
every migration must remain correct against every schema that ever existed —
a promise nobody can test, and therefore one that should not be made. Two majors
is what the migration set is exercised against, so two majors is what is claimed.

A board further behind is not stuck. Upgrade in stages:

```sh
npm install @forum/web@2 @forum/cli@2 && npm run forum -- upgrade
npm install @forum/web@3 @forum/cli@3 && npm run forum -- upgrade
npm install @forum/web@latest @forum/cli@latest && npm run forum -- upgrade
```

Each stage is an ordinary upgrade with an ordinary backup in front of it.

## Downgrades

Refused. Migrations are forward-only, so "downgrading" means running old code
against a schema that has already been migrated past it — which usually appears
to work and corrupts something a week later. If you have deployed a version you
did not mean to, deploy the newer one again; if the newer one is broken, restore
the backup.

## Serverless: deploy, then upgrade

On Vercel the two are separate events, and the gap between them is real. The
board runs the new code as soon as the deployment is live, and the schema does
not change until you run the command.

That window is why the admin notice exists. It names both versions and the
number of migrations waiting, so the failure mode — new logic against an old
schema, surfacing as "column does not exist" in whichever request touches it
first — becomes a sentence somebody read before it happened.

For a board with real traffic, the usual advice applies: migrations that only
*add* things are safe to run before or after a deploy, and migrations that remove
or rename need the two-step (ship code that tolerates both shapes, migrate, then
ship code that assumes the new one). Releases say which kind they are.

## Self-hosted

The standalone image runs the migrate role:

```sh
docker run --rm -e FORUM_ROLE=migrate -e DATABASE_URL=… forum:latest
```

That applies core migrations only — the same thing step 1 above does. Plugin
migrations run through `forum upgrade`, which needs the board's
`forum.config.ts` to know which plugins are installed.

## What the CLI cannot do

`forum upgrade` installed from npm applies **core** migrations and records the
core version. It cannot apply plugin migrations, because `forum.config.ts` lives
in your project and an operator CLI installed as a dependency has no path to it.

Run the board's own upgrade entry point for plugins. This is a real limitation
rather than an oversight, and it is written down here because discovering it
during an upgrade is the wrong moment.
