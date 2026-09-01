# Upgrading a board

Taking a board from one version to the next: what to do, in what order,
and how far you can jump — followed by the behaviour changes each upgrade
brings, so nothing changes under you unannounced.

## The short version

Deploy the new code, then run the upgrade:

```sh
meith upgrade --dry-run   # read what it will do
meith upgrade
```

On the documented deployments the *core* migrations are already applied by
then — the `migrate` container runs to completion before anything
serves — so `upgrade` is what carries plugin migrations and records the
version. The admin panel shows a notice until you run it.

`meith` is the operator CLI;
[Operations § The operator CLI](./operating.md#the-operator-cli) has
the invocation for each deployment.

## Take a backup first

> [!CAUTION]
> Migrations are forward-only. Restoring a backup is the *only* way back,
> which makes the backup your rollback plan rather than a precaution.

There is no down migration and there will not be one: a down migration
that drops a column is a data-loss button on a live board, and some
migrations — a destructive backfill, a column collapsed into another —
cannot be reversed at all. A "roll back" that worked for some and
silently did nothing for others would be worse than its absence.

Take a backup before every upgrade, and make sure it is one you have
actually restored at least once. See
[backup and restore](./operating.md#backup).

## What `meith upgrade` does

Four things, in this order:

1. **Core migrations.** Everything else assumes the schema they create.
2. **Plugin migrations**, per plugin.
3. **Plugin versions recorded**, one per plugin.
4. **The core version recorded**, last.

The version is written last on purpose: a version written before the work
would mean a failed upgrade leaves a board claiming to be something it is
not — and the next run would find nothing to do. Same reasoning as the
installer's seal.

**Plugin dependencies are declared, not guessed.** A plugin names what it
needs:

```ts
export const badges = definePlugin({
  key: "badges",
  version: "1.2.0",
  dependsOn: ["points"],
  // …
})
```

The planner refuses a dependency cycle (naming the tangled keys) and a
dependency on a plugin that is not installed (by name), rather than
quietly running against a table that does not exist. Migrations are then
applied plugin by plugin in the order `meith.plugins.ts` lists them —
so list a plugin after the plugins it depends on.

**An interrupted upgrade is safe to re-run.** Each plugin migration is
applied *and recorded* in one transaction — the only arrangement that
survives a crash between the two. Applied-but-not-recorded would re-apply
on the next run; recorded-but-not-applied would be a column that never
exists. Because the two are atomic, "try the upgrade again" is always a
safe instruction: a re-run re-applies nothing it already did.

**The plugin list is your board's.** `meith upgrade` reads
`meith.plugins.ts`, compiled into the command when the image is
built. A plugin listed with `enabled: false` is skipped — creating tables
for code that will not run would leave your schema ahead of your board.

## How far you can jump

**Two majors.** A board at 1.x can upgrade directly to 3.x; 1.x to 4.x is
refused.

The limit is honesty rather than caution: supporting an arbitrary jump
would mean every migration staying correct against every schema that ever
existed — a promise nobody can test, and therefore one that should not be
made. Two majors is what the migration set is exercised against, so two
majors is what is claimed.

A board further behind is not stuck — upgrade in stages, checking out the
last release of each major in turn:

```sh
git checkout v2.9.1 && docker compose up -d --build && meith upgrade
git checkout v3.6.0 && docker compose up -d --build && meith upgrade
git checkout v4.2.0 && docker compose up -d --build && meith upgrade
```

Each stage is an ordinary upgrade with an ordinary backup in front of it.

## Downgrades

Refused. Migrations are forward-only, so "downgrading" would mean running
old code against a schema that has been migrated past it — which usually
appears to work and corrupts something a week later.

| Situation | Do this |
|---|---|
| You deployed a version you did not mean to | Deploy the newer one again |
| The newer one is broken | Restore the backup |

## Upgrading each deployment route

**Under [Coolify](../../getting-started/deployment/coolify.md)**, the upgrade is the **Redeploy**
button, pressed after a release. The compose file pins the exact version
(`ghcr.io/meith-dev/meith:0.6.0`), and every release moves that pin on
the `release` branch — so a redeploy deploys whatever release the branch
holds, exactly.

Know what else presses that button. Coolify re-reads the compose file
from the branch head on every deploy of the resource, and on a compose
resource the panel's **Restart** button is a deploy — it re-runs the
deployment rather than restarting the containers. If a release has
landed since you last deployed, Restart upgrades you to it, migrations
and all. Only restarts below the panel — a crash, a host reboot — are
guaranteed to re-create the version already running.

That is why the [Quickstart](../../getting-started/deployment/coolify.md#3-set-your-domain-and-deploy)
has you pin the version on the resource: `MEITH_IMAGE` in the resource's
environment, set to the exact image, wins over whatever the branch
holds, so Restart and Redeploy re-create that version and nothing else.
The upgrade is then three deliberate acts: take the backup, move
`MEITH_IMAGE` to the new version, press Redeploy.

Without the pin, enable the webhook and releases deploy themselves;
leave it off and upgrades wait for a button — either button. Take the
backup first in any case.

The one ceremony you may skip is for a **patch**: the
[release policy](../../contributing/release.md#the-version-policy) is that a patch never
carries a migration, which is what makes taking one immediately always
safe.

**Under Compose** it is three commands — check out the release, never
`main`:

```sh
git fetch --tags
git checkout v0.6.0        # the release you are moving to
docker compose up -d --build
```

Either way the ordering is handled for you: `migrate` runs to completion
first, and `web` and `worker` wait for it, so the new code never serves
against the old schema. That covers **core migrations only** — plugin
migrations still go through `meith upgrade`.

**A board scaffolded by `create-meith`** — one with its own `package.json`
depending on `@meith/web`, whether it deploys as a container or to Vercel —
upgrades through the updater, because more than the manifest can move
between releases:

```sh
npx create-meith@latest update
```

Run in the board's own directory, it does three things: moves every
`@meith/*` pin and `next` together in `package.json`, rewrites the deploy
files the scaffold owns — the Dockerfiles, the compose files, the workflows,
the README — to the new release's shape, and refreshes `package-lock.json`
where one exists. To tell your edits from files the scaffold wrote, it reads
the tree your *current* version shipped, from the deploy template
repository's tag for that version
([Releasing § Deploy template repositories](../../contributing/release.md#deploy-template-repositories)):
a file that still matches it is the scaffold's to rewrite, and a file that
does not is yours and is left alone, by name, with the template repository
to compare against. When that tag cannot be reached — the board predates the
tags, or there is no network — only `package.json` moves, and every deploy
file that differs from the new release's shape is listed for review instead.

A board does not even have to run it: the scaffold ships
`.github/workflows/update.yml`, which runs the same updater once a week (and
whenever the Actions tab's **Run workflow** button is pressed) and opens a
pull request with the result — after a one-time
**Settings → Actions → General → Allow GitHub Actions to create and approve
pull requests** on the board's repository. The pull request links the
release notes; the backup before deploying and the `meith upgrade` after it
stay yours, exactly as on every other route.

Under the updater, the version move itself is still these two commands:

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
```

The second command matters as much as the first. Such a board pins `next`
itself — a Vercel deployment needs it in the manifest, because that is where
the platform reads the framework version it builds with
([Building where Vercel looks](../../contributing/development.md#building-where-vercel-looks)) —
and no release moves that pin for you. Bump only the `@meith/*` packages and
npm resolves the mismatch by installing *two* copies of Next: the board's
pinned one at the root, and the one `@meith/web` now depends on nested under
it. `forum-web` runs whichever Next `@meith/web` resolves, while everything
reading `package.json` — Vercel's builder included — sees the other. Reading
the version straight out of the freshly installed `@meith/web` is what keeps
the two the same without anybody having to know the number.

Inside this repository the same coherence is a check rather than a
convention: `scripts/workspace-check.mjs` refuses a tree where any manifest,
or `create-meith`'s own scaffold, pins a different `next` from `@meith/web`.
It cannot reach a board outside the repository, which is why that board's
README carries the second command too.

## When a release moves Postgres

The compose files pin the database image, and a release can move that pin
across a Postgres major version — as the move from `postgres:16-alpine`
to `postgres:18-alpine` did. A Postgres major is not an ordinary
redeploy: the data directory's on-disk format belongs to the major that
wrote it, and the 18 image also keeps its cluster at a different path
inside the volume than 16 did — so bringing the new image up on the old
volume gets you a board that is *empty* rather than broken, which is
worse, because it looks like data loss and is merely data ignored.

The way across is the backup, which is the point of this page's first
section. On Compose, from the checkout of the **new** release:

```sh
mkdir -p backups
docker compose build web
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups":/backup web \
  node apps/cli/cli.cjs backup --out /backup/pre-18.tar.gz
docker compose down
docker volume rm docker_pgdata
docker compose up -d postgres
RESTORE_DATABASE_URL="postgres://community:$POSTGRES_PASSWORD@postgres:5432/community" \
  docker compose run --rm --no-deps -e RESTORE_DATABASE_URL -v "$PWD/backups":/backup web \
  node apps/cli/cli.cjs restore /backup/pre-18.tar.gz --skip-uploads
docker compose up -d --build
```

The `mkdir` and the `--user` are what let the container write the bundle
onto your host at all — the image runs as uid 1001, which owns nothing
there; [Backup](./operating.md#backup) explains it in full. Get them
wrong and the run refuses immediately, before it dumps anything, naming
the directory that needs write access — so you find out here rather than
two lines further down, where this runbook destroys the volume.

The new image's `pg_dump` reads the old server fine — clients dump any
older server, which is why the backup comes from the *new* build against
the *still-running* old database. `docker volume ls` names the real
`pgdata` volume; `--skip-uploads` because the uploads volume never went
anywhere and a restore refuses to write into a directory that is not
empty. The restore reads the same mount and needs no `--user`, since
files in the image are world-readable. Keep the bundle until the board
has served for a while — it is also the rollback.

Under Coolify the same sequence runs from the resource's terminal, with
the volume deleted in the panel between the backup and the restore.

## When the deploy and the migration are separate events

Deploy some other way and the two come apart: the board runs the new code
as soon as the deployment is live, and the schema does not change until
you run the command. Between them, new logic is talking to an old schema.

That window is why the admin notice exists: it names both versions and
the number of migrations waiting, so the failure mode — "column does not
exist" in whichever request touches it first — becomes a sentence
somebody read before it happened.

For a board with real traffic:

| Migration kind | When to run it |
|---|---|
| Adds things only | Before or after the deploy; either is safe |
| Removes or renames | Two-step: ship code that tolerates both shapes, migrate, then ship code that assumes the new one |

Release notes say which kind each release is.

## When the build runs the migration

On a platform that only builds and serves, there is nowhere to run a
one-shot migration job, so the migration goes in the build command,
ahead of the build:

```sh
meith migrate && forum-web build
```

The `&&` is the whole mechanism. A migration that fails exits non-zero,
the build never starts, and the deployment fails carrying the
migration's own error rather than shipping new code onto an old schema.
There is deliberately no `forum-web build --migrate`: keeping them two
commands is what makes a failed deploy attributable to the step that
actually failed.

This does not remove the window the previous section describes — it
turns it around. The migration runs during the build, while the previous
deployment is still serving, so between the migration and the cutover it
is the **old** code talking to the **new** schema. For a release that
only adds things, that is safe.

For one that removes or renames, the two-step rule still holds, but the
freedom to order its steps does not survive the move. The previous
section could sequence them however it liked because the migration was a
separate operator action, run at a moment of your choosing; welding the
migration to a build spends exactly that degree of freedom. What is left
is a single invariant:

> A release's migration must be tolerated by the release *before* it,
> because that is the code serving while this release's build migrates.

So the destructive migration cannot travel in the same release as the
tolerant code. That release's build would run the migration while the
**pre**-tolerant release is still live — which is precisely the breakage
the two-step exists to prevent. The two steps have to be two deploys:

1. **Release A** ships code that tolerates both the old and the new
   shape, and carries no destructive migration. Its build migrates
   nothing that matters, and it goes live.
2. **Release B** carries the destructive migration *and* the code that
   assumes the new shape. B's build is safe only because A is already
   live and serving — A's tolerant code is what meets the new schema
   during B's build.

Shipping A and B as one release is the mistake this rule is for.

The `&&` guards one direction only. It stops new code reaching an old
schema; it does nothing about the reverse. If `meith migrate`
succeeds and `forum-web build` then fails, the deployment aborts with the
migration already applied and the previous release still serving, and it
stays that way until some later build succeeds. The window this section
opened with stops being a window and becomes the board's steady state.

The instinct at that point is to roll back, and rolling back does
nothing: the old code is already what is serving, and no rollback undoes
a migration. Fix the build and deploy forward. Until it lands the board
is running the previous release against the new schema — the tolerated
case for a release that only adds things, and the broken one for a
migration that has just dropped something the live code still reads.

Overlapping builds are safe. Two deploys triggered close together queue
on an advisory lock, and the second finds nothing left to do — see
[Migrations](./operating.md#two-migrations-at-once).

A rollback is not one of them. The instant rollback these platforms offer
— promoting a previous deployment, re-pointing an alias at an artefact
that was built already — runs no build, so it never calls `meith
migrate`. There is nothing to queue on the lock and nothing that could
undo the schema. Rolling back the other way, by redeploying an older
commit, does build and does run `meith migrate`, which then applies
nothing, because migrations are forward-only.

Either route puts the old code back and leaves the schema where it is, so
a rollback is only safe while the older code tolerates the newer schema.
[Downgrades](#downgrades) still applies.

Nothing here widens [how far you can jump](#how-far-you-can-jump). A
build-time migration is the same migration set under the same two-major
limit, and a board further behind still upgrades in stages.

### Every build migrates, previews included

The build command is the build command. It runs for every deployment the
platform builds — the pull-request preview, the branch deployment, the
redeploy of an old commit — and each of those runs `meith migrate`
against whatever database that deployment's own environment variables
name.

This is where the pattern cuts. These platforms commonly default a new
variable to *every* environment, which points preview and branch builds
at the production database; the first preview build of an unmerged branch
then migrates production, from a schema nobody has reviewed, with no
deploy of that branch ever having happened. Nothing in the build command
can detect this, because from the migration's point of view it is an
ordinary run against an ordinary `DATABASE_URL`.

Scope `DATABASE_URL` and `DIRECT_DATABASE_URL` to production, and give
preview and branch environments a database of their own — a separate
instance, or a branch of the managed one where the provider offers that.
Check the scoping before the first preview build rather than after: by
the time it is visible the migration has applied, and a migration does
not come back off.

### The connection previews and production both need

Such a platform's database is usually a managed one, which means
`DATABASE_URL` is a transaction-mode pooler string that cannot hold the
lock. Set `DIRECT_DATABASE_URL` to the direct string as well, in every
environment that builds — see
[connection pooling](./operating.md#connection-pooling).

---

## What recent releases changed

The rest of this page is the operator-facing change log for the 0.x
series: defaults that moved, settings that started being enforced, and
behaviour that changed shape. Skim the headings; each entry says whether
a board that never touched the setting is affected.

### Defaults that changed

A board setting is stored only once somebody changes it, so a default
that moves applies to every board that never touched the switch. There is
nothing to run; the point of listing it is that behaviour changed without
anybody on your board doing anything.

| Setting | Was | Is | On a board that never set it |
|---|---|---|---|
| `reputation.comment_required` | on | off | Posts gain a one-press **Thanks** button; a rating no longer has to carry a reason. Set it back under **Settings → Reputation** if your board wants every rating to say why — the right choice for a board that allows negative ratings. |

### Configuration that moved out of the environment

Two things that were environment variables and nothing else are board
settings now. **Nothing changes for a board that had them set** — the
environment still wins outright, and the settings screen says so. What
changes is the board that never set them, which previously could not fix
either without a redeploy:

| | Was | Is |
|---|---|---|
| **Mail** | `MAIL_DRIVER` and friends, read at boot | `MAIL_DRIVER=http` or `=smtp` still wins. `log`, or unset, hands the decision to `/admin/settings?group=mail` — which has a **Send a test message** button that shows the provider's own refusal verbatim. |
| **The board's address** | `APP_URL`, read at boot | `APP_URL` still wins. Unset, it comes from **Board address** on `/admin/settings?group=board`, and the installer asks for it on a fresh board. |

Worth doing once after the upgrade: open `/admin/settings?group=mail` and
press the test button. Mail is the subsystem where a misconfiguration is
silent by construction, so "we believe mail works" and "a message
arrived" are worth reconciling.

**`MAIL_DRIVER=smtp` boots now.** It used to refuse to start, on purpose:
there was no SMTP driver, and quietly downgrading to the log driver would
have meant password resets vanishing with no error. There is a driver
now; `MAIL_SMTP_HOST` and `MAIL_FROM` are required with it. If you have
been running a separate relay to bridge the gap, it can go.

**`TICK_DEADLINE_MS` and `TICK_MAX_JOBS` are gone.** They were read by
nothing — declared, documented, and consulted by no code. Leaving them in
your `.env` is harmless (unknown variables are ignored); delete them when
convenient.

### Settings that gained a reader

A setting can also change behaviour by starting to be *read*. Nothing to
run — but worth knowing which switches on your board were, until now,
decorative.

#### The silent edit window works

`posting.edit_grace_seconds` had no reader: the *Last edited by* line
rendered on every edit whatever the box said. It is read now, with a
default of **300 seconds**, so an author fixing their own post within
five minutes leaves no notice. **This is a visible change on a board that
never touched the setting** — notices that used to appear on quick typo
fixes stop appearing. `posting.edit_grace_seconds 0` restores the old
behaviour exactly.

Nothing is hidden that should not be: a moderator editing somebody
else's post is never silent, the revision history is unchanged, and a
silent edit does not clear a notice already on the post.

#### The minimum search word length works

`search.min_word_length` never reached the query parser, which carried a
hard-coded 2 — a board that asked for 5 got 2, and a board that asked for
1 also got 2. It is read now, **and its default moved from 3 to 2 in the
same release**, so nothing changes on a board that never set it: 2 is
what every board has actually been enforcing. A board that stored a
number now gets that number, which is the change it asked for.

The rule is *at least one word*, not *every word*: a search is refused
only when every word in it is shorter than the setting, and short words
in a search that also has a long one are passed to the index. The label
now says so.

#### `search.enabled` actually switches search off

Another switch nobody read: the Search link was unconditional, `/search`
ran queries, and the API answered them. It is read now, in all three
places — the link goes, the search pages say search is off, and
`GET /api/v1/search` answers 403. The default is on. **A board that
stored `false` loses its search the moment it upgrades** — which is what
it asked for, though worth telling your members. The index is still
maintained while search is off, so switching back on needs no reindex.

#### `registration.enabled` actually closes registration

Whatever the switch said, `/register` rendered its form and the action
created the account. It is read now: off takes the Register link away,
replaces the form with a notice, and answers a direct POST with 403. The
default is on, so an untouched board sees nothing change; **a board that
stored `false` gets the closure it asked for on upgrade** — and if it has
been quietly accepting registrations, its member list is worth a look.

Neither the installer nor `meith user:create` consults it: an
operator at a terminal cannot be locked out of the board they are
installing. See
[The organiser's guide § Registration](../community/organiser-guide.md#registration).

#### `registration.method` decides what a new account must do

The activation dropdown stored its value and every account was created as
though it said `none`. It is honoured everywhere now, **and its default
moved to `none` in the same release**, which is what keeps this from
changing anything under you:

| Your board stored | Before | Now |
|---|---|---|
| Nothing — never opened the screen, *or* chose `email` while it did nothing | Accounts active immediately | Unchanged |
| `none` | Accounts active immediately | Unchanged |
| `admin` | Active immediately, **contrary to the setting** | Accounts wait for an administrator |
| `both` | Active immediately, **contrary to the setting** | A confirmation link, then an administrator |

The first row needs explaining: a value equal to its default is not
stored, so an operator who selected `email` back when it did nothing has
no row and is indistinguishable from somebody who never opened the
screen. Defaulting to `email` would have switched confirmation on for
both — on boards that very often had no mail configured, leaving them
unable to register anybody. The default follows the behaviour every
board actually had.

**If you did want confirmed addresses, say so again — this time it
works.** Configure mail first, prove it with the test button, then set
the method under **Settings → Registration**.

> [!IMPORTANT]
> `email` or `both` on a board with no working mail is a board nobody can
> join: the links are minted, written to the log, and never sent. The
> registration settings screen and `/admin/system` both say so for as
> long as it is true.

Accounts stuck at *awaiting activation* can be activated by hand under
**Admin → Members**, and anybody who never received a link can ask for
another at `/verify/resend`.

#### The password and username rules come from the settings screen

`registration.min_password_length`, `registration.username_min` and
`registration.username_max` were served from constants — the form went on
enforcing 8, 3 and 30 whatever the settings said. They are read now, by
the board **and by `meith user:create`** (a CLI that enforced
different rules would create accounts the board itself would reject).

The registry defaults are 10, 3 and 30, so an untouched board gets a
**minimum password length of 10 rather than 8** — the one change here
that can surprise somebody. It applies to new passwords only; existing
passwords are untouched and nobody is locked out.

> [!NOTE]
> A minimum username length above the maximum is impossible to satisfy,
> so the pair is ignored rather than enforced — both fall back to 3 and
> 30 and the board keeps registering people. Fix the pair on the
> settings screen.

#### The security screen does something now

The session lifetime, the failed-login count and the lockout duration
were all stored and never read — the lockout ran on compiled-in
constants. They are wired now, so a board that changed one of them at
some point is about to get the behaviour it asked for. Worth a look
before you deploy if you ever touched that screen.

Two things moved as part of it: the session lifetime now says **14
days** (which is what the board was actually doing), and
`security.max_account_login_attempts` is new, defaulting to the 50 the
code always used. See
[Spam controls and rate limits § The three login counters](../community/antispam.md#the-three-login-counters).

### Permissions that were lying, and are not any more

#### "Restore posts" is a real moderator right

Restoring a post or thread was gated on *Delete posts*, so a moderator
ticked for restore alone could restore nothing, and one ticked for
delete quietly got the undo too. Restoring now needs *Restore posts*.

Nobody loses an undo they were using: a one-off migration granted
*Restore posts* to every existing appointment that held *Delete posts*.
**New appointments get exactly what is ticked** — tick both boxes if you
mean both. See
[Forums and permissions § What an appointment grants](../community/forums.md#what-an-appointment-grants)
for the nine grants an appointment carries.

#### Three dead moderator checkboxes are gone

*Delete permanently*, *Manage polls* and *See posters' addresses* granted
nothing — there is no hard-delete path, no per-forum poll management, and
the address lookup is staff-only — so the checkboxes are gone and their
columns dropped. Whatever was ticked in them was already inert; nothing
observable changes.

#### `canDeleteOwnThreads` is a real permission

It read "delete a whole thread you started" and nothing read it. Granted,
the thread's author now gets a **Delete thread** button that moves the
thread to `visibility=deleted` — reversible, exactly as a moderator's
delete is; restoring stays a moderator right. It is **off by default**
and nothing changes until you tick it — read
[letting members delete their own threads](../community/forums.md#letting-members-delete-their-own-threads)
first, because a thread is deleted whole and takes other people's replies
with it.

#### `canDeleteOthersPosts` is gone

It read "hard-delete anyone's post", and the board has never had a hard
delete: removing somebody else's post has always gone through
`canSoftDeletePosts`, which is reversible. The cell was a promise the
board had no way to keep, so migration 0042 drops the column from
`usergroups` and `forum_permissions`. Whatever was ticked was already
inert.

One knock-on: the column was one of the permissions that marked a group
as *carrying power* (barring it from "may be granted by plugins" and
forcing its members to display as staff). `canEditOthersPosts` and
`canSoftDeletePosts` still cover that ground, so a group with real
moderation power is still barred; a group whose *only* power was this
dead column stops being treated as powerful — which is now the truth
about it.

#### `maxPostsPerDay` is enforced

"Daily post cap. 0 = unlimited" was stored, resolved and displayed, and
no write path looked at it — a group set to five posts a day could post
five thousand. It is spent now, in the write path, against the same
database counters the hourly limits use: threads and replies together,
over a UTC day, on the REST API's endpoints as much as the forms.

**Check your groups before deploying this.** `0` still means unlimited
and is the default, so an untouched board is unaffected — but a board
that set a number, believing it was doing something, will start
enforcing a number nobody has looked at in a while. *Bypass flood check*
does not lift this cap; to exempt a group, set its value to `0`. See
[the daily post allowance](../community/groups.md#the-daily-post-allowance).

#### `maxPrivateMessagesPerDay` is enforced

The same story on its own counter. `0` remains the default and remains
unlimited; check the number on any group where you set one. Do not
confuse it with `privateMessageQuota`, which has always worked and caps
what a member may *keep*, not what they may send in a day.

### Behaviour that changed shape

#### Backup is a verb

The [backup and restore](./operating.md#backup) page used to
be commands you copied; it is now `meith backup` and
`meith restore` — one bundle carrying the database dump and the
uploads together, restored only into a new, empty database, with the
post-restore checks run for you. Nothing changes for a cron built on
`pg_dump`; the verb is the same dump with the uploads problem solved
beside it, and CI restores one on every change.

#### The stack's Postgres is 18

The compose files pin `postgres:18-alpine` where they pinned
`postgres:16-alpine`, and the board image carries the matching client
tools. A running board does **not** cross a Postgres major by
redeploying — the old data directory would be silently ignored, not
upgraded — so follow
[when a release moves Postgres](#when-a-release-moves-postgres) the next
time you take this release onto an existing board.

#### Links into a post

A post used to be anchored by its id (`#post-90`, under a corner reading
`#6`); it is anchored by its number now (`#post-6`), and everything the
board writes links `?post=90` instead — the thread page finds the post
and redirects to the page holding it, anchored at its number. The board
rebuilds its own links, so there is nothing to run; the gain is that a
link to the four-hundredth post of a thread now lands *at the post*
rather than at the top of page one.

What changes without asking is a link already out in the world: an old
`#post-90` now names the ninetieth post of that thread if it has one,
and otherwise lands at the top — either way on the right thread. A theme
you maintain must anchor posts by number:
[the post anchor](../../customization/themes.md#the-post-anchor) is the shape.

Two notice parameters moved out of `?post=`'s way at the same time:
deleting a post now returns to `?removed=post`, and restoring an
already-visible one to `?unchanged=post`. They are notices on a redirect
the board issues itself; nothing stores them.

#### A category is a page

A category used to 404 when opened directly — which the breadcrumb on
every thread invited you to do. `/{id}-{slug}` on a category is now a
section page: its forums, listed the way the index lists them. Nothing
to run or configure.

#### A category can be opened to threads

**Allow new threads** on a category now means what it says. It is off on
every category — the migration that ships with this makes that true for
existing rows — so **a board that wants nothing to change does
nothing**. Turn it on from the category's options; turning it off again
stops new threads and returns the page to its forums (threads already
posted keep their addresses and stay in search, but the category stops
listing them).

#### Times are shown in the reader's own zone

The board now formats every timestamp in the zone the reader is actually
in, detected from the browser and remembered in a cookie; a reader with
JavaScript off gets UTC, and the footer says so. The migration moves
every member whose stored timezone is `UTC` onto the new **Automatic**
setting — before this, "chose UTC" and "never chose" were the same value,
and leaving them all alone would have meant the change reached nobody
with an existing account. Members who picked any other zone keep it. A
member who genuinely wants UTC picks it once, under **UserCP → Options**.

#### The visitor address is counted from the right

The board used to take the **left-most** `X-Forwarded-For` entry — which
is whatever the caller put there. It now counts back from the right-hand
end, and `TRUSTED_PROXY_HOPS` says how far. **A board behind one reverse
proxy — the documented shape — needs nothing**: the default of `1`
resolves the same address it always did. Behind more than one hop (a CDN
in front of your proxy), set `TRUSTED_PROXY_HOPS=2` — leave it at `1`
and every visitor resolves to the CDN, visible immediately as an
allowlist that admits nobody and a moderator log full of one address.
See
[Deploying by hand § Count your proxies](../../getting-started/deployment/docker-compose.md#count-your-proxies).

#### Four anti-spam limits arrive switched on

Everything else on the anti-spam screen ships off; these arrived on,
because each bounds something a board cannot want unbounded and none is
reachable by a member doing anything ordinary:

| Setting | Default | Bounds |
|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour per /24 | Registrations from one address range |
| `antispam.reset_per_hour` | 5/hour per address | Reset mails sent to one e-mail address |
| `antispam.reset_ip_per_hour` | 20/hour per /24 | Reset requests from one caller |
| `antispam.login_ip_attempts` | 100 per lockout window | Failed logins from one address, whatever accounts they name |

The one to look at is the first, and only if your members share an
address — a school, an office, a conference. `0` switches any of them
off. See
[the limits on pages nobody has signed in to](../community/antispam.md#the-limits-on-pages-nobody-has-signed-in-to).

#### `meith upgrade` now really applies plugin migrations

The command used to pass no plugins at all, so a board could be told by
the panel to run it and be no further on afterwards. It reads your
board's plugin list now. If you have been running a plugin whose
migrations the panel reported as pending, run `meith upgrade` once
more — re-running is safe, since applying and recording a migration are
one transaction and a re-run of an applied one is a no-op.

#### The navigation menu is a list you edit

The row of links across the top of the board used to be six items
compiled into the app. They are rows in the database now, and the
migration seeds exactly those six with their existing addresses,
ordering and audiences — **an upgraded board's menu looks and behaves
the way it did**, including Search disappearing when search is off and
My posts staying away from signed-out visitors.

What is new is that you can change it, under **Admin → Content →
Navigation**: drag an item to reorder it, drag it to the right to hang it
under the item above as a sub-menu, rename it, hide it, delete it, or add
your own — to a chat server, a wiki, anything with an address. Items can
be limited to an audience or to particular groups, and one marked as
opening in a new tab does so in every theme that honours it. The screen
works with JavaScript off: every drag has an arrow button beside it.

A theme you maintain still compiles unchanged. `LinkModel` gained two
optional fields, `newTab` and `submenu`. A theme that ignores `submenu`
renders the top level and drops the entries under it, so a theme meant to
follow the board navigation should render one level of nested links,
revealed on both `:hover` and `:focus-within`. See
[the theme API](../../customization/themes.md#versioning).

#### Webhooks moved into the board

The `@meith/plugin-webhooks` plugin is gone; outbound webhooks are a core
feature now, with an admin screen at **Admin → Webhooks** and more topics
than the plugin carried. See [Webhooks](./webhooks.md). Nothing migrates
automatically — the plugin stored its configuration in plugin settings, not
in the board's tables — so recreate the plugin's single delivery as a
subscription. It is a five-minute job, once:

| The plugin's setting | Recreate it as |
|---|---|
| **Endpoint** (`WEBHOOKS_ENDPOINT_URL`) | The subscription's **Endpoint**. Still `https://` only. |
| **Payload format** (Discord / Plain JSON) | The subscription's **Payload format** — the same two choices, unchanged. |
| **What to send** (new threads, or threads and replies) | The **Topics** checkboxes: `thread.created`, and `post.created` for replies too. |
| **Signing secret** (`WEBHOOKS_SIGNING_SECRET`) | Generated for you and shown once when you add the subscription. Put the new secret into your receiver. |
| **Board address** (`WEBHOOKS_BOARD_URL`) | Not needed — deliveries use the board's own configured address. |

The signature is verified the same way, over the same
`HMAC-SHA256(secret, "<timestamp>.<body>")` material, but the delivery
headers are now `x-forum-event`, `x-forum-delivery`, `x-forum-timestamp`
and `x-forum-signature` (the plugin sent `x-meith-*`). Update your
receiver's header names when you move the secret across. After the
subscription is delivering, remove the plugin from your board's plugin list
and drop its `WEBHOOKS_*` environment variables.

One Discord difference to expect: the plugin posted a rich embed (a titled
card) for a new thread, while core posts a plain `content` link. The message
still links straight to the thread; it is not boxed in an embed.
