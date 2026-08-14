# MyBB parity decisions

Every place a Meith board behaves differently from MyBB, what it does instead,
and why. **Read this before promising anyone a like-for-like move.**

Each entry has the same four parts:

| Part | What it tells you |
|---|---|
| **MyBB** | What the board you are leaving does |
| **We** | What this board does instead |
| **Why** | The reasoning, so you can judge whether it suits your community |
| **Cost** | What an imported board actually loses, stated plainly |

> [!NOTE]
> An entry is added when a divergence is **chosen**, not when one is discovered
> by accident. A surprise is a bug, not a parity decision.

## What is on this page

- [Permissions and groups](#permissions-and-groups)
- [Posting and Markdown](#posting-and-markdown)
- [Spam](#spam)
- [Announcements](#announcements)
- [Editing and deleting](#editing-and-deleting)
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
- [Parity passes](#parity-passes)
- [Search](#search)

---

## Permissions and groups

### Flood intervals

**MyBB** stores `searchfloodtime` (and `floodtime`) as a per-usergroup numeric
column, combined like any other numeric limit.

**We** do not model flood intervals as a permission field at all. The board
setting `search.flood_seconds` holds the interval, and the existing
`canBypassFloodCheck` boolean permission exempts a group from it.

**Why.** This board has one combination rule for all numerics: take the maximum,
with `0` meaning unlimited and therefore beating every other value. That rule is
correct for *allowances* — attachment size, posts per day — because a larger
number is more permissive. It is exactly backwards for an *interval*, where the
most permissive value is the smallest non-zero one. A user in a 30-second group
and a 5-second group should get 5 seconds; MAX would give them 30.

Keeping the field would have required a fourth combination kind used by two
fields, and a permanent footnote on the permission matrix. Modelling it as a
setting plus a boolean keeps that rule literally true for every field — the
boolean combines by OR, which gives the right answer with no special case.

**Cost.** An imported board loses per-group flood granularity: everyone is
either subject to the board interval or exempt from it. Reintroducing
granularity later means adding a `numeric-min` kind to
`packages/core/src/permissions.ts` and one row per actor to the permission fixture.

`posting.flood_seconds` is read by the posting path and
the exemption is asked for as the global action `flood.bypass`, so no permission
field escapes `@meith/authorization`. Administrators bypass it like any
other action; the forum matrix does not carry a column for it, because the
interval is a board setting rather than a per-forum grant.

---

### Permission field naming

**MyBB** uses lowercase, unpunctuated column names (`canpostthreads`,
`canviewthreads`, `cansearch`).

**We** use camelCase keys (`canPostThreads`) mapped to snake_case columns
(`can_post_threads`).

**Why.** The keys are consumed as TypeScript property names across three
packages, and `canviewothersthreads` is genuinely ambiguous to read. The mapping
is mechanical and lives in `packages/db/src/schema/permission-columns.ts`, so
importer code can translate a legacy column name in one place.

---

### Separate `canAccessAdminCp` and `isAdministrator`

**MyBB** treats admin status and admin CP access as effectively the same thing
(`cp_access` gates panel modules for an already-admin user).

**We** keep them as two fields: `isAdministrator` grants the permission bypass,
`canAccessAdminCp` grants the panel.

**Why.** A bypass has to be explicit and logged. Splitting the fields
makes it possible to grant a trusted role read access to the panel without also
handing it the ability to bypass every forum permission on the board — and makes
the audit log meaningful, because a bypass entry now implies a specific field.

---

## Posting and Markdown

### The markup language is Markdown, not BBCode

**MyBB** posts are BBCode: `b i u s color size font align url email img quote
code php list hr video`, plus smilies, admin-defined custom MyCode, and
automatic linkification of bare URLs.

**We** post in Markdown. Every board that upgrades has its posts, private
messages, signatures, announcements and drafts **converted once**, in the
background, by the render backfill; the importer marks what MyBB hands over as
BBCode and the same sweep converts it. There is no BBCode renderer left in the
tree, and no board runs two markup languages at once.

This is the largest single divergence in this document, so what survives and
what does not is worth stating precisely.

**Converted with no loss.** `b i s url email img quote code list` all have a
Markdown spelling, and the converter produces it. A quote keeps its
attribution — `[quote='Bob']` becomes `> **[Bob](/member/by-name/Bob) wrote:**`
above the quoted lines — and a `[code]` body is fenced with a rail long enough
that its own backticks cannot close it.

**Converted with the styling dropped, the words kept.** `u`, `color` and `size`
have no Markdown spelling. `[color=red]stop[/color]` becomes `stop`. Inventing a
board-only directive for each would have meant shipping three tags that exist
nowhere else, which is the thing Markdown was chosen to stop doing. **This is a
real, permanent loss of presentation on an imported board, and it is the one
place in this migration where something a member wrote does not come back.**
Nothing they *said* is lost — only how it was coloured.

**Left as the text it was.** `font`, `align`, `hr`, `video`, `php`, and any
custom MyCode the old board defined: an unrecognised tag is escaped and shown as
the characters its author typed, so an imported post reads as slightly plainer
prose rather than as a hole.

**Gained.** Headings, tables, task lists, thematic rules, fenced code with a
language, and **auto-linking** — which MyBB had and the BBCode renderer refused.
Markdown resolves the ambiguity that made it refusable: a bare URL ends at
whitespace and gives back the trailing punctuation that belongs to the sentence,
which is a rule that can be written down and tested rather than guessed.

### Quoting fills the box you are looking at

**MyBB** quotes by navigating to the reply page, and offers multiquote for
collecting several posts first.

**We** do both of those and, with JavaScript on, neither navigates: clicking
**Quote** puts the quote in the quick reply already on the thread page, opens
it, and puts the caret under the quote. Multiquote works the same way — the
selections are spent the moment the reply form loads.

**The quote comes from the server, by post id.** That is worth stating because
the alternative is what most boards do: read the post out of the page and turn
it back into markup in the browser. This asks for the post instead, through the
same visibility lookup the reply page uses, so a reader cannot quote something
they were never shown and a moderator cannot republish a deleted post by
quoting it.

**Cost:** one request per quote, where a board doing it in the browser makes
none. With scripting off, or on a page with no composer, the Quote link is a
link to the reply page exactly as it always was.

**A quote names its source twice.** The attribution links the member, the way a
mention does, and carries a link back to the post it was taken from. Both are
written into the Markdown rather than held as attributes, so they survive the
reply being edited, and the link back uses the post's durable `#pid-` anchor
rather than its position in the thread, which moves.

**A directive is not MyBB's custom MyCode.** MyBB's takes a *replacement
pattern* — a regular expression and the HTML to put in its place — so an
administrator can produce any markup they like from a form. Ours chooses a
**name** and whether it is inline or block; members write `:::spoiler` … `:::`
or `:spoiler[…]`, and the element is constructed by `@meith/markdown`. That is a
real capability difference and a deliberate one: a field that chooses output
markup is a second markup language administered through a web form, which is how
boards with custom MyCode acquire a permanent XSS surface. Anything that needs
bespoke markup is a plugin, where the code is reviewed and installed rather than
typed into a text box.

**We do not accept raw HTML**, which CommonMark says should pass through. That
would need a sanitiser, and a sanitiser is a blocklist; this renderer constructs
its output instead, which is why it has never had one. `<script>` in a post is
seven escaped characters and a word. Two smaller deviations from CommonMark are
worth naming: a single newline is a line break, and there are no indented code
blocks.

**Cost.** An operator promising a like-for-like move should promise it about the
*text*, not about the colours. Members who knew BBCode have to learn a different
syntax — the composer's toolbar, its shortcuts and its formatting help exist for
exactly that week.

---

## Spam

### Anti-spam: no hosted captcha, and limits are not intervals

**MyBB** ships a built-in image captcha, supports reCAPTCHA and hCaptcha, and
models flood control as a per-usergroup interval.

**We** ship a honeypot, a fill-time floor, admin-defined question challenges and
first-post moderation, plus hourly limits on posting, searching, private
messages, reports and uploads. There is no image captcha and no hosted provider.

**Why.** Three separate reasons, and they are worth keeping apart.

*No image captcha.* Generating one means rendering text to an image, which is a
dependency, and the accessible fallback is an audio challenge, which is another.
Both are defeated by commercial solvers for less than it costs to run them. A
question a regular can answer and a script cannot is weaker against a determined
human and stronger per unit of effort.

*No hosted provider by default.* hCaptcha and reCAPTCHA work, and they mean every
visitor's browser contacting a third party before they can register. That is a
decision about a board's members rather than a setting, so the `CaptchaProvider`
seam is shipped and the service is not. A board that wants one writes a small
module against it; no form or call site changes.

*Limits beside the interval, not instead of it.* MyBB's flood control is an
interval, and this board keeps one (`posting.flood_seconds`, see
[flood-intervals](#flood-intervals) for why it is a setting rather than a
permission field). An interval does nothing about a script that posts every 31
seconds all night, so the board adds a *limit* — how many in an hour — counted in the
database so every instance shares one allowance. The two answer different
questions and both are configured.

**Cost.** An imported board's captcha configuration does not carry over; the
challenge has to be set up again, and the questions written. Its flood settings
map onto the interval as before, with the hourly limits starting at zero.

---

## Announcements

### Announcements are not sticky threads

**MyBB** has announcements as a first-class thing, and boards frequently use a
pinned thread for the same job.

**We** have announcements, and they are deliberately *not* threads: nobody can
reply to one, it has a start and an end date, and it lives above the forums
rather than in the listing.

**Why.** A sticky thread is a conversation — it belongs to its author, members
reply to it, and taking it down deletes what they said. That is what leaves a
three-year-old rules post at the top of a forum on every board that pins one:
removing it costs the discussion attached to it. An announcement expires on its
own and removing it removes nothing anybody wrote, which is the whole point of
having both.

Two smaller differences follow. There is no per-group visibility on an
announcement: a forum's is shown to whoever can see that forum, resolved through
the same filter as everything else, and a board-wide one to everybody. And the
dates are entered in **UTC** rather than in the operator's timezone, because the
control submits wall-clock text with no zone and the alternative is an
announcement that appears at a different hour depending on what `TZ` the
container happened to have.

---

## Editing and deleting

### Markup that does not close

**MyBB**'s regex passes leave an unmatched `[b]` as literal text, and can emit
unbalanced HTML for crossed tags such as `[b][i]x[/b]`.

**We** cannot emit unbalanced markup at all: the renderer builds a tree and
writes elements out of it, so there is no path by which an opening tag reaches
the page without its closing one. An unmatched `**` is two asterisks, an
unterminated `` ` `` is a backtick, and an unclosed ``` fence ends at the end of
the post rather than swallowing the thread.

**Why.** Unbalanced output from a post body is the shape that lets formatting
escape a post and affect the rest of the page, so this one is not negotiable
regardless of parity. The visible outcome for the common mistake is the same as
MyBB's — you see what you typed.

---

### Deleting the first post of a thread

**MyBB** lets a member with `candeleteposts` delete any of their own posts,
including the opening one; deleting it leaves the thread's remaining replies in
place under a first post that no longer exists.

**We** refuse it, with a message pointing at thread deletion instead.

**Why.** The opening post *is* the thread as far as every listing is concerned —
it supplies `first_post_id`, and the thread's title, author and counters are
told from it. The two ways to allow the click both lose: deleting only the post
leaves a thread with a title, a reply count and nothing to read, and quietly
deleting the whole thread means "delete my post" removes other people's replies
without saying so. Refusing and naming the alternative is the only option that
does what it says.

**Cost.** Until the full thread tools exist, a member who wants their thread gone
has to ask a moderator. An imported MyBB thread whose first post was deleted
arrives with a first post that is soft-deleted rather than missing, which the
moderator view shows and the member view skips.

---

### Editing a post you no longer own the window for

**MyBB** hides the edit control once `edittimelimit` has passed and refuses the
submission server-side.

**We** do the same, with one difference worth stating: the window is a
**numeric permission**, so the usual combination applies — `0` means unlimited and
beats every other value across a user's groups. A member in a 30-minute group
and an unlimited group gets unlimited.

**Why.** It is the same rule every other numeric on the board follows, and the
alternative (minimum-wins) would need a fourth combination kind for one field —
the trap already recorded under *flood-intervals*, where minimum-wins genuinely
is correct and the field was therefore modelled as a setting instead. An edit
window is an *allowance*, so MAX is the right rule and no special case is needed.

---

## Moderation

### Who handles a report

**MyBB** has a dedicated permission, `canmanagereportedcontent`, separate from
the moderator rights that decide what somebody can actually *do* about a report.

**We** scope reports by the sets that already exist: a report about a post or a
thread is visible to the moderators of its forum (`moderatedForumIds`, the same
set that scopes the approval queue), and a report about a *member* is visible to
board staff (`modcp.access`).

**Why.** A third permission would let a board grant "can read reports about
forum X" to somebody with no power to act on anything in forum X — a role whose
only capability is reading complaints about their neighbours. Every report is
about content or a person, and the people who can act are the people who should
see it.

**Cost.** An imported board's `canmanagereportedcontent` grants do not map
one-to-one: anybody who held it without moderating a forum loses report access,
and anybody who moderates a forum gains it. The importer should surface that
as a migration note rather than guessing.

---

### What can be reported

**MyBB** allows reports against posts, threads, profiles, private messages and
(with plugins) more.

**We** ship posts, threads and members. Private messages are absent because they
has not been built — there are no tables for them, and a target kind nothing can
produce is a promise the board cannot keep.

**Why.** Same rule as everywhere else in this build: omit rather than stub. When
they land, `REPORT_TARGET_KINDS` gains an entry and `resolveTarget` gains a
branch; nothing else changes.

---

### Who can lock, pin and move threads

**MyBB** grants these through `moderators` rows (per forum, per right) plus the
super-moderator and administrator bypasses. There is no usergroup column for
them.

**We** do the same, and this is a parity decision only because it is the first
place our permission model *diverges from its own pattern*: every other action
on the board reads a field off the resolved forum matrix, and these four read an
appointment right instead.

**Why.** "May lock threads everywhere on the board" is a thing you are appointed
to or a thing you bypass into as staff. A usergroup checkbox for it would let a
board grant board-wide thread control by adding somebody to a group, with no
record of which forums anybody was ever meant to be responsible for.

**Cost.** A board that wants a "Junior moderators" group with lock rights
everywhere has to appoint the group to each forum — `forum_moderators` accepts a
`group_id`, so that is one row per forum rather than one per person, but it is
not one checkbox.

---

### Copying a thread

**MyBB** offers "copy thread" alongside move, duplicating every post and
crediting the copies to their original authors — so one piece of writing raises
its author's post count twice.

**We** have not built it, and the double-count is why. It is recorded here
rather than left as a gap because the *reason* is a product decision somebody
has to make: either a copy does not credit anybody (and author counts stop
matching the posts that exist), or it credits twice (and post counts stop
meaning "things this person wrote").

**Cost.** Moderators split and re-file threads by moving rather than copying.
Splitting is the operation that actually covers most of what copy is used for,
and it has to answer the same question.

---

### Splitting a thread, and where the pieces land

**MyBB** offers "split thread", which takes a checkbox selection of posts, lets
the moderator choose a destination forum, and can leave the split-off posts
credited however they already were.

**We** split "from this post onwards" and land the new thread in the **same
forum**, always.

**Why.** The two differences answer two different questions. The cut point is a
`<select>` of the posts on screen rather than a checkbox set because a select
cannot name a post that is not on the page, and arbitrary selection needs the
per-post checkbox surface — two selection mechanisms for one
operation is worse than one narrower one. The destination is fixed because
splitting and moving are two acts: a single operation with a second forum to
authorise would let a moderator who may split here, but not post there, place
content in a forum they have no standing in.

**Cost.** A moderator who wants the split-off thread elsewhere splits, then
moves — two operations and two audit rows instead of one. A moderator who wants
posts 3, 7 and 12 and not 4–6 cannot express that yet.

---

### Which thread survives a merge

**MyBB** merges by thread URL or id and keeps the thread the moderator is
looking at, absorbing the one they name.

**We** do the same, and refuse to infer it from anything else — not the older
thread, not the one with more posts.

**Why.** A merge destroys a thread row. Every heuristic for picking the survivor
is right most of the time, and the times it is wrong are unrecoverable: the
thread somebody meant to keep is gone and its posts are wearing another title.
Being explicit costs a moderator nothing, because they already know which one
they mean.

**Cost.** Merging the wrong way round is still possible — it is a moderator's
mistake to make, and it is logged with both ids so it can be seen. What is not
possible is the software making it for them.

---

### What a merge does to post counts

**MyBB** moves the posts and leaves author post counts alone, which is correct
and worth stating because the neighbouring operation gets it wrong: MyBB's
*copy* credits duplicated posts to their original authors, counting one piece of
writing twice.

**We** match MyBB on merge and split, for a reason we can state exactly: neither
operation creates or destroys a post, so `users.post_count` never moves. Only
`users.thread_count` does, by one — a split creates a thread, a merge destroys
one.

**Cost.** None here. This is the answer to the question the copy entry above
leaves open, and it is the reason we built split before copy.

### Inline moderation offers no "unapprove"

**MyBB:** the inline moderation dropdown on a forum listing includes *Unapprove
threads*, which sends published content back to the queue.

**Here:** it does not. Inline moderation offers approve, delete, restore, lock,
unlock, pin, unpin and move; taking a visible thread off the board is `delete`,
which is reversible with `restore` and is what a moderator actually wants.

**Why:** `unapproved` and `deleted` are both "not counted, not visible",
so the two differ only in which list the content appears on afterwards. Sending
a published thread to the *approval queue* puts it in front of a moderator as
something to decide on, when the decision has already been made — and it makes
the queue a mixture of "new content nobody has read" and "old content somebody
removed", which is the one thing the queue's ordering (oldest first) relies on
not being true. Deleting says what happened and restoring undoes it.

### Bulk moderation chunks rather than refusing

**MyBB:** inline moderation acts on whatever was selected, in one request.

**Here:** a selection is applied in transactions of 25, up to a ceiling of 500
in one request. The approval queue keeps its hard refusal above 200.

**Why:** the two surfaces have different shapes. Nobody hand-selects two hundred
items from a queue, so refusing and saying "work through it a page at a time" is
honest there. A listing has a "select all" and a moderator clearing a spam run
genuinely has hundreds, so refusing would mean the feature does not do the job
it exists for. Chunking is safe because every transition is state-guarded — a
bulk action that dies halfway is fixed by pressing the button again, and the
chunks that already ran report "already in that state".

## Warnings

### Warning levels are points, not percentages

**MyBB:** warning levels are expressed as a percentage of a configured maximum,
and a member's warning level reads as e.g. "40%".

**Here:** levels and warnings are absolute points, and a member is on "6 points"
with thresholds at 4, 7 and 10.

**Why:** a percentage needs a configured maximum to mean anything, and a board
that has never opened the admin screen would have every member permanently at 0%
of nothing — which is precisely the state a v1 board is in, because no screen
configures `warning_levels` yet. The admin screen that exists is not that one: levels are
moderation configuration rather than group permissions, and the seeded ladder is
what a board runs on until something owns them. Points are readable on
their own, the seeded ladder works on a fresh board, and "2 points, expires
after 90 days" is a sentence a moderator can weigh before issuing it. The
importer can convert a percentage against the source board's maximum.

### A warning restriction outranks a moderation bypass

**MyBB:** a user under a "moderate posts" warning has their posts held; staff
permissions and moderator status are resolved separately and can conflict.

**Here:** a warning-level restriction is applied *after* `bypassesModeration`
and wins. A moderator who is themselves under a moderate-posting warning has
their posts held, in every forum, including ones they moderate.

**Why:** the bypass means "this forum's approval queue does not apply to you";
the warning means "your posts are reviewed". They are different statements and
the second is a sanction a person received. Letting the first cancel the second
would make the board's moderators the only members a warning could not reach,
which inverts what a warning is for.

### Bans from a warning level are not lifted by revoking the warning

**MyBB:** a warning that triggered a ban and is then revoked leaves the ban in
place; an administrator lifts it.

**Here:** the same, and deliberately.

**Why:** the ban lifecycle owns the group the ban captured so it
can be restored at expiry. Un-banning from the warning path would restore a
group this feature never saw, through a code path that already refuses to run
twice. More importantly, a ban is the heaviest thing the board does to somebody
and its removal should be a decision a human makes while looking — which is what
"a moderator lifts it" means. The revocation still lowers the points, so the
level no longer applies and no further action is taken.

## The moderator log

### The moderator log is an allow-list of moderation actions

**MyBB:** the moderator log and the administrator log are separate tables.

**Here:** they share `admin_log`, and the ModCP filters it by a named list of
moderation actions.

**Why:** one table means one place a bypass, a settings change and a thread lock
are all recorded, which is what an operator wants when reconstructing an
incident. The filter is an allow-list rather than a deny-list because the table
will keep growing row types: a deny-list turns every future administrative
action into a moderator-visible disclosure the day somebody forgets to update
it, whereas an allow-list turns a new moderation action into a missing row
somebody notices.

### The address lookup finds ranges, not addresses

**MyBB:** the ModCP's IP search matches full addresses, which MyBB stores.

**Here:** it matches the truncated prefix the board stores, and the screen says
so.

**Why:** every address is truncated before it is written, so there is no full
address to match — this is a consequence of the privacy invariant rather than a
choice made here. It is stated on the screen because the difference matters to
what a moderator does next: "shares an address" reads as proof, "shares a range"
reads as something to check, and only the second is what the data supports.

### Copying a thread credits its authors twice

**MyBB:** copying a thread duplicates its posts, and each copy counts towards
its author's post count. One piece of writing therefore counts twice.

**Here:** the same, chosen deliberately.

**Why:** every other counter on this board holds to one definition —
`users.post_count` means *posts written* — and the merge/split rule was settled the
question by that definition (neither operation duplicates a post, so neither
moves an author's total). Copy is the one tool that genuinely creates rows, so
the definition and parity actually conflict, and parity won: an imported MyBB
board's counts must not change under it, and a moderator using copy expects the
same arithmetic they know.

The cost is stated rather than hidden: after a copy, `post_count` means "posts
attributed to you", which is a slightly different thing from "posts you wrote".
`PostgresCounterRecount` agrees with it, because the recount counts rows — so
the board stays internally consistent, and a repair run will not quietly undo
it. Only visible posts are copied: copying held content would double the
approval queue, and copying removed content would republish it.

### Copy is authorised by `thread.move`, at both ends

**MyBB:** copy is governed by the same "can manage threads" moderator
permission as move.

**Here:** `thread.copy` does not exist as a right. Copying reads `thread.move`
in the source forum *and* in the destination, exactly as a move does.

**Why:** copying is moving that leaves the original behind. It puts content into
the destination forum by the same mechanism, so the destination's moderators
have precisely the same interest in it — and a separate right would mean an
eighth column on `forum_moderators` distinguishing two acts nobody grants
separately. Unlike a move, the destination *may* be the source forum: forking a
discussion in place is legitimate and there is no pointer to repair, because
nothing left.

### A moved thread leaves no redirect stub

**MyBB:** moving a thread can leave a "Moved: <title>" row in the source forum,
linking to its new home, optionally expiring after a set number of days.

**Here:** a move just moves. The schema keeps `moved_to_thread_id` and
`ThreadRowModel.isMoved` for a future implementation, and nothing writes them.

**Why:** the stub is a second kind of row in every listing query, in a listing
that is already the board's most performance-sensitive read,
and it has to be filtered, counted and expired everywhere. What it buys is a
reader who bookmarked a thread finding it — and search and the thread's
own permalink already do that, because the thread keeps its id. Revisit if a
real board reports people losing threads after a move.

---

## Notifications and digests

### A notification centre exists at all

**MyBB:** has no notification centre. What a member is told arrives as e-mail
(a subscribed thread, a warning, a PM alert), plus the "You have N new
messages" line in the user CP. When the e-mail is filtered, bounces, or is
simply never read, nothing on the board records that the member was told.

**Here:** every notification is written to a `notifications` row first and
delivered by e-mail second. The board's record is the row; the e-mail is one
transport for it, and the transport can be declined.

**Why:** a warning that changes what a member may do has to be discoverable
from the board itself. Warnings shipped with exactly that gap —
a suspended member found out by trying to post and being refused. Making the
record the primary artefact also gives every later notifier — subscriptions,
private messages, reputation — one place to write to
rather than an e-mail template each.

**Cost:** one more table on the read path — an unread count in the user panel
on every page for a signed-in member, which is why its index is partial over
unread rows.

### On-site delivery cannot be switched off; e-mail can

**MyBB:** every notification channel is opt-out. A member can disable e-mail
about warnings and about subscribed threads.

**Here:** the preferences screen configures **e-mail only**. Every kind is
recorded in the notification centre regardless.

**Why:** the centre is the board's evidence that somebody was told. A member who
can erase the record can later say they were never warned, with the board's own
data agreeing — which is worse for the member too, since a moderator reviewing
an appeal has nothing to look at. Declining e-mail costs nobody anything,
because the record survives.

**Cost:** a member who does not want to see a notification cannot remove it,
only mark it read. If that becomes a real complaint, the answer is a "clear
read notifications" control, not a channel switch.

### The reporter is told when their report is closed

**MyBB:** tells the reporter nothing. A report is filed and disappears.

**Here:** closing a report raises `report.actioned` for the reporter, naming
the outcome (actioned or closed without action) and the captured label of what
they reported. The moderator's private note is never included — the port that
carries the notification has no field that could hold one.

**Why:** a report button that silently swallows reports trains members to stop
using it, and "we looked and decided not to act" is a legitimate outcome to
communicate. E-mail for this kind is **off** by default, because reporting is
exactly the act a member repeats and a second message about somebody else's
content is not something to opt somebody into.

**Cost:** a member who reports a lot gets a lot of on-site notifications. They
coalesce per report rather than per target, so closing and re-closing one report
is one line.

### A repeated notification is one row with a count

**MyBB:** does not have the problem, having no notification store.

**Here:** a raise may carry a dedupe key. While the notification it produced is
unread, further raises with the same key increment `occurrences` and update the
captured facts instead of writing a new row — enforced by a partial unique
index rather than a prior read. Once the row is read, the next raise starts a
fresh one.

**Why:** the first notification the board raises without a human behind it is
`system.task_failed`, and a task failing on every tick would otherwise write
1,440 rows a day per administrator, with an e-mail behind each. The count is
also the more useful number: "this has failed 40 times" is the difference
between a blip and an outage.

**Cost:** the *first* occurrence's details are replaced by the latest one. That
is deliberate for an operational alert and is why warnings carry no dedupe key
at all — two warnings are two things that happened, and collapsing them would
hide the one that crossed a threshold.

---

### "Instant" notification means "within a tick"

**MyBB:** sends a subscription e-mail during the request that created the post,
inside `add_thread`/`add_post`.

**Here:** the post commits, and the `subscriptions.instant` task tells the
subscribers on its next run — at most a minute later on a board whose tick runs
every minute.

**Why:** notifying inline is an unbounded loop inside the board's hottest write.
One iteration per subscriber, each needing a permission re-check (a subscription
is not a standing grant), each potentially a mail send — on a thread with 500
followers that is a posting request that takes seconds and fails if the mail
provider is down. Every other side effect on this board already works this way
(the outbox, the counter roll-up), and the watermark makes a delayed run
indistinguishable from a prompt one except in timing.

**Cost:** a subscriber can open a thread and see a reply before the notification
about it arrives. That is strictly better than the failure it avoids, and the
delay is bounded by the tick interval an operator controls.

### A digest's clock is per member, not per board

**MyBB:** has no digests at all — every subscription is instant e-mail or
nothing.

**Here:** a subscription's cadence is `instant`, `daily`, `weekly` or `none`,
and the daily/weekly clock is stored per member *and* per cadence in
`digest_runs`.

**Why:** a board-wide "send the digests now" schedule delivers everybody's
digest at whatever moment the tick happened to fire, and hands somebody who
subscribed on Sunday a "weekly" digest on Monday. Per member, the interval means
what it says. Per cadence as well, because a member can follow one thread daily
and another weekly, and one clock cannot serve both.

**Cost:** one row per member per cadence, written only once a digest has
actually gone out. A member who has never received one is due immediately, which
is what makes a new subscriber's first digest arrive rather than never.

### The unsubscribe link acts on POST, not on GET

**MyBB:** unsubscribe links are GETs — following the URL removes the
subscription.

**Here:** the link opens a page that says what unsubscribing would do and offers
one button. The button is the act.

**Why:** mail clients, corporate link scanners and preview fetchers request
every URL in a message. A GET that unsubscribed would mean a member is
unsubscribed by their own spam filter looking at the mail, and they would never
know why the notifications stopped. It also matches what one-click unsubscribe
(RFC 8058) expects of a mail sender.

**Cost:** one extra click for somebody who genuinely wants out. The page needs
no login and no JavaScript, so it is the cheapest possible extra click.

### Unsubscribing from a digest does not delete subscriptions

**MyBB:** does not have the case, having no digests.

**Here:** the digest's unsubscribe link switches subscription **e-mail** off.
Every subscription stays, and new posts still appear in the notification centre.

**Why:** a digest covers many subscriptions, so "unsubscribe" cannot mean one of
them — and taking it to mean "all of them" would delete a member's follow list
because they wanted fewer e-mails. The notification record is already separate from the
transport; this is that separation applied to the one-click case. The per-thread
link in an "as it happens" notification *does* end that one subscription,
because there the member knows exactly which thread they are silencing.

---

## Accounts and profiles

### Timezones are IANA names, never offsets

**MyBB** stores a numeric offset (`timezone` = `-5`, plus a separate
`dst` flag the board or the member toggles).

**Here:** an IANA zone name (`America/New_York`), validated against the
runtime's own tz database. Offsets are refused *even though `Intl` accepts
them*.

**Why:** an offset cannot express summer time, so it is wrong for half the year
in every zone that observes it — and MyBB's answer to that, a DST flag somebody
has to flip, is wrong every year for anybody who forgets. The tz database
already knows when the clocks change in every zone; storing the name lets it
answer.

**Cost:** an imported MyBB board's offsets do not map cleanly — `-5` is
`America/New_York` in winter and `America/Chicago`'s summer, and neither is
certain. The importer will have to pick a representative zone per offset and
say so, rather than pretending the data was there.

### The default timezone is the reader's, not the board's

**MyBB** has one board timezone that every guest and every member who has not
changed it reads the board in.

**Here:** there is no board timezone. A reader's own zone is detected in the
browser and reported to the server in a cookie, so a guest in Auckland and a
guest in Chicago see the same thread at their own two clocks. A member may
still pin a zone, and a pinned zone wins on every device; the default is
"follow this device".

**Why:** a board timezone is right for whoever set it up and wrong for
everybody else, and the two readers it is most wrong for are the guest who
cannot change it and the member who does not know the setting exists. "Posted
today at 09:14" has to mean the reader's today, or it is worse than a bare
date.

**Cost:** a reader with JavaScript off reports nothing, so they get UTC — the
footer names the zone precisely because that case exists. And the first page a
new reader opens reloads once, after the cookie is written, which is one extra
request per visitor per browser.

### A password change signs out every other device

**MyBB:** changing a password keeps other sessions alive.

**Here:** every session is revoked, and the device that made the change is
immediately given a fresh one.

**Why:** changing a password is what somebody does when they think an account is
compromised. One that leaves the attacker's session alive has done nothing.
Re-issuing for the current device is what stops the safe behaviour from also
being the annoying one.

**Cost:** somebody who changes their password on a phone is signed out on their
desktop. That is the intended outcome, and the screen says so before the button.

### Changing an e-mail address requires confirming the new one

**MyBB:** with "verify e-mail" off — the default on many boards — the address
changes immediately.

**Here:** the address is held in a single-use token and adopted only when the
link sent to it is followed. The current password is required to ask.

**Why:** two failures, and the second is the serious one. A typo strands an
account at an address nobody owns, with no way back except an administrator. And
an unattended session becomes a full takeover: change the address, request a
password reset, done. Confirming the new address closes both.

**Cost:** a member whose new address bounces keeps the old one, which is the
safe direction. A board with no mail configured cannot change addresses at all —
the UserCP says the link was sent, because from the board's side it was.

### A custom profile field's visibility is per group, not a single "hidden" flag

**MyBB:** `profilefields` carries `viewableby` and `editableby` as
comma-separated group-id lists, plus `hidden` — and resolution is a substring
check against the member's group string.

**Here:** a row per (field, group) in `profile_field_groups` with nullable
`can_view` / `can_edit`, resolved by the same rule everything else on this
board uses: NULL abstains, any explicit grant wins.

**Why:** the same shape as `forum_permissions`, so "who can see this" has
one mental model rather than a second one that only applies to profile fields.
A NULL that abstains is also what makes "staff may edit this" one row instead of
a row per group with the other answer copied in — and a comma-separated list of
ids cannot express "no opinion" at all.

**Cost:** an imported MyBB board's `viewableby=-1` (everyone) maps to the field
default and its explicit lists map to grant rows, but MyBB's *deny by omission*
does not survive: a group absent from `viewableby` becomes a group with no
opinion, which inherits. The importer must write an explicit `false` row per
group MyBB omitted, or set `default_visible` false and grant the listed ones.

### Registration asks only for fields the new member's group may edit

**MyBB:** a field marked `required` is asked at registration regardless of
whether the registering member's group can edit it afterwards.

**Here:** `requiredAtRegistration` is intersected with what the board's default
member group may edit, so a field they will never be able to change is not asked
for either.

**Why:** "what you are asked at registration" and "what you may change
afterwards" disagreeing is a trap — somebody types an answer they can never
correct. Resolving against the group registration *puts them in* (not the guest
group they are currently in) is what makes the two consistent.

**Cost:** an operator who marks a field required but forgets to let the
registered group edit it gets a field that is silently never asked. The CLI's
`profile-field:add` says every new field starts editable by every group, which
is the state where this cannot bite.

### An emptied field is deleted, not stored as an empty string

**MyBB:** `userfields` has a column per field and a text column defaults to
`''`, so "not answered" and "answered with nothing" are the same value.

**Here:** a row per (member, field), and clearing an answer deletes the row.

**Why:** every read on the board would otherwise have to treat two states as
one, and one of them would eventually forget — a profile showing an empty
"Pronouns:" row is the visible half of that. It is also what makes an
unanswered field cost nothing on a board with twelve fields and ten thousand
members who filled in two.

**Cost:** a column-per-field table is one join cheaper to read. It is also a
schema migration every time an operator adds a field, which is the trade MyBB
made and this does not.

### Registration confirmation and password reset never say whether an address exists

**MyBB:** the lost-password form answers "the e-mail address you entered was not
found" for an address it has no account for, and the resend-activation form says
so when an account is already active.

**Here:** one sentence on every path. An unknown address, an account that is
already active, a send that failed and a link that really went out all produce
the same notice, and the rate limit is spent *before* the account is looked up so
that its refusal cannot be provoked for one address and not another.

**Why:** a form that answers "is there an account for this address?" answers it
for anybody, one submission at a time — including for a list of addresses
somebody bought. That is a membership list the board did not intend to publish,
and on a board where membership itself is sensitive it is the whole game.

**Cost:** somebody who mistypes their own address is told a link was sent and no
link arrives, with nothing on screen to say why. The resend screen names the
address it used, which is the one place the typo becomes visible.

### An unconfirmed account is a state on the row, not a usergroup

**MyBB:** an account waiting for activation is a *member of the "Awaiting
Activation" usergroup*, so its permissions come from that group and activating
somebody means moving them between groups.

**Here:** `users.state` carries `awaiting_activation`, the group is whatever the
board's default is, and confirming an address stamps `users.email_verified_at`.
Under the `both` method the stamp is what says "the address is proven, an
administrator has not looked yet" — the state does not change until they do.

**Why:** a group is how permissions are decided (R4.1), and lifecycle is not a
permission. Modelling it as one means every permission question on the board
silently depends on account state, and it means a ban — implemented by
capturing and restoring the group — cannot be reasoned about independently. It
also means the two facts stay separable: an account can be proven and unapproved,
which the `both` method needs and a single group membership cannot express.

**Cost:** an operator cannot grant unactivated accounts a different permission
set by editing a group, because there is no group to edit. Restricting what an
unactivated account may do is not a MyBB feature people use — they cannot log in
at all — but it is a knob that exists there and does not here.

## Private messages

### A private message is stored once, not once per recipient

**MyBB:** `privatemessages` holds a row per copy — the sender's Sent Items and
each recipient's Inbox carry the full subject and body.

**Here:** `private_messages` holds the content and `private_message_copies`
holds one small row per participant.

**Why:** a message to twenty people is otherwise twenty copies of the text, and
re-rendering one is twenty writes. It also makes quota count *copies* — the
thing a member can actually delete — and lets the render cache invalidate
private messages the same way it invalidates posts, on the next page load,
with no migration.

**Cost:** a join on every folder listing, which the folder and message indexes
exist for. And a message everybody has deleted leaves an orphan row rather than
disappearing by cascade — deliberately, because deleting *your* copy must not
reach into somebody else's mailbox. Pruning orphans belongs to the maintenance sweep.

### The quota is storage; the daily cap is separate

**MyBB:** `pmquota` caps stored messages and there is no separate send rate for
most groups.

**Here:** two numbers. `max_private_messages_per_day` has existed since the
initial schema and caps sends; `private_message_quota` caps what a member may
keep. Both are 0-means-unlimited like every other numeric permission, combined
by MAX across groups.

**Why:** they answer different abuse questions. A rate limit slows a spammer; a
storage limit bounds what the board pays to keep. Collapsing them means a board
that wants to allow a hundred stored messages must also allow a hundred a day.

**Cost:** one more column on `usergroups`, and an operator has two numbers to
think about instead of one. The seeded ladder sets both, so a board nobody
configures behaves sensibly.

### A full inbox refuses the whole send, and names who is full

**MyBB:** a send to a member over quota fails and reports it.

**Here:** the same, extended to multiple recipients — if any one of them is
full, **nothing is sent to anybody**, and every full recipient is named.

**Why:** partial delivery leaves the sender with a Sent copy claiming a message
went somewhere it did not, and no answer to "did it send?". Naming the full
recipient trades a small disclosure (their box is full) against the much worse
failure of a sender who believes they were heard.

**Cost:** one member with a full box blocks a message to nine others until the
sender removes their name. That is the intended outcome, and the message says
which name to remove.

### Reporting is the only way staff read a private message

**MyBB:** a reported PM is copied into the report, and administrators with
database access can read any message.

**Here:** there is no listing, no search and no browse path into private
messages at all. `forReport` takes an id and is reached only from an existing
report row, so a moderator reads exactly what was reported and nothing beside
it. A message can only be reported by somebody who holds a copy of it, which is
also what makes "not yours" and "does not exist" the same answer.

**Why:** a moderation tool that can enumerate private messages is a
surveillance tool with a moderation feature attached.

**Cost:** a moderator cannot see the rest of a conversation for context — only
the message that was reported. Reporting each message is the way to give them
more, which is also the way the member chooses what staff see.

### Reply addresses the author, not everybody on the message

**MyBB:** reply addresses the sender; a separate "reply to all" addresses
everyone.

**Here:** reply addresses the author, and there is no reply-all.

**Why:** bcc. A recipient who was bcc'd is hidden from the other recipients, and
a reply-all composed by one of them would either leak that name or silently drop
somebody — and whichever it did, it would do it without the member noticing. A
message that quietly grows its audience is not what a reply button should mean.

**Cost:** answering a group conversation means typing the other names, which the
composer shows in the "To" line of the message being replied to.

## Buddies, ignoring and signatures

### Ignoring hides a post's body; it does not remove the post

**MyBB:** an ignored member's posts are collapsed client-side, with the body
still in the HTML.

**Here:** the body is withheld **server-side** — it is not in the response at
all — and the post keeps its place in the page and its number in the thread. A
placeholder and a per-post reveal link take its place.

**Why:** shipping the text and hiding it with CSS is a preference rather than a
feature. And filtering the post *out* instead would give every viewer a
different page size, make "#12" mean different posts to different people, and
land permalinks on the wrong page — which is why the requirement names stable
pagination and counts.

**Cost:** a thread with an ignored member in it still has their posts in it, as
placeholders. That is the intended reading: a conversation with holes in it is
still a conversation, and a reader who wants the missing half is one click away.

### Buddy and ignore are one table, and ignoring is not mutual

**MyBB:** `userlist` with a `type` column, which is the same shape — but the
ignore is often read as symmetric by the code around it.

**Here:** one row per **ordered** pair, primary-keyed, so the two lists are
mutually exclusive by construction. `(me, them)` is my opinion of them and says
nothing about theirs of me.

**Why:** a mutual ignore lets anybody silence themselves in somebody else's eyes
by ignoring them first, which is a griefing tool rather than a preference.

**Cost:** two people who both want to stop reading each other need a row each.
That is one extra click, and it is the correct model.

### A blocked private message is refused, not silently discarded

**MyBB:** a message to somebody who ignores you is accepted and dropped.

**Here:** the send is refused, with the **same wording** as a permission
refusal — "X cannot receive private messages" — so it does not disclose the
ignore.

**Why:** silently discarding it leaves the sender believing they were heard,
which is the worst outcome for both people. Naming the ignore would make the
send path a way to read somebody's list, and a list that announces itself is one
people stop using. The ambiguous refusal is the only option that is honest to
the sender without betraying the recipient.

**Cost:** a sender cannot tell "they blocked me" from "their group cannot use
PMs". That ambiguity is the feature.

### A signature's forbidden constructs render as text rather than refusing the save

**MyBB:** per-group switches for images, links and HTML in signatures, enforced
by stripping or by refusing.

**Here:** a signature is parsed with a **narrower set of constructs** — emphasis,
strong, strikethrough, code spans and links. Images, headings, quotes, lists,
tables, rules and code blocks are off, so they come out as the characters
somebody typed.

**Why:** it cannot be bypassed by a construct this build does not know about,
and it degrades — somebody pasting a signature from another board gets most of
it rather than an error. The image is the one that matters: a remote image under
every post is a tracking beacon reporting each reader's IP to whoever hosts it.

**Cost:** an imported MyBB signature that used images loses them, visibly, as
bracketed text the member can then delete. The importer should strip the tags
rather than leave them, and say how many it touched.

### A signature is locked, not deleted

**MyBB:** `suspendsignature` with an expiry, plus moderators simply clearing the
text.

**Here:** a boolean lock with a required reason. The text is kept, is shown back
to the member with the reason on their own signature screen, and cannot be
edited while locked.

**Why:** an emptied signature can be retyped the next minute and says nothing
about why it went. Keeping the text is also what lets an appeal look at what was
actually there rather than at somebody's recollection.

**Cost:** no expiry — an unlock is a second deliberate act. MyBB's timed
suspension is the nicer behaviour and needs a scheduled task; it belongs with
the maintenance sweep rather than being faked with a column nothing sweeps.

## Reputation

### Reputation has no per-group power multiplier

**MyBB:** `reputationpower` makes a moderator's vote worth more than a member's.

**Here:** every rating is worth −1, 0 or +1. The per-group settings are *whether*
you may rate and *how many a day*.

**Why:** a multiplier cannot obey the rule for numeric permissions — MAX
across groups with 0 meaning unlimited — because "unlimited power" is
meaningless and a multiplier has no unlimited state. It is the same shape as the
`searchfloodtime` problem recorded above, and gets the same answer: leave it out
rather than invert the combination rule for one field.

**Cost:** a board that wants staff endorsements to carry weight cannot express
it. An imported `reputationpower` is dropped, and the importer should say so
rather than silently scaling everybody's totals.

### Reputation totals are recomputed, not incremented

**MyBB:** `users.reputation` is adjusted as ratings are added and removed.

**Here:** the column is rebuilt with a `sum` over the live rows, inside the same
transaction as whatever changed them.

**Why:** an incremented total cannot survive a rating being revised or
withdrawn, and when it drifts nobody notices until somebody counts by hand. Same
decision this board made for `warning_points` and for the thread and forum
counters.

**Cost:** one extra aggregate per rating. It is bounded by the number of ratings
one member has, and a rating is a deliberate act rather than a hot path.

## The control panel

### The control panel has its own session, with its own timeout

**MyBB:** an "admin session" keyed to the board login, with a configurable
timeout, plus an optional `ADMIN_BRANCH`-style secret URL.

**Here:** a row in `admin_sessions` minted by re-entering the password, with a
30-minute idle timeout, an 8-hour absolute ceiling, and its own cookie
(`Path=/admin`, `SameSite=Strict`). A board password change revokes it.

**Why:** the threat is an administrator's own browser being used by somebody
else, not a password being guessed. A board session lasts days by design; an ACP
session that inherited that would make an unattended laptop a board takeover.
Separating them is what lets the ACP timeout be short enough to matter.

**Cost:** an administrator types their password twice — once for the board, once
for the panel — and again after half an hour away. That is the intended price,
and the sign-in screen says what it buys.

### The re-authentication clock is separate from the activity clock

**MyBB:** the admin session has one timestamp, refreshed on every request.

**Here:** `last_seen_at` moves with activity and `authenticated_at` moves only
when the password is re-entered. Destructive operations read the second.

**Why:** with one timestamp, an administrator who has been clicking around for
an hour has a "fresh" session and is never asked again — which makes
re-authentication a formality that fires only for people who walked away, i.e.
exactly the people who are about to be asked anyway when it expires.

**Cost:** a long ACP session asks for the password more than once. Fifteen
minutes is the window; it applies only to operations that are destructive.

### The address allowlist is prefixes in the environment, not CIDR in the database

**MyBB:** `$config['superadmins']` and an optional IP check in `config.php`.

**Here:** `ADMIN_IP_ALLOWLIST`, comma-separated whole addresses or textual
prefixes ending in `.` or `:`. Empty means no restriction.

**Why:** env rather than a setting, because the allowlist defends against a
stolen administrator credential and storing it where that credential could edit
it defeats the point. Prefixes rather than CIDR, because a mask is a thing
people get wrong by one bit and the failure mode is locking yourself out. And
the check runs *before* the board session is read, so a request from outside the
list cannot learn that the panel exists.

**Cost:** no `/28`-style precision, and no way to change it without a redeploy.
Both are deliberate. A deployment behind no proxy — where no forwarded address
header arrives — is refused outright when a list is configured, which is the
documented failure direction rather than a silent bypass.

## Attachments and avatars

### An attachment is re-encoded, and until it is, it does not exist

**MyBB:** an upload is checked against a list of allowed extensions and MIME
types, stored, and served. `verify_attachment` looks at the file's magic bytes
for images; the file itself is kept as uploaded.

**Here:** PNG and JPEG are decoded to raw pixels and written back out by an
encoder. The stored object is the encoder's output. The uploaded bytes are held
in a separate, unservable object until that succeeds, and are then deleted. A
row is `pending` until the re-encode finishes, and nothing will serve a
`pending` row.

**Why:** validation cannot make a file safe, and no amount of it can. A valid
PNG with a ZIP appended after its `IEND` chunk passes every check MyBB makes
and every check anyone could make, because the file genuinely *is* a valid PNG.
So does one with a payload in an EXIF block aimed at whichever decoder opens it
next. None of that survives a decode and re-encode, because the output is
written from pixels and has never seen the original bytes.

**Cost:** an image is not visible for as long as the queue takes — usually
seconds, up to a minute on a board whose tick is the only worker. EXIF is gone,
including the orientation tag and any colour profile, which is a real loss for
photographers and a real gain for everybody who did not mean to publish where
they took the picture. Animated GIF is not accepted at all rather than being
silently flattened to one frame.

### Four file types, not an operator-configurable list

**MyBB:** the ACP has an attachment-types screen; an operator adds any
extension and MIME type they like.

**Here:** PNG, JPEG, PDF and ZIP, as a constant.

**Why:** a format is on the list only if the board can make a claim about the
bytes it serves — either "this was re-encoded" or "this is served as an opaque
download and never rendered". A configurable list is a way to accept a format
nothing can process, and the switch would be offering an operator a choice the
code cannot honour. `text/plain` is the instructive omission: it has no
signature, so "is this a text file" can only ever be a guess.

**Cost:** no `.docx`, no `.mp3`, no `.7z`, and no way to add one without a
release. The admin screen configures *limits*,
not *formats*, until something can attest to a new one.

### The download is served by the board, not by the object store

**MyBB:** `attachment.php` streams the file through PHP after a permission
check.

**Here:** the same — a route handler that re-checks `attachment.download` in the
attachment's forum, checks that the post and thread are visible to this viewer,
and sets `Content-Disposition: attachment` with `nosniff` and a sandboxing CSP.
The stored object is always private, even in a public forum, and a signed
object-store URL is deliberately not used.

**Why:** the parity here is not an accident of implementation. A signed URL is a
bearer token that outlives the permission that issued it — move a thread into a
private forum and every URL handed out in the last hour still works — and it
carries the bucket's headers rather than ours, which is where the safety of
serving member-supplied bytes actually lives.

**Cost:** the bytes go through the app, so a large attachment costs the board
bandwidth and, on a serverless platform, function time. Revisit if the
`FileStore` port ever grows the ability to sign *with* response headers.

### Files are submitted with the post, in one form

**MyBB:** the composer uploads each attachment over its own request, keyed to a
post id or a "posthash" for a post that does not exist yet, and the abandoned
ones are swept later.

**Here:** the file input is part of the reply form and the files arrive with the
message. There is no upload step and no draft token.

**Why:** it works with JavaScript off, which the posthash flow does not without
a page round trip that loses the typed message. It also removes a whole class of
state — a draft attachment waiting for a post that may never come — and with it
the sweep for abandoned drafts.

**Cost:** a browser cannot repopulate a file input, so a submission that fails
validation loses the chosen files even though the message survives. That is true
of every no-JS upload. The editor islands are where an incremental upload belongs,
and it should be an enhancement over this path rather than a replacement for it.

### An avatar is re-encoded and locked, never linked and never deleted

**MyBB:** three ways to have one — upload, a remote URL, or Gravatar. An upload
is checked for dimensions and extension and stored as sent. A moderator's
remedy is to delete it.

**Here:** upload only, decoded and re-encoded from raw pixels like every other
image on this board, fitted to 200×200, and unservable until that
succeeds. A moderator locks it rather than deleting it.

**Why no remote URL:** rendered directly it is a tracking beacon that reports
every reader's IP, referrer and user agent to a third party on every page view
— which the requirement forbids in as many words. Fetched server-side to
avoid that, it is SSRF: an attacker supplies a URL and the board makes the
request, from inside whatever network it runs in. The only safe version ends at
fetch-validate-re-encode-store, which is what the upload path already is, with
an SSRF problem bolted on the front. Gravatar is the remote-URL problem with a
better-known third party.

**Why a lock and not a delete:** the same argument that applies to signatures, and
stronger here. Deleting destroys the evidence — an appeal about a signature can
read the text that was kept; an appeal about an image has nothing at all unless
the file survives. Locking stops it rendering, stops the member replacing it,
keeps the object, and records a reason the member is shown.

**Cost:** a member who wants their existing avatar from elsewhere has to
download it and upload it, and nobody's Gravatar follows them here. The image
loses its EXIF, which is the point. And an upload is not visible for as long as
the queue takes, which the screen says rather than leaving somebody to conclude
it failed.

### An avatar keeps its aspect ratio; it is not cropped to a square

**MyBB:** scales to fit the configured maximum, same as here.

**Here:** scaled to fit 200×200, aspect preserved, no crop.

**Why:** cropping decides for somebody which part of their picture matters, and
a board cannot know. A theme that wants circles can have them in CSS, which is
reversible; a crop at upload time is not.

**Cost:** a wide image renders wide, so a theme laying out a fixed square has to
say `object-fit: cover` rather than assuming. The default theme does.

## Reading and discovery

### "New posts" lists threads, and its window is a day rather than your last visit

**MyBB:** `search.php?action=getnew` runs a search for posts made since
`lastvisit` and shows the *threads* those posts are in, ordered by last post. A
member's `lastvisit` is stamped by the session handling on each new visit.

**Here:** `/discover/new` lists threads whose last post landed in the last 24
hours. `/discover/today` uses midnight in the member's own timezone.
Both are thread listings ordered by last post, permission-filtered in SQL and
keyset-paged.

**Why:** a genuine "since your last visit" needs the per-thread read state
keeps, and folding it into this query means either a join per row or a second
query per page — against a feature specified as *budgeted*, with a test that
holds it to one query on two board sizes. MyBB pays that cost as a full search
run per page view, which is why the screen is one of the heaviest on a large
board and why several hosts disable it.

**Cost:** a member who has been away a week sees a day, not a week. The label
says so, and `/discover/participated` and the subscription list are the
two screens that do not have a window at all. When that read state and this
query can be joined without a per-row cost, the window becomes a fallback for
guests rather than the rule.

### A busy thread is one row, not forty

**MyBB:** the "new posts" and "today's posts" screens are searches over
*posts*, so a thread with forty new replies contributes forty hits — collapsed
into one thread row by the results template, but counted, paged and ranked as
forty.

**Here:** every discovery view returns one row per thread, and the `limit` is a
limit on threads.

**Why:** "what is new" is a question about conversations. Paging over posts
means a page of twenty hits can be three threads, the page count is a number
about something the member cannot see, and one busy thread buries the rest of
the board.

**Cost:** the row says *when* the last post was and *who* wrote it, but not how
many of the replies are new to this reader — that is the same read-state
dependency the window above names.

### Invisible browsing hides you from the count as well as the list

**MyBB:** `users.invisible` removes a member from the online list. The board's
"N users online" figure is computed from the same session table and the
administrator-visible list shows invisible members marked.

**Here:** the same setting, and it removes the member from the **count** too,
for everybody who cannot see them. Staff — anybody with `modcp.access` — see
them listed and marked.

**Why:** a member removed from the list but left in the total can be found by
subtraction. "Eleven online, ten listed" names an invisible member as surely as
printing their name would, and it does it on a page that refreshes. Hiding
somebody halfway is worse than not offering the setting, because the member
believes they are hidden.

**Cost:** the visible total is a different number for staff and for everybody
else, which looks like a bug until you know why. The "most ever online" record
counts everybody, invisible included, because it is a fact about the board's
traffic rather than about who anybody may see — so the record can exceed any
total a member has ever been shown.

### An online list says where somebody is only when the reader may know

**MyBB:** the online list shows each user's location as a description derived
from the script they are on ("Viewing Thread X"), and the thread and forum
titles are resolved without reference to the reader. Private forums leak by
title through this screen on stock MyBB, which is why several plugins exist to
suppress it.

**Here:** the location is resolved **in the query, against the reader's own
permissions**. A forum they cannot see arrives at the page as null and renders
"Somewhere on the board" — there is no title in the data for a theme, a feed or
a debug dump to print. A thread needs its forum to be nameable *and* the thread
itself to be in the reader's content scope, so a moderator reading a
soft-deleted thread does not put its title on the front page.

**Why:** the alternative is to fetch titles and let the page decide, which puts
the decision in every theme anybody writes, and one of them will get it wrong.

**Cost:** the online list cannot be cached across readers — it is one query per
reader, which is why it is one query. The location is stored without a query
string, so "reading page 4" is not distinguishable from "reading page 1", and a
member browsing the admin panel shows as somewhere on the board rather than in
the panel.

### Board totals are a rollup with a timestamp, not a live count

**MyBB:** `datacache` holds the board statistics and they are updated on the
write path — every new post, thread and member updates the cached figures.

**Here:** a scheduled task recomputes them every five minutes and the panel says
when it last ran. `computed_at` is null before the first run and the panel says
"not counted yet" rather than showing zeroes.

**Why:** the member count is a count of `users`, and the board index is the
most-requested page there is. Updating on the write path is the other way to
avoid that scan, and it makes every post pay for a number nobody reads on the
posting screen — plus a cache that drifts from the truth with no way to notice.
The thread and post totals are summed from the root forums, where the counters
have already accumulated the tree, so those two are nearly free; the member
count is what sets the shape.

**Cost:** the numbers on the index can be five minutes old. They say so. And a
brand-new board shows "not counted yet" until the first tick, which is a truer
statement than three zeroes.

## Feeds, URLs and the sitemap

### A feed shows what a signed-out visitor sees, whoever fetches it

**MyBB:** `syndication.php` resolves the requesting user from their cookie and
filters the feed against that member's forum permissions, so a signed-in
member's feed carries their private forums.

**Here:** every feed is built from the **guest** scope, regardless of who asks.

**Why:** a feed URL is handed to software, not read in the browser that holds
the cookie. Aggregators, corporate proxies and CDNs cache one response per URL
and serve it to everybody who asks for that URL next — so a personalised feed
under a shared address is a private forum served to a stranger, in somebody
else's cache, with nothing about the request that caused it visible from here.
MyBB's version is only safe because most readers never send the cookie at all,
which means the personalisation mostly does not happen.

**Cost:** a member cannot follow a private forum by RSS. That is a real
capability lost, and the honest replacement is subscriptions, which
deliver to a member rather than to a URL. A per-member feed token would restore
it — a capability URL, cached safely because it is unguessable — and it is a
feature with its own decisions to make, not a flag on this one.

### A category is a page, not only a heading

**MyBB:** a category is a heading on the index and a `forumdisplay.php?fid=`
page of its own, which lists the forums under it.

**Here:** the same — `/{id}-{slug}` on a category renders its forums, using the
index's own blocks so the two never drift apart. It exists because the
breadcrumb on every forum and thread page names the category, and a named
ancestor that 404s is a trail that stops halfway.

**Why it is not the index filtered:** a section is the one page that answers
"what else is in here?" on a board large enough for the index to be long, and it
is where a category's own description belongs. Neither needs a new slot: it is
`CategoryBlock` and `ForumRow`, the pair the index already hands a theme.

**Cost:** one more page per category to keep working. It shares the index's view
model, so the cost is a route rather than a feature.

### A category can hold threads of its own, if an admin says so

**MyBB:** a category holds forums and nothing else. A board that wants one
general area with no sub-structure makes a forum and hides the category, or
lives with a category holding a single forum called the same thing.

**Here:** **Allow new threads** on a category — off on every category until an
admin turns it on — makes it take threads as well as forums. Its page then lists
them the way a forum's does, with its forums above them, and it is a destination
a thread can be moved into.

**Why:** the difference between a category and a forum was never about what a
member wanted to do there; it was about where the software would let them post.
A small board is one heading with a handful of threads under it, and asking it
to invent a forum inside a category to hold them is the software's filing system
leaking into somebody's front page.

**Off by default, and that is the whole feature.** A category that takes threads
without being asked is a category that has quietly become a forum. The column
that carries this is the same `allow_threads` every forum has, so a board that
never opens the option is a board where nothing has changed.

**Cost:** turning it back off stops new threads and returns the page to its
forums. Threads already posted there keep their addresses and stay in search and
the latest-posts panel, but the category no longer lists them — turn it back on,
or move them, to have them shown again.

### Every page of a thread is its own canonical URL

**MyBB:** emits no canonical link. Duplicate URLs for one page — `showthread.php`
with and without a `pid`, with and without `page=1` — are left for the crawler
to work out.

**Here:** every thread and forum page carries `rel="canonical"` naming **the
page being read**, with the permalink, cursor and reveal parameters dropped.

**Why:** the tempting version points every page at page 1, and it is worse than
having none: it asks a crawler to drop every page but the first from its index,
which is why so many forums are searchable only for their opening posts. What a
canonical is actually for here is collapsing `?post=812`, `?after=…` and
`?reveal=…` — three ways to reach one document.

**Cost:** a permalink to post 812 is canonicalised to the page containing it, so
a search result lands on the page rather than the post. The anchor still works
for anybody who follows the original link.

### A post is anchored by its number, and reached by its id

**MyBB:** links a post as `showthread.php?pid=1234#pid1234` and prints `#6`
beside it. The two never agree, and the one a reader copies is the one they
cannot read.

**Here:** there is one anchor, `#post-6`, and it is the number the corner shows.
Everything the board writes — a notification, a search hit, a feed entry, the
last-post link on the index, a quote's link back — links `?post=1234` instead,
and the thread page answers that by finding the post and redirecting to the page
holding it, anchored at its number.

**Why:** the two jobs conflict. "The sixth post in this thread" is what a person
means, and it moves when an earlier post is deleted; "post 1234" is what a
stored link means, and it must not move at all. Splitting them across the query
and the fragment lets each be what it is, and leaves one anchor scheme in the
markup rather than two.

**It is also the only way the link lands.** A fragment is never sent to the
server, so `#post-812` on a thread that paginates can only work if the post
happens to be on the page that loaded. Resolving `?post=812` server-side finds
the page as well as the anchor, which is what makes a link to the four-hundredth
post of a thread arrive at it.

**Cost:** one redirect per link followed. A board that served the anchor
directly makes none — and lands the reader at the top of page one whenever the
post was not on it.

### The sitemap is an index of chunks, ordered by id

**MyBB:** ships no sitemap. Plugins that add one generally emit a single
document.

**Here:** `/sitemap.xml` is always an index. Chunks are 5,000 URLs, keyset-paged
on the thread id ascending.

**Why:** one document does not survive the target data volume, and switching
shapes later means every crawler that cached the old one has to rediscover the
new — so it is an index from the first thread. The ordering is by id rather than
by activity because a crawler works through the chunks over hours or days, and a
boundary that moved whenever somebody posted would make the crawl skip threads
and revisit others.

**Cost:** a chunk request costs one skip into the primary-key index to find its
own starting id — the only OFFSET in this codebase — because the index names the
chunks by number before any of them exists. It is paid by crawlers, not readers.

## Parity passes

### The conversion pass

The corpus is `packages/markdown/src/bbcode.test.ts`. Every case below is a
difference asserted there, so this document and the converter cannot disagree
without a test failing.

**No MyBB source artefacts are copied**, and that is not only a licensing rule:
MyBB's parser is a pile of regular expressions accumulated over fifteen years,
and reproducing them would reproduce their bugs as though the bugs were the
specification. The corpus is written from the *observable* side — the BBCode
people actually type, the shapes that appear in real posts — and every case is a
claim about what a reader sees after the conversion.

### Where the conversion is exact

Bold, italic, strikethrough, both link forms, images, quotes with their
attribution, code blocks, both kinds of list, and case-insensitive tag names.
`[B]` matters more than it looks: boards are full of it, and a converter that
matched only lower case would turn fifteen years of emphasis into literal text.

### Difference: the text is escaped on the way through

**MyBB:** a post is BBCode; `*`, `_`, `#` and `[` in it are punctuation.

**Here:** those are Markdown syntax, so the converter escapes them. A post that
said `a * b` still says `a * b`; a post that said `# 1 fan` is not a heading; a
variable called `snake_case` does not come out half italic.

**Why:** without it, every post on a converted board containing an asterisk
changes meaning on the day of the upgrade — silently, and in a way nobody could
find afterwards.

**Cost:** an author who opens an old post in the editor sees backslashes where
one was genuinely needed. That is the visible half of a guarantee whose
alternative is invisible.

### Difference: URLs and CSS this renderer refuses

**MyBB:** has historically rendered `[url=javascript:…]`, `[img]data:…[/img]`
and `[color=red;background:…]` with varying degrees of filtering by version.

**Here:** refused. The link keeps its text and loses its destination — no
anchor, no image element, no attribute.

**Why:** each is an XSS in a forum post, and "MyBB renders it" is a description
of MyBB's history rather than a requirement.

**Cost:** an imported post containing one shows the URL as text instead of a
link. That is the intended outcome, and it is visible rather than silent.

### Difference: malformed input is handled consistently

**MyBB:** leaves an unclosed tag as literal text in some contexts and swallows it
in others, depending on which regular expression ran first. Its behaviour on
crossed tags (`[b][i]x[/b][/i]`) likewise depends on the order of replacement.

**Here:** the input is parsed, so the answer is the same everywhere. An unclosed
tag converts to the text it is; a crossed pair keeps its content; a stray closing
tag does not eat the line.

**Why:** consistency is worth more than bug-compatibility here, and the rule is
chosen so nothing is silently dropped — a post whose second half vanished is
worse than a post with a visible `[b]` in it.

**Cost:** posts that relied on MyBB's particular recovery may read slightly
differently. In every case the text is present.

### Difference: an unknown tag becomes text

**MyBB:** drops unknown tags in some paths.

**Here:** an unknown tag is escaped and shown, and its content is kept.

**Why:** dropping is the worse default. A custom MyCode the old board defined
would otherwise silently erase whatever it wrapped, and nobody would know which
posts were affected.

### Gap: tags MyBB has and this conversion does not translate

`[table]`, `[align]`, `[font]`, `[video]`, `[php]`, and any custom MyCode. Their
content survives as text, which is legible; a tag that vanishes takes its
content with it. `[table]` is the one most likely to matter — Markdown has
tables, and a converter for MyBB's table syntax is a plausible later addition
rather than a missing piece of this one.

## Search

### The search form has an advanced half

**MyBB:** `search.php` has two forms — a one-line box in the header and a full
page with forums, an author, a date bound, "search thread titles only", a sort
column and a direction, and "display results as posts or threads".

**This board:** one form, with the second half behind a disclosure that opens
itself when anything in it is set. It carries the same axes, named for what they
do rather than for the column they sort: a forum (with **include subforums**, so
a category is one click rather than eight), one or more authors by username, a
date window, whether to match thread titles alone, whether a result is a post or
a thread, and the order.

**Why:** the plain box is what almost every search is, and a form that opens on
eight controls asks a reader to answer questions they do not have. The
disclosure state is the app's decision rather than the browser's, because a
search that *was* narrowed and comes back looking unnarrowed is a bug report
waiting to happen.

### Results are filtered where they are read, not by searching again

**MyBB:** the results page is a listing. Narrowing it means going back to the
form and running another search — which is also another entry against
`searchfloodtime`.

**This board:** the results page carries the filters with it. The stored search
holds the words and the options it was run with; the results URL carries a
*refinement* on top — a forum, an author, a window, an order — and the page
re-runs the stored search with both applied. Each filter is a `<select>` in a
GET form and, once on, a chip with an href that removes only itself.

**Why:** a stored search is a token and a set of words, and re-running it is
what the page already does on every open to re-check the reader's access. Adding
a filter to the URL is therefore free of everything a new search costs: no row,
no flood interval, no lost link. The reader's original search stays where it
was, which is what makes "clear filters" a link rather than a re-type.

### A refinement narrows and never widens

**MyBB:** every search is run from the form, so the question does not arise.

**This board:** a refinement can only make the set smaller. A search run against
one forum cannot be refined into another; a titles-only search cannot be refined
back into the whole post; a search for the past week cannot be refined to the
past year. Where the two disagree the narrower wins, and clearing the refinement
— not choosing a wider value — is what returns the search to what it was.

**Why:** the results URL is a link people paste, and a link that quietly returns
*more* than the search it came from is one that leaks. The rule is small enough
to hold in the head: this page shows a subset of that search, always.

### Counts and breakdowns are bounded by the same window

**MyBB:** counts the whole match set for the result total.

**This board:** counts the first 20,000 matches, and says so when it stops
there. The same pass produces the per-forum and per-author breakdowns the filter
panel shows, and those counts deliberately ignore the forum and author filters
already applied, so the numbers beside the other forums stay put as a reader
moves between them.

**Why:** the reason below, for ranking. A count over a term matching most of a
large board is the same scan, and "more than 20,000" answers the question a
reader is actually asking as well as an exact number would.

**Cost:** on a board where a term matches more than twenty thousand posts, the
result total reads "more than 20,000" where MyBB printed an exact number, and
the per-forum counts beside it are floors.

### Sorting offers three orders, not six columns

**MyBB:** sorts by relevance, subject, date, thread, forum or username, either
direction.

**This board:** best match, newest, oldest.

**Why:** paging here is keyset, not `OFFSET` — `(rank, id)` for relevance and
`id` for the two date orders — so a reader paging through results cannot have
rows shuffle or repeat underneath them when somebody posts. A sort by username
or subject has no such key, and the honest implementations are an `OFFSET` pager
over an unbounded ranked set or an index per column. Neither is worth what it
costs to answer a question the filters already answer better: a reader sorting
by username wants one member's posts, which is what **posted by** does.

**Cost:** a member who sorted results by subject, thread, forum or username has
no equivalent order here, and must reach the same set through **in** and
**posted by** instead.

### One row per thread is a grouping, not a second query

**MyBB:** "display results as threads" returns thread rows.

**This board:** the same, and the row shown for a thread is its *best* match
under the current order — the highest-ranked post when sorting by relevance, the
newest when sorting by newest. Grouping is bounded by the same window as
ranking, so a term matching more than 20,000 posts groups the recent ones.

### Search relevance is ranked within a window

**MyBB:** ranks every matching post, however many there are.

**This board:** ranks the **20,000 most recent matches** when sorting by
relevance. Sorting by newest or oldest reads the whole corpus, unless the search
groups by thread or asks for a count, both of which are bounded the same way.

### Why

`order by ts_rank_cd(...)` cannot use an index. A relevance score depends on the
query, so there is nothing to have indexed in advance, and Postgres has to score
every matching row before it can name the top twenty.

The load run measured what that costs on a board of 2,343,847 posts: a term matching 96%
of them took a **p95 of 5.5 seconds**. The GIN index was present and used
throughout — the cost was the ranking, not the lookup. A term matching 1,171
posts, through exactly the same code, took 35 ms. Bounding the ranked set brought
the first case to 98 ms.

MyBB has the same problem and does not solve it; it is simply rarely provoked,
because boards small enough to run MyBB comfortably do not have two million posts
of anything.

### Who notices

**Almost nobody, and that is the argument.** For any term matching fewer than
20,000 posts the window contains the entire match set and the results are
*identical* — same rows, same order. The difference appears only for a term so
common that "the single most relevant post" is not a meaningful thing to ask
for, and there the answer becomes "the most relevant of the recent ones", which
is what a member searching for a ubiquitous word actually wants.

The alternative was a five-second page, which is not a page.

### What was not done

A search extension (RUM, or an external engine) would rank the whole corpus
quickly and properly. It is a runtime dependency and, on most managed Postgres,
an extension the operator cannot install — so it stays out until somebody has a
board that needs it.
