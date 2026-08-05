# Upgrading a board

Taking a board from one version to the next: what to do, in what order, and how
far you can jump.

## The short version

```sh
npm install @meith/web@latest @meith/cli@latest
npm run forum -- upgrade --dry-run   # read what it will do
npm run forum -- upgrade
```

Deploy the new code **first**, then run the upgrade. The admin panel shows a
notice until you do.

## Take a backup first

> [!CAUTION]
> Migrations are forward-only. Restoring a backup is the *only* way back, which
> makes the backup your rollback plan rather than a precaution.

There is no down migration and there will not be one. A down migration that drops
a column is a data-loss button on a live board, and some migrations — a
destructive backfill, a column collapsed into another — cannot be reversed at
all. A "roll back" that worked for some and silently did nothing for others would
be worse than its absence.

Take a backup before every upgrade, and make sure it is one you have actually
restored at least once. See
[backup and restore](./operating.md#backup-and-restore).

## What `forum upgrade` does

Four things, in this order:

1. **Core migrations.** Everything else assumes the schema they create.
2. **Plugin migrations**, per plugin, in dependency order.
3. **Plugin versions recorded**, one per plugin.
4. **The core version recorded**, last.

**Why the version is written last.** A version written before the work means a
failed upgrade leaves a board claiming to be something it is not — and the next
run finds nothing to do. Same reasoning as the installer's seal.

### Dependency order is declared, not guessed

A plugin says what it needs:

```ts
export const badges = definePlugin({
  key: "badges",
  name: "Badges",
  version: "1.2.0",
  dependsOn: ["points"],
  // …
})
```

Declared rather than inferred, because the dependency that matters is a *schema*
one, and nothing in an import graph reveals it.

The planner sorts topologically and **breaks ties on the plugin key**, so the
sequence is identical on your staging board and on production. That is the only
thing that makes rehearsing an upgrade worth anything.

| Problem | What happens |
|---|---|
| A dependency cycle | Refused, with the tangled keys named |
| A plugin depends on something not installed | Refused by name, rather than quietly running against a table that does not exist |

### An interrupted upgrade is safe to re-run

Each plugin migration is applied *and recorded* in one transaction. That is the
only arrangement that survives a crash between the two:

- Applied but not recorded → the next run applies it again.
- Recorded but not applied → a column that never exists, and a plugin that fails
  on every request.

Because the two are atomic, "try the upgrade again" is a safe instruction: an
interrupted run re-applies nothing it already did.

## How far you can jump

**Two majors.** A board at 1.x can upgrade directly to 3.x. 1.x to 4.x is
refused.

The limit is honesty rather than caution. Supporting an arbitrary jump means
every migration must remain correct against every schema that ever existed — a
promise nobody can test, and therefore one that should not be made. Two majors is
what the migration set is exercised against, so two majors is what is claimed.

A board further behind is not stuck. Upgrade in stages:

```sh
npm install @meith/web@2 @meith/cli@2      && npm run forum -- upgrade
npm install @meith/web@3 @meith/cli@3      && npm run forum -- upgrade
npm install @meith/web@latest @meith/cli@latest && npm run forum -- upgrade
```

Each stage is an ordinary upgrade with an ordinary backup in front of it.

## Downgrades

Refused.

Migrations are forward-only, so "downgrading" means running old code against a
schema that has already been migrated past it — which usually appears to work and
corrupts something a week later.

| Situation | Do this |
|---|---|
| You deployed a version you did not mean to | Deploy the newer one again |
| The newer one is broken | Restore the backup |

## Serverless: deploy, then upgrade

On Vercel the two are separate events, and the gap between them is real. The
board runs the new code as soon as the deployment is live; the schema does not
change until you run the command.

That window is why the admin notice exists. It names both versions and the number
of migrations waiting — so the failure mode (new logic against an old schema,
surfacing as "column does not exist" in whichever request touches it first)
becomes a sentence somebody read before it happened.

For a board with real traffic:

| Migration kind | When to run it |
|---|---|
| Adds things only | Before or after the deploy; either is safe |
| Removes or renames | Two-step: ship code that tolerates both shapes, migrate, then ship code that assumes the new one |

Releases say which kind they are.

## Self-hosted

The standalone image runs the migrate role:

```sh
docker run --rm -e FORUM_ROLE=migrate -e DATABASE_URL=… forum:latest
```

That applies **core migrations only** — the same thing step 1 does. Plugin
migrations run through `forum upgrade`, which needs your `forum.config.ts` to
know which plugins are installed.

## Settings whose defaults have changed

A board setting is stored only once somebody changes it, so a **default** that
moves applies to every board that never touched that switch. There is no
migration to run and nothing to undo; the point of listing them is that
behaviour changed without anybody on your board doing anything.

| Setting | Was | Is | What changes on a board that never set it |
|---|---|---|---|
| `reputation.comment_required` | on | off | Posts gain a one-press **Thanks** button. A rating no longer has to carry a reason — a click is the whole interaction, which is what makes thanking an answer worth doing. |

Set it back from **Admin → Settings → Reputation** if your board wants every
rating to say why. That is the right choice for a board that allows negative
ratings, and it is why the two switches are worth reading together: a criticism
with no reason attached is the part of reputation people argue about, and a
thanks is not.

## What the CLI cannot do

> [!NOTE]
> `forum upgrade` installed from npm applies **core** migrations and records the
> core version. It cannot apply plugin migrations.

`forum.config.ts` lives in your project, and an operator CLI installed as a
dependency has no path to it. Run the board's own upgrade entry point for
plugins.

This is a real limitation rather than an oversight, and it is written down here
because discovering it during an upgrade is the wrong moment.
