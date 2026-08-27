# Demo mode

A public board with its password printed on it, seeded with content, that
deletes everything and rebuilds itself on a timer. It is what runs at
[demo.meith.dev](https://demo.meith.dev).

This is not a lighter board or a read-only preview. It is the whole
board — posting, moderation, the admin panel, search, the background
tick — with the outbound surfaces disarmed, because on a demo everybody
who visits is an administrator.

> [!WARNING]
> Never set `DEMO_MODE` on a board with real members. The reset drops
> every table in the database. On a demo that is the feature; anywhere
> else it is the end of the board.

## Turning it on

```sh
DEMO_MODE=1
DEMO_RESET_MINUTES=60     # 5–1440, default 60
```

`DEMO_MODE` requires `DATA_SOURCE=postgres`, and the board refuses to
boot without it: a demo whose visitors cannot post is a screenshot, and
[fixture mode](../../contributing/development.md#fixture-mode) has no write side to offer
them.

## What a visitor gets

Three logins, printed in a strip at the top of every page:

| Username | Password | What it demonstrates |
|---|---|---|
| `admin` | `admin` | The whole admin panel: settings, permissions, themes, plugins, tasks. |
| `moderator` | `moderator` | The moderation queue, reports, warnings — without the admin panel. |
| `member` | `member` | An ordinary account, and everything an ordinary account cannot do. |

`admin` is five characters and the board's own policy wants more. The
seed writes the hash directly rather than going through registration, so
the policy stays honest for every account created *after* the seed —
including the one a visitor makes themselves.

### The board they land on

It is one club: a committee, a juvenile section, a Saturday team, a
Tuesday-night gaming crew, and the people who come for the quiz and never
the sport. That is deliberate: one club with twenty ordinary forums shows
a fixture, a raid roster, a lost gear bag and an AGM sitting in the same
lists without any of them being a special case.

The content is written out rather than generated, because forty threads
called "Test thread 12" demonstrate nothing about whether the software
can hold a conversation:

- **20 forums in five categories**, carrying **157 threads and 896
  posts**.
- **51 members**, with join dates spread over the board's history and
  post counts they earned by writing the posts.
- **Six polls** with 94 votes cast by named accounts, eleven stickies,
  four locked threads, and 74 replies that quote the post they answer.
- **257 thanks** on posts, ten private messages, a post held in the
  moderation queue and two open reports — an empty ModCP demonstrates
  nothing, so it is not empty.
- **Eight thread prefixes** — Fixture, Sign-up, Result, For sale,
  Wanted, Sold, Notice, Solved — each scoped to a branch of the tree
  rather than offered everywhere, which is the setting that keeps a
  prefix list usable as a board grows.

Every timestamp is an **offset from the reset**, not a date: the newest
post is always minutes old and the board is always about six hundred
days into its life, whenever you happen to visit.

### The two sections not everybody can see

Most of the board is public. Two whole sections are not, because "can
this software do a private forum" is a question nobody should have to
take on trust — and one forum with a padlock on it would not answer it:

| Section | Forums | Who sees it |
|---|---|---|
| **Committee room** | Committee business · Moderation desk · Welfare and safeguarding · Staff room | The three staff groups |
| **Supporters' club** | Supporters' lounge · Where the money goes · First look · The supporters' draw | Anyone on a Supporters plan, and the staff |

**They are the first two sections on the board**, above *Start here*. A
section a member cannot read is not shown to them at all, so putting the
restricted ones at the bottom would hide the demonstration from exactly
the people who logged in to see it. An ordinary member lands on *Start
here* and a board of twelve forums; `admin` lands on the committee room.

**A forum you cannot read is not shown to you at all** — no padlock, no
greyed row, no "you do not have permission" page. The forum tree is
built from the forums the reader can see, so as far as `member` is
concerned the board has twelve forums and always did.

Neither section is a special kind of forum. Both are ordinary categories
with per-group permission rows written on the category *and* on every
forum under it — the same rows an administrator writes on the
permissions screen, so the screen answers "who can read this?" on
whichever one you open. The staff rows are written in explicitly rather
than left to the administrator bypass, so the answer is readable on the
screen — and so the sections stay shut even if a visitor rewrites the
registered group's defaults, which a demo invites.

The supporters section is the more interesting of the two: **nobody
grants or revokes access by hand.** The plan expires, the group
membership goes with it, and the section disappears for that member on
their next page load.

What is in them is written to be worth finding: a €6,000 sponsorship
offer from a betting company and the committee saying no in writing, a
member asking to have every post they wrote removed, a safeguarding date
running out, three drainage quotes with the cheap one ruled out and why.
On the supporters' side, a quarter's accounts itemised to the euro, next
season's jersey before it is public, and a draw pulled out of the
groundsman's hat.

### The staff are visible at a glance

The three staff groups carry a name colour, set on the groups screen and
applied everywhere a name appears:

| Group | Light | Dark |
|---|---|---|
| Administrators | `#b91c1c` | `#f87171` |
| Super Moderators | `#1e3a8a` | `#60a5fa` |
| Moderators | `#0284c7` | `#7dd3fc` |

Two values per group rather than one, because a colour that reads on
paper-white disappears at midnight. The board emits them as stylesheet
rules rather than inline styles — the only place both answers can live
for a reader whose colour scheme is "system". Supporters get a fourth
colour from the plugin, which is how a plugin-granted group looks when
it is doing its job.

## The themes

`SHOWCASE_THEMES=1` is set in the demo's compose file, so the demo
registers every theme this repository ships rather than the default
alone: **Midnight** (the terminal), **Phasebook** (the familiar social
shape), **Raidframe** (the game-board HUD) and **Clubhouse** (the sports
club). All five sit in the appearance control at the foot of every page,
and a visitor picks one without signing in — the choice is a cookie the
server reads, so the page arrives already painted.

The flag is the demo being a shop window and decides nothing for a board
of your own: yours starts with the default theme and adds what it wants
in `community.config.ts`, a file you own and the flag never touches.

## The shop, and a Stripe that is not Stripe

Demo mode installs two plugins — [Dues](../../README.md), which sells
membership of a usergroup, and [Calendar](../../README.md), which puts
the community's events on a page and beside the threads that discuss
them — because a
plugin nobody can click is a paragraph rather than a demonstration. Both
are registered by the flag in `community.demo.plugins.ts`, the demo's own
file, so that `community.plugins.ts` — the file a board of your own lists
its plugins in — stays a list you can read at a glance.

The seed writes the shop and a year of its history: four plans (a €5
monthly subscription, a €12 90-day pass, a €99 lifetime, and a founding
pass taken off sale whose holder still holds it), three discount codes,
and eight memberships covering every state the administrator's desk can
act on — renewed and healthy, a failed renewal inside its grace window,
cancelled and running to the end of its period, revoked by a refund, a
gift, and a lifetime comped with a 100%-off code. Every one of them went
through the same settlement path a Stripe webhook drives, with the clock
wound back for each step, so the desk shows what a year of selling looks
like rather than what a fixture looks like.

The `supporters` group those plans grant is created by the board seed
rather than the plugin, and ticked **may be granted by plugins** — the
tick an administrator gives by hand on any other board. Seeding the
board without the plugin leaves the group and the four forums in place
with nobody but the staff in them, which is exactly what an unsold plan
looks like.

**A visitor can buy.** The board serves its own Stripe at
`/demo/stripe` — the API the plugin calls (`DUES_STRIPE_API_BASE` points
back at the board) and the checkout page a buyer lands on, which says
**NOT STRIPE** at the top, asks for no card, and takes no money.
Pressing *Pay* does what Stripe does: it sends the board a signed
`checkout.session.completed` event, and the webhook — signature
verified like any other — is what turns the payment into membership.
Nothing is granted by the redirect, here or anywhere.

> [!WARNING]
> The fake exists only under `DEMO_MODE`; the route 404s without it.
> Never point a board with real members at `DUES_STRIPE_API_BASE` on its
> own host.

What the fake costs the demo is one honest gap: it forgets everything on
a restart, and answers for a checkout it no longer remembers by calling
the session expired — which is what Stripe does with an abandoned one,
and what the plugin's reconcile task is written to handle.

## A calendar with a season in it

The seed furnishes the Calendar plugin the same way, and for the same
reason: an empty agenda demonstrates nothing. It writes eight events
placed relative to the moment the board is seeded — six ahead and two
behind — so the page shows a season rather than a fixture, and so the
**Upcoming** and **Past** views both have something in them however long
after the reset a visitor arrives.

The events are spread across three months, so the agenda shows the month
headings it groups by. Five of them name a thread the seed also writes —
the bus to Ballyquin, the raid night, the U14 blitz, the table quiz, the
summer camp — and those threads carry the event card above the first
post, which is the plugin's `thread.header` region doing what it does on
any board. Three carry a link with words of their own — *Join online* to
a video call, *Get tickets* to a ticket page, *Offer to help* to a form —
and the rest carry none, which is what the field looks like left empty.
Every link points at `example` hosts that go nowhere on purpose. One
event has no finish time, so the agenda shows an open-ended one beside
ones that end.

`admin`, `siobhan` and `gerry` are seeded onto the organiser roster, so
the published administrator account can add an event and delete one, and
a visitor signed in as `member` sees the agenda without the form — the
two halves of the plugin's permission model, both visible without
touching the admin panel.

## What demo mode changes

Each guard closes a hole that only exists because the administrator
password is published:

| Guard | Why |
|---|---|
| **Mail is pinned to nowhere** — resolved before the environment and before the settings table. | `MAIL_DRIVER=log` falls through to the settings table, which on a demo is written by whoever visited last. Without this, a visitor fills in the SMTP screen and the host is an open relay. |
| **Webhook delivery is never registered** — the task does not exist, rather than existing and refusing. | A visitor could point a webhook at any address that resolves from the host, and the board would make the request for them, on a schedule. |
| **The login lockout is relaxed** — 50 attempts per address, a one-minute lockout, and a 500-attempt account-wide backstop. | The counters are per account. One visitor mistyping `admin` five times would otherwise lock the published login for everybody else. Relaxed, not removed — it is still a login form on the open internet. |
| **The published logins cannot change password, e-mail, username or sign-in method.** Everything else about them is fair game. | All four would lock the next visitor out. Renaming `admin` would leave the banner naming a login that no longer exists, and a second factor added to a shared login is a code only the visitor who added it can produce. The refusal is reported on the page, not as a failed request. |
| **No visitor's address is written down** — not against the account, not on the session, not in the security log or the log the panels write, and not in what a plugin is handed. | Every visitor is signed in as the same three accounts, so every row those accounts leave behind is read by whoever logs in next. See [the addresses nobody keeps](#the-addresses-nobody-keeps). |
| **`robots.txt` disallows everything.** | Half of what a crawler stored would be a 404 within the hour, and the other half is whatever an anonymous visitor typed on a board carrying the project's domain. |

Nothing else is held back. A visitor can delete every forum, rewrite the
permission matrix, switch themes, ban the moderator and turn the board
off. All of it is undone by the next reset — and watching someone do it
is a better demonstration than a disabled button.

### The addresses nobody keeps

An ordinary board truncates a visitor's address to a `/24` or a `/48` and
keeps the range in four places: on the account — once at registration,
and again on every sign-in — on the session, in the security log, and in
the log the panels write. The first of those is what the ModCP's address
lookup and the member search's **IP** filter read, and on any other board
the person reading it is the board's own staff.

On a demo there is no such thing as the board's own staff. `admin` is
published, so the reader is a stranger who signed in a minute ago, and
the range they are reading belongs to the stranger before them. So a demo
writes none of it: every one of those columns stays null, and every
screen that shows one says the address was not recorded. The address is
resolved as usual — the control panel's allowlist still has to be
answered — but it is gone by the end of the request.

The shortened user-agent string beside it is kept, because the sessions
screen and the security log are worth demonstrating and a browser name is
not a location.

**The counters still count.** A login lockout that cannot tell two
visitors apart is a lockout on the published login, and an hourly limit
that cannot is a limit on the demo. So the demo counts against a token
instead: a hash of the address under a random salt drawn once, in memory,
at boot. It is never written down and does not survive a restart, which
is what makes it a token rather than a slower way of storing an address —
an IPv4 space is small enough to enumerate, so an unsalted hash of an
address *is* the address. The bucket rows the counters leave behind carry
the token, and nothing else about the request.

**The address tools still demonstrate.** The 51 seeded members carry
invented prefixes in `198.18.0.0/15`, the range reserved for benchmarking
and routed to nobody, so the lookup, the filter and the "same range as"
question have something to answer with — the same ranges on every reset,
because they are derived from the account rather than rolled. Every one
of them is fiction. Nothing a visitor's browser sends ever joins them.

An address is truncated in one place in the board — `retainedIpPrefix()`
in `apps/community/src/server/request-fingerprint.ts` — and `pnpm guards`
refuses a second call site anywhere in the app. A new one would be a
column that fills up on the demo and stays empty everywhere else, which
is the kind of gap no test on a board with real members can see.

## The reset

`demo.reset` is a scheduled task, registered only when `DEMO_MODE` is
set, and only in the web server's task list. It drops the schema,
replays the migrations — the core ones and then every installed
plugin's, because the drop took the plugin's tables too — seeds the
board back, clears the uploads directory and invalidates the cache. Ten
seconds or so, during which the board is genuinely unavailable: the
tables are not there.

**The schema is dropped rather than truncated**, and that is the whole
design. Truncating would leave behind everything the migrations
seeded — the usergroup ladder, the warning types, the permission
defaults — and those are exactly the rows a visiting administrator can
wreck. A reset that cannot restore the guest group's permissions cannot
fix the most likely thing to need fixing.

By hand, or from a cron of your own:

```sh
community demo:reset --yes     # drop, migrate, seed
community demo:seed            # seed an already-migrated empty database
```

Both refuse to run unless `DEMO_MODE` is set.

### Why the demo runs no worker

The reset has to clear the web server's cache, and the cache is a map in
the web server's own process. A reset run by the worker would leave the
web server serving the forum tree of a board that no longer exists for
up to the tree's 60-second TTL — on the one page every visitor lands on.

So the demo drives the tick against the web server instead: a `ticker`
service calls `/api/system/tick` every minute, and every task runs in
the process that can see the consequences. That is why
`docker/compose.demo.coolify.yml` has no `worker` service, and why it is
not the ordinary compose file with a flag added.

## Deploying one

[`docker/compose.demo.coolify.yml`](../../../docker/compose.demo.coolify.yml)
is a third Coolify resource beside the board and the site, from the same
repository. Point Coolify at it, give it a domain, and it generates the
secrets and the database password itself.

It differs from the board's compose file in four ways:

- **No worker** — the `ticker` service drives the tick over HTTP, for
  the cache-locality reason above.
- **No volumes** — a redeploy should be as clean as a reset.
- **A `seed` one-shot in place of `migrate`**, running the same
  `demo:reset` the hourly task runs, so the board a visitor finds one
  minute after a deploy is the board they would find one minute after
  any reset.
- **It builds the image from the repository** rather than pulling the
  pinned release — the demo tracks `main`, deliberately ahead of any
  release.

It also carries the Dues plugin's three variables, all three the
fake's: a secret key no Stripe account answers to, a generated webhook
signing secret, and
`DUES_STRIPE_API_BASE=http://127.0.0.1:3000/demo/stripe` — the board
talking to itself.

## What it costs you

A public board where anyone can post, on a subdomain of yours. The reset
bounds how long anything stays up, `robots.txt` keeps it out of search,
and no mail or webhook can leave the host — but for the length of one
reset interval, the content on that domain is whatever the internet
typed. Pick `DEMO_RESET_MINUTES` with that in mind rather than the
seed's size in mind: the reset is cheap.

One thing works in your favour, and it is the shipped default rather
than anything demo mode does: the guests group can read, search and
download, and cannot post. The demo leaves that alone. Posting needs one
of the published logins, and spam bots do not log in.
