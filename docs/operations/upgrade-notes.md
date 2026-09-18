# Upgrade compatibility notes

Check these compatibility notes before upgrading an older board. The upgrade guide contains the procedure; this reference records changes to settings, permissions and stored behavior.

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

**The navigation menu starts smaller.** A new board shows Home, New posts
and Search; Unanswered, My posts, Who's online, Members and Staff are
still rows under **Admin → Content → Navigation**, hidden until somebody
ticks **Shown in the menu**. The migration that ships this hides those
five on an existing board too, but only where the row is untouched — its
label still empty and still at the top level — so a menu somebody has
renamed or reorganised keeps what it had. Tick the ones your board wants
back; it is one press each.

**`TRUSTED_PROXY_HOPS` now defaults to `0`, not `1`.** It was `1` because
that matched the one documented reverse proxy in front of `compose.yml`;
the trouble was any board that published the board's port directly, with
nothing in front, inherited a default that trusted a header any visitor
can set — forging the address the IP allowlist, the login lockout and the
audit log key off. `compose.yml` and the Coolify compose files now set
`TRUSTED_PROXY_HOPS=1` themselves, so a board deployed with one of them
sees no change. **A board that never set the variable elsewhere** — a
board on Vercel included, sitting behind that platform's own edge network
— now has `X-Forwarded-For` ignored outright: set `TRUSTED_PROXY_HOPS=1`
yourself to get it back. See
[Deploying by hand § Count your proxies](docker-compose.md).

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
[The organiser's guide § Registration](../administration/manage-members.md#registration).

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
[Spam controls and rate limits § The three login counters](../administration/antispam.md).

### Permissions that were lying, and are not any more

#### "Restore posts" is a real moderator right

Restoring a post or thread was gated on *Delete posts*, so a moderator
ticked for restore alone could restore nothing, and one ticked for
delete quietly got the undo too. Restoring now needs *Restore posts*.

Nobody loses an undo they were using: a one-off migration granted
*Restore posts* to every existing appointment that held *Delete posts*.
**New appointments get exactly what is ticked** — tick both boxes if you
mean both. See
[Forums and permissions § What an appointment grants](../administration/forums.md)
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
[letting members delete their own threads](../administration/forums.md)
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
[the daily post allowance](../administration/groups.md).

#### `maxPrivateMessagesPerDay` is enforced

The same story on its own counter. `0` remains the default and remains
unlimited; check the number on any group where you set one. Do not
confuse it with `privateMessageQuota`, which has always worked and caps
what a member may *keep*, not what they may send in a day.

### Behaviour that changed shape

#### `meith migrate` decides by hash, not by timestamp

A board that upgraded from 0.29.0–0.31.x to 0.32.0, 0.33.0 or 0.33.1
is missing four migrations, and `meith migrate` on those releases says
"already up to date" about it. The journal entries for `0059`–`0061`
carry timestamps later than the migrations after them, and the runner
took "newer than the newest one applied" as its test: it applied `0060`
and `0061`, then skipped `0062`–`0065` as already done. A board
installed fresh on any of those releases is not affected — an empty
database applies the journal from the top — and neither is one that
arrived from 0.28 or earlier.

**What it looks like.** The hourly `board.digest_send` task fails on
every tick with `column u.board_digest_cadence does not exist`; member
feed tokens, the auto-watch settings and report categories fail the same
way wherever a request reaches them. The admin notice on those releases
did not report it — it compared the version the board had recorded, not
the schema — so nothing said anything until a request hit the missing
column. From this release the notice asks the database which core
migrations are unrecorded and counts them, whatever the versions say,
and the panel's upgrade refuses to record a version while any are
missing.

**What to do.** Take the release that carries this note and run
`meith migrate` once — under Compose the `migrate` service does it on
the redeploy. The runner now applies every migration whose file hash is
not recorded in `drizzle.__drizzle_migrations`, in journal order, so it
finds the four and applies them; a board that was never affected finds
nothing to do. See [Migrations](database-operations.md#migrations) for the
mechanism.

#### Backup is a verb

The [backup and restore](backups.md) page used to
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
[when a release moves Postgres](upgrading.md) the next
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
[the post anchor](../extensions/theme-contract.md#the-post-anchor) is the shape.

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
[Deploying by hand § Count your proxies](docker-compose.md).

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
[the limits on pages nobody has signed in to](../administration/antispam.md).

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
[the theme API](../extensions/theme-contract.md#versioning).

#### Webhooks moved into the board

The `@meith/plugin-webhooks` plugin is gone; outbound webhooks are a core
feature now, with an admin screen at **Admin → Webhooks** and more topics
than the plugin carried. See [Webhooks](../integrations/webhooks.md). Nothing migrates
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
