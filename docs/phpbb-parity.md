# phpBB parity decisions

Where a Meith board imported from phpBB behaves differently from the one it
came from — what changed, and why. Read this alongside
[Migrating from MyBB or phpBB](./migrating.md), which has the procedure and
the per-source coverage table; this page is about behaviour, not transfer.

This page is deliberately shorter than
[MyBB parity decisions](./mybb-parity.md). Most of what makes Meith behave
differently from an old-school forum — Markdown instead of BBCode,
one notification centre instead of e-mail-and-a-count, reputation with no
per-group multiplier, timezones as IANA names, a control panel with its own
session — is a decision about *this board*, not about the one you are
leaving, and that page already states each one, its reasoning and its
cost in full. Nothing here repeats it. What follows is specific to phpBB:
where its own model does not fit Meith's, and — a few times — where it fits
better than MyBB's did.

Each entry: what phpBB does, what happens on import or by design here, and
why.

## What is on this page

- [Accounts and groups](#accounts-and-groups)
- [Posting and Markdown](#posting-and-markdown)
- [Stickies and announcements](#stickies-and-announcements)
- [Polls](#polls)
- [Warnings and bans](#warnings-and-bans)
- [Reputation](#reputation)
- [Friends and Foes](#friends-and-foes)
- [Private messages](#private-messages)
- [The moderator log](#the-moderator-log)

---

## Accounts and groups

### Nobody keeps their phpBB group — including administrators

**phpBB** decides everything by group: which ACL role applies, what a
member may do in which forum, even the name colour on their posts, all
resolved from `group_id` and the roles attached to it.

**Meith** puts every imported member into the board's ordinary registered
group, full stop. The row phpBB's `group_id` came from is captured on the
imported user and never read again — an account that was
`ADMINISTRATORS` on the old board arrives here with no more standing than
one that just signed up.

**Why.** The two group systems do not correspond closely enough to guess
at a mapping — see the ACL entry below — so guessing would mean silently
promoting or demoting people based on a translation nobody reviewed.
Landing everybody in one place and re-promoting deliberately is the only
version of this that does not do something to an account its owner did
not agree to.

**Cost, and it is an operational one, not just a product one:** if you do
not re-promote at least one account after the import, your new board has
no administrator at all. Do this **before** you open the board to
members — `community user:promote` from the command line, or `/admin` once
one account exists with panel access. This is true of a MyBB import too;
it is worth restating here because phpBB gives an operator the least
warning of anyone, since nothing on the sign-in screen hints that a
former administrator is now an ordinary member.

### The ACL does not translate to a forum permission matrix

**phpBB** permissions are an access control list: an *auth option*
(`f_reply`, `m_edit`, `a_board`, and several hundred more) is granted or
denied through a *role* attached to a group, at any of three scopes —
board-wide, per forum, per individual user — with **allow**, **deny** and
**never** all distinct, and a user-level override always winning over
whatever their group says.

**Meith** resolves one forum permission as the MAX across a member's
groups of a single boolean or numeric field, full stop — the model
[MyBB parity decisions § Permissions and groups](./mybb-parity.md#permissions-and-groups)
describes throughout.

**Why nothing is imported.** A MyBB usergroup column is at least a
plausible one-to-one translation, and [Migrating from MyBB or phpBB](./migrating.md)
still tells you to rebuild it rather than trust a guess. phpBB's effective
permission for one member in one forum is the *outcome of combining rows
from up to three scopes*, not a value sitting in a column anywhere — there
is nothing to read that would even be a starting guess. Rebuilding
groups and forum permissions in `/admin` after the import is not a
shortcut skipped; it is the only sound option once nothing to translate
exists.

---

## Posting and Markdown

**phpBB** posts are BBCode, cleaned up before Meith's converter ever sees
them: every stored tag carries an appended `bbcode_uid` (`[b:8k2j1a0x]`),
smilies are stored as an HTML comment wrapping an `<img>`
(`<!-- s:) --><img ...><!-- s:) -->`), and auto-linked URLs, e-mail
addresses and `www.` addresses are similarly wrapped
(`<!-- m --><a href="…">…</a><!-- m -->`). The importer strips the uid,
unwraps a smiley back to the code a member actually typed (`:)`, not an
image), and unwraps a magic link back to a bare URL — or a `[url=]` tag,
when the stored label differs from the address — before handing the
result to the **same** BBCode-to-Markdown converter a MyBB import uses.

**What that means in practice: nothing here is phpBB-specific.** The
conversion table, what survives with no loss, what is downgraded to
plain text, and what a quote looks like afterwards, is exactly
[The markup language is Markdown, not BBCode](./mybb-parity.md#the-markup-language-is-markdown-not-bbcode) —
`[quote="Bob"]` and `[quote=Bob]` both parse the same as MyBB's
`[quote='Bob']`, `[code]` fences the same way, and an administrator's
custom BBCode (phpBB's ACP has its own version of MyBB's MyCode, and the
same reasoning against a second markup language administered through a
web form applies to it) is left as the literal text a member typed,
exactly like an unrecognised MyCode tag.

**The one genuine phpBB-only loss: smilies come back as their typed
code, not their image.** A board with a large custom smiley set has that
set reduced to whatever short codes members happened to type — `:)`,
`:teapot:`, whatever the old board defined — with no image behind them
unless Meith's own smiley handling recognises the code. Re-adding a
custom smiley set, if you have one, is a decision for after the import,
same as re-adding custom BBCode has no equivalent to restore either.

---

## Stickies and announcements

**phpBB** has one column, `topic_type`, with four values: an ordinary
topic, a sticky, a forum announcement, and a **global** announcement that
appears above every forum on the board.

**Meith** collapses all three non-zero values to a single boolean,
`isSticky`. **A phpBB global or forum announcement is not skipped and it
is not turned into a Meith Announcement — it imports as an ordinary
sticky thread**, indistinguishable afterwards from one a moderator pinned
by hand.

**Why.** Meith's Announcements are a separate feature with no thread
underneath it — start date, end date, no replies, shown above the forum
list rather than inside it, exactly as
[Announcements are not sticky threads](./mybb-parity.md#announcements-are-not-sticky-threads)
describes. There is no row in `topics` that could become one: an
announcement there is still a topic, with replies, an author, and a
place in one forum's listing. Sticky is the closest thing that exists,
so sticky is what a `topic_type` of 2 or 3 becomes.

**Cost.** If a phpBB board used global announcements for board rules or a
welcome message, re-create those as real Announcements after the import
— the imported version is a thread sitting at the top of whichever forum
it lived in, not a board-wide banner, and it can be replied to, which the
original could not.

A topic phpBB itself has already redirected — the shadow row a **move**
leaves behind, pointing at `topic_moved_id` — is not imported at all,
the same choice Meith makes for its own moves: see
[A moved thread leaves no redirect stub](./mybb-parity.md#a-moved-thread-leaves-no-redirect-stub).

---

## Polls

**phpBB** has `poll_vote_change`: a poll may allow a member to change
their vote at any time before it closes, not just cast it once.

**Meith has the same capability, `allow_revote` on every poll — added
for this.** MyBB has no equivalent concept, so a MyBB import always turns
it off; a phpBB poll with `poll_vote_change` set imports with revoting
already on, and a member changing their mind on an imported phpBB poll
behaves exactly as it did on the old board. `poll_max_options` carries
across the same way MyBB's `multiple` flag does — see the coverage table
in [Migrating from MyBB or phpBB](./migrating.md#what-comes-across-and-what-does-not) —
clamped to however many options the poll actually has.

---

## Warnings and bans

**phpBB**'s warning is barely a record at all: a user id, an optional
post id, and a timestamp — no title, no point value, no note explaining
why, no expiry, and no field for who issued it.

**Meith**'s warning model has all of those fields, because MyBB's does —
see [Warning levels are points, not percentages](./mybb-parity.md#warning-levels-are-points-not-percentages).
**Every imported phpBB warning is stretched to fit it identically**:
titled "Warning", worth exactly one point, no note, never expires, never
revoked, and attributed to a synthetic system account rather than a real
moderator — because phpBB genuinely never recorded any of that, not
because the importer declined to carry it.

**Cost.** A phpBB board's warning history imports as a *count* — how many
times somebody was warned — and nothing else. It cannot say which
warning was serious and which was a nudge, when any of them stop
mattering, or who issued them. If your seeded warning ladder (points at
4, 7, 10) meant something different under phpBB's own escalation rules,
review affected accounts by hand; the importer has no finer information
to work from.

**Bans are similar, and narrower.** phpBB's ban list holds user bans,
e-mail bans, IP bans, and *exclusion* rows that exist to carve an allow
exception out of a broader ban — one table, four jobs. Only the first
kind imports: a row naming an e-mail address or an IP range instead of a
user, or marked as an exclusion, is skipped outright, the same as MyBB's
e-mail and IP bans are marked not imported in the coverage table. An
imported ban, like an imported warning, is attributed to the system
rather than to whichever moderator actually issued it — phpBB's
`banlist` does not record that either.

---

## Reputation

phpBB has no reputation system, positive or negative, to import from. A
migrated member's reputation starts at zero here regardless of standing
on the old board — there is nothing to carry across, not a value the
importer discards.

---

## Friends and Foes

**phpBB** calls this feature Friends and Foes, and stores both as one
flag pair per row in `zebra` — a row can technically have neither `friend`
nor `foe` set, or, if the old board's data is inconsistent, both.

**Meith**'s buddy and ignore lists are the same one-row-per-ordered-pair
shape [MyBB parity decisions](./mybb-parity.md#buddy-and-ignore-are-one-table-and-ignoring-is-not-mutual)
describes: exactly one relationship, or none, per pair. A `zebra` row
with `friend` set imports as a buddy, one with only `foe` set imports as
an ignore, and a row with neither (or a self-referencing row, which
phpBB's own UI should never produce but its database does not forbid)
imports as nothing.

---

## Private messages

**Good news here, for once: phpBB's own private message schema already
matches the shape Meith chose over MyBB's.** phpBB stores a message's
content once, in `privmsgs`, and one small row per recipient in
`privmsgs_to` — content once, a copy per participant, exactly the
argument [A private message is stored once, not once per recipient](./mybb-parity.md#a-private-message-is-stored-once-not-once-per-recipient)
makes against MyBB's per-recipient duplication. Nothing is being fixed in
translation here; the two systems already agree, and a message to several
recipients imports as one row with several copies either way.

Two things do not survive: **private-message attachments** are not
imported — the importer reads only `attachments` rows where
`in_message = 0`, i.e. attached to a post — matching the coverage table's
"PM attachments are not" for phpBB. And **a phpBB member's own folders**
do not exist here: Meith has no user-defined private-message folders, so
anything beyond phpBB's built-in "sent" and "deleted" concepts collapses
to the ordinary inbox on import.

---

## The moderator log

**phpBB already keeps one log table for administrative and moderation
actions, split by a `log_type` column** — closer in shape to
[The moderator log is an allow-list over one table](./mybb-parity.md#the-moderator-log-is-an-allow-list-over-one-table)
than to MyBB's two separate tables, so there is no structural mismatch to
call out here. What is true regardless of source: the *history* is not
imported either way. A migrated board's `admin_log` starts recording from
the moment moderation happens here, not before.

---

## Next

| You want to | Read |
|---|---|
| Run the import itself | [Migrating from MyBB or phpBB](./migrating.md) |
| Understand a Meith design decision this page didn't re-derive | [MyBB parity decisions](./mybb-parity.md) |
| Rebuild groups and forum permissions | [The organiser's guide](./organiser-guide.md) |
