# MyBB parity decisions

Every place a Meith board deliberately behaves differently from MyBB, what
it does instead, and why. **Read this before promising anyone a
like-for-like move.**

> [!NOTE]
> Looking for the procedure instead — the import command, what comes
> across, what to do afterwards? That is
> [Migrating from MyBB or phpBB](../guides/migrating.md), which also has the
> [full coverage table](../guides/migrating.md#what-comes-across-and-what-does-not).
> This page is about behaviour, not transfer. Coming from phpBB, most of
> it still applies — it is a decision about this board, not about MyBB —
> but also read [phpBB parity decisions](./phpbb-parity.md) for the
> handful of places phpBB needed a different answer.

Each entry has the same four parts, and only exists when the divergence
was **chosen** — a surprise is a bug, not a parity decision:

| Part | What it tells you |
|---|---|
| **MyBB** | What the board you are leaving does |
| **Meith** | What this board does instead |
| **Why** | The reasoning, so you can judge whether it suits your community |
| **Cost** | What an imported board actually loses, stated plainly |

## What is on this page

- [Permissions and groups](#permissions-and-groups)
- [Posting and Markdown](#posting-and-markdown)
- [Spam](#spam)
- [Announcements](#announcements)
- [Editing and deleting](#editing-and-deleting)
- [Polls](#polls)
- [Moderation](#moderation)
- [Warnings](#warnings)
- [The moderator log](#the-moderator-log)
- [Notifications and digests](#notifications-and-digests)
- [Accounts and profiles](#accounts-and-profiles)
- [Private messages](#private-messages)
- [Buddies, ignoring and signatures](#buddies-ignoring-and-signatures)
- [Reputation](#reputation)
- [The control panel](#the-control-panel)
- [Attachments and avatars](#attachments-and-avatars)
- [Reading and discovery](#reading-and-discovery)
- [Feeds, URLs and the sitemap](#feeds-urls-and-the-sitemap)
- [The BBCode conversion](#the-bbcode-conversion)
- [Search](#search)

---

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

## Posting and Markdown

### The markup language is Markdown, not BBCode

**MyBB:** posts are BBCode: `b i u s color size font align url email img
quote code php list hr video`, plus smilies, admin-defined custom MyCode,
and auto-linking of bare URLs.

**Meith:** posts are Markdown. A board that upgrades or imports has its
content **converted once**: posts are rewritten in the background by the
render backfill, and private messages, signatures, announcements and
drafts are converted when they are next read. There is no BBCode renderer
left in the tree, and no board runs two markup languages at once.

This is the largest single divergence in this document, so what survives
is worth stating precisely:

- **Converted with no loss:** `b i s url email img quote code php list`
  all have a Markdown spelling, and the converter produces it. A quote
  keeps its attribution — `[quote='Bob']` becomes
  `> **[Bob](/member/by-name/Bob) wrote:**` above the quoted lines — and
  `[code]` and `[php]` bodies are fenced with a rail long enough that
  their own backticks cannot close it.
- **Converted with the styling dropped, the words kept:** `u`, `color`
  and `size` have no Markdown spelling. `[color=red]stop[/color]` becomes
  `stop`. **This is a real, permanent loss of presentation on an imported
  board** — the one place in the migration where something a member wrote
  does not come back. Nothing they *said* is lost, only how it was
  coloured.
- **Left as the text it was:** `font`, `align`, `hr`, `video`, `[table]`,
  and any custom MyCode the old board defined. An unrecognised tag is
  escaped and shown as the characters its author typed, so an imported
  post reads as slightly plainer prose rather than as a hole.
- **Gained:** headings, tables, task lists, thematic rules, fenced code
  with a language, and auto-linking — which MyBB had and this board's
  earlier BBCode renderer refused. Markdown resolves the ambiguity that
  made it refusable: a bare URL ends at whitespace and gives back the
  trailing punctuation that belongs to the sentence.

**Meith does not accept raw HTML**, which CommonMark says should pass
through. Accepting it would need a sanitiser, and a sanitiser is a
blocklist; this renderer constructs its output instead, which is why it
has never had one. `<script>` in a post is seven escaped characters and a
word. Two smaller deviations from CommonMark: a single newline is a line
break, and there are no indented code blocks.

**A directive is not MyBB's custom MyCode.** MyBB's takes a *replacement
pattern* — a regular expression and the HTML to put in its place — so an
administrator can produce any markup from a form. Meith's chooses a
**name** and whether it is inline or block; members write `:::note` …
`:::` or `:note[…]`, and the element is constructed by
`@meith/markdown`. That is a real capability difference and a deliberate
one: a field that chooses output markup is a second markup language
administered through a web form, which is how boards with custom MyCode
acquire a permanent XSS surface. Anything needing bespoke markup is a
plugin, where the code is reviewed rather than typed into a text box.

**`spoiler` is not a directive an administrator defines — it is built
into the renderer**, on every board, and reveals with a native
`<details>`/`<summary>` element that needs no JavaScript. MyBB's
`[spoiler]` MyCode (never core, always a plugin) still falls into "left
as the text it was" on import, same as any other custom MyCode; a member
who wants a hidden section after the move writes `:::spoiler` … `:::`.

**Cost.** An operator promising a like-for-like move should promise it
about the *text*, not the colours. Members who knew BBCode have to learn
a different syntax — the composer's toolbar, shortcuts and formatting
help exist for exactly that week.

### Quoting fills the box you are looking at

**MyBB:** quotes by navigating to the reply page, with multiquote for
collecting several posts first.

**Meith:** does both and, with JavaScript on, neither navigates: clicking
**Quote** puts the quote into the quick reply already on the page, opens
it, and puts the caret under the quote.

**Multiquote is a selection you can see.** **Multi-quote** is a toggle: it
reports whether this post is in the selection, and a second click takes it
out again. Above the reply box a strip names the count — "3 posts selected
to quote" — and carries the two things you can do with it: **Add to reply**,
which fetches the quotes and drops them in the box in the order they were
selected, and **Clear**, which throws the selection away. Every change is
announced to a screen reader as it happens, so the count is conveyed the
same way it is shown. The selection lives in `sessionStorage`, so it
survives turning the page and collects posts from more than one page of a
thread; arriving at the full reply page spends it, exactly as clicking
**Quote** does. Spending it and clearing it are the only two things that
empty it.

The strip is a client island, so it appears only where scripting does. With
scripting off the **Multi-quote** button is not rendered at all and the
**Quote** link is the whole feature, as below.

**The quote comes from the server, by post id** — not read out of the page
and turned back into markup in the browser. The server fetches the post
through the same visibility lookup the reply page uses, so a reader
cannot quote something they were never shown, and a moderator cannot
republish a deleted post by quoting it.

**A quote names its source twice.** The attribution links the member, and
carries a link back to the post it was taken from. Both are written into
the Markdown rather than held as attributes, so they survive the reply
being edited, and the link back uses the post's durable id-based form
rather than its position in the thread, which moves.

**Cost.** One request per quote, where a board doing it in the browser
makes none. With scripting off, the Quote link is a link to the reply
page, exactly as it always was.

---

## Spam

### No hosted captcha, and limits beside the interval

**MyBB:** ships a built-in image captcha, supports reCAPTCHA and hCaptcha,
and models flood control as a per-usergroup interval.

**Meith:** ships a honeypot, a fill-time floor, admin-defined question
challenges and first-post moderation, plus hourly limits on posting,
searching, private messages, reports and uploads. There is no image
captcha and no hosted provider.

**Why.** Three separate reasons:

- *No image captcha.* Generating one means rendering text to an image
  (a dependency), the accessible fallback is an audio challenge (another),
  and both are defeated by commercial solvers for less than they cost to
  run. A question a regular can answer and a script cannot is weaker
  against a determined human and stronger per unit of effort.
- *No hosted provider by default.* hCaptcha and reCAPTCHA work, and they
  mean every visitor's browser contacting a third party before they can
  register. That is a decision about a board's members rather than a
  setting, so the `CaptchaProvider` seam is shipped and the service is
  not.
- *Limits beside the interval, not instead of it.* An interval does
  nothing about a script that posts every 31 seconds all night, so the
  board adds a *limit* — how many in an hour — counted in the database so
  every instance shares one allowance. The two answer different questions
  and both are configured.

**Cost.** An imported board's captcha configuration does not carry over;
the challenge has to be set up again and the questions written. Its flood
settings map onto the interval; the hourly limits start at zero.

---

## Announcements

### Announcements are not sticky threads

**MyBB:** has announcements, and boards frequently use a pinned thread for
the same job anyway.

**Meith:** has announcements that are deliberately *not* threads: nobody
can reply to one, it has a start and an end date, and it lives above the
forums rather than in the listing.

**Why.** A sticky thread is a conversation — it belongs to its author,
members reply to it, and taking it down deletes what they said. That is
what leaves a three-year-old rules post pinned at the top of a forum. An
announcement expires on its own, and removing it removes nothing anybody
wrote.

Two smaller differences follow. There is no per-group visibility on an
announcement: a forum's announcement is shown to whoever can see that
forum, resolved through the same filter as everything else, and a
board-wide one to everybody. And the dates are entered in **UTC**, because
the control submits wall-clock text with no zone and the alternative is an
announcement appearing at a different hour depending on the container's
`TZ`.

---

## Editing and deleting

### Markup that does not close

**MyBB:** its regex passes leave an unmatched `[b]` as literal text, and can
emit unbalanced HTML for crossed tags.

**Meith:** cannot emit unbalanced markup at all: the renderer builds a tree
and writes elements out of it, so no opening tag reaches the page without
its closing one. An unmatched `**` is two asterisks, an unterminated
`` ` `` is a backtick, and an unclosed fence ends at the end of the post
rather than swallowing the thread.

**Why.** Unbalanced output from a post body is the shape that lets
formatting escape a post and affect the rest of the page, so this one is
not negotiable regardless of parity. The visible outcome for the common
mistake is the same as MyBB's: you see what you typed.

### Deleting the first post of a thread

**MyBB:** lets a member with `candeleteposts` delete any of their own
posts, including the opening one — leaving the remaining replies under a
first post that no longer exists.

**Meith:** refuses it, with a message pointing at thread deletion instead.

**Why.** The opening post *is* the thread as far as every listing is
concerned — it supplies the title, the author, and the counters. The two
ways to allow the click both lose: deleting only the post leaves a thread
with a title and nothing to read; quietly deleting the whole thread means
"delete my post" removes other people's replies without saying so.
Refusing and naming the alternative is the only option that does what it
says.

**Cost.** A member who wants their thread gone needs `canDeleteOwnThreads`
granted, or a moderator. An imported MyBB thread whose first post was
deleted arrives with that post soft-deleted rather than missing — the
moderator view shows it, the member view skips it.

### Editing a post after the window closes

**MyBB:** hides the edit control once `edittimelimit` has passed and
refuses the submission server-side.

**Meith:** does the same, with one difference: the window is a **numeric
permission**, so the usual combination applies — `0` means unlimited and
beats every other value across a member's groups. A member in a 30-minute
group and an unlimited group gets unlimited.

**Why.** It is the same rule every other numeric on the board follows. An
edit window is an *allowance*, so MAX is the right rule and no special
case is needed — unlike the flood interval above, where minimum-wins
genuinely is correct and the field was therefore modelled as a setting.

---

## Polls

### Making a poll's voters public after voting has started

**MyBB:** stores `public` on the poll and an administrator may switch it on
at any point, including on a poll that has been running for a month. Every
vote already cast becomes attributable.

**Meith:** carries the same flag, and the same import, but refuses to turn
it on once the first vote is in. It may be switched **off** at any time,
and a poll created with public votes says so above the options before
anybody picks one.

**Why.** A public voter list is a disclosure a member consents to when
they vote, and consent given to a secret ballot cannot be reinterpreted
afterwards. Making the flag one-way in the risky direction is the only
version of the feature that does not turn a past vote into something the
voter did not agree to.

**Cost.** A board that meant to run a public poll and forgot to tick the
box cannot fix it in place once voting starts. The poll has to be closed
and re-run.

### A multiple-choice poll carries a maximum, not a flag

**MyBB:** models multiple choice as the boolean `multiple`: a member either
picks one option or picks as many as they like.

**Meith:** stores a number — 1 for a single choice, N for up to N, and 0
for no limit — so "pick your top three" is expressible. A MyBB poll with
`multiple` set imports as 0, which is exactly what it meant.

**Why.** The two useful polls MyBB cannot express are both caps, and the
boolean is the degenerate case of the number rather than a separate idea.
phpBB already stores `poll_max_options`, so the number is also what the
other importer needs.

**Cost.** None on import in either direction.

### Who may edit a poll, and what they may change

**MyBB:** has a `canmanagepolls` moderator right and lets the poll's author
edit it inside the forum's edit window.

**Meith:** drops the separate right — it granted nothing, as
[Upgrading](../guides/operations/upgrading.md) records — and authorises a poll edit exactly
as it authorises editing the thread's opening post: the author inside the
forum's edit window, and anybody who may edit others' posts at any time.
Options may be added while a poll is running, and an option that already
has votes cannot be removed.

**Why.** A poll is part of the post it was attached to, so a second
permission for it is a second thing to get wrong. Refusing to remove a
voted-for option keeps the running totals meaning what they said they
meant; adding options is safe because it cannot change a vote already
cast.

**Cost.** A board that gave a moderator poll rights without post-editing
rights has to grant the post-editing right instead.

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
[private messages](#reporting-is-the-only-way-staff-read-a-private-message).

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

## Notifications and digests

### A notification centre exists at all

**MyBB:** has no notification centre. What a member is told arrives as
e-mail, plus the "You have N new messages" line. When the e-mail is
filtered or never read, nothing on the board records that the member was
told.

**Meith:** every notification is written to a `notifications` row first
and delivered by e-mail second. The board's record is the row; the
e-mail is one transport for it, and the transport can be declined.

**Why.** A warning that changes what a member may do has to be
discoverable from the board itself. Making the record the primary
artefact also gives every notifier — subscriptions, private messages,
reputation — one place to write to rather than an e-mail template each.

**Cost.** One more table on the read path — an unread count in the user
panel on every page for a signed-in member, which is why its index is
partial over unread rows.

### The header carries one menu, not two counts

**MyBB:** the header shows separate figures — a private-message count and,
with a plugin, whatever else wants a number — each a link to its own page.

**Meith:** the header carries a single notifications control. It shows one
badge, the member's total unread across notifications, private messages
and — for a moderator — the moderation work waiting on them, and opens a
menu with a tab for each: **Notifications**, **Messages**, and — for a
member who may reach the moderation panel — a **Mod** tab of the approval
queue and the open reports. Each tab lists only what is still outstanding —
unread notifications, unread messages, the open moderation work — links
every one through to the thing it is about, and (for notifications and
messages) marks entries seen without leaving the page; reading one drops it
from the list, and the tab also links to the full page behind it. With scripting off the control falls back to
the same unread-count links the header carried before, so nothing the menu
adds is load-bearing.

**Why.** Two counts that each open a different page make a member choose
before they have seen anything; one badge answers "is there anything for
me" and one menu shows what, sorted by the kind of thing it is. The **Mod**
tab carries a moderator's actual outstanding work — the same approval-queue
and open-report figures the moderation panel shows — rather than the run of
their own notifications, so it counts what needs a decision.

**Cost.** To fill its tabs the menu reads the first page of the
notifications list and of the inbox, on top of the two unread counts the
header already had; for a moderator it also reads the first page of the
approval queue and of the open reports, alongside the counts the moderation
panel already computes — a few short reads added to a signed-in page, and
only for a member who is signed in.

### On-site delivery cannot be switched off; e-mail can

**MyBB:** every notification channel is opt-out.

**Meith:** the preferences screen configures **e-mail only**. Every kind
is recorded in the notification centre regardless.

**Why.** The centre is the board's evidence that somebody was told. A
member who could erase the record could later say they were never
warned, with the board's own data agreeing — which is worse for the
member too, since a moderator reviewing an appeal has nothing to look
at. Declining e-mail costs nobody anything, because the record survives.

**Cost.** A member who does not want to see a notification cannot remove
it, only mark it read.

### The reporter is told when their report is closed

**MyBB:** tells the reporter nothing.

**Meith:** closing a report raises `report.actioned` for the reporter,
naming the outcome (actioned, or closed without action) and the captured
label of what they reported. The moderator's private note is never
included — the port that carries the notification has no field that
could hold one.

**Why.** A report button that silently swallows reports trains members to
stop using it, and "we looked and decided not to act" is a legitimate
outcome to communicate. E-mail for this kind is **off** by default,
because reporting is exactly the act a member repeats.

### A repeated notification is one row with a count

**MyBB:** does not have the problem, having no notification store.

**Meith:** a raise may carry a dedupe key. While the notification it
produced is unread, further raises with the same key increment a counter
and update the captured facts instead of writing a new row — enforced by
a partial unique index rather than a read-then-write. Once the row is
read, the next raise starts a fresh one.

**Why.** The first notification the board raises without a human behind
it is `system.task_failed`, and a task failing on every tick would
otherwise write 1,440 rows a day per administrator, with an e-mail behind
each. The count is also the more useful number: "this has failed 40
times" is the difference between a blip and an outage.

**Cost.** The first occurrence's details are replaced by the latest —
deliberate for an operational alert, and why warnings carry no dedupe
key: two warnings are two things that happened, and collapsing them
would hide the one that crossed a threshold.

### "Instant" notification means "within a tick"

**MyBB:** sends a subscription e-mail during the request that created the
post.

**Meith:** the post commits, and the `subscriptions.instant` task tells
the subscribers on its next run — at most a minute later on a board whose
tick runs every minute.

**Why.** Notifying inline is an unbounded loop inside the board's hottest
write: one iteration per subscriber, each needing a permission re-check,
each potentially a mail send. On a thread with 500 followers that is a
posting request that takes seconds and fails when the mail provider is
down.

**Cost.** A subscriber can open a thread and see a reply before the
notification about it arrives. That is strictly better than the failure
it avoids, and the delay is bounded by the tick interval.

### A digest's clock is per member, not per board

**MyBB:** has no digests — every subscription is instant e-mail or
nothing.

**Meith:** a subscription's cadence is `instant`, `daily`, `weekly` or
`none`, and the daily/weekly clock is stored per member *and* per
cadence.

**Why.** A board-wide "send the digests now" schedule delivers
everybody's digest at whatever moment the tick fired, and hands somebody
who subscribed on Sunday a "weekly" digest on Monday. Per member, the
interval means what it says; per cadence as well, because one member can
follow one thread daily and another weekly, and one clock cannot serve
both.

### Auto-following starts off, and never overrides a mute

**MyBB:** `subscribemethod` is one admin setting, applied to every
member alike — everybody who posts is subscribed at the same method, or
nobody is. A member who wants "tell me about the threads I start" but
not "the ones I reply to" has no way to ask for it.

**Meith:** two member preferences, "Follow threads I start" and "Follow
threads I reply to" (`/usercp/options`), each an independent cadence —
`instant`, `daily`, `weekly` or `none`, the same four values a
subscription itself can hold. Posting or replying while a preference is
on creates a subscription at that cadence, but only if the thread
carries none already: the insert is `on conflict do nothing`, never an
overwrite, so a thread a member has explicitly muted (`none`) stays
muted through their own reply. The composer's existing "Notify me of
replies" checkbox reflects the preference by default and remains the
per-post override — untick it and that post follows nothing, whatever
the preference says.

**Why.** A single board-wide switch cannot express "my own threads but
not my replies," and a naive auto-subscribe that overwrote an existing
subscription would silently un-mute a thread the moment its owner
happened to reply to it.

**Cost.** New boards seed both preferences to off, and no existing
member is opted in when the feature ships — consent is asked, never
inferred from a column's default. A member who wants the classic
"always follow what I post in" turns both on themselves, once.

### A digest can also nudge a member who has stopped visiting

**MyBB:** has no notion of a member who has drifted away, and nothing to
send one.

**Meith:** `board.digest` is a notification kind of its own, separate
from the follow-driven digest above — **e-mail off by default**, in
keeping with the board's opt-in stance on mass mail (below). A member who
turns it on also picks a cadence, weekly or monthly, and is sent one only
once they have gone quiet for a run of days a board setting decides *and*
their own cadence has elapsed — a member who visits daily never receives
one, however long the feature has been on. Its content is built
per recipient: the busiest threads since that member's own last visit,
filtered through the same permission check as everything else, for the
same reason as
[the online list](#the-online-list-names-a-location-only-when-the-reader-may-know-it) —
a re-engagement e-mail is exactly the kind of thing that must never leak
a private forum's existence to somebody it was written to bring back.

**Why.** A digest that fires for everyone on the same schedule tells an
active member about a thread they already read, and a re-engagement
e-mail that leaks what it is inviting somebody back to see is worse than
sending none.

**Cost.** Two members who go quiet on the same day can receive visibly
different digests — one may list threads the other's does not, because
the forums behind them differ. That is the intended behaviour, not a bug
to reconcile.

### The unsubscribe link acts on POST, not on GET

**MyBB:** unsubscribe links are GETs — following the URL removes the
subscription.

**Meith:** the link opens a page that says what unsubscribing would do
and offers one button. The button is the act.

**Why.** Mail clients, corporate link scanners and preview fetchers
request every URL in a message. A GET that unsubscribed would mean a
member unsubscribed by their own spam filter, never knowing why the
notifications stopped.

**Cost.** One extra click for somebody who genuinely wants out. The page
needs no login and no JavaScript.

### Mass mail is opt-in, and carries an unsubscribe link

**MyBB:** a new account has *Receive e-mails from board administrators*
switched on. Mass mail goes to everybody who has not found the setting
and turned it off, and the message itself carries no way out.

**Meith:** no account is in the mass-mail audience until the member asks
to be. The registration form offers an unticked box, the member's
notification preferences hold the same switch, and the board stores the
moment consent was given. Every message carries an unsubscribe link that
needs no login, and a member who uses it drops out of every campaign
that follows — including one already half sent, because each batch
re-reads the audience.

**Why.** Consent that is assumed at registration is not consent, and a
bulk message with no way out is not one either. Both are conditions of
the GDPR, and neither can be bolted on by an administrator remembering
to be careful.

**Cost.** An imported board arrives with a mass-mail audience of nought:
MyBB's `allownotices` is an opt-out, so importing it as consent would be
recording an answer nobody gave. Members opt in from the board, or by
one deliberate backfill the operator can defend.

### Unsubscribing from a digest does not delete subscriptions

**Meith:** the digest's unsubscribe link switches subscription **e-mail**
off. Every subscription stays, and new posts still appear in the
notification centre.

**Why.** A digest covers many subscriptions, so "unsubscribe" cannot
mean one of them — and taking it to mean "all of them" would delete a
member's follow list because they wanted fewer e-mails. The per-thread
link in an "as it happens" notification *does* end that one
subscription, because there the member knows exactly which thread they
are silencing.

---

## Accounts and profiles

### Timezones are IANA names, never offsets

**MyBB:** stores a numeric offset (`timezone = -5`) plus a DST flag.

**Meith:** stores an IANA zone name (`America/New_York`), validated
against the runtime's tz database. Offsets are refused even though
`Intl` would accept them.

**Why.** An offset cannot express summer time, so it is wrong for half
the year in every zone that observes it — and MyBB's answer, a DST flag
somebody has to flip, is wrong every year for anybody who forgets. The
tz database already knows when the clocks change.

**Cost.** Imported offsets do not map cleanly — `-5` is
`America/New_York` in winter and `America/Chicago`'s summer, and neither
is certain. The importer has to pick a representative zone per offset and
say so.

### The default timezone is the reader's, not the board's

**MyBB:** has one board timezone that every guest and every member who has
not changed it reads the board in.

**Meith:** has no board timezone. A reader's own zone is detected in the
browser and reported to the server in a cookie, so a guest in Auckland
and a guest in Chicago see the same thread at their own two clocks. A
member may pin a zone, and a pinned zone wins on every device.

**Why.** A board timezone is right for whoever set it up and wrong for
everybody else — most of all the guest who cannot change it and the
member who does not know the setting exists. "Posted today at 09:14" has
to mean the reader's today, or it is worse than a bare date.

**Cost.** A reader with JavaScript off reports nothing and gets UTC —
the footer names the zone precisely because that case exists. And the
first page a new reader opens reloads once, after the cookie is written.

### A password change signs out every other device

**MyBB:** changing a password keeps other sessions alive.

**Meith:** every session is revoked, and the device that made the change
is immediately given a fresh one.

**Why.** Changing a password is what somebody does when they think an
account is compromised; one that leaves the attacker's session alive has
done nothing. Re-issuing for the current device is what stops the safe
behaviour from also being the annoying one.

### Changing an e-mail address requires confirming the new one

**MyBB:** with "verify e-mail" off — the default on many boards — the
address changes immediately.

**Meith:** the new address is held in a single-use token and adopted only
when the link sent to it is followed. The current password is required
to ask.

**Why.** Two failures, and the second is the serious one: a typo strands
an account at an address nobody owns, and an unattended session becomes
a full takeover — change the address, request a password reset, done.
Confirming the new address closes both.

**Cost.** A member whose new address bounces keeps the old one, which is
the safe direction. A board with no mail configured cannot change
addresses at all.

### A custom profile field's visibility is per group

**MyBB:** `profilefields` carries `viewableby`/`editableby` as
comma-separated group-id lists plus a `hidden` flag, resolved by
substring check.

**Meith:** a row per (field, group) with nullable `can_view` /
`can_edit`, resolved by the same rule as everything else on this board:
NULL abstains, any explicit grant wins.

**Why.** The same shape as `forum_permissions`, so "who can see this"
has one mental model. A NULL that abstains is also what makes "staff may
edit this" one row instead of a row per group — and a comma-separated
list of ids cannot express "no opinion" at all.

**Cost.** MyBB's *deny by omission* does not survive: a group absent
from `viewableby` becomes a group with no opinion, which inherits. The
importer must write explicit deny rows, or set the field default and
grant the listed groups.

### Registration asks only for fields the new member can edit

**MyBB:** a field marked `required` is asked at registration regardless
of whether the registering member's group can edit it afterwards.

**Meith:** `requiredAtRegistration` is intersected with what the board's
default member group may edit, so a field they could never change is not
asked for either.

**Why.** "What you are asked at registration" and "what you may change
afterwards" disagreeing is a trap — somebody types an answer they can
never correct.

**Cost.** An operator who marks a field required but forgets to let the
registered group edit it gets a field that is silently never asked. The
CLI's `profile-field:add` starts every new field editable by every
group, the state where this cannot bite.

### An emptied field is deleted, not stored as an empty string

**MyBB:** a column per field, with text columns defaulting to `''` — so
"not answered" and "answered with nothing" are the same value.

**Meith:** a row per (member, field), and clearing an answer deletes the
row.

**Why.** Every read would otherwise have to treat two states as one, and
one of them eventually forgets — a profile showing an empty "Pronouns:"
row is the visible half. It also makes an unanswered field cost nothing
on a board with twelve fields and ten thousand members who filled in
two.

**Cost.** A column-per-field table is one join cheaper to read — and a
schema migration every time an operator adds a field, which is the trade
MyBB made and this does not.

### The reset and confirmation forms never say whether an address exists

**MyBB:** the lost-password form answers "the e-mail address you entered
was not found" for an unknown address.

**Meith:** one sentence on every path. An unknown address, an
already-active account, a failed send and a link that really went out
all produce the same notice — and the rate limit is spent *before* the
account is looked up, so its refusal cannot be provoked for one address
and not another.

**Why.** A form that answers "is there an account for this address?"
answers it for anybody, one submission at a time — including for a list
of addresses somebody bought. On a board where membership itself is
sensitive, that is the whole game.

**Cost.** Somebody who mistypes their own address is told a link was
sent, and no link arrives. The resend screen names the address it used,
which is the one place the typo becomes visible.

### An unconfirmed account is a state on the row, not a usergroup

**MyBB:** an account waiting for activation is a member of the "Awaiting
Activation" usergroup, so activating somebody means moving them between
groups.

**Meith:** `users.state` carries `awaiting_activation`, the group is the
board's default, and confirming an address stamps
`users.email_verified_at`. Under the `both` activation method the stamp
is what says "the address is proven, an administrator has not looked
yet".

**Why.** A group is how permissions are decided; lifecycle is not a
permission. Modelling it as one makes every permission question silently
depend on account state, and means a ban — implemented by capturing and
restoring the group — cannot be reasoned about independently. It also
keeps the two facts separable: an account can be proven and unapproved,
which `both` needs and a single group membership cannot express.

**Cost.** An operator cannot grant unactivated accounts a different
permission set by editing a group, because there is no group to edit.

### A username's length is counted in code points

**MyBB:** measures with `my_strlen`, which counts characters where
mbstring is available and bytes where it is not — the same name can be
two lengths on two installations.

**Meith:** `registration.username_min` and `registration.username_max`
are counted in Unicode code points, on every board.

**Why.** The accepted alphabet admits letters outside the Basic
Multilingual Plane, and JavaScript's `String.length` counts UTF-16 code
units — every such letter occupies two, so measuring with it made "your
alphabet decides what the number means" the actual rule.

**Cost.** None; Postgres counts character limits the same way.

---

## Private messages

### A private message is stored once, not once per recipient

**MyBB:** `privatemessages` holds a row per copy — the sender's Sent
Items and each recipient's Inbox carry the full subject and body.

**Meith:** `private_messages` holds the content and
`private_message_copies` holds one small row per participant.

**Why.** A message to twenty people is otherwise twenty copies of the
text, and re-rendering one is twenty writes. It also makes the quota
count *copies* — the thing a member can actually delete.

**Cost.** A join on every folder listing, which the indexes exist for.
And a message everybody has deleted leaves an orphan content row rather
than disappearing by cascade — deliberately, because deleting *your*
copy must not reach into somebody else's mailbox. (Nothing prunes those
orphans today.)

### The quota is storage; the daily cap is separate

**MyBB:** `pmquota` caps stored messages, with no separate send rate for
most groups.

**Meith:** two numbers. `maxPrivateMessagesPerDay` caps sends;
`privateMessageQuota` caps what a member may keep. Both are
0-means-unlimited numerics combined by MAX across groups.

**Why.** They answer different abuse questions: a rate limit slows a
spammer; a storage limit bounds what the board pays to keep. Collapsing
them means a board that wants a hundred stored messages must also allow
a hundred a day.

**Cost.** One more column on `usergroups`, and two numbers to think
about. The seeded ladder sets both, so an unconfigured board behaves
sensibly.

### A full inbox refuses the whole send, and names who is full

**MyBB:** a send to a member over quota fails and reports it.

**Meith:** the same, extended to multiple recipients — if any one of
them is full, **nothing is sent to anybody**, and every full recipient
is named.

**Why.** Partial delivery leaves the sender with a Sent copy claiming a
message went somewhere it did not. Naming the full recipient trades a
small disclosure against the much worse failure of a sender who
believes they were heard.

**Cost.** One member with a full box blocks a message to nine others
until the sender removes their name — the intended outcome, and the
message says which name to remove.

### Reporting is the only way staff read a private message

**MyBB:** a reported PM is copied into the report, and administrators
with database access can read any message.

**Meith:** there is no listing, no search and no browse path into
private messages at all. The report path takes an id and is reached
only from an existing report row, so a moderator reads exactly what was
reported and nothing beside it. A message can only be reported by
somebody who holds a copy of it.

**Why.** A moderation tool that can enumerate private messages is a
surveillance tool with a moderation feature attached.

**Cost.** A moderator cannot see the rest of a conversation for
context — only the message that was reported. Reporting each message is
the way to give them more, which is also the way the member chooses what
staff see.

### Reply addresses the author, not everybody on the message

**MyBB:** reply addresses the sender; "reply to all" addresses everyone.

**Meith:** reply addresses the author, and there is no reply-all.

**Why.** Bcc. A recipient who was bcc'd is hidden from the others, and a
reply-all composed by one of them would either leak that name or
silently drop somebody — and whichever it did, it would do it without
the member noticing.

**Cost.** Answering a group conversation means typing the other names,
which the composer shows in the "To" line of the message being replied
to.

---

## Buddies, ignoring and signatures

### Ignoring hides a post's body; it does not remove the post

**MyBB:** an ignored member's posts are collapsed client-side, with the
body still in the HTML.

**Meith:** the body is withheld **server-side** — it is not in the
response at all — and the post keeps its place in the page and its
number in the thread. A placeholder and a per-post reveal link take its
place.

**Why.** Shipping the text and hiding it with CSS is a preference rather
than a feature. And filtering the post *out* instead would give every
viewer a different page size, make "#12" mean different posts to
different people, and land permalinks on the wrong page.

**Cost.** A thread with an ignored member still has their posts in it,
as placeholders. That is the intended reading: a conversation with holes
in it is still a conversation, and a reader who wants the missing half
is one click away.

### Buddy and ignore are one table, and ignoring is not mutual

**MyBB:** `userlist` with a `type` column — the same shape, but the
ignore is often read as symmetric by the code around it.

**Meith:** one row per **ordered** pair, primary-keyed, so the two lists
are mutually exclusive by construction. `(me, them)` is my opinion of
them and says nothing about theirs of me.

**Why.** A mutual ignore lets anybody silence themselves in somebody
else's eyes by ignoring them first — a griefing tool rather than a
preference.

**Cost.** Two people who both want to stop reading each other need a row
each. One extra click, and the correct model.

### A blocked private message is refused, not silently discarded

**MyBB:** a message to somebody who ignores you is accepted and dropped.

**Meith:** the send is refused, with the **same wording** as a
permission refusal — "X cannot receive private messages" — so it does
not disclose the ignore.

**Why.** Silently discarding it leaves the sender believing they were
heard, the worst outcome for both people. Naming the ignore would make
the send path a way to read somebody's list. The ambiguous refusal is
the only option honest to the sender without betraying the recipient.

**Cost.** A sender cannot tell "they blocked me" from "their group
cannot use PMs" — deliberately, for the reason above.

### A signature's forbidden constructs render as text

**MyBB:** per-group switches for images, links and HTML in signatures,
enforced by stripping or refusing the save.

**Meith:** a signature is parsed with a **narrower set of constructs** —
emphasis, strong, strikethrough, code spans and links. Images, headings,
quotes, lists, tables, rules and code blocks are off, so they come out
as the characters somebody typed.

**Why.** It cannot be bypassed by a construct the build does not know
about, and it degrades — somebody pasting a signature from another board
gets most of it rather than an error. The image is the one that
matters: a remote image under every post is a tracking beacon reporting
each reader's IP to whoever hosts it.

**Cost.** An imported signature that used images loses them, visibly, as
bracketed text the member can delete. The importer should strip the tags
rather than leave them, and say how many it touched.

### A signature is locked, not deleted

**MyBB:** `suspendsignature` with an expiry, plus moderators simply
clearing the text.

**Meith:** a boolean lock with a required reason. The text is kept,
shown back to the member with the reason on their own signature screen,
and cannot be edited while locked.

**Why.** An emptied signature can be retyped the next minute and says
nothing about why it went. Keeping the text is also what lets an appeal
look at what was actually there.

**Cost.** No expiry — an unlock is a second deliberate act. MyBB's timed
suspension is the nicer behaviour and needs a scheduled task; it belongs
with the maintenance sweeps rather than being faked with a column
nothing sweeps.

---

## Reputation

### Reputation has no per-group power multiplier

**MyBB:** `reputationpower` makes a moderator's vote worth more than a
member's.

**Meith:** every rating is worth −1, 0 or +1. The per-group settings are
*whether* you may rate and *how many a day*.

**Why.** A multiplier cannot obey the rule for numeric permissions — MAX
across groups with 0 meaning unlimited — because "unlimited power" is
meaningless. It is the same shape as the flood-interval problem above,
and gets the same answer: leave it out rather than invert the
combination rule for one field.

**Cost.** A board that wants staff endorsements to carry weight cannot
express it. An imported `reputationpower` is dropped, and the importer
should say so rather than silently scaling totals.

### Reputation totals are recomputed, not incremented

**MyBB:** `users.reputation` is adjusted as ratings are added and
removed.

**Meith:** the column is rebuilt with a `sum` over the live rows, inside
the same transaction as whatever changed them — a rating, a withdrawal,
or an account merge, which recounts every affected account.
`warning_points` is rebuilt the same way.

**Why.** An incremented total cannot survive a rating being revised or
withdrawn, and when it drifts nobody notices until somebody counts by
hand — the same decision this board made for the thread and forum
counters.

**Cost.** One extra aggregate per rating, bounded by the number of
ratings one member has. A rating is a deliberate act, not a hot path.

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

## Attachments and avatars

### An attachment is re-encoded, and until it is, it does not exist

**MyBB:** an upload is checked against allowed extensions and MIME
types, stored, and served as uploaded.

**Meith:** PNG and JPEG are decoded to raw pixels and written back out
by an encoder; the stored object is the encoder's output. The uploaded
bytes are held in a separate, unservable object until that succeeds, and
then deleted. A row is `pending` until the re-encode finishes, and
nothing serves a `pending` row.

**Why.** Validation cannot make a file safe. A valid PNG with a ZIP
appended after its `IEND` chunk passes every check anyone could make,
because the file genuinely *is* a valid PNG; so does one with a payload
in an EXIF block aimed at whichever decoder opens it next. None of that
survives a decode and re-encode, because the output is written from
pixels and has never seen the original bytes.

**Cost.** An image is not visible for as long as the queue takes —
usually seconds, up to a minute on a board whose tick is the only
worker. EXIF is gone, including the orientation tag and colour profile —
a real loss for photographers, and a real gain for everybody who did not
mean to publish where they took the picture. Animated GIF is not
accepted at all rather than silently flattened to one frame.

### Four file types, not an operator-configurable list

**MyBB:** an attachment-types screen; an operator adds any extension and
MIME type they like.

**Meith:** PNG, JPEG, PDF and ZIP, as a constant. The images are
re-encoded; PDF and ZIP are served as opaque downloads and never
rendered.

**Why.** A format is on the list only if the board can make a claim
about the bytes it serves — "this was re-encoded", or "this is an
opaque download". A configurable list is a way to accept a format
nothing can process. `text/plain` is the instructive omission: it has
no signature, so "is this a text file" can only ever be a guess.

**Cost.** No `.docx`, no `.mp3`, no `.7z`, and no way to add one without
a release. The admin screen configures *limits*, not *formats*.

### The download is served by the board, not the object store

**MyBB:** `attachment.php` streams the file through PHP after a
permission check.

**Meith:** the same — a route handler that re-checks
`attachment.download` in the attachment's forum, checks the post and
thread are visible to this viewer, and sets
`Content-Disposition: attachment` with `nosniff` and a sandboxing CSP.
The stored object is always private, even in a public forum, and a
signed object-store URL is deliberately not used.

**Why.** A signed URL is a bearer token that outlives the permission
that issued it — move a thread into a private forum and every URL handed
out in the last hour still works — and it carries the bucket's headers
rather than the board's, which is where the safety of serving
member-supplied bytes actually lives.

**Cost.** The bytes go through the app, so a large attachment costs the
board bandwidth. Revisit if the `FileStore` port ever grows the ability
to sign with response headers.

### Files are submitted with the post, in one form

**MyBB:** the composer uploads each attachment over its own request,
keyed to a post id or a "posthash" for a post that does not exist yet,
with abandoned ones swept later.

**Meith:** the file input is part of the reply form and the files arrive
with the message. There is no upload step and no draft token. Editing a
post follows the same rule: the edit form carries its own attachments
field for new files and a checkbox per existing one to remove it, still
one plain submission, never a token. Adding a file this way checks the
same `attachment.upload` permission and spends the same hourly upload
allowance a new post's attachments field does; taking one of the post's
own files back out is gated on the right to edit the post, nothing more.

**Why.** It works with JavaScript off, which the posthash flow does not
without a round trip that loses the typed message. It also removes a
whole class of state — a draft attachment waiting for a post that may
never come — and with it the sweep for abandoned drafts.

**Cost.** A browser cannot repopulate a file input, so a submission that
fails validation loses the chosen files even though the message
survives. That is true of every no-JS upload; an incremental upload
belongs in the editor islands, as an enhancement over this path rather
than a replacement for it.

### An avatar is re-encoded and locked, never linked and never deleted

**MyBB:** three ways to have one — upload, a remote URL, or Gravatar. A
moderator's remedy is to delete it.

**Meith:** upload only, decoded and re-encoded like every other image on
the board, fitted to 200×200, unservable until that succeeds. A
moderator locks it rather than deleting it, with a required reason the
member is shown.

**Why no remote URL.** Rendered directly, it is a tracking beacon
reporting every reader's IP to a third party on every page view. Fetched
server-side to avoid that, it is SSRF: an attacker supplies a URL and
the board makes the request from inside whatever network it runs in.
The only safe version ends at fetch-validate-re-encode-store — which is
what the upload path already is. Gravatar is the remote-URL problem
with a better-known third party.

**Why a lock and not a delete.** The signature argument, stronger:
deleting destroys the evidence, and an appeal about an image has
nothing at all unless the file survives. Locking stops it rendering,
stops the member replacing it, keeps the object, and records a reason.

**Cost.** A member who wants their avatar from elsewhere downloads it
and uploads it, and nobody's Gravatar follows them here. The image
loses its EXIF, which is the point.

### An avatar keeps its aspect ratio; it is not cropped to a square

**Meith:** scaled to fit 200×200, aspect preserved, no crop.

**Why.** Cropping decides for somebody which part of their picture
matters, and a board cannot know. A theme that wants circles can have
them in CSS, which is reversible; a crop at upload time is not.

**Cost.** A wide image renders wide, so a theme laying out a fixed
square has to say `object-fit: cover` rather than assuming. The default
theme does.

---

## Reading and discovery

### "New posts" lists threads, and its window is a day, not your last visit

**MyBB:** `search.php?action=getnew` runs a search for posts since
`lastvisit` and shows the threads those posts are in.

**Meith:** `/discover/new` lists threads whose last post landed in the
last 24 hours; `/discover/today` uses midnight in the member's own
timezone. Both are thread listings ordered by last post,
permission-filtered in SQL and keyset-paged.

**Why.** A genuine "since your last visit" needs the per-thread read
state, and folding that into this query means a join per row or a second
query per page — against a screen with a p95 latency budget the load
harness enforces. MyBB pays that cost as a full search run per page
view, which is why the screen is one of the heaviest on a large board
and why several hosts disable it.

**Cost.** A member who has been away a week sees a day, not a week. The
label says so, and `/discover/participated` and the subscription list
have no window at all.

### A busy thread is one row, not forty

**MyBB:** the "new posts" screens are searches over *posts*, so a thread
with forty new replies contributes forty hits — collapsed by the
template, but counted, paged and ranked as forty.

**Meith:** every discovery view returns one row per thread, and the
limit is a limit on threads.

**Why.** "What is new" is a question about conversations. Paging over
posts means a page of twenty hits can be three threads, and one busy
thread buries the rest of the board.

**Cost.** The row says when the last post was and who wrote it, but not
how many of the replies are new to this reader. `/discover/unread`
answers the coarser question — has anything landed here since I last
read it — for a signed-in member, but a row on any other view still
cannot say how many.

### Jumping to what is new costs nothing until it is clicked

**MyBB:** `newreply.php?tid=` with `goto=newpost` scans the thread's
posts for the first one past `lastvisit` on every request, whether or
not the link is ever followed.

**Meith:** an unread row's link carries `?goto=unread` in the `href`
itself — a plain query string a no-JavaScript reader can follow like
any other. The thread route resolves it only when that request
arrives: it reads the member's per-thread and per-forum markers, finds
the first visible post past them, and redirects to the page holding it
with a `#post-N` anchor; a thread that turns out to be fully read
falls back to its last page. Reading it up to where it renders is
separate — the thread page marks the visited page read after the
response is already on its way, so the read stays current without the
write sitting on the page's critical path. A thread rendered to the
end fully covers its own unread state this way; the "Mark read" button
still exists for a member who wants to leave a thread without reading
it all.

**Why.** The forum, discovery, and board-index listings already know
whether a thread is unread — that is one lookup per row anyway, needed
for the badge — but *where* the first unread post sits still costs a
query building the listing does not otherwise pay. Deferring that
question to the click means the listing pays a fixed cost and the
resolver runs only when its answer is actually wanted.

**Cost.** A member who has never read a thread and follows `?goto=unread`
gets its very first post — correct by definition, but a large thread
that is only unread through one recent reply feels like the jump
undershot.

### Invisible browsing hides you from the count as well as the list

**MyBB:** `users.invisible` removes a member from the online list; the
"N users online" figure still counts them.

**Meith:** the same setting removes the member from the **count** too,
for everybody who cannot see them. Staff — anybody with `modcp.access` —
see them listed and marked.

**Why.** A member removed from the list but left in the total can be
found by subtraction: "eleven online, ten listed" names an invisible
member as surely as printing their name. Hiding somebody halfway is
worse than not offering the setting.

**Cost.** The visible total differs between staff and everybody else,
which looks like a bug until you know why. The "most ever online" record
counts everybody, invisible included — it is a fact about the board's
traffic, not about who anybody may see — so the record can exceed any
total a member has been shown.

### The online list names a location only when the reader may know it

**MyBB:** the online list shows each user's location resolved without
reference to the reader — private forums leak by title through this
screen on stock MyBB.

**Meith:** the location is resolved **in the query, against the reader's
own permissions**. A forum they cannot see arrives at the page as null
and renders "Somewhere on the board" — there is no title in the data for
a theme, a feed or a debug dump to print. A thread needs its forum to be
nameable *and* the thread to be in the reader's content scope, so a
moderator reading a soft-deleted thread does not put its title on the
front page.

**Why.** The alternative is fetching titles and letting the page decide,
which puts the decision in every theme anybody writes, and one of them
will get it wrong.

**Cost.** The online list cannot be cached across readers — it is one
query per reader, which is why it is one query. The location is stored
without a query string, so "reading page 4" is not distinguishable from
"reading page 1", and a member browsing the admin panel shows as
somewhere on the board rather than in the panel.

### Board totals are a rollup with a timestamp, not a live count

**MyBB:** `datacache` holds the board statistics, updated on the write
path — every new post, thread and member updates the cached figures.

**Meith:** a scheduled task recomputes them every five minutes, and the
page says when it last ran. Before the first run the panel says "not
counted yet" rather than showing zeroes.

**Why.** The member count is a count of `users`, and the board index is
the most-requested page there is. Updating on the write path makes
every post pay for a number nobody reads on the posting screen — plus a
cache that drifts with no way to notice. The thread and post totals are
summed from the root forums, whose counters have already accumulated
the tree; the member count is what sets the shape.

**Cost.** The numbers on the index can be five minutes old. They say
so — and a brand-new board says "not counted yet" until the first tick,
which is a truer statement than three zeroes.

---

## Feeds, URLs and the sitemap

### A feed shows what a signed-out visitor sees, whoever fetches it

**MyBB:** `syndication.php` resolves the requesting user from their
cookie and filters the feed against their permissions — a signed-in
member's feed carries their private forums.

**Meith:** every feed under its shared address is built from the
**guest** scope, regardless of who asks — unless the reader appends their
own **feed token** (below), which is the one way to get a personalised
feed, and never from the cookie.

**Why.** A feed URL is handed to software, not read in the browser that
holds the cookie. Aggregators, corporate proxies and CDNs cache one
response per URL and serve it to everybody who asks next — so a
personalised feed under a shared address is a private forum served to a
stranger, in somebody else's cache. MyBB's version is only safe because
most readers never send the cookie at all.

**The feed token.** A member mints one from *User CP → Security*, shown
once, in the shape `forum_feed_<lookup>_<secret>` — the same design as a
personal access token: a public lookup segment for an O(1) row lookup,
and a secret kept only as its SHA-256 hash, never stored raw. Appending
it as `?token=…` to any feed address — `/feed.xml`, `/atom.xml`, a
forum's `/{id}-{slug}/feed.xml`, a thread's feed — builds that feed
through the **same Authorizer and visibility filter a page view uses** for
that member. The token is a restriction on an actor, never a grant: the
feed carries exactly the forums the member can already see and no more,
approved-and-visible content only (a "your threads only" forum narrows to
the member's own threads, just as on the board).

**No oracle.** A missing, malformed, guessed or revoked token is not an
error. It resolves to the guest scope and returns the ordinary guest
feed, with the same status and body a signed-out reader gets — there is
no response that tells "wrong token" apart from "no token", so the
address is neither an account- nor a token-validity oracle. Any request
carrying a `token` parameter — valid or not — is answered
`Cache-Control: private, no-store`, so a shared proxy never keeps a
personalised copy, and because the header keys on the *presence* of the
parameter rather than on whether the token was good, it cannot itself
leak validity. Tokenless feeds stay guest-scoped and publicly cacheable,
exactly as before.

**Revocation.** One token is live per member; minting again retires the
old one immediately. Changing the password drops the token too — the same
event that signs out other devices — and a ban neutralises it at
resolution time: a banned actor's audience is empty, so the token shows
nothing until the ban lifts, without a stored flag to keep in step. The
raw token is never written into page markup except its one-time reveal;
the autodiscovery links a page advertises stay tokenless, so a member
opts in to their private URL by copying it, never by loading a page.

### A category is a page, not only a heading

**MyBB:** a category is a heading on the index and a
`forumdisplay.php?fid=` page of its own.

**Meith:** the same — `/{id}-{slug}` on a category renders its forums,
using the index's own blocks so the two never drift apart. It exists
because the breadcrumb on every thread and forum page names the
category, and a named ancestor that 404s is a trail that stops halfway.

**Cost.** One more page per category to keep working. It shares the
index's view model, so the cost is a route rather than a feature.

### A category can hold threads of its own, if an admin says so

**MyBB:** a category holds forums and nothing else.

**Meith:** **Allow new threads** on a category — off on every category
until an admin turns it on — makes it take threads as well as forums.
Its page then lists them the way a forum's does, and it becomes a
destination a thread can be moved into.

**Why.** The difference between a category and a forum was never about
what a member wanted to do there; it was about where the software would
let them post. A small board is one heading with a handful of threads
under it, and asking it to invent a forum inside a category is the
software's filing system leaking into somebody's front page.

**Off by default is the whole feature:** a category that takes threads
without being asked has quietly become a forum.

**Cost.** Turning it back off stops new threads and returns the page to
its forums. Threads already posted keep their addresses and stay in
search, but the category no longer lists them until it is turned back
on — or they are moved.

### Every page of a thread is its own canonical URL

**MyBB:** emits no canonical link, leaving duplicate URLs for one page
for the crawler to work out.

**Meith:** every thread and forum page carries `rel="canonical"` naming
**the page being read**, with the permalink, cursor and reveal
parameters dropped.

**Why.** The tempting version points every page at page 1, and it is
worse than none: it asks a crawler to drop every page but the first
from its index, which is why so many forums are searchable only for
their opening posts. What a canonical is actually for here is
collapsing `?post=`, `?after=` and `?reveal=` — three ways to reach one
document.

**Cost.** A permalink to post 812 is canonicalised to the page
containing it, so a search result lands on the page rather than the
post. The anchor still works for anybody who follows the original
link.

### A post is anchored by its number, and reached by its id

**MyBB:** links a post as `showthread.php?pid=1234#pid1234` and prints
`#6` beside it. The two never agree, and the one a reader copies is the
one they cannot read.

**Meith:** there is one anchor, `#post-6` — the number the corner
shows. Everything the board writes — notifications, search hits, feed
entries, last-post links, a quote's link back — links `?post=1234`
instead, and the thread page answers that by finding the post and
redirecting to the page holding it, anchored at its number.

**Why.** The two jobs conflict. "The sixth post in this thread" is what
a person means, and it moves when an earlier post is deleted; "post
1234" is what a stored link means, and it must not move at all.
Splitting them across the query and the fragment lets each be what it
is. It is also the only way the link *lands*: a fragment is never sent
to the server, so `#post-812` can only work when the post happens to be
on the page that loaded — resolving `?post=812` server-side finds the
page as well as the anchor.

**Cost.** One redirect per link followed. A board that served the
anchor directly makes none — and lands the reader at the top of page
one whenever the post was not on it.

### The sitemap is an index of chunks, ordered by id

**MyBB:** ships no sitemap; plugins that add one generally emit a
single document.

**Meith:** `/sitemap.xml` is always an index. Chunks are 5,000 URLs,
keyset-paged on the thread id ascending.

**Why.** One document does not survive the target data volume, and
switching shapes later means every crawler that cached the old one has
to rediscover the new — so it is an index from the first thread. The
ordering is by id rather than activity because a crawler works through
the chunks over hours or days, and a boundary that moved whenever
somebody posted would make the crawl skip threads and revisit others.

**Cost.** A chunk request pays one skip into the primary-key index to
find its starting id, because the index names the chunks by number
before any of them exists. It is paid by crawlers, not readers.

---

## The BBCode conversion

The conversion corpus is `packages/markdown/src/bbcode.test.ts`: each
difference below is asserted there, so this document and the converter
cannot silently disagree. (URL safety is asserted in the renderer's own
security tests, which the converted output flows through.)

**No MyBB source artefacts are copied**, and that is not only a
licensing rule: MyBB's parser is a pile of regular expressions
accumulated over fifteen years, and reproducing them would reproduce
their bugs as though the bugs were the specification. The corpus is
written from the *observable* side — the BBCode people actually type —
and every case is a claim about what a reader sees after the
conversion.

### Where the conversion is exact

Bold, italic, strikethrough, both link forms, images, quotes with their
attribution, code and PHP blocks, both kinds of list, and
case-insensitive tag names. Case-insensitivity matters more than it
looks: boards are full of `[B]`, and a converter that matched only
lower case would turn fifteen years of emphasis into literal text.

### Difference: the text is escaped on the way through

**MyBB:** a post is BBCode; `*`, `_`, `#` and `[` in it are
punctuation.

**Meith:** those are Markdown syntax, so the converter escapes them. A
post that said `a * b` still says `a * b`; a post that said `# 1 fan`
is not a heading; a variable called `snake_case` does not come out half
italic.

**Why.** Without it, every post containing an asterisk changes meaning
on the day of the upgrade — silently, and in a way nobody could find
afterwards.

**Cost.** An author who opens an old post in the editor sees
backslashes where one was genuinely needed. That is the visible half of
a guarantee whose alternative is invisible.

### Difference: URLs and CSS this renderer refuses

**MyBB:** has historically rendered `[url=javascript:…]`,
`[img]data:…[/img]` and `[color=red;background:…]` with varying degrees
of filtering by version.

**Meith:** refused by the renderer. The link keeps its text and loses
its destination — no anchor, no image element, no attribute.

**Why.** Each is an XSS in a forum post, and "MyBB renders it" is a
description of MyBB's history rather than a requirement.

**Cost.** An imported post containing one shows the URL as text instead
of a link — visible rather than silent, and intended.

### Difference: malformed input is handled consistently

**MyBB:** leaves an unclosed tag as literal text in some contexts and
swallows it in others, depending on which regular expression ran
first.

**Meith:** the input is parsed, so the answer is the same everywhere.
An unclosed tag converts to the text it is; a crossed pair keeps its
content; a stray closing tag does not eat the line.

**Why.** Consistency is worth more than bug-compatibility, and the rule
is chosen so nothing is silently dropped — a post whose second half
vanished is worse than a post with a visible `[b]` in it.

### Difference: an unknown tag becomes text

**MyBB:** drops unknown tags in some paths.

**Meith:** an unknown tag is escaped and shown, and its content is
kept.

**Why.** Dropping is the worse default: a custom MyCode the old board
defined would silently erase whatever it wrapped, and nobody would know
which posts were affected.

### Gap: tags this conversion does not translate

`[table]`, `[align]`, `[font]`, `[video]`, and any custom MyCode. Their
content survives as text, which is legible; a tag that vanished would
take its content with it. `[table]` is the one most likely to matter —
Markdown has tables, and a converter for MyBB's table syntax is a
plausible later addition.

---

## Search

### The search form has an advanced half

**MyBB:** two forms — a one-line box in the header, and a full page
with forums, an author, a date bound, "titles only", a sort column and
a direction.

**Meith:** one form, with the second half behind a disclosure that
opens itself whenever anything in it is set. It carries the same axes,
named for what they do: a forum (with **include subforums**, so a
category is one click rather than eight), one or more authors, a date
window, titles-only, post-or-thread results, and the order.

**Why.** The plain box is what almost every search is, and a form that
opens on eight controls asks a reader to answer questions they do not
have. The disclosure state is the app's decision rather than the
browser's, because a search that *was* narrowed and comes back looking
unnarrowed is a bug report waiting to happen.

### Results are filtered where they are read, not by searching again

**MyBB:** the results page is a listing; narrowing it means going back
to the form and running another search — another entry against the
flood interval.

**Meith:** the results page carries the filters with it. The stored
search holds the words and the options it ran with; the results URL
carries a *refinement* on top — a forum, an author, a window, an
order — and the page re-runs the stored search with both applied.
Anything already applied is also a chip, with an href that removes only
itself.

**Why.** A stored search is a token and a set of words, and re-running
it is what the page already does on every open to re-check the reader's
access. A filter in the URL is therefore free of everything a new
search costs: no row, no flood interval, no lost link — and "clear
filters" is a link rather than a re-type.

### A refinement narrows and never widens

**Meith:** a refinement can only make the result set smaller. A search
run against one forum cannot be refined into another; a titles-only
search cannot be refined back into whole posts; a past-week search
cannot become a past-year one. Where the two disagree, the narrower
wins; clearing the refinement is what returns the search to what it
was.

**Why.** The results URL is a link people paste, and a link that
quietly returns *more* than the search it came from is one that leaks.
The rule is small enough to hold in the head: this page shows a subset
of that search, always.

### Counts and breakdowns are bounded by the same window

**MyBB:** counts the whole match set.

**Meith:** counts the first 20,000 matches and says so when it stops
there. The same pass produces the per-forum and per-author breakdowns
the filter panel shows, and those counts deliberately ignore the forum
and author refinements already applied, so the numbers beside the other
forums hold still as a reader moves between them.

**Cost.** On a board where a term matches more than twenty thousand
posts, the total reads "more than 20,000" where MyBB printed an exact
number, and the per-forum counts beside it are floors.

### Sorting offers three orders, not six columns

**MyBB:** sorts by relevance, subject, date, thread, forum or username,
either direction.

**Meith:** best match, newest, oldest.

**Why.** Paging here is keyset, not `OFFSET` — `(rank, id)` for
relevance, `id` for the date orders — so a reader paging through
results cannot have rows shuffle or repeat underneath them when
somebody posts. A sort by username or subject has no such key, and the
honest implementations are an `OFFSET` pager over an unbounded ranked
set or an index per column — neither worth what it costs to answer a
question the filters answer better: a reader sorting by username wants
one member's posts, which is what **posted by** does.

**Cost.** A member who sorted by subject, thread, forum or username has
no equivalent order and reaches the same set through **in** and
**posted by** instead.

### One row per thread is a grouping, not a second query

**MyBB:** "display results as threads" returns thread rows.

**Meith:** the same, and the row shown for a thread is its *best* match
under the current order — the highest-ranked post for relevance, the
newest for newest. Grouping is bounded by the same window as ranking.

### Relevance is ranked within a window

**MyBB:** ranks every matching post, however many there are.

**Meith:** ranks the **20,000 most recent matches** when sorting by
relevance. Sorting by newest or oldest reads the whole corpus, unless
the search groups by thread or asks for a count, both of which are
bounded the same way.

**Why.** `order by ts_rank_cd(...)` cannot use an index: a relevance
score depends on the query, so there is nothing to have indexed in
advance, and Postgres has to score every matching row before it can
name the top twenty. The load run measured the cost on a board of
2.3 million posts: a term matching 96% of them took a p95 of
**5.5 seconds** — the GIN index present and used throughout; the cost
was the ranking, not the lookup. A term matching 1,171 posts, through
the same code, took 35 ms. Bounding the ranked set brought the first
case to 98 ms.

**Who this affects: almost nobody.** For any term matching fewer than
20,000 posts the window contains the entire match set, so the results
are *identical*. The difference appears only for a term so common that
"the single most relevant post" is not a meaningful thing to ask for —
and there the answer becomes "the most relevant of the recent ones",
which is what a member searching a ubiquitous word actually wants. The
alternative was a five-second page.

**What was not done.** A search extension (RUM, or an external engine)
would rank the whole corpus quickly and properly. It is a runtime
dependency and, on most managed Postgres, an extension the operator
cannot install — so it stays out until somebody has a board that needs
it.
