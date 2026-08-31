# The moderator's guide

For the volunteers who approve first posts, handle reports, and keep
threads tidy. Everything here is done in a browser. The board's
settings, permissions and machinery belong to whoever administers it —
that side is [The organiser's guide](./organiser-guide.md) and
[Operations](../operations/operating.md) — and this page says when to hand
something over rather than pretending you can reach it.

## What you can do, and where

Moderation happens in two places:

- **On the thread and forum pages themselves** — a **Moderator tools**
  panel on each thread you moderate, and tick-boxes beside posts and
  threads for acting on several at once.
- **The moderator control panel**, at **`/modcp`** — the queue, the
  reports, the log, and an overview of what is waiting for you.

What you may do is not one switch. You are appointed to forums, one at a
time, and each appointment carries exactly the rights the organisers
ticked — approving content, editing, deleting, restoring, locking,
pinning, moving, merging and splitting are separate grants. The rules
are the administrator's to set — see
[Forums and permissions § What an appointment grants](./forums.md#what-an-appointment-grants)
for what each of the nine ticks decides, and
[Permissions](./forums.md#permissions) for the model behind them.

**My forums** (**`/modcp/forums`**) is the page to trust: it lists every
forum you are appointed to and exactly what you may do in each. If a
right is not in that list, the board will refuse the act; if it is, it
will not.

You can open **`/modcp`** if you are appointed to at least one forum, or
if your group carries the board-wide ModCP access permission. Its
sections:

| Section | Where | What it holds |
|---|---|---|
| **Overview** | **`/modcp`** | What is waiting across the forums you moderate — posts held for approval, open reports — and your forums, busiest first. |
| **Approval queue** | **`/moderation`** | Posts and threads held for approval in the forums you moderate. |
| **Reports** | **`/moderation/reports`** | What members have reported, who has picked it up, and what came of it. |
| **My forums** | **`/modcp/forums`** | Where you are appointed, and exactly what you may do in each. |
| **Moderator log** | **`/modcp/log`** | What has been done in your forums, by whom, and when. |
| **Address lookup** | **`/modcp/ip`** | Administrators and super-moderators only. Every lookup is logged. |

> [!NOTE]
> Everything you do as a moderator — every approval, deletion, lock,
> move, warning — is written to the moderator log with your name on it.
> That is not surveillance; it is what lets two moderators share a forum
> without wondering who did what.

## The approval queue

A post can be held for approval before anybody else sees it. The usual
reasons:

- **The author is new.** The board has a setting for holding a member's
  first posts until they have a few to their name. It is not working at
  present — see
  [Spam controls and rate limits § What each control is worth](./antispam.md#what-each-control-is-worth)
  — so on a board today this reason will not be why something is in your
  queue.
- **The forum holds everything.** A forum can be set to hold all new
  threads, or all new replies, and the permission matrix can require
  approval from particular groups.
- **The author is under a moderate-posting warning** — see
  [warnings](#warnings) below. This one holds their posts everywhere,
  even if they are staff.

Held content lands in the **approval queue** at **`/moderation`**, and
the count is the first thing on the **`/modcp`** overview. Tick the
items and press **Approve selected** or **Reject selected**.

- **Approving** makes the post visible and adds it to the forum's and
  the author's counts.
- **Rejecting** moves it to the deleted state — the same reversible
  state a moderator's delete produces. Nothing is destroyed; somebody
  with the restore right can bring it back.

Two rules keep the queue honest, and they are worth knowing so an
"empty" queue does not surprise you:

- **A held reply inside a thread that is itself held is not listed.**
  Approving the thread is the decision; the reply is not a separate one.
- **A held reply whose thread has been deleted is not listed.**
  Restoring the thread brings its held replies back into the queue.

If your selection included something you may not act on, the notice
afterwards says so: items in forums you do not moderate are refused, and
items another moderator dealt with first are reported as already
handled, not silently re-decided.

One more thing: the queue shows you the text **as written**, without the
board's word filter applied. You are judging the words, so you see them —
see [Keeping it civil](#keeping-it-civil).

## Reports

Members report things to you with the **Report** link — for a member
whose group may report content, it sits on every post that is not their
own, and the same mechanism covers threads, members and private
messages. The member says briefly what is wrong;
what they write is shown to moderators and never to the person reported.
A member reporting the same thing again while their report is open does
not create a second report.

Reports arrive at **`/moderation/reports`**, and the open count sits on
the **`/modcp`** overview. Who sees a report depends on what it is
about:

- A reported **post or thread** goes to whoever moderates that forum.
- A reported **member or private message** belongs to no forum, so it is
  visible only to moderators with the board-wide ModCP access
  permission. A reported private message is shown on the report screen —
  it is the one place a moderator reads one, and only because a member
  handed it over.

Handling one:

1. **Take this** assigns the report to you, so two moderators do not
   deal with the same one; **Put back** returns it to the pool.
2. Follow the link to the reported thing and act with your ordinary
   tools — or decide nothing needs doing.
3. Close it: **Resolve** when something was done, **Dismiss** when
   nothing needed doing. Either way you can leave a note for other
   moderators; the note is never shown to the reporter.

The reporter is told when their report is closed, whichever way it went.
A dismissed report is a report answered, not a report ignored — close
them rather than leaving them open.

## Tidying threads

The **Moderator tools** panel on a thread carries the tools you hold in
that forum. Each is one press, each is logged, and none of them destroys
anything.

| Tool | What it does | When it is the right one |
|---|---|---|
| **Lock** / **Unlock** | Nobody can reply while a thread is locked. | A thread that has run its course, or needs to cool off while you deal with it. |
| **Pin** / **Unpin** | Keeps the thread at the top of its forum's listing. | Rules, sticky announcements-by-thread, anything members should find first. Pinned threads still take replies — a notice nobody should reply to is an announcement, which is the administrator's tool. |
| **Move** | Moves the thread, replies and all, to another forum. | A thread posted in the wrong place. You need the move right in the source forum **and** the destination. |
| **Copy** | Makes a copy of the thread in another forum, leaving the original where it is. | Rare — when two forums genuinely both want the thread. |
| **Delete thread** | Moves the whole thread, replies included, to the deleted state. | Spam, or a thread that should not stand. Reversible. |
| **Restore** | Brings a deleted thread back. | The undo. It is a separate grant from delete, so you may hold one without the other. |
| **Split** | Takes posts out of a thread into a new thread, with a title you give it. | A conversation that wandered into a second topic worth its own thread. The opening post cannot be split out, and neither can the whole thread — that is a move. |
| **Merge** | Folds one thread into another, by the target thread's number. | Two threads about the same thing. You need the merge right in both threads' forums. |

For several things at once, tick the boxes: on a thread page you can
approve, delete, restore, or split out selected **posts**, and on a
forum's listing you can lock, unlock, pin, unpin, move, delete, restore
or approve selected **threads**. Anything in the selection you may not
act on is refused and counted in the notice, not quietly included.

A deleted or still-unapproved thread stays in its forum's listing for
staff who may see it, marked so you can tell it apart from a live one —
a **Deleted** or **Pending** badge and a faint tint on the row. An
ordinary member never sees the row at all, so the mark is for you: it is
how you find the thread to restore or approve it without opening every
one to check.

Two things about editing and deleting posts:

- **There is no hard delete.** Deleting always means the reversible
  deleted state: the post stays in the database, the log records the
  act, and restore undoes it. Only somebody with database access can
  truly destroy content, and no moderation screen offers it.
- **Editing somebody else's post is never silent.** Members get a short
  grace window to fix their own typos without a *Last edited by* line;
  a moderator's edit of another member's post always carries the notice,
  however fresh the post, and every edit is kept in the revision
  history.

A post's author and staff who may edit other members' posts can open **History**
from the post actions. The history compares adjacent revisions and records the
editor, date and reason. Staff may restore an earlier version after confirming
the action; restoration runs through the normal edit path and appends a new
revision rather than deleting or rewriting any existing history.

## Warnings

A warning is the formal step between a quiet word and a ban. If you hold
the **may warn members** permission, every post carries a **Warn** link
beside its author (and a member's profile has the same), leading to the
warning screen with that post cited.

Issuing one:

- Pick a **reason** from the board's preset list — each carries a title,
  a points value, and possibly an expiry — or choose **Something else**
  and set the title and points yourself (1 to 100).
- Write **what this is for**. It is required, kept on the record, and
  **shown to the member** — write it to be read by them.
- The member is notified of the warning, its points, and any restriction
  it triggered.

Points add up, and the board's warning levels act on the total. A fresh
board's ladder has thresholds at 4, 7 and 10 points; each level either
**suspends posting**, **holds the member's posts for approval**, or
**bans**, for a set number of days or indefinitely. The restriction
applies everywhere and to everyone — a moderator under a
moderate-posting warning has their own posts held, including in forums
they moderate.

Warnings with an expiry lapse on their own, and the restriction lapses
with the points. A warning issued in error can be **revoked**, with a
reason: the points come off and any points-based restriction is
recalculated. One exception, deliberately: **a ban triggered by a
warning level is not lifted by revoking the warning** — a ban comes off
only when an administrator lifts it, because the heaviest thing the
board does to somebody should be undone by a person looking at it.

The same permission lets you **lock a member's signature or avatar**
from their profile, with a reason the member sees — for the signature
that breaks the rules while the posts do not.

## Bans, and what you can reach

What a ban is: a record with a reason for the staff, a public reason the
member is shown, an optional expiry, and the group the member held
before — so lifting the ban, or its expiry, puts them back exactly where
they were. A banned member cannot sign in; they are told they are
banned, and shown the public reason if one was given.

**Banning somebody by hand is not a moderator tool.** The ban screen
lives in the admin panel, on the member's page under `/admin/users` — a
moderator's route to a ban is the warning ladder, or asking an
administrator. The same goes for **ban filters**, the patterns that
block a registration or sign-in before an account exists — they live at
`/admin/users/ban-filters`, and [Ban filters](./antispam.md#ban-filters)
describes what they match and how a pattern is written.

Other things that look like moderation and are not yours to press:

- **The admin panel** (`/admin`) — settings, permissions, groups,
  registration. Its access permission is the one thing no moderator or
  super-moderator bypass opens.
- **The word filter, thread prefixes, smilies and announcements** — all
  under `/admin/content`. An announcement is the administrator's tool
  for a notice nobody can reply to.
- **The spam controls** — the first-post hold threshold, the hourly
  limits, the registration challenge. If spam is getting past the queue,
  that is a settings conversation, not more clicking — point the
  administrator at [Spam controls and rate limits](./antispam.md).
- **Closing registration**, activating stuck accounts, lifting bans,
  and anything about a member's account itself.
- **Warning reasons and the points ladder** — the presets and thresholds
  you choose from are the board's, not yours to edit.

When one of these is what the situation needs, say so to the organisers
or the administrator with the thread or member in question — that is the
system working, not a gap in your permissions.

## Keeping it civil

Two things do quiet work beside you, and neither needs anything from
you day to day:

- **[The word filter](./antispam.md#the-word-filter)** rewrites listed words as a
  page renders — post bodies, excerpts, thread titles, feeds and search
  results — without ever changing what is stored. You see the original
  in the queue and on the report screens, because you are judging the
  words. Adding to the filter is the administrator's job, and a change
  applies everywhere on the next page load.
- **Reputation** lets members rate each other's posts — a thanks button
  by default, and a rating form if the board allows rating down. New
  members must post a few times before they may rate, which keeps it
  out of a spammer's reach. It is the members' tool, not a moderation
  one: a member whose posts are a problem is a matter for the queue, a
  warning, or a report — not for votes. What the feature is on your
  board is a setting the administrator chooses.

Most moderation is none of the tools above. It is the early reply that
sets a tone, the report answered the same day, and the first post
approved quickly enough that a new member feels let in rather than
suspected. The tools are for the days that are not like that.
