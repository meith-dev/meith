# Demo mode

A public board with its password printed on it, seeded with content, that
deletes everything and rebuilds itself on a timer. It is what runs at
[demo.meith.dev](https://demo.meith.dev).

This is not a lighter board or a read-only preview. It is the whole board —
posting, moderation, the admin panel, search, the background tick — with the
outbound surfaces disarmed, because on a demo everybody who visits is an
administrator.

> [!WARNING]
> Never set `DEMO_MODE` on a board with real members. The reset drops every
> table in the database. On a demo that is the feature; anywhere else it is the
> end of the board.

## Turning it on

```sh
DEMO_MODE=1
DEMO_RESET_MINUTES=60     # 5–1440, default 60
```

`DEMO_MODE` requires `DATA_SOURCE=postgres`, and the board refuses to boot
without it. A demo whose visitors cannot post is a screenshot, and
[fixture mode](./development.md#fixture-mode-and-why-it-exists) has no write
side to offer them.

## What a visitor gets

Three logins, printed in a strip at the top of every page:

| Username | Password | What it demonstrates |
|---|---|---|
| `admin` | `admin` | The whole admin panel: settings, permissions, themes, plugins, tasks. |
| `moderator` | `moderator` | The moderation queue, reports, warnings — without the admin panel. |
| `member` | `member` | An ordinary account, and everything an ordinary account cannot do. |

`admin` is five characters and the board's own policy wants eight. The seed
writes the hash directly rather than going through registration, so the policy
stays honest for every account created *after* the seed — including the one a
visitor makes themselves.

### The board they land on

It is one club: a committee, a juvenile section, a Saturday team, a Tuesday
night gaming crew, and the people who come for the quiz and never the sport.
That is deliberate. A demo split into a *Sports* wing, a *Gaming* wing and a
*Community* wing shows every visitor two-thirds of a board that is not for them;
one club with fourteen ordinary forums shows a fixture, a raid roster, a lost
gear bag and an AGM sitting in the same lists without any of them being a
special case.

Written out rather than generated, because forty threads called "Test thread 12"
demonstrate nothing about whether the software can hold a conversation:

- **14 forums in three categories**, carrying **115 threads and 658 posts**.
- **51 members**, with join dates spread over the board's 636 days and post
  counts they earned by writing the posts.
- **Four polls** with 75 votes cast by named accounts, seven stickies, three
  locked threads, and 53 replies that quote the post they answer — so the
  attribution, the member's name linked and the link back to what was quoted, is
  on the board rather than only in these documents.
- **183 thanks** on posts, eight private messages, a post held in the moderation
  queue and two open reports. An empty ModCP demonstrates nothing, so it is not
  empty.
- **Eight thread prefixes** — Fixture, Sign-up, Result, For sale, Wanted, Sold,
  Notice, Solved — each *scoped to a branch* of the tree rather than offered
  everywhere, which is the setting that keeps a prefix list usable as a board
  grows.

### Two forums not everybody can see

Most of the board is public. Two forums are not, because "can this software do a
private forum" is a question nobody should have to take on trust:

| Forum | Who sees it | How |
|---|---|---|
| **Committee room** | The three staff groups | `canView` denied to guests, registered, awaiting-activation, banned and supporters |
| **Supporters' room** | Anyone on a Supporters plan, and the staff | The same, minus the supporters group — whose membership the Dues plugin grants and revokes on its own |

**A forum you cannot read is not shown to you at all** — no padlock, no greyed
row, no "you do not have permission" page. The forum tree is built from the
forums the reader can see, so as far as `member` is concerned the board has
twelve forums and always did. Log in as `admin` and there are fourteen,
including a committee thread about a member asking to have their posts removed,
which is the kind of conversation a private forum is actually for.

Neither is a special kind of forum. Both are ordinary forums with per-group
permission overrides on them, the same rows an administrator writes on the
permissions screen, and the admin panel shows exactly who can read what.

The supporters one is the more interesting of the two: **nobody grants or
revokes it by hand.** The plan expires, the group membership goes with it, and
the forum disappears for that member on their next page load.

### The staff are visible at a glance

The three staff groups carry a name colour, set on the groups screen and applied
everywhere a name appears — thread lists, posts, the member list, the online
strip:

| Group | Light | Dark |
|---|---|---|
| Administrators | `#b91c1c` | `#f87171` |
| Super Moderators | `#1e3a8a` | `#60a5fa` |
| Moderators | `#0284c7` | `#7dd3fc` |

Two values per group rather than one, because a colour that reads on paper-white
disappears at midnight. The board emits them as a class into the stylesheet
rather than as an inline `style`, which is the only place both answers can live
for a reader whose theme is "system". Supporters get a fourth colour from the
plugin, which is how a plugin-granted group looks when it is doing its job.

Every timestamp is an **offset from the reset**, not a date. The newest post is
always minutes old and the board is always six hundred days into its life,
whenever you happen to visit.

## The themes

`SHOWCASE_THEMES=1` is set in the demo's compose file, so the demo registers
every theme this repository ships rather than the default alone: **Midnight**,
the terminal; **Phasebook**, the familiar social shape; **Raidframe**, the
game-board HUD; and **Clubhouse**, the sports club. All five are in the
appearance control at the foot of every page, and a visitor picks one without
signing in — the choice is a cookie the server reads, so the page arrives
already painted rather than repainting after it loads.

That flag is the demo being a shop window and decides nothing for a board of
your own: yours starts with the default theme and adds what it wants in
`community.config.ts`, a file you own and the flag never touches.

## The shop, and a Stripe that is not Stripe

Demo mode installs one plugin — [Dues](../plugins/dues/README.md), which sells
membership of a usergroup — because a plugin nobody can click is a paragraph
rather than a demonstration. It is registered by the flag, in
`apps/community/community.demo.plugins.ts` — the demo's own file, so that
`community.plugins.ts`, the file a board of your own lists its plugins in,
stays a list you can read at a glance. The same split
`community.demo.config.ts` makes for the showcase themes, and for the same
reason: what the shop window needs is not what your board starts with.

The seed writes the shop and a year of its history. Four plans (a €5 monthly
subscription, a €12 90-day pass, a €99 lifetime, and a founding pass taken off
sale whose holder still holds it), three discount codes, and eight memberships
covering every state the administrator's desk can act on: renewed and healthy, a
failed renewal inside its grace window, one cancelled and running to the end of
its period, one revoked by a refund, a gift, and a lifetime comped with a
100%-off code. The ledger spans eight months because the renewals were replayed
month by month rather than written as rows: **every one of them went through the
same settlement path a Stripe webhook drives**, with the clock wound back for
each step, so the desk shows what a year of selling looks like rather than what
a fixture looks like.

The `supporters` group those plans grant is made by the board seed rather than by
the plugin, and ticked **may be granted by plugins** — the tick an administrator
gives by hand on any other board. It is made early because the
[Supporters' room](#two-forums-not-everybody-can-see) is a permission override
against that group's id: a forum closed to everybody, with nobody left able to
read it, would demonstrate the wrong thing. Seeding the board without the plugin
leaves the group and the forum in place and nobody in it, which is exactly what
an unsold plan looks like.

A visitor can buy. The board serves its own Stripe at `/demo/stripe` — the API
the plugin calls (`DUES_STRIPE_API_BASE` points back at the board) and the
checkout page a buyer lands on, which says **NOT STRIPE** at the top, asks for no
card, and takes no money. Pressing *Pay* does what Stripe does: it sends the
board a signed `checkout.session.completed` event, and the webhook — signature
verified like any other — is what turns the payment into membership. Nothing is
granted by the redirect, here or anywhere.

> [!WARNING]
> The fake exists only under `DEMO_MODE`; the route 404s without it. Never point
> a board with real members at `DUES_STRIPE_API_BASE` on its own host.

What that costs the demo is one honest gap: its Stripe forgets everything on a
restart, and answers for a checkout it no longer remembers by calling the session
expired — which is what Stripe does with an abandoned one, and what the plugin's
reconcile task is written to handle.

## What demo mode changes

Each of these closes a hole that only exists because the administrator password
is published.

| Guard | Why |
|---|---|
| **Mail is pinned to nowhere.** Resolved before the environment and before the settings table. | `MAIL_DRIVER=log` falls through to the settings table, which on a demo is written by whoever visited last. Without this, a visitor fills in the SMTP screen and the host is an open relay. |
| **Webhook delivery is never registered.** The task does not exist, rather than existing and refusing. | A visitor can point a webhook at any address that resolves from the host, and the board would make the request for them, on a schedule. |
| **Login lockout is relaxed** to 50 attempts and a one-minute lockout. | The counter is per account. One visitor mistyping `admin` five times would lock the published login for everybody else for a quarter of an hour. Relaxed, not removed — it is still a login form on the open internet. |
| **The published logins cannot change password, email or username.** Everything else about them is fair game. | All three lock the next visitor out. Renaming `admin` leaves the banner naming a login that no longer exists. |
| **`robots.txt` disallows everything.** | Half of what a crawler stored is a 404 within the hour, and the other half is whatever an anonymous visitor typed on a board carrying the project's domain. |

Nothing else is held back. A visitor can delete every forum, rewrite the
permission matrix, switch themes, ban the moderator and turn the board off. All
of it is undone by the next reset, and watching someone do it is a better
demonstration than a disabled button.

## The reset

`demo.reset` is a scheduled task, registered only when `DEMO_MODE` is set, and
only in the web server's task list. It drops the schema, replays the migrations —
the core ones and then every installed plugin's, because the drop took the
plugin's tables too — writes the board back, clears the uploads directory and
invalidates the cache. Ten seconds or so, during which the board is genuinely
unavailable — the tables are not there.

**The schema is dropped rather than truncated**, and that is the whole design.
Truncating leaves behind everything the migrations seeded — the usergroup
ladder, the warning types, the permission defaults — and those are exactly the
rows a visiting administrator can wreck. A reset that cannot restore the guest
group's permissions cannot fix the most likely thing to need fixing.

By hand, or from a cron of your own:

```sh
community demo:reset --yes     # drop, migrate, seed
community demo:seed            # seed an already-migrated empty database
```

Both refuse to run unless `DEMO_MODE` is set.

### Why the demo runs no worker

The reset has to clear the web server's cache, and the cache is a map in the web
server's own process. A reset run by the worker would leave the web server
serving the forum tree of a board that no longer exists, for up to the tree's
60-second TTL, on the one page every visitor lands on.

So the demo drives the tick against the web server instead — a `ticker` service
calling `/api/system/tick` every minute — and every task runs in the process
that can see the consequences. That is why `docker/compose.demo.coolify.yml` has
no `worker` service, and why it is not the ordinary compose file with a flag
added.

## Deploying one

[`docker/compose.demo.coolify.yml`](../docker/compose.demo.coolify.yml) is a
third Coolify resource beside the board and the site, from the same repository.
Point Coolify at it, give it a domain, and it generates the secrets and the
database password itself.

It differs from `docker/compose.coolify.yml` in three ways, all of them the
flag's doing: no worker (above), no volumes (a redeploy should be as clean as a
reset), and a `seed` one-shot in place of `migrate` — running the same
`demo:reset` the hourly task runs, so the board a visitor finds one minute after
a deploy is the board they would find one minute after any reset.

It also carries the Dues plugin's three variables, and all three are the fake's:
a secret key that no Stripe account answers to, a webhook signing secret Coolify
generates, and `DUES_STRIPE_API_BASE=http://127.0.0.1:3000/demo/stripe`, which is
the board talking to itself.

## What it costs you

A public board where anyone can post, on a subdomain of yours. The reset bounds
how long anything stays up, `robots.txt` keeps it out of search, and no mail or
webhook can leave the host — but for the length of one reset interval, the
content on that domain is whatever the internet typed. Pick
`DEMO_RESET_MINUTES` with that in mind rather than with the seed's size in mind:
the reset is cheap.

One thing works in your favour, and it is the shipped default rather than
anything demo mode does: the `guests` group can read, search and download, and
cannot post. The demo leaves that alone. Posting needs one of the published
logins, and spam bots do not log in.
