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

The board they land on has eight forums in three categories, twenty-two threads
carrying eighty-nine posts, and sixteen members with join dates spread over two
years. There is a poll with votes in it, a sticky, a locked thread, private
messages in the administrator's inbox, a post held in the moderation queue and
an open report against another that got through. An empty ModCP demonstrates
nothing, so it is not empty.

Every timestamp is an **offset from the reset**, not a date. The newest post is
always minutes old and the board is always six hundred days into its life,
whenever you happen to visit.

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
only in the web server's task list. It drops the schema, replays the migrations,
writes the board back, clears the uploads directory and invalidates the cache.
Ten seconds or so, during which the board is genuinely unavailable — the tables
are not there.

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
that can see the consequences. That is why `docker-compose.demo.coolify.yml` has
no `worker` service, and why it is not the ordinary compose file with a flag
added.

## Deploying one

[`docker-compose.demo.coolify.yml`](../docker-compose.demo.coolify.yml) is a
third Coolify resource beside the board and the site, from the same repository.
Point Coolify at it, give it a domain, and it generates the secrets and the
database password itself.

It differs from `docker-compose.coolify.yml` in three ways, all of them the
flag's doing: no worker (above), no volumes (a redeploy should be as clean as a
reset), and a `seed` one-shot in place of `migrate` — running the same
`demo:reset` the hourly task runs, so the board a visitor finds one minute after
a deploy is the board they would find one minute after any reset.

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
