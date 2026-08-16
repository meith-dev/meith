# Upgrading a board

Taking a board from one version to the next: what to do, in what order, and how
far you can jump.

## The short version

Deploy the new code, then run the upgrade:

```sh
community upgrade --dry-run   # read what it will do
community upgrade
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

## What `community upgrade` does

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

A board further behind is not stuck. Upgrade in stages — check out the last
release of each major in turn, deploy it, and run the upgrade before moving on:

```sh
git checkout v2.9.1 && docker compose up -d --build && community upgrade
git checkout v3.6.0 && docker compose up -d --build && community upgrade
git checkout v4.2.0 && docker compose up -d --build && community upgrade
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

Under [Coolify](./quickstart.md), the upgrade is the **Redeploy** button,
pressed after a release. The compose file pins the **exact version** —
`ghcr.io/meith-dev/meith:0.1.1` — and every release moves that pin on the
`release` branch, so a redeploy deploys whatever release the branch holds and
nothing else ever changes the board: a restart, a crash or a server reboot
re-creates the version already pinned, never something newer. Enable the
webhook and releases — never pushes to `main` — deploy themselves; leave it
off and upgrades wait for the button. Take the backup first either way. The
one ceremony you may skip is for a patch: a patch never carries a migration
([Releasing](./release.md) is that promise), which is what makes taking one
immediately always safe.

Under Compose it is three commands — check out the release, not `main`:

```sh
git fetch --tags
git checkout v0.1.1        # the release you are moving to
docker compose up -d --build
```

Either way the ordering is handled for you:

`migrate` runs to completion first and `web` and `worker` wait for it, so the
new code never serves against the old schema. Take a backup before you start —
migrations are forward-only, and recovery is by restore. Coolify's scheduled
backup covers Postgres; the uploads volume is a second thing, and yours.

That applies **core migrations only**. Plugin migrations run through
`community upgrade`, which carries your board's plugin list with it — see
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

## Configuration that moved out of the environment

Two things that were environment variables and nothing else are board settings
now. **Nothing changes for a board that had them set** — the environment still
wins, outright, and the screen says so rather than accepting an edit it would
ignore. What changes is the board that never set them, which previously could
not fix either without a redeploy.

| | Was | Is |
|---|---|---|
| **Mail** | `MAIL_DRIVER` and friends, read at boot | `MAIL_DRIVER=http` or `=smtp` still wins. `log`, or unset, now hands the decision to `/admin/settings?group=mail` — which has a **Send a test message** button that reports the provider's own refusal verbatim. |
| **The board's address** | `APP_URL`, read at boot | `APP_URL` still wins. Unset, it comes from **Board address** on `/admin/settings?group=board`, and the installer asks for it on a fresh board. |

The upgrade needs no action either way. Worth doing once, though: open
`/admin/settings?group=mail` and press the test button. Mail is the subsystem
where a misconfiguration is silent by construction — the reset form still says
"check your inbox" — so "we believe mail works" and "a message arrived" are worth
reconciling on a board you have just moved.

### `MAIL_DRIVER=smtp` boots now

It used to refuse to start, on purpose: there was no SMTP driver, and quietly
downgrading to the log driver would have meant an operator watching password
resets vanish with no error. There is one now. `MAIL_SMTP_HOST` and `MAIL_FROM`
are required with it, and the username and password must be set together or not
at all — see [Mail](./operating.md#mail).

If you have been running a separate relay to bridge this gap, it can go.

### `TICK_DEADLINE_MS` and `TICK_MAX_JOBS` are gone

They were read by nothing. Both were declared, documented in three places, and
consulted by no code — a task's wall-clock budget comes from its own definition,
and the worker bounds a tick with a constant of its own. Tuning them changed
nothing, and there was no way to discover that.

**Leaving them in your `.env` is harmless** — unknown variables are ignored, not
rejected, so nothing fails on the next boot. Delete them when convenient; the
only cost of keeping them is the next person believing they do something.

## Settings that gained a reader

A setting can also change behaviour by starting to be *read*. That is not a
default moving, and there is nothing to run — but it is worth knowing which
switches on your board were, until now, decorative.

### `posting.edit_grace_seconds` now suppresses the edit notice

**Silent edit window** had no reader either. `PostEditor.edit` stamped
`edited_at` on every edit that changed anything, `applyEdit` always wrote it,
and the notice rendered whenever it was set — so the board behaved permanently
as though the window were 0, whatever the box said.

It is read now, with the registry default of **300 seconds**, so an author
fixing their own post within five minutes of writing it leaves no *Last edited
by* line. **This is a visible change on a board that never touched the
setting**: notices that used to appear on quick typo fixes stop appearing.
`posting.edit_grace_seconds 0` restores the old behaviour exactly.

Nothing is hidden that should not be:

- A **moderator editing somebody else's post** is never silent, whatever the
  window says.
- The **revision history is unchanged** — every edit still records who, when,
  why and what the post said before. Only the reader-facing line is suppressed.
- A silent edit **does not clear a notice already on the post**, so an earlier
  moderator edit stays visible.

See [The silent edit window](./operating.md#the-silent-edit-window).

### `search.min_word_length` now reaches the query parser

**Minimum search term length** was never read. `parseSearchInput` carried a
hard-coded 2 and took no configuration, so the box moved and the board went on
refusing only single letters — a board that had asked for 5 got 2, and a board
that had asked for 1 also got 2.

The value is threaded in now, as an argument — `@meith/search` reads no
settings of its own.

**Its default moved from 3 to 2 in the same release, so nothing changes under
you.** The parser has always enforced 2, and 2 is what every board has actually
had; leaving the default at 3 would have made two-letter searches like `ok` or
`C++` start being refused on every board at once, on the day the setting gained
a reader. A board that had stored a number gets that number now, which is the
change it asked for. The same reasoning moved `registration.method` to `none`
above.

**The description changed rather than the code**, because the old one described
something the board has never done. It said short terms were "dropped from the
query"; what actually happens is that a search is refused when *every* word in
it is shorter than the limit, and short words in a search that also has a long
one are passed to the index rather than removed. Dropping words silently is the
worse of the two behaviours — it answers a question nobody asked, and it has no
sensible answer when every word is short — so the sentence on the screen was
made true instead. The label says **Shortest word a search may rest on** now,
which is what the rule is.

See [How short a search may be](./operating.md#how-short-a-search-may-be).

### `search.enabled` now actually switches search off

**Enable search** was another switch nobody read. The Search link was
unconditional, `/search` ran queries, and `GET /api/v1/search` answered them —
so a board that had turned search off to take load off its database was still
carrying every search it had been trying to refuse.

It is read now, in all three places: the link goes, the two search pages say so
instead of rendering, and the REST route answers `403`. The default is on. A
board that stored `false` loses its search the moment it upgrades — which is
what it asked for, though it is worth telling your members rather than letting
them find the link missing.

Nothing is thrown away: the index is still maintained while search is off, so
switching it back on needs no reindex.

See [Switching search off](./operating.md#switching-search-off).

### `registration.enabled` now actually closes registration

**Allow new registrations** stored its value and nothing read it. Whatever the
switch said, `/register` rendered its form, the action behind it created the
account, and the **Register** link sat in the user panel — so a board that
believed it had closed the door was taking members the whole time.

It is read now. Off takes the link away, replaces the form with a line saying
the board is not taking new members, and refuses a submission POSTed straight at
the action with a `403`. The default is on, so a board that never touched the
switch sees nothing change; a board that stored `false` gets the closure it
asked for the moment it upgrades — and if that board has been quietly accepting
registrations, its member list is worth a look.

Neither the installer nor `community user:create` consults it, for the same
reason the activation method does not stop them: an operator at a terminal
cannot be locked out of the board they are installing. A closed board still
gains members from the command line.

See [Closing registration](./operating.md#closing-registration).

### `registration.method` now decides what a new account has to do

`registration.method` had been a setting with no reader: the dropdown
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
boards that very often had no mail configured at all, which would have left them
unable to register anybody. The default follows the behaviour every board
actually had.

**If you did want confirmed addresses, you now have to say so** — and this time
saying so works. Configure mail first at `/admin/settings?group=mail`, prove it
with the **Send a test message** button, then set the method in
**Admin → Settings → Registration** ([Mail](./operating.md#mail)). The last two
rows of the table are the boards that get a real behaviour change: they asked for
vetting, and now they get it.

> [!IMPORTANT]
> `email` or `both` on a board with no working mail is a board nobody can join:
> the links are minted, written to the log, and never sent. The registration
> settings screen and `/admin/system` both say so for as long as it is true, so
> this is not a thing you find out from your members.
>
> "No working mail" is the state to check, not a particular variable. Mail is
> configured on the board now and only *optionally* from the environment, so
> `MAIL_DRIVER` being unset no longer tells you anything on its own — the mail
> settings screen states what the board resolved and where it came from.

Accounts stuck at *awaiting activation* can be activated by hand from their
member screen under **Admin → Members**, and anybody who never received a link
can ask for another at `/verify/resend`.

The CLI and the installer are deliberately unaffected: `community user:create` and
the founding administrator are still created active, because an operator at a
terminal cannot follow a link in somebody else's mailbox, and an unactivatable
first administrator is a board with no way in.

### The password and username rules now come from the settings screen

`registration.min_password_length`, `registration.username_min` and
`registration.username_max` were registered settings with no reader either —
every one of them served from a constant, so the fields moved and the
registration form went on enforcing 8, 3 and 30.

They are read now, by the board **and by `community user:create`**, which matters
more than it sounds: a CLI that enforced different rules is a way to create
accounts the board itself would have rejected.

The registry defaults are 10, 3 and 30. A board that never touched them gets a
**minimum password length of 10 rather than 8** — the one change here that can
surprise somebody, and it applies to new passwords only. Existing passwords are
untouched and no one is locked out; they rehash on next login regardless.

> [!NOTE]
> A minimum username length above the maximum is impossible to satisfy, so it is
> ignored rather than enforced: both fall back to the built-in 3 and 30, and the
> board keeps registering people. Fix the pair on the settings screen.

## Links into a post changed shape

A post used to be anchored by its id — `#post-90`, under a corner that read
`#6`. It is anchored by that number now, `#post-6`, and nothing links a post by
id in a fragment any more. Everything the board writes links `?post=90`
instead, and the thread page answers that by finding the post and redirecting
to the page holding it, anchored at its number.

**The board rebuilds its own links, so there is nothing to run.** The gain is
that they now land: a fragment never reaches the server, so the old
`#post-90` could only work when that post happened to be on the page that
loaded, and a link to the four-hundredth post of a thread arrived at the top of
page one. This one arrives at the post.

What changes without asking is a link *already out in the world* — pasted into
a chat, another forum, or a post on your own board before the upgrade. An old
`#post-90` now names the ninetieth post of that thread if it has one, and
otherwise lands at the top. Either way the reader is on the right thread.

**A theme you maintain anchors posts by number.** The board resolves the hrefs
and the theme owns what they land on; a `PostBit` that anchors by `post.id`
leaves every one of these links at the top of the page. [Theme API § The post
anchor](./theme-api.md#the-post-anchor) is the shape.

Quotes written before the upgrade are unaffected: their attribution is text in
the post, so it keeps rendering, without the member link and the link back that
new quotes carry. A quote written against the build that had two anchors carries
`#pid-90` in its text — that link now lands at the top of its thread rather than
at the post, and quoting the post again writes the current form.

## A category is a page now

A category — the heading a group of forums sits under — used to be a 404 if you
asked for it directly, which the breadcrumb on every thread and forum page
happily invited you to do. `/{id}-{slug}` on a category is a section page: its
forums, listed the way the index lists them, under the trail that got you there.

Nothing to run, and nothing to configure. A board with no categories is
unaffected.

## A category can be opened to threads

**Allow new threads** on a category now means what it says: the category takes
threads of its own, and its page lists them under its forums. It is off on every
category, and the migration that ships with this version is what makes that
true — `allow_threads` defaulted to on for rows that could not use it, so every
existing category is set to off as the migration runs. **A board that wants
nothing to change does nothing.**

Turn it on from **Admin → Forums → Options** on the category. Turning it off
again stops new threads and returns the page to its forums; threads already
posted there keep their addresses and stay in search, but the category stops
listing them until it is turned back on.

An import behaves the same way: a category coming from MyBB arrives closed to
threads, which is what it was there.

## Times are shown in the reader's own zone

The board formats every timestamp in the zone the reader is actually in,
detected from the browser and remembered in a `meith_tz` cookie. Guests get it
too; a reader with JavaScript off still gets UTC, and the footer says so.

The migration that ships with this version **moves every member whose timezone
is `UTC` onto the new `auto` setting**, and makes `auto` the default for
accounts created afterwards. Until now the column defaulted to `UTC`, so a
member who had never opened the options screen was indistinguishable from one
who had chosen UTC on purpose — leaving them all alone would have meant the
change reached nobody who already had an account. Members who had picked any
other zone keep it, unchanged and still authoritative on every device.

**A member who genuinely wants UTC picks it once**, under Your control panel →
Options, and it is kept from then on. There is nothing to run and nothing to
configure: `community upgrade` carries it.

## Two notice parameters were renamed

Deleting a post returned to `/thread/12-slug?post=deleted`, and restoring one
that was already visible to `?post=unchanged`. `?post=` now means "take me to
this post", so those two moved out of its way: they are `?removed=post` and
`?unchanged=post`. They are notices on a redirect the board issues itself —
nothing stores them, and there is nothing to update.

## Count your proxies, if there is more than one

The board used to take the **left-most** `X-Forwarded-For` entry as the
visitor's address. That entry is whatever the caller put there, so a board
reachable by anything but its own proxy could be told any address at all —
which is the address `ADMIN_IP_ALLOWLIST`, the login lockout and the moderator
log all key off.

It now counts back from the right-hand end of the chain instead, and
`TRUSTED_PROXY_HOPS` says how far. **A board behind one reverse proxy — the
shape [self-hosting](./self-hosting.md#5-put-a-proxy-in-front) describes and the
Docker Compose stack ships — needs nothing:** the default of `1` resolves the
same address it always did.

Set it if your board is behind **more than one** hop. A CDN in front of your
proxy is `TRUSTED_PROXY_HOPS=2`; leave it at `1` and every visitor resolves to
the CDN, which is visible immediately as an allowlist that admits nobody and a
moderator log full of one address.
[Who the board thinks you are](./operating.md#who-the-board-thinks-you-are) has
the table.

## Three anti-spam limits arrive switched on

Everything else on the anti-spam screen ships off. These three do not, because
each bounds something a board cannot want unbounded and none of them is
reachable by a member doing anything ordinary:

| Setting | Default | Bounds |
|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour per /24 | Registrations from one address |
| `antispam.reset_per_hour` | 5/hour per address | Reset mails sent to one e-mail address |
| `antispam.reset_ip_per_hour` | 20/hour per /24 | Reset requests from one caller |
| `antispam.login_ip_attempts` | 100 per lockout window | Failed logins from one address, whatever accounts they name |

The one to look at is the first, and only if your members share an address —
a school, an office, a conference. Ten new accounts an hour from a single /24
is generous for a board and low for a lecture hall. It is on
`/admin/settings?group=antispam` with the rest, and `0` switches any of them
off.

## The security settings screen does something now

`Admin → Settings → Security` has carried three switches — the session idle
timeout, the failed-login count, and the lockout duration — that **nothing
read**. Changing them did nothing at all; the lockout ran on constants
compiled into the board, and the screen gave no sign of it.

They are wired now, which means a board that changed one of them at some point
is about to get the behaviour it asked for. Worth a look before you deploy if
you ever touched that screen.

Two things moved as part of it:

- **The session idle timeout now says 14 days, not 30.** 14 is what the board
  has actually been doing, so nothing changes; the setting was simply printing
  a number nobody honoured. A board that wants 30 can now set it and get it.
- **`security.max_account_login_attempts` is new**, defaulting to the 50 the
  code has always used, so no behaviour moves. It is the account-wide lockout
  backstop, which had no control on the screen even though its two neighbours
  did — see [the three login counters](./operating.md#the-three-login-counters-and-where-each-lives).

While that screen was lying, so was the demo board's lockout relief: it sets a
laxer lockout so one visitor's typo cannot lock the published login for the
next, and half of that was inert for the same reason. It works now.

## Four moderator checkboxes were lying, and are not any more

`/admin/forums/[id]` offered twelve per-forum moderator rights. Four of them
granted nothing at all, on a screen whose entire job is saying who may do what.

**"Restore posts" is a real right now.** Nothing read it: restoring a post or a
thread was gated on *Delete posts*, so a moderator ticked for restore alone
could restore nothing while the ModCP told them they held the right — and one
ticked for delete quietly got the undo too. Restoring now needs *Restore posts*,
and the ModCP's "My forums" says so.

Nobody loses an undo they were already using: a migration grants *Restore posts*
to every existing appointment that holds *Delete posts*. It runs once, and only
adds. **New appointments do not get that pairing** — tick both boxes if you mean
both, and see [what an appointment
grants](./operating.md#what-an-appointment-grants).

A group given `canSoftDeletePosts` in the forum matrix keeps both halves, since
that cell has always been documented as the reversible one.

**"Delete permanently", "Manage polls" and "See posters' addresses" are gone
from the screen**, and their columns are dropped from `forum_moderators`. There
is no hard-delete path, no per-forum poll management, and the ModCP's IP lookup
is administrators and super-moderators only — so each was a promise the board
had no way to keep, and shipping three new features to justify three checkboxes
is not the honest fix. Whatever was ticked in them was already inert; nothing a
board could observe changes when they go.

## What the CLI applies

`community upgrade` applies **core migrations, then each installed plugin's, then
records the version** — the three steps it prints. It reads the plugin list from
your board's `community.plugins.ts`, which is compiled into the command when the
image is built, so there is no separate entry point to remember and nothing to
point it at.

> [!NOTE]
> This was not true before, and three places said it was. The command passed no
> plugins at all, so a board could be told by the panel to run it and be no
> further on afterwards. If you have been running a plugin whose migrations the
> panel reported as pending, run `community upgrade` once more — it is safe to
> repeat, since applying a migration and recording it happen in one transaction
> and a re-run of an applied one is a no-op.

A plugin listed with `enabled: false` is skipped: creating tables for code that
will not run leaves your schema ahead of your board, which is the state the
panel's refusal to offer a migrate button exists to prevent.

This is a real limitation rather than an oversight, and it is written down here
because discovering it during an upgrade is the wrong moment.
