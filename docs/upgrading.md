# Upgrading a board

Taking a board from one version to the next: what to do, in what order,
and how far you can jump — followed by the behaviour changes each upgrade
brings, so nothing changes under you unannounced.

## The short version

Deploy the new code, then run the upgrade:

```sh
community upgrade --dry-run   # read what it will do
community upgrade
```

On the documented deployments the *core* migrations are already applied by
then — the `migrate` container runs to completion before anything
serves — so `upgrade` is what carries plugin migrations and records the
version. The admin panel shows a notice until you run it.

`community` is the operator CLI;
[Running a board § The operator CLI](./operating.md#the-operator-cli) has
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
[backup and restore](./operating.md#backup-and-restore).

## What `community upgrade` does

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
applied plugin by plugin in the order `community.plugins.ts` lists them —
so list a plugin after the plugins it depends on.

**An interrupted upgrade is safe to re-run.** Each plugin migration is
applied *and recorded* in one transaction — the only arrangement that
survives a crash between the two. Applied-but-not-recorded would re-apply
on the next run; recorded-but-not-applied would be a column that never
exists. Because the two are atomic, "try the upgrade again" is always a
safe instruction: a re-run re-applies nothing it already did.

**The plugin list is your board's.** `community upgrade` reads
`community.plugins.ts`, compiled into the command when the image is
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
git checkout v2.9.1 && docker compose up -d --build && community upgrade
git checkout v3.6.0 && docker compose up -d --build && community upgrade
git checkout v4.2.0 && docker compose up -d --build && community upgrade
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

**Under [Coolify](./quickstart.md)**, the upgrade is the **Redeploy**
button, pressed after a release. The compose file pins the exact version
(`ghcr.io/meith-dev/meith:0.6.0`), and every release moves that pin on
the `release` branch — so a redeploy deploys whatever release the branch
holds, and nothing else ever changes the board: a restart, a crash or a
reboot re-creates the version already pinned, never something newer.
Enable the webhook and releases deploy themselves; leave it off and
upgrades wait for the button. Take the backup first either way.

The one ceremony you may skip is for a **patch**: the
[release policy](./release.md#the-version-policy) is that a patch never
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
migrations still go through `community upgrade`.

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
silent edit does not clear a notice already on the post. See
[the silent edit window](./operating.md#the-silent-edit-window).

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
now says so. See
[Running a board](./operating.md#how-short-a-search-may-be).

#### `search.enabled` actually switches search off

Another switch nobody read: the Search link was unconditional, `/search`
ran queries, and the API answered them. It is read now, in all three
places — the link goes, the search pages say search is off, and
`GET /api/v1/search` answers 403. The default is on. **A board that
stored `false` loses its search the moment it upgrades** — which is what
it asked for, though worth telling your members. The index is still
maintained while search is off, so switching back on needs no reindex.
See [switching search off](./operating.md#switching-search-off).

#### `registration.enabled` actually closes registration

Whatever the switch said, `/register` rendered its form and the action
created the account. It is read now: off takes the Register link away,
replaces the form with a notice, and answers a direct POST with 403. The
default is on, so an untouched board sees nothing change; **a board that
stored `false` gets the closure it asked for on upgrade** — and if it has
been quietly accepting registrations, its member list is worth a look.

Neither the installer nor `community user:create` consults it: an
operator at a terminal cannot be locked out of the board they are
installing. See [closing registration](./operating.md#closing-registration).

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
the board **and by `community user:create`** (a CLI that enforced
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
[the three login counters](./operating.md#the-three-login-counters).

### Permissions that were lying, and are not any more

#### "Restore posts" is a real moderator right

Restoring a post or thread was gated on *Delete posts*, so a moderator
ticked for restore alone could restore nothing, and one ticked for
delete quietly got the undo too. Restoring now needs *Restore posts*.

Nobody loses an undo they were using: a one-off migration granted
*Restore posts* to every existing appointment that held *Delete posts*.
**New appointments get exactly what is ticked** — tick both boxes if you
mean both. See
[what an appointment grants](./operating.md#what-an-appointment-grants).

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
[letting members delete their own threads](./operating.md#letting-members-delete-their-own-threads)
first, because a thread is deleted whole and takes other people's
replies with it.

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
[the daily post allowance](./operating.md#the-daily-post-allowance).

#### `maxPrivateMessagesPerDay` is enforced

The same story on its own counter. `0` remains the default and remains
unlimited; check the number on any group where you set one. Do not
confuse it with `privateMessageQuota`, which has always worked and caps
what a member may *keep*, not what they may send in a day.

### Behaviour that changed shape

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
[the post anchor](./theme-api.md#the-post-anchor) is the shape.

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
See [visitor addresses and proxies](./operating.md#visitor-addresses-and-proxies).

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
off.

#### `community upgrade` now really applies plugin migrations

The command used to pass no plugins at all, so a board could be told by
the panel to run it and be no further on afterwards. It reads your
board's plugin list now. If you have been running a plugin whose
migrations the panel reported as pending, run `community upgrade` once
more — re-running is safe, since applying and recording a migration are
one transaction and a re-run of an applied one is a no-op.
