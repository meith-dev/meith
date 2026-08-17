# Analytics

This board counts its own page views, or counts nothing at all. There is
no third-party beacon, no tag manager, and nothing loaded into a member's
browser from anybody else's server — including when the Google Analytics
connector below is switched on.

Earlier versions rendered Vercel's analytics component on every page of
every production board, with no setting to turn it off. That was wrong:
it sent a request from every member's browser to a company they had never
heard of, on a board whose whole pitch is that no third party meets your
members before you do. It is gone, and what replaced it is described
here.

## Where to look

| What | Where |
|---|---|
| The figures | **Analytics** in the control panel, `/admin/analytics` |
| The switches | `/admin/settings?group=analytics` |
| The retention task | `analytics.prune` on `/admin/system` |

The screen offers 7, 30 and 90 days. Each shows page views and visitors
for the range, a bar per day, the most-read pages, and where visitors
arrived from.

## What counting means here

Counting happens **on the server, while the page renders**. There is no
script, no pixel and no beacon: the board already knows it is rendering a
page for somebody, so it writes that down and gets on with the response.
That has three consequences worth being clear about.

**It works with JavaScript off**, like the rest of the board. A reader
with scripts disabled is counted exactly like everybody else, which is
the opposite of how a browser tag behaves.

**It cannot see what the browser knows.** Screen size, engagement time,
scroll depth, outbound clicks — a server never learns any of that, and
this one does not guess. What it records is: which page, on which day,
from which referring site, and whether the reader was signed in.

**It counts a request, not an eyeball.** A page served from a cache the
board did not render is not counted, and a reader who never reaches the
board is invisible. The figures are honest about traffic the board
handled, which is the only thing it can be honest about.

### What is stored

Four tables, all aggregates, none of them holding a row per visit:

| Table | One row per | Holds |
|---|---|---|
| `analytics_days` | day | views, views by signed-in members, visitors, visitors who were members |
| `analytics_pages` | day and page | views |
| `analytics_sources` | day and source | views |
| `analytics_visitors` | day and reader | a hash, and whether it was a member |

No IP address. No user agent. No screen size, no language header, no
fingerprint of any kind. Nothing that can be joined back to a person by
anybody who later gets hold of the database.

### How one reader is told from another

A visitor is a **per-day one-way hash** of the reader's identity —
`AUTH_SECRET`, the day, and either the account id or the opaque guest
cookie — truncated to 32 characters. Because the day is inside the hash,
the same browser produces a different value tomorrow: the table cannot be
used to follow anybody from one day to the next, by us or by anyone
reading the rows.

A reader is only counted at all once their browser has **sent the guest
cookie back**, which is the same rule the "who is online" list uses. A
crawler that discards cookies is never counted, so the figures are about
people rather than about robots.

Two honest limitations follow:

- **Visitors are a daily figure.** The range total is the sum of the
  daily counts, not a deduplicated count of people across the range. A
  member who reads the board every day for a week counts as seven. This
  is deliberate: deduplicating across a range would mean keeping an
  identifier that survives the day, which is exactly what the per-day
  hash exists to prevent.
- **Signing in makes a second visitor.** The day somebody arrives as a
  guest and then signs in, they are counted once under the guest cookie
  and once under the account.

### Which pages are counted

Only the public board, and only in buckets that keep the list readable:

| Requested | Counted as |
|---|---|
| `/` | `/` |
| `/12-introductions` | `/12` — the forum keeps its id |
| `/thread/91-why-meitheal` | `/thread/:id` — every thread together |
| `/member/44-ann` | `/member/:id` — every profile together |
| `/plugins/dues/checkout` | `/plugins/dues` |
| `/search?q=…` | `/search` — the query is dropped, always |

Threads and profiles are pooled on purpose. A board with fifty thousand
threads would otherwise write fifty thousand rows a day and produce a
"top pages" list that says nothing; the most-read *threads* are already
on the board's own statistics page, counted by the thread view counter.
Forums keep their ids because there are few of them and knowing which one
is busy is the point.

Nothing under `/admin`, `/api`, `/auth`, `/usercp`, `/messages`,
`/notifications`, `/subscriptions`, `/moderation`, `/modcp`, `/report` or
`/unsubscribe` is counted at all. A member's own pages are their
business, and the control panel is not traffic.

### Where visitors came from

The referring **host** is recorded, never the referring URL: a link from
`https://news.example/2026/thread-about-us` is stored as
`news.example`. Alongside the hosts, two bookkeeping sources account for
the rest of the views — `direct` for a visit that arrives with no
referrer at all, and `internal` for one that followed a link on this
board. Both are shown on the screen so the percentages add up to
something rather than quietly dropping the difference.

Days are **UTC days**, everywhere, including the boundary between them.
A board whose members are all in one distant timezone will see its
"days" cut at an hour that is not local midnight; the alternative is
storing a timezone with every aggregate and re-cutting history whenever
an administrator changes it.

## The settings

| Setting | Default | What it does |
|---|---|---|
| Count page views | **off** | Nothing is recorded until this is on. Off is the shipped default: a board that has not been asked to count anything counts nothing. |
| Keep counts for (days) | 90 | The retention window. `analytics.prune` deletes days older than this, hourly. |
| Send page views to Google Analytics | **off** | The connector below. |
| Measurement ID | empty | The GA4 property, `G-XXXXXXX`. |
| Measurement Protocol API secret | empty | Stored on the board, never shown again. |

Switching counting **off** stops the recording and keeps what is already
there, the way every other switch on the board behaves. The retention
task keeps running, so a board that has turned counting off empties
itself as the last rows age out rather than holding them forever. To
empty it now, set the retention to its minimum, wait for the task, and
put it back.

Counting needs Postgres. With `DATA_SOURCE=fixture` the screen says so
and records nothing, because there is nowhere to put it.

## The Google Analytics connector

Off unless an administrator turns it on, and worth understanding before
they do.

**It sends from the server, not from the browser.** When a page view is
counted, the board queues a Measurement Protocol event and sends it after
the response has been delivered — so the reader's browser never loads
`gtag.js`, never opens a connection to Google, and never receives a
Google cookie. The board's strict content policy is unchanged: nothing
was added to `script-src` or `connect-src`, and the regression guard that
keeps third-party hosts out of the board still passes with the connector
on.

**What Google is told:** the address of the page, the referring site if
there was one, and an opaque per-browser identifier derived the same way
as the visitor hash but without the day, so a returning reader is a
returning reader in GA too. Events are sent with
`non_personalized_ads`.

**What Google is not told:** your member's IP address, their user agent,
their device, their language, or anything about who they are. The request
comes from your server, so as far as GA is concerned every visit
originates there.

That last point is the cost, and it is not small: **the geography, device
and browser reports in GA will be about your server, not your members**,
and the behavioural reports a browser tag fills in — engagement time,
scroll, outbound clicks — stay empty. What you get is page views,
referrers, returning-visitor counts and realtime. If that is not enough
for you, the honest answer is that a full browser tag is not something
this board will ship, and a plugin on your own board is where it belongs.

### Setting it up

1. In Google Analytics, open **Admin → Data streams** and pick the
   stream. The **Measurement ID** is on that page, as `G-ABCD1234`.
2. On the same page, open **Measurement Protocol API secrets** and
   create one. The browser tag needs no secret; a server does, which is
   what this is.
3. Put both into `/admin/settings?group=analytics` and switch **Send page
   views to Google Analytics** on.
4. The board also needs to know its own address — the connector sends an
   absolute URL, and without **Board address** (or `APP_URL`) there is
   none to send. Nothing is sent until it is set.

The Analytics screen states which of these is missing, and nothing is
sent until the connector is complete. A refusal from Google, or a Google
that cannot be reached, is logged and dropped: the connector never
delays a response and never fails a page.

A GA4 property is a third party, whatever the transport. Turning the
connector on is a decision about your members' data, and the default
privacy policy that ships with the board says so — read what it says
about counting and about Google, and keep it accurate for your board.

## How this stays true

Three things, all in `pnpm verify`:

- **A textual guard.** `no-third-party-beacon` in
  `scripts/guards.config.mjs` fails the build if a vendor's name or an
  external `<script src>` appears anywhere under `apps/community/`,
  `themes/` or `examples/`.
- **A test of what ships.** `tests/no-third-party-beacon.test.ts`
  asserts that the board's runtime dependencies are this workspace, Next
  and React and nothing else, that no board file renders a `<script>`
  with a `src`, and that the content policy names no external host.
- **The content policy itself.** `script-src` is `'self'`, a per-request
  nonce and `'strict-dynamic'`, with no host allowlist for anybody to be
  added to. See [the content security
  policy](./operating.md#the-content-security-policy).

## Upgrading a board that had the Vercel beacon

Nothing to do, and nothing to configure. Removing it is subtractive: the
board stops making that request, counting stays off until you switch it
on, and no setting you have is affected. The migration that arrives with
this change only creates the four empty tables above.
