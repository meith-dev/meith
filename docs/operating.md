# Running a board

The operator handbook: everything from the day after you install to the day
something goes wrong. It assumes you have not read the source and are not
going to.

Installing for the first time? Start with the [Quickstart](./quickstart.md).

## Configuration

Settings live in three places, and where a setting lives tells you what
changing it costs:

| Where | What lives there | Changing it costs |
|---|---|---|
| Environment variables | Secrets, and anything needed before the board can read its own database | A redeploy |
| `community.config.ts` | What is *installed*: themes and plugins | An edit and a redeploy |
| `/admin/settings` | Everything else: board name, registration, posting limits, search, mail | Nothing — it takes effect immediately |

The split follows from how the board is built. Anything in
`community.config.ts` must be visible to the bundler, because a production
build contains only what the bundler could see — so "install a plugin"
cannot be a database row. Anything in `/admin/settings` is a value the
running board reads, so it can change without a deploy.

**Two things live in the overlap, on purpose:** mail and the board's own
address are ordinary settings *and* environment variables, and when both
are present **the environment wins outright** — the settings screen says so
rather than accepting an edit it would ignore. A board installed by one
person wants to configure mail from a screen without a redeploy; a
deployment configured from files wants its credentials in the environment
and the panel unable to change them. Both work, and the precedence rule is
one sentence.

The trade-off is worth knowing: a credential stored on the board sits in
the `settings` table, readable by anything with database access, while one
in the environment takes a redeploy to rotate. The registry marks stored
credentials as secrets, so they are never rendered back into a page or
written to the audit log — which is not the same as encrypted.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | For a real board | On a *managed* database, use the transaction-mode pooler string — see [connection pooling](#connection-pooling). |
| `AUTH_SECRET` | In production | Signs the unsubscribe links in outgoing mail, and seals members' two-factor secrets. Sessions do **not** depend on it — they are random tokens stored hashed — so rotating it signs nobody out, but it does strand every enrolled authenticator app (see [Signing in](./single-sign-on.md#board-settings)). No default, deliberately. |
| `TICK_SECRET` | In production | Guards `GET /api/system/tick`: with it set, a caller without it gets a 404. On the Docker Compose stack the `worker` container runs the tick in-process and never calls the route — but production still refuses to boot without the secret, so the route is never left open. Only an external caller — a cron, a platform scheduler, the `curl-tick` sidecar — actually presents it. |
| `APP_URL` | No | The board's public origin, absolute, no trailing slash. Unset, the address comes from **Board address** in the settings; set, it wins, and the settings screen says its stored value is not being read. Something must supply it — a digest sent from the worker has no request to be relative to. |
| `MAIL_DRIVER` | No | `log`, `http` or `smtp`. `http` or `smtp` here wins outright over the board's mail settings; `log` or unset leaves mail to the board. See [Mail](#mail). |
| `DATA_SOURCE` | No | `postgres` or `fixture`. Defaults to `fixture` when `DATABASE_URL` is unset. |
| `ADMIN_IP_ALLOWLIST` | No | Comma-separated addresses. An entry ending in `.` or `:` matches as a prefix (`203.0.113.` or `2001:db8:`); anything else must match exactly. Empty allows everything. |
| `TRUSTED_PROXY_HOPS` | No | How many proxies sit between the internet and the board. Defaults to `1`. Getting this wrong is a security problem, not a cosmetic one — see [visitor addresses and proxies](#visitor-addresses-and-proxies). |
| `REMOTE_IMAGES` | No | `0` (the default) confines images to this board and `data:` URLs; `1` lets a post embed an image from any `https:` host. See [remote images](#remote-images). |
| `FILESTORE_DRIVER` | No | `local` or `s3`. Defaults to `local`, which is right for a board with a disk. See [where uploads go](#where-uploads-go). |
| `DIRECT_DATABASE_URL` | No | A direct (non-pooler) connection string for migrations, when `DATABASE_URL` points at a transaction pooler. See [connection pooling](#connection-pooling). |
| `MIGRATIONS_DIR` | No | The folder holding the migration SQL and its `meta/_journal.json`. Normally unset — the migrator looks beside `@meith/db` in a checkout and in `/app/migrations` in the image. |

`.env.example` at the repository root documents the full set, including the
`MAIL_*` and `S3_*` companions.

### Visitor addresses and proxies

Five things key off a visitor's address: the control panel allowlist, the
login lockout counters, the hourly limits a guest gets, the truncated
address written to the moderator log, and the truncated range recorded
against an account at registration and on each sign-in (which is what the
ModCP's address lookup and the member search's **IP** filter read).

A board in [demo mode](./demo-mode.md#the-addresses-nobody-keeps) writes
none of the last two, and keys the lockout and the hourly limits on a
salted in-memory token rather than on the address itself — its
administrator password is published, so the next visitor would be the one
reading the last visitor's range. Only the allowlist still sees an
address, and only for the length of the request.

Behind a proxy the board cannot see the connection — it sees
`X-Forwarded-For`, a header each proxy **appends** its view of the caller
to, and which the caller may send some of themselves.

`TRUSTED_PROXY_HOPS` is how many proxies are in front of the board. The
board counts that many entries back from the **right-hand** end of the
chain — the end your own proxy wrote — and discards everything to the left
of the entry it lands on, because a caller can put anything there.

| Deployment | Setting | Chain the board sees | Address it takes |
|---|---|---|---|
| One reverse proxy — Caddy, nginx, Traefik | `1` (the default) | `<visitor>` | `<visitor>` |
| A CDN in front of that proxy | `2` | `<visitor>, <cdn>` | `<visitor>` |
| No proxy at all, port exposed directly | `0` | anything | none; the header is ignored |

Set it too **low** and allowlisted visitors are read as their proxy. Set it
too **high** and a caller can forge their address by prepending entries —
walking past `ADMIN_IP_ALLOWLIST`, dodging the login lockout by appearing
to be somebody new on each attempt, and writing a false address into the
audit trail. When in doubt, count the proxies and use that number; one too
low is safer than one too high.

At `0` the board resolves no address at all: the allowlist refuses
everybody, guest limits fall back to a single shared bucket, and neither
the log nor an account's ranges record anything. The board warns once per
process when a request arrives with a forwarding header it has been told
to ignore.

### Remote images

A post may embed an image by URL. **By default the board's content policy
does not let the browser fetch it**: `img-src` is this board and `data:`
URLs, nothing else.

The reason is that a remote image is a beacon: the host serving it learns
the address of every reader who opens the thread, and the moment they did,
and neither the reader nor the moderator who approved the post can see it
happening. One `![](https://…)` in a popular thread is a readership log for
somebody who does not run your board.

`REMOTE_IMAGES=1` allows them, from any `https:` host. Turn it on if your
board's culture is image hosts and link dumps and you would rather have the
pictures — plenty of forums would — and know what you are handing out when
you do.

Nothing is proxied or cached in between. With the default in place, a post
that embeds a remote image renders as a broken image with its alt text: the
URL is still stored, and starts working the day the variable is set.
Uploaded attachments are served by the board itself and are unaffected
either way. One other thing to watch: a **smiley configured with an
absolute URL** is a remote image like any other, and needs uploading to the
board instead.

### Where uploads go

Avatars, attachments and the board logo share one store, chosen by
`FILESTORE_DRIVER`:

| Deployment | Setting | Why |
|---|---|---|
| Local development | nothing | `local`, writing to `.uploads` beside the app. |
| A VPS (Docker Compose) | nothing | The image declares `/app/.uploads` as a volume; compose mounts the same named volume into `web` and `worker`, so both see the same files. |
| A board that wants object storage | `FILESTORE_DRIVER=s3` | Optional at any size — the point at which uploads stop being your disk's problem. |

**Wherever you run this, the store must survive a restart.** On a host
whose filesystem is per-instance and ephemeral, `local` does not fail — it
*loses*: the write succeeds, the file is served back from the same warm
instance, and it is a 404 for every other visitor and for you tomorrow.
That is one reason the documented deployment is your own server with a
real disk mounted as a volume.

`s3` needs `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY`, and boot fails naming any that are missing. Add
`S3_ENDPOINT` for anything S3-compatible — Cloudflare R2, MinIO,
DigitalOcean Spaces — which also switches the client to path-style
addressing.

On local disk, the uploads directory is the second thing to back up; on an
object store the bucket has its own backup story. See
[backup and restore](#backup-and-restore).

### Settings from the command line

`/admin/settings` has everything, but the CLI works when the panel does
not — which is usually the moment you need it:

```sh
community settings:list          # the whole registry, with defaults
community settings:get board.name
community settings:set board.name "The Townland"
```

### Closing registration

**Allow new registrations** (`registration.enabled`, in the registration
group) decides whether strangers may join. Off is the switch to reach for
when a spam wave is faster than your moderators, or when the board is
meant to be invitation-only:

```sh
community settings:set registration.enabled false
```

Off, three things change together — which is what makes it a closed door
rather than a hidden one:

- The **Register** link disappears from the user panel and the sign-in
  page.
- **`/register`** says the board is not taking new members and points at
  `/login`, instead of rendering a form.
- **The action behind the form refuses**, so a submission POSTed straight
  at it is answered with a 403 and creates nothing. Hiding a form is not
  closing it: the form's fields are public knowledge, and a spam run does
  not read your navigation.

Signing in, password reset and e-mail confirmation are untouched. A
closed board also refuses to open an account from a federated sign-in, so
turning on "sign in with GitHub" does not quietly reopen the door — see
[Signing in](./single-sign-on.md#what-a-new-account-inherits).

**It never locks you out of your own board.** The installer creates the
first administrator with registration forced open, and
`community user:create` does the same — so a board can be closed to the
public and still gain members, one at a time, from the command line:

```sh
echo "correct horse battery staple" |
  community user:create --username ada --email ada@example.com --group registered
```

### Taking the board offline

**Board offline** (`board.offline`, with `board.offline_message`) closes
the board while you work on it. It is a switch, not a deploy:

```sh
community settings:set board.offline true
community settings:set board.offline_message "Back within the hour."
```

Every page under the board — the index, forums, threads, search, the
member pages — is replaced by a single page carrying the offline message
(or a plain maintenance line if the message is empty). The RSS and Atom
feeds answer 503 with the same text, `robots.txt` becomes
`Disallow: /`, and the sitemap 404s.

Three things stay reachable, because otherwise the switch would be a lock
with the key inside:

- **`/login`**, so an administrator who is not signed in can become one.
- **`/admin`**, which is where you turn the setting back off. It has its
  own gate — `admincp.access` and the password prompt — as always.
- **`/api/health`**, so whatever watches the deployment does not report
  the board as dead while you work on it.

Who else gets through is one permission: **can view board offline**
(`canViewBoardOffline`), on `/admin/groups/[id]` like every other
board-wide right. Administrators get through whether or not the box is
ticked, so a board can always be reopened. Grant it to a group to let,
say, your moderators check their work while the board is closed.

> [!NOTE]
> Offline is not a security boundary. It closes the board's own pages; it
> is not a substitute for the forum permissions that decide who may read
> what.

## The operator CLI

Everything you should not need a browser for: migrations, users, forums,
settings, scheduled tasks, the MyBB importer, search reindexing. It ships
**inside the image**, so a deployed board needs no checkout, no toolchain
and no Node on the host.

How you reach it depends on how the board was deployed:

| Deployment | Invocation |
|---|---|
| Coolify | Open the `web` container's terminal in the panel, then `node apps/cli/cli.cjs <command>` |
| Docker Compose | `docker compose run --rm --no-deps web node apps/cli/cli.cjs <command>` |
| A checkout | `pnpm community <command>` |

`--rm` matters on Compose: without it every invocation leaves a stopped
container behind. So does `--no-deps` — without it each command re-runs the
migration container first, which is harmless but slow enough to be
confusing.

The rest of this page writes **`community <command>`**, which is worth
making literally true on a Compose board:

```sh
alias community='docker compose -f ~/meith/docker/compose.yml run --rm --no-deps web node apps/cli/cli.cjs'
```

The commands:

| Command | What it does |
|---|---|
| `community --help` | Lists everything below. |
| `community env:check` | Is the environment valid? Opens no connection. |
| `community migrate` | Apply core migrations. |
| `community upgrade` | Core migrations, then each installed plugin's, then record the version. `--dry-run` prints the plan. |
| `community import` | Import a MyBB board — see [importing from MyBB](#importing-from-mybb). |
| `community settings:list` / `settings:get` / `settings:set` | Read and write board settings. |
| `community user:create` | Create an account — `--username`, `--email`, optional `--group`; password on stdin. Works with registration closed. |
| `community user:promote` | Administrator access on a board that already works. |
| `community user:2fa-clear` | Clear a member's second factor when they have lost their app *and* their recovery codes — `--user <id\|username>`. Ends every session on the account. The break-glass for a sole administrator locked out of their own board; see [signing in](./single-sign-on.md#when-the-app-and-the-codes-are-both-gone). |
| `community forum:create` | Create a forum. |
| `community profile-field:list` / `profile-field:add` / `profile-field:remove` | Manage custom profile fields. |
| `community task:list` | What is scheduled, and how often each task runs. |
| `community task:run` | Run the tick once, by hand — or one named task. |
| `community search:reindex` | Rebuild the search index now rather than over the next few ticks. |
| `community demo:seed` / `demo:reset` | [Demo mode](./demo-mode.md) only; both refuse without `DEMO_MODE`. |

Search indexes itself: `search.reindex` runs on the tick every ten minutes
and covers every case that leaves a post unindexed — an import, a restored
dump, an upgrade that changed what the index holds. `community
search:reindex` does the same work now and runs to completion; the admin
panel's button is the same thing, one batch per click. None of the three
is a prerequisite for search working.

The commands that exist are the ones `--help` lists. This project does not
document a command it has not written, so one you expected and cannot find
is missing rather than hidden.

## Importing from MyBB

`community import` copies a MyBB board — members, forums, threads, posts,
private messages, and the rest — straight out of its MySQL database:

```sh
MYBB_PASSWORD=… community import --host db.example --user mybb --database mybb \
  [--prefix mybb_] [--port 3306] [--charset utf8mb4] [--ssl] \
  [--budget 20000] [--page-size 200]
```

The password travels in the environment rather than a flag, because a
password in argv is in your shell history and in `ps` for every user on
the box.

- **It is resumable.** The run stops after `--budget` rows (not an error),
  records its cursors, and the same command continues from where it left
  off. Run it as many times as the board needs.
- **It reports what it did** — per kind: read, inserted, updated, skipped,
  with the reason for each skip.
- **When it finishes**, run `community task:run counters.reconcile` before
  opening the board, so every counter reflects what was imported. The
  search index catches up on its own over the next ticks (or run
  `community search:reindex`).
- **Members keep their passwords.** A MyBB hash is verified on first
  sign-in and upgraded to the board's own hashing there and then — nobody
  resets anything.
- **Old links can keep working.** Turn on `board.legacy_redirects` and the
  board answers MyBB's URL shapes — see
  [an imported board's old links](#an-imported-boards-old-links-404).
- **Posts are converted from BBCode to Markdown** by a background task
  after the import — see [posts are Markdown](#posts-are-markdown).

What deliberately behaves differently from MyBB after a move — and what an
imported board loses — is catalogued in
[MyBB parity decisions](./mybb-parity.md). Read it before promising anyone
a like-for-like move.

## The forum tree

`/admin/forums` draws the tree in the order the board renders it, and that
screen is where the order is decided.

### Moving a forum

Drag a row by its handle: up and down to reorder, sideways to change how
deep it sits. A line shows where it will land, indented to the depth it
will land at; nothing is written until you let go.

Each row also carries four arrows — up, down, in, out. They are what a
keyboard gets, what a screen reader gets, and what the screen falls back to
with JavaScript off, where each arrow is an ordinary form submission. An
arrow with nowhere to go is disabled rather than hidden.

Three rules the screen enforces, because the tree does:

- **A forum takes its subforums with it.** They move as a block and keep
  their order.
- **What lands somewhere new inherits from where it landed.** Moving a
  busy forum under a private category hides the whole subtree; the screen
  says so under the tree.
- **A link row holds nothing.** Nothing nests inside one, by drag or by
  arrow.

Reordering under the same parent does not ask for your password again — it
changes nothing about who may read what. **Re-parenting does**, on the same
fifteen-minute re-authentication rule as everything else destructive in the
panel, because it changes what the subtree inherits.

Each forum's **Display order** on `/admin/forums/[id]` is the same number
the tree screen writes. A move renumbers the new siblings densely from
zero, so the numbers never drift into ties; typing one by hand still works.

## Permissions

45 permission fields — 26 resolved per member per forum, 19 board-wide.
Every read path — pages, search, feeds, the REST API — asks the same
resolver, so there is no route that quietly reads around the rules, and
every field on the screen is one some decision reads.

### The three layers

Permissions resolve in this order, and understanding the order is most of
understanding the model:

1. **Group permissions** — the floor. A member's groups are combined, and a
   boolean is granted if *any* of their groups grants it.
2. **The forum matrix** — per forum, per group. Each cell has three
   states: inherit, grant, deny. (The three requires-approval cells are
   requirements rather than rights, so their explicit states read
   *Required* and *Not required*.)
3. **Moderator rights** — per forum, per member or group, granted
   separately.

> [!IMPORTANT]
> In the forum matrix, **empty means inherit** — it is not the same as
> "no". That is why each cell is a three-state control rather than a
> checkbox: a checkbox would write an explicit value into every cell on
> first save, pinning the forum so later changes at its parent do nothing.
> Silently pinned forums are the commonest way a board's permissions end
> up wrong.

### Reading the matrix

`/admin/forums` holds the matrix. Each cell shows what it resolves to *and
which forum it inherited from* — "inherit" on its own tells nobody
anything.

**Copy to subforums** means *identical*, not *merged*: it clears rows the
source forum does not have, because a descendant that denied something the
source inherits would leave you with two forums you had just been told now
match. The change is previewed cell by cell before it applies.

### A "your threads only" forum

Denying **see threads started by other users** (`canViewOthersThreads`) on
a forum turns it into a support desk: everybody may post, and nobody but a
thread's author reads it. Reach for it when a forum collects applications,
appeals, or anything a member should be able to write without the rest of
the board reading it.

The deny is enforced in the query, not in the page, so it holds on every
read path: the thread list, a thread reached by guessed URL, search, the
feeds, the sitemap, the latest panels, the statistics, the who-is-online
location column, attachment downloads, quoting, and the REST API. A
refused thread is a 404 — the same answer a thread that does not exist
gives, because a distinguishable refusal is itself an answer.

What a deny looks like:

- **A member** sees the forum and may post in it. In the listing they see
  only threads they started. On the board index the forum's counts read
  `0`, its last-post column is blank, and it never shows the unread mark —
  all three describe other people's threads, and a forum that will not
  show them should not summarise them.
- **A guest** sees the forum and nothing in it: a guest has authored
  nothing, so "your threads only" resolves to no threads — including
  threads whose author account was deleted, which are nobody's own. Grant
  the permission to the guest group if the forum is meant to be publicly
  readable.
- **A moderator of the forum** sees everything in it, on the same footing
  as *see unapproved* and *see deleted*: an appointment carries the right,
  so a support desk stays workable. Super-moderators and administrators
  bypass it as they bypass every other forum permission, and the bypass is
  logged.

> [!IMPORTANT]
> Denying this permission does **not** hide the forum. `canView` decides
> whether the forum exists for a viewer and `canViewThreads` whether its
> threads open at all; this one only decides *whose*. A forum meant to be
> invisible wants `canView` denied instead.

### Letting members delete their own threads

`canDeleteOwnThreads` is the thread-sized twin of `canDeleteOwnPosts`.
Granted, the member who **started** a thread gets a **Delete thread**
button, and pressing it moves the whole thread to `visibility=deleted` —
the same reversible state a moderator's delete produces. It is off by
default.

Three things to know before granting it:

- **It is per forum**, like every other matrix cell, so it can be granted
  in a scratch forum and denied in the one that holds your rules.
- **It does not carry the undo.** Restoring a thread is `thread.restore`,
  a moderator right, and stays one: a member who deletes by accident has
  to ask. (`canDeleteOwnPosts` has never carried `post.restore` either.)
- **It takes the replies with it.** A thread is deleted whole, so in a
  busy forum one member can remove a conversation other people wrote in.
  Where that matters, leave it denied and let members delete their own
  *posts* instead.

The tools panel on a thread is headed **Thread tools** for a member who
holds nothing but this, and **Moderator tools** for somebody appointed
over the forum. Bulk deletion from a forum listing stays moderators-only.

### Numbers behave differently from switches

Numeric permissions — attachments per post, signature length, the edit
window — combine as the **most generous** value across a member's groups.

> [!NOTE]
> **`0` means unlimited, not none.** A cell showing `0` is not a
> restriction, and a member in *any* group set to `0` is unlimited
> regardless of what their other groups say.

### The daily post allowance

`maxPostsPerDay` is a board-wide numeric permission that caps **threads
and replies together**, so replying is not a way around a cap on posting.
It is spent in the write path, on the same database counters the anti-spam
limits use, so every instance of your board shares one allowance.

- **`0` is unlimited**, as everywhere else — which is also how you exempt
  somebody: put them in a group that sets it to `0`.
- **The day is a UTC day.** The allowance resets at midnight UTC — the
  counter is a fixed window, not a per-member calendar.
- **Guests are not counted.** The cap is per member id.
- **Bypass flood check does not lift it.** That permission covers the
  flood interval and the hourly anti-spam limits, which are board
  settings; this one is a value the group itself carries.

Somebody who has spent their allowance is told so, and told roughly when
it comes back — in hours, because "try again in 1,290 minutes" is not an
answer.

### The daily private message allowance

`maxPrivateMessagesPerDay` works the same way for **sending** private
messages, on its own counter: a member who has run out of posts can still
send messages, and the other way round. One send is one unit however many
people it addresses.

> [!IMPORTANT]
> **`maxPrivateMessagesPerDay` and `privateMessageQuota` are different
> controls.** The first is a *rate* — how many a member may send in a day.
> The second is *storage* — how many they may keep, which is what a full
> inbox means. Setting one does nothing about the other.

### What an appointment grants

`/admin/forums/[id]` appoints a member or a group to one forum, optionally
cascading to everything beneath it. It offers **nine** checkboxes, each
read by a real authorization decision:

| Checkbox | What it decides |
|---|---|
| Edit posts | `post.editOthers` — editing somebody else's post |
| Delete posts | `post.softDelete` and `thread.delete` — moving content to `visibility=deleted` |
| Restore posts | `post.restore` and `thread.restore` — putting deleted content back |
| Approve content | `content.approve` — releasing held content, and the approval queue |
| Open and close threads | `thread.lock` |
| Stick threads | `thread.stick` |
| Move threads | `thread.move` — in the source forum and the destination alike |
| Merge threads | `thread.merge` |
| Split threads | `thread.split` |

Any appointment at all — even one carrying no checkbox — lets its holder
*see* held and deleted content in that forum. That is what makes the queue
readable; acting on what is in it needs the right that names the act.

> [!IMPORTANT]
> **Delete and restore are two grants, not one.** Somebody appointed with
> *Delete posts* alone can remove a post and cannot put it back —
> including one they removed themselves. Tick *Restore posts* as well
> unless withholding the undo is what you meant.
>
> Boards that upgraded past 0.4 keep what they had: a one-off migration
> granted *Restore posts* to every existing appointment holding *Delete
> posts*. New appointments start from nothing and get exactly what is
> ticked.

A group given `canSoftDeletePosts` in the forum matrix — rather than by
appointment — can both delete and restore *posts* in that forum: that cell
has always meant "may move a post to deleted, reversibly", and there is no
second cell beside it.

> [!NOTE]
> **There is no hard delete, and no permission claims there is.** Deleting
> a post or a thread always means `visibility=deleted`: the row stays, the
> moderator log records the act, and somebody with *Restore posts* can
> undo it.

**"My forums" in the ModCP lists what somebody actually holds**, per
forum. (Two rights wear their working names there: *Open and close
threads* shows as **Lock and unlock**, and *Stick threads* as **Pin and
unpin**.) If a right is not in that list, the board will refuse the act;
if it is, it will not.

### The one door no bypass opens

`admincp.access`. The super-moderator and administrator bypasses apply
everywhere else, and every use of one is logged.

### How a group looks

`/admin/groups/[id]` carries a group's appearance as well as its rights.
All three parts are optional:

- **A name colour**, set separately for **light and dark**. Fill in both:
  a colour that reads on white is usually unreadable on a dark page, and
  the board will not guess the second one. An unfilled picker simply
  leaves readers of that scheme the ordinary text colour.
- **A badge**, as two uploads, light and dark, on the same terms as the
  board logo — the bytes decide the format, and SVG is accepted. Upload
  one and it is used in both schemes. It appears beside the group's title
  in the postbit.
- **The title** — what shows under a member's name on every post.

The colour reaches every username: the postbit, who started a thread, who
posted last, the profile heading, who is online. It is delivered as a
stylesheet rule rather than a colour on each name, with one rule on the
class the appearance control writes and one under a `prefers-color-scheme`
query — which is what keeps the right colour on the page for a reader
whose dark mode comes from their operating system rather than the board's
own control.

> **Check the contrast.** Nothing stops you setting a pale yellow no
> reader can make out. Beneath each picker is a sample of the name on the
> surface it will really sit on — light beside dark, painted from the
> board's own palette — so the light sample is light even if your machine
> is in dark mode. It is there to be looked at.

**Display groups.** A member is shown as their **display group** where
they have chosen one, and their primary group otherwise. Members choose it
under **UserCP → Profile**, from the groups they actually hold; picking
their primary group stores nothing, so the choice keeps following that
group. A group held only until a date leaves the list when it lapses, and
a member wearing it falls back to their primary group. The picker is not
shown to a member in only one group.

An administrator moving somebody between groups does not silently take
that choice away. Promotions, mass moves and group deletion change the
*primary* group and leave an explicit display choice alone — except where
the stored choice has stopped meaning anything: a member displaying the
group they are being moved out of (or that is being deleted) goes back to
showing their primary group, and one displaying the group they are being
moved *into* has the row cleared, because picking your primary group
stores nothing.

**Staff are shown as staff, and have no choice about it.** A member whose
primary group is a staff group — or any group carrying administrative or
moderation power — is displayed as that group everywhere, gets no picker,
and any display group set before they were appointed stops applying. The
badge is a claim about who is answerable for the board, and a moderator
posting as an ordinary member is that claim withdrawn exactly when it
matters. This is a display rule, not a membership one: staff can hold any
other group — including one they paid for — and get everything it
carries.

### Groups a plugin may grant

The same screen carries one more switch: **may be granted by plugins**. It
is off by default, and it is the opt-in behind any plugin that hands out
membership — a paid pass, a trial, time-boxed access. A plugin can only
put a member in a group you have marked this way, and only **until a
date**: every plugin-granted membership expires, and the expiry holds even
if the plugin is removed or the tick stops, because the permission model
simply stops reading a lapsed row.

A plugin may ask for the group it grants to become the member's
**primary** one — what a plugin selling membership normally wants, and
what Dues does on a purchase. The group they were primary in becomes a
secondary membership, and the board hands it straight back when the grant
lapses or is revoked. The swap is the board's, not the plugin's, and **a
staff member's primary group is never displaced**: buy a membership as a
moderator and you get the group as a secondary membership, but you stay a
moderator and are still shown as one.

The switch refuses some groups, with the reason spelled out: system
groups, staff groups, and any group whose permissions carry administrative
or moderation power. If what you want a plugin to sell is "members plus
one private forum and a badge", make a group that says exactly that and
mark *it* grantable — never a group that also moderates.

A `groups.expire` task tidies lapsed memberships every fifteen minutes; it
is housekeeping, not enforcement — access ended at the expiry regardless.

### Promotions

`/admin/groups/promotions` moves members into a group once they have
earned it. The screen holds the rules, and beneath them a preview: exactly
who the rules would move if they ran this second, with nothing written.

A rule is:

- **A title** — for the preview and the admin log; members never see it.
- **Display order** — the first rule in this order that matches a member
  is the one applied, and no member is moved twice in a run.
- **Promote from** — a primary group, or *any group*.
- **Promote into** — the group that becomes their new primary group.
  (Display groups follow the rules [above](#how-a-group-looks): an
  explicit choice survives unless it named the old or the new primary
  group.)
- **At least** — posts, reputation, days registered. Each optional; a
  blank box means the rule does not look at that number.

**A new rule is enabled straight away**, and from then on the board
applies it without anybody pressing anything: a `promotions.apply` task
runs every six hours. **Disable** is the reversible way to stop a rule;
**Remove** deletes it, asks for your password again, and has no undo.

Two rules are refused outright, because both are quiet in the preview and
loud six hours later:

- **A rule that promotes a group into itself** can never move anybody.
- **A rule with no criteria at all** matches every member it examines —
  a board-wide primary-group change on the next tick. If that is really
  what you want, say it out loud: set *posts* to `0`. Zero is accepted;
  blank is what is refused.

Everything else the machinery refuses at run time, without being
configured to: **a promotion never lifts a ban, never demotes, and never
re-applies to somebody already in the target group.** Banned members,
administrators and super-moderators are skipped whatever a rule says, and
a rule whose target ranks below the member's current group is passed over.
A promoted member keeps every secondary membership they held.

The preview is the same evaluation the task runs, so read it before
enabling a rule on a board with history — a "100 posts" rule on a
five-year-old board moves five years of members on its first tick. **Run
it** applies exactly what the preview lists, asks for your password again,
and records the count in the admin log. Deleting the target group deletes
the rules that point at it.

## Themes

A theme is a package registered in `apps/community/community.config.ts`.
Installing one is three steps, in your checkout of the board:

```sh
pnpm --filter @meith/web add @meith/theme-midnight
```

```ts
// apps/community/community.config.ts
import { midnightTheme } from "@meith/theme-midnight"

export default defineForumConfig({
  themes: {
    // …the default theme stays registered…
    midnight: midnightTheme,
  },
  defaultTheme: "default",
  // …
})
```

Then commit, push, and redeploy — the image is rebuilt from your
repository, so an installed theme is a commit rather than a state the
server drifts into.

Writing your own starts from
[`examples/iris-theme`](https://github.com/meith-dev/meith/tree/main/examples/iris-theme),
the worked minimal theme. See [the theme API](./theme-api.md).

> [!NOTE]
> There is no upload-a-zip path, and there will not be one. A theme has to
> be visible to the bundler at build time; a production build contains
> only what the bundler could see, so a theme discovered at runtime works
> in development and is absent in production.

**A member picks a whole theme, components included.** `midnight` renders
its forum listings as tables, and a member who picks it gets tables. The
choice is a cookie the server reads, so the page arrives already correct —
no flash, no second paint — and the switcher works with JavaScript off.
`defaultTheme` in the config is the *fallback*: what the board renders
when its `themes` table says nothing, and what a palette-only theme
borrows its markup from. Changing it is a deploy; changing what members
see is not.

### The board's name, and its logo

The name in the header, in every `<title>`, and in outgoing mail is
`board.name` under **Settings → Board**. There is nowhere else it is
written down.

`/admin/themes` takes a **logo** to show in place of the name, as two
uploads:

- **Light** — used on a light page, and everywhere if there is no dark
  one.
- **Dark** — used when the reader is in dark mode.

Two images because one that reads on a white page usually disappears on a
black one. Which one a reader gets is decided on the server from their
colour-scheme cookie, so a member who has forced dark mode on a light
machine still gets the dark logo.

PNG, JPEG, WebP or SVG, up to 512 KiB. **The contents decide the format,
not the file name** — markup uploaded as `logo.png` is refused. SVG is
accepted and is usually what you want for a wordmark; one containing a
`<script>`, an event handler or a `javascript:` URL is refused, and the
served response is sandboxed besides.

The alt text — what a screen reader announces instead of the image — is
**Logo alt text** under Settings → Board. Left empty it becomes the
board's name, which is usually what the logo says anyway.

With no logo the header shows the board's name in text, which is where
every board starts and where most stay.

Outgoing mail uses the same two uploads, addressed absolutely off the
board's address — with one exception: **an SVG logo is skipped in mail**,
because most clients will not draw one. A board whose only logo is an SVG
still gets its name as a wordmark in the masthead, which is what a client
with images blocked would have shown anyway. See
[what the messages look like](#what-the-messages-look-like).

### What you can change without a deploy

`/admin/themes` holds the parts that are data rather than code:

- **On or off.** An enabled theme appears in the appearance control at the
  foot of every page, and any member — signed in or not — can pick it. The
  theme the board is built with can never be turned off; neither can the
  default until the default is moved. With only one theme enabled the
  menu is not rendered at all, and the light/dark buttons still work on
  their own.
- **The default** — what a member who has chosen nothing sees. It need
  not be the theme the board is built with: setting `midnight` as the
  default gives every visitor midnight, without a deploy.
- **Token values** — colours, corner radius, spacing, and the three font
  stacks (**body**, **heading**, **monospace**) — with **separate light
  and dark values**, and the platform colour picker beside each colour.
  The sample repaints as you drag, in both schemes at once. The heading
  stack follows the body stack by default; set **Heading font** on its
  own for headings in a different voice, and a stack built from faces the
  reader already has (`Georgia, ui-serif, serif`) downloads nothing.
- **Custom CSS.** For any theme other than the board's default it is
  nested under that theme's own selector, so it stops applying when a
  member picks another theme — and a rule aimed at `:root` will not match
  inside the nesting; target `body` or a class instead. The **default**
  theme's custom CSS is the exception worth knowing: it is appended
  unscoped, so it reaches every member including those who picked another
  theme. That makes it the place for a rule that belongs to the *board*;
  a rule that belongs to one look goes on a theme that is not the
  default. The editor says which of the two you are editing.
- **Export and import** — an exact JSON round-trip, so a look can be
  moved between boards. Documents from before per-scheme overrides
  existed (`"version": 1`) still import; their values apply to both
  schemes.

A member's choice lives in two cookies (`meith_theme`, `meith_scheme`),
not on the account: it works for readers who are not signed in, and it
does not follow anyone between browsers. The cookie is validated against
the enabled list on every request, so a theme that is turned off stops
rendering immediately for everyone who had chosen it — nobody has to
clear anything.

**Reset** clears a theme's stored colours and custom CSS. **Reset and
import ask for your password again**: both replace every stored override
in one press and neither has an undo. The reversible controls on the same
screen — enabling, disabling, moving the default, saving the palette — do
not ask, because each is undone by the control beside it.

### A board in a club's colours

`clubhouse` is the theme shipped for a sports club — anything with a crest
and two colours. It is the default board's shape dressed the way a club
site is: a crest beside the board's name, a club-colour rule under the
masthead, a colour bar on every panel heading, and a postbit built like a
squad card.

It is painted entirely from tokens, so making it *your* club's is the
theme screen and no deploy:

- **The club colour** is the brand group — `primary`, `primary-hover`,
  `primary-foreground`, `ring`. One press of a brand preset writes all
  four, or type your own.
- **The second colour** — the trim on the jersey — is `secondary`, with
  `secondary-foreground` for text on it.
- Everything else stays neutral on purpose, so those two are the only
  hues on the page.
- The screen takes a light and a dark value per token, and this theme
  ships the same club colours in both — a club does not have a night kit.
  Change both unless you mean them to differ.

With no logo uploaded, the masthead draws a crest from the board's name —
the first letters of its first two words — so a club with a name and no
artwork still gets a mark.

Writing a theme: [the theme API](./theme-api.md). Every slot and view
model: [theme slots](./theme-slots.md).

## Times

**Every date and time on the board is shown in the reader's own timezone**,
signed in or not. Timestamps are formatted on the server, so the zone has
to reach it: a small script reports the browser's zone into a `meith_tz`
cookie, and the first page a new reader opens reloads once so it arrives
in their zone. Every page after that is already right, and the footer
names the zone it used.

A reader with JavaScript off never reports one, so they get **UTC** — and
the footer says UTC, rather than showing an unlabelled time that is wrong
by a working day for half the world.

A member can override the detection under **UserCP → Options**:

- **Automatic** — follow whatever device they are reading on. The
  default, and what makes a member's laptop and phone each show local
  time.
- **A named zone** — an IANA name (`America/New_York`), which wins on
  every device. Picking `UTC` here is a choice like any other and is
  kept.

Upgrading an older board converts existing members to **Automatic**:
before this existed the column held `UTC` for everybody who had never
opened the options screen, so "chose UTC" could not be told from "never
chose". A member who genuinely wants UTC picks it once.

## Languages

**A page is written in the reader's language when the board has a catalog for
it**, and in English when it does not. The board asks three things in order and
takes the first that names a language it can serve: the member's own choice
under **UserCP → Options**, the browser's `Accept-Language` header, then
**Admin CP → Settings → Display → Default language**. The answer sets
`<html lang>` and `<html dir>`, and dates, numbers and plurals follow it.

A fresh board ships English and nothing else, so every reader gets English
whatever they ask for — the setting is there for the board that adds a catalog,
and for the operator who wants a different fallback. Adding one is a change to
the source tree rather than an upload, and [Languages](./internationalisation.md)
is the whole of it. Themes and plugins can ship catalogs too, which is also how
a board renames *Threads* to *Missions* without forking anything.

Language and timezone are separate: choosing German does not move anybody's
clock, and a member reading English in Tokyo keeps Tokyo.

## Cookies

The board sets ten cookies of its own and no third-party ones:

| Cookie | What it is for |
|---|---|
| session, remember-me | Signing in. Both are random tokens stored hashed; neither carries a CSRF secret, because the board has none — see [cross-site requests](#cross-site-requests). |
| admin session | The control panel's separate sign-in. Scoped to the `/admin` path, `SameSite=Strict`. |
| guest cookie | Opaque randomness minted on a first visit, so a guest can be counted as online. It identifies nobody and no code path turns it into an actor. |
| sign-in handshake, passkey challenge, second factor | Only while a sign-in is half-finished. Cleared the moment it finishes either way, ten minutes at most — see [Signing in](./single-sign-on.md). |
| `meith_theme`, `meith_scheme` | The appearance controls, written only when a member presses one. |
| `meith_tz` | The reader's timezone, so the server can format times in it. An IANA zone name and nothing else. |

Every one is either strictly necessary or set in direct response to
something the reader asked for. There is no cookie banner, because there
is nothing on the board that needs one.

> What a particular board must disclose depends on what it does with its
> data, which is the operator's to decide — a board that adds its own
> tracking adds its own obligations with it.

### A board session has a lifetime, not an idle timeout

**Session lifetime (days)** on the security screen is an *absolute* life:
the expiry is fixed when the session is minted and nothing extends it, so
a member reading the board every day is signed out on that date exactly
like a member who never came back. (The setting key is still
`security.session_idle_days` — renaming a stored key would strand the
value on every board that set one; the label is the accurate half.)

That is deliberate, for two reasons:

- **A stolen token has a known last day.** A sliding session hands
  whoever holds the token the ability to keep it alive forever by using
  it — which is precisely what a thief does.
- **"Keep me signed in" is already the renewing half.** The remember-me
  token rotates on every resume and mints a fresh session, so a member
  who ticked the box is carried over the expiry without noticing — and a
  *reused* remember token, the fingerprint of a stolen one, revokes the
  whole family and every session with it.

The control panel's own session is the other way round — a 30-minute idle
timeout under an 8-hour ceiling — because an unattended browser that is
still signed in to the board must not also be signed in to the panel.

## The content security policy

Every response carries a `Content-Security-Policy` built per request in
the board's middleware. Two parts are worth an operator knowing:

**Scripts run only with this request's nonce.** `script-src` is
`'self' 'nonce-…' 'strict-dynamic'` and carries no `'unsafe-inline'`, so
an inline `<script>` that arrives in a post, a profile field or a search
excerpt does not execute even if some future bug lets the markup through.
The board's own two inline scripts — the timezone probe and a thread's
structured-data block — are stamped with the nonce as they render. A fresh
nonce is minted per request, which is why no page of the board is served
from a CDN cache.

**Styles are not nonced, and that is a deliberate limit.** A theme may
emit a `<style>` block — several shipped ones do — and themes are a
published API with no way to be handed a per-request nonce. `style-src`
therefore keeps `'unsafe-inline'`. Injected CSS can restyle a page; it
cannot execute, which is the line the script directive holds.

`img-src` is the third part, and it is a setting: see
[remote images](#remote-images).

If you put something in front of the board that rewrites headers, do not
let it replace this one — a cached or hand-written policy will not carry
the nonce for the request it is served with, and every page will arrive
with its scripts refused.

## What a member's browser contacts

By default, nothing but the board. No script, style, font or beacon is
fetched from anywhere else, and the board carries no analytics of any
kind — not a hosted product, and not a self-hosted one either.

The typeface shows how that is held rather than promised. The board sets
Inter, and the font files are downloaded at build time and served from the
board's own origin, so opening a page tells Google nothing.
`default-src 'self'` and `connect-src 'self'` in the
[content policy](#the-content-security-policy) hold the same line at
runtime: something that wanted to report elsewhere could not reach it.

Three things widen that, and an operator chooses each one:

| What | How it is turned on |
|---|---|
| Images from other hosts, embedded in posts | `REMOTE_IMAGES=1` — see [remote images](#remote-images) |
| A federated sign-in provider | Configured per provider — see [Signing in](./single-sign-on.md) |
| Whatever a plugin loads | Installing the plugin in `community.config.ts` |

**Upgrading from 0.7.0 or earlier removes a request your members were
making without knowing.** Those versions rendered a hosted analytics
beacon into every page whenever `NODE_ENV` was `production` — a third
party meeting the members of every self-hosted board, with no setting that
turned it off. It is gone, and nothing replaced it: there is no analytics
here to opt out of.

The rule is mechanical now rather than remembered. The board's own source
may import relative paths, `@meith/*`, `node:*`, `next`, `react`,
`react-dom` and `server-only`, and nothing else; `pnpm guards` fails on
anything further. Adding something a browser would fetch means widening
that allowlist on purpose, in a diff somebody reviews.

## Cross-site requests

**There is no CSRF token and no per-session CSRF secret.** A board that
claims one and does not have it is worse than a board that says which
mechanism it actually relies on, so here is the mechanism.

Every write the board performs is one of three shapes, and each is closed
differently:

| Shape | What turns a forged request away |
|---|---|
| A Server Action — nearly every form on the board | The framework's own `Origin`↔`Host` check, before the action runs |
| A route handler that changes something — the read markers, a plugin's `POST` | The board's own same-origin check: an `Origin` that matches, or `Sec-Fetch-Site` saying `same-origin` (or `none`, a typed-in URL). A request that offers **neither** is refused, not admitted |
| `/auth/resume`, which rotates a remember-me token | It acts only on a top-level page navigation. An `<img>`, an `<iframe>` or a background fetch pointed at it is refused, so a link on somebody else's site cannot rotate a reader's token behind their back |

Underneath all three, session cookies are `SameSite=Lax` and the content
policy sets `form-action 'self'`, so a form on another site cannot post to
the board at all.

The practical consequence: **a client that sends no `Origin` header
cannot write to the board.** Browsers all send one on a `POST`. A script
of your own that posts to a plugin route must send one too — or use the
[REST API](./rest-api.md), which authenticates with a token rather than a
cookie and is therefore not subject to this check.

## Terms and privacy

Two documents, written by whoever runs the board, in
`/admin/settings?group=legal`:

| Setting | Published at | Linked from |
|---|---|---|
| **Terms of service** (`legal.terms`) | `/terms` | the footer, and the registration form |
| **Privacy policy** (`legal.privacy`) | `/privacy` | the footer |

Both are Markdown, rendered by the parser posts use — minus the board's
smilies and custom directives, which have no business in a legal notice.
Both ship with a template rather than empty, because a board with no
terms at all is the state nobody notices — and both templates are written
to be replaced. Make them describe what your community actually does, and
take advice if what your board does warrants it. They are a starting
point, not legal advice.

They are ordinary settings, so the CLI can write them too — the easier
route for a document you keep in a file:

```bash
community settings:set legal.terms "$(cat terms.md)"
```

Emptying one takes the page, its footer link, and — for the terms — the
registration checkbox away together. There is no separate "enabled"
toggle to leave inconsistent with the text.

While the terms have a body, the registration form carries a checkbox and
the server refuses to create the account without it — the refusal is
server-side, whatever the form said. The board does *not* record the
acceptance against the account: there is no stored timestamp and no
version history, because a per-account record nobody keeps the
corresponding text for proves nothing. The terms in force are the ones on
the page.

> `/terms` and `/privacy` are board routes, so a forum whose slug is
> `terms` or `privacy` is reachable at neither — the same as `/search`,
> `/online` and the other names the board has taken.

## Plugins

Same shape as a theme: add the package, a line in `community.plugins.ts`,
a redeploy. The worked example to copy is
[`examples/hello-plugin`](https://github.com/meith-dev/meith/tree/main/examples/hello-plugin).

> [!NOTE]
> There is no upload-a-zip path, for the same reason as themes: a plugin
> discovered at runtime is one the bundler never saw — it would work in
> development and be absent from the production build.

### What a plugin cannot do

It cannot decide authorization, reach the visibility filter, open its own
database connection, or patch core. Everything it *can* do is in a typed
registry. Its own data lives in tables named `plugin_<key>_*` — the host
refuses a migration that names anything else — and the one write it gets
against the board's own data is a timed group membership, only in a group
you have explicitly marked [grantable](#groups-a-plugin-may-grant).

Failures are contained: a plugin that throws leaves the page intact, and
the error is counted, logged, and — after repeated failures — the plugin
is switched off for the rest of that process. The full contract is
[the plugin API](./plugin-api.md).

### Administering one

`/admin/plugins` lists what is installed, what each plugin attaches to,
its settings, and the thing you cannot find out anywhere else: whether its
migrations have actually been applied to *this* database.

**"Enabled" has three answers, and the screen says which one you have:**

| It says | It means | Fix |
|---|---|---|
| Disabled in `community.config.ts` | The entry in `community.plugins.ts` sets `enabled: false`. (A plugin missing from the list entirely is not shown at all.) | Edit the list, redeploy |
| Switched off | Somebody pressed the button on this screen. | Press it again |
| Failing | The server stopped calling it after repeated errors. | The error is on the plugin's own page |

**The disable button is durable.** It takes effect on every instance, not
just the server that handled the click, and it survives a redeploy. A
disabled plugin's scheduled tasks stop too — the switch is checked each
time one comes due. Reach for it when a plugin is misbehaving; you do not
need to deploy to stop one. Because it takes a live capability off the
whole board, **disabling asks for your password again** when your panel
sign-in has gone stale; enabling does not, because it is the undo.

**The switch is read before the screen answers, not after.** Every server
keeps an in-memory copy of which plugins are switched off, and anything
that renders a plugin's contribution reconciles that copy first — so a
plugin you switched off yesterday is off in the first response from a
server that booted this morning.

**The panel never runs migrations.** It tells you which are outstanding;
`community upgrade` applies them.

> [!WARNING]
> A plugin with unapplied migrations is running against a schema that does
> not have what it expects. Treat that line as urgent, not informational.

**A plugin can carry its own pages and endpoints.** Pages appear under
`/plugins/<key>/…` inside the board's own chrome; endpoints under
`/api/plugins/<key>/…` — a payment provider's webhook, a form's target.
Both obey the disable switch: a plugin that is off answers 404 everywhere,
the same as one that was never installed.

**Plugin credentials go in either of two places, and the screen says
which one is winning.** A secret-type setting can be filled in the panel —
the field is write-only; the board will say a value is set but never show
it — or supplied as the environment variable named beside the field, which
overrides the panel and greys its box. Prefer the environment where you
can: it keeps credentials out of the database and out of backups. A greyed
field is never saved over — a save skips exactly the fields the
environment owns, so an unset variable later cannot reveal a stored value
nobody chose.

### Paid membership, in the tree

The repository ships one full-size plugin beside the CI-only reference:
[`plugins/dues`](../plugins/dues) sells time-limited membership of a group
through Stripe — subscriptions, fixed-term passes, and passes bought as a
gift. Its [README](../plugins/dues/README.md) is the runbook: the Stripe
keys, the webhook to create, and what the operator still owns (tax, refund
policy). It is registered like any other plugin and installed on no board
by default.

### Removing one

`pnpm remove`, a line out of `community.plugins.ts`, a redeploy — the
three install steps in reverse. There is no uninstall button. Stored
settings stay behind on purpose: reinstalling should not lose your
configuration.

Writing a plugin: [the plugin API](./plugin-api.md). Every hook:
[plugin hooks](./plugin-hooks.md).

## Content and announcements

`/admin/content` holds the board-wide vocabularies — the word filter,
thread prefixes, smilies and custom directives — with attachments,
announcements and the navigation menu on screens beside it.

One difference matters operationally:

| Change | When it applies | Cost |
|---|---|---|
| Word filter | Next page load, everywhere | None — it is applied when a post is *shown*. |
| Smilies, custom directives | Gradually | Marks every stored render on the board out of date. |

Smilies and directives decide what a post *renders to*, so changing one
invalidates every cached render. Nothing breaks — posts render correctly
on demand and are rewritten in the background by the tick — but on a large
board expect a period of extra rendering, and expect `/admin/system` to
report a backlog until it clears.

### What the word filter covers

"Everywhere" means every place the board shows a reader the words somebody
posted, not only the thread page: post bodies and the thread page's
structured data, the Latest Posts excerpts on the index, the RSS and Atom
summaries, and search-result excerpts on `/search` and the REST API. All
of them read one compiled filter through one function, behind a cache tag
that saving a filter invalidates.

Three things are deliberately *not* filtered, and none of them is a
display of somebody's post to a reader:

- **What is stored.** The filter never rewrites the row — which is what
  makes a pattern you regret harmless. The editor, the quote box and the
  API endpoint that returns Markdown source all show the words as
  written; anything re-rendered from that source is filtered when shown.
- **Private messages.** A message is not a post, and the filter is a
  board-wide vocabulary for public content.
- **The moderation queue and the report screens.** Staff are judging the
  text, so they see what was actually written.

### Custom directives

Markdown's extension point, and the board's own additions to it. A
directive chooses a name and whether it is inline or block; members write
a block one as `:::spoiler` … `:::` and an inline one as
`:spoiler[the ending]`, and it renders as a `div` or `span` carrying a
class your theme can style.

There is deliberately no replacement-pattern field: if you need bespoke
markup, that is a plugin, where the code is reviewed rather than typed
into a form.

### Posts are Markdown

Since 0.2 the board's markup language is Markdown, and there is no BBCode
renderer left. A board upgrading from an earlier release — or importing
from MyBB — has every post, private message, signature, announcement and
draft **converted once**, in the background, by `posts.render_backfill`.
Two things follow for an operator:

- **Nothing looks broken while it runs.** A row the sweep has not reached
  is converted in memory when somebody reads it. `/admin/system` reports
  the backlog; on a large board expect it to take a while and clear on
  its own.
- **`[u]`, `[color]` and `[size]` lose their styling.** Markdown has no
  spelling for underline, colour or size, so those tags become their own
  text: the words survive, the presentation does not. It is the one
  permanent loss in the conversion — see
  [MyBB parity](./mybb-parity.md#the-markup-language-is-markdown-not-bbcode).

### The silent edit window

**Silent edit window** (`posting.edit_grace_seconds`, default 300) is how
long after posting somebody may fix their own post without the board
announcing it. Inside the window the post carries no *Last edited by*
line; outside it, the line appears as it always has.

```sh
community settings:set posting.edit_grace_seconds 600   # ten minutes
community settings:set posting.edit_grace_seconds 0     # always show the notice
```

It is measured from when the **post was written**, not from the last
edit, so the window closes once and stays closed.

Two limits make it safe:

- **A moderator editing somebody else's post is never silent**, however
  soon after the post. The notice tells a reader the words are not
  entirely the author's, and that is exactly the case it must not hide.
- **The revision history is untouched.** Every edit still records who,
  when, why, and what the post said before; the setting suppresses one
  reader-facing line, not the record.

Set it to 0 for a board that wants every change on the record. Raising it
much above a few minutes starts to mean "the post you are reading may
have changed since the reply below it", which is what the notice exists
to prevent.

### Attachments

**Two switches must agree before a member can attach anything.** The
permission `attachment.upload` — per group, per forum, resolved through
the matrix — answers *may this member attach files here*. **Allow
attachments**, on `/admin/forums/[id]`, answers *does this forum take
attachments at all*. A file is accepted only where both say yes, so
unticking the forum switch closes it to new attachments however generous
the matrix is.

The switch is enforced where the post is written, not just where the form
is drawn: the composer stops offering the file control, and a submission
that carries a file anyway — a stale tab, a hand-built request — is
refused with *This forum does not accept file attachments*, and nothing
is written: the member gets their text back, not a post that quietly lost
its file. The numeric limits (attachments per post, maximum size) still
apply on top, and `0` there still means unlimited.

**Turning the switch off leaves existing attachments alone.** They keep
rendering and their links keep working, gated as always on
`attachment.download` and thread visibility. To take one down, delete the
attachment — which takes an entry off the post's list and nothing else;
the bytes go to the hourly sweep.

### Announcements

**An announcement is not a pinned thread.** Nobody can reply to one, it
expires on its own date, and removing it removes nothing anybody wrote —
which is why it is safe to delete and a sticky thread is not.

Dates are entered in UTC, and the screen says so.

### The navigation menu

`/admin/content/navigation` is the menu across the top of every board
page. A new board starts with six items — Home, New posts, Unanswered, My
posts, Search and Who's online — and those six are ordinary rows on this
screen: rename one, move it, hide it, or delete it outright, and add
links of your own beside them.

### Arranging it, and sub-menus

The list is a tree you drag. Take an item by its handle and drop it where
you want it; drop it **to the right of the item above** and it becomes a
sub-menu entry of that item, which opens under the parent when a reader
hovers it or tabs onto it. Sub-menus go one level deep — an item with
things under it cannot itself go under something, and the screen refuses
the move rather than flattening it.

Everything drag does, the four arrow buttons on each row do as well, and
they are ordinary form submissions: **the screen is fully usable with
JavaScript off**, which is how the rest of the panel behaves and how the
browser suite tests it. With JavaScript on, the arrows preview the move
before the server confirms it, and the keyboard arrows do the same thing
from the handle. Order is kept for you; there is no number to type.

Each row opens an **Edit** panel with the item's own settings:

| Field | What it does |
|---|---|
| **Label** | The words in the menu. Left empty on one of the board's own six, the item keeps its translated name — so it stays in the reader's language rather than freezing into the one you typed. |
| **Address** | A path on this board (`/rules`) or a full `http(s)` address. Nothing else is accepted: a `javascript:` address and a protocol-relative `//host` one are both refused, because a menu every reader sees is not a place to discover that a link left the board. |
| **Inside** | The top level, or the item this one hangs under. The same move dragging makes, for anyone who would rather pick it from a list. |
| **Shown to** | Everyone, signed-out visitors, signed-in members, or staff — the last meaning anybody with a moderator or admin control panel. |
| **Groups** | Tick none and the audience above decides alone. Tick some and only members of those groups see the item. The Authorizer answers the group question; the menu never reads group membership itself. |

**Open in a new tab** is the last: it marks a link as leaving the board,
and a theme that honours it opens the link in its own tab with
`rel="noopener noreferrer"`. A theme is free to ignore it and render an
ordinary link.

A hidden parent takes its sub-menu with it, and a sub-menu entry the
viewer may not see simply is not there — a parent whose children are all
filtered out renders as a plain link with nothing under it.

Two behaviours survive from before the menu was editable. The Search item
disappears when `search.enabled` is off, because the page it points at is
gone — an item of your own pointing at `/search` is left alone, on the
grounds that you asked for it. And a board with no database behind it
(`DATA_SOURCE=fixture`, the demo and `pnpm dev`) renders the original six
and says so rather than offering a screen that cannot save.

The menu is cached board-wide under one tag and saving any row clears it,
so a change is live on the next page load.

## The moderation queue

`/modcp` lists what is waiting for approval in the forums you moderate:
held threads, and held replies. It is a queue of **decisions that can
actually be carried out**, and two rules keep it that way:

- **A held reply inside a thread that is itself held is not listed.**
  Approving the thread is what puts it in front of anybody, so the reply
  is not a separate decision.
- **A held reply whose thread has been deleted is not listed either.**
  Approving it would mark it visible inside a thread nobody can reach —
  and, because approving a post adds it to the forum's and the author's
  counts, would move counters for something the board does not show.
  Restoring the thread brings its held replies back into the queue.

The exclusion is enforced where the decision is applied, not only where
the queue is drawn, so a selection assembled by hand gets the same
answer: the reply is reported as no longer pending rather than approved.
The inline **Approve** on a thread page follows the same rule.

## Reputation

`/admin/settings` under **Reputation**. Four settings, and the first two
decide what the feature *is* on your board:

- **Allow negative ratings** (`reputation.allow_negative`) — off by
  default. Off, reputation is a thanks button: every post carries
  **Thanks**, one press gives the author a point, pressing again takes it
  back. The **Rate** link is not shown, because with negatives off the
  rating form has nothing the button has not. On, the Rate link comes
  back beside Thanks, leading to a form that can also rate somebody down
  and say why.
- **Require a comment** (`reputation.comment_required`) — off by default,
  and turning it on removes the Thanks button: one press cannot carry a
  reason, so a board that requires one is a board where every rating goes
  through the form. That is the right trade for a board that allows
  negatives, and the wrong one for a board that only allows thanks. (If
  you are upgrading: this default used to be on — see
  [Upgrading](./upgrading.md#defaults-that-changed).)
- **Posts required before rating** (`reputation.min_posts_to_give`) — 5
  by default. A spam defence: registering takes seconds, posting five
  times on a moderated board does not. 0 turns it off.
- **Ratings per day** is per *group*, on the group's own screen, not
  here — a number that should differ between a new member and a
  moderator (`0` means unlimited, as always).

A member's total is **derived, not incremented**: it is recomputed from
the live ratings every time one is written, changed or withdrawn. A
withdrawn rating really leaves, and a total that has drifted repairs
itself the next time anybody rates that member. Editing
`users.reputation` by hand therefore does nothing lasting — use **Recount
& rebuild** on `/admin/system` if you need it corrected.

## Member state and bans

An account's **state** — active, or awaiting activation — and a **ban**
are two different things in two different places. The state is a column
on the account; a ban is a record with a reason, an expiry, and the group
the member held before it. Banning through `/admin/users/[id]` writes the
record; it does not flip the state column.

Because of that, the state form on the member's screen is not shown while
a ban is in force — and the server refuses the change too, by looking for
an unlifted ban record rather than the word "banned" in the column, so a
request sent straight to the action gets the same answer the screen
gives. Lift the ban and the form comes back. Issuing a ban *from* the
state form is refused outright: bans belong to the ban screen, the only
path that records who, why, and what to restore.

## Pruning dormant accounts

`/admin/users/prune` closes accounts in batches: a registration date,
optionally a "not seen since" date, optionally only accounts still
awaiting activation. It **closes** rather than deletes — the row stays,
with `deleted_at` set — so a wrong date is recoverable.

The screen previews before it acts, and the preview and the execution are
built from the same predicate, so what you were shown is what gets
closed.

Four exclusions are unconditional, and none of them is a checkbox:

- **Anybody who has written anything.** Not "anybody with a post count" —
  the count only tracks posts the board currently shows, and a member
  whose only contributions are held or removed has still posted. The
  prune looks for the posts and threads themselves, whatever their
  state.
- **Anybody in a staff group** — the staff switch, *or* any group
  carrying administrative or moderation power, held as a primary group
  or a secondary one.
- **Any forum moderator**, whatever group they are in.
- **Any banned account**, whether the ban is a state on the account or an
  unlifted record. A lifted ban does not protect an account.

## Mail

Mail is the one subsystem a new board gets wrong silently. Nothing
errors: the password-reset form says "check your inbox", the confirmation
link is written to a log, and the member waits. So it is asked for on the
installer and provable from the control panel, rather than being an
environment variable somebody sets after going live.

### Two places to configure it, and which one wins

| Where | How | When to use it |
|---|---|---|
| **The board** — `/admin/settings?group=mail` | Stored in the settings table. Takes effect on the next message, no redeploy. Has a **Send a test message** button. | The default, and what the installer writes. |
| **The environment** — `MAIL_DRIVER` and friends | Read at boot. Overrides the board entirely. | When the credential must not live in the database, or the deployment is configured wholly from files. |

The rule is one line: **`MAIL_DRIVER=http` or `MAIL_DRIVER=smtp` in the
environment wins outright.** Anything else — `log`, or unset — hands the
decision to the board's own settings. When the environment wins, the
settings screen says so rather than pretending its fields are live.

### What sends mail, and when

| What | When | How it goes out |
|---|---|---|
| Notification e-mail | A member's notification, when they asked for it by mail | Queued — leaves on the **tick** |
| Mass mail | An administrator sends one from `/admin/users/mail` | Queued — leaves on the **tick** |
| E-mail change confirmation | A member changes their address in the UserCP | Sent during the request |
| Registration confirmation | A registration, when the activation method asks for one | Sent during the request |
| Password reset | Somebody uses the "forgot your password" form | Sent during the request |

The split is deliberate. The first two go to members the board already
knows, in volume, and can wait a minute. The last three go to somebody
sitting in front of a screen who will retry within seconds — and two of
the three go to an address the board has not proven yet.

### What the messages look like

All five are rendered by one template, so a member sees the same board in
their inbox that they see in a browser. Every message carries a plain-text
part and an HTML one; a client that refuses HTML — or a member who has
turned it off — still gets a complete, readable message with every link
spelled out in full.

The template takes three things from the board and nothing from anywhere
else:

| What it takes | Where it comes from |
|---|---|
| The name in the masthead and the `[Board] …` subject prefix | `board.name` |
| The logo above the message | `board.logo_light` and `board.logo_dark`, addressed absolutely off the board's address |
| Every colour, the type stack and the corner radius | The tokens of the theme that is **default on the board** — the one claiming default in `/admin/themes`, not the one the deployment was built with — with an administrator's token overrides applied on top |

**The colours are converted to sRGB hex when the message is built.** The
board stores tokens in OKLCH, which no mail client parses; converting at
send time means a recoloured theme reaches the next message without a
redeploy, and a token nothing can convert falls back to the default
theme's own value rather than to nothing.

**Dark mode is a `prefers-color-scheme` block carrying the theme's dark
tokens.** Apple Mail, iOS Mail and Thunderbird honour it. Gmail and
Outlook ignore it and get the light design, which is correct on its own —
so the light palette is the one to check first when a colour looks wrong.

**A logo reaches mail only when the board's address is set**, because a
message has no origin of its own to resolve `/logo/light` against — see
[the board has to know its own
address](#the-board-has-to-know-its-own-address). An **SVG logo is
skipped**, because most clients will not draw one, and so is any image
for a recipient who has images blocked. Either way the masthead falls
back to the board's name as text, which is what the logo's alt text says
anyway.

Mass mail is the one message an administrator writes themselves. Its
subject and body are sent as typed — the template only wraps them in the
board's chrome and adds one line naming the board underneath.

### Choosing a transport

| Transport | What it does |
|---|---|
| Not sending (`log`) | Writes `mail (not actually sent)` to the log with the recipient and subject. Delivers nothing. The default. |
| **SMTP** | Speaks SMTP to any server. Reaches every provider and every mailbox host. |
| **Provider API** (`http`) | Posts Resend's JSON body with a Bearer token. Works for Resend and anything that copies its API. |

### The shortest path: the mailbox you already have

If you already receive mail on your domain — Fastmail, Migadu, Google
Workspace, your host's mailbox — use SMTP against it. It is the only
option with **no DNS work at all**, because SPF and DKIM are already
published for that domain; every provider below needs new records before
it will deliver to anybody.

On `/admin/settings?group=mail`:

```
How mail is sent:  SMTP server
Sender address:    an address on that domain
SMTP host:         your provider's SMTP host
SMTP port:         465            (or 587)
SMTP security:     Implicit TLS   (or STARTTLS, for 587)
SMTP username:     your mailbox address
SMTP password:     an app password — never the password you sign in with
```

Mailbox providers rate-limit sending (Workspace is around 2,000 messages
a day), which is ample for a forum and not for a newsletter.

### Resend, copy-pasteable

Free for 3,000 messages a month, and the provider the `http` transport
was written against. On the installer, pick **Resend (API)** and give it
the sender address and the API key. On `/admin/settings?group=mail`
afterwards:

```
How mail is sent:  Provider API
Sender address:    noreply@yourdomain.com
API endpoint:      https://api.resend.com/emails
API key:           re_…
```

Or the same account over SMTP: host `smtp.resend.com`, port 465, implicit
TLS, username the literal word `resend`, password the API key.

If the credential must not live in the database, the environment says the
same thing and overrides both — at the cost of a redeploy to rotate it:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@yourdomain.com
```

Two things will bite before the first message arrives:

1. **Verify the sending domain with the provider first.** Every provider
   requires it, the board cannot do it for you, and until it is done a
   new account can usually only mail the address you signed up with.
2. **The sender must be an address on that verified domain.** If not,
   every message is rejected — which the driver reports as a
   configuration error and does not retry, because it would fail
   identically every time.

### SMTP, in the environment

```sh
MAIL_DRIVER=smtp
MAIL_SMTP_HOST=smtp.provider.example
MAIL_SMTP_PORT=465
MAIL_SMTP_SECURITY=tls          # tls | starttls | none
MAIL_SMTP_USERNAME=…
MAIL_SMTP_PASSWORD=…
MAIL_FROM=noreply@yourdomain.com
```

`MAIL_SMTP_HOST` and `MAIL_FROM` are required; the username and password
must be set together or not at all, since a relay on the same machine
legitimately needs neither. Boot fails naming whatever is missing.

**Security is three values, and this is the setting people get wrong.**
`tls` is implicit TLS — the socket is encrypted before the first byte,
which is port 465. `starttls` connects in the clear and upgrades, which
is port 587 — and the board refuses to continue if the upgrade fails,
rather than sending your password in plaintext. `none` is genuinely
unencrypted, for a relay on this machine and nothing else. A mode that
disagrees with the port produces a connection that hangs instead of
failing, which is the single most confusing way for this to go wrong.

### Other providers

Brevo (~300/day free), Postmark (excellent deliverability, 100/month
free), Mailgun and Amazon SES all speak SMTP, so all four work as-is. The
installer carries prefilled presets for Brevo, Postmark and SES; for
anything else pick *Any other SMTP server* and type the host. A preset is
a convenience, not an integration — nothing behaves differently without
one.

The **provider API** transport is Resend-shaped, not a general client. It
posts:

```json
{ "from": "…", "to": "…", "subject": "…", "text": "…", "html": "…", "reply_to": "…" }
```

Resend's `POST /emails` takes exactly that. Postmark and Mailgun do not —
use their SMTP hosts instead; that is what the SMTP transport is for.

### Prove it, rather than assuming it

`/admin/settings?group=mail` has a **Send a test message to me** button.
It sends through the configuration the board has *saved* — so save
first — to the address on your own account, and shows the provider's own
refusal verbatim when there is one. "The domain example.com is not
verified" is the whole answer; a tidier message would not be.

The installer goes further: it sends the test **before the first
migration** and refuses to install if it fails, so a wrong API key costs
a retry rather than a sealed board that cannot mail anybody.

### The settings behind the screen

The screen is generated from the setting registry, so every field is a
key `community settings:set` can write. That matters exactly once: **when
mail is broken and the panel is not reachable**, which is the same
situation as being locked out, because password reset is the thing mail
was going to fix.

| Key | Field | Notes |
|---|---|---|
| `mail.transport` | How mail is sent | `log`, `smtp` or `http` |
| `mail.from` | Sender address | Must be on the verified domain |
| `mail.from_name` | Sender name | Empty sends the bare address |
| `mail.smtp_host` | SMTP host | |
| `mail.smtp_port` | SMTP port | 465 for `tls`, 587 for `starttls` |
| `mail.smtp_security` | SMTP security | `tls`, `starttls` or `none` |
| `mail.smtp_username` | SMTP username | Both credentials, or neither |
| `mail.smtp_password` | SMTP password | Stored as a secret — never echoed back |
| `mail.http_endpoint` | Provider API endpoint | Only for the `http` transport |
| `mail.http_token` | Provider API key | Stored as a secret |

```sh
community settings:set mail.transport smtp
community settings:set mail.smtp_host smtp.provider.example
community settings:set mail.from noreply@yourdomain.com
community task:run                     # run the tick once, so queued mail leaves now
```

The two secrets are write-only: the panel renders them as empty password
boxes, and a blank box means *unchanged* rather than *clear it* —
otherwise every accidental save of the mail page would wipe the key. Once
a secret is stored, a **Clear the stored value** tick-box appears under
its field; ticking it wins over anything typed in the same submit.
`community settings:set mail.http_token ''` does the same from the
command line.

### Who a mass mail reaches

`/admin/users/mail` sends to everybody, or to one group. Either way it
reaches only accounts that are **active, not closed, and have a verified
address** — an unverified address is as often a typo as it is the
member's.

The **Send to** list carries the size of each audience beside it, counted
with the same rules the send uses, so the figure beside a group is how
many messages choosing it will queue. A group counts primary and
secondary members, each member once. The numbers are counted when the
page renders — the screen carries no JavaScript — so reload for a fresh
count. Each 500-recipient batch is recorded in the admin log.

### Queued mail needs the tick

Notification and mass mail are delivered by a job on the tick. A stopped
tick means no mail and **no error anywhere** — the messages sit in the
queue looking fine. `/admin/system` says loudly when the tick is stale;
see [nothing happens on a schedule](#nothing-happens-on-a-schedule).

The three request-time sends — password reset, e-mail change,
registration confirmation — do not wait for it. So "the reset arrived but
the digest did not" points at the tick, and "nothing arrives at all"
points at mail.

### Sender name and sender address are different settings

The address is `mail.from` (or `MAIL_FROM`); **Sender name** is the
display name beside it. Together they become
`"The Townland" <noreply@yourdomain.com>`; with the name empty — the
default — messages go out as the bare address. The address has to be on a
domain your provider has verified, so getting it wrong means nothing is
delivered; the name is only what people see in their inbox. The name is
read per message, not at startup, so renaming your board changes the next
message rather than the next restart.

### Activation and mail

`registration.method` under **Settings → Registration** chooses what a
new account must do before it can sign in:

| Method | What happens |
|---|---|
| `none` | The account works immediately. |
| `email` | A confirmation link is sent; until it is followed, the account cannot sign in. |
| `admin` | The account waits for an administrator. No mail involved. |
| `both` | The link first, then an administrator. |

The default is `none` — because a board that has not configured mail
sends nothing, and asking for confirmation out of the box would mint
links it cannot deliver. Choose anything else *after* mail works, which
is one button away rather than a redeploy away.

> [!IMPORTANT]
> **`email` or `both` on a board with no working mail is a board nobody
> can join.** The links are minted, printed to the log, and never
> delivered. This cannot be a boot check — mail and the method are both
> settings you can change on a running board — so the registration
> settings screen and `/admin/system` both say so, loudly, while it is
> true.

An account stuck at "awaiting activation" can be activated by hand from
its member screen in `/admin/users`. Somebody who never received their
link can ask for another at `/verify/resend`, linked from the sign-in
page.

### What happens when a provider fails

- **A rejection that will not change** — a bad address, an unverified
  domain, a bad token — is treated as configuration and **not retried**,
  because it would fail identically every time.
- **A transient failure** — a 5xx or 429 over HTTP, a temporary SMTP
  refusal, a refused connection — is retried by the queue's backoff for
  queued mail. A greylisting relay answering "try later" is the case this
  exists for. A request-time send has no retry: the member asks again.
- **Every send is bounded by a timeout**, including each stage of an SMTP
  conversation. Without one, a host that accepts the connection and never
  greets — the classic symptom of a port that disagrees with the security
  mode — would hold a job's lease for its full duration on every attempt.
- **A failed send never fails the thing that caused it.** A registration
  whose confirmation could not be sent still created the account —
  reporting "registration failed" would be a lie about a state you now
  have to live with — and the screen it lands on offers to send the link
  again.

### The board has to know its own address

Every message that carries a link — confirm your address, reset your
password, a notification pointing at a post — builds it from the board's
own origin, because nothing in a queued job knows the request that caused
it. So do feeds, sitemaps and canonical URLs.

This used to be `APP_URL` and nothing else, which made it the single most
likely misconfiguration on a new board. It is asked for at install time
now and lives at **Board address** (`board.url`) on
`/admin/settings?group=board`, changeable without a redeploy. `APP_URL`
still wins when set, on the same rule as mail, and the settings screen
says so.

With neither set, the board does **not** emit a relative link, which
would be a dead string in a mail client. Mail degrades to written
instructions — polite, and useless — and feeds and canonical URLs fall
back to a localhost origin, which is obviously wrong rather than subtly
wrong.

The address is an **origin** — scheme, host, optional port, nothing else.
`https://forum.example/board` is rejected by the settings screen on the
way in. `APP_URL` is checked more loosely — only that it is a URL — so a
path pasted into the environment is the one place this mistake can still
get through.

## Spam and rate limits

Registration questions live at `/admin/antispam`; the numbers are in
`/admin/settings` under **Anti-spam**.

Most of it ships switched off — a fresh board has no spam on it, and a
feature that arrives switched on introduces itself by breaking your
registration form. What ships on is what no human ever notices: the
hidden-field trap, a three-second minimum fill time, and the four
pre-authentication limits below.

### What each control is worth

| Control | Stops | Costs a real visitor |
|---|---|---|
| Hidden-field trap | Bots that fill every field | Nothing. Leave it on. |
| Minimum fill time | Instant submissions | Occasionally somebody with a password manager. Keep it to a few seconds. |
| A question challenge | Scripted registration | A moment, every time. Switch it on when you have a problem. |
| Hold first posts | Nearly all forum spam | One wait per genuine new member. |
| Hourly limits | A night's work by one script | Nothing, set sensibly. |
| The four auth limits | Signup floods, reset-mail bombing, password spraying | Nothing. They ship on. |

> [!TIP]
> **Holding a new member's first posts is the effective one.** Spam
> accounts post once or twice and never come back, so a threshold of two
> or three catches most of it. Held posts go to the moderation queue like
> anything else.

### The limits on pages nobody has signed in to

The hourly limits above are about members posting. Four more sit on the
pages a visitor reaches before they have an account, and unlike the rest
of this screen they **ship switched on** — each closes a hole that costs
nothing to keep shut:

| Setting | Default | Counted per | What it stops |
|---|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour | requesting /24 | A script working through a list of usernames. Independent of the challenge, so it covers the default board, which has none. |
| `antispam.reset_per_hour` | 5/hour | target e-mail address | Somebody using your reset form to mail-bomb one person. |
| `antispam.reset_ip_per_hour` | 20/hour | requesting /24 | The same caller working through a list of addresses, probing which have accounts. |
| `antispam.login_ip_attempts` | 100 per lockout window | requesting /24 | **Spraying** — one guess each against a thousand accounts, which trips no per-account counter. |

The reset form answers identically whether it sent a mail, declined to,
or refused on a limit — a form that says "too many requests for that
address" has confirmed the address has an account.

The login limit shares the lockout window with the per-account counters
(`security.lockout_minutes`) and, like them, is **cleared by a successful
sign-in** from that address — a household behind one address is not
locked out by one member's bad afternoon. That also means a caller who
holds one valid account can clear their own counter, which is why the
number is a backstop against volume rather than a wall.

Set any of them to `0` to switch it off. The one to look at is the first,
and only if your members share an address — a school, an office, a
conference: ten accounts an hour from one /24 is generous for a board and
low for a lecture hall.

### The three login counters

A failed sign-in is counted three times over, and the three answer
different attacks. Two live on the **Security** screen and the third
above, on Anti-spam, because it is a volume control rather than an
account one:

| Counter | Setting | Default | Trips when |
|---|---|---|---|
| Per account, per address | `security.max_login_attempts` | 5 | Somebody guesses at one account from one place |
| Per account, everywhere | `security.max_account_login_attempts` | 50 | The same guess is spread over many addresses |
| Per address, any account | `antispam.login_ip_attempts` | 100 | One address sprays single guesses across many accounts |

All three are measured over `security.lockout_minutes` (default 15) and
all three are cleared by a successful sign-in. The middle one is the
uncomfortable one: it locks the **real owner** out too, which is the
price of it working at all against a botnet. Keep it well above the
per-address number — and remember that a genuinely locked-out member can
still reset their password; the reset form is a separate door with limits
of its own.

### Limits and the flood interval are different controls

| | What it bounds | What it stops |
|---|---|---|
| Flood interval (`posting.flood_seconds`, default 15) | The minimum gap between two actions | A double-click |
| Hourly limit | How many actions in an hour | A script posting steadily all night |

A script satisfies any interval you would be willing to set — every 31
seconds, all night, is thousands of posts and never breaks the rule. Use
both. Members with **bypass flood check** are exempt from both — but not
from [`maxPostsPerDay`](#the-daily-post-allowance), which is a group
permission rather than a board setting.

Limits are counted in the database, so every instance of your board
shares one allowance. The counters are pruned hourly by the tick.

### The upload allowance covers both kinds of upload

`antispam.upload_per_hour` is one bucket per member, and both things a
member can upload spend from it: files attached to a post (one unit
each), and a new avatar (one unit when the image is accepted). Replacing
an avatar six times in an hour costs exactly what attaching six files
does. Removing an avatar spends nothing, because it uploads nothing.

### If registration stops working

Check `/admin/antispam` first:

- A question challenge switched on with **no question configured** does
  nothing rather than refusing everybody — deliberately, and the screen
  says so.
- A **minimum fill time** set to a minute quietly turns away most real
  applicants. This is the usual culprit.

If registrations are *created* but nobody can sign in afterwards, it is
not anti-spam — it is the activation method waiting for mail the board
cannot send. See [activation and mail](#activation-and-mail).

### No hosted captcha

Not because it is hard: a hosted captcha means every visitor's browser
contacting a third party before they can join your board, which is a
decision about your members rather than a setting. The provider seam
(`CaptchaProvider` in `packages/antispam`) is there if you want one — a
small module, not a fork.

## Search

### Switching search off

**Enable search** (`search.enabled`, in the search group) decides whether
the board answers searches at all. Off is what you reach for when search
is what is loading your database, or when a board is small enough that
browsing is the better answer anyway:

```sh
community settings:set search.enabled false
```

Off, three things change together:

- The **Search** link goes from the board navigation.
- **`/search`** and any results page somebody still holds a link to say
  search is switched off, rather than rendering a form or a result set.
- **`GET /api/v1/search`** answers 403 with the same message. The route
  is why hiding the form is not enough: a token carrying the `search`
  scope reaches it directly.

**The index is kept, and goes on being maintained** — new posts are still
indexed and `search.reindex` still runs on the tick — so switching search
back on needs no reindex and no restart. Nothing else keys off this: a
board with search off still has its forums, its feeds and the rest of the
REST API.

### How short a search may be

**Shortest word a search may rest on** (`search.min_word_length`, default
2) is the one dial on what the board will agree to look for:

```sh
community settings:set search.min_word_length 3
```

The rule is *at least one word*, not *every word*: a search is refused
when every word in it is shorter than the setting, and a search with one
long-enough word runs, short words included. At 3, `a good post` runs and
`a b c` does not.

The short words are not dropped by the board — they go to Postgres, which
drops the ones that carry no meaning (`the`, `a`, `of`) and keeps the
rest, so `a C++` and `is it OK` search for what they say. The setting
exists to refuse a search that is *nothing but* noise, which is the shape
that scans the whole index and finds everything.

It applies to `/search` and to `GET /api/v1/search` alike, and both name
the configured number when they refuse, so a member is told what would
work rather than just being told no. Raise it to 3 if your slow searches
turn out to be short words; set it to 1 to refuse nothing but an empty
box.

## The system screen

`/admin/system` is where the board's maintenance buttons live. Each one
reports what it did, and each one is expected to have done it.

- **Clear cache** offers the forum tree, and only the forum tree — the
  only global cache entry that outlives the write that changed it and is
  not already invalidated by it. Everything else the board caches
  globally (settings, group colours, the compiled word filter, theme
  styles) is cleared by the admin screen that changes it, so the only
  reason to press this is a tree that looks stale after something changed
  it from *outside* the panel — a direct database edit, a restore, an
  import.
- **Permissions are not cached and never were**, so there is nothing to
  clear. Rights are resolved from the group defaults and forum overrides
  on every request; the `cache_versions` counter that permission writes
  bump is a version stamp on that per-request resolution, not a cache. A
  member who still cannot see a forum is not looking at a stale cache —
  see [below](#a-member-cannot-see-a-forum-they-should).
- **Recount & rebuild** recomputes the derived numbers (post counts,
  reputation totals, last-post columns). It is batched, resumable, and
  safe on a live board.
- **Retry a dead-lettered job** requeues one job by id, and only a job
  that is actually dead: an id that names nothing, or a job that is
  pending, running or done, is refused rather than reported as success.
  The reason a job died is usually still true, so read its last error
  before retrying.

### The admin log

`/admin/log` is the whole table: administrative and moderation actions
share it, so the control panel's log is the superset and the ModCP's is
the same rows filtered to moderation actions in the forums a moderator
holds. The **Action** dropdown is built from the distinct actions
actually recorded — an action nobody has performed yet is not offered,
and appears the first time it happens.

How somebody *got in* is not here: sign-ins, refused attempts, second
factors and sessions revoked are a separate record with its own screen at
`/admin/security` — **Sign-in activity** — described in
[signing in](./single-sign-on.md#what-has-happened-to-an-account). The two
are deliberately apart: this log records what was done by somebody already
inside, that one records how they got in. It keeps every entry forever
unless **Days of sign-in activity to keep** says otherwise.

Two things are on the screens but not in the table, and knowing which is
which saves an investigation: a member editing or deleting **their own**
post writes no row (the row appears when somebody else does it to them),
and a report's assignment — a moderator taking it, or putting it back —
lives on the report's own timeline, because it changes nothing about the
board. Everything else a moderator or administrator does leaves a row,
including each 500-recipient batch of a mass mail. See
[MyBB parity](./mybb-parity.md#everything-that-changes-something-is-logged-and-nothing-that-does-not)
for the full accounting.

## Migrations

Migrations are **forward-only**. There is no down migration and there
will not be one: a migration that drops a column is a data-loss button on
a live board, and some migrations cannot be reversed at all — a "roll
back" that worked for half of them and silently did nothing for the rest
would be worse than its absence.

```sh
community migrate      # core only
community upgrade      # core, then each installed plugin's, then record the version
```

The admin panel shows a notice when the deployed code is ahead of the
database. The full procedure — including how far you can jump between
versions — is [Upgrading a board](./upgrading.md).

## Backup and restore

> [!IMPORTANT]
> **The backup is the rollback plan.** Migrations are forward-only, so
> restoring is the only way back. This is not a precaution, it is the
> recovery procedure — which is why it is worth rehearsing before you
> need it.

### What to back up

Two things, and only one of them is the database:

1. **The database.** Accounts, posts, settings, permissions, theme
   overrides — everything the board knows.
2. **Uploaded files**, if your file driver is local disk. On S3 the files
   are already elsewhere, and the bucket has its own backup story.

The code is in git. Your `.env` values — or the secrets your panel
generated — are worth a copy somewhere you can reach when the machine is
the thing that is broken.

> [!WARNING]
> **A scheduled database backup is not a backup of the board.** Coolify's
> per-resource schedule dumps Postgres and does not touch the uploads
> volume, so a restore from it gives you every post and a broken image in
> each of them. Whatever takes the database, something has to take the
> volume too.

### Taking one

```sh
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > board.dump
```

From a container deployment, where `pg_dump` lives in the database
container rather than on the host:

```sh
docker compose exec -T postgres pg_dump -U community community | gzip > board-$(date +%F).sql.gz
docker run --rm -v meith_uploads:/u -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

Check the volume's real name with `docker volume ls` first — Compose
prefixes it with the project directory, and Coolify with the resource's
UUID. Then put both in a cron and **copy them off the machine**: a backup
on the server is a backup of the thing most likely to fail.

`--format=custom` restores selectively and compresses. `--no-owner` and
`--no-privileges` because the role names on a managed platform are not
the ones you will restore into.

> [!WARNING]
> **Use the direct connection string for a dump, not the pooler.** A
> transaction pooler does not support the session-level operations
> `pg_dump` needs, and the failure is confusing: a dump that starts and
> then stops.

### Restoring

```sh
createdb community_restored
pg_restore --no-owner --no-privileges --dbname="$RESTORE_URL" board.dump
```

Restore into a **new database** first and point a staging deployment at
it. A restore over a live database is how a bad backup becomes two lost
boards.

Then check three things, in order:

1. `select count(*) from posts;` — is the content there?
2. Sign in as an administrator — did the credentials survive?
3. `community migrate` — it applies anything missing and reports what it
   did; on a good restore it says there was nothing to do.

### Rehearse it

A backup nobody has restored is a file, not a backup. Restore one into a
scratch database before you need to, and note how long it took: that
number is your recovery time, and an incident is the wrong moment to
learn it.

## Connection pooling

**Running the documented deployment? Skip this section.** A board on its
own Postgres, with a fixed number of server processes in front of it,
opens a bounded number of connections and needs no pooler.

This section is for a board pointed at a *managed* database — Neon,
Supabase and their kind.

> [!CAUTION]
> **This does not break during testing.** Managed providers hand out two
> connection strings, and the difference only shows under load: on the
> direct one, every process that scales up opens its own connection,
> Postgres runs out at around a hundred, and the board that worked
> perfectly while you were the only visitor starts refusing connections
> on its first busy day — with an error that names the database rather
> than the cause.

**Use the transaction-mode pooler string** (on Supabase, port `6543`, not
`5432`). Two consequences:

- **Prepared statements are off.** A transaction pooler hands a different
  backend to each transaction, so a prepared statement from one is not
  there for the next. The database layer is configured for this; a plugin
  issuing raw SQL should be too.
- **`pg_dump` and migrations want the direct URL.** Both need
  session-level state. The migration runner takes a session-level advisory
  lock so two deploys migrating at once queue instead of colliding, and a
  transaction-mode pooler cannot hold one. Set `DIRECT_DATABASE_URL` for
  migrations when your provider offers both strings; the runner prefers it
  over `DATABASE_URL` whenever it is set.

## Troubleshooting

### Nothing happens on a schedule

*Bans do not expire, digests do not send, counters drift, uploads are not
swept — and nothing errors, because nothing ran.*

1. Check `/admin/system`. The tick's status is there, and a stale one is
   called out loudly.
2. Check something is actually running the tick. **On the documented
   deployment that is the `worker` container**, which runs the loop
   in-process — it does not call the tick route and does not need
   `TICK_SECRET` to do its job. `docker compose ps` should show it up,
   and `docker compose logs worker` should show `worker started` **once**
   rather than every few seconds, which is a crash loop with the reason
   logged above each restart.
3. If instead you drive the tick from outside — a cron, a platform
   scheduler, the `curl-tick` sidecar — the route
   (`GET /api/system/tick`) is what runs it, and `TICK_SECRET` must be
   set *and* presented. A caller with the wrong secret gets a 404,
   deliberately, so an unauthorised caller cannot confirm the endpoint
   exists — from the caller's side that looks identical to a wrong URL.

4. A task that is running is not a task that is late. Each one declares a
   budget; when it is spent, the tick tells the task to stop, and the ones
   that can (the queue drain, both subscription tasks) finish the unit they
   are on and leave the rest for the next tick — `task overran` in the
   worker log is that happening, and points at work arriving faster than
   one tick can clear. The whole tick has a five-minute ceiling of its own,
   logged as `tick overran`; the worker waits for it rather than starting
   another on top.

Notification and mass mail are delivered on this tick, so a stopped one
is also a board that has stopped sending them — see [Mail](#mail).
Verification and password-reset links do not wait for it; if *those* are
missing, mail itself is what to check, and the **Send a test message**
button settles it in one click.

### The installer's migrate step cannot find `meta/_journal.json`

The migrator is looking in the wrong place. The migration SQL is data, so
Next never traces it into the standalone build output — the Dockerfile
copies it to `/app/migrations` instead, and a build where that copy did
not happen leaves the web server with no migrations to apply.

Check the folder is in the image
(`docker compose run --rm web ls /app/migrations`) and rebuild if it is
not. If your deployment keeps the SQL somewhere else, name it with
`MIGRATIONS_DIR` and redeploy. Nothing has been written when this fails —
migrations are the installer's first step, so a retry is safe.

### "Too many connections"

See [connection pooling](#connection-pooling). It is almost always the
direct connection string on a managed database.

### The admin panel 404s

Three possibilities, in order of likelihood:

1. `ADMIN_IP_ALLOWLIST` is set and your address is not in it. The panel
   answers 404 rather than 403 from outside the allowlist — its value is
   being invisible.
2. Your account is not in a group with `admincp.access`.
3. Your admin session expired. It has a 30-minute idle timeout and an
   8-hour ceiling, both separate from your board session.

### A member cannot see a forum they should

Open `/admin/forums` for that forum and read **the row for their group**
rather than reasoning about the combination. Each cell says what it
resolves to and where it inherited from. The usual cause is an explicit
deny somewhere up the tree, which inheritance carries down.

### Counters look wrong

`/admin/system` → **Recount & rebuild**. It is resumable and safe on a
live board. If they drift *again* afterwards, the outbox is not being
drained — see [the tick](#nothing-happens-on-a-schedule).

### An imported board's old links 404

`board.legacy_redirects` is off by default; turn it on at
`/admin/settings`. It needs an import to have run, because the redirect
is a lookup in the legacy id map.

Switched on, it answers the shapes a MyBB board publishes:

| Old address | Goes to |
|---|---|
| `showthread.php?tid=91`, `Thread-Bikeshedding-91` | the thread |
| `showthread.php?pid=4102`, `Thread-Bikeshedding--4102` | the post |
| `forumdisplay.php?fid=3`, `Forum-General-3` | the forum, slug and `?page=` carried |
| `member.php?uid=12` | the member |
| `index.php` | the board index |

The answer is a **308** — `permanentRedirect()` — which search engines
treat exactly like a 301, so an imported board's ranking follows.

Two shapes are deliberately not answered: `Thread-Bikeshedding-page-2`
carries no id, and picking a thread from the words in a slug would be
guessing; `User-wren` is a username rather than an id, and a username can
change hands, so resolving one could point an old link at the wrong
member.

### Everything is broken and the panel will not load

The CLI does not need the web app:

```sh
community env:check       # is the environment valid? (no connection is opened)
community settings:list   # what the board thinks its settings are
community task:list       # what is scheduled, and how often each runs
community migrate         # apply anything the schema is missing
```

`community --help` lists everything else.

### Getting help

The board's 404 page and every API error body carry a **request id**, and
the board's logs are correlated by it — quote it, and "a page broke"
becomes one grep.
