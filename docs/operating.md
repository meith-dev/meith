# Running a board

The operator handbook: everything from the day after you install to the day
something goes wrong. Written for somebody who has not read the source and is not
going to.

Installing for the first time? Start with the [Quickstart](./quickstart.md).

## Configuration

Settings live in three places, and which place a setting lives in tells you what
changing it costs.

| Where | What lives there | Changing it costs |
|---|---|---|
| Environment variables | Secrets, and anything needed before the board can read its own database. | A redeploy |
| `community.config.ts` | What is *installed*: themes and plugins. | An edit and a redeploy |
| `/admin/settings` | Everything else: board name, registration mode, posting limits, search, mail. | Nothing — it takes effect immediately |

**Why the split.** Anything in `community.config.ts` has to be visible to the
bundler, because a production build contains only what it could see statically.
So "install a plugin" cannot be a database row. Anything in `/admin/settings` is
a value the running board reads, so it can change without a deploy.

**Two things live in the overlap, on purpose.** Mail and the board's own address
are ordinary settings *and* environment variables, and when both are present the
environment wins outright — the screen says so rather than accepting an edit it
would ignore.

They are there because each has two legitimate owners. A board installed by one
person on one server wants to configure mail on the day they need it, from a
screen, without a redeploy; a deployment built from files in a repository wants
its credentials in the environment where the rest of them are, and wants the
panel unable to change them. Neither is the wrong answer, so both work, and the
precedence rule is one sentence rather than a per-field table.

The trade is explicit: a credential stored on the board sits in the `settings`
table, readable by anything with database access, and one in the environment
takes a redeploy to rotate. The registry marks the stored ones as secrets, so
they are never rendered back into a page or written to the audit log — which is
not the same as encrypted, and is worth knowing before choosing.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | For a real board | On a *managed* database, use the transaction-mode pooler string. See [connection pooling](#connection-pooling). |
| `AUTH_SECRET` | Yes | Signs the unsubscribe links in outgoing mail. Sessions do not depend on it — they are random tokens stored hashed — so rotating it signs nobody out. No default, deliberately. |
| `TICK_SECRET` | Yes, in production | Guards `/api/system/tick`: with it set, a caller without it gets a 404. It is **not** what drives the tick on the Docker Compose stack: the `worker` container runs the loop in-process and never calls the route, so scheduled work happens there either way — but the board still refuses to boot in production without the secret, so the route is never left open. Only an external caller — a cron, a platform scheduler, the `curl-tick` sidecar — actually presents it. |
| `APP_URL` | No | The board's public origin, absolute and with no trailing slash. Optional since the installer began asking for it: unset, it comes from **Board address** in the settings, and set here it wins — the settings screen still accepts edits but warns they are stored, not read, until the variable is unset. Something has to supply it — a digest sent from the worker has no request to be relative to. |
| `MAIL_DRIVER` | No | `log`, `http` or `smtp`. Optional for the same reason as `APP_URL`: `http` or `smtp` here wins outright, and the mail settings screen warns that what it stores is not used while the variable is set. `log` or unset leaves mail to the board. See [Mail](#mail) for the companions each transport needs. |
| `DATA_SOURCE` | No | `postgres` or `fixture`. Defaults to `fixture` when `DATABASE_URL` is unset. |
| `ADMIN_IP_ALLOWLIST` | No | Comma-separated address prefixes. Empty allows everything. |
| `TRUSTED_PROXY_HOPS` | No | How many proxies sit between the internet and the board. Defaults to `1`, which is the shape [self-hosting](self-hosting.md#5-put-a-proxy-in-front) describes. See [Who the board thinks you are](#who-the-board-thinks-you-are) — getting this wrong is a security setting, not a cosmetic one. |
| `REMOTE_IMAGES` | No | `0`, the default, confines images to this board and `data:` URLs. `1` lets a post embed an image hosted anywhere. See [Images from elsewhere](#images-from-elsewhere). |
| `FILESTORE_DRIVER` | No | `local` or `s3`. Defaults to `local`, which is right for a board with a disk. See below. |
| `MIGRATIONS_DIR` | No | The folder holding the generated SQL and its `meta/_journal.json`. Normally unset — the migrator looks beside `@meith/db` in a checkout and in `/app/migrations` in the image, which is where the Dockerfile puts it. Set it only if yours is somewhere else. |

### Who the board thinks you are

Five things key off a visitor's address: the control panel allowlist, the login
lockout counters, the hourly limits a guest gets, the truncated address written
to the moderator log, and the truncated range recorded against an account when
it registers and each time it signs in — which is what the ModCP's address
lookup and the member search's **IP** filter read. Behind a proxy the board
cannot see the connection — it sees `X-Forwarded-For`, a header each proxy
**appends** its view of the caller to, and which the caller may send some of
themselves.

`TRUSTED_PROXY_HOPS` is how many proxies are in front of the board, and the
board reads that many entries back from the **right-hand** end of the chain.
The right-hand end is the one your own proxy wrote; everything to the left of
the entry it lands on is discarded, because a caller can put anything there.

| Deployment | Setting | Chain the board sees | Address it takes |
|---|---|---|---|
| One reverse proxy — Caddy, nginx, Traefik | `1` (the default) | `<visitor>` | `<visitor>` |
| A CDN in front of that proxy | `2` | `<visitor>, <cdn>` | `<visitor>` |
| No proxy at all, port exposed directly | `0` | anything | none; the header is ignored |

Set it too **low** and allowlisted visitors are read as their proxy. Set it too
**high** and a caller can forge the address by prepending entries of their own
— which lets them walk past `ADMIN_IP_ALLOWLIST`, dodge the login lockout by
appearing to be somebody new on each attempt, and write a false address into the
audit trail. When in doubt, count the proxies and use that number; it is safer
to be one too low than one too high.

At `0` the board resolves no address at all: the allowlist refuses everybody,
guest limits fall back to a single shared bucket, and neither the log nor an
account's ranges record anything.
It warns once per process when a request arrives with a forwarding header it has
been told to ignore.

### Images from elsewhere

A post may embed an image by URL. **By default the board's content policy does
not let the browser fetch it**: `img-src` is this board and `data:` URLs, and
nothing else.

The reason is that a remote image is a beacon. The host serving it learns the
address of every reader who opens the thread and the moment each of them did,
and neither the reader nor the moderator who approved the post has any way to
see that happening. One `![](https://…)` in a popular thread is a readership
log for somebody who does not run your board.

`REMOTE_IMAGES=1` allows them. Turn it on if your board's culture is image
hosts and link dumps and you would rather have the pictures — plenty of forums
would — and know what you are handing out when you do.

Nothing is proxied or cached in between. With the default in place, a post that
embeds a remote image renders as a broken image with its alt text: the URL is
still stored, still valid, and starts working the day the variable is set.
Uploaded attachments are served by the board itself and are unaffected either
way; the one other thing to watch is a **smiley configured with an absolute
URL**, which is a remote image like any other and needs uploading to the board
instead.

### Where uploads go

Avatars, attachments and the board logo all share one store, chosen by
`FILESTORE_DRIVER`.

| Deployment | Setting | Why |
|---|---|---|
| **Local development** | nothing to set | `local`, writing to `.uploads` beside the app. |
| **A VPS (Docker Compose)** | nothing to set | The image creates `/app/.uploads`, declares it a volume and points `UPLOADS_DIR` at it; compose mounts the same named volume into the web and worker services so both see the same files. |
| **A board big enough to want a CDN** | `FILESTORE_DRIVER=s3` | Optional at any size, and the point at which uploads stop being your disk's problem. |

**Wherever you run this, the store must survive a restart.** On a host whose
filesystem is per-instance and ephemeral, `local` does not fail — it *loses*.
The write succeeds, the file is served back from the same warm instance, and it
is a 404 for every other visitor and for you tomorrow. An administrator
uploading a logo sees it work. That is one of the reasons
a board on your own server — the route this project documents — has a real
disk, mounted as a volume, and nothing to think about.

`s3` needs `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY`, and boot fails naming any that are missing. Add
`S3_ENDPOINT` for anything S3-compatible — Cloudflare R2, MinIO, DigitalOcean
Spaces — which switches the client to path-style addressing.

On local disk, the uploads directory is the second thing to back up; on an
object store the bucket has its own backup story. See
[Backup and restore](#backup-and-restore).

### Settings from the command line

`/admin/settings` has everything, but the CLI works when the panel does not —
which is usually the moment you need it.

```sh
community settings:list          # the whole registry, with defaults
community settings:get board.name
community settings:set board.name "The Townland"
```

### Switching search off

**Enable search** — `search.enabled`, in the search group — decides whether
this board answers searches at all. Off is what you reach for when search is
what is loading your database, or when a board is small enough that browsing is
the better answer anyway.

```sh
community settings:set search.enabled false
```

Off, three things change together:

- The **Search** link goes from the board navigation.
- **`/search`** and any results page somebody still holds the link to say search
  is switched off, rather than rendering a form or a result set.
- **`GET /api/v1/search`** answers `403`, with the same message in the JSON
  error body. The route is the reason hiding the form is not enough: a token
  that carries the `search` scope reaches it directly.

**The index is kept, and goes on being maintained.** New posts are still
indexed, `search.reindex` still runs on the tick, and switching search back on
needs no reindex and no restart. Nothing else keys off this: a board with search
off still has its forums, its feeds and the rest of the REST API.

### How short a search may be

**Shortest word a search may rest on** — `search.min_word_length`, default 2 —
is the one dial on what the board will agree to look for.

The rule is *at least one word*, not *every word*. A search is refused when
every word in it is shorter than the setting; a search with one long enough word
runs, and the short ones go to the index along with it. At 3, `a good post` runs
and `a b c` does not.

```sh
community settings:set search.min_word_length 3
```

The short words are **not** dropped by the board. They are passed to Postgres,
which drops the ones that carry no meaning — `the`, `a`, `of` — as part of
building the query, and keeps the rest. So `a C++` and `is it OK` search for
what they say; the setting is there to refuse a search that is *nothing but*
noise, which is the shape that scans the whole index and finds everything.

It applies to `/search` and to `GET /api/v1/search` alike, and both name the
configured number when they refuse, so a member is told what would work rather
than being told no.

The default is 2, which is what this board has always enforced rather than a
number chosen afresh — the setting used to be inert, and moving the default
would have changed every board's search on the day it started being read. Raise
it to 3 if your slow searches turn out to be short words; set it to 1 to refuse
nothing but an empty box.

### Closing registration

**Allow new registrations** — `registration.enabled`, in the registration group
— decides whether strangers may join. Off is the setting to reach for when a
spam wave is faster than your moderators, or when the board is meant to be
invitation-only.

```sh
community settings:set registration.enabled false
```

Off, three things change together, which is what makes it a closed door rather
than a hidden one:

- The **Register** link disappears from the user panel and from the sign-in
  page. Nothing offers a route that would refuse.
- **`/register`** says the board is not taking new members and points at
  `/login`, instead of rendering a form.
- **The action behind that form refuses**, so a submission POSTed straight at it
  is answered with a `403` and creates nothing. Hiding a form is not closing it:
  the registration form's fields are public knowledge, and a spam run does not
  read your navigation.

Signing in, password reset and e-mail confirmation are untouched — the members
you already have are unaffected. A closed board also refuses to open an account
from a federated sign-in, so turning on "sign in with GitHub" does not quietly
reopen the door: see [Signing in without a
password](./single-sign-on.md#what-a-new-account-inherits).

**It never locks you out of your own board.** The installer creates the first
administrator with registration forced open, whatever the settings table says,
and `community user:create` does the same. So a board can be closed to the
public and still gain members, one at a time, from the command line:

```sh
echo "correct horse battery staple" |
  community user:create --username ada --email ada@example.com --group registered
```

> [!NOTE]
> **Upgrading an existing board?** This setting had no effect until recently:
> the switch saved, and registration stayed open however it was set. A board
> that stored `false` closes as soon as it upgrades. See
> [Settings that gained a reader](./upgrading.md#settings-that-gained-a-reader).

### Taking the board offline

**Board offline** — under `/admin/settings`, in the advanced part of the board
group — closes the board while you work on it. It is a switch, not a deploy:

```sh
community settings:set board.offline true
community settings:set board.offline_message "Back within the hour."
```

Every page under the board itself — the index, forums, threads, search, the
member pages, the user and moderator panels — is replaced by a single page
carrying **Offline message**. Left empty, that page falls back to a plain
maintenance line rather than rendering nothing. The board's RSS and Atom feeds
answer `503` with the same text, and the board stops being indexable:
`robots.txt` becomes `Disallow: /` and the sitemap 404s, which is what an
offline board already did before it closed anything.

Three things stay reachable, because otherwise the switch would be a lock with
the key inside:

- **`/login`**, so an administrator who is not signed in can become one.
- **`/admin`**, which is the screen you turn the setting back off from. It has
  its own gate — `admincp.access`, and the password prompt — and always did.
- **`/api/health`**, so whatever is watching the deployment does not report the
  board as dead while you are working on it.

Who gets through is one permission: **can view board offline**
(`canViewBoardOffline`), on `/admin/groups/[id]` like every other board-wide
right. Administrators — anyone whose group carries `isAdministrator` — get
through whether or not the box is ticked, so a board can always be reopened.
Grant it to a group to let, say, your moderators check their work while the
board is closed to everyone else.

> [!NOTE]
> Offline is not a security boundary. It closes the board's own pages; it is not
> a substitute for the forum permissions that decide who may read what.

## The operator CLI

Everything you should not need a browser for: migrations, users, forums,
settings, scheduled tasks, search reindexing. It ships **inside the image**, so
a deployed board needs no checkout, no toolchain and no Node on the host.

How you reach it depends on how the board was deployed:

| | |
|---|---|
| **Coolify** | Open the `web` container's terminal in the panel, then `node apps/cli/cli.cjs <command>`. |
| **Docker Compose** | `docker compose run --rm --no-deps web node apps/cli/cli.cjs <command>` |
| **A checkout** | `pnpm community <command>` |

`--rm` matters on Compose: without it every invocation leaves a stopped
container behind. `--no-deps` matters too — without it, each command re-runs the
whole migration container first, which is harmless and slow enough to be
confusing.

The rest of this page writes **`community <command>`**, which is worth making true
on a Compose board:

```sh
alias forum='docker compose -f ~/meith/docker/compose.yml run --rm --no-deps web node apps/cli/cli.cjs'
```

```sh
community --help                     # everything it can do
community env:check                  # is the environment valid? (it does not open a connection)
community user:create --group admin  # a second administrator, or the first if /install is sealed — password on stdin
community user:promote               # administrator access on a board that already works
community task:run                   # run the tick once, by hand
community search:reindex             # after a large import, to hurry the tick along
```

Search indexes itself. `search.reindex` runs on the tick every ten minutes and
covers every case that leaves a post unindexed — an import, a restored dump, an
upgrade that changed what the index holds. `community search:reindex` does the same
work now instead of over the next few ticks, and runs to completion rather than
one batch at a time; the Admin CP's button is the same thing, one batch per
click. None of the three is a prerequisite for search working.

The commands that exist are the ones `--help` lists. This project does not
document a command it has not written, so one you expected and cannot find is
missing rather than hidden.

## The forum tree

`/admin/forums` draws the tree in the order the board renders it, and that
screen is where the order is decided.

### Moving a forum

Drag a row by its handle to move it: up and down to reorder, sideways to change
how deep it sits. A line shows where it will land, indented to the depth it will
land at, and the row follows the pointer until you let go. Nothing is written
until then.

Each row also carries four arrows — up, down, in, out — and they are not a
consolation prize. They are what a keyboard gets (the handle takes the arrow
keys directly), what a screen reader gets, and what the screen falls back to
with JavaScript switched off, where each arrow is an ordinary form submission.
An arrow with nowhere to go is disabled rather than hidden, so the shape of what
is possible stays visible.

Three rules the screen enforces, because the tree does:

- **A forum takes its subforums with it.** They move as a block and keep their
  order inside it.
- **What lands somewhere new inherits from where it landed.** Moving a busy
  forum under a private category hides the whole subtree; the screen says so
  under the tree rather than after the fact.
- **A link row holds nothing.** Nothing nests inside one, by drag or by arrow.

### Which moves ask for your password again

Reordering under the same parent does not — it changes nothing about who may
read what. Re-parenting does, on the same fifteen-minute rule as everything else
destructive in the panel, because it changes what the subtree inherits.

### Display order

Each forum's **Display order** on `/admin/forums/[id]` is the same number the
tree screen writes. A move renumbers that forum's new siblings densely from
zero, so the numbers never drift into ties; typing one by hand still works and
is the slow way of saying what a drag says.

## Permissions

45 permission fields — 26 resolved per member per forum, 19 board-wide. Every
read path — pages, search, feeds, the REST API — asks the same resolver, so
there is no route that quietly reads around the rules, and every field on the
screen is one some decision reads.

### The three layers

Permissions resolve in this order. Understanding the order is most of
understanding the model.

1. **Group permissions** — the floor. A member's groups are combined, and a
   boolean is granted if *any* of their groups grants it.
2. **The forum matrix** — per forum, per group. Each cell has three states:
   inherit, grant, deny. The three requires-approval cells are requirements
   rather than rights, so their explicit states read *Required* and *Not
   required* instead.
3. **Moderator rights** — per forum, per member or group, granted separately.

> [!IMPORTANT]
> In the forum matrix, **empty means inherit** — it is not the same as "no".
> That is why each cell is a three-state control rather than a checkbox: a
> checkbox writes an explicit value into every cell the first time you save,
> pinning that forum so later changes at its parent do nothing. Silently pinning
> a forum is the commonest way a board's permissions end up wrong.

### A "your threads only" forum

Denying **see threads started by other users** (`canViewOthersThreads`) on a
forum turns it into a support desk: everybody may post, and nobody but its
author reads a thread. It is the control to reach for when the forum collects
applications, appeals, or anything a member should be able to write without the
rest of the board reading it.

Deny is enforced in the query, not in the page, so it holds on every read path:
the thread list, the thread page reached by a guessed URL, search, the RSS and
Atom feeds, the sitemap, the "what's new" and "latest" panels, the board
statistics, the who-is-online location column, attachment downloads, quoting,
and the REST API. A refused thread is a 404, the same answer a thread that does
not exist gives, because a distinguishable refusal is itself an answer.

What a Deny forum looks like:

- **A member** sees the forum in the index and may post in it. In the listing
  they see only the threads they started; every other thread is absent rather
  than locked. On the board index the forum's thread and post counts read `0`,
  its last-post column is blank, and it never shows the unread mark — the
  counts, the last post and the unread mark all describe other people's
  threads, and a forum that will not show them should not summarise them
  either. The forum's own page shows the member's threads.
- **A guest** sees the forum and sees nothing in it. A guest has authored
  nothing, so "your threads only" resolves to no threads at all — including
  threads whose author account was since deleted, which belong to nobody and so
  are nobody's own. Grant the permission to the guest group if a forum is meant
  to be publicly readable.
- **A moderator of that forum** sees everything in it, on the same footing as
  *see unapproved* and *see deleted*: an appointment over the forum carries the
  right, so a support desk stays workable without granting the group permission
  back. Super-moderators and administrators bypass it as they bypass every other
  forum permission, and the bypass is logged.

> [!IMPORTANT]
> Denying this permission does **not** hide the forum. `canView` decides whether
> the forum exists for a viewer and `canViewThreads` whether its threads open at
> all; this one only decides *whose* threads. A forum meant to be invisible
> wants `canView` denied instead.

### Letting members take their own threads down

`canDeleteOwnThreads` is the thread-sized twin of `canDeleteOwnPosts`. Granted,
the member who **started** a thread gets a **Delete thread** button on it, and
pressing it moves the whole thread to `visibility=deleted` — the same reversible
state a moderator's delete produces, not a destruction. It is off by default.

Three things about it are worth knowing before you grant it:

- **It is per forum**, like every other cell in the matrix, so it can be granted
  in a scratch forum and denied in the one that holds your rules.
- **It does not carry the undo.** Restoring a thread is `thread.restore`, a
  moderator right, and it stays that way: a member who deletes their thread by
  accident has to ask. This mirrors `canDeleteOwnPosts`, which has never carried
  `post.restore` either.
- **It takes the replies with it.** A thread is deleted whole, so granting it in
  a busy forum means one member can remove a conversation other people wrote in.
  In forums where that matters, leave it denied and let members delete their own
  *posts* instead.

The tools panel on a thread is headed **Thread tools** for a member who holds
nothing but this, and **Moderator tools** for somebody appointed over the forum.
Bulk deletion from a forum listing is unaffected: that surface is moderators
only, and it stays that way.

### Numbers behave differently from switches

Numeric permissions — attachments per post, signature length, edit window —
combine as the **most generous** value across a member's groups.

> [!NOTE]
> **`0` means unlimited, not none.** A cell showing `0` is not a restriction.

### The daily post allowance

`maxPostsPerDay` is a board-wide numeric permission and it caps **threads and
replies together**, so replying is not a way around a cap set on posting. It is
spent in the write path, on the same counters the anti-spam limits use, which
means every instance of your board shares one allowance rather than getting one
each.

- **`0` is unlimited**, as everywhere else. Because numeric permissions combine
  as the most generous value, a member in *any* group with `0` has no cap —
  which is how you exempt somebody: put them in a group that sets it to `0`
  rather than looking for a bypass switch.
- **The day is a UTC day.** The allowance resets at midnight UTC, not at
  midnight in the board's display timezone, because the counter is a fixed
  window rather than a per-member calendar.
- **Guests are not counted.** The cap is per member id, and a guest cannot post
  in the first place.
- **Bypass flood check does not lift it.** That permission is about the interval
  between two actions and the hourly anti-spam limits, both of which are board
  settings; this one is a grant the group itself carries, so the group's own
  value is what exempts it.

Somebody who has spent their allowance is told so, and told roughly when it
comes back — the message speaks in hours, since "try again in 1,290 minutes" is
not an answer.

### The daily private message allowance

`maxPrivateMessagesPerDay` works the same way for **sending** private messages,
on its own counter: a member who has run out of posts can still send messages,
and the other way round. One send is one unit however many people it is
addressed to, since that is one press of the button.

> [!IMPORTANT]
> **`maxPrivateMessagesPerDay` and `privateMessageQuota` are different
> controls, and the pair is easy to mix up.** The first is a *rate*: how many
> messages a member may send in a day. The second is *storage*: how many
> messages they may keep. A full inbox is the quota; "you have used your
> allowance for today" is the rate. Setting one does nothing about the other.

### Reading the matrix

`/admin/forums` holds it. Each cell shows what it resolves to *and which forum it
inherited from* — "inherit" on its own tells nobody anything.

**Copy to subforums** means *identical*, not *merged*. It clears rows the source
forum does not have, because a descendant that denied something the source
inherits would leave you with two forums you had just been told now match. The
change is previewed cell by cell before it applies.

### What an appointment grants

`/admin/forums/[id]` appoints a member or a group to one forum, optionally
cascading to everything beneath it. It offers **nine** checkboxes, and each one
is read by an authorization decision — there is nothing on that screen that
grants nothing:

| Checkbox | What it decides |
|---|---|
| Edit posts | `post.editOthers` — editing somebody else's post |
| Delete posts | `post.softDelete` and `thread.delete` — moving content to `visibility=deleted` |
| Restore posts | `post.restore` and `thread.restore` — putting deleted content back |
| Approve content | `content.approve` — releasing held content, and the approval queue |
| Open and close threads | `thread.lock` |
| Stick threads | `thread.stick` |
| Move threads | `thread.move`, in the source forum and the destination alike |
| Merge threads | `thread.merge` |
| Split threads | `thread.split` |

Any appointment at all — even one carrying no checkbox — lets its holder *see*
held and deleted content in that forum. That is what makes the queue readable;
acting on what is in it needs the right that names the act.

> [!IMPORTANT]
> **Delete and restore are two grants, not one.** Somebody appointed with
> *Delete posts* alone can remove a post and cannot put it back — including one
> they removed themselves. Tick *Restore posts* as well unless withholding the
> undo is what you meant.
>
> Boards upgrading past 0.4 keep what they had: a one-off migration granted
> *Restore posts* to every existing appointment that held *Delete posts*, so
> nobody lost an undo they were already using. New appointments start from
> nothing and get exactly what is ticked.

A group given `canSoftDeletePosts` in the forum matrix — rather than by
appointment — can both delete and restore in that forum, because that cell has
always meant "may move a post to deleted, reversibly" and there is no second
cell beside it.

> [!NOTE]
> **There is no hard delete, and no permission claims there is.** Deleting a
> post or a thread always means `visibility=deleted`: the row stays, the
> moderator log records the act, and somebody with *Restore posts* can undo it.
> Nothing in the panel destroys content, which is why the matrix has one delete
> cell for other people's posts rather than two.

**"My forums" in the ModCP lists what somebody actually holds**, per forum,
using the same nine names. If a right is not in that list, the board will refuse
the act; if it is, it will not.

### The one door no bypass opens

`admincp.access`. Super-moderator and administrator bypasses apply everywhere
else, and every use of one is logged.

### How a group looks

`/admin/groups/[id]` carries a group's appearance as well as its rights. Three
things, and all three are optional — a board that sets none of them looks
exactly as it did before they existed.

- **A name colour**, set separately for **light and dark**. Both are worth
  filling in: a colour that reads well on white is usually unreadable on a dark
  page, and the board will not guess a second one for you. Set one and the other
  is simply not applied in that scheme — the two directions behave the same way,
  so an unfilled dark picker leaves a dark reader the ordinary text colour
  exactly as an unfilled light one leaves a light reader it.
- **A badge**, as two uploads, light and dark, on the same terms as the board
  logo — the bytes decide the format rather than the file name, and SVG is
  accepted. Upload one and it is used in both schemes. It appears beside the
  group's title in the postbit.
- **The title**, which is what shows under a member's name on every post.

A member's group is their **display group** where they have chosen one, and
their primary group otherwise.

Members choose it themselves, under **UserCP → Profile**, from the groups they
are actually in: their primary group and every current secondary membership.
Picking their primary group stores nothing, so the choice keeps following that
group if it later changes. A group held only until a date leaves the list when
it lapses, and a member wearing it goes back to their primary group — they
cannot pin a badge to a membership they no longer hold. The picker is not shown
at all to a member who is only in one group.

**An administrator moving somebody between groups does not silently take that
choice away.** Promotions, a mass move of one group's members into another, and
deleting a group and rehoming its members all change the *primary* group, and
all three leave an explicit display group alone. Two cases are the exception,
and in both of them the stored choice has stopped meaning anything:

- The member was displaying the group they are being moved out of, or the group
  being deleted. That badge no longer describes a group they hold, so it is
  cleared and they go back to showing their new primary group.
- The member was displaying the group they are being moved *into*. That is now
  their primary group, and the convention above is that picking your primary
  group stores nothing — so the row is cleared rather than left pinned, and the
  choice goes on following the primary group if it changes again.

Everything else — a badge from a secondary membership, a paid group, anything
the member picked for themselves — survives the move untouched.

**Staff are shown as staff, and have no choice about it.** A member whose
primary group is a staff group — or any group carrying administrative or
moderation power — is displayed as that group everywhere: the postbit, the
profile, the online list, every coloured username. They get no picker, and a
display group set before they were appointed stops applying the moment they
are. The reason is that the badge is a claim about who is answerable for the
board, and a moderator posting as an ordinary member is that claim withdrawn
at exactly the moment it matters. A staff member who wants to post without the
badge has the invisible option and a second account; what they do not have is
their staff name on an ordinary member's colours.

This is a rule about display, not about membership. Staff can hold any other
group — including one they paid for — and get everything it carries.

### Groups a plugin may grant

The same screen carries one more switch: **may be granted by plugins**. It is
off by default, and it is the opt-in behind any plugin that hands out
membership — a paid pass, a trial, time-boxed access. A plugin can only put a
member in a group you have marked this way, and only **until a date**: every
plugin-granted membership expires, and the expiry holds even if the plugin is
removed or the tick stops, because the permission model simply stops reading a
lapsed row.

A plugin may ask for the group it grants to become the member's **primary**
one — which is what a plugin selling membership normally wants, and what Dues
does on a purchase. The group they were primary in becomes a secondary
membership, and the board hands it straight back when the grant is revoked or
lapses. The swap is the board's, not the plugin's: the same refusals apply, and
a lapsed membership stops being anybody's primary group at the moment it
expires, sweep or no sweep.

**A staff member's primary group is never displaced.** Buy a membership as a
moderator and you get the group and everything it carries, as a secondary
membership — but you stay a moderator, and you are still shown as one. Staff is
appointed, and an appointment is not something a purchase can move.

The switch refuses some groups, with the reason spelled out when you try:
system groups, staff groups, and any group whose permissions carry
administrative or moderation power. If what you want a plugin to sell is
"members plus one private forum and a badge", make a group that says exactly
that and mark *it* grantable — never a group that also moderates.

A `groups.expire` task tidies lapsed memberships every fifteen minutes; it is
on the system health screen with everything else. It is housekeeping, not
enforcement — access ended at the expiry regardless.

The colour reaches **every** username: the postbit, who started a thread, who
posted last, the profile heading, who is online. It is delivered as a stylesheet
rule rather than a colour on each name, which is why it works for a reader whose
dark mode comes from their operating system rather than from the board's own
control — that reader's page carries no dark-mode class for a theme to match on.
Each colour ships as a pair of rules for exactly that reason: one on the class
the appearance control writes when a member chooses a scheme, and one under a
`prefers-color-scheme` query for the member who has chosen nothing. Neither
colour is ever emitted without a scheme around it, which is what keeps a light
colour off a dark page.

> **Check the contrast.** Nothing stops you setting a pale yellow no reader can
> make out on a white page. Beneath each picker is a sample of the name on the
> surface it will really be on — light beside dark, both painted from the
> board's own palette rather than inherited from the screen you are looking at,
> so the light sample is light even if your machine is set to dark mode. It is
> there to be looked at.

### Promotions

`/admin/groups/promotions` moves members into a group once they have earned it.
The screen holds the rules, and beneath them the preview: exactly who the rules
would move if they ran this second, with nothing written.

A rule is:

- **A title.** For the preview and the admin log. Members never see it.
- **Display order.** The first rule in this order that matches a member is the
  one applied, and no member is moved twice in a run.
- **Promote from** — a primary group, or *any group*.
- **Promote into** — the group that becomes their primary *and* display group.
- **At least**: posts, reputation, days registered. Each one optional; a blank
  box means the rule does not look at that number.

**A new rule is enabled straight away**, and from then on the board applies it
without anybody pressing anything: a `promotions.apply` task runs every six
hours. **Disable** is the reversible way to stop a rule — it stays on the screen
and is skipped. **Remove** deletes it, asks for your password again, and has no
undo.

Two rules are refused rather than warned about, because both are quiet in the
preview and loud six hours later:

- **A rule that promotes a group into itself** can never move anybody. It looks
  configured and does nothing.
- **A rule with no criteria at all** matches every member it examines, which is
  a board-wide primary-group change on the next tick. If that really is what you
  want, say it out loud: set *posts* to `0`. Zero is accepted — it is blank that
  is refused.

Everything else the promotion machinery refuses, it refuses at run time and
without being configured to. **A promotion never lifts a ban, never demotes, and
never re-applies to somebody already in the target group.** Banned members,
administrators and super-moderators are skipped entirely whatever a rule says,
and a rule whose target group ranks below the member's current one is passed
over rather than applied. A member promoted by a rule keeps every secondary
membership they held.

The preview is the same evaluation the task runs, so it is worth reading before
enabling a rule on a board with history — a `100 posts` rule on a five-year-old
board moves five years of members on its first tick. **Run it** applies exactly
what the preview lists, asks for your password again, and records the count in
the admin log. Deleting the target group deletes the rules that point at it.

## Themes

A theme is a package named in `apps/community/community.config.ts`. Installing one is
three steps, in your checkout of the board:

```sh
pnpm --filter @meith/web add @meith/theme-midnight
```

```ts
// apps/community/community.config.ts
import midnight from "@meith/theme-midnight"

export default { theme: midnight }
```

Then commit, push, and redeploy — the image is rebuilt from your repository, so
an installed theme is a commit rather than a state the server drifts into.

Writing your own starts from
[`examples/iris-theme`](https://github.com/meith-dev/meith/tree/main/examples/iris-theme),
the worked minimal theme — reference code in the repository, not installed on
any board until you register it.

> [!NOTE]
> This is why there is no upload-a-zip path and will not be one. A theme has to
> be visible to the bundler at build time; a production build contains only what
> the bundler could see, so a theme discovered at runtime works in development
> and is absent in production.

> [!IMPORTANT]
> **A member picks a whole theme, components included.** `midnight` renders its
> forum listings as tables, and a member who picks it gets tables. The choice is
> a cookie the server reads, so the page arrives already correct — no flash, no
> second paint — and the control works with JavaScript turned off.
>
> `defaultTheme` in `community.config.ts` is now the *fallback*: what the board
> renders when its `themes` table says nothing, and what a palette-only theme
> borrows its markup from. Changing it is still a deploy; changing what members
> see is not.

### The board's name, and its logo

The name in the header, in every `<title>`, and in outgoing mail is
`board.name` under Settings → Board. There is nowhere else it is written down.

`/admin/themes` takes a **logo** to show in place of that name, as two uploads:

- **Light** — used on a light page, and everywhere if there is no dark one.
- **Dark** — used when the reader is in dark mode.

Two images because one that reads on a white page usually disappears on a black
one. Which one a reader gets is decided on the server from their colour-scheme
cookie, so a member who has forced dark on a light machine still gets the dark
logo — a board doing this in CSS gets that case wrong, and gets it wrong for the
commonest reader of all, the one on "system".

PNG, JPEG, WebP or SVG, up to 512 KiB. **The contents decide the format, not the
file name**: markup uploaded as `logo.png` is refused. SVG is accepted and is
usually what you want for a wordmark; one containing a `<script>`, an event
handler or a `javascript:` URL is refused, and the served response is sandboxed
besides.

The alt text — what a screen reader announces instead of the image — is
**Logo alt text** under Settings → Board. Leave it empty and it becomes the
board's name, which is usually what the logo says anyway. It is worth setting
only when the logo says something the name does not.

With no logo the header shows the board's name in text, which is where every
board starts and where most stay.

### What you can change without a deploy

`/admin/themes` holds the parts that are data rather than code:

- **On or off.** A theme that is on appears in the appearance control at the
  foot of every page, and any member — signed in or not — can pick it. The theme
  the board is built with can never be turned off; neither can the default,
  which has to be moved first. With one theme enabled the menu is not rendered
  at all — a board with one look does not carry a control for choosing between
  it and itself — and the light/dark buttons still work on their own.
- **The default** — what a member who has chosen nothing sees. It need not be
  the theme the board is built with: setting `midnight` as the default gives
  every visitor midnight, without a deploy.
- **Token values** — colours, corner radius, spacing step, and the three font
  stacks: **body**, **heading** and **monospace**. Grouped and described on the
  screen, with the platform colour picker beside each colour, and **separate
  light and dark values**: a page background set to white no longer follows you
  into dark mode. The sample repaints as you drag, in both schemes at once.

  The board reads in one face by default — the heading stack is
  `var(--font-sans-stack)`, so changing the body font moves headings with it.
  Set **Heading font** on its own if you want headings in a different voice; any
  CSS font stack works, and one built from faces the reader already has
  (`Georgia, ui-serif, serif`) downloads nothing.
- **Custom CSS.** For any theme other than the board's default this is nested
  under that theme's own selector, so it stops applying when a member picks
  another one — and a rule aimed at `:root` will not match inside the nesting.
  Target `body` or a class and it works in both positions. The **default**
  theme's custom CSS is the exception, and it is the one worth knowing: it is
  appended unscoped, so it reaches every member of the board including those who
  have picked something else. That is what makes it the place for a rule that
  belongs to the *board* rather than to a look; a rule that belongs to one look
  goes on a theme that is not the default. The editor says which of the two you
  are on.
- **Export and import** — an exact JSON round-trip, so a look can be moved
  between boards. Documents written before per-scheme overrides existed
  (`"version": 1`) still import; their values apply to both schemes.

A member's choice lives in a cookie (`meith_theme`, `meith_scheme`), not on the
account: it works for readers who are not signed in, and it does not follow
anyone between browsers. It is read on the server, which is what lets the theme
decide the markup rather than only the colours — and why the switcher needs no
JavaScript at all.

A theme that is turned off stops rendering immediately for the members who had
chosen it. The cookie is validated against the enabled list on every request, so
nobody has to clear anything.

**Reset** clears that theme's colours and custom CSS. It deletes the row when
nothing else is left in it — a row that is enabled and not the default — because
"no overrides" and "no row" look identical to every reader and only the delete
leaves the board as a fresh install. It keeps the row when the board has turned
the theme off, because putting colours back must not put a theme back in
everybody's switcher.

**Reset and import ask for your password again.** Both replace every stored
override for that theme in one press and neither has an undo, so they are
treated the way the panel treats a ban or a forum move: if it has been a while
since you signed in to the panel, you confirm before it happens. The reversible
controls on the same screen — turning a theme on or off, moving the default,
saving the palette from the editor — do not ask, because each of them is undone
by the control beside it.

### A board in a club's colours

`clubhouse` is the theme shipped for a sports club — GAA, soccer, basketball,
anything with a crest and two colours. It is the default board's shape, dressed
the way a club site is: a crest tile beside the board's name, a club-colour rule
under the masthead and above the footer, a colour bar down the left of every
panel heading, condensed uppercase headings, a score line of counts on every
listing row, and a postbit built like a squad card — a colour panel with the
post's number in it, the avatar overlapping, and the member's totals ruled off
beneath.

It is painted entirely from tokens you already have, so making it *your* club's
is the theme screen and no deploy:

- **The club colour** is the brand group — `primary`, `primary-hover`,
  `primary-foreground` and `ring`. One press of a brand preset writes all four,
  or type your own; the crest, the bar on every panel heading, the postbit's
  card panel, the current page in a list and the primary buttons all follow.
- **The second colour** — the trim on the jersey — is `secondary`, with
  `secondary-foreground` for text on it. It is the hairline under the club
  colour, the ring around the crest, and the fill of second-choice controls like
  "Mark read".
- Everything else stays neutral on purpose, so those two are the only hues on
  the page — which is also why the theme spends the club colour on bars and
  panels rather than on whole bands: a page that is mostly club colour in
  daylight is a wall of it at night.
- The screen takes a **light and a dark value** for each token, and this theme
  ships the same two club colours in both, because a club does not have a night
  kit. Change them in both places unless you mean them to differ.

With no logo uploaded the masthead draws a crest from the board's name — the
first letters of its first two words — so a club with a name and no artwork
still gets a mark rather than a gap.

Writing a theme: [The theme API](./theme-api.md). Every slot and view model:
[Theme slots](./theme-slots.md).

## Times

**Every date and time on the board is shown in the reader's own zone**, signed
in or not. Timestamps are formatted on the server, so the zone has to reach it:
a small script reports what the browser is set to into a `meith_tz` cookie, and
the first page a new reader opens reloads once so it arrives in their zone
rather than someone else's. Every page after that is already right, and the
footer names the zone it used.

A reader with JavaScript turned off never reports one, so they get **UTC** —
and the footer says UTC, rather than showing an unlabelled time that is wrong
by a working day for half the world.

A member can override the detection under **Your control panel → Options**.
The choice is one of:

- **Automatic** — follow whatever device they are reading on. This is the
  default, and it is what makes a member's laptop and their phone each show
  their own local time.
- **A named zone** — an IANA name (`America/New_York`), which wins everywhere,
  on every device, forever. Picking `UTC` here is a choice like any other and
  is kept.

Upgrading a board converts existing members to **Automatic**. Before this
existed the column held `UTC` for everybody who had never opened the options
screen, so "UTC" could not be told apart from "never chose" — treating the
whole set as a non-choice is what stops a board's existing members from being
the only readers still on UTC. A member who wants UTC picks it, once.

## Cookies

The board sets eight cookies of its own and no third-party ones:

| Cookie | What it is for |
|---|---|
| session, remember-me | signing in. Both are random tokens stored hashed; neither carries a CSRF secret, because the board has none — see [Requests from somewhere else](#requests-from-somewhere-else) |
| admin session | the control panel's separate sign-in |
| sign-in handshake, passkey challenge | only while a federated sign-in or a passkey exchange is in flight, and cleared the moment it finishes either way. Ten minutes at most, and nothing is written unless a member presses one of those buttons — see [Signing in without a password](./single-sign-on.md) |
| `meith_theme`, `meith_scheme` | the appearance controls, written only when a member presses one |
| `meith_tz` | the reader's own timezone, so the server can format times in it. Carries an IANA zone name and nothing else |

Every one of them is either strictly necessary or set in direct response to
something the reader explicitly asked for, and none exists before somebody asks
for it. `meith_tz` is the one nobody presses a button for: it is written by the
page itself, it holds a zone name rather than anything that identifies a
reader, and without it the board would show every reader somebody else's clock.
There is no cookie banner, because there is nothing on the board that needs one.

> What a particular board must disclose or record depends on what it does with
> its data, which is the operator's to decide — a board that adds its own
> tracking is adding its own obligations with it.

### A board session has a lifetime, not an idle timeout

**Session lifetime (days)** on the security screen is an *absolute* life. The
expiry is fixed when the session is minted and nothing extends it, so a member
reading the board every day is signed out on that date exactly like a member who
never came back. The setting key is still `security.session_idle_days` because
renaming a stored key would strand the value on every board that has set one;
the key is the historical name and the screen is the accurate one.

That is deliberate, and the two reasons are worth having written down:

- **A stolen token has a known last day.** A sliding session hands whoever holds
  the token the ability to keep it alive forever simply by using it, which is
  precisely what a thief does. An absolute life is the only guarantee here that
  survives the token leaving its owner's browser.
- **"Keep me signed in" is already the renewing half.** The remember-me token
  rotates on every resume and mints a fresh session, so a member who ticked the
  box is carried over the expiry without noticing it, and a *reused* remember
  token — the fingerprint of a stolen one — revokes the whole family and every
  session with it. Renewal and theft-detection travel together on that token,
  and separately from the session cookie on purpose.

The control panel's own session is the other way round — a 30-minute idle
timeout under an 8-hour ceiling — because it writes to `admin_sessions` on
requests an administrator makes while a panel screen is open, which is a rate
the board's whole signed-in read traffic is not.

## The content policy

Every response carries a `Content-Security-Policy` built per request in
`apps/community/proxy.ts`. Two parts of it are worth an operator knowing about.

**Scripts run only with this request's nonce.** `script-src` is
`'self' 'nonce-…' 'strict-dynamic'` and carries no `'unsafe-inline'`, so an
inline `<script>` that arrives in a post, a profile field or a search excerpt
does not execute even if some future bug lets the markup through. The board's
own two inline scripts — the timezone probe and a thread's structured-data
block — are stamped with the nonce as they are rendered. A fresh nonce is
minted for every request, which is why no page of the board is served from a
CDN cache.

**Styles are not nonced, and that is a deliberate limit.** A theme may emit a
`<style>` block — four of the shipped ones do — and themes are a published API
that has no way to be handed a per-request nonce. `style-src` therefore keeps
`'unsafe-inline'`. Injected CSS can restyle a page; it cannot execute, which is
the line the script directive holds.

`img-src` is the third part, and it is a setting: see
[Images from elsewhere](#images-from-elsewhere).

If you put something in front of the board that rewrites headers, do not let it
replace this one — a cached or hand-written policy will not carry the nonce for
the request it is served with, and every page will arrive with its scripts
refused.

## Requests from somewhere else

**There is no CSRF token, and no per-session CSRF secret.** A board that claims
one and does not have it is worse than a board that says which mechanism it
actually relies on, so here is the mechanism.

Every write the board performs is one of three shapes, and each is closed
differently:

| Shape | What turns a forged request away |
|---|---|
| A Server Action — nearly every form on the board | The framework's own `Origin`↔`Host` check, before the action runs |
| A route handler that changes something — the read markers, a plugin's `POST` | The board's own same-origin check: an `Origin` that matches, or a `Sec-Fetch-Site` that says `same-origin`. A request that offers **neither** is refused, not admitted |
| `/auth/resume`, which rotates a remember-me token | It acts only on a top-level page navigation. An `<img>`, an `<iframe>` or a background fetch pointed at it is refused, so a link on somebody else's site cannot rotate a reader's token behind their back |

Underneath all three, session cookies are `SameSite=Lax` and the content policy
sets `form-action 'self'`, so a form on another site cannot post to the board
at all.

The practical consequence for an operator: **a client that sends no `Origin`
header cannot write to the board.** Browsers all send one on a `POST`. A script
of your own that posts to a plugin route must send one too, or use the
[REST API](rest-api.md), which authenticates with a token and is not
cookie-authenticated — so it is not a forgery risk and not subject to this
check.

## Terms and privacy

Two documents, written by whoever runs the board, in
`/admin/settings?group=legal`:

| Setting | Published at | Linked from |
|---|---|---|
| **Terms of service** (`legal.terms`) | `/terms` | the footer, and the registration form |
| **Privacy policy** (`legal.privacy`) | `/privacy` | the footer |

Both are Markdown, rendered by the parser posts use — without the board's
smilies and custom directives, which have no business in a legal notice and
would change what it says the day somebody edits one. Both ship with a
template rather than empty, because a board with no terms at all is the state
nobody notices — and both templates are written to be replaced. Read them, make
them describe what your community actually does, and take advice on them if
what your board does warrants it. They are a starting point, not legal advice.

They are ordinary settings, so `/admin/settings` edits them and so does the
CLI, which is the easier route for a document you keep in a file:

```bash
community settings:set legal.terms "$(cat terms.md)"
```

Emptying one takes the page, its footer link, and — for the terms — the
registration checkbox away together. That is the switch: there is no separate
"enabled" toggle to leave inconsistent with the text.

### Accepting the terms

While the terms have a body, the registration form carries a checkbox and the
server refuses to create the account without it. The refusal is on the server,
not the form: the checkbox has `required` on it, but the board never trusts
that, and a submission that arrives without the box gets the same error
whichever way it was sent.

What the board does *not* do is record the acceptance against the account.
There is no stored timestamp and no version history, because a per-account
record that nobody keeps the corresponding text for proves nothing — the terms
are one editable document, and editing it changes what every reader sees at
once. Existing members are not asked again when the text changes: the terms in
force are the ones on the page, which is what they say themselves.

> `/terms` and `/privacy` are board routes, so a forum whose slug is `terms` or
> `privacy` is reachable at neither — the same as `/search`, `/online` and the
> other names the board has already taken.

## Plugins

Same shape as a theme: add the package, a line in `community.config.ts`, a redeploy.
The worked example to copy is
[`examples/hello-plugin`](https://github.com/meith-dev/meith/tree/main/examples/hello-plugin)
— reference code, not installed by default.

> [!NOTE]
> There is no upload-a-zip path, and there will not be one. A plugin discovered
> at runtime is a plugin the bundler never saw — it would work in development
> and be absent from the production build.

### What a plugin cannot do

It cannot decide authorization, reach the visibility filter, open its own
database connection, or patch core. Everything it *can* do is in a typed
registry. Its own data lives in tables named `plugin_<key>_*` — the host
refuses a migration that names anything else — and the one write it gets
against the board's own data is a timed group membership, only in a group you
have explicitly marked [grantable](#groups-a-plugin-may-grant).

Failures are contained: a plugin that throws leaves the page intact, and the
error is counted, logged, and — after repeated failures — the plugin is switched
off for the rest of the process.

### Administering one

`/admin/plugins` lists what is installed, what each plugin attaches to, its
settings, and the thing you cannot find out anywhere else: whether its migrations
have actually been applied to *this* database.

Three things are worth knowing before you need them.

**"Enabled" has three answers, and the screen says which one you have.**

| It says | It means | Fix |
|---|---|---|
| Disabled in `community.config.ts` | The entry in the installed list (`community.plugins.ts`) sets `enabled: false`. A plugin missing from that list entirely is not shown at all. | Edit the list, redeploy |
| Switched off | Somebody pressed the button on this screen. | Press it again |
| Failing | The server stopped calling it after repeated errors. | The error is on the plugin's own page |

**The disable button is durable.** It takes effect on every instance, not just
the server that handled the click, and it survives a redeploy. A disabled
plugin's scheduled tasks stop too: the switch is checked each time one comes
due, so the worker skips them without a restart. Reach for it when a plugin is
misbehaving — you do not need to deploy to stop one.

Because it takes a live capability off the whole board at once, **disabling asks
for your password again** when your panel sign-in has gone stale. Enabling does
not: it is the undo, and nothing is lost by pressing it.

**The switch is read before the screen answers, not after.** Every server has an
in-memory copy of which plugins the operator has switched off, and a process
that has just started has not read the settings table yet. Anything that renders
a plugin's contribution or reports "Running on this server" reconciles that copy
first, so a plugin you switched off yesterday is off in the first response from
a server that booted this morning — rather than off only once some other request
happened to refresh it.

**The panel never runs migrations.** It tells you which are outstanding;
`community upgrade` applies them.

**A plugin can carry its own pages and endpoints.** Pages appear under
`/plugins/<key>/…` inside the board's own chrome; endpoints under
`/api/plugins/<key>/…` — a payment provider's webhook, a form's target. Both
obey the disable switch: a plugin that is off answers 404 everywhere, the
same as one that was never installed.

**Plugin credentials go in either of two places, and the screen says which
one is winning.** A secret-type setting can be filled in the panel — the
field is write-only; the board will tell you a value is set but never show
it — or supplied as the environment variable named beside the field, which
overrides the panel and greys its box. Prefer the environment where you can
set one: it keeps credentials out of the database and out of backups.

**A greyed field is not saved over.** Any setting the environment owns is left
out of the write entirely, whatever kind it is — a tickbox as much as a text
box. A greyed control submits nothing, so a save that took the absence at face
value would store the *empty* answer under it: a switch showing "on" from the
environment would quietly acquire a stored "off" that nobody chose and nobody
could see, and the day the variable came out of the environment the plugin would
change behaviour. The screen already knows which fields the environment owns —
it is what greys them — and the save now skips exactly those.

> [!WARNING]
> A plugin with unapplied migrations is running against a schema that does not
> have what it expects. Treat that line as urgent, not informational.

### Paid membership, in the tree

The repository carries one full-size plugin beside the CI-only reference:
[`plugins/dues`](../plugins/dues) sells time-limited membership of a group
through Stripe — subscriptions, fixed-term passes, and passes bought as a
gift for another member. Its [README](../plugins/dues/README.md) is the
runbook: Stripe keys, the webhook to create, and what the operator still
owns (tax, refund policy). It is registered like any other plugin and
installed on no board by default.

### Removing one

`npm uninstall`, a line out of `community.config.ts`, a redeploy — the three install
steps in reverse. There is no uninstall button.

Its stored settings stay behind on purpose: reinstalling should not lose your
configuration.

Writing a plugin: [The plugin API](./plugin-api.md). Every hook:
[Plugin hooks](./plugin-hooks.md).

## Content and announcements

`/admin/content` holds the board-wide vocabularies — the word filter, thread
prefixes, smilies and custom directives — with attachments and announcements on
screens beside it.

### One difference that matters operationally

| Change | When it applies | Cost |
|---|---|---|
| Word filter | Next page load, everywhere | None. It is applied when a post is *shown*. |
| Smilies, custom directives | Gradually | Marks every stored render on the board out of date. |

Smilies and directives decide what a post *renders to*, so changing one
invalidates every cached render. Nothing breaks — those posts render correctly on
demand and are rewritten in the background by the ordinary tick — but on a large
board expect a period of extra rendering, and expect `/admin/system` to report a
backlog until it clears.

### What "everywhere" covers

"Everywhere" is a claim about every place the board shows a reader the words
somebody posted, not only the thread page:

- post bodies on a thread page, and the description in that page's structured
  data;
- the Latest Posts excerpts on the board index;
- the RSS and Atom summaries — board, forum and thread feeds;
- search-result excerpts, on `/search` and on `GET /api/v1/search`.

Every one of those reads the same compiled filter through one function
(`filterWords` in `apps/community/src/view/word-filter.ts`) fed by
`activeWordFilter()`, which loads the rules once per request behind the
`wordFilters` cache tag that saving a filter invalidates. A new surface that
shows post text and does not call it is a bug — the filter once covered the
thread page alone while this page already promised "everywhere", and one shared
call path is what keeps the promise from drifting again.

Three things are deliberately *not* filtered, and none of them is a display of
somebody's post to a reader:

- **What is stored.** The filter never rewrites the row, which is what makes a
  pattern you regret harmless — so the editor, the quote box and
  `GET /api/v1/threads/:id/posts` (which returns the Markdown source) all show
  the words as written. Anything re-rendered from that source is filtered when
  it is shown.
- **Private messages.** A message is not a post, and the filter is a board-wide
  vocabulary for public content.
- **The moderation queue and the report screens.** Staff are judging the text,
  so they are shown what was actually written.

### Custom directives

Markdown's extension point, and the board's own additions to it. A directive
chooses a name and whether it is inline or block; members write a block one as
`:::spoiler` … `:::` and an inline one as `:spoiler[the ending]`, and it renders
as a `div` or `span` carrying a class your theme can style.

There is deliberately no replacement-pattern field: if you need bespoke markup,
that is a plugin, where the code is reviewed rather than typed into a form.

### Posts are Markdown

Since 0.2 the board's markup language is Markdown, and there is no BBCode
renderer left in it. A board upgrading from an earlier release — or importing
one from MyBB — has every post, private message, signature, announcement and
draft **converted once**, in the background, by `posts.render_backfill`. Two
things follow for an operator:

- **Nothing looks broken while it runs.** A row the sweep has not reached is
  converted in memory when somebody reads it. `/admin/system` reports the
  backlog; on a large board expect it to take a while and to clear on its own.
- **`[u]`, `[color]` and `[size]` lose their styling.** Markdown has no spelling
  for underline, colour or size, so those tags become their own text: the words
  survive, the presentation does not. It is the one permanent loss in the
  conversion, and it is recorded in
  [mybb-parity.md](./mybb-parity.md#the-markup-language-is-markdown-not-bbcode).

### The silent edit window

**Silent edit window** — `posting.edit_grace_seconds`, in the posting group,
default 300 — is how long after posting somebody may fix their own post without
the board announcing it. Inside the window the post carries no *Last edited by*
line; outside it, the line appears as it always has.

```sh
community settings:set posting.edit_grace_seconds 600   # ten minutes
community settings:set posting.edit_grace_seconds 0     # always show the notice
```

It is measured from when the **post was written**, not from the last edit, so
the window closes once and stays closed. A member who fixes a typo twice inside
five minutes leaves no notice; one who comes back an hour later leaves one.

Two limits on it are the point of it being safe:

- **A moderator editing somebody else's post is never silent**, however soon
  after the post it happens. The notice is what tells a reader that the words
  they are reading are not entirely the ones the author wrote, and that is
  exactly the case it must not hide. The window applies only to an author
  editing their own post.
- **The revision history is untouched.** Every edit still writes a revision
  recording who edited, when, why, and what the post said before. The setting
  suppresses one line rendered to readers; it does not suppress the record, and
  a moderator looking at the post's history sees the silent edits along with
  the rest.

Set it to 0 for a board that wants every change on the record in public. Raising
it much above a few minutes starts to mean "the post you are reading may have
changed since the reply below it", which is the thing the notice exists to
prevent.

### Attachments

**Two switches have to agree before a member can attach anything.** The
permission `attachment.upload` — per group, per forum, resolved through the
matrix — answers *may this member attach files here*. **Allow attachments**, on
`/admin/forums/[id]`, answers *does this forum take attachments at all*. A file
is accepted only where both say yes, so unticking the forum switch closes that
forum to new attachments however generous the matrix is, and it is the shorter
path to "no files in here" than editing every group's cell.

The switch is enforced where the post is written, not only where the form is
drawn. The composer, the reply page and the quick reply stop offering the file
control in a forum that does not take attachments; a submission that carries a
file anyway — a form left open in another tab, or a request built by hand —
is refused with *This forum does not accept file attachments.* Nothing is
written when that happens: the member gets their text back and no post, rather
than a post that quietly lost the file it was meant to carry. The numeric limits
beside the permission (attachments per post, maximum size) still apply on top,
and `0` there still means unlimited rather than none.

**Turning it off leaves the attachments already posted alone.** They keep
rendering under their posts and their links keep working, gated as they always
were on `attachment.download` and on whether the viewer may read the thread. The
switch governs what the forum accepts next; it is not a retraction of what it
accepted before, because unposting what members already wrote is not something
an operator asks for by unticking a box. To take one down, delete the attachment.

**Deleting an attachment does not touch the post it was on.** Attachments are
listed beside a post rather than written into it, so removing one takes an entry
off a list and nothing else. The bytes go to the hourly sweep rather than being
deleted immediately.

### Announcements

**An announcement is not a pinned thread.** Nobody can reply to one, it expires
on its own date, and removing it removes nothing anybody wrote — which is why it
is safe to delete and a sticky thread is not.

Dates are entered in UTC.

## The moderation queue

`/modcp` lists what is waiting for approval in the forums you moderate: held
threads, and held replies. It is a queue of **decisions that can actually be
carried out**, and two rules keep it that way.

**A held reply inside a thread that is itself held is not listed.** Approving
the thread is what puts it in front of anybody, so the reply is not a separate
decision.

**A held reply whose thread has been deleted is not listed either.** Approving
it would mark it visible inside a thread nobody can reach, and — because
approving a post is what adds it to the forum's and the author's post counts —
would move counters for something the board does not show. The counters would
then disagree with the visible board until the next recount. Restoring the
thread brings its held replies back into the queue, where the decision means
something again.

The exclusion is enforced where the decision is applied, not only where the
queue is drawn, so a selection assembled by hand gets the same answer: the reply
is reported as no longer pending rather than approved. The pending count on the
panel counts the same set the list shows. The inline moderation tools on a
thread page follow the same rule — **Approve** does not apply to a reply whose
thread is not visible.

## Reputation

`/admin/settings` under **Reputation**. Four settings, and the first two decide
what the feature *is* on your board.

**Allow negative ratings** — off by default. Off, reputation is a thanks
button: every post carries **Thanks**, one press gives the author a point, and
pressing it again takes it back. The **Rate** link is not shown, because with
negatives off the rating form has nothing on it the button has not.

Turn it on and the Rate link comes back beside the Thanks button, leading to a
form that can also rate somebody down and say why. Both controls are then
offered, because they are then two different things.

**Require a comment** — off by default, and turning it on removes the Thanks
button. One press cannot carry a reason, so a board that requires one is a board
where every rating goes through the form. That is the right trade for a board
that allows negatives — a criticism with no reason attached is the part of
reputation people argue about — and the wrong one for a board that only allows
thanks, which is why the default is off.

> If you are upgrading, this default **changed**: it used to be on. See
> [Upgrading](./upgrading.md#settings-whose-defaults-have-changed).

**Posts required before rating** — 5 by default. A spam defence: registering
takes seconds, posting five times on a moderated board does not. 0 turns it off.

**Ratings per day** is per *group*, on the group's own screen, not here — it is
a number that should differ between a new member and a moderator, and every
numeric permission on this board lives with the group (0 means unlimited).

A member's total is **derived**, not counted up: it is recomputed from the live
ratings every time one is written, changed or withdrawn. So a withdrawn rating
really leaves, and a total that has somehow drifted repairs itself the next time
anybody rates that member. Editing `users.reputation` by hand therefore does
nothing lasting — use **Recount & rebuild** on `/admin/system` if you need it
corrected.

## Member state and bans

An account's **state** — active, or awaiting activation — and a **ban** are two
different things, kept in two different places. The state is a column on the
account; a ban is a record, with a reason, an expiry and the group the member
held before it. Banning through `/admin/users/[id]` writes the record; it does
not flip the state column.

Because of that, the state form on the member's screen is not shown at all while
a ban is in force, and **the server refuses the change too** — it looks for an
unlifted ban record, not just for the word `banned` in the state column, so a
request sent straight to the action gets the same answer the screen gives. Lift
the ban and the form comes back.

Issuing a ban from the state form is refused outright: bans belong to the ban
screen, which is the only path that records who did it, why, and what to restore.

## Pruning dormant accounts

`/admin/users/prune` closes accounts in batches: a registration date, optionally
a "not seen since" date, optionally only accounts still awaiting activation. It
**closes** rather than deletes — the row stays, with `deleted_at` set — so a
wrong date is recoverable.

The screen previews before it acts, and the preview and the execution are built
from the same predicate, so what you were shown is what gets closed.

Four exclusions are unconditional, and none of them is a checkbox:

- **Anybody who has written anything.** Not "anybody with a post count" — the
  count only tracks posts the board currently shows, and a member whose only
  contributions are held for approval or have been removed by a moderator has
  still posted. The prune looks for the posts and threads themselves, whatever
  their state, as well as at the counters.
- **Anybody in a staff group.** That means the same thing here as it does in the
  postbit: the **staff group** switch, *or* any group carrying administrative or
  moderation power, held as a primary group or as an additional one. A group
  with `Can approve content` ticked and the staff switch left off is still
  staff as far as the prune is concerned.
- **Any forum moderator**, whatever group they are in.
- **Any banned account**, whether the ban is a state on the account or an
  unlifted ban record. A lifted ban does not protect an account.

## Mail

Mail is the one subsystem a new board gets wrong silently. Nothing errors: the
password-reset form says "check your inbox", the registration confirmation is
written to a log file, and the member waits. So it is asked for on the installer
and provable from the control panel, rather than being an environment variable
somebody sets after going live.

### Two places it can be configured, and which one wins

| Where | How | When to use it |
|---|---|---|
| **The board** — `/admin/settings?group=mail` | Stored in the `settings` table. Takes effect on the next message, no redeploy. Has a **Send a test message** button. | The default, and what the installer writes. |
| **The environment** — `MAIL_DRIVER` and friends | Read at boot. Overrides the board entirely. | When the credential must not live in the database, or the deployment is configured wholly from files. |

**The rule is one line: `MAIL_DRIVER=http` or `MAIL_DRIVER=smtp` in the
environment wins outright.** Anything else — `log`, or unset — hands the
decision to the board's own settings. Every board that already configures mail
through the environment therefore keeps working exactly as it did; what changed
is only the board that never set it, which previously could not send at all and
can now be fixed from the panel.

When the environment wins, the settings screen says so and does not pretend its
fields are live. Storing a credential in the environment is the more careful
choice, at the cost of a redeploy to rotate it; storing it on the board means
the API key sits in the `settings` table, readable by anything with database
access. Neither is wrong, and the panel marks the stored ones as secrets so they
are never rendered back into the page or written to the audit log.

### What sends mail

| What | When | How it goes out |
|---|---|---|
| Notification e-mail | A member's notification, when they asked for it by mail | Queued — leaves on the **tick** |
| Mass mail | An administrator sends one from `/admin/users/mail` | Queued — leaves on the **tick** |
| E-mail change confirmation | A member changes their address in the UserCP | Sent during the request |
| Registration confirmation | A registration, when the activation method asks for one | Sent during the request |
| Password reset | Somebody uses the "forgot your password" form | Sent during the request |

The split is not arbitrary. The first two go to members the board already knows,
in volume, and can wait a minute. The last three each go to somebody sitting in
front of a screen who will retry within seconds if nothing arrives, and two of
the three go to an address the board has not proven yet — a queued job cannot
be a notification to an account that may not be reachable.

### Choosing a transport

| Transport | What it does |
|---|---|
| Not sending (`log`) | Writes `mail (not actually sent)` to the log with the recipient and subject. Delivers nothing. The default. |
| **SMTP** | Speaks SMTP to any server. Reaches every provider, and every mailbox host. |
| **Provider API** (`http`) | Posts Resend's JSON body with a Bearer token. Works for Resend and anything that copies it. |

### The shortest path, if you already receive mail on your domain

Use SMTP against the mailbox you already have — Fastmail, Migadu, Google
Workspace, your VPS host's mail service, whatever it is. It is the only option
with **no DNS work at all**, because SPF and DKIM are already published for that
domain; every provider below needs new records before it will carry a message to
anybody.

On `/admin/settings?group=mail`, using the screen's own labels:

```
How mail is sent:  SMTP server
Sender address:    an address on that domain
SMTP host:         your provider's SMTP host
SMTP port:         465            (or 587)
SMTP security:     Implicit TLS   (or STARTTLS, for 587)
SMTP username:     your mailbox address
SMTP password:     an app password — never the password you sign in with
```

Mailbox providers rate-limit sending (Workspace is around 2,000 messages a day),
which is ample for a forum and not for a newsletter.

### Resend, copy-pasteable

Free for 3,000 messages a month, and the provider whose API the `http` transport
was written against.

On the installer, pick **Resend (API)** and give it two things — the sender
address and the API key. The endpoint comes with the preset. On
`/admin/settings?group=mail` after the fact, the same three fields by hand:

```
How mail is sent:  Provider API
Sender address:    noreply@yourdomain.com
API endpoint:      https://api.resend.com/emails
API key:           re_…
```

Or the same account over SMTP — host `smtp.resend.com`, port 465, implicit TLS,
username the literal word `resend`, password the API key. **Resend (SMTP)** is a
preset too and fills those four in for you; on the settings screen you type them,
because the screen is generated from the setting registry and has no provider
list.

Only if the credential must not live in the database, the environment says the
same thing and overrides both — at the cost of a redeploy to rotate it:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@yourdomain.com
```

Two things will bite you before the first message arrives:

1. **Verify the sending domain with the provider first.** Every provider
   requires it, the board cannot do it for you, and until it is done a new
   Resend account can only mail the address you signed up with.
2. **The sender must be an address on that verified domain.** If it is not,
   every message is rejected with a 4xx — which the driver reports as a
   *configuration error* and does not retry, because it would fail identically
   on every attempt.

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

`MAIL_SMTP_HOST` and `MAIL_FROM` are required; the username and password must be
set together or not at all, since a relay on the same machine legitimately needs
neither. Boot fails naming whatever is missing.

**Security is three values, not a checkbox, and this is the setting people get
wrong.** `tls` is implicit TLS — the socket is encrypted before the first byte,
which is port 465. `starttls` connects in the clear and upgrades, which is port
587, and the board *refuses to continue if the upgrade fails* rather than
sending your password in plaintext. `none` is genuinely unencrypted and is for a
relay on this machine and nothing else. A mode that disagrees with the port
produces a connection that hangs instead of failing, which is the single most
confusing way for this to go wrong.

### Other providers

Brevo (~300/day free), Postmark (the best deliverability, 100/month free),
Mailgun and Amazon SES all speak SMTP, so all four work as-is. The **installer**
carries prefilled presets for Brevo, Postmark and SES; Mailgun has none, and
neither does any provider added after this was written — pick *Any other SMTP
server* and type the host. A preset is a convenience, not an integration, and
nothing behaves differently without one.

The **provider API** transport is not a Resend client but it is Resend-shaped. It
posts:

```json
{ "from": "…", "to": "…", "subject": "…", "text": "…", "html": "…", "reply_to": "…" }
```

Resend's `POST /emails` takes exactly that. **Postmark and Mailgun do not** —
Postmark uses `From`/`To`/`TextBody` and an `X-Postmark-Server-Token` header,
Mailgun takes form-encoded fields on a per-domain URL. Use their SMTP hosts
instead; that is what the SMTP transport is for, and it needs no code change.

### Prove it, rather than assuming it

`/admin/settings?group=mail` has a **Send a test message to me** button. It sends
through the configuration the board has *saved* — so save first — to the address
on your own account, and shows the provider's own refusal verbatim when there is
one. "The domain example.com is not verified" is the whole answer; a tidier
message would not be.

The installer does the same thing and goes further: it sends the test **before
the first migration**, and refuses to install if it fails. A wrong API key
therefore costs a retry rather than a sealed board that cannot mail anybody.

### The settings behind the screen

The screen is generated from the setting registry, so every field on it is a key
`community settings:set` can write. That matters exactly once, and it is the once
that counts: **when mail is broken and the panel is not reachable**, which is the
same situation as being locked out, because password reset is the thing mail was
going to fix.

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

The two secrets are write-only from the operator's side: the panel renders them
as empty password boxes and a blank one means *unchanged* rather than *clear it*,
and `community env:check` and the audit log both refuse to print them.

Clearing one is therefore a separate, deliberate act rather than a side effect of
saving an empty box — otherwise every accidental save of the mail page would wipe
the key. Once a secret is stored, a **Clear the stored value and go back to the
default** tick-box appears under its field; tick it and save, and the stored
value is removed. Ticking it wins over anything typed into the box in the same
submit, so there is no ambiguity about which one you meant. The box is not
offered when nothing is stored, because there would be nothing to clear.

`community settings:set mail.http_token ''` does the same thing from the command
line.

### Who a mass mail reaches

`/admin/users/mail` sends to everybody, or to one group. Either way it reaches
only accounts that are **active, not closed, and have a verified address** — an
unverified address is as often a typo as it is the member's.

The **Send to** list carries the size of each audience in brackets beside it, and
those numbers are the real thing: they are counted with the same rules the send
itself uses, so the figure beside a group is how many messages choosing that
group will queue. A group counts members who hold it as their primary group and
members who hold it as an additional one, each member once.

The numbers are counted when the page is rendered, not as you change the
selection — the screen carries no JavaScript, and every audience is on it
already, so there is nothing to update. Reload the page for a fresh count.

### Queued mail needs the tick

Notification and mass mail are delivered by a job that runs on the tick. A
stopped tick means no mail and **no error anywhere** — the messages sit in the
queue looking fine. `/admin/system` says loudly when the tick is stale; see
[Nothing happens on a schedule](#nothing-happens-on-a-schedule).

The three that are sent during the request — password reset, e-mail change, and
registration confirmation — do not wait for it. So "the reset arrived but the
digest did not" points at the tick, and "nothing arrives at all" points at mail.

### The sender name and the sender address are different settings

The address is `mail.from` (or `MAIL_FROM`); **Sender name** is the display name
beside it. Together they become `"The Townland" <noreply@yourdomain.com>`; leave
the name empty — the default — and messages go out as the bare address.

The split predates mail being a board setting, and it still earns its keep: the
address has to be on a domain your provider has verified, so getting it wrong
means nothing is delivered, while the name is only what people see in their inbox.

The name is read **per message**, not once at startup, so renaming your board
changes the next message rather than the next restart — a worker process can
outlive several settings changes.

### Activation and mail are one decision

`registration.method` in `/admin/settings` chooses what a new account has to do
before it can sign in:

| Method | What happens |
|---|---|
| `none` | The account works immediately. |
| `email` | A confirmation link is sent. Until it is followed, the account cannot sign in. |
| `admin` | The account waits for an administrator. No mail involved. |
| `both` | The link first, then an administrator. |

The default is `none`, and it is `none` because a board that has not configured
mail sends nothing: asking for confirmation out of the box would mint links it
cannot deliver. Choosing anything else is a decision to make *after* mail works
— which is now one button away rather than a redeploy away.

> [!IMPORTANT]
> **`email` or `both` on a board with no working mail is a board nobody can
> join.** The links are minted, printed to the log, and never delivered. This
> cannot be a boot check — mail and the method are both rows you can change on a
> running board — so instead the registration settings screen and `/admin/system`
> both say so, loudly, while it is true.

> [!NOTE]
> **Upgrading an existing board?** This setting had no effect until recently —
> whatever the dropdown showed, accounts were created as though it said `none`.
> A board that stored `admin` or `both` gets the vetting it asked for as soon as
> it upgrades. See
> [Settings that gained a reader](./upgrading.md#settings-that-gained-a-reader).

An account already stuck at "awaiting activation" can be activated by hand from
its member screen in `/admin/users`. Somebody who never received their link can
ask for another at `/verify/resend`, which is linked from the sign-in page.

### What happens when a provider fails

- **A rejection that will not change** — a bad address, an unverified domain, a
  bad token, or any SMTP 5xx — is treated as configuration and **not retried**,
  because it would fail identically every time.
- **A transient failure** — 5xx or 429 over HTTP, a 4xx SMTP reply, a refused
  connection — is retried by the queue's backoff for queued mail. A greylisting
  relay answering "try later" is the case this exists for. A direct send has no
  retry: the member asks again.
- Drivers hold no retry logic of their own. The queue is the retry mechanism,
  deliberately, so one place decides how often to try again.
- Every send is **bounded by a timeout**, including each stage of an SMTP
  conversation. Without it a hung provider would hold a job's lease open for its
  full duration and consume the tick's whole budget — and a host that accepts the
  connection and never greets, the classic symptom of a port that disagrees with
  the security mode, would do it on every attempt.
- A failed send never fails the thing that caused it. A registration whose
  confirmation could not be sent still created the account — reporting
  "registration failed" would be a lie about a state you now have to live with —
  and the screen it lands on offers to send the link again.

### The board has to know its own address

Every message that carries a link — confirm your address, reset your password, a
notification pointing at a post — builds it from the board's own origin, because
nothing in a queued job or a mail template knows the request that caused it. So
do feeds, sitemaps and every canonical URL.

This used to be `APP_URL` and nothing else, which made it the single most likely
misconfiguration on a new board. It is asked for on the installer now — prefilled
from the address you loaded `/install` at — and lives at **Board address** on
`/admin/settings?group=board`, changeable without a redeploy.

`APP_URL` still wins when set, on the same rule as mail, and the settings screen
says so rather than accepting an edit it will ignore.

With neither set, the board does **not** emit a relative link, which would be a
dead string in a mail client. It degrades to written instructions instead: the
mail arrives, it is polite, and it is useless. Feeds and canonical URLs fall back
to a localhost origin, which is obviously wrong rather than subtly wrong.

The address is an **origin** — scheme, host, optional port, nothing else.
`https://forum.example/board` is rejected by the settings screen on the way in,
because every link the board built from it would carry `/board` in the middle.
`APP_URL` is checked more loosely — only that it is a URL — so a path pasted
into the environment is the one place this mistake can still get through.

## Spam

Registration questions are at `/admin/antispam`; the numbers are in
`/admin/settings` under **Anti-spam**.

Everything except the hidden-field trap and a three-second minimum fill time
ships switched off. A fresh board has no spam on it, and a feature that arrives
switched on introduces itself by breaking your registration form — those two are
on by default because no human notices either.

### What each control is actually worth

| Control | Stops | Costs a real visitor |
|---|---|---|
| Hidden-field trap | Bots that fill every field | Nothing. Leave it on. |
| Minimum fill time | Instant submissions | Occasionally somebody with a password manager. Keep it to a few seconds. |
| A question | Scripted registration | A moment, every time. Switch it on when you have a problem. |
| Hold first posts | Nearly all forum spam | One wait per genuine new member. |
| Hourly limits | A night's work by one script | Nothing, set sensibly. |
| The three auth limits | Signup floods, reset-mail bombing, password spraying | Nothing. They ship on. |

> [!TIP]
> **Holding a new member's first posts is the effective one.** Spam accounts post
> once or twice and never come back, so a threshold of two or three catches most
> of it. Held posts go to the moderation queue like anything else.

### The limits on the pages nobody has signed in to yet

The hourly limits above are about members posting. Three more sit on the pages
a visitor reaches before they have an account, and unlike the rest of this
screen they **ship switched on** — each closes a hole that costs nothing to
leave shut.

| Setting | Default | Counted per | What it stops |
|---|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour | requesting /24 | A script working through a list of usernames. Independent of the challenge, so it covers the default board, which has no challenge |
| `antispam.reset_per_hour` | 5/hour | target e-mail address | Somebody using your board's reset form to mail-bomb one person |
| `antispam.reset_ip_per_hour` | 20/hour | requesting /24 | The same caller working through a list of addresses, probing which have accounts |
| `antispam.login_ip_attempts` | 100 per lockout window | requesting /24 | **Spraying** — one guess each against a thousand accounts, which trips no per-account counter |

The reset form answers identically whether it sent a mail, declined to, or
refused on a limit. That is the point of it: a form that says "too many
requests for that address" has confirmed the address has an account. Nothing
about hitting a limit is visible to whoever hit it.

The login limit shares the lockout window with the per-account counters
(`security.lockout_minutes`), and like them it is **cleared by a successful
sign-in** from that address — a household behind one address is not locked out
by one member's bad afternoon. That also means a caller who holds one valid
account can clear their own counter, which is why the number is a backstop
against volume rather than a wall.

Set any of them to `0` to switch it off.

### The three login counters, and where each lives

A failed sign-in is counted three times over, and the three answer different
attacks. Two are on the **security** screen and the third is above, on
anti-spam, because it is a volume control rather than an account one.

| Counter | Setting | Default | Trips when |
|---|---|---|---|
| Per account, per address | `security.max_login_attempts` | 5 | Somebody guesses at one account from one place |
| Per account, everywhere | `security.max_account_login_attempts` | 50 | The same guess is spread over many addresses |
| Per address, any account | `antispam.login_ip_attempts` | 100 | One address sprays single guesses across many accounts |

All three are measured over `security.lockout_minutes` and all three are
cleared by a successful sign-in. The middle one is the uncomfortable one: it
locks the **real owner** out too, which is the price of it working at all
against a botnet. Keep it well above the per-address number, and remember that
a member who is genuinely locked out can still reset their password — the reset
form is a separate door with limits of its own.

### Limits and the flood interval are different controls

| | What it bounds | What it stops |
|---|---|---|
| Flood interval (`posting.flood_seconds`) | The minimum gap between two actions | A double-click |
| Hourly limit | How many actions in an hour | A script posting steadily all night |

A script satisfies any interval you would be willing to set — every 31 seconds,
all night, is thousands of posts and never breaks the rule. Use both. Members
with **bypass flood check** are exempt from both.

There is a third control, and it is not on this screen: `maxPostsPerDay` is a
**group permission** rather than a board setting, so it caps a particular group
rather than everybody, and *bypass flood check* does not lift it. See [the daily
post allowance](#the-daily-post-allowance).

Limits are counted in the database, so every instance of your board shares one
allowance rather than getting one each. The counters are pruned hourly by the
tick; if the tick is stopped they accumulate, but `/admin/system` will tell you
the tick is stale long before this becomes your problem.

### The upload allowance covers both kinds of upload

`antispam.upload_per_hour` is one bucket per member, and both things a member
can upload spend from it: the files attached to a post, one unit each, and a new
avatar, one unit at the point the image is accepted. Replacing an avatar six
times in an hour therefore costs exactly what attaching six files to a post
costs — which is what the setting has always said and what an account using the
avatar form as its upload channel would otherwise get for nothing. Removing an
avatar spends nothing, because it uploads nothing.

### If registration stops working

Check `/admin/antispam` first.

- A question challenge switched on with **no question configured** does nothing
  rather than refusing everybody. That is deliberate, and the screen says so.
- A **minimum fill time** set to a minute quietly turns away most real
  applicants. This is the usual culprit.

If registrations are *created* but nobody can sign in afterwards, it is not
anti-spam — it is the activation method waiting for mail the board cannot send.
See [Activation and mail are one decision](#activation-and-mail-are-one-decision).

### No hosted captcha

Not because it is hard. A hosted captcha means every visitor's browser contacting
a third party before they can join your board, which is a decision about your
members rather than a setting.

The provider seam is there if you want one — see `packages/antispam`. It is a
small module, not a fork.

## The system screen

`/admin/system` is where the board's maintenance buttons live. Each one reports
what it did, and each one is expected to have done it — a button that says
"cleared" or "back on the queue" for something that never happened is a bug, not
a rounding error, because the operator then goes looking for the fault
somewhere else.

### Clear cache

**The forum tree is the only thing this button offers**, because it is the only
global cache entry that outlives the write that changed it and is not already
invalidated by that write.

The board caches very little globally. The forum tree, the board's settings, the
group name colours, the compiled word filters and vocabulary, and each theme's
compiled style — every one of those is cleared by the admin screen that changes
it, so the only reason to reach for this button is a tree that looks stale after
something changed it from outside the panel (a direct database edit, a restore,
an import).

**Permissions are not cached and never were**, so there is nothing to clear. A
member's rights are resolved from the group defaults and the forum overrides on
every request; the `cache_versions` counter that permission writes bump is a
version stamp on that per-request resolution, not a cache entry. A member who
still cannot see a forum after a permission change is not looking at a stale
cache — see [A member cannot see a forum they should](#a-member-cannot-see-a-forum-they-should).

### Retry a dead-lettered job

A job dead-letters after exhausting its attempts. **Retry requeues one job by
id, and only a job that is actually dead**: an id that names nothing, or names a
job that is pending, running or done, is refused and says so rather than
reporting success. Nothing is written to the admin log unless a job really went
back on the queue.

The reason a job died is usually still true, so retrying every one puts the same
failures straight back. Read the last error first.

### The admin log's action filter

`/admin/log` builds its **Action** dropdown from the distinct actions actually
recorded, so every action the board has ever logged can be filtered on. The
dropdown is what the log contains, not a fixed list — an action nobody has
performed yet is not offered, and appears the first time it happens.

### What reaches the admin log

`/admin/log` is the whole table. Administrative actions and moderation actions
share it, so the control panel's log is the superset and the ModCP's is the same
rows filtered to moderation actions in the forums a moderator holds — see
[Everything that changes something is logged](./mybb-parity.md#everything-that-changes-something-is-logged-and-nothing-that-does-not)
for what qualifies.

Two things are on the screen but not in the table, and knowing which is which
saves an investigation. A member editing or deleting **their own** post writes
no row; the row appears when somebody else does it to them. And a report's
assignment — a moderator taking it, or putting it back — is on the report's own
timeline rather than in the log, because it changes nothing about the board.
Everything else a moderator or an administrator does leaves a row, including
each 500-recipient batch of a mass mail.

## Migrations

Migrations are **forward-only**. There is no down migration and there will not be
one: a migration that drops a column is a data-loss button on a live board, and
some migrations cannot be reversed at all, so a "roll back" that worked for half
of them and silently did nothing for the rest would be worse than its absence.

```sh
community migrate      # core only
community upgrade      # core, then each installed plugin's, then record the version
```

The admin panel shows a notice when the deployed code is ahead of the database.

Full procedure, including how far you can jump between versions:
[Upgrading a board](./upgrading.md).

## Backup and restore

> [!IMPORTANT]
> **The backup is the rollback plan.** Migrations are forward-only, so restoring
> is the only way back. This is not a precaution, it is the recovery procedure —
> which is why it is worth testing before you need it.

### What to back up

Two things, and only one of them is the database.

1. **The database.** Accounts, posts, settings, permissions, theme overrides —
   everything the board knows.
2. **Uploaded files**, if your file driver is local disk. On S3 or a compatible
   store the files are already elsewhere and the bucket has its own backup story.

The code is in git. `.env` values — or the secrets your panel generated — are
worth a copy somewhere you can reach when the machine is the thing that is
broken.

> [!WARNING]
> **A scheduled database backup is not a backup of the board.** Coolify's
> per-resource schedule dumps Postgres and does not touch the uploads volume, so
> a restore from it gives you every post and a broken image in each of them.
> Whatever takes the database, something has to take the volume too.

### Taking one

```sh
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > board.dump
```

From a container deployment, where `pg_dump` is in the database container rather
than on the host:

```sh
docker compose exec -T postgres pg_dump -U forum forum | gzip > board-$(date +%F).sql.gz
docker run --rm -v meith_uploads:/u -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

Check the volume's real name with `docker volume ls` first — Compose prefixes it
with the project directory, and Coolify with the resource's UUID. Then put both
in a cron and **copy them off the machine**: a backup on the server is a backup
of the thing most likely to fail.

`--format=custom` restores selectively and compresses. `--no-owner` and
`--no-privileges` because the role names on a managed platform are not the ones
you will restore into.

> [!WARNING]
> **Use the direct connection string for a dump, not the pooler.** A transaction
> pooler does not support the session-level operations `pg_dump` needs, and the
> failure is confusing: a dump that starts and then stops.

### Restoring

```sh
createdb forum_restored
pg_restore --no-owner --no-privileges --dbname="$RESTORE_URL" board.dump
```

Restore into a **new database** first and point a staging deployment at it. A
restore over a live database is how a bad backup becomes two lost boards.

Then check three things, in this order:

1. `select count(*) from posts;` — is the content there?
2. Sign in as an administrator — did the credentials survive?
3. `community migrate` — it applies anything missing and reports what it did, so on
   a good restore it says there was nothing to do.

### Rehearse it

A backup nobody has restored is a file, not a backup. Restore one into a scratch
database before you need to, and note how long it took: that number is your
recovery time, and an incident is the wrong moment to find it out.

## Connection pooling

**Running the documented deployment? Skip this section.** A board on its own
Postgres, with a fixed number of server processes in front of it, opens a
bounded number of connections and needs no pooler. Use the ordinary connection
string.

This is for a board pointed at a *managed* database — Neon, Supabase and their
kind — and it is worth reading before you point one at it.

> [!CAUTION]
> **It does not break during testing.**

Those providers hand out two connection strings, and the difference only shows
under load: on the direct one, every process that scales up opens its own
connection, Postgres runs out at around a hundred, and the board that worked
perfectly while you were the only visitor starts refusing connections the first
day it is busy — with an error that names the database rather than the cause.

**Use the transaction-mode pooler string.** On Supabase that is port `6543`, not
`5432`. The installer used to warn about this and no longer does: it could only
guess from the shape of the URL, and on a board running against its own Postgres
— which is the deployment this handbook documents — the direct string is correct
and the warning was noise.

Two consequences:

- **Prepared statements are off.** A transaction pooler hands a different backend
  to each transaction, so a prepared statement from one is not there for the
  next. The database layer is configured for this; a plugin issuing raw SQL
  should be too.
- **`pg_dump` and DDL want the direct URL.** Both need session-level state. Set
  `DIRECT_DATABASE_URL` for migrations when your provider offers both strings —
  a migration's advisory lock is invisible through a transaction pooler, which
  is what lets two deploys interleave schema changes.

## Troubleshooting

### Nothing happens on a schedule

*Bans do not expire, digests do not send, counters drift, uploads are not swept —
and nothing errors, because nothing ran.*

1. Check `/admin/system`. The tick's status is there, and a stale one is called
   out loudly.
2. Check something is actually running the tick. **On the documented deployment
   that is the `worker` container, which runs the loop in-process** — it does not
   call `/api/system/tick` and does not need `TICK_SECRET` to do its job.
   `docker compose ps` should show it up, and `docker compose logs worker` should
   show `worker started` **once** rather than every few seconds, which is a crash
   loop with the reason logged above each restart.
3. If instead you drive the tick from outside — a cron, a platform scheduler, the
   `curl-tick` sidecar — then it is the route that runs it, and `TICK_SECRET`
   has to be set *and* presented. A caller with the wrong secret gets a 404,
   deliberately, so an unauthorised caller cannot confirm the endpoint exists;
   from the caller's side that looks identical to a wrong URL. (An *unset*
   secret would leave the route open, which is why production refuses to boot
   without one.)

Notification and mass mail are delivered on this tick, so a stopped one is also
a board that has stopped sending them — see [Mail](#mail). Verification and
password-reset links do not wait for it; if *those* are missing, mail itself is
what to check, and the **Send a test message** button on
`/admin/settings?group=mail` settles it in one click.

### The installer's "migrate" step says it cannot find `meta/_journal.json`

The migrator was looking in the wrong place. The generated SQL is *data*, so
Next never traces it into the standalone output — the Dockerfile copies it to
`/app/migrations` instead, and a build where that copy did not happen leaves the
web server with no migrations to apply.

Check the folder is in the image (`docker compose run --rm web ls /app/migrations`)
and rebuild if it is not. If your deployment keeps the SQL somewhere else, name
it with `MIGRATIONS_DIR` and redeploy.

Nothing has been written when this fails: migrations are the installer's first
step, and it stops at the first failure precisely so a retry is safe.

### "Too many connections"

See [connection pooling](#connection-pooling). It is almost always the direct
connection string.

### The admin panel 404s

Three possibilities, in order of likelihood:

1. `ADMIN_IP_ALLOWLIST` is set and your address is not in it. The panel answers
   404 rather than 403 from outside the allowlist — its value is being invisible.
2. Your account is not in a group with `admincp.access`.
3. Your admin session expired. It has a 30-minute idle timeout and an 8-hour
   ceiling, both separate from your board session.

### A member cannot see a forum they should

Open `/admin/forums` for that forum and read **the row for their group** rather
than reasoning about the combination. Each cell says what it resolves to and
where it inherited from.

The usual cause is an explicit deny somewhere up the tree, which inheritance
carries down.

### Counters look wrong

`/admin/system` → **Recount & Rebuild**. It is resumable and safe to run on a
live board.

If they drift *again* afterwards, the outbox is not being drained — see the tick,
above.

### An imported board's old links 404

`board.legacy_redirects` is off by default. Turn it on at `/admin/settings`.

It needs an import to have run, because the redirect is a lookup in the legacy id
map.

Switched on, it answers both shapes a MyBB board publishes:

| Old address | Goes to |
|---|---|
| `showthread.php?tid=91`, `Thread-Bikeshedding-91` | the thread |
| `showthread.php?pid=4102`, `Thread-Bikeshedding--4102` | the post |
| `forumdisplay.php?fid=3`, `Forum-General-3` | the forum, slug and `?page=` carried |
| `member.php?uid=12` | the member |
| `index.php` | the board index |

The answer is a **308**, not a 301: it is `permanentRedirect()`, and the
difference is that 308 forbids a client rewriting the method on the way, which
301 historically permitted. Search engines treat the two the same way, so an
imported board's ranking follows either.

Two shapes are deliberately not answered. `Thread-Bikeshedding-page-2` carries no
id, and picking a thread from the words in a slug is guessing; `User-wren` is a
username rather than an id, and a username can be changed or taken by somebody
else, so resolving one could point an old link at the wrong member.

### Everything is broken and the panel will not load

The CLI does not need the web app:

```sh
community env:check       # is the environment valid? (no connection is opened)
community settings:list   # what the board thinks its settings are
community task:list       # what is scheduled, and how often each runs
community migrate         # apply anything the schema is missing
```

`community --help` lists everything. The commands that exist are the ones listed
there — this project does not document a command it has not written, so if one
you expected is missing, it is missing rather than hidden.

### Getting help

Every error page carries a **request id**. Quote it. The board's logs are
correlated by it, and it turns "a page broke" into one grep.
