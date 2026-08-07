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
| `forum.config.ts` | What is *installed*: themes and plugins. | An edit and a redeploy |
| `/admin/settings` | Everything else: board name, registration mode, posting limits, search, mail. | Nothing — it takes effect immediately |

**Why the split.** Anything in `forum.config.ts` has to be visible to the
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
| `AUTH_SECRET` | Yes | Signs sessions and tokens. No default, deliberately. |
| `TICK_SECRET` | Depends how you tick | Guards `/api/system/tick`, and without it that route refuses every call. It is **not** what drives the tick on the Docker Compose stack: the `worker` container runs the loop in-process and never calls the route, so scheduled work happens there either way. Required if anything external — a cron, a platform scheduler, the `curl-tick` sidecar — is what calls it. |
| `APP_URL` | No | The board's public origin, absolute and with no trailing slash. Optional since the installer began asking for it: unset, it comes from **Board address** in the settings, and set here it wins and the settings field goes read-only. Something has to supply it — a digest sent from the worker has no request to be relative to. |
| `MAIL_DRIVER` | No | `log`, `http` or `smtp`. Optional for the same reason as `APP_URL`: `http` or `smtp` here wins outright and makes the mail settings screen read-only, while `log` or unset leaves mail to the board. See [Mail](#mail) for the companions each transport needs. |
| `DATA_SOURCE` | No | `postgres` or `fixture`. Defaults to `fixture` when `DATABASE_URL` is unset. |
| `ADMIN_IP_ALLOWLIST` | No | Comma-separated address prefixes. Empty allows everything. |
| `FILESTORE_DRIVER` | No | `local` or `s3`. Defaults to `local`, which is right for a board with a disk. See below. |
| `MIGRATIONS_DIR` | No | The folder holding the generated SQL and its `meta/_journal.json`. Normally unset — the migrator looks beside `@meith/db` in a checkout and in `/app/migrations` in the image, which is where the Dockerfile puts it. Set it only if yours is somewhere else. |

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
forum settings:list          # the whole registry, with defaults
forum settings:get board.name
forum settings:set board.name "The Townland"
```

## The operator CLI

Everything you should not need a browser for: migrations, users, forums,
settings, scheduled tasks, search reindexing. It ships **inside the image**, so
a deployed board needs no checkout, no toolchain and no Node on the host.

How you reach it depends on how the board was deployed:

| | |
|---|---|
| **Coolify** | Open the `web` container's terminal in the panel, then `node apps/cli/cli.cjs <command>`. |
| **Docker Compose** | `docker compose run --rm --no-deps web node apps/cli/cli.cjs <command>` |
| **A checkout** | `pnpm forum <command>` |

`--rm` matters on Compose: without it every invocation leaves a stopped
container behind. `--no-deps` matters too — without it, each command re-runs the
whole migration container first, which is harmless and slow enough to be
confusing.

The rest of this page writes **`forum <command>`**, which is worth making true
on a Compose board:

```sh
alias forum='docker compose -f ~/meith/docker-compose.yml run --rm --no-deps web node apps/cli/cli.cjs'
```

```sh
forum --help                     # everything it can do
forum env:check                  # is the environment valid, and can it connect?
forum user:create --admin        # a second administrator, or the first if /install is sealed
forum user:promote               # administrator access on a board that already works
forum task:run                   # run the tick once, by hand
forum search:reindex             # after a large import, to hurry the tick along
```

Search indexes itself. `search.reindex` runs on the tick every ten minutes and
covers every case that leaves a post unindexed — an import, a restored dump, an
upgrade that changed what the index holds. `forum search:reindex` does the same
work now instead of over the next few ticks, and runs to completion rather than
one batch at a time; the Admin CP's button is the same thing, one batch per
click. None of the three is a prerequisite for search working.

The commands that exist are the ones `--help` lists. This project does not
document a command it has not written, so one you expected and cannot find is
missing rather than hidden.

## Permissions

Around 45 permission fields, resolved per member per forum. Every read path —
pages, search, feeds, the REST API — asks the same resolver, so there is no route
that quietly reads around the rules.

### The three layers

Permissions resolve in this order. Understanding the order is most of
understanding the model.

1. **Group permissions** — the floor. A member's groups are combined, and a
   boolean is granted if *any* of their groups grants it.
2. **The forum matrix** — per forum, per group. Each cell has three states:
   inherit, grant, deny.
3. **Moderator rights** — per forum, per member or group, granted separately.

> [!IMPORTANT]
> In the forum matrix, **empty means inherit** — it is not the same as "no".
> That is why each cell is a three-state control rather than a checkbox: a
> checkbox writes an explicit value into every cell the first time you save,
> pinning that forum so later changes at its parent do nothing. Silently pinning
> a forum is the commonest way a board's permissions end up wrong.

### Numbers behave differently from switches

Numeric permissions — maximum post length, attachments per post — combine as the
**most generous** value across a member's groups.

> [!NOTE]
> **`0` means unlimited, not none.** A cell showing `0` is not a restriction.

### Reading the matrix

`/admin/forums` holds it. Each cell shows what it resolves to *and which forum it
inherited from* — "inherit" on its own tells nobody anything.

**Copy to subforums** means *identical*, not *merged*. It clears rows the source
forum does not have, because a descendant that denied something the source
inherits would leave you with two forums you had just been told now match. The
change is previewed cell by cell before it applies.

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
  is simply not applied in that scheme.
- **A badge**, as two uploads, light and dark, on the same terms as the board
  logo — the bytes decide the format rather than the file name, and SVG is
  accepted. Upload one and it is used in both schemes. It appears beside the
  group's title in the postbit.
- **The title**, which is what shows under a member's name on every post.

A member's group is their **display group** where they have chosen one, and
their primary group otherwise — so a moderator who prefers to post as an
ordinary member is shown as one.

The colour reaches **every** username: the postbit, who started a thread, who
posted last, the profile heading, who is online. It is delivered as a stylesheet
rule rather than a colour on each name, which is why it works for a reader whose
dark mode comes from their operating system rather than from the board's own
control — that reader's page carries no dark-mode class for a theme to match on.

> **Check the contrast.** Nothing stops you setting a pale yellow no reader can
> make out on a white page. Beneath each picker is a sample of the name on the
> surface it will really be on — light beside dark, both painted from the
> board's own palette rather than inherited from the screen you are looking at,
> so the light sample is light even if your machine is set to dark mode. It is
> there to be looked at.

## Themes

A theme is a package named in `apps/forum/forum.config.ts`. Installing one is
three steps, in your checkout of the board:

```sh
pnpm --filter @meith/web add @meith/theme-midnight
```

```ts
// apps/forum/forum.config.ts
import midnight from "@meith/theme-midnight"

export default { theme: midnight }
```

Then commit, push, and redeploy — the image is rebuilt from your repository, so
an installed theme is a commit rather than a state the server drifts into.

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
> `defaultTheme` in `forum.config.ts` is now the *fallback*: what the board
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
- **Custom CSS.** On a board with more than one theme enabled this is nested
  under that theme's own selector, so it stops applying when a member picks
  another one. A rule aimed at `:root` will not match there — target `body` or a
  class.
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

Writing a theme: [The theme API](./theme-api.md). Every slot and view model:
[Theme slots](./theme-slots.md).

## Cookies and consent

The board sets five cookies of its own and no third-party ones:

| Cookie | What it is for |
|---|---|
| session, remember-me | signing in |
| CSRF | protecting the forms of that session |
| `meith_theme`, `meith_scheme` | the appearance controls, written only when a member presses one |
| `meith_consent` | the answer to the notice below |

Under the ePrivacy Directive all of those are either strictly necessary or set
in direct response to something the reader explicitly asked for, so none of them
is what a consent notice is about. **The notice is about the optional analytics**
— the one thing here a reader has a genuine interest in refusing — and refusing
means the script is never rendered, not that it loads and is asked to be quiet.

`privacy.cookie_consent` (Settings → Privacy) decides who is asked:

| Setting | Behaviour |
|---|---|
| **Where required** (default) | Asks in the EEA, the UK and Switzerland — and asks when the visitor's country is unknown |
| **Everywhere** | Asks every visitor |
| **Never ask** | Shows no notice, and analytics run for everyone |

The country comes from whatever header the CDN in front of the board sets —
`cf-ipcountry` behind Cloudflare, and one of a handful of equivalents elsewhere.
A board behind no CDN has no such header, and "unknown" is treated as in scope on purpose: a
notice somebody did not need is a smaller mistake than processing a European
reader's data without asking. If that is not the trade you want, say so in the
setting rather than living with the guess.

Accepting and refusing are one click each, side by side, and the choice can be
changed afterwards from the appearance strip at the foot of any page.

> This is a mechanism, not legal advice. What your board must ask and record
> depends on what it does with the data, which is yours to decide.

## Plugins

Same shape as a theme: add the package, a line in `forum.config.ts`, a redeploy.

> [!NOTE]
> There is no upload-a-zip path, and there will not be one. A plugin discovered
> at runtime is a plugin the bundler never saw — it would work in development
> and be absent from the production build.

### What a plugin cannot do

It cannot decide authorization, reach the visibility filter, open its own
database connection, or patch core. Everything it *can* do is in a typed
registry.

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
| Not in the build | The plugin is not in `forum.config.ts`. | Edit the config, redeploy |
| Switched off | Somebody pressed the button on this screen. | Press it again |
| Failing | The server stopped calling it after repeated errors. | The error is on the plugin's own page |

**The disable button is durable.** It takes effect on every instance, not just
the server that handled the click, and it survives a redeploy. Reach for it when
a plugin is misbehaving — you do not need to deploy to stop one.

**The panel never runs migrations.** It tells you which are outstanding;
`forum upgrade` applies them.

> [!WARNING]
> A plugin with unapplied migrations is running against a schema that does not
> have what it expects. Treat that line as urgent, not informational.

### Removing one

`npm uninstall`, a line out of `forum.config.ts`, a redeploy — the three install
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

### Attachments

**Deleting an attachment does not touch the post it was on.** Attachments are
listed beside a post rather than written into it, so removing one takes an entry
off a list and nothing else. The bytes go to the hourly sweep rather than being
deleted immediately.

### Announcements

**An announcement is not a pinned thread.** Nobody can reply to one, it expires
on its own date, and removing it removes nothing anybody wrote — which is why it
is safe to delete and a sticky thread is not.

Dates are entered in UTC.

## Reputation

`/admin/settings` under **Reputation**. Four switches, and the first two decide
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
`forum settings:set` can write. That matters exactly once, and it is the once
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
forum settings:set mail.transport smtp
forum settings:set mail.smtp_host smtp.provider.example
forum settings:set mail.from noreply@yourdomain.com
forum task:run                     # run the tick once, so queued mail leaves now
```

The two secrets are write-only from the operator's side: the panel renders them
as empty password boxes and a blank one means *unchanged* rather than *clear it*,
and `forum env:check` and the audit log both refuse to print them. To clear one
deliberately, set it to the empty string.

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
`https://forum.example/board` is rejected on the way in, because every link the
board built from it would carry `/board` in the middle.

## Spam

Registration questions are at `/admin/antispam`; the numbers are in
`/admin/settings` under **Anti-spam**.

Everything except the hidden-field trap ships switched off. A fresh board has no
spam on it, and a feature that arrives switched on introduces itself by breaking
your registration form.

### What each control is actually worth

| Control | Stops | Costs a real visitor |
|---|---|---|
| Hidden-field trap | Bots that fill every field | Nothing. Leave it on. |
| Minimum fill time | Instant submissions | Occasionally somebody with a password manager. Keep it to a few seconds. |
| A question | Scripted registration | A moment, every time. Switch it on when you have a problem. |
| Hold first posts | Nearly all forum spam | One wait per genuine new member. |
| Hourly limits | A night's work by one script | Nothing, set sensibly. |

> [!TIP]
> **Holding a new member's first posts is the effective one.** Spam accounts post
> once or twice and never come back, so a threshold of two or three catches most
> of it. Held posts go to the moderation queue like anything else.

### Limits and the flood interval are different controls

| | What it bounds | What it stops |
|---|---|---|
| Flood interval (`posting.flood_seconds`) | The minimum gap between two actions | A double-click |
| Hourly limit | How many actions in an hour | A script posting steadily all night |

A script satisfies any interval you would be willing to set — every 31 seconds,
all night, is thousands of posts and never breaks the rule. Use both. Members
with **bypass flood check** are exempt from both.

Limits are counted in the database, so every instance of your board shares one
allowance rather than getting one each. The counters are pruned hourly by the
tick; if the tick is stopped they accumulate, but `/admin/system` will tell you
the tick is stale long before this becomes your problem.

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

## Migrations

Migrations are **forward-only**. There is no down migration and there will not be
one: a migration that drops a column is a data-loss button on a live board, and
some migrations cannot be reversed at all, so a "roll back" that worked for half
of them and silently did nothing for the rest would be worse than its absence.

```sh
forum migrate      # core only
forum upgrade      # core, then plugins, then record the version
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
3. `forum migrate` — is the schema at the version the code expects?

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
   has to be set *and* presented. Without it the route answers 404 to everything,
   deliberately, so an unauthorised caller cannot confirm the endpoint exists;
   from the caller's side that looks identical to a wrong URL.

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

### Everything is broken and the panel will not load

The CLI does not need the web app:

```sh
forum env:check       # is the environment valid, and can it connect?
forum settings:list   # what the board thinks its settings are
forum task:list       # what is scheduled, and when each last ran
forum migrate         # is the schema behind the code?
```

`forum --help` lists everything. The commands that exist are the ones listed
there — this project does not document a command it has not written, so if one
you expected is missing, it is missing rather than hidden.

### Getting help

Every error page carries a **request id**. Quote it. The board's logs are
correlated by it, and it turns "a page broke" into one grep.
