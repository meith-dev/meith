# MyBB parity decisions

R4.2 closes with: *"MyBB's real resolution has twenty years of special cases.
Implement the rules above. Where an imported board diverges, record it in
`docs/mybb-parity.md` with a decision — do not guess silently."*

This file is that record. Every entry states what MyBB does, what we do, and
why. An entry is added when a divergence is **chosen**, not when one is
discovered by accident — a surprise is a bug, not a parity decision.

---

## flood-intervals

**MyBB** stores `searchfloodtime` (and `floodtime`) as a per-usergroup numeric
column, combined like any other numeric limit.

**We** do not model flood intervals as a permission field at all. The board
setting `search.flood_seconds` holds the interval, and the existing
`canBypassFloodCheck` boolean permission exempts a group from it.

**Why.** R4.2 mandates one combination rule for all numerics: take the maximum,
with `0` meaning unlimited and therefore beating every other value. That rule is
correct for *allowances* — attachment size, posts per day — because a larger
number is more permissive. It is exactly backwards for an *interval*, where the
most permissive value is the smallest non-zero one. A user in a 30-second group
and a 5-second group should get 5 seconds; MAX would give them 30.

Keeping the field would have required a fourth combination kind used by two
fields, and a permanent footnote on the F22 matrix. Modelling it as a setting
plus a boolean keeps R4.2 literally true for every field in the registry — the
boolean combines by OR, which gives the right answer with no special case.

**Cost.** An imported board loses per-group flood granularity: everyone is
either subject to the board interval or exempt from it. Reintroducing
granularity later means adding a `numeric-min` kind to
`packages/core/src/permissions.ts` and one row per actor to the F22 fixture.

**Live since F39/F40.** `posting.flood_seconds` is read by the posting path and
the exemption is asked for as the global action `flood.bypass`, so no permission
field escapes `@forum/authorization` (R4). Administrators bypass it like any
other action; the F22 forum matrix does not carry a column for it, because the
interval is a board setting rather than a per-forum grant.

---

## Permission field naming

**MyBB** uses lowercase, unpunctuated column names (`canpostthreads`,
`canviewthreads`, `cansearch`).

**We** use camelCase keys (`canPostThreads`) mapped to snake_case columns
(`can_post_threads`).

**Why.** The keys are consumed as TypeScript property names across three
packages, and `canviewothersthreads` is genuinely ambiguous to read. The mapping
is mechanical and lives in `packages/db/src/schema/permission-columns.ts`, so
importer code can translate a legacy column name in one place.

---

## Separate `canAccessAdminCp` and `isAdministrator`

**MyBB** treats admin status and admin CP access as effectively the same thing
(`cp_access` gates panel modules for an already-admin user).

**We** keep them as two fields: `isAdministrator` grants the permission bypass,
`canAccessAdminCp` grants the panel.

**Why.** R4.2 requires the bypass be explicit and logged. Splitting the fields
makes it possible to grant a trusted role read access to the panel without also
handing it the ability to bypass every forum permission on the board — and makes
the audit log meaningful, because a bypass entry now implies a specific field.

---

## BBCode coverage

**MyBB** ships `b i u s color size font align url email img quote code php list
hr video` plus smilies, admin-defined custom tags, and automatic linkification
of bare URLs in post text.

**We** ship, at F36: `b i u s color size url email img quote code list *`.
Absent for now: `font`, `align`, `hr`, `video`, `php`, and auto-linking.

**Why.** Each absentee is either owned by a later feature or is a decision:

- `font` and `align` are presentation an author dictates over the theme's
  typography and layout. They are cheap to add and belong with F37's per-forum
  capability toggles, where a board can decide whether members may override the
  theme at all.
- `video` embeds third-party markup, which is the one thing this renderer's
  construction argument does not cover. It needs a provider allowlist and a
  privacy decision (an embed is a request to another host from every reader's
  browser), so it waits for F37 rather than arriving as an exception.
- `php` is `code` with a syntax highlighter. Two tags that differ only in
  highlighting is a parity artefact, not a feature; when highlighting exists it
  will be an attribute on `code`.
- **Auto-linking is the real divergence.** MyBB turns a bare `http://…` in post
  text into a link. We do not: every link on the board is one an author asked
  for with `[url]`. Linkifying text means the renderer decides where a run of
  text ends, which is the ambiguity behind "the trailing full stop is part of my
  link" — and it makes every pasted string a live link, which is a spam
  affordance rather than a feature. An imported MyBB post keeps its bare URL as
  text.

**Cost.** An imported board's posts render slightly plainer: bare URLs are not
clickable, and `[font]`/`[align]`/`[video]` show as literal text until F37.
F87's corpus pass is where every remaining difference becomes an entry here.

---

## Unclosed and mismatched BBCode

**MyBB**'s regex passes leave an unmatched `[b]` as literal text, and can emit
unbalanced HTML for crossed tags such as `[b][i]x[/b]`.

**We** demote an unclosed tag to literal text — matching MyBB's visible result —
but close crossed tags implicitly, so `[b][i]x[/b]y` renders as
`<strong><em>x</em></strong>y` rather than unbalanced markup.

**Why.** The visible outcome for the common mistake is the same, and the
divergence only appears in the case where MyBB's output is invalid HTML whose
rendering is browser-dependent. Unbalanced output from a post body is also the
shape that lets formatting escape a post and affect the rest of the page, so
this one is not negotiable regardless of parity.

---

## Deleting the first post of a thread

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

**Cost.** Until F50's thread tools exist, a member who wants their thread gone
has to ask a moderator. An imported MyBB thread whose first post was deleted
arrives with a first post that is soft-deleted rather than missing, which the
moderator view shows and the member view skips.

---

## Editing a post you no longer own the window for

**MyBB** hides the edit control once `edittimelimit` has passed and refuses the
submission server-side.

**We** do the same, with one difference worth stating: the window is a
**numeric permission**, so R4.2's combination applies — `0` means unlimited and
beats every other value across a user's groups. A member in a 30-minute group
and an unlimited group gets unlimited.

**Why.** It is the same rule every other numeric on the board follows, and the
alternative (minimum-wins) would need a fourth combination kind for one field —
the trap already recorded under *flood-intervals*, where minimum-wins genuinely
is correct and the field was therefore modelled as a setting instead. An edit
window is an *allowance*, so MAX is the right rule and no special case is needed.

---

## Who handles a report

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
and anybody who moderates a forum gains it. F85's importer should surface that
as a migration note rather than guessing.

---

## What can be reported

**MyBB** allows reports against posts, threads, profiles, private messages and
(with plugins) more.

**We** ship posts, threads and members. Private messages are absent because F60
has not been built — there are no tables for them, and a target kind nothing can
produce is a promise the board cannot keep.

**Why.** Same rule as everywhere else in this build: omit rather than stub. When
F60 lands, `REPORT_TARGET_KINDS` gains an entry and `resolveTarget` gains a
branch; nothing else changes.

---

## Who can lock, pin and move threads

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

## Copying a thread

**MyBB** offers "copy thread" alongside move, duplicating every post and
crediting the copies to their original authors — so one piece of writing raises
its author's post count twice.

**We** have not built it, and the double-count is why. It is recorded here
rather than left as a gap because the *reason* is a product decision somebody
has to make: either a copy does not credit anybody (and author counts stop
matching the posts that exist), or it credits twice (and post counts stop
meaning "things this person wrote").

**Cost.** Moderators split and re-file threads by moving rather than copying.
F51's split is the operation that actually covers most of what copy is used for,
and it has to answer the same question.

---

## Splitting a thread, and where the pieces land

**MyBB** offers "split thread", which takes a checkbox selection of posts, lets
the moderator choose a destination forum, and can leave the split-off posts
credited however they already were.

**We** split "from this post onwards" and land the new thread in the **same
forum**, always.

**Why.** The two differences answer two different questions. The cut point is a
`<select>` of the posts on screen rather than a checkbox set because a select
cannot name a post that is not on the page, and arbitrary selection needs the
per-post checkbox surface F52 is building — two selection mechanisms for one
operation is worse than one narrower one. The destination is fixed because
splitting and moving are two acts: a single operation with a second forum to
authorise would let a moderator who may split here, but not post there, place
content in a forum they have no standing in.

**Cost.** A moderator who wants the split-off thread elsewhere splits, then
moves — two operations and two audit rows instead of one. A moderator who wants
posts 3, 7 and 12 and not 4–6 cannot express that yet.

---

## Which thread survives a merge

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

## What a merge does to post counts

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

## Inline moderation offers no "unapprove"

**MyBB:** the inline moderation dropdown on a forum listing includes *Unapprove
threads*, which sends published content back to the queue.

**Here:** it does not. Inline moderation offers approve, delete, restore, lock,
unlock, pin, unpin and move; taking a visible thread off the board is `delete`,
which is reversible with `restore` and is what a moderator actually wants.

**Why:** `unapproved` and `deleted` are both "not counted, not visible" (D41),
so the two differ only in which list the content appears on afterwards. Sending
a published thread to the *approval queue* puts it in front of a moderator as
something to decide on, when the decision has already been made — and it makes
the queue a mixture of "new content nobody has read" and "old content somebody
removed", which is the one thing the queue's ordering (oldest first) relies on
not being true. Deleting says what happened and restoring undoes it.

## Bulk moderation chunks rather than refusing

**MyBB:** inline moderation acts on whatever was selected, in one request.

**Here:** a selection is applied in transactions of 25, up to a ceiling of 500
in one request. The approval queue keeps its hard refusal above 200 (F48).

**Why:** the two surfaces have different shapes. Nobody hand-selects two hundred
items from a queue, so refusing and saying "work through it a page at a time" is
honest there. A listing has a "select all" and a moderator clearing a spam run
genuinely has hundreds, so refusing would mean the feature does not do the job
it exists for. Chunking is safe because every transition is state-guarded — a
bulk action that dies halfway is fixed by pressing the button again, and the
chunks that already ran report "already in that state".

## Warning levels are points, not percentages

**MyBB:** warning levels are expressed as a percentage of a configured maximum,
and a member's warning level reads as e.g. "40%".

**Here:** levels and warnings are absolute points, and a member is on "6 points"
with thresholds at 4, 7 and 10.

**Why:** a percentage needs a configured maximum to mean anything, and a board
that has never opened the admin screen would have every member permanently at 0%
of nothing — which is precisely the state a v1 board is in, because the screen
that sets the maximum is F66's and does not exist yet. Points are readable on
their own, the seeded ladder works on a fresh board, and "2 points, expires
after 90 days" is a sentence a moderator can weigh before issuing it. The
importer (F85) can convert a percentage against the source board's maximum.

## A warning restriction outranks a moderation bypass

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

## Bans from a warning level are not lifted by revoking the warning

**MyBB:** a warning that triggered a ban and is then revoked leaves the ban in
place; an administrator lifts it.

**Here:** the same, and deliberately.

**Why:** F23 owns the ban lifecycle, including the group the ban captured so it
can be restored at expiry. Un-banning from the warning path would restore a
group this feature never saw, through a code path that already refuses to run
twice. More importantly, a ban is the heaviest thing the board does to somebody
and its removal should be a decision a human makes while looking — which is what
"a moderator lifts it" means. The revocation still lowers the points, so the
level no longer applies and no further action is taken.

