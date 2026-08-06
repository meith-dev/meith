# Upgrading a board

Taking a board from one version to the next: what to do, in what order, and how
far you can jump.

## The short version

Deploy the new code, then run the upgrade:

```sh
forum upgrade --dry-run   # read what it will do
forum upgrade
```

On the documented deployments the *core* migrations are already applied by then
— the `migrate` container runs to completion before anything serves — so
`upgrade` is what carries plugin migrations and records the version. The admin
panel shows a notice until you run it.

`forum` is the operator CLI, and how you invoke it depends on how the board was
deployed; [Running a board § The operator CLI](./operating.md#the-operator-cli)
has the three spellings.

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

A board further behind is not stuck. Upgrade in stages — check out each major
in turn, deploy it, and run the upgrade before moving on:

```sh
git checkout v2 && docker compose up -d --build && forum upgrade
git checkout v3 && docker compose up -d --build && forum upgrade
git checkout main && docker compose up -d --build && forum upgrade
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

## On your own server

Under [Coolify](./quickstart.md), the upgrade is the **Redeploy**
button — or nothing at all, if you have enabled the webhook and a push to `main`
deploys itself.

Under Compose it is two commands:

```sh
git pull
docker compose up -d --build
```

Either way the ordering is handled for you:

`migrate` runs to completion first and `web` and `worker` wait for it, so the
new code never serves against the old schema. Take a backup before you start —
migrations are forward-only, and recovery is by restore. Coolify's scheduled
backup covers Postgres; the uploads volume is a second thing, and yours.

That applies **core migrations only**. Plugin migrations run through
`forum upgrade`, which needs your `forum.config.ts` to know which plugins are
installed — see
[the operator CLI](./operating.md#the-operator-cli) for how to run it on your
deployment.

## When the deploy and the migration are separate events

Deploy some other way, and the two come apart: the board runs the new code as
soon as the deployment is live, and the schema does not change until you run the
command. Between them, new logic is talking to an old schema.

That window is why the admin notice exists. It names both versions and the number
of migrations waiting — so the failure mode (surfacing as "column does not exist"
in whichever request touches it first) becomes a sentence somebody read before it
happened.

For a board with real traffic:

| Migration kind | When to run it |
|---|---|
| Adds things only | Before or after the deploy; either is safe |
| Removes or renames | Two-step: ship code that tolerates both shapes, migrate, then ship code that assumes the new one |

Releases say which kind they are.

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

## Settings that gained a reader

A setting can also change behaviour by starting to be *read*. That is not a
default moving, and there is nothing to run — but it is worth knowing which
switches on your board were, until now, decorative.

### `registration.method` now decides what a new account has to do

`registration.method` had been a setting since F13 with no reader: the dropdown
moved, the value was stored, and every account was created as though it said
`none`. It is now honoured everywhere the board creates an account.

**Its default moved to `none` in the same release**, which is what keeps this
from changing anything under you. Read the two together:

| Your board stored | Before | Now |
|---|---|---|
| Nothing (never opened the screen, *or* chose `email` while it did nothing) | Accounts active immediately | Accounts active immediately — unchanged |
| `none` | Accounts active immediately | Unchanged |
| `admin` | Accounts active immediately, **contrary to the setting** | Accounts wait for an administrator |
| `both` | Accounts active immediately, **contrary to the setting** | A confirmation link, then an administrator |

The first row is the one that needs explaining: **a value equal to its default
is not stored**, so an operator who selected `email` back when it did nothing
has no row, and is indistinguishable from somebody who never opened the screen.
Defaulting to `email` would have switched confirmation on for both of them — on
boards where `MAIL_DRIVER` is very often still `log`, which sends nothing and
would have left them unable to register anybody. The default follows the
behaviour every board actually had.

**If you did want confirmed addresses, you now have to say so** — and this time
saying so works. Set it in **Admin → Settings → Registration**, after
configuring a mail driver ([Mail](./operating.md#mail)). The last two rows of
the table are the boards that get a real behaviour change: they asked for
vetting, and now they get it.

> [!IMPORTANT]
> `email` or `both` with `MAIL_DRIVER` unset or `log` is a board nobody can
> join: the links are minted, written to the log, and never sent. The
> registration settings screen and `/admin/system` both say so for as long as it
> is true, so this is not a thing you find out from your members.

Accounts stuck at *awaiting activation* can be activated by hand from their
member screen under **Admin → Members**, and anybody who never received a link
can ask for another at `/verify/resend`.

The CLI and the installer are deliberately unaffected: `forum user:create` and
the founding administrator are still created active, because an operator at a
terminal cannot follow a link in somebody else's mailbox, and an unactivatable
first administrator is a board with no way in.

### The password and username rules now come from the settings screen

`registration.min_password_length`, `registration.username_min` and
`registration.username_max` were registered settings with no reader either —
every one of them served from a constant, so the fields moved and the
registration form went on enforcing 8, 3 and 30.

They are read now, by the board **and by `forum user:create`**, which matters
more than it sounds: a CLI that enforced different rules is a way to create
accounts the board itself would have rejected.

The registry defaults are 10, 3 and 30. A board that never touched them gets a
**minimum password length of 10 rather than 8** — the one change here that can
surprise somebody, and it applies to new passwords only. Existing passwords are
untouched and no one is locked out; F17 rehashes on next login regardless.

> [!NOTE]
> A minimum username length above the maximum is impossible to satisfy, so it is
> ignored rather than enforced: both fall back to the built-in 3 and 30, and the
> board keeps registering people. Fix the pair on the settings screen.

## What the CLI cannot do

> [!NOTE]
> `forum upgrade` installed from npm applies **core** migrations and records the
> core version. It cannot apply plugin migrations.

`forum.config.ts` lives in your project, and an operator CLI installed as a
dependency has no path to it. Run the board's own upgrade entry point for
plugins.

This is a real limitation rather than an oversight, and it is written down here
because discovering it during an upgrade is the wrong moment.
