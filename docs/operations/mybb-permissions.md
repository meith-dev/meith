# MyBB migration: permissions and moderation

Compare MyBB permissions, moderation and staff access with Meith. Review the migration costs before assigning groups or opening the imported board.

## Permissions and groups

### Flood intervals

**MyBB:** stores `floodtime` and `searchfloodtime` as per-usergroup numeric
columns, combined like any other numeric limit.

**Meith:** does not model flood intervals as permission fields at all. The
board settings `posting.flood_seconds` and `search.flood_seconds` hold the
intervals, and the boolean permission `canBypassFloodCheck` exempts a group
from them.

**Why.** This board has one combination rule for all numeric permissions:
take the maximum, with `0` meaning unlimited. That rule is correct for
*allowances* — attachment size, posts per day — because a larger number is
more permissive. It is exactly backwards for an *interval*, where the most
permissive value is the smallest non-zero one: a member in a 30-second
group and a 5-second group should get 5 seconds, and MAX would give them
30. Keeping the field would have required a fourth combination kind used by
two fields and a permanent footnote on the matrix. A setting plus a boolean
(which combines by OR, giving the right answer) keeps the rule literally
true for every field.

**Cost.** An imported board loses per-group flood granularity: everyone is
either subject to the board interval or exempt from it. Reintroducing
granularity would mean adding a `numeric-min` kind to
`packages/core/src/permissions.ts`.

### Permission field naming

**MyBB:** uses lowercase, unpunctuated column names (`canpostthreads`,
`canviewthreads`).

**Meith:** uses camelCase keys (`canPostThreads`) mapped to snake_case
columns (`can_post_threads`).

**Why.** The keys are consumed as TypeScript property names across three
packages, and `canviewothersthreads` is genuinely ambiguous to read. The
mapping is mechanical and lives in one file
(`packages/db/src/schema/permission-columns.ts`), so importer code can
translate a legacy column name in one place.

### Separate `canAccessAdminCp` and `isAdministrator`

**MyBB:** treats admin status and admin CP access as effectively the same
thing.

**Meith:** keeps them as two fields: `isAdministrator` grants the permission
bypass, `canAccessAdminCp` grants the panel.

**Why.** A bypass has to be explicit and logged. Splitting the fields makes
it possible to grant a trusted role read access to the panel without also
handing it the ability to bypass every forum permission — and it makes the
audit log meaningful, because a bypass entry now implies a specific field.

---

## Moderation

### Who handles a report

**MyBB:** has a dedicated permission, `canmanagereportedcontent`, separate
from the moderator rights that decide what somebody can actually *do*
about a report.

**Meith:** scopes reports by the sets that already exist: a report about a
post or thread is visible to the moderators of its forum (the same set
that scopes the approval queue), and a report about a member — or a
private message — is visible to board staff (`modcp.access`).

**Why.** A third permission would let a board grant "can read reports
about forum X" to somebody with no power to act on anything in forum X —
a role whose only capability is reading complaints about their
neighbours. Every report is about content or a person, and the people who
can act are the people who should see it.

**Cost.** An imported board's `canmanagereportedcontent` grants do not map
one-to-one: anybody who held it without moderating a forum loses report
access, and anybody who moderates a forum gains it.

### What can be reported

**MyBB:** allows reports against posts, threads, profiles, private
messages and (with plugins) more.

**Meith:** ships posts, threads, members and private messages. A private
message can only be reported by somebody who holds a copy of it, and
reporting is the *only* path by which staff can read one — see
[private messages](mybb-members.md#reporting-is-the-only-way-staff-read-a-private-message).

### Who can lock, pin and move threads

**MyBB:** grants these through `moderators` rows (per forum, per right)
plus the super-moderator and administrator bypasses. There is no
usergroup column for them.

**Meith:** does the same — and this is a parity entry only because it is
the first place the permission model diverges from its own pattern: every
other action reads a field off the resolved forum matrix, and the five
thread-management rights (lock, stick, move, merge, split) read an
appointment instead.

**Why.** "May lock threads everywhere on the board" is a thing you are
appointed to, or bypass into as staff. A usergroup checkbox for it would
let a board grant board-wide thread control by adding somebody to a
group, with no record of which forums anybody was ever meant to be
responsible for.

**Cost.** A board that wants a "junior moderators" group with lock rights
everywhere has to appoint the group to each forum — `forum_moderators`
accepts a `group_id`, so that is one row per forum rather than one per
person, but it is not one checkbox.

### Copying a thread

**MyBB:** offers "copy thread" alongside move, duplicating every post and
crediting the copies to their original authors — so one piece of writing
raises its author's post count twice.

**Meith:** offers it too, on the same thread tools as move, and makes the
same choice about the counts — see
[copying credits its authors twice](#copying-a-thread-credits-its-authors-twice)
and
[copy is authorised by `thread.move`, at both ends](#copy-is-authorised-by-threadmove-at-both-ends).
Only visible posts are copied: copying held content would double the
approval queue, and copying removed content would republish it.

### Splitting a thread, and where the pieces land

**MyBB:** splits by checkbox selection and lets the moderator choose a
destination forum.

**Meith:** offers two selections — "from this post onwards" on the thread
tools, and a per-post checkbox selection through inline moderation — and
the new thread always lands in the **same forum**.

**Why the fixed destination.** Splitting and moving are two acts: a
single operation with a second forum to authorise would let a moderator
who may split here, but not post there, place content in a forum they
have no standing in.

**Cost.** A moderator who wants the split-off thread elsewhere splits,
then moves — two operations and two audit rows instead of one.

### Which thread survives a merge

**MyBB:** merges by thread URL or id and keeps the thread the moderator is
looking at, absorbing the one they name.

**Meith:** goes the other way round, and the direction is the important
sentence on this page: **the thread on screen is the one that is merged
away.** Its posts move into the thread whose number the moderator types,
and the thread they were looking at is the row that is deleted. The tools
say so — the field reads "Merge into thread #" and the button reads
"Merge away" — and the survivor is never inferred from anything else: not
the older thread, not the one with more posts.

**Why.** A merge destroys a thread row. Every heuristic for picking the
survivor is right most of the time, and the times it is wrong are
unrecoverable. Being explicit costs a moderator nothing, because they
already know which one they mean.

**What goes with the deleted thread.** Only its posts are carried across.
Everything else hanging off the source row goes with it, by cascade and
without a prompt: its **poll** and every vote in it, its **ratings**,
every **subscription** to it, and every member's **read marker**. That is
the part a moderator cannot undo, and the strongest reason to check the
direction before pressing the button — merging a long-running poll thread
into a two-post duplicate destroys the poll.

**Cost.** Merging the wrong way round is still possible — it is a
moderator's mistake to make, and it is logged with both thread ids and
both forum ids so it can be seen. What is not possible is the software
making the mistake for them.

### What a merge does to post counts

**MyBB:** moves the posts and leaves author post counts alone — correct,
and worth stating because its neighbouring operation (copy) counts one
piece of writing twice.

**Meith:** matches MyBB on merge and split, for a reason it can state
exactly: neither operation creates or destroys a post, so
`users.post_count` never moves. Only `users.thread_count` moves, by one —
a split creates a thread, a merge destroys one.

### Copying a thread credits its authors twice

**MyBB:** copying a thread duplicates its posts, and each copy counts
toward its author's post count.

**Meith:** the same, chosen deliberately.

**Why.** Every other counter on this board holds to one definition —
`users.post_count` means *posts written* — and merge and split were
settled by that definition. Copy is the one tool that genuinely creates
rows, so the definition and parity actually conflict, and parity won: an
imported board's counts must not change under it, and a moderator using
copy expects the arithmetic they know.

**Cost.** After a copy, `post_count` means "posts attributed to you"
rather than "posts you wrote". The counter recount counts rows, so it
agrees rather than quietly undoing it — the board stays internally
consistent.

### Copy is authorised by `thread.move`, at both ends

**MyBB:** copy is governed by the same "can manage threads" permission as
move.

**Meith:** `thread.copy` does not exist as a right. Copying reads
`thread.move` in the source forum *and* in the destination, exactly as a
move does.

**Why.** Copying is moving that leaves the original behind: it puts
content into the destination by the same mechanism, so the destination's
moderators have precisely the same interest. A separate right would be a
column on `forum_moderators` distinguishing two acts nobody grants
separately. Unlike a move, the destination *may* be the source forum —
forking a discussion in place is legitimate, and there is no pointer to
repair because nothing left.

### Inline moderation offers no "unapprove"

**MyBB:** the inline dropdown on a forum listing includes *Unapprove
threads*, which sends published content back to the queue.

**Meith:** it does not. Inline moderation offers approve, delete,
restore, lock, unlock, pin, unpin and move; taking a visible thread off
the board is `delete`, which `restore` reverses.

**Why.** `unapproved` and `deleted` are both "not counted, not visible" —
they differ only in which list the content lands on. Sending a published
thread back to the *approval queue* puts it in front of a moderator as
something to decide, when the decision has already been made — and it
makes the queue a mixture of "new content nobody has read" and "old
content somebody removed", which its oldest-first ordering relies on not
being true.

**The one exception: community flagging.** When enough distinct members
report the same visible post, the board holds it — an established post,
already read, sent to the approval queue (see the
[anti-spam guide](../administration/antispam.md)).
This is a deliberate crack in the rule above, and it is the only one. It
is justified precisely where a *moderator's* unapprove is not: the
decision has **not** already been made — a crowd has raised a question
about the post and nobody on staff has ruled on it yet — so putting it in
front of a moderator to decide is exactly right, not redundant. A
flag-held post is genuinely "content that needs a decision", which is
what the queue is for; there is no second surface to invent for it, and
holding it (rather than deleting it outright) keeps the members'
accusation reversible by a single approve. The queue's oldest-first
ordering still holds — a flag-held item enters at the moment it is held,
like any other. What a moderator still cannot do is unapprove at will;
only the community-flag threshold can move read content into the queue,
and only by agreement of several members.

### Bulk moderation chunks rather than refusing

**MyBB:** inline moderation acts on whatever was selected, in one
request.

**Meith:** a selection is applied in transactions of 25, up to a ceiling
of 500 per request. The approval queue keeps its hard refusal above 200.

**Why.** The two surfaces have different shapes. Nobody hand-selects two
hundred items from a queue, so refusing there is honest. A listing has a
"select all", and a moderator clearing a spam run genuinely has hundreds.
Chunking is safe because every transition is state-guarded — a bulk
action that dies halfway is fixed by pressing the button again, and the
chunks that already ran report "already in that state".

### A moved thread leaves no redirect stub

**MyBB:** moving a thread can leave a "Moved: <title>" row in the source
forum, optionally expiring.

**Meith:** a move just moves. The schema keeps `moved_to_thread_id` and
`ThreadRowModel.isMoved` for a future implementation, and nothing writes
them.

**Why.** The stub is a second kind of row in every listing query — the
board's most performance-sensitive read — that has to be filtered,
counted and expired everywhere. What it buys is a reader who bookmarked a
thread finding it, and search and the thread's own permalink already do
that, because the thread keeps its id. Revisit if a real board reports
people losing threads after moves.

---

## Warnings

### Warning levels are points, not percentages

**MyBB:** warning levels are a percentage of a configured maximum, and a
member's level reads as "40%".

**Meith:** levels and warnings are absolute points, and a member is on
"6 points" with seeded thresholds at 4, 7 and 10.

**Why.** A percentage needs a configured maximum to mean anything, and a
board that never opens the admin screen would have every member
permanently at 0% of nothing. Points are readable on their own, the
seeded ladder works on a fresh board, and "2 points, expires after 90
days" is a sentence a moderator can weigh before issuing it. An importer
can convert a percentage against the source board's maximum.

### A warning restriction outranks a moderation bypass

**MyBB:** a user under a "moderate posts" warning has their posts held;
staff permissions are resolved separately and can conflict.

**Meith:** a warning-level restriction is applied *after*
`bypassesModeration`, and wins. A moderator who is themselves under a
moderate-posting warning has their posts held, in every forum, including
ones they moderate.

**Why.** The bypass means "this forum's approval queue does not apply to
you"; the warning means "your posts are reviewed". They are different
statements, and the second is a sanction a person received. Letting the
first cancel the second would make the board's moderators the only
members a warning could not reach.

### Bans from a warning level are not lifted by revoking the warning

**MyBB:** a warning that triggered a ban and is then revoked leaves the
ban in place; an administrator lifts it.

**Meith:** the same, deliberately.

**Why.** The ban lifecycle owns the group the ban captured, so it can be
restored at expiry; un-banning from the warning path would restore a
group that feature never saw. More importantly, a ban is the heaviest
thing the board does to somebody, and its removal should be a decision a
human makes while looking. The revocation still lowers the points, so the
level no longer applies.

---

## The moderator log

### The moderator log is an allow-list over one table

**MyBB:** the moderator log and the administrator log are separate
tables.

**Meith:** they share `admin_log`, and the ModCP filters it by a named
allow-list of moderation actions.

**Why.** One table means one place a bypass, a settings change and a
thread lock are all recorded — what an operator wants when reconstructing
an incident. The filter is an allow-list rather than a deny-list because
the table keeps growing row types: a deny-list turns every future
administrative action into a moderator-visible disclosure the day
somebody forgets to update it, whereas an allow-list turns a new
moderation action into a missing row somebody notices.

### Everything that changes something is logged, and nothing that does not

**MyBB:** the moderator log records what the moderation tools do.
Handling a report, deleting one post from inside a thread, or editing
somebody else's post leaves nothing behind.

**Meith:** every path that changes content, a member's presentation or a
report writes a row, whichever screen it was reached from: closing a
report (`report.resolve` / `report.reject`), deleting or restoring a
single post from the postbit (`post.delete` / `post.restore`), editing
somebody else's post (`post.edit`), locking a signature or an avatar,
copying a thread. Each further 500-recipient batch of a mass mail writes
a row in the admin log, so a campaign is not one row followed by silence.
Where the change is a database write, the row is written in the same
transaction — a moderation that rolls back leaves no row claiming it
happened.

**The boundary is authorship, and it is deliberate.** A member deleting
or editing their own post writes nothing: it is not moderation, and
logging it would bury the moderation in it. Taking a report or putting it
back is not logged either — it moves nothing, and the report's own
timeline already shows who holds it.

**Cost.** A forum whose moderators edit heavily has a longer log than
MyBB's, and every entry names a post rather than only a thread. The log
has no retention policy, so `admin_log` grows with moderation rather
than administration alone.

### Every log row names the forums it concerns, when it is written

**MyBB:** the moderator log carries an `fid` column, and the ModCP scopes
the list by it.

**Meith:** the writer puts the forums into the row's detail — `forumIds`,
an array of every forum the action reached — and the reader scopes by
that and nothing else. Single-forum actions also carry `forumId`; moves
and merges carry `fromForumId` and `toForumId`.

**Why.** The reader used to guess, taking the first of several detail
keys that was present — and a split logs *thread* ids under `from`/`to`,
so the guess could read a thread id as a forum id: the entry surfaced to
whoever moderated the forum whose id happened to match, and stayed hidden
from the forum's real moderators. Ids are only unambiguous where they are
named, so they are named. The array also gets multi-forum actions right:
a move concerns two forums, and every one of those forums' moderators
sees the entry. A GIN index over the array keeps the scoping cheap.

**Cost.** Rows written before this change have no `forumIds`. Ones that
carried an unambiguous forum key are still scoped by it; an old split,
merge or move row is visible only to the moderator who wrote it, because
the alternative is the misattribution above. There is no backfill — a
migration that guessed would write the bug into the table permanently.

### A lock and an unlock are two actions, not one action with a flag

**MyBB:** records `open`/`close` and `stick`/`unstick` as separate action
names.

**Meith:** the same — `thread.lock` / `thread.unlock`, `thread.stick` /
`thread.unstick`.

**Why.** One action name with a boolean in the detail gives the log one
label to print, so unlocking a thread would read as "Locked a thread"
with "Set to: false" underneath. A log is read by someone reconstructing
what happened, and the first line has to be true on its own.

### The address lookup finds ranges, not addresses

**MyBB:** the ModCP's IP search matches full addresses, which MyBB
stores.

**Meith:** it matches the truncated prefix the board stores, and the
screen says so.

**Why.** Every address is truncated before it is written, so there is no
full address to match — a consequence of the privacy invariant rather
than a choice made here. The screen states it because the difference
matters to what a moderator does next: "shares an address" reads as
proof, "shares a range" reads as something to check, and only the second
is what the data supports.

**Two ranges are on record per account, written at two moments.**
`registration_ip_prefix` is written once, by the registration;
`last_ip_prefix` is rewritten by each successful sign-in. MyBB also
stamps `lastip` on ordinary page views; Meith leaves the presence write
alone, because the sign-in is the moment the board learns an account is
being used from somewhere, and it costs one update per session rather
than one per member per minute.

**Cost.** Both columns are null for every account the board already had,
and for every account an import creates — the importer does not carry
`regip` or `lastip` across, so an imported board's lookups stay empty
until its members sign in here. `posts.ip_prefix` exists in the schema
and nothing writes it: a per-post trail would be a second address record
to keep, not a second thing to search.

---

## The control panel

### The control panel has its own session, with its own timeout

**MyBB:** an admin session keyed to the board login, with a configurable
timeout.

**Meith:** a row in `admin_sessions` minted by re-entering the password,
with a 30-minute idle timeout, an 8-hour absolute ceiling, and its own
cookie (`Path=/admin`, `SameSite=Strict`). A board password change
revokes it.

**Why.** The threat is an administrator's own browser being used by
somebody else, not a password being guessed. A board session lasts days
by design; an admin session that inherited that would make an unattended
laptop a board takeover. Separating them is what lets the panel timeout
be short enough to matter.

**Cost.** An administrator types their password twice — once for the
board, once for the panel — and again after half an hour away.

### The re-authentication clock is separate from the activity clock

**MyBB:** the admin session has one timestamp, refreshed on every
request.

**Meith:** `last_seen_at` moves with activity; `authenticated_at` moves
only when the password is re-entered. Destructive operations read the
second, over a fifteen-minute window.

**Why.** With one timestamp, an administrator who has been clicking
around for an hour has a "fresh" session and is never asked again —
which makes re-authentication a formality that fires only for people who
walked away.

**Cost.** A long panel session asks for the password more than once, and
only for destructive operations.

### The address allowlist is prefixes in the environment, not CIDR in the database

**MyBB:** `$config['superadmins']` and an optional IP check in
`config.php`.

**Meith:** `ADMIN_IP_ALLOWLIST` — comma-separated whole addresses, or
textual prefixes ending in `.` or `:`. Empty means no restriction.

**Why.** The environment rather than a setting, because the allowlist
defends against a stolen administrator credential, and storing it where
that credential could edit it defeats the point. Prefixes rather than
CIDR, because a mask is a thing people get wrong by one bit, and the
failure mode is locking yourself out. The check runs *before* the board
session is read, so a request from outside the list cannot learn the
panel exists.

**Cost.** No `/28`-style precision, and no way to change it without a
redeploy — both deliberate. A deployment behind no proxy (where no
forwarded address arrives) is refused outright when a list is
configured: the documented failure direction, rather than a silent
bypass.

---
